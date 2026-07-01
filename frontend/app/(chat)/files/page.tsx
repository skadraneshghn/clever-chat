'use client';

import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Folder, FileText, Video, Image as ImageIcon, Music, Globe,
  RefreshCw, Trash2, ArrowRight, Loader, FileCode, CheckCircle,
  AlertCircle, Upload, Search
} from 'lucide-react';
import { useChatStore } from '@/stores/chatStore';
import { api } from '@/lib/api';
import { toast } from 'sonner';

// Helper to format file sizes nicely
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
    if (ext === 'svg') return { bg: '#ec4899', color: '#fff', label: 'svg' }; // Pink
    return { bg: '#3b82f6', color: '#fff', label: ext || 'img' }; // Blue
  }
  if (mime.startsWith('video/')) return { bg: '#f97316', color: '#fff', label: ext || 'mp4' }; // Orange
  if (mime.startsWith('audio/')) return { bg: '#8b5cf6', color: '#fff', label: ext || 'audio' }; // Purple
  if (mime === 'application/pdf') return { bg: '#ef4444', color: '#fff', label: 'pdf' }; // Red
  if (mime.includes('spreadsheet') || mime === 'text/csv' || ext === 'xlsx' || ext === 'csv') {
    return { bg: '#10b981', color: '#fff', label: ext || 'xls' }; // Green
  }
  if (mime.includes('word') || ext === 'docx' || ext === 'doc') {
    return { bg: '#2563eb', color: '#fff', label: ext || 'doc' }; // Blue
  }
  return { bg: '#6b7280', color: '#fff', label: ext || 'file' }; // Grey
}

