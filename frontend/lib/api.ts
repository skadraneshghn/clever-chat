/* ═══════════════════════════════════════════════════════════════════════════
   API Client — Axios-like fetch wrapper with JWT interceptors
   ═══════════════════════════════════════════════════════════════════════════ */

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '';
const API_PREFIX = '/api/v1';

const REFRESH_SKEW_MS = 60_000;

function decodeJwtExp(token: string): number | null {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const json = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    return typeof json.exp === 'number' ? json.exp : null;
  } catch {
    return null;
  }
}

class ApiClient {
  private baseUrl: string;
  private refreshPromise: Promise<boolean> | null = null;

  constructor() {
    this.baseUrl = `${API_BASE}${API_PREFIX}`;
  }

  private getToken(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('access_token');
  }

  private buildHeaders(extra?: Record<string, string>, isMultipart = false): Record<string, string> {
    const headers: Record<string, string> = { ...extra };
    if (!isMultipart) {
      headers['Content-Type'] = 'application/json';
    }
    const token = this.getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  }

  private redirectToLogin() {
    if (typeof window === 'undefined') return;
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    if (window.location.pathname !== '/login') {
      window.location.href = '/login';
    }
  }

  /**
   * Refresh the access token. Concurrent callers share a single in-flight
   * request so the rotating refresh token is not invalidated by parallel use.
   */
  private refresh(): Promise<boolean> {
    if (this.refreshPromise) return this.refreshPromise;
    this.refreshPromise = (async () => {
      try {
        const refreshToken =
          typeof window !== 'undefined' ? localStorage.getItem('refresh_token') : null;
        if (!refreshToken) return false;

        const res = await fetch(`${this.baseUrl}/auth/refresh`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${refreshToken}`,
          },
        });

        if (res.ok) {
          const data = await res.json();
          localStorage.setItem('access_token', data.access_token);
          if (data.refresh_token) {
            localStorage.setItem('refresh_token', data.refresh_token);
          }
          return true;
        }
        return false;
      } catch {
        return false;
      } finally {
        this.refreshPromise = null;
      }
    })();
    return this.refreshPromise;
  }

  /**
   * Ensure the access token is valid (refresh proactively if it is missing or
   * about to expire). Returns a token safe to use, or null if unauthenticated.
   */
  async ensureValidToken(): Promise<string | null> {
    if (typeof window === 'undefined') return null;
    const token = localStorage.getItem('access_token');
    const now = Math.floor(Date.now() / 1000);

    if (token) {
      const exp = decodeJwtExp(token);
      if (exp === null || exp - now > REFRESH_SKEW_MS / 1000) {
        return token;
      }
    }

    const ok = await this.refresh();
    return ok ? localStorage.getItem('access_token') : null;
  }

  private async handleResponse<T>(response: Response): Promise<T> {
    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Network error' }));
      throw new ApiError(
        error.detail || 'An error occurred',
        response.status,
        error,
      );
    }

    if (response.status === 204) return undefined as T;
    return response.json();
  }

  /**
   * Execute a request, transparently refreshing the access token and retrying
   * exactly once on a 401.
   */
  private async request<T>(
    path: string,
    init: RequestInit,
    isMultipart = false,
  ): Promise<T> {
    let response = await fetch(`${this.baseUrl}${path}`, init);

    if (response.status === 401) {
      const refreshed = await this.refresh();
      if (refreshed) {
        // Rebuild headers with the freshly issued token and retry once.
        const retryInit: RequestInit = {
          ...init,
          headers: this.buildHeaders(init.headers as Record<string, string> | undefined, isMultipart),
        };
        response = await fetch(`${this.baseUrl}${path}`, retryInit);
      } else {
        this.redirectToLogin();
      }
    }

    return this.handleResponse<T>(response);
  }

  async get<T>(path: string): Promise<T> {
    return this.request<T>(path, { headers: this.buildHeaders() });
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>(path, {
      method: 'POST',
      headers: this.buildHeaders(),
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  async patch<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>(path, {
      method: 'PATCH',
      headers: this.buildHeaders(),
      body: JSON.stringify(body),
    });
  }

  async delete(path: string): Promise<void> {
    return this.request<void>(path, { method: 'DELETE', headers: this.buildHeaders() });
  }

  async upload<T>(path: string, file: File): Promise<T> {
    const formData = new FormData();
    formData.append('file', file);
    return this.request<T>(
      path,
      { method: 'POST', headers: this.buildHeaders(undefined, true), body: formData },
      true,
    );
  }

  getStreamUrl(path: string): string {
    return `${this.baseUrl}${path}`;
  }

  getAuthHeaders(): Record<string, string> {
    const headers: Record<string, string> = {};
    const token = this.getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return headers;
  }

  /** Upload an image/file to the media endpoint. Returns asset metadata including urls. */
  async uploadMedia(file: File): Promise<{
    id: string;
    filename: string;
    mime_type: string;
    size_bytes: number;
    width: number | null;
    height: number | null;
    url: string;
    thumbnail_url: string | null;
  }> {
    return this.upload(`/media/upload`, file);
  }
}

export class ApiError extends Error {
  status: number;
  data: unknown;

  constructor(message: string, status: number, data?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

export const api = new ApiClient();
