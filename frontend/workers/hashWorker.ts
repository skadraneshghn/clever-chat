// Next.js Web Worker to calculate SHA-256 file hashes off-thread.

self.addEventListener('message', async (e) => {
  const { file } = e.data;
  if (!file) return;

  try {
    // Read file array buffer
    const arrayBuffer = await file.arrayBuffer();
    
    // Compute SHA-256 hash using native Web Crypto API
    const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
    
    // Convert buffer to hex string
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    
    self.postMessage({ success: true, hash: hashHex, fileName: file.name });
  } catch (err: any) {
    self.postMessage({ success: false, error: err.message || 'Hashing failed', fileName: file.name });
  }
});
