'use client';

/* ═══════════════════════════════════════════════════════════════════════════
   Toast Notification System — Animated with Framer Motion
   Supports Success, Warning, Error, Info with pause-on-hover timers
   ═══════════════════════════════════════════════════════════════════════════ */

import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { FiCheckCircle, FiAlertTriangle, FiXCircle, FiInfo, FiX } from 'react-icons/fi';

export type ToastType = 'success' | 'warning' | 'error' | 'info';

export interface ToastMessage {
  id: string;
  type: ToastType;
  title?: string;
  message: string;
  duration?: number; // duration in ms
}

interface ToastContextType {
  toast: (type: ToastType, message: string, title?: string, duration?: number) => void;
  success: (message: string, title?: string) => void;
  error: (message: string, title?: string) => void;
  warning: (message: string, title?: string) => void;
  info: (message: string, title?: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback((type: ToastType, message: string, title?: string, duration = 5000) => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, type, title, message, duration }]);
  }, []);

  const success = useCallback((msg: string, title?: string) => toast('success', msg, title), [toast]);
  const error = useCallback((msg: string, title?: string) => toast('error', msg, title), [toast]);
  const warning = useCallback((msg: string, title?: string) => toast('warning', msg, title), [toast]);
  const info = useCallback((msg: string, title?: string) => toast('info', msg, title), [toast]);

  return (
    <ToastContext.Provider value={{ toast, success, error, warning, info }}>
      {children}
      {/* Container for absolute positioning */}
      <div style={{
        position: 'fixed',
        top: 24,
        right: 24,
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        pointerEvents: 'none', // Allow clicking elements behind the container spacer
        maxWidth: 380,
        width: '100%',
      }}>
        <AnimatePresence>
          {toasts.map((t) => (
            <ToastItem key={t.id} toast={t} onClose={removeToast} />
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

// ── Individual Toast Component (timer handles pause-on-hover) ──────────────

function ToastItem({ toast, onClose }: { toast: ToastMessage; onClose: (id: string) => void }) {
  const { id, type, title, message, duration = 5000 } = toast;
  const [remaining, setRemaining] = useState(duration);
  const startTimeRef = useRef(Date.now());
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Start the countdown timer
  const startTimer = useCallback(() => {
    startTimeRef.current = Date.now();
    timerRef.current = setTimeout(() => {
      onClose(id);
    }, remaining);
  }, [id, onClose, remaining]);

  // Pause countdown timer (clear timeout, calculate remaining time)
  const pauseTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
      setRemaining((prev) => Math.max(0, prev - (Date.now() - startTimeRef.current)));
    }
  }, []);

  // Initialize and clean up timer
  useEffect(() => {
    startTimer();
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [startTimer]);

  // Configure styling and icons per type
  const config = {
    success: {
      icon: <FiCheckCircle size={18} />,
      border: '1px solid #10b981',
      background: 'linear-gradient(135deg, #ffffff 0%, #ecfdf5 100%)',
      iconColor: '#10b981',
      shadowColor: 'rgba(16, 185, 129, 0.08)',
    },
    error: {
      icon: <FiXCircle size={18} />,
      border: '1px solid #ef4444',
      background: 'linear-gradient(135deg, #ffffff 0%, #fef2f2 100%)',
      iconColor: '#ef4444',
      shadowColor: 'rgba(239, 68, 68, 0.08)',
    },
    warning: {
      icon: <FiAlertTriangle size={18} />,
      border: '1px solid #f59e0b',
      background: 'linear-gradient(135deg, #ffffff 0%, #fffbeb 100%)',
      iconColor: '#f59e0b',
      shadowColor: 'rgba(245, 158, 11, 0.08)',
    },
    info: {
      icon: <FiInfo size={18} />,
      border: '1px solid #3b82f6',
      background: 'linear-gradient(135deg, #ffffff 0%, #eff6ff 100%)',
      iconColor: '#3b82f6',
      shadowColor: 'rgba(59, 130, 246, 0.08)',
    },
  }[type];

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -20, scale: 0.95, x: 20 }}
      animate={{ opacity: 1, y: 0, scale: 1, x: 0 }}
      exit={{ opacity: 0, scale: 0.9, x: 30, transition: { duration: 0.18 } }}
      transition={{ type: 'spring', stiffness: 320, damping: 25 }}
      onMouseEnter={pauseTimer}
      onMouseLeave={startTimer}
      style={{
        pointerEvents: 'auto', // Enable pointer events for mouse hover/clicking
        background: config.background,
        border: config.border,
        borderRadius: 'var(--radius-lg)',
        padding: '14px 16px',
        boxShadow: `0 10px 30px ${config.shadowColor}, 0 4px 12px rgba(0, 0, 0, 0.03)`,
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Left side: Icon */}
      <div style={{ color: config.iconColor, flexShrink: 0, marginTop: 2 }}>
        {config.icon}
      </div>

      {/* Middle: Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {title && (
          <div style={{
            fontSize: 13.5,
            fontWeight: 600,
            color: 'var(--text-heading)',
            marginBottom: 2,
          }}>
            {title}
          </div>
        )}
        <div style={{
          fontSize: 13,
          color: 'var(--text-secondary)',
          lineHeight: 1.45,
        }}>
          {message}
        </div>
      </div>

      {/* Right side: Close button */}
      <button
        onClick={() => onClose(id)}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: 'var(--text-muted)',
          padding: 2,
          display: 'flex',
          borderRadius: 'var(--radius-xs)',
          transition: 'all var(--transition-fast)',
          marginTop: 2,
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'rgba(0, 0, 0, 0.04)';
          e.currentTarget.style.color = 'var(--text-primary)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'none';
          e.currentTarget.style.color = 'var(--text-muted)';
        }}
      >
        <FiX size={14} />
      </button>
    </motion.div>
  );
}
