'use client';

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { motion } from 'motion/react';
import {
  FolderOpen, Upload, Globe, Search, X, Check, AlertTriangle, Sparkles, CheckCircle2, Loader2
} from 'lucide-react';
import { useChatStore } from '@/stores/chatStore';
import { api } from '@/lib/api';
import { toast } from 'sonner';

interface ResourceModalProps {
  conversationId: string;
  isOpen: boolean;
  onClose: () => void;
}

interface MediaAssetRecord {
  id: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  folder_name?: string | null;
  token_count?: number | null;
  extraction_status?: string | null;
}

interface UrlAssetResponse {
  id: string;
}

type ResourceTab = 'browse' | 'upload' | 'scrape';

const RESOURCE_TABS: Array<{ id: ResourceTab; label: string; icon: ReactNode }> = [
  { id: 'browse', label: 'Browse Vault', icon: <FolderOpen size={13.5} /> },
  { id: 'upload', label: 'Upload File', icon: <Upload size={13.5} /> },
  { id: 'scrape', label: 'Scrape URL', icon: <Globe size={13.5} /> },
];

// Format bytes helper
function formatBytes(bytes: number, decimals = 1) {
  if (!bytes) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// Get file extension color coding and label
function getExtensionDetails(filename: string, mime: string) {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  if (mime.startsWith('image/')) {
    if (ext === 'svg') return { bg: 'rgba(236, 72, 153, 0.15)', text: '#ec4899', border: 'rgba(236, 72, 153, 0.3)', label: 'SVG' };
    return { bg: 'rgba(59, 130, 246, 0.15)', text: '#3b82f6', border: 'rgba(59, 130, 246, 0.3)', label: ext.toUpperCase() || 'IMG' };
  }
  if (mime.startsWith('video/')) return { bg: 'rgba(249, 115, 22, 0.15)', text: '#f97316', border: 'rgba(249, 115, 22, 0.3)', label: ext.toUpperCase() || 'MP4' };
  if (mime.startsWith('audio/')) return { bg: 'rgba(139, 92, 246, 0.15)', text: '#8b5cf6', border: 'rgba(139, 92, 246, 0.3)', label: ext.toUpperCase() || 'AUDIO' };
  if (mime === 'application/pdf') return { bg: 'rgba(239, 68, 68, 0.15)', text: '#ef4444', border: 'rgba(239, 68, 68, 0.3)', label: 'PDF' };
  if (mime.includes('spreadsheet') || mime === 'text/csv' || ext === 'xlsx' || ext === 'csv') {
    return { bg: 'rgba(16, 185, 129, 0.15)', text: '#10b981', border: 'rgba(16, 185, 129, 0.3)', label: ext.toUpperCase() || 'XLS' };
  }
  if (mime.includes('word') || ext === 'docx' || ext === 'doc') {
    return { bg: 'rgba(37, 99, 235, 0.15)', text: '#2563eb', border: 'rgba(37, 99, 235, 0.3)', label: ext.toUpperCase() || 'DOC' };
  }
  return { bg: 'rgba(107, 114, 128, 0.15)', text: '#9ca3af', border: 'rgba(107, 114, 128, 0.3)', label: ext.toUpperCase() || 'FILE' };
}

// Generate colored initials avatar
function getAvatarStyles(username: string) {
  const cleanName = username.trim() || 'User';
  const initials = cleanName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
  const colors = [
    { bg: '#fee2e2', text: '#ef4444' }, // Red
    { bg: '#fef3c7', text: '#d97706' }, // Amber
    { bg: '#d1fae5', text: '#059669' }, // Emerald
    { bg: '#dbeafe', text: '#2563eb' }, // Blue
    { bg: '#e0e7ff', text: '#4f46e5' }, // Indigo
    { bg: '#f3e8ff', text: '#9333ea' }, // Purple
  ];
  const charCodeSum = cleanName.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return { initials, ...colors[charCodeSum % colors.length] };
}

export default function ResourceModal({ conversationId, isOpen, onClose }: ResourceModalProps) {
  const {
    files,
    fetchFiles,
    activeConversationId,
    activeChatResourceIds,
    fetchActiveChatResources,
    attachResourcesToChat,
    detachResourceFromChat,
    checkHash
  } = useChatStore();

  const [activeTab, setActiveTab] = useState<ResourceTab>('browse');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [urlInput, setUrlInput] = useState('');
  const [isScraping, setIsScraping] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const effectiveConversationId = conversationId || activeConversationId || '';
  const typedFiles = files as MediaAssetRecord[];

  // Sync state and fetch data on open
  useEffect(() => {
    if (isOpen) {
      fetchFiles();
      if (effectiveConversationId) {
        fetchActiveChatResources(effectiveConversationId);
      }
    }
  }, [isOpen, effectiveConversationId, fetchFiles, fetchActiveChatResources]);

  // Update selected IDs when activeChatResourceIds changes from store
  useEffect(() => {
    if (isOpen) {
      const timer = window.setTimeout(() => setSelectedIds(activeChatResourceIds), 0);
      return () => window.clearTimeout(timer);
    }
  }, [isOpen, activeChatResourceIds]);

  const handleToggleSelect = (id: string) => {
    setSelectedIds(prev => {
      if (prev.includes(id)) {
        return prev.filter(item => item !== id);
      } else {
        return [...prev, id];
      }
    });
  };

  // Helper to hash and upload file
  const processAndUploadFile = async (file: File) => {
    setIsUploading(true);
    const loaderId = toast.loading('Computing hash & checking duplicates...');
    
    // Spawn Web Worker for off-thread hashing
    const worker = new Worker(new URL('@/workers/hashWorker.ts', import.meta.url));
    worker.postMessage({ file });

    worker.onmessage = async (e) => {
      const { success, hash, error } = e.data;
      if (!success) {
        toast.error(`Hashing failed: ${error}`, { id: loaderId });
        setIsUploading(false);
        worker.terminate();
        return;
      }

      try {
        // Pre-flight check
        toast.loading('Checking vault for duplicate assets...', { id: loaderId });
        const preFlight = await checkHash(hash, file.name, file.type);
        if (preFlight.exists) {
          toast.success(`Duplicate found. Instantly restored "${file.name}" from vault.`, { id: loaderId });
          await fetchFiles();
          setSelectedIds(prev => {
            const list = new Set(prev);
            list.add(preFlight.asset.id);
            return Array.from(list);
          });
          setActiveTab('browse');
          worker.terminate();
          setIsUploading(false);
          return;
        }

        // Full upload
        toast.loading('Uploading asset to S3 Cloud Vault...', { id: loaderId });
        const res = await api.uploadMedia(file);
        toast.success(`Successfully uploaded "${file.name}"`, { id: loaderId });
        await fetchFiles();
        setSelectedIds(prev => [...prev, res.id]);
        setActiveTab('browse');
      } catch {
        toast.error('Failed to save file reference', { id: loaderId });
      } finally {
        setIsUploading(false);
        worker.terminate();
      }
    };

    worker.onerror = (err) => {
      console.error(err);
      toast.error('Worker thread error while hashing.', { id: loaderId });
      setIsUploading(false);
      worker.terminate();
    };
  };

  // Dropzone upload logic
  const onDropUpload = async (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      await processAndUploadFile(e.dataTransfer.files[0]);
    }
  };

  const onFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      await processAndUploadFile(e.target.files[0]);
    }
  };

  // URL Scraping logic
  const handleScrape = async () => {
    if (!urlInput.trim()) return;
    setIsScraping(true);
    const scraperId = toast.loading('Downloading file reference from URL...');
    try {
      const res = await api.post<UrlAssetResponse>('/media/url', { url: urlInput.trim() });
      toast.success('Successfully scraped file!', { id: scraperId });
      setUrlInput('');
      await fetchFiles();
      // Auto select scraped file
      setSelectedIds(prev => [...prev, res.id]);
      setActiveTab('browse');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Scraping link failed', { id: scraperId });
    } finally {
      setIsScraping(false);
    }
  };

  // Save selection (syncing join table bindings)
  const handleSave = async () => {
    if (!effectiveConversationId) {
      useChatStore.setState({ activeChatResourceIds: selectedIds });
      toast.success('Attached resources saved locally');
      onClose();
      return;
    }
    setIsSaving(true);
    const syncId = toast.loading('Syncing conversation resources...');
    try {
      // 1. Determine items to attach and detach
      const toAttach = selectedIds.filter(id => !activeChatResourceIds.includes(id));
      const toDetach = activeChatResourceIds.filter(id => !selectedIds.includes(id));

      // 2. Perform attachments
      if (toAttach.length > 0) {
        await attachResourcesToChat(effectiveConversationId, toAttach);
      }

      // 3. Perform detaches
      for (const detachId of toDetach) {
        await detachResourceFromChat(effectiveConversationId, detachId);
      }

      toast.success('Attached resources updated successfully', { id: syncId });
      onClose();
    } catch {
      toast.error('Failed to update attachments', { id: syncId });
    } finally {
      setIsSaving(false);
    }
  };

  // Calculate Cumulative token count for Selected Assets
  const totalTokens = selectedIds.reduce((sum, id) => {
    const file = typedFiles.find(f => f.id === id);
    return sum + (file?.token_count || 0);
  }, 0);

  const foldersMap = typedFiles.reduce((acc: Record<string, { name: string; size: number; count: number }>, file) => {
    const folderName = file.folder_name || 'General';
    if (!acc[folderName]) acc[folderName] = { name: folderName, size: 0, count: 0 };
    acc[folderName].size += file.size_bytes || 0;
    acc[folderName].count += 1;
    return acc;
  }, {});
  const displayFolders = Object.values(foldersMap).sort((a, b) => b.count - a.count).slice(0, 4);

  // Determine Token impact levels
  let impactColor = '#10b981'; // Green
  let impactLabel = 'Minimal / Safe';
  let warningMessage = null;

  if (totalTokens > 80000) {
    impactColor = '#ef4444'; // Red
    impactLabel = 'Heavy Context Impact';
    warningMessage = 'Warning: Context length exceeds 80k tokens. AI prompt might slice sections or experience reasoning degradation.';
  } else if (totalTokens > 20000) {
    impactColor = '#f59e0b'; // Yellow
    impactLabel = 'Moderate Context Impact';
    warningMessage = 'Moderate size. Prompts may cost more tokens to execute. Consider cleaning/chunking.';
  }

  // Filter available files
  const filteredFiles = typedFiles.filter(f => {
    const matchesSearch = f.filename.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFolder = selectedFolder
      ? (f.folder_name === selectedFolder || (selectedFolder === 'General' && !f.folder_name))
      : true;
    return matchesSearch && matchesFolder;
  });

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(15, 23, 42, 0.45)',
      backdropFilter: 'blur(8px)',
      zIndex: 9999,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '16px',
      fontFamily: "'Outfit', 'Inter', sans-serif"
    }}>
      {/* Modal Container */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        style={{
          width: '100%',
          maxWidth: '980px',
          background: 'var(--bg-app, #0f172a)',
          border: '1px solid var(--border-subtle, #334155)',
          borderRadius: '20px',
          boxShadow: '0 30px 80px -30px rgba(0, 0, 0, 0.65)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          maxHeight: '88dvh',
          color: 'var(--text-primary, #f8fafc)'
        }}
      >
        {/* Header */}
        <div style={{
          padding: '18px 22px',
          borderBottom: '1px solid var(--border-subtle, #334155)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'var(--surface-1, #1e293b)'
        }}>
          <div>
            <div style={{ fontWeight: 720, fontSize: '18px', color: 'var(--text-primary, #f8fafc)', display: 'flex', alignItems: 'center', gap: 8, letterSpacing: '-0.02em' }}>
              <FolderOpen size={19} style={{ color: '#6366f1' }} />
              Attach Project Files
            </div>
            <p style={{ fontSize: '12px', color: 'var(--text-muted, #64748b)', margin: '4px 0 0' }}>
              Select assets from the same indexed vault used by Project Files.
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'var(--bg-app, #0f172a)', border: '1px solid var(--border-subtle, #334155)', cursor: 'pointer',
              color: 'var(--text-muted, #64748b)', padding: 7, borderRadius: 8,
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Tab Selection Row */}
        <div style={{
          display: 'flex',
          borderBottom: '1px solid var(--border-subtle, #334155)',
          background: 'var(--bg-app, #0f172a)',
          padding: '10px 14px',
          gap: 8
        }}>
          {RESOURCE_TABS.map(tab => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  flex: 1,
                  padding: '9px 14px',
                  fontSize: '12.5px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  background: isActive ? 'var(--text-primary, #f8fafc)' : 'var(--surface-1, #1e293b)',
                  border: isActive ? 'none' : '1px solid var(--border-subtle, #334155)',
                  borderRadius: '100px',
                  color: isActive ? 'var(--bg-app, #0f172a)' : 'var(--text-muted, #64748b)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  transition: 'all 0.15s'
                }}
              >
                {tab.icon}
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Body content */}
        <div style={{ padding: '22px', flex: 1, overflowY: 'auto', minHeight: '360px' }}>
          
          {/* 1. BROWSE TAB */}
          {activeTab === 'browse' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
                <div>
                  <h3 style={{ fontSize: '16px', fontWeight: 700, margin: 0, letterSpacing: '-0.02em' }}>
                    {selectedFolder ? `${selectedFolder} Folder` : 'Project Files'}
                  </h3>
                  <p style={{ fontSize: '12px', color: 'var(--text-muted, #64748b)', margin: '4px 0 0' }}>
                    {files.length} indexed assets available for this chat.
                  </p>
                </div>
                <div style={{ position: 'relative', width: 'min(260px, 100%)' }}>
                  <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
                  <input
                    type="text"
                    placeholder="Search file..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    style={{
                      padding: '7px 10px 7px 30px',
                      background: 'var(--surface-1, #1e293b)',
                      border: '1px solid var(--border-subtle, #334155)',
                      borderRadius: '8px',
                      color: 'var(--text-primary, #f8fafc)',
                      fontSize: '12.5px',
                      outline: 'none',
                      width: '100%'
                    }}
                  />
                </div>
              </div>

              {displayFolders.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10 }}>
                  {displayFolders.map(folder => {
                    const isSelectedFolder = selectedFolder === folder.name;
                    return (
                      <button
                        key={folder.name}
                        onClick={() => setSelectedFolder(prev => prev === folder.name ? null : folder.name)}
                        style={{
                          background: isSelectedFolder ? 'rgba(99, 102, 241, 0.08)' : 'var(--surface-1, #1e293b)',
                          border: isSelectedFolder ? '1.5px solid var(--accent-primary, #6366f1)' : '1px solid var(--border-subtle, #334155)',
                          borderRadius: '12px',
                          padding: '13px',
                          cursor: 'pointer',
                          textAlign: 'left',
                          color: 'inherit',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10
                        }}
                      >
                        <div style={{ width: 34, height: 34, borderRadius: 8, background: 'rgba(99, 102, 241, 0.1)', color: '#6366f1', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <FolderOpen size={16} />
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: '12.5px', fontWeight: 650, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{folder.name}</div>
                          <div style={{ fontSize: '10.5px', color: '#64748b', marginTop: 2 }}>{folder.count} Files • {formatBytes(folder.size)}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {selectedFolder && (
                <button
                  onClick={() => setSelectedFolder(null)}
                  style={{ alignSelf: 'flex-start', background: 'rgba(239, 68, 68, 0.08)', border: 'none', color: '#ef4444', fontSize: '11px', fontWeight: 650, cursor: 'pointer', borderRadius: 6, padding: '4px 8px', display: 'flex', alignItems: 'center', gap: 4 }}
                >
                  <X size={11} /> Clear folder filter
                </button>
              )}

              {/* Files table checklist */}
              <div style={{
                background: 'var(--surface-1, #1e293b)',
                border: '1px solid var(--border-subtle, #334155)',
                borderRadius: '12px',
                overflow: 'hidden',
                boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
              }}>
                <div style={{ display: 'grid', gridTemplateColumns: '44px minmax(220px, 1fr) 120px 120px 92px', gap: 0, borderBottom: '1px solid var(--border-subtle, #334155)', background: 'rgba(255,255,255,0.015)', minWidth: 680 }}>
                  {['', 'Filename', 'Owner', 'Location', 'Context'].map((head) => (
                    <div key={head || 'select'} style={{ padding: '11px 14px', fontSize: '11.5px', fontWeight: 650, color: '#64748b', textTransform: 'uppercase' }}>{head}</div>
                  ))}
                </div>
                <div style={{ maxHeight: '280px', overflowY: 'auto', overflowX: 'auto' }}>
                {filteredFiles.map(file => {
                  const isChecked = selectedIds.includes(file.id);
                  const extDetails = getExtensionDetails(file.filename, file.mime_type);
                  const ownerAvatar = getAvatarStyles('Clever User');

                  return (
                    <div
                      key={file.id}
                      onClick={() => handleToggleSelect(file.id)}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '44px minmax(220px, 1fr) 120px 120px 92px',
                        alignItems: 'center',
                        minWidth: 680,
                        borderBottom: '1px solid var(--border-subtle, #334155)',
                        background: isChecked ? 'rgba(99, 102, 241, 0.05)' : 'transparent',
                        cursor: 'pointer',
                        transition: 'background-color 0.15s'
                      }}
                      onMouseEnter={e => {
                        if (!isChecked) e.currentTarget.style.background = 'rgba(255,255,255,0.015)';
                      }}
                      onMouseLeave={e => {
                        if (!isChecked) e.currentTarget.style.background = 'transparent';
                      }}
                    >
                      {/* Checkbox */}
                      <div style={{ padding: '12px 14px' }}><div style={{
                        width: 15, height: 15,
                        borderRadius: 4,
                        border: isChecked ? 'none' : '1.5px solid #64748b',
                        background: isChecked ? '#6366f1' : 'transparent',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: 'white',
                        flexShrink: 0
                      }}>
                        {isChecked && <Check size={10} />}
                      </div></div>

                      <div style={{ padding: '12px 14px', minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{
                            width: 30, height: 30,
                            borderRadius: '6px',
                            background: extDetails.bg,
                            color: extDetails.text,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: '8px', fontWeight: 950,
                            border: `1px solid ${extDetails.border}`,
                            flexShrink: 0
                          }}>
                            {extDetails.label}
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary, #f8fafc)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {file.filename}
                            </div>
                            <div style={{ fontSize: '10.5px', color: '#64748b', marginTop: 2 }}>
                              {formatBytes(file.size_bytes)}{file.extraction_status === 'success' ? ` • Parsed (${file.token_count?.toLocaleString()} tokens)` : ''}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Small owner badge */}
                      <div style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{
                          width: 23, height: 23, borderRadius: '50%',
                          background: ownerAvatar.bg, color: ownerAvatar.text,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: '9px', fontWeight: 700, flexShrink: 0
                        }}>
                          {ownerAvatar.initials}
                        </div>
                        <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-primary, #f8fafc)' }}>Clever</span>
                      </div>

                      <button
                        onClick={(event) => {
                          event.stopPropagation();
                          setSelectedFolder(file.folder_name || 'General');
                        }}
                        style={{ padding: '12px 14px', background: 'none', border: 'none', color: '#6366f1', cursor: 'pointer', textAlign: 'left', fontSize: '12px', fontWeight: 550, textDecoration: 'underline' }}
                      >
                        /{file.folder_name || 'General'}
                      </button>

                      <div style={{ padding: '12px 14px', fontSize: '11px', color: file.token_count ? '#8b5cf6' : '#64748b', fontWeight: 650 }}>
                        {file.token_count ? file.token_count.toLocaleString() : '0'}
                      </div>
                    </div>
                  );
                })}

                {filteredFiles.length === 0 && (
                  <div style={{ padding: '44px 20px', textAlign: 'center', color: '#64748b', fontSize: '13px' }}>
                    No files found in the vault. Try uploading new ones.
                  </div>
                )}
                </div>
              </div>
            </div>
          )}

          {/* 2. UPLOAD TAB */}
          {activeTab === 'upload' && (
            <div
              onDragOver={e => e.preventDefault()}
              onDrop={onDropUpload}
              onClick={() => document.getElementById('modal-file-picker')?.click()}
              style={{
                border: '1.5px dashed var(--border-subtle, #334155)',
                borderRadius: '12px',
                padding: '40px 20px',
                textAlign: 'center',
                cursor: 'pointer',
                background: 'rgba(15, 23, 42, 0.15)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 12,
                transition: 'border-color 0.2s'
              }}
              onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'}
              onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border-subtle, #334155)'}
            >
              <input
                type="file"
                id="modal-file-picker"
                onChange={onFileInputChange}
                style={{ display: 'none' }}
              />
              <div style={{
                width: 44, height: 44,
                borderRadius: '50%',
                background: 'rgba(99, 102, 241, 0.1)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#6366f1'
              }}>
                {isUploading ? <Loader2 size={18} className="animate-spin" /> : <Upload size={18} />}
              </div>
              <div>
                <h4 style={{ fontSize: '13.5px', fontWeight: 655, margin: '0 0 3px', color: 'var(--text-primary, #f8fafc)' }}>
                  {isUploading ? 'Uploading file...' : 'Drop files here or click to browse'}
                </h4>
                <p style={{ fontSize: '11px', color: '#64748b', margin: 0 }}>
                  Supports PDFs, spreadsheets, Word files, text, images, and audio/video (Max 50MB)
                </p>
              </div>
            </div>
          )}

          {/* 3. SCRAPE TAB */}
          {activeTab === 'scrape' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ fontSize: '12px', color: '#94a3b8', lineHeight: 1.4 }}>
                Enter the direct link to a file. Our background agent will fetch the asset, validate its size, and run smart parsers.
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <input
                  type="text"
                  placeholder="https://example.com/sheet.csv"
                  value={urlInput}
                  onChange={e => setUrlInput(e.target.value)}
                  style={{
                    padding: '8px 12px',
                    background: 'var(--bg-app, #0f172a)',
                    border: '1px solid var(--border-subtle, #334155)',
                    borderRadius: '8px',
                    color: 'white',
                    fontSize: '12.5px',
                    outline: 'none',
                    width: '100%'
                  }}
                />
                <button
                  onClick={handleScrape}
                  disabled={isScraping || !urlInput.trim()}
                  style={{
                    padding: '8px 14px',
                    background: isScraping || !urlInput.trim() ? '#1e293b' : '#6366f1',
                    color: isScraping || !urlInput.trim() ? '#64748b' : 'white',
                    borderRadius: '8px',
                    fontSize: '12.5px',
                    fontWeight: 600,
                    border: 'none',
                    cursor: isScraping || !urlInput.trim() ? 'default' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6
                  }}
                >
                  {isScraping ? <Loader2 size={13} className="animate-spin" /> : <Globe size={13} />}
                  Scrape URL Link
                </button>
              </div>
            </div>
          )}

        </div>

        {/* Selected Tray & Token Impact Metric Indicator */}
        {selectedIds.length > 0 && (
          <div style={{
            padding: '12px 20px',
            background: 'rgba(15, 23, 42, 0.15)',
            borderTop: '1px solid var(--border-subtle, #334155)',
            display: 'flex',
            flexDirection: 'column',
            gap: 10
          }}>
            {/* Impact indicator row */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: '11px', fontWeight: 600, color: '#94a3b8' }}>Context Load:</span>
                <span style={{
                  fontSize: '11.5px',
                  fontWeight: 700,
                  color: 'white',
                  background: impactColor,
                  padding: '2px 8px',
                  borderRadius: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4
                }}>
                  <Sparkles size={11} /> {totalTokens.toLocaleString()} tokens
                </span>
                <span style={{ fontSize: '10.5px', color: '#64748b' }}>({impactLabel})</span>
              </div>
              <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                {selectedIds.length} files selected
              </span>
            </div>

            {/* Warning alert if token count is high */}
            {warningMessage && (
              <div style={{
                display: 'flex',
                gap: 8,
                alignItems: 'start',
                background: 'rgba(245, 158, 11, 0.08)',
                border: '1px solid rgba(245, 158, 11, 0.3)',
                padding: '6px 12px',
                borderRadius: '6px',
                color: '#cbd5e1',
                fontSize: '11px',
                lineHeight: 1.4
              }}>
                <AlertTriangle size={13} style={{ color: '#f59e0b', flexShrink: 0, marginTop: 1 }} />
                <span>{warningMessage}</span>
              </div>
            )}

            {/* List of checked mini badges */}
            <div style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 6,
              maxHeight: '60px',
              overflowY: 'auto'
            }}>
              {selectedIds.map(id => {
                const file = files.find(f => f.id === id);
                if (!file) return null;
                const extDetails = getExtensionDetails(file.filename, file.mime_type);
                return (
                  <div
                    key={id}
                    style={{
                      background: 'var(--bg-app, #0f172a)',
                      border: '1px solid var(--border-subtle, #334155)',
                      padding: '2px 8px',
                      borderRadius: '12px',
                      fontSize: '11px',
                      color: '#cbd5e1',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4
                    }}
                  >
                    <div style={{
                      padding: '1px 3px',
                      background: extDetails.bg,
                      color: extDetails.text,
                      borderRadius: '3px',
                      fontSize: '7px',
                      fontWeight: 900
                    }}>
                      {extDetails.label}
                    </div>
                    <span style={{ maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {file.filename}
                    </span>
                    <button
                      onClick={() => handleToggleSelect(id)}
                      style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: '#64748b', display: 'flex', alignItems: 'center',
                        padding: 0, paddingLeft: 2
                      }}
                      title="Unselect"
                    >
                      <X size={10} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Footer controls */}
        <div style={{
          padding: '14px 20px',
          borderTop: '1px solid var(--border-subtle, #334155)',
          background: 'rgba(15, 23, 42, 0.25)',
          display: 'flex',
          justifyContent: 'flex-end',
          gap: 10
        }}>
          <button
            onClick={onClose}
            style={{
              padding: '8px 16px',
              background: 'transparent',
              border: '1px solid var(--border-subtle, #334155)',
              borderRadius: '8px',
              color: '#cbd5e1',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            style={{
              padding: '8px 20px',
              background: 'linear-gradient(135deg, #7c3aed, #4f46e5)',
              border: 'none',
              borderRadius: '8px',
              color: 'white',
              fontSize: '13px',
              fontWeight: 700,
              cursor: isSaving ? 'default' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              boxShadow: '0 4px 14px rgba(99, 102, 241, 0.3)'
            }}
          >
            {isSaving ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
            Attach to Chat
          </button>
        </div>
      </motion.div>
    </div>
  );
}
