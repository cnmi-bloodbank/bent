(function () {
  'use strict';

  const MAX_INPUT_BYTES = 10 * 1024 * 1024;
  const TARGET_BYTES = 500 * 1024;
  const MAX_EDGE = 1600;
  const ALLOWED = ['image/jpeg', 'image/png', 'image/webp'];

  function readAsDataURL(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('อ่านไฟล์รูปไม่สำเร็จ'));
      reader.readAsDataURL(file);
    });
  }

  function loadImage(dataUrl) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('เปิดรูปไม่สำเร็จ'));
      img.src = dataUrl;
    });
  }

  function canvasToBlob(canvas, type, quality) {
    return new Promise((resolve, reject) => {
      canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('บีบอัดรูปไม่สำเร็จ')), type, quality);
    });
  }

  async function compressImage(file) {
    if (!file) return null;
    if (!ALLOWED.includes(file.type)) throw new Error('รองรับเฉพาะ JPG, PNG และ WebP');
    if (file.size > MAX_INPUT_BYTES) throw new Error('ไฟล์ต้นฉบับต้องไม่เกิน 10 MB');

    const input = await readAsDataURL(file);
    const img = await loadImage(input);
    const ratio = Math.min(1, MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
    const width = Math.max(1, Math.round(img.naturalWidth * ratio));
    const height = Math.max(1, Math.round(img.naturalHeight * ratio));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { alpha: false });
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);

    // Re-encoding through canvas removes common EXIF/GPS metadata.
    const outputType = 'image/jpeg';
    let quality = 0.86;
    let blob = await canvasToBlob(canvas, outputType, quality);
    while (blob.size > TARGET_BYTES && quality > 0.46) {
      quality -= 0.08;
      blob = await canvasToBlob(canvas, outputType, quality);
    }

    if (blob.size > 1024 * 1024) throw new Error('รูปยังใหญ่เกิน 1 MB กรุณาครอบตัดรูปให้เล็กลง');
    const base64Url = await readAsDataURL(blob);
    const base64 = String(base64Url).split(',')[1];
    return {
      blob,
      previewUrl: URL.createObjectURL(blob),
      base64,
      mimeType: outputType,
      fileName: `${String(file.name || 'bent-image').replace(/\.[^.]+$/, '')}.jpg`,
      size: blob.size,
      width,
      height
    };
  }

  async function callAppsScript(payload) {
    const config = window.BENT_CONFIG || {};
    if (!config.APPS_SCRIPT_WEB_APP_URL || config.APPS_SCRIPT_WEB_APP_URL.includes('YOUR_DEPLOYMENT_ID')) {
      throw new Error('ยังไม่ได้ตั้งค่า Apps Script Web App URL');
    }
    const response = await fetch(config.APPS_SCRIPT_WEB_APP_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
      redirect: 'follow'
    });
    if (!response.ok) throw new Error(`Image service HTTP ${response.status}`);
    const data = await response.json();
    if (!data.ok) throw new Error(data.error || 'Image service failed');
    return data;
  }

  async function upload({ accessToken, announcementId, compressed }) {
    return callAppsScript({
      action: 'upload', access_token: accessToken, announcement_id: announcementId,
      file_name: compressed.fileName, mime_type: compressed.mimeType,
      size: compressed.size, base64_data: compressed.base64
    });
  }

  async function read({ accessToken, announcementId }) {
    return callAppsScript({ action: 'read', access_token: accessToken, announcement_id: announcementId });
  }

  async function remove({ accessToken, announcementId }) {
    return callAppsScript({ action: 'delete', access_token: accessToken, announcement_id: announcementId });
  }

  window.BENT_IMAGE = { compressImage, upload, read, remove, allowedTypes: ALLOWED };
})();
