'use client';

import { useState } from 'react';
import { FiDownload, FiUpload, FiTrash2, FiAlertTriangle } from 'react-icons/fi';
import { useChatStore } from '@/stores/chatStore';
import { api } from '@/lib/api';
import { toast } from 'sonner';

export default function DataPage() {
  const { conversations } = useChatStore();
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function handleExportAll() {
    try {
      const exports = [];
      for (const conv of conversations) {
        const data = await api.get(`/conversations/${conv.id}/export`);
        exports.push(data);
      }
      const blob = new Blob([JSON.stringify(exports, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `cleverchat-export-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('All conversations exported');
    } catch {
      toast.error('Export failed');
    }
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const data = JSON.parse(text);

      // Support single or array
      const convs = Array.isArray(data) ? data : [data];
      for (const conv of convs) {
        await api.post('/conversations/import', conv);
      }
      toast.success(`Imported ${convs.length} conversation(s)`);
    } catch {
      toast.error('Import failed — invalid file format');
    }
  }

  return (
    <>
      <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-heading)', marginBottom: 4 }}>Data Management</h1>
      <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 32 }}>
        Export, import, and manage your conversation data
      </p>

      {/* Export */}
      <div className="card" style={{ padding: 24, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 'var(--radius-md)',
            background: 'var(--accent-primary-soft)', color: 'var(--accent-primary)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <FiDownload size={20} />
          </div>
          <div>
            <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-heading)', margin: 0 }}>Export Data</h3>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
              Download all {conversations.length} conversation(s) as JSON
            </p>
          </div>
        </div>
        <button onClick={handleExportAll} className="btn btn-secondary">
          <FiDownload size={15} />
          Export All Conversations
        </button>
      </div>

      {/* Import */}
      <div className="card" style={{ padding: 24, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 'var(--radius-md)',
            background: 'var(--accent-secondary-soft)', color: 'var(--accent-secondary)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <FiUpload size={20} />
          </div>
          <div>
            <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-heading)', margin: 0 }}>Import Data</h3>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
              Import conversations from a JSON export file
            </p>
          </div>
        </div>
        <label className="btn btn-secondary" style={{ cursor: 'pointer' }}>
          <FiUpload size={15} />
          Choose File
          <input
            type="file"
            accept=".json"
            onChange={handleImport}
            style={{ display: 'none' }}
          />
        </label>
      </div>

      {/* Danger zone */}
      <div className="card" style={{ padding: 24, border: '1px solid rgba(239,68,68,0.2)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 'var(--radius-md)',
            background: 'var(--accent-error-soft)', color: 'var(--accent-error)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <FiAlertTriangle size={20} />
          </div>
          <div>
            <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--accent-error)', margin: 0 }}>Danger Zone</h3>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
              Permanently delete your account and all data
            </p>
          </div>
        </div>
        {!confirmDelete ? (
          <button onClick={() => setConfirmDelete(true)} className="btn" style={{
            background: 'var(--accent-error-soft)',
            color: 'var(--accent-error)',
            border: '1px solid rgba(239,68,68,0.2)',
          }}>
            <FiTrash2 size={15} />
            Delete Account
          </button>
        ) : (
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn" style={{ background: 'var(--accent-error)', color: 'white' }}>
              Confirm Delete
            </button>
            <button onClick={() => setConfirmDelete(false)} className="btn btn-secondary">
              Cancel
            </button>
          </div>
        )}
      </div>
    </>
  );
}
