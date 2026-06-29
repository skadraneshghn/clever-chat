'use client';

/* ═══════════════════════════════════════════════════════════════════════════
   Connections Settings Page — Add/manage AI provider connections
   ═══════════════════════════════════════════════════════════════════════════ */

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useProviderStore } from '@/stores/providerStore';
import type { ProviderType, ProviderConnectionCreate } from '@/types';
import {
  FiPlus, FiTrash2, FiRefreshCw, FiCheck, FiX, FiToggleLeft, FiToggleRight,
  FiServer, FiCloud, FiCpu, FiGlobe, FiLoader, FiAlertCircle,
} from 'react-icons/fi';

const PROVIDER_OPTIONS: { value: ProviderType; label: string; description: string; icon: React.ReactNode; placeholder: string }[] = [
  { value: 'openai', label: 'OpenAI', description: 'GPT-4o, o4-mini, etc.', icon: <FiCloud size={20} />, placeholder: 'https://api.openai.com' },
  { value: 'ollama', label: 'Ollama', description: 'Local models (Llama, Mistral, etc.)', icon: <FiServer size={20} />, placeholder: 'http://localhost:11434' },
  { value: 'nvidia', label: 'NVIDIA NIM', description: 'NVIDIA AI models', icon: <FiCpu size={20} />, placeholder: 'https://integrate.api.nvidia.com' },
  { value: 'generic_openai_compatible', label: 'OpenAI Compatible', description: 'OpenRouter, Together, vLLM, etc.', icon: <FiGlobe size={20} />, placeholder: 'https://api.together.ai' },
];