export default function FileManagerPage() {
  const {
    files,
    fetchFiles,
    deleteFile,
    uploadFromUrl,
    organizeFiles
  } = useChatStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [urlInput, setUrlInput] = useState('');
  const [isScraping, setIsScraping] = useState(false);
  const [selectedStrategy, setSelectedStrategy] = useState('ai');
  const [isOrganizing, setIsOrganizing] = useState(false);
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [uploadQueue, setUploadQueue] = useState<Array<{
    id: string;
    filename: string;
    size: number;
    progress: number;
    status: 'uploading' | 'done' | 'error';
  }>>([]);

  const [dragActive, setDragActive] = useState(false);

  useEffect(() => {
    fetchFiles();
  }, [fetchFiles]);

  // Aggregate files into smart virtual folders
  const foldersMap = files.reduce((acc: Record<string, { name: string; size: number; count: number; organizedBy: string }>, file) => {
    const fName = file.folder_name || 'Unorganized';
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

  const folderList = Object.values(foldersMap);

  // Handle Drag actions
  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  // Upload Local File
  const uploadLocalFile = useCallback(async (file: File) => {
    const queueId = `${Date.now()}-${Math.random()}`;
    const newQueueItem = {
      id: queueId,
      filename: file.name,
      size: file.size,
      progress: 10,
      status: 'uploading' as const
    };
    setUploadQueue(prev => [newQueueItem, ...prev]);

    try {
      // Create FormData
      const formData = new FormData();
      formData.append('file', file);
      
      // Simulate progress to wow the user
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

      // Clear successful item after a delay
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
    }
  }, [fetchFiles]);

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
    const scraperId = toast.loading('AI agent is scraping & validating file URL...');
    try {
      await uploadFromUrl(urlInput.trim());
      toast.success('Successfully scraped file from link', { id: scraperId });
      setUrlInput('');
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

  // Filtering files
  const filteredFiles = files.filter(f => {
    const matchesSearch = f.filename.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFolder = selectedFolder ? (f.folder_name === selectedFolder || (selectedFolder === 'Unorganized' && !f.folder_name)) : true;
    return matchesSearch && matchesFolder;
  });

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      padding: '24px',
      overflowY: 'auto',
      background: 'var(--bg-app, #0f172a)',
      color: '#f8fafc'
    }}>
      {/* Header Panel */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '28px',
        flexWrap: 'wrap',
        gap: 16
      }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, margin: 0, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: 10 }}>
            <Folder size={24} style={{ color: '#6366f1' }} />
            {selectedFolder ? `${selectedFolder} Folder` : 'Your tidied up folder'}
          </h1>
          <p style={{ fontSize: '13.5px', color: '#94a3b8', margin: '4px 0 0' }}>
            Edit your folders and files the way you want with context-aware intelligence
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {selectedFolder && (
            <button
              onClick={() => setSelectedFolder(null)}
              style={{
                padding: '7px 14px',
                background: '#1e293b',
                border: '1px solid #334155',
                borderRadius: 'var(--radius-md, 8px)',
                color: '#cbd5e1',
                fontSize: '13px',
                cursor: 'pointer',
                transition: 'background 0.2s'
              }}
            >
              Show All Files
            </button>
          )}
          <button
            onClick={() => fetchFiles()}
            style={{
              padding: '7px 14px',
              background: '#1e293b',
              border: '1px solid #334155',
              borderRadius: 'var(--radius-md, 8px)',
              color: '#cbd5e1',
              fontSize: '13px',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              cursor: 'pointer',
              transition: 'background 0.2s'
            }}
          >
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </div>

      {/* Split Ingest and Virtual Folders Section */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(280px, 320px) 1fr',
        gap: '24px',
        alignItems: 'start',
        width: '100%',
        flex: 1
      }}>
        
        {/* LEFT COLUMN: Ingestion Hub */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          
          {/* Drag & Drop Card */}
          <div
            onDragEnter={handleDrag}
            onDragOver={handleDrag}
            onDragLeave={handleDrag}
            onDrop={handleDrop}
            style={{
              background: 'rgba(30, 41, 59, 0.4)',
              border: dragActive ? '2px dashed #6366f1' : '1.5px dashed #334155',
              borderRadius: 'var(--radius-xl, 16px)',
              padding: '32px 20px',
              textAlign: 'center',
              cursor: 'pointer',
              position: 'relative',
              transition: 'border var(--transition-medium), background var(--transition-medium)'
            }}
            onClick={() => document.getElementById('local-file-picker')?.click()}
          >
            <input
              type="file"
              id="local-file-picker"
              multiple
              onChange={handleFileSelect}
              style={{ display: 'none' }}
            />
            
            <div style={{
              width: 54, height: 54,
              borderRadius: '50%',
              background: 'rgba(99, 102, 241, 0.1)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 16px',
              color: '#6366f1'
            }}>
              <Upload size={22} />
            </div>

            <h3 style={{ fontSize: '15px', fontWeight: 650, margin: '0 0 6px', color: '#f1f5f9' }}>
              Drag or upload your files
            </h3>
            <p style={{ fontSize: '12px', color: '#64748b', lineHeight: 1.45, margin: 0 }}>
              AI will automatically organize them into smart folders with context-aware intelligence
            </p>
          </div>

          {/* Link Scraper Terminal */}
          <div style={{
            background: 'rgba(30, 41, 59, 0.4)',
            border: '1px solid #334155',
            borderRadius: 'var(--radius-lg, 12px)',
            padding: '16px'
          }}>
            <h4 style={{ fontSize: '13.5px', fontWeight: 600, margin: '0 0 10px', color: '#f1f5f9' }}>
              Inject URL Link
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <input
                type="text"
                placeholder="https://example.com/document.pdf"
                value={urlInput}
                onChange={e => setUrlInput(e.target.value)}
                style={{
                  padding: '8px 12px',
                  background: '#0f172a',
                  border: '1px solid #334155',
                  borderRadius: 'var(--radius-md, 8px)',
                  color: 'white',
                  fontSize: '12.5px',
                  outline: 'none',
                  width: '100%'
                }}
              />
              <button
                onClick={handleUrlScrape}
                disabled={isScraping || !urlInput.trim()}
                style={{
                  padding: '8px 12px',
                  background: isScraping || !urlInput.trim() ? '#1e293b' : '#6366f1',
                  color: isScraping || !urlInput.trim() ? '#64748b' : 'white',
                  borderRadius: 'var(--radius-md, 8px)',
                  fontSize: '12.5px',
                  fontWeight: 600,
                  border: 'none',
                  cursor: isScraping || !urlInput.trim() ? 'default' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  transition: 'opacity 0.2s'
                }}
              >
                {isScraping ? <Loader size={13} className="animate-spin" /> : <Globe size={13} />}
                Scrape URL Reference
              </button>
            </div>
          </div>

          {/* AI Organizer Strategy Dropdown */}
          <div style={{
            background: 'rgba(30, 41, 59, 0.4)',
            border: '1px solid #334155',
            borderRadius: 'var(--radius-lg, 12px)',
            padding: '16px'
          }}>
            <h4 style={{ fontSize: '13.5px', fontWeight: 600, margin: '0 0 10px', color: '#f1f5f9' }}>
              Auto Management Engine
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <select
                value={selectedStrategy}
                onChange={e => setSelectedStrategy(e.target.value)}
                style={{
                  padding: '8px 12px',
                  background: '#0f172a',
                  border: '1px solid #334155',
                  borderRadius: 'var(--radius-md, 8px)',
                  color: 'white',
                  fontSize: '12.5px',
                  outline: 'none',
                  width: '100%',
                  cursor: 'pointer'
                }}
              >
                <option value="ai">Let AI auto-organize for me (LLM)</option>
                <option value="type">Organize by File Type</option>
                <option value="size">Organize by Size Thresholds</option>
                <option value="month">Organize by Month & Year</option>
              </select>
              <button
                onClick={handleOrganize}
                disabled={isOrganizing || files.length === 0}
                style={{
                  padding: '10px 14px',
                  background: isOrganizing || files.length === 0 ? '#1e293b' : 'linear-gradient(135deg, #7c3aed, #4f46e5)',
                  color: isOrganizing || files.length === 0 ? '#64748b' : 'white',
                  borderRadius: 'var(--radius-md, 8px)',
                  fontSize: '13px',
                  fontWeight: 700,
                  border: 'none',
                  cursor: isOrganizing || files.length === 0 ? 'default' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  boxShadow: isOrganizing || files.length === 0 ? 'none' : '0 4px 14px rgba(99, 102, 241, 0.3)'
                }}
              >
                {isOrganizing ? <Loader size={14} className="animate-spin" /> : 'Organize'}
              </button>
            </div>
          </div>

          {/* Upload Queue Progress Visualizers */}
          <AnimatePresence>
            {uploadQueue.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '12px', fontWeight: 650, color: '#f1f5f9' }}>Uploads in Queue</span>
                  <span style={{ fontSize: '10.5px', background: '#334155', color: '#94a3b8', padding: '1px 6px', borderRadius: 4 }}>
                    {uploadQueue.length} files
                  </span>
                </div>
                {uploadQueue.map(item => {
                  const extDetails = getExtensionDetails(item.filename, '');
                  return (
                    <motion.div
                      key={item.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      style={{
                        background: '#1e293b',
                        borderRadius: 'var(--radius-md, 8px)',
                        padding: '10px',
                        border: '1px solid #334155',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 6
                      }}
                    >
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <div style={{
                          padding: '3px 6px',
                          background: extDetails.bg,
                          color: extDetails.color,
                          borderRadius: 4,
                          fontSize: '9px',
                          fontWeight: 700,
                          textTransform: 'uppercase'
                        }}>
                          {extDetails.label}
                        </div>
                        <span style={{
                          fontSize: '12px',
                          color: '#f1f5f9',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          flex: 1
                        }}>
                          {item.filename}
                        </span>
                      </div>
                      
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {/* Progress Bar */}
                        <div style={{ flex: 1, height: 4, background: '#0f172a', borderRadius: 2, overflow: 'hidden' }}>
                          <div style={{
                            width: `${item.progress}%`,
                            height: '100%',
                            background: item.status === 'error' ? '#ef4444' : '#6366f1',
                            transition: 'width 0.3s ease-out'
                          }} />
                        </div>
                        <span style={{ fontSize: '10.5px', color: '#94a3b8', minWidth: 28, textAlign: 'right' }}>
                          {item.status === 'error' ? 'Err' : (item.status === 'done' ? 'Done' : `${item.progress}%`)}
                        </span>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </AnimatePresence>

        </div>

        {/* RIGHT COLUMN: Smart Folders Grid + File Table List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          
          {/* Virtual Smart Folders Section */}
          {!selectedFolder && (
            <div>
              <h2 style={{ fontSize: '15px', fontWeight: 650, margin: '0 0 12px', color: '#f1f5f9' }}>
                Your Tidied Up folders
              </h2>
              
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                gap: '14px',
                width: '100%'
              }}>
                {folderList.map(folder => (
                  <div
                    key={folder.name}
                    onClick={() => setSelectedFolder(folder.name)}
                    style={{
                      background: 'rgba(30, 41, 59, 0.3)',
                      border: '1px solid #334155',
                      borderRadius: 'var(--radius-lg, 12px)',
                      padding: '16px',
                      cursor: 'pointer',
                      transition: 'border 0.2s, transform 0.2s, background-color 0.2s'
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.borderColor = '#6366f1';
                      e.currentTarget.style.transform = 'translateY(-1px)';
                      e.currentTarget.style.backgroundColor = 'rgba(30, 41, 59, 0.5)';
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.borderColor = '#334155';
                      e.currentTarget.style.transform = 'none';
                      e.currentTarget.style.backgroundColor = 'rgba(30, 41, 59, 0.3)';
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                      <div style={{
                        width: 38, height: 38,
                        borderRadius: 'var(--radius-md, 8px)',
                        background: 'rgba(249, 115, 22, 0.1)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: '#f97316'
                      }}>
                        <Folder size={18} />
                      </div>
                      <span style={{
                        fontSize: '11px',
                        fontWeight: 600,
                        color: '#f97316',
                        background: 'rgba(249, 115, 22, 0.08)',
                        padding: '2px 8px',
                        borderRadius: 'var(--radius-sm, 6px)',
                        marginLeft: 'auto'
                      }}>
                        {formatBytes(folder.size)}
                      </span>
                    </div>

                    <h3 style={{
                      fontSize: '13.5px',
                      fontWeight: 650,
                      color: '#f1f5f9',
                      margin: '0 0 6px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}>
                      {folder.name}
                    </h3>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#64748b' }}>
                      <span>{folder.count} files</span>
                      <span>By {folder.organizedBy}</span>
                    </div>
                  </div>
                ))}
                
                {folderList.length === 0 && (
                  <div style={{
                    gridColumn: '1 / -1',
                    padding: '28px',
                    textAlign: 'center',
                    border: '1px dashed #334155',
                    borderRadius: '12px',
                    color: '#64748b',
                    fontSize: '13px'
                  }}>
                    No folders populated yet. Upload files to generate smart folders!
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Files List Panel */}
          <div style={{
            background: 'rgba(30, 41, 59, 0.25)',
            border: '1px solid #1e293b',
            borderRadius: 'var(--radius-xl, 16px)',
            padding: '18px',
            display: 'flex',
            flexDirection: 'column',
            gap: 14
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
              <h2 style={{ fontSize: '14.5px', fontWeight: 650, margin: 0, color: '#f1f5f9' }}>
                Files in {selectedFolder ? `"${selectedFolder}"` : 'Global Cloud Storage'} ({filteredFiles.length})
              </h2>
              
              {/* Search Bar */}
              <div style={{ position: 'relative', minWidth: 200, marginLeft: 'auto' }}>
                <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
                <input
                  type="text"
                  placeholder="Search file name..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  style={{
                    padding: '6px 10px 6px 28px',
                    background: '#0f172a',
                    border: '1px solid #334155',
                    borderRadius: 'var(--radius-pill, 9999px)',
                    color: 'white',
                    fontSize: '12.5px',
                    outline: 'none',
                    width: '100%'
                  }}
                />
              </div>
            </div>

            {/* File List Grid Table */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {filteredFiles.map(file => {
                const extDetails = getExtensionDetails(file.filename, file.mime_type);
                return (
                  <div
                    key={file.id}
                    style={{
                      background: 'rgba(30, 41, 59, 0.4)',
                      border: '1px solid #1e293b',
                      borderRadius: 'var(--radius-lg, 12px)',
                      padding: '12px 16px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 14,
                      transition: 'border-color 0.15s'
                    }}
                    onMouseEnter={e => e.currentTarget.style.borderColor = '#334155'}
                    onMouseLeave={e => e.currentTarget.style.borderColor = '#1e293b'}
                  >
                    {/* Visual coloured Extension Box */}
                    <div style={{
                      width: 44, height: 44,
                      borderRadius: 'var(--radius-md, 8px)',
                      background: extDetails.bg,
                      color: extDetails.color,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '11px',
                      fontWeight: 750,
                      textTransform: 'uppercase',
                      flexShrink: 0
                    }}>
                      {extDetails.label}
                    </div>

                    {/* Metadata detail block */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                        <span style={{
                          fontSize: '13px',
                          fontWeight: 600,
                          color: '#f8fafc',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          display: 'inline-block'
                        }}>
                          {file.filename}
                        </span>
                        
                        {/* Status pills */}
                        {file.status === 'processing' && (
                          <span style={{
                            fontSize: '9.5px', color: '#f59e0b', background: 'rgba(245, 158, 11, 0.08)',
                            padding: '1px 5px', borderRadius: 4, display: 'flex', alignItems: 'center', gap: 3
                          }}>
                            <Loader size={8} className="animate-spin" /> Processing
                          </span>
                        )}
                        {file.extraction_status === 'success' && (
                          <span style={{
                            fontSize: '9.5px', color: '#10b981', background: 'rgba(16, 185, 129, 0.08)',
                            padding: '1px 5px', borderRadius: 4, display: 'flex', alignItems: 'center', gap: 3
                          }}>
                            <CheckCircle size={8} /> parsed
                          </span>
                        )}
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '11px', color: '#64748b' }}>
                        <span>{formatBytes(file.size_bytes)}</span>
                        <span>•</span>
                        <span style={{ color: '#94a3b8' }}>Folder: {file.folder_name || 'Root'}</span>
                        {file.token_count !== null && (
                          <>
                            <span>•</span>
                            <span style={{ color: '#8b5cf6' }}>Tokens: {file.token_count.toLocaleString()}</span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Right side Actions (Download & Delete) */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                      <a
                        href={`${process.env.NEXT_PUBLIC_API_URL || ''}${file.url}`}
                        download={file.filename}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          width: 32, height: 32,
                          borderRadius: '50%',
                          background: '#1e293b',
                          color: '#cbd5e1',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          cursor: 'pointer',
                          transition: 'background 0.15s, color 0.15s',
                          border: '1px solid #334155'
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = '#334155'; e.currentTarget.style.color = '#fff'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = '#1e293b'; e.currentTarget.style.color = '#cbd5e1'; }}
                        title="Download file"
                      >
                        <ArrowRight size={13} style={{ transform: 'rotate(90deg)' }} />
                      </a>
                      
                      <button
                        onClick={() => {
                          if (confirm(`Are you sure you want to delete "${file.filename}"? This will detach it from all active chats.`)) {
                            deleteFile(file.id);
                          }
                        }}
                        style={{
                          width: 32, height: 32,
                          borderRadius: '50%',
                          background: '#1e293b',
                          color: '#ef4444',
                          border: '1px solid #334155',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          cursor: 'pointer',
                          transition: 'background 0.15s, color 0.15s'
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239, 68, 68, 0.15)'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = '#1e293b'; }}
                        title="Delete file"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                );
              })}

              {filteredFiles.length === 0 && (
                <div style={{
                  padding: '36px',
                  textAlign: 'center',
                  color: '#64748b',
                  fontSize: '13px',
                  border: '1.5px dashed #1e293b',
                  borderRadius: '12px'
                }}>
                  {searchQuery ? 'No files match your search filter.' : 'This folder contains no files yet.'}
                </div>
              )}
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
