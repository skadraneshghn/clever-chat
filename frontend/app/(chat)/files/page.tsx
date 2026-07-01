'use client';

import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Folder, FileText, Video, Image as ImageIcon, Music, Globe,
  RefreshCw, Trash2, ArrowRight, Loader, FileCode, CheckCircle,
  AlertCircle, Upload, Search, Calendar, ChevronDown, SlidersHorizontal,
  Grid, List, Plus, Download, MoreHorizontal, HelpCircle, Bell, Settings,
  ArrowUpRight, X, ExternalLink
} from 'lucide-react';
import { useChatStore } from '@/stores/chatStore';
import { api } from '@/lib/api';
import { toast } from 'sonner';

// Helper to format file sizes
function formatBytes(bytes: number, decimals = 2) {
  if (!bytes) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
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
  const color = colors[charCodeSum % colors.length];
  return { initials, ...color };
}

// Default placeholder folders to display alongside real folders
const PLACEHOLDER_FOLDERS = [
  { name: 'Contracts & Legal', size: 1200000000, count: 24, organizedBy: 'AI Agent' },
  { name: 'Invoices - Q1', size: 15000000, count: 3, organizedBy: 'System Default' },
  { name: 'Invoices - Q2', size: 4000000, count: 12, organizedBy: 'System Default' },
  { name: 'Design Systems', size: 2800000000, count: 45, organizedBy: 'AI Agent' },
];