export default function ConnectionsPage() {
  const {
    providers, isLoadingProviders, isSyncing,
    fetchProviders, createProvider, deleteProvider, syncProvider, toggleProvider,
  } = useProviderStore();

  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState<ProviderConnectionCreate>({
    name: '',
    provider_type: 'openai',
    base_url: '',
    api_key: null,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    fetchProviders();
  }, [fetchProviders]);

  const selectedProviderOption = PROVIDER_OPTIONS.find(p => p.value === formData.provider_type);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const result = await createProvider({
        ...formData,
        base_url: formData.base_url || selectedProviderOption?.placeholder || '',
      });
      setSuccessMessage(
        `Connected! Discovered ${result.discovered_count} model${result.discovered_count !== 1 ? 's' : ''} from ${result.connection.name}.`
      );
      setShowForm(false);
      setFormData({ name: '', provider_type: 'openai', base_url: '', api_key: null });
    } catch (err: any) {
      setError(err?.message || 'Failed to connect to provider');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      await deleteProvider(id);
    } catch (err: any) {
      setError(err?.message || 'Failed to delete provider');
    } finally {
      setDeletingId(null);
    }
  }

  async function handleSync(id: string) {
    setError(null);
    setSuccessMessage(null);
    try {
      const result = await syncProvider(id);
      setSuccessMessage(
        `Synced ${result.discovered_count} model${result.discovered_count !== 1 ? 's' : ''} from ${result.connection.name}.`
      );
    } catch (err: any) {
      setError(err?.message || 'Failed to sync provider');
    }
  }

  return (
    <>
      <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-heading)', marginBottom: 4 }}>
        Connections
      </h1>
      <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 32 }}>
        Add and manage your AI provider connections. Models are auto-discovered when you connect.
      </p>

      {/* Status messages */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '12px 16px', marginBottom: 16,
              background: 'rgba(239, 68, 68, 0.08)',
              border: '1px solid rgba(239, 68, 68, 0.2)',
              borderRadius: 'var(--radius-md)',
              color: '#ef4444', fontSize: 13,
            }}
          >
            <FiAlertCircle size={16} />
            <span style={{ flex: 1 }}>{error}</span>
            <button onClick={() => setError(null)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }}>
              <FiX size={14} />
            </button>
          </motion.div>
        )}
        {successMessage && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '12px 16px', marginBottom: 16,
              background: 'rgba(34, 197, 94, 0.08)',
              border: '1px solid rgba(34, 197, 94, 0.2)',
              borderRadius: 'var(--radius-md)',
              color: '#22c55e', fontSize: 13,
            }}
          >
            <FiCheck size={16} />
            <span style={{ flex: 1 }}>{successMessage}</span>
            <button onClick={() => setSuccessMessage(null)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }}>
              <FiX size={14} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Add connection button */}
      {!showForm && (
        <button
          onClick={() => setShowForm(true)}
          className="btn"
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '10px 20px', marginBottom: 24,
            background: 'var(--accent-primary)',
            color: 'white', border: 'none',
            borderRadius: 'var(--radius-md)',
            fontSize: 14, fontWeight: 600,
            cursor: 'pointer',
            transition: 'all var(--transition-fast)',
          }}
        >
          <FiPlus size={16} />
          Add Connection
        </button>
      )}

      {/* Add connection form */}
      <AnimatePresence>
        {showForm && (
          <motion.form
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            onSubmit={handleSubmit}
            className="card"
            style={{ padding: 24, marginBottom: 24, overflow: 'hidden' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-heading)' }}>
                New Connection
              </h3>
              <button
                type="button"
                onClick={() => { setShowForm(false); setError(null); }}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                <FiX size={18} />
              </button>
            </div>

            {/* Provider type selector */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 8 }}>
                Provider Type
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                {PROVIDER_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setFormData({ ...formData, provider_type: opt.value, base_url: '' })}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '12px 14px', textAlign: 'left',
                      background: formData.provider_type === opt.value ? 'var(--accent-primary-soft)' : 'var(--surface-1)',
                      border: formData.provider_type === opt.value ? '2px solid var(--accent-primary)' : '1px solid var(--border-subtle)',
                      borderRadius: 'var(--radius-md)',
                      cursor: 'pointer',
                      transition: 'all var(--transition-fast)',
                    }}
                  >
                    <span style={{ color: formData.provider_type === opt.value ? 'var(--accent-primary)' : 'var(--text-secondary)' }}>
                      {opt.icon}
                    </span>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-heading)' }}>{opt.label}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>{opt.description}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Name */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 6 }}>
                Connection Name
              </label>
              <input
                type="text"
                className="input-field"
                placeholder={`My ${selectedProviderOption?.label || 'Provider'}`}
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
              />
            </div>

            {/* Base URL */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 6 }}>
                Base URL
              </label>
              <input
                type="url"
                className="input-field"
                placeholder={selectedProviderOption?.placeholder || 'https://...'}
                value={formData.base_url}
                onChange={(e) => setFormData({ ...formData, base_url: e.target.value })}
              />
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                Leave empty to use the default: {selectedProviderOption?.placeholder}
              </div>
            </div>

            {/* API Key (hide for Ollama) */}
            {formData.provider_type !== 'ollama' && (
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 6 }}>
                  API Key
                </label>
                <input
                  type="password"
                  className="input-field"
                  placeholder="sk-..."
                  value={formData.api_key || ''}
                  onChange={(e) => setFormData({ ...formData, api_key: e.target.value || null })}
                />
              </div>
            )}

            {/* Submit */}
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                type="submit"
                disabled={isSubmitting || !formData.name}
                className="btn"
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '10px 20px',
                  background: isSubmitting ? 'var(--text-muted)' : 'var(--accent-primary)',
                  color: 'white', border: 'none',
                  borderRadius: 'var(--radius-md)',
                  fontSize: 14, fontWeight: 600,
                  cursor: isSubmitting ? 'not-allowed' : 'pointer',
                  opacity: isSubmitting ? 0.7 : 1,
                }}
              >
                {isSubmitting ? (
                  <>
                    <FiLoader size={14} style={{ animation: 'spin 1s linear infinite' }} />
                    Connecting...
                  </>
                ) : (
                  <>
                    <FiCheck size={14} />
                    Connect & Discover Models
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="btn"
                style={{
                  padding: '10px 16px',
                  background: 'var(--surface-1)',
                  color: 'var(--text-secondary)',
                  border: '1px solid var(--border-default)',
                  borderRadius: 'var(--radius-md)',
                  fontSize: 14,
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
            </div>
          </motion.form>
        )}
      </AnimatePresence>

      {/* Existing connections */}
      {isLoadingProviders ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
          <FiLoader size={24} style={{ animation: 'spin 1s linear infinite', marginBottom: 12 }} />
          <div style={{ fontSize: 14 }}>Loading connections...</div>
        </div>
      ) : providers.length === 0 && !showForm ? (
        <div className="card" style={{ padding: '40px 24px', textAlign: 'center' }}>
          <FiServer size={36} style={{ color: 'var(--text-muted)', marginBottom: 12 }} />
          <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-heading)', marginBottom: 6 }}>
            No connections yet
          </h3>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16, maxWidth: 360, margin: '0 auto 16px' }}>
            Add a connection to an AI provider to start chatting. Supports OpenAI, Ollama, NVIDIA NIM, and any OpenAI-compatible API.
          </p>
          <button
            onClick={() => setShowForm(true)}
            className="btn"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '10px 20px',
              background: 'var(--accent-primary)',
              color: 'white', border: 'none',
              borderRadius: 'var(--radius-md)',
              fontSize: 14, fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <FiPlus size={16} />
            Add Your First Connection
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {providers.map((provider) => (
            <motion.div
              key={provider.id}
              layout
              className="card"
              style={{ padding: '18px 20px' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                {/* Icon */}
                <div style={{
                  width: 40, height: 40,
                  borderRadius: 'var(--radius-md)',
                  background: provider.is_active ? 'var(--accent-primary-soft)' : 'var(--surface-1)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: provider.is_active ? 'var(--accent-primary)' : 'var(--text-muted)',
                  flexShrink: 0,
                }}>
                  {PROVIDER_OPTIONS.find(p => p.value === provider.provider_type)?.icon || <FiGlobe size={20} />}
                </div>

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-heading)' }}>
                      {provider.name}
                    </span>
                    <span style={{
                      fontSize: 10, fontWeight: 600,
                      padding: '2px 7px',
                      borderRadius: 'var(--radius-pill)',
                      background: provider.is_active ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                      color: provider.is_active ? '#22c55e' : '#ef4444',
                      textTransform: 'uppercase',
                      letterSpacing: '0.03em',
                    }}>
                      {provider.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                    {provider.base_url} · {provider.model_count} model{provider.model_count !== 1 ? 's' : ''}
                  </div>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                  {/* Toggle active */}
                  <button
                    onClick={() => toggleProvider(provider.id, !provider.is_active)}
                    title={provider.is_active ? 'Disable' : 'Enable'}
                    style={{
                      background: 'none', border: 'none',
                      color: provider.is_active ? 'var(--accent-primary)' : 'var(--text-muted)',
                      cursor: 'pointer', padding: 6,
                    }}
                  >
                    {provider.is_active ? <FiToggleRight size={20} /> : <FiToggleLeft size={20} />}
                  </button>

                  {/* Sync */}
                  <button
                    onClick={() => handleSync(provider.id)}
                    disabled={isSyncing === provider.id}
                    title="Re-discover models"
                    style={{
                      background: 'none', border: 'none',
                      color: 'var(--text-secondary)',
                      cursor: isSyncing === provider.id ? 'not-allowed' : 'pointer',
                      padding: 6,
                    }}
                  >
                    <FiRefreshCw
                      size={15}
                      style={isSyncing === provider.id ? { animation: 'spin 1s linear infinite' } : undefined}
                    />
                  </button>

                  {/* Delete */}
                  <button
                    onClick={() => handleDelete(provider.id)}
                    disabled={deletingId === provider.id}
                    title="Remove connection"
                    style={{
                      background: 'none', border: 'none',
                      color: '#ef4444',
                      cursor: deletingId === provider.id ? 'not-allowed' : 'pointer',
                      padding: 6,
                      opacity: deletingId === provider.id ? 0.5 : 1,
                    }}
                  >
                    <FiTrash2 size={15} />
                  </button>
                </div>
              </div>

              {/* Model chips */}
              {provider.models.length > 0 && (
                <div style={{
                  display: 'flex', flexWrap: 'wrap', gap: 6,
                  marginTop: 12, paddingTop: 12,
                  borderTop: '1px solid var(--border-subtle)',
                }}>
                  {provider.models.slice(0, 12).map((model) => (
                    <span
                      key={model.id}
                      style={{
                        fontSize: 11, fontWeight: 500,
                        padding: '3px 9px',
                        borderRadius: 'var(--radius-pill)',
                        background: 'var(--surface-1)',
                        color: 'var(--text-secondary)',
                        border: '1px solid var(--border-subtle)',
                      }}
                    >
                      {model.display_name}
                    </span>
                  ))}
                  {provider.models.length > 12 && (
                    <span style={{
                      fontSize: 11, fontWeight: 500,
                      padding: '3px 9px',
                      color: 'var(--text-muted)',
                    }}>
                      +{provider.models.length - 12} more
                    </span>
                  )}
                </div>
              )}
            </motion.div>
          ))}
        </div>
      )}

      {/* Spin animation keyframes */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </>
  );
}
