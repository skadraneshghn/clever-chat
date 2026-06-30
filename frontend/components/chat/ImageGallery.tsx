/*
  ═══════════════════════════════════════════════════════════════════════════
  ImageGallery — Full-screen immersive image gallery modal
  ═══════════════════════════════════════════════════════════════════════════ */

'use client';

import { useEffect, useCallback, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, ChevronLeft, ChevronRight, Download, ZoomIn } from 'lucide-react';

export interface GalleryImage {
  url: string;
  thumbnailUrl?: string;
  assetId?: string;
}

interface ImageGalleryProps {
  images: GalleryImage[];
  initialIndex?: number;
  onClose: () => void;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '';

export function ImageGallery({ images, initialIndex = 0, onClose }: ImageGalleryProps) {
  const [current, setCurrent] = useState(initialIndex);
  const [isZoomed, setIsZoomed] = useState(false);

  const prev = useCallback(() => {
    setIsZoomed(false);
    setCurrent((i) => (i - 1 + images.length) % images.length);
  }, [images.length]);

  const next = useCallback(() => {
    setIsZoomed(false);
    setCurrent((i) => (i + 1) % images.length);
  }, [images.length]);

  // Keyboard navigation
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft' && images.length > 1) prev();
      if (e.key === 'ArrowRight' && images.length > 1) next();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose, prev, next, images.length]);

  // Lock body scroll while open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  const currentImg = images[current];

  const handleDownload = async () => {
    try {
      // Derive the full URL
      const fullUrl = currentImg.url.startsWith('http')
        ? currentImg.url
        : `${API_BASE}${currentImg.url}`;

      const response = await fetch(fullUrl);
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = currentImg.assetId ? `image-${currentImg.assetId}.png` : 'generated-image.png';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    } catch {
      // Fallback: open in new tab
      window.open(
        currentImg.url.startsWith('http') ? currentImg.url : `${API_BASE}${currentImg.url}`,
        '_blank'
      );
    }
  };

  const imgSrc = currentImg.url.startsWith('http')
    ? currentImg.url
    : `${API_BASE}${currentImg.url}`;

  return (
    <AnimatePresence>
      <motion.div
        key="gallery-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 9999,
          background: 'rgba(0, 0, 0, 0.92)',
          backdropFilter: 'blur(16px)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {/* Prevent clicks on inner content from closing */}
        <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>

          {/* Top bar */}
          <div style={{
            position: 'absolute',
            top: 0, left: 0, right: 0,
            height: 64,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 24px',
            background: 'linear-gradient(to bottom, rgba(0,0,0,0.7), transparent)',
            zIndex: 10,
          }}>
            {/* Image counter */}
            <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, fontWeight: 500 }}>
              {images.length > 1 ? `${current + 1} / ${images.length}` : ''}
            </span>

            {/* Right actions */}
            <div style={{ display: 'flex', gap: 10 }}>
              {/* Zoom toggle */}
              <button
                onClick={() => setIsZoomed(!isZoomed)}
                style={buttonStyle}
                title={isZoomed ? 'Reset zoom' : 'Zoom'}
              >
                <ZoomIn size={17} />
              </button>

              {/* Download */}
              <button
                onClick={handleDownload}
                style={buttonStyle}
                title="Download full size"
              >
                <Download size={17} />
              </button>

              {/* Close */}
              <button
                onClick={onClose}
                style={{ ...buttonStyle, background: 'rgba(255,255,255,0.08)' }}
                title="Close (Esc)"
              >
                <X size={17} />
              </button>
            </div>
          </div>

          {/* Main image */}
          <motion.div
            key={current}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            style={{
              cursor: isZoomed ? 'zoom-out' : 'zoom-in',
              maxWidth: isZoomed ? '98vw' : '88vw',
              maxHeight: isZoomed ? '92vh' : '80vh',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            onClick={() => setIsZoomed(!isZoomed)}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imgSrc}
              alt={`Generated image ${current + 1}`}
              style={{
                maxWidth: '100%',
                maxHeight: isZoomed ? '92vh' : '80vh',
                borderRadius: isZoomed ? 4 : 16,
                boxShadow: '0 40px 120px rgba(0,0,0,0.8)',
                objectFit: 'contain',
                transition: 'border-radius 0.2s, max-height 0.3s',
                userSelect: 'none',
              }}
            />
          </motion.div>

          {/* Navigation arrows */}
          {images.length > 1 && (
            <>
              <button
                onClick={prev}
                style={{
                  ...navButtonStyle,
                  left: 24,
                }}
                aria-label="Previous image"
              >
                <ChevronLeft size={22} />
              </button>
              <button
                onClick={next}
                style={{
                  ...navButtonStyle,
                  right: 24,
                }}
                aria-label="Next image"
              >
                <ChevronRight size={22} />
              </button>
            </>
          )}

          {/* Bottom dot indicators */}
          {images.length > 1 && (
            <div style={{
              position: 'absolute',
              bottom: 24,
              display: 'flex',
              gap: 8,
              alignItems: 'center',
            }}>
              {images.map((_, i) => (
                <button
                  key={i}
                  onClick={() => { setIsZoomed(false); setCurrent(i); }}
                  style={{
                    width: i === current ? 24 : 8,
                    height: 8,
                    borderRadius: 4,
                    background: i === current ? '#8b5cf6' : 'rgba(255,255,255,0.3)',
                    border: 'none',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    padding: 0,
                  }}
                  aria-label={`Go to image ${i + 1}`}
                />
              ))}
            </div>
          )}

          {/* Bottom thumbnail strip for multi-image */}
          {images.length > 1 && (
            <div style={{
              position: 'absolute',
              bottom: images.length > 1 ? 52 : 24,
              display: 'flex',
              gap: 8,
              padding: '0 16px',
              maxWidth: '100vw',
              overflowX: 'auto',
            }}>
              {images.map((img, i) => {
                const thumbSrc = (img.thumbnailUrl || img.url).startsWith('http')
                  ? (img.thumbnailUrl || img.url)
                  : `${API_BASE}${img.thumbnailUrl || img.url}`;
                return (
                  <div
                    key={i}
                    onClick={() => { setIsZoomed(false); setCurrent(i); }}
                    style={{
                      width: 52, height: 52,
                      borderRadius: 8,
                      overflow: 'hidden',
                      cursor: 'pointer',
                      border: i === current ? '2px solid #8b5cf6' : '2px solid transparent',
                      opacity: i === current ? 1 : 0.55,
                      transition: 'all 0.18s',
                      flexShrink: 0,
                    }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={thumbSrc}
                      alt={`Thumbnail ${i + 1}`}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

// ── Style constants ──────────────────────────────────────────────────────────

const buttonStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 38, height: 38,
  borderRadius: '50%',
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.12)',
  color: 'rgba(255,255,255,0.85)',
  cursor: 'pointer',
  transition: 'background 0.15s, transform 0.1s',
};

const navButtonStyle: React.CSSProperties = {
  position: 'absolute',
  top: '50%',
  transform: 'translateY(-50%)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 48, height: 48,
  borderRadius: '50%',
  background: 'rgba(255,255,255,0.08)',
  border: '1px solid rgba(255,255,255,0.15)',
  color: 'white',
  cursor: 'pointer',
  backdropFilter: 'blur(8px)',
  zIndex: 10,
  transition: 'background 0.15s, transform 0.1s',
};
