'use client';

import { usePreferencesStore } from '@/stores/preferencesStore';
import { AVAILABLE_MODELS } from '@/types';
import { SiOpenai, SiAnthropic } from 'react-icons/si';
import { RiRobot2Line } from 'react-icons/ri';

export default function ModelsPage() {
  const { preferences, updatePreferences } = usePreferencesStore();

  function getIcon(provider: string) {
    switch (provider) {
      case 'openai': return <SiOpenai size={20} />;
      case 'anthropic': return <SiAnthropic size={20} />;
      default: return <RiRobot2Line size={20} />;
    }
  }

  return (
    <>
      <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-heading)', marginBottom: 4 }}>AI Models</h1>
      <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 32 }}>
        Configure your default model and AI behavior parameters
      </p>

      {/* Model selection */}
      <div className="card" style={{ padding: 24, marginBottom: 16 }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-heading)', marginBottom: 16 }}>Default Model</h3>
        <div style={{ display: 'grid', gap: 8 }}>
          {AVAILABLE_MODELS.map((model) => (
            <button
              key={model.id}
              onClick={() => updatePreferences({ default_model_id: model.id })}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                padding: '14px 16px',
                background: preferences.default_model_id === model.id ? 'var(--accent-primary-soft)' : 'var(--surface-1)',
                border: preferences.default_model_id === model.id ? '2px solid var(--accent-primary)' : '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-md)',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all var(--transition-fast)',
                width: '100%',
              }}
            >
              <span style={{
                color: preferences.default_model_id === model.id ? 'var(--accent-primary)' : 'var(--text-secondary)',
                fontSize: 20,
              }}>
                {getIcon(model.provider)}
              </span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-heading)' }}>{model.name}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{model.description}</div>
              </div>
              {preferences.default_model_id === model.id && (
                <span className="badge badge-accent">Active</span>
              )}
            </button>
          ))}
        </div>
      </div>

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
    </>
  );
}