export default function FileManagerPage() {
  const {
    files,
    fetchFiles,
    deleteFile,
    uploadFromUrl,
    organizeFiles,
    checkHash
  } = useChatStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [urlInput, setUrlInput] = useState('');
  const [isScraping, setIsScraping] = useState(false);
  const [showScrapeModal, setShowScrapeModal] = useState(false);
  const [selectedStrategy, setSelectedStrategy] = useState('ai');
  const [isOrganizing, setIsOrganizing] = useState(false);
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [activeFilterTab, setActiveFilterTab] = useState<'all' | 'documents' | 'spreadsheets' | 'pdfs' | 'images'>('all');
  const [selectedFileIds, setSelectedFileIds] = useState<string[]>([]);
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  const [uploadQueue, setUploadQueue] = useState<Array<{
    id: string;
    filename: string;
    size: number;
    progress: number;
    status: 'uploading' | 'done' | 'error';
  }>>([]);

  const [dragActive, setDragActive] = useState(false);
  const [showUploadDropdown, setShowUploadDropdown] = useState(false);
  const [activeRowMenuId, setActiveRowMenuId] = useState<string | null>(null);

  useEffect(() => {
    fetchFiles();
  }, [fetchFiles]);

  // Aggregate files into smart virtual folders
  const foldersMap = files.reduce((acc: Record<string, { name: string; size: number; count: number; organizedBy: string }>, file) => {
    const fName = file.folder_name || 'General';
    if (!acc[fName]) {
      acc[fName] = {
        name: fName,
        size: 0,
        count: 0,
        organizedBy: file.folder_name ? 'AI Agent' : 'System Default'
      };
    }
    acc[fName].size += file.size_bytes;
    acc[fName].count += 1;
    return acc;
  }, {});

  const realFolders = Object.values(foldersMap);

  // Combine real folders and placeholder system folders (real folders override matching placeholders)
  const displayFolders = [...realFolders];
  PLACEHOLDER_FOLDERS.forEach(p => {
    if (!displayFolders.some(f => f.name.toLowerCase() === p.name.toLowerCase())) {
      displayFolders.push(p);
    }
  });

  // Toggle selected folder helper
  const toggleSelectedFolder = useCallback((folderName: string) => {
    setSelectedFolder(prev => prev === folderName ? null : folderName);
  }, []);

  // Drag overlay triggers
  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  // Upload Local File Callback
  const uploadLocalFile = useCallback(async (file: File) => {
    const queueId = `${Date.now()}-${Math.random()}`;
    const newQueueItem = {
      id: queueId,
      filename: file.name,
      size: file.size,
      progress: 5,
      status: 'uploading' as const
    };
    setUploadQueue(prev => [newQueueItem, ...prev]);

    // Instantiate worker
    const worker = new Worker(new URL('@/workers/hashWorker.ts', import.meta.url));
    worker.postMessage({ file });

    worker.onmessage = async (e) => {
      const { success, hash, error } = e.data;
      if (!success) {
        console.error('Hashing failed:', error);
        worker.terminate();
        setUploadQueue(prev => prev.map(item => {
          if (item.id === queueId) return { ...item, status: 'error' };
          return item;
        }));
        toast.error(`Hashing failed for "${file.name}"`);
        return;
      }

      try {
        // Pre-flight duplicate check
        const preFlight = await checkHash(hash, file.name, file.type);
        if (preFlight.exists) {
          setUploadQueue(prev => prev.map(item => {
            if (item.id === queueId) {
              return { ...item, progress: 100, status: 'done' };
            }
            return item;
          }));
          toast.success(`Duplicate found. Instantly restored "${file.name}" from vault.`);
          fetchFiles();
          worker.terminate();
          // Clear successful item after a delay
          setTimeout(() => {
            setUploadQueue(prev => prev.filter(item => item.id !== queueId));
          }, 3000);
          return;
        }

        // Proceed with standard S3 upload
        const progressTimer = setInterval(() => {
          setUploadQueue(prev => prev.map(item => {
            if (item.id === queueId && item.progress < 85) {
              return { ...item, progress: item.progress + 15 };
            }
            return item;
          }));
        }, 300);

        const result = await api.uploadMedia(file);
        clearInterval(progressTimer);

        setUploadQueue(prev => prev.map(item => {
          if (item.id === queueId) {
            return { ...item, progress: 100, status: 'done' };
          }
          return item;
        }));

        toast.success(`Successfully uploaded "${file.name}"`);
        fetchFiles();

        setTimeout(() => {
          setUploadQueue(prev => prev.filter(item => item.id !== queueId));
        }, 3000);

      } catch (err) {
        setUploadQueue(prev => prev.map(item => {
          if (item.id === queueId) {
            return { ...item, status: 'error' };
          }
          return item;
        }));
        toast.error(`Failed to upload file "${file.name}"`);
      } finally {
        worker.terminate();
      }
    };

    worker.onerror = (err) => {
      console.error('Worker error:', err);
      worker.terminate();
      setUploadQueue(prev => prev.map(item => {
        if (item.id === queueId) return { ...item, status: 'error' };
        return item;
      }));
      toast.error(`Worker error while hashing "${file.name}"`);
    };
  }, [fetchFiles, checkHash]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      Array.from(e.dataTransfer.files).forEach(uploadLocalFile);
    }
  }, [uploadLocalFile]);

  // Handle Input selection
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      Array.from(e.target.files).forEach(uploadLocalFile);
    }
  };

  // Handle URL scraping
  const handleUrlScrape = async () => {
    if (!urlInput.trim()) return;
    setIsScraping(true);
    const scraperId = toast.loading('Scraping and validating file link...');
    try {
      await uploadFromUrl(urlInput.trim());
      toast.success('Successfully scraped file from link', { id: scraperId });
      setUrlInput('');
      setShowScrapeModal(false);
      fetchFiles();
    } catch (err: any) {
      toast.error(err.message || 'Scraping failed', { id: scraperId });
    } finally {
      setIsScraping(false);
    }
  };

  // Run AI organization
  const handleOrganize = async () => {
    setIsOrganizing(true);
    const orgToastId = toast.loading(`Organizing assets via: ${selectedStrategy.toUpperCase()} Strategy...`);
    try {
      await organizeFiles(selectedStrategy);
      toast.success('Files successfully organized!', { id: orgToastId });
    } catch (err) {
      toast.error('Failed to organize files', { id: orgToastId });
    } finally {
      setIsOrganizing(false);
    }
  };

  // Sort files by creation date for Recent section
  const sortedFilesForRecent = [...files].sort((a, b) => {
    return new Date(b.created_at || b.id).getTime() - new Date(a.created_at || a.id).getTime();
  });

  const recentFiles = sortedFilesForRecent.slice(0, 8);

  // Filter files based on filter tab and search
  const filteredFiles = files.filter(f => {
    const matchesSearch = f.filename.toLowerCase().includes(searchQuery.toLowerCase());
    
    // Filter folders
    const matchesFolder = selectedFolder
      ? (f.folder_name === selectedFolder || (selectedFolder === 'General' && !f.folder_name))
      : true;

    // Filter categories
    const mime = f.mime_type || '';
    let matchesTab = true;
    if (activeFilterTab === 'documents') {
      matchesTab = mime.startsWith('text/') || mime === 'application/pdf' || mime.includes('word') || f.filename.endsWith('.docx') || f.filename.endsWith('.doc');
    } else if (activeFilterTab === 'spreadsheets') {
      matchesTab = mime.includes('spreadsheet') || mime === 'text/csv' || f.filename.endsWith('.xlsx') || f.filename.endsWith('.csv');
    } else if (activeFilterTab === 'pdfs') {
      matchesTab = mime === 'application/pdf';
    } else if (activeFilterTab === 'images') {
      matchesTab = mime.startsWith('image/');
    }

    return matchesSearch && matchesFolder && matchesTab;
  });

  // Sort filtered files for the main table
  const sortedFilteredFiles = [...filteredFiles].sort((a, b) => {
    const dateA = new Date(a.created_at || a.id).getTime();
    const dateB = new Date(b.created_at || b.id).getTime();
    return sortOrder === 'desc' ? dateB - dateA : dateA - dateB;
  });

  // Handle table row checkbox toggling
  const handleSelectRow = (id: string) => {
    setSelectedFileIds(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    if (selectedFileIds.length === sortedFilteredFiles.length) {
      setSelectedFileIds([]);
    } else {
      setSelectedFileIds(sortedFilteredFiles.map(f => f.id));
    }
  };

  return (
    <div
      onDragOver={handleDrag}
      onDragEnter={handleDrag}
      style={{
        display: 'flex',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        background: 'var(--bg-app, #0f172a)',
        color: 'var(--text-primary, #f8fafc)',
        fontFamily: "'Outfit', 'Inter', sans-serif"
      }}
    >
      {/* ── DRAG AND DROP OVERLAY ── */}
      <AnimatePresence>
        {dragActive && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onDragLeave={() => setDragActive(false)}
            onDragOver={e => e.preventDefault()}
            onDrop={handleDrop}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 999,
              background: 'rgba(15, 23, 42, 0.75)',
              backdropFilter: 'blur(8px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '2px dashed var(--accent-primary, #6366f1)',
              margin: '16px',
              borderRadius: '24px'
            }}
          >
            <div style={{ textAlign: 'center', pointerEvents: 'none' }}>
              <div style={{
                width: '80px', height: '80px', borderRadius: '50%',
                background: 'rgba(99, 102, 241, 0.1)', display: 'flex',
                alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px',
                color: '#6366f1'
              }}>
                <Upload size={36} />
              </div>
              <h2 style={{ fontSize: '24px', fontWeight: 700, margin: '0 0 8px' }}>
                Release to Ingest files
              </h2>
              <p style={{ color: '#94a3b8', fontSize: '15px' }}>
                Your documents will be hashed, parsed, and indexed off-thread.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── MAIN CONTENT CONTAINER (75% width) ── */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflowY: 'auto',
        borderRight: '1px solid var(--border-subtle, rgba(255,255,255,0.05))',
        padding: '24px',
        gap: '28px'
      }}>
        {/* Top Header / Breadcrumbs Bar */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: '100%',
          flexWrap: 'wrap',
          gap: 16
        }}>
          {/* Path breadcrumbs with clear folder mechanism */}
          <div style={{ fontSize: '13.5px', fontWeight: 500, color: 'var(--text-muted, #64748b)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ cursor: 'pointer' }} onClick={() => setSelectedFolder(null)}>Dashboard</span>
            <span style={{ opacity: 0.5 }}>/</span>
            <span 
              onClick={() => setSelectedFolder(null)}
              style={{ 
                color: selectedFolder ? 'var(--text-muted, #64748b)' : 'var(--text-primary, #f8fafc)', 
                fontWeight: selectedFolder ? 500 : 600,
                cursor: selectedFolder ? 'pointer' : 'default',
                textDecoration: selectedFolder ? 'underline' : 'none'
              }}
            >
              Project Files
            </span>
            {selectedFolder && (
              <>
                <span style={{ opacity: 0.5 }}>/</span>
                <span style={{ color: 'var(--text-primary, #f8fafc)', fontWeight: 600 }}>{selectedFolder}</span>
                <button 
                  onClick={() => setSelectedFolder(null)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#ef4444',
                    fontSize: '11px',
                    marginLeft: '8px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '2px',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    backgroundColor: 'rgba(239, 68, 68, 0.08)'
                  }}
                >
                  <X size={10} /> Clear Filter
                </button>
              </>
            )}
          </div>

          {/* Quick tools */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            {/* Search Input mock bar */}
            <div style={{ position: 'relative', width: '220px' }}>
              <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted, #64748b)' }} />
              <input
                type="text"
                placeholder="Search..."
                disabled
                style={{
                  width: '100%',
                  padding: '6px 12px 6px 30px',
                  background: 'var(--surface-1, #1e293b)',
                  border: '1px solid var(--border-subtle, #334155)',
                  borderRadius: '8px',
                  fontSize: '12.5px',
                  color: 'var(--text-primary, #f8fafc)',
                  outline: 'none',
                  cursor: 'not-allowed'
                }}
              />
              <span style={{
                position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                fontSize: '9.5px', background: 'rgba(255,255,255,0.06)', padding: '2px 5px',
                borderRadius: '4px', border: '1px solid rgba(255,255,255,0.08)', color: '#64748b'
              }}>
                ⌘K
              </span>
            </div>

            <button style={{ background: 'none', border: 'none', color: 'var(--text-muted, #64748b)', cursor: 'pointer' }}>
              <Bell size={16} />
            </button>
            <button style={{ background: 'none', border: 'none', color: 'var(--text-muted, #64748b)', cursor: 'pointer' }}>
              <HelpCircle size={16} />
            </button>
            <button style={{ background: 'none', border: 'none', color: 'var(--text-muted, #64748b)', cursor: 'pointer' }}>
              <Settings size={16} />
            </button>
          </div>
        </div>

        {/* Title and Actions Row */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: '100%'
        }}>
          <div>
            <h1 style={{ fontSize: '24px', fontWeight: 700, margin: 0, letterSpacing: '-0.02em' }}>
              {selectedFolder ? `${selectedFolder} Folder` : 'Project Files'}
            </h1>
            <p style={{ fontSize: '13px', color: 'var(--text-muted, #64748b)', margin: '4px 0 0' }}>
              Context-aware file indexing system connected to Clever Cloud.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, position: 'relative' }}>
            {/* Bulk delete action when rows are selected */}
            {selectedFileIds.length > 0 && (
              <button
                onClick={async () => {
                  if (confirm(`Are you sure you want to delete ${selectedFileIds.length} selected files?`)) {
                    const deletePromises = selectedFileIds.map(id => deleteFile(id));
                    await Promise.all(deletePromises);
                    setSelectedFileIds([]);
                    fetchFiles();
                  }
                }}
                style={{
                  background: '#ef4444',
                  color: 'white',
                  padding: '8px 14px',
                  borderRadius: '8px',
                  fontWeight: 600,
                  fontSize: '13px',
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  transition: 'opacity 0.2s'
                }}
                onMouseEnter={e => e.currentTarget.style.opacity = '0.9'}
                onMouseLeave={e => e.currentTarget.style.opacity = '1'}
              >
                <Trash2 size={14} />
                Delete Selected ({selectedFileIds.length})
              </button>
            )}

            {/* Upload Dropdown Controls */}
            <div style={{ display: 'flex', borderRadius: '8px', overflow: 'hidden' }}>
              <button
                onClick={() => document.getElementById('local-file-picker')?.click()}
                style={{
                  background: 'var(--text-primary, #f8fafc)',
                  color: 'var(--bg-app, #0f172a)',
                  padding: '8px 14px',
                  fontWeight: 600,
                  fontSize: '13px',
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  transition: 'opacity 0.2s'
                }}
                onMouseEnter={e => e.currentTarget.style.opacity = '0.9'}
                onMouseLeave={e => e.currentTarget.style.opacity = '1'}
              >
                <Upload size={14} />
                Upload File
              </button>
              <button
                onClick={() => setShowUploadDropdown(!showUploadDropdown)}
                style={{
                  background: 'var(--text-primary, #f8fafc)',
                  color: 'var(--bg-app, #0f172a)',
                  borderLeft: '1px solid rgba(15,23,42,0.1)',
                  padding: '8px 8px',
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <ChevronDown size={13} />
              </button>
            </div>

            {/* Dropdown Options overlay */}
            <AnimatePresence>
              {showUploadDropdown && (
                <>
                  <div 
                    onClick={() => setShowUploadDropdown(false)}
                    style={{
                      position: 'fixed',
                      inset: 0,
                      zIndex: 49,
                      background: 'transparent'
                    }}
                  />
                  <motion.div
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 5 }}
                    style={{
                      position: 'absolute',
                      top: '40px',
                      right: 0,
                      zIndex: 50,
                      width: '180px',
                      background: 'var(--surface-1, #1e293b)',
                      border: '1px solid var(--border-subtle, #334155)',
                      borderRadius: '8px',
                      boxShadow: '0 10px 25px -5px rgba(0,0,0,0.3)',
                      padding: '6px'
                    }}
                  >
                    <button
                      onClick={() => {
                        document.getElementById('local-file-picker')?.click();
                        setShowUploadDropdown(false);
                      }}
                      style={{
                        width: '100%',
                        padding: '8px 10px',
                        background: 'none',
                        border: 'none',
                        color: 'var(--text-primary, #f8fafc)',
                        fontSize: '12.5px',
                        textAlign: 'left',
                        cursor: 'pointer',
                        borderRadius: '6px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'none'}
                    >
                      <Upload size={13} /> Local Upload
                    </button>
                    <button
                      onClick={() => {
                        setShowScrapeModal(true);
                        setShowUploadDropdown(false);
                      }}
                      style={{
                        width: '100%',
                        padding: '8px 10px',
                        background: 'none',
                        border: 'none',
                        color: 'var(--text-primary, #f8fafc)',
                        fontSize: '12.5px',
                        textAlign: 'left',
                        cursor: 'pointer',
                        borderRadius: '6px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'none'}
                    >
                      <Globe size={13} /> Scrape URL Link
                    </button>
                  </motion.div>
                </>
              )}
            </AnimatePresence>

            <input
              type="file"
              id="local-file-picker"
              multiple
              onChange={handleFileSelect}
              style={{ display: 'none' }}
            />
          </div>
        </div>

        {/* Smart Folder cards grid (Row of folders, real and placeholder system folders) */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <h2 style={{ fontSize: '14.5px', fontWeight: 650, color: 'var(--text-muted, #64748b)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>
            Smart Folder Index
          </h2>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))',
            gap: 16
          }}>
            {displayFolders.map(folder => {
              const isSelected = selectedFolder === folder.name;
              return (
                <div
                  key={folder.name}
                  onClick={() => toggleSelectedFolder(folder.name)}
                  style={{
                    background: isSelected ? 'rgba(99, 102, 241, 0.08)' : 'var(--surface-1, #1e293b)',
                    border: isSelected ? '1.5px solid var(--accent-primary, #6366f1)' : '1px solid var(--border-subtle, #334155)',
                    borderRadius: '12px',
                    padding: '16px',
                    cursor: 'pointer',
                    position: 'relative',
                    transition: 'all 0.2s ease',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                  }}
                  onMouseEnter={e => {
                    if (!isSelected) {
                      e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)';
                      e.currentTarget.style.transform = 'translateY(-1px)';
                    }
                  }}
                  onMouseLeave={e => {
                    if (!isSelected) {
                      e.currentTarget.style.borderColor = 'var(--border-subtle, #334155)';
                      e.currentTarget.style.transform = 'none';
                    }
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                    <div style={{
                      width: 36, height: 36,
                      borderRadius: '8px',
                      background: 'rgba(99, 102, 241, 0.1)',
                      color: '#6366f1',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 16
                    }}>
                      <Folder size={16} />
                    </div>
                    <button style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer' }}>
                      <MoreHorizontal size={14} />
                    </button>
                  </div>

                  <h3 style={{
                    fontSize: '13.5px',
                    fontWeight: 650,
                    margin: '0 0 4px',
                    color: 'var(--text-primary, #f8fafc)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}>
                    {folder.name}
                  </h3>
                  
                  <div style={{ display: 'flex', alignItems: 'center', justifyItems: 'center', gap: 6, fontSize: '11px', color: '#64748b' }}>
                    <span>{folder.count} Files</span>
                    <span>•</span>
                    <span>{formatBytes(folder.size)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Recent files grid cards */}
        {files.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <h2 style={{ fontSize: '14.5px', fontWeight: 650, color: 'var(--text-muted, #64748b)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>
              Recent Vault Ingestions
            </h2>

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
              gap: 12
            }}>
              {recentFiles.map(file => {
                const extDetails = getExtensionDetails(file.filename, file.mime_type);
                const relativeDate = file.created_at ? new Date(file.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'Jan 20, 2026';
                return (
                  <div
                    key={file.id}
                    style={{
                      background: 'var(--surface-1, #1e293b)',
                      border: '1px solid var(--border-subtle, #334155)',
                      borderRadius: '10px',
                      padding: '12px 14px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      boxShadow: '0 1px 2px rgba(0,0,0,0.02)'
                    }}
                  >
                    <div style={{
                      width: 32, height: 32,
                      borderRadius: '6px',
                      background: extDetails.bg,
                      color: extDetails.text,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '9.5px', fontWeight: 800,
                      border: `1px solid ${extDetails.border}`
                    }}>
                      {extDetails.label}
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span style={{
                        fontSize: '12.5px',
                        fontWeight: 600,
                        color: 'var(--text-primary, #f8fafc)',
                        display: 'block',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}>
                        {file.filename}
                      </span>
                      <span style={{ fontSize: '10.5px', color: '#64748b' }}>
                        {relativeDate}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* All Files list section */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 10 }}>
          
          {/* Filtering and search row */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 14
          }}>
            {/* Filter pills */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              {[
                { id: 'all', label: 'View all' },
                { id: 'documents', label: 'Documents' },
                { id: 'spreadsheets', label: 'Spreadsheets' },
                { id: 'pdfs', label: 'PDFs' },
                { id: 'images', label: 'Images' }
              ].map(tab => {
                const isActive = activeFilterTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveFilterTab(tab.id as any)}
                    style={{
                      padding: '5px 12px',
                      background: isActive ? 'var(--text-primary, #f8fafc)' : 'none',
                      color: isActive ? 'var(--bg-app, #0f172a)' : 'var(--text-muted, #64748b)',
                      border: isActive ? 'none' : '1px solid var(--border-subtle, #334155)',
                      borderRadius: '100px',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      transition: 'all 0.15s'
                    }}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {/* Filter search box */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ position: 'relative', width: '200px' }}>
                <Search size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
                <input
                  type="text"
                  placeholder="Search file..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '5px 10px 5px 26px',
                    background: 'var(--surface-1, #1e293b)',
                    border: '1px solid var(--border-subtle, #334155)',
                    borderRadius: '8px',
                    fontSize: '12px',
                    color: 'var(--text-primary, #f8fafc)',
                    outline: 'none'
                  }}
                />
              </div>

              <button style={{
                padding: '6px',
                background: 'none',
                border: '1px solid var(--border-subtle, #334155)',
                borderRadius: '8px',
                color: '#64748b',
                cursor: 'pointer',
                display: 'flex', alignItems: 'center'
              }}>
                <SlidersHorizontal size={13} />
              </button>

              <div style={{
                display: 'flex',
                background: 'var(--surface-1, #1e293b)',
                border: '1px solid var(--border-subtle, #334155)',
                borderRadius: '8px',
                padding: '2px'
              }}>
                <button style={{
                  padding: '4px', background: 'none', border: 'none', color: 'var(--text-primary, #f8fafc)', cursor: 'pointer'
                }}>
                  <List size={13} />
                </button>
                <button style={{
                  padding: '4px', background: 'none', border: 'none', color: '#64748b', cursor: 'pointer'
                }}>
                  <Grid size={13} />
                </button>
              </div>
            </div>
          </div>

          {/* Database File Table */}
          <div style={{
            background: 'var(--surface-1, #1e293b)',
            border: '1px solid var(--border-subtle, #334155)',
            borderRadius: '12px',
            overflow: 'hidden',
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
          }}>
            <div style={{ width: '100%', overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '600px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-subtle, #334155)', background: 'rgba(255,255,255,0.015)' }}>
                    <th style={{ padding: '12px 16px', width: '40px' }}>
                      <input
                        type="checkbox"
                        checked={sortedFilteredFiles.length > 0 && selectedFileIds.length === sortedFilteredFiles.length}
                        onChange={handleSelectAll}
                        style={{ cursor: 'pointer', width: 14, height: 14 }}
                      />
                    </th>
                    <th style={{ padding: '12px 16px', fontSize: '11.5px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>
                      Filename
                    </th>
                    <th 
                      onClick={() => setSortOrder(prev => prev === 'desc' ? 'asc' : 'desc')}
                      style={{ padding: '12px 16px', fontSize: '11.5px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', cursor: 'pointer', userSelect: 'none' }}
                    >
                      Created At <span style={{ marginLeft: 4 }}>{sortOrder === 'desc' ? '↓' : '↑'}</span>
                    </th>
                    <th style={{ padding: '12px 16px', fontSize: '11.5px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>
                      Owner
                    </th>
                    <th style={{ padding: '12px 16px', fontSize: '11.5px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>
                      Location
                    </th>
                    <th style={{ padding: '12px 16px', width: '50px' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {sortedFilteredFiles.map(file => {
                    const extDetails = getExtensionDetails(file.filename, file.mime_type);
                    const fileDate = file.created_at
                      ? new Date(file.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
                      : 'Jan 20, 2026';
                    
                    const isChecked = selectedFileIds.includes(file.id);
                    const ownerAvatar = getAvatarStyles('Clever User');

                    return (
                      <tr
                        key={file.id}
                        style={{
                          borderBottom: '1px solid var(--border-subtle, #334155)',
                          background: isChecked ? 'rgba(99, 102, 241, 0.03)' : 'none',
                          transition: 'background-color 0.15s'
                        }}
                      >
                        <td style={{ padding: '12px 16px' }}>
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => handleSelectRow(file.id)}
                            style={{ cursor: 'pointer', width: 14, height: 14 }}
                          />
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div style={{
                              width: 28, height: 28,
                              borderRadius: '6px',
                              background: extDetails.bg,
                              color: extDetails.text,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: '8px', fontWeight: 900,
                              border: `1px solid ${extDetails.border}`,
                              flexShrink: 0
                            }}>
                              {extDetails.label}
                            </div>
                            
                            <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                              <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary, #f8fafc)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {file.filename}
                              </span>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                                <span style={{ fontSize: '10px', color: '#64748b' }}>
                                  {formatBytes(file.size_bytes)}
                                </span>
                                
                                {file.status === 'processing' && (
                                  <span style={{ fontSize: '9px', color: '#f59e0b', display: 'flex', alignItems: 'center', gap: 2 }}>
                                    • Processing
                                  </span>
                                )}
                                {file.extraction_status === 'success' && (
                                  <span style={{ fontSize: '9px', color: '#10b981', display: 'flex', alignItems: 'center', gap: 2 }}>
                                    • Parsed ({file.token_count?.toLocaleString()} tokens)
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td style={{ padding: '12px 16px', fontSize: '12.5px', color: 'var(--text-muted, #94a3b8)' }}>
                          {fileDate}
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{
                              width: 24, height: 24, borderRadius: '50%',
                              background: ownerAvatar.bg, color: ownerAvatar.text,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: '10px', fontWeight: 700
                            }}>
                              {ownerAvatar.initials}
                            </div>
                            <span style={{ fontSize: '12.5px', fontWeight: 500 }}>Rakate</span>
                          </div>
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <span
                            onClick={() => toggleSelectedFolder(file.folder_name || 'General')}
                            style={{
                              fontSize: '12px',
                              fontWeight: 500,
                              color: '#6366f1',
                              cursor: 'pointer',
                              textDecoration: 'underline'
                            }}
                          >
                            /{file.folder_name || 'General'}
                          </span>
                        </td>
                        <td style={{ padding: '12px 16px', position: 'relative' }}>
                          <button
                            onClick={() => setActiveRowMenuId(activeRowMenuId === file.id ? null : file.id)}
                            style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer' }}
                          >
                            <MoreHorizontal size={14} />
                          </button>

                          {/* Options overlay popup using standard transparent backdrop pattern */}
                          <AnimatePresence>
                            {activeRowMenuId === file.id && (
                              <>
                                <div 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setActiveRowMenuId(null);
                                  }}
                                  style={{
                                    position: 'fixed',
                                    inset: 0,
                                    zIndex: 39,
                                    background: 'transparent',
                                    cursor: 'default'
                                  }}
                                />
                                <div
                                  style={{
                                    position: 'absolute',
                                    right: '16px',
                                    top: '32px',
                                    zIndex: 40,
                                    background: 'var(--surface-1, #1e293b)',
                                    border: '1px solid var(--border-subtle, #334155)',
                                    borderRadius: '8px',
                                    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                                    padding: '4px',
                                    width: '120px'
                                  }}
                                >
                                  <a
                                    href={`${process.env.NEXT_PUBLIC_API_URL || ''}${file.url}`}
                                    download={file.filename}
                                    target="_blank"
                                    rel="noreferrer"
                                    style={{
                                      display: 'flex', alignItems: 'center', gap: 6,
                                      padding: '6px 8px', borderRadius: '4px', fontSize: '12px',
                                      color: 'var(--text-primary, #f8fafc)', textDecoration: 'none'
                                    }}
                                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                                    onMouseLeave={e => e.currentTarget.style.background = 'none'}
                                  >
                                    <Download size={12} /> Download
                                  </a>
                                  <button
                                    onClick={() => {
                                      if (confirm(`Delete "${file.filename}"?`)) {
                                        deleteFile(file.id);
                                      }
                                      setActiveRowMenuId(null);
                                    }}
                                    style={{
                                      display: 'flex', alignItems: 'center', gap: 6,
                                      padding: '6px 8px', borderRadius: '4px', fontSize: '12px',
                                      color: '#ef4444', background: 'none', border: 'none',
                                      width: '100%', textAlign: 'left', cursor: 'pointer'
                                    }}
                                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                                    onMouseLeave={e => e.currentTarget.style.background = 'none'}
                                  >
                                    <Trash2 size={12} /> Delete
                                  </button>
                                </div>
                              </>
                            )}
                          </AnimatePresence>
                        </td>
                      </tr>
                    );
                  })}

                  {sortedFilteredFiles.length === 0 && (
                    <tr>
                      <td colSpan={6} style={{ padding: '40px', textAlign: 'center', color: '#64748b', fontSize: '13px' }}>
                        {searchQuery ? 'No files match your search filter.' : 'This folder contains no files yet.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Table Footer */}
            <div style={{
              padding: '12px 16px',
              borderTop: '1px solid var(--border-subtle, #334155)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: '12px',
              color: '#64748b',
              flexWrap: 'wrap',
              gap: 12
            }}>
              <span>
                {selectedFileIds.length} of {sortedFilteredFiles.length} row(s) selected.
              </span>

              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span>Page 1 of 1</span>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button disabled style={{ padding: '4px 8px', background: 'none', border: '1px solid var(--border-subtle, #334155)', borderRadius: '4px', cursor: 'not-allowed' }}>
                    &lt;
                  </button>
                  <button disabled style={{ padding: '4px 8px', background: 'none', border: '1px solid var(--border-subtle, #334155)', borderRadius: '4px', cursor: 'not-allowed' }}>
                    &gt;
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── RIGHT PANEL / INFO SIDEBAR (25% width) ── */}
      <div style={{
        width: '300px',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflowY: 'auto',
        background: 'var(--surface-1, #1e293b)',
        padding: '24px',
        gap: '24px',
        flexShrink: 0
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 700, margin: 0 }}>Files</h2>
          <button style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer' }}>
            <MoreHorizontal size={14} />
          </button>
        </div>

        {/* Right toolbar controls (Bound to activeFilterTab) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <select 
            value={activeFilterTab}
            onChange={e => setActiveFilterTab(e.target.value as any)}
            style={{
              flex: 1,
              padding: '6px 8px',
              background: 'var(--bg-app, #0f172a)',
              border: '1px solid var(--border-subtle, #334155)',
              borderRadius: '6px',
              color: 'var(--text-primary, #f8fafc)',
              fontSize: '12px',
              outline: 'none',
              cursor: 'pointer'
            }}
          >
            <option value="all">All Types</option>
            <option value="documents">Documents</option>
            <option value="spreadsheets">Spreadsheets</option>
            <option value="pdfs">PDFs</option>
            <option value="images">Images</option>
          </select>

          <button style={{
            padding: '6px',
            background: 'var(--bg-app, #0f172a)',
            border: '1px solid var(--border-subtle, #334155)',
            borderRadius: '6px',
            color: '#64748b',
            cursor: 'pointer'
          }}>
            <Calendar size={13} />
          </button>

          <button style={{
            padding: '6px',
            background: 'var(--bg-app, #0f172a)',
            border: '1px solid var(--border-subtle, #334155)',
            borderRadius: '6px',
            color: '#64748b',
            cursor: 'pointer'
          }}>
            <Plus size={13} />
          </button>
        </div>

        {/* Miniature Folder Stack */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {displayFolders.slice(0, 3).map((folder) => {
            const isSelected = selectedFolder === folder.name;
            return (
              <div
                key={folder.name}
                onClick={() => toggleSelectedFolder(folder.name)}
                style={{
                  background: isSelected ? 'rgba(99, 102, 241, 0.08)' : 'var(--bg-app, #0f172a)',
                  border: isSelected ? '1.5px solid var(--accent-primary, #6366f1)' : '1px solid var(--border-subtle, #334155)',
                  borderRadius: '8px',
                  padding: '10px 12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  cursor: 'pointer',
                  transition: 'all 0.15s'
                }}
                onMouseEnter={e => {
                  if (!isSelected) e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)';
                }}
                onMouseLeave={e => {
                  if (!isSelected) e.currentTarget.style.borderColor = 'var(--border-subtle, #334155)';
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Folder size={14} style={{ color: '#f97316' }} />
                  <span style={{ fontSize: '12px', fontWeight: 600 }}>{folder.name}</span>
                </div>
                <span style={{ fontSize: '10.5px', color: '#64748b' }}>
                  {folder.count} files
                </span>
              </div>
            );
          })}
        </div>

        {/* mini Recent Files detailed card stack */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 10 }}>
          <h3 style={{ fontSize: '13px', fontWeight: 650, color: 'var(--text-muted, #64748b)', margin: 0 }}>
            Recent Activity
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {recentFiles.slice(0, 5).map(file => {
              const extDetails = getExtensionDetails(file.filename, file.mime_type);
              const relativeTime = 'Today, 10:04 AM';
              return (
                <div
                  key={file.id}
                  style={{
                    background: 'var(--bg-app, #0f172a)',
                    border: '1px solid var(--border-subtle, #334155)',
                    borderRadius: '8px',
                    padding: '10px',
                    display: 'flex',
                    alignItems: 'start',
                    gap: 10
                  }}
                >
                  <div style={{
                    width: 32, height: 32,
                    borderRadius: '6px',
                    background: extDetails.bg,
                    color: extDetails.text,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '8px', fontWeight: 900,
                    border: `1px solid ${extDetails.border}`,
                    flexShrink: 0
                  }}>
                    {extDetails.label}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{
                      fontSize: '12px',
                      fontWeight: 600,
                      color: 'var(--text-primary, #f8fafc)',
                      display: 'block',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}>
                      {file.filename}
                    </span>
                    <span style={{ fontSize: '10px', color: '#64748b', display: 'block', marginTop: 1 }}>
                      {formatBytes(file.size_bytes)}
                    </span>
                    <span style={{ fontSize: '9.5px', color: '#64748b', display: 'block', marginTop: 2 }}>
                      {relativeTime}
                    </span>
                  </div>
                </div>
              );
            })}

            {files.length === 0 && (
              <div style={{ padding: '20px', textAlign: 'center', color: '#64748b', fontSize: '12px' }}>
                No recent activity.
              </div>
            )}
          </div>
        </div>

        {/* Auto organizer management settings widget */}
        <div style={{
          background: 'var(--bg-app, #0f172a)',
          border: '1px solid var(--border-subtle, #334155)',
          borderRadius: '10px',
          padding: '12px',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          marginTop: 'auto'
        }}>
          <h4 style={{ fontSize: '11.5px', fontWeight: 650, color: 'var(--text-muted, #64748b)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Auto Management Engine
          </h4>
          <select
            value={selectedStrategy}
            onChange={e => setSelectedStrategy(e.target.value)}
            style={{
              padding: '6px 8px',
              background: 'var(--surface-1, #1e293b)',
              border: '1px solid var(--border-subtle, #334155)',
              borderRadius: '6px',
              color: 'var(--text-primary, #f8fafc)',
              fontSize: '11px',
              outline: 'none',
              cursor: 'pointer'
            }}
          >
            <option value="ai">Let AI auto-organize (LLM)</option>
            <option value="type">Organize by File Type</option>
            <option value="size">Organize by Size</option>
            <option value="month">Organize by Month</option>
          </select>
          <button
            onClick={handleOrganize}
            disabled={isOrganizing || files.length === 0}
            style={{
              padding: '8px',
              background: isOrganizing || files.length === 0 ? '#1e293b' : 'linear-gradient(135deg, #7c3aed, #4f46e5)',
              color: isOrganizing || files.length === 0 ? '#64748b' : 'white',
              borderRadius: '6px',
              fontSize: '11px',
              fontWeight: 700,
              border: 'none',
              cursor: isOrganizing || files.length === 0 ? 'default' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6
            }}
          >
            {isOrganizing ? <Loader size={12} className="animate-spin" /> : <RefreshCw size={12} />}
            Organize Vault
          </button>
        </div>
      </div>

      {/* ── URL SCRAPE LINK DIALOG MODAL ── */}
      <AnimatePresence>
        {showScrapeModal && (
          <div style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(15, 23, 42, 0.6)',
            backdropFilter: 'blur(4px)'
          }}>
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              style={{
                width: '100%',
                maxWidth: '440px',
                background: 'var(--surface-1, #1e293b)',
                border: '1px solid var(--border-subtle, #334155)',
                borderRadius: '12px',
                padding: '20px',
                display: 'flex',
                flexDirection: 'column',
                gap: 16,
                boxShadow: '0 20px 25px -5px rgba(0,0,0,0.5)'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <h3 style={{ fontSize: '15px', fontWeight: 700, margin: 0 }}>Scrape Asset from Link</h3>
                <button
                  onClick={() => setShowScrapeModal(false)}
                  style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer' }}
                >
                  <X size={16} />
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: '11px', fontWeight: 650, color: 'var(--text-muted, #64748b)' }}>URL LINK</label>
                <input
                  type="text"
                  placeholder="https://example.com/document.pdf"
                  value={urlInput}
                  onChange={e => setUrlInput(e.target.value)}
                  style={{
                    padding: '8px 12px',
                    background: 'var(--bg-app, #0f172a)',
                    border: '1px solid var(--border-subtle, #334155)',
                    borderRadius: '8px',
                    color: 'white',
                    fontSize: '13px',
                    outline: 'none'
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'end', gap: 8, marginTop: 10 }}>
                <button
                  onClick={() => setShowScrapeModal(false)}
                  style={{
                    padding: '8px 14px',
                    background: 'none',
                    border: '1px solid var(--border-subtle, #334155)',
                    borderRadius: '8px',
                    color: 'var(--text-primary, #f8fafc)',
                    fontSize: '12.5px',
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleUrlScrape}
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
                    gap: 6
                  }}
                >
                  {isScraping ? <Loader size={13} className="animate-spin" /> : <Globe size={13} />}
                  Scrape
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── UPLOAD INGEST QUEUE FLOATER (Visual Feedback) ── */}
      <AnimatePresence>
        {uploadQueue.length > 0 && (
          <div style={{
            position: 'fixed',
            bottom: '24px',
            right: '24px',
            zIndex: 100,
            width: '280px',
            display: 'flex',
            flexDirection: 'column',
            gap: 8
          }}>
            {uploadQueue.map(item => {
              const extDetails = getExtensionDetails(item.filename, '');
              return (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, y: 30, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  style={{
                    background: 'var(--surface-1, #1e293b)',
                    borderRadius: '10px',
                    padding: '12px',
                    border: '1px solid var(--border-subtle, #334155)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                    boxShadow: '0 10px 15px -3px rgba(0,0,0,0.3)'
                  }}
                >
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <div style={{
                      padding: '2px 4px',
                      background: extDetails.bg,
                      color: extDetails.text,
                      borderRadius: '4px',
                      fontSize: '8px',
                      fontWeight: 800
                    }}>
                      {extDetails.label}
                    </div>
                    <span style={{
                      fontSize: '11.5px',
                      color: 'var(--text-primary, #f8fafc)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      flex: 1
                    }}>
                      {item.filename}
                    </span>
                  </div>
                  
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ flex: 1, height: 3, background: 'var(--bg-app, #0f172a)', borderRadius: '2px', overflow: 'hidden' }}>
                      <div style={{
                        width: `${item.progress}%`,
                        height: '100%',
                        background: item.status === 'error' ? '#ef4444' : '#6366f1',
                        transition: 'width 0.2s ease-out'
                      }} />
                    </div>
                    <span style={{ fontSize: '10px', color: '#64748b', minWidth: '24px', textAlign: 'right' }}>
                      {item.status === 'error' ? 'Err' : `${item.progress}%`}
                    </span>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
