'use client';

/* ═══════════════════════════════════════════════════════════════════════════
   AI Models Settings Page — Shows all discovered models from connected providers
   ═══════════════════════════════════════════════════════════════════════════ */

import { useEffect } from 'react';
import { usePreferencesStore } from '@/stores/preferencesStore';
import { useProviderStore } from '@/stores/providerStore';
import { useRouter } from 'next/navigation';
import {
  FiServer, FiCloud, FiCpu, FiGlobe, FiEye, FiZap, FiLoader, FiPlus, FiImage,
} from 'react-icons/fi';
import type { ProviderType } from '@/types';

function getProviderIcon(providerType: ProviderType) {
  switch (providerType) {
    case 'openai': return <FiCloud size={18} />;
    case 'ollama': return <FiServer size={18} />;
    case 'nvidia': return <FiCpu size={18} />;
    default: return <FiGlobe size={18} />;
  }
}

export default function ModelsPage() {
  const { preferences, updatePreferences } = usePreferencesStore();
  const { availableModels, isLoadingModels, fetchAvailableModels } = useProviderStore();
  const router = useRouter();

  useEffect(() => {
    fetchAvailableModels();
  }, [fetchAvailableModels]);

  // Group models by provider name
  const grouped = availableModels.reduce<Record<string, typeof availableModels>>((acc, model) => {
    const key = model.provider_name;
    if (!acc[key]) acc[key] = [];
    acc[key].push(model);
    return acc;
  }, {});

  return (
    <>
      <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-heading)', marginBottom: 4 }}>AI Models</h1>
      <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 32 }}>
        Select your default model and configure AI behavior. Models are auto-discovered from your connections.
      </p>

      {/* Model selection */}
      {isLoadingModels ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
          <FiLoader size={24} style={{ animation: 'spin 1s linear infinite', marginBottom: 12 }} />
          <div style={{ fontSize: 14 }}>Loading models...</div>
        </div>
      ) : availableModels.length === 0 ? (
        <div className="card" style={{ padding: '40px 24px', textAlign: 'center', marginBottom: 16 }}>
          <FiCpu size={36} style={{ color: 'var(--text-muted)', marginBottom: 12 }} />
          <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-heading)', marginBottom: 6 }}>
            No models available
          </h3>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16, maxWidth: 340, margin: '0 auto 16px' }}>
            Connect to an AI provider first to discover available models.
          </p>
          <button
            onClick={() => router.push('/settings/connections')}
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
            Add Connection
          </button>
        </div>
      ) : (
        <div className="card" style={{ padding: 24, marginBottom: 16 }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-heading)', marginBottom: 16 }}>Default Model</h3>
          <div style={{ display: 'grid', gap: 6 }}>
            {Object.entries(grouped).map(([providerName, models]) => (
              <div key={providerName}>
                <div style={{
                  fontSize: 11, fontWeight: 600, color: 'var(--text-muted)',
                  textTransform: 'uppercase', letterSpacing: '0.05em',
                  padding: '8px 4px 6px',
                }}>
                  {providerName}
                </div>
                {models.map((model) => (
                  <button
                    key={model.id}
                    onClick={() => updatePreferences({ default_model_id: model.model_id })}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 14,
                      padding: '12px 14px',
                      background: preferences.default_model_id === model.model_id ? 'var(--accent-primary-soft)' : 'var(--surface-1)',
                      border: preferences.default_model_id === model.model_id ? '2px solid var(--accent-primary)' : '1px solid var(--border-subtle)',
                      borderRadius: 'var(--radius-md)',
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'all var(--transition-fast)',
                      width: '100%',
                      marginBottom: 4,
                    }}
                  >
                    <span style={{
                      color: preferences.default_model_id === model.model_id ? 'var(--accent-primary)' : 'var(--text-secondary)',
                      fontSize: 18,
                    }}>
                      {getProviderIcon(model.provider_type)}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-heading)' }}>
                        {model.display_name}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, display: 'flex', gap: 8 }}>
                        <span>{model.model_id}</span>
                        {model.capabilities?.vision && (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: '#8b5cf6' }}>
                            <FiEye size={10} /> Vision
                          </span>
                        )}
                        {model.capabilities?.reasoning && (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: '#f59e0b' }}>
                            <FiZap size={10} /> Reasoning
                          </span>
                        )}
                        {model.capabilities?.image_generation && (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: '#10b981' }}>
                            <FiImage size={10} /> Image
                          </span>
                        )}
                      </div>
                    </div>
                    {preferences.default_model_id === model.model_id && (
                      <span className="badge badge-accent">Active</span>
                    )}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Temperature */}
      <div className="card" style={{ padding: 24, marginBottom: 16 }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-heading)', marginBottom: 4 }}>Temperature</h3>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
          Controls response randomness. Lower = more precise, higher = more creative.
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)', width: 50 }}>Precise</span>
          <input
            type="range"
            min={0}
            max={2}
            step={0.1}
            value={preferences.default_temperature}
            onChange={(e) => updatePreferences({ default_temperature: parseFloat(e.target.value) })}
            style={{ flex: 1, accentColor: 'var(--accent-primary)' }}
          />
          <span style={{ fontSize: 12, color: 'var(--text-muted)', width: 50, textAlign: 'right' }}>Creative</span>
        </div>
        <div style={{ textAlign: 'center', marginTop: 6, fontSize: 14, fontWeight: 600, color: 'var(--accent-primary)' }}>
          {preferences.default_temperature.toFixed(1)}
        </div>
      </div>

      {/* Max tokens */}
      <div className="card" style={{ padding: 24, marginBottom: 16 }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-heading)', marginBottom: 4 }}>Max Output Tokens</h3>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
          Maximum number of tokens in the AI response.
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {[512, 1024, 2048, 4096, 8192].map((tokens) => (
            <button
              key={tokens}
              onClick={() => updatePreferences({ default_max_tokens: tokens })}
              className="btn"
              style={{
                background: preferences.default_max_tokens === tokens ? 'var(--accent-primary)' : 'var(--surface-1)',
                color: preferences.default_max_tokens === tokens ? 'white' : 'var(--text-primary)',
                border: '1px solid var(--border-default)',
                fontSize: 13,
              }}
            >
              {tokens.toLocaleString()}
            </button>
          ))}
        </div>
      </div>

      {/* System prompt */}
      <div className="card" style={{ padding: 24 }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-heading)', marginBottom: 4 }}>System Prompt</h3>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
          Custom instructions sent to the AI with every message.
        </p>
        <textarea
          value={preferences.default_system_prompt || ''}
          onChange={(e) => updatePreferences({ default_system_prompt: e.target.value || null })}
          className="input-field"
          placeholder="You are a helpful AI assistant..."
          rows={4}
          style={{ resize: 'vertical', fontFamily: 'inherit' }}
        />
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>
          {(preferences.default_system_prompt || '').length} characters
        </div>
      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </>
  );
}
