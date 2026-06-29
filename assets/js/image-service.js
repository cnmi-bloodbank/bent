(function () {
  'use strict';

  const MAX_INPUT_BYTES = 10 * 1024 * 1024;
  const TARGET_BYTES = 500 * 1024;
  const MAX_EDGE = 1600;
  const JPEG_QUALITY = 0.84;
  const THUMBNAIL_EDGE = 180;
  const THUMBNAIL_TARGET_BYTES = 24 * 1024;
  const THUMBNAIL_MAX_BYTES = 48 * 1024;
  const THUMBNAIL_QUALITY = 0.68;
  const ALLOWED = ['image/jpeg', 'image/png', 'image/webp'];

  function readAsDataURL(fileOrBlob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('อ่านไฟล์รูปไม่สำเร็จ'));
      reader.readAsDataURL(fileOrBlob);
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

  function drawToCanvas(img, width, height) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('อุปกรณ์นี้ไม่รองรับการบีบอัดรูป');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);
    return canvas;
  }

  function drawSquareThumbnail(img, edge) {
    const canvas = document.createElement('canvas');
    canvas.width = edge;
    canvas.height = edge;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('อุปกรณ์นี้ไม่รองรับการสร้างรูปตัวอย่าง');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, edge, edge);

    const sourceWidth = img.naturalWidth || img.width;
    const sourceHeight = img.naturalHeight || img.height;
    const sourceEdge = Math.min(sourceWidth, sourceHeight);
    const sourceX = Math.max(0, Math.round((sourceWidth - sourceEdge) / 2));
    const sourceY = Math.max(0, Math.round((sourceHeight - sourceEdge) / 2));
    ctx.drawImage(img, sourceX, sourceY, sourceEdge, sourceEdge, 0, 0, edge, edge);
    return canvas;
  }

  async function createEmbeddedThumbnail(img) {
    let edge = THUMBNAIL_EDGE;
    let quality = THUMBNAIL_QUALITY;
    let canvas = drawSquareThumbnail(img, edge);
    let blob = await canvasToBlob(canvas, 'image/jpeg', quality);

    for (let attempt = 0; blob.size > THUMBNAIL_TARGET_BYTES && attempt < 4; attempt += 1) {
      if (quality > 0.48) {
        quality = Math.max(0.48, quality - 0.08);
      } else {
        edge = Math.max(120, Math.round(edge * 0.86));
        canvas = drawSquareThumbnail(img, edge);
      }
      blob = await canvasToBlob(canvas, 'image/jpeg', quality);
    }

    if (!blob.size || blob.size > THUMBNAIL_MAX_BYTES) {
      throw new Error('สร้างรูปตัวอย่างขนาดเล็กไม่สำเร็จ');
    }
    const dataUrl = await readAsDataURL(blob);
    return {
      base64: String(dataUrl).split(',')[1],
      dataUrl,
      mimeType: 'image/jpeg',
      size: blob.size,
      width: edge,
      height: edge
    };
  }

  async function createThumbnailFromDataUrl(dataUrl) {
    const value = String(dataUrl || '').trim();
    if (!/^data:image\/(jpeg|png|webp);base64,/i.test(value)) {
      throw new Error('ข้อมูลรูปภาพไม่ถูกต้อง');
    }
    const img = await loadImage(value);
    return createEmbeddedThumbnail(img);
  }

  function parseExifDateString(value) {
    const match = String(value || '').trim().match(/^(\d{4}):(\d{2}):(\d{2})\s+(\d{2}):(\d{2}):(\d{2})/);
    if (!match) return null;
    const date = new Date(
      Number(match[1]), Number(match[2]) - 1, Number(match[3]),
      Number(match[4]), Number(match[5]), Number(match[6])
    );
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  function readAscii(view, offset, count) {
    let text = '';
    for (let i = 0; i < count; i += 1) {
      const code = view.getUint8(offset + i);
      if (!code) break;
      text += String.fromCharCode(code);
    }
    return text;
  }

  function readExifDateFromJpeg(buffer) {
    try {
      const view = new DataView(buffer);
      if (view.byteLength < 12 || view.getUint16(0, false) !== 0xffd8) return null;
      let offset = 2;
      while (offset + 4 < view.byteLength) {
        if (view.getUint8(offset) !== 0xff) break;
        const marker = view.getUint8(offset + 1);
        if (marker === 0xda || marker === 0xd9) break;
        const segmentLength = view.getUint16(offset + 2, false);
        if (segmentLength < 2 || offset + 2 + segmentLength > view.byteLength) break;
        if (marker === 0xe1 && segmentLength >= 8 && readAscii(view, offset + 4, 6) === 'Exif') {
          const tiff = offset + 10;
          const order = view.getUint16(tiff, false);
          const little = order === 0x4949;
          if (!little && order !== 0x4d4d) return null;
          if (view.getUint16(tiff + 2, little) !== 0x002a) return null;

          const readIfd = (ifdOffset, wantedTags) => {
            const start = tiff + ifdOffset;
            if (start + 2 > view.byteLength) return {};
            const entries = view.getUint16(start, little);
            const result = {};
            for (let i = 0; i < entries; i += 1) {
              const entry = start + 2 + (i * 12);
              if (entry + 12 > view.byteLength) break;
              const tag = view.getUint16(entry, little);
              if (!wantedTags.includes(tag)) continue;
              const type = view.getUint16(entry + 2, little);
              const count = view.getUint32(entry + 4, little);
              const valueOrOffset = view.getUint32(entry + 8, little);
              if (type === 2 && count > 0) {
                const dataOffset = count <= 4 ? entry + 8 : tiff + valueOrOffset;
                if (dataOffset + count <= view.byteLength) result[tag] = readAscii(view, dataOffset, count);
              } else if (type === 4 && count === 1) {
                result[tag] = valueOrOffset;
              }
            }
            return result;
          };

          const ifd0Offset = view.getUint32(tiff + 4, little);
          const ifd0 = readIfd(ifd0Offset, [0x0132, 0x8769]);
          if (ifd0[0x8769]) {
            const exifIfd = readIfd(ifd0[0x8769], [0x9003, 0x9004]);
            const exifDate = parseExifDateString(exifIfd[0x9003] || exifIfd[0x9004]);
            if (exifDate) return exifDate;
          }
          return parseExifDateString(ifd0[0x0132]);
        }
        offset += 2 + segmentLength;
      }
    } catch (_) {
      return null;
    }
    return null;
  }

  async function getPhotoDate(file) {
    if (file.type === 'image/jpeg' && typeof file.arrayBuffer === 'function') {
      const exifDate = readExifDateFromJpeg(await file.arrayBuffer());
      if (exifDate) return { value: exifDate, source: 'exif' };
    }
    if (file.lastModified) {
      const modified = new Date(file.lastModified);
      if (!Number.isNaN(modified.getTime())) return { value: modified.toISOString(), source: 'file_modified' };
    }
    return { value: null, source: 'unknown' };
  }

  async function compressImage(file) {
    if (!file) return null;
    if (!ALLOWED.includes(file.type)) throw new Error('รองรับเฉพาะ JPG, PNG และ WebP');
    if (file.size > MAX_INPUT_BYTES) throw new Error('ไฟล์ต้นฉบับต้องไม่เกิน 10 MB');

    const [input, photoDate] = await Promise.all([readAsDataURL(file), getPhotoDate(file)]);
    const img = await loadImage(input);
    const initialRatio = Math.min(1, MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
    let width = Math.max(1, Math.round(img.naturalWidth * initialRatio));
    let height = Math.max(1, Math.round(img.naturalHeight * initialRatio));
    let canvas = drawToCanvas(img, width, height);
    let blob = await canvasToBlob(canvas, 'image/jpeg', JPEG_QUALITY);

    // Keep JPEG quality at 84%; reduce dimensions instead when the file is still too large.
    for (let attempt = 0; blob.size > TARGET_BYTES && attempt < 6; attempt += 1) {
      const estimatedRatio = Math.sqrt(TARGET_BYTES / blob.size) * 0.97;
      const shrink = Math.min(0.92, Math.max(0.68, estimatedRatio));
      width = Math.max(1, Math.round(width * shrink));
      height = Math.max(1, Math.round(height * shrink));
      canvas = drawToCanvas(img, width, height);
      blob = await canvasToBlob(canvas, 'image/jpeg', JPEG_QUALITY);
      if (Math.max(width, height) <= 720) break;
    }

    if (blob.size > 1024 * 1024) throw new Error('รูปยังใหญ่เกิน 1 MB กรุณาครอบตัดรูปให้เล็กลง');
    const [base64Url, thumbnail] = await Promise.all([
      readAsDataURL(blob),
      createEmbeddedThumbnail(img)
    ]);
    const base64 = String(base64Url).split(',')[1];
    return {
      blob,
      previewUrl: URL.createObjectURL(blob),
      base64,
      mimeType: 'image/jpeg',
      fileName: `${String(file.name || 'bent-image').replace(/\.[^.]+$/, '')}.jpg`,
      size: blob.size,
      originalSize: file.size,
      width,
      height,
      photoTakenAt: photoDate.value,
      photoDateSource: photoDate.source,
      thumbnailBase64: thumbnail.base64,
      thumbnailDataUrl: thumbnail.dataUrl,
      thumbnailMimeType: thumbnail.mimeType,
      thumbnailSize: thumbnail.size,
      thumbnailWidth: thumbnail.width,
      thumbnailHeight: thumbnail.height
    };
  }

  function gatewayUrl() {
    const config = window.BENT_CONFIG || {};
    if (!config.APPS_SCRIPT_WEB_APP_URL || config.APPS_SCRIPT_WEB_APP_URL.includes('YOUR_DEPLOYMENT_ID')) {
      throw new Error('ยังไม่ได้ตั้งค่า Apps Script Web App URL');
    }
    return config.APPS_SCRIPT_WEB_APP_URL;
  }

  async function callAppsScript(payload) {
    const response = await fetch(gatewayUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
      redirect: 'follow'
    });
    if (!response.ok) throw new Error(`BENT gateway HTTP ${response.status}`);
    const data = await response.json();
    if (!data.ok) throw new Error(data.error || 'BENT gateway failed');
    return data;
  }

  async function callAppsScriptWithUploadProgress(payload, onProgress) {
    // Apps Script is cross-origin. Byte-level XHR upload events would trigger an OPTIONS
    // preflight that Apps Script Web Apps do not reliably support, so use staged progress.
    let progress = 3;
    if (onProgress) onProgress(progress);
    const timer = window.setInterval(() => {
      if (!onProgress || progress >= 92) return;
      progress += progress < 55 ? 7 : (progress < 78 ? 4 : 2);
      onProgress(Math.min(92, progress));
    }, 350);
    try {
      const response = await fetch(gatewayUrl(), {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload),
        redirect: 'follow'
      });
      if (onProgress) onProgress(96);
      if (!response.ok) throw new Error(`BENT gateway HTTP ${response.status}`);
      const data = await response.json();
      if (!data.ok) throw new Error(data.error || 'BENT gateway failed');
      if (onProgress) onProgress(100);
      return data;
    } finally {
      window.clearInterval(timer);
    }
  }

  async function upload({ accessToken, announcementId, compressed, onProgress }) {
    return callAppsScriptWithUploadProgress({
      action: 'upload', access_token: accessToken, announcement_id: announcementId,
      file_name: compressed.fileName, mime_type: compressed.mimeType,
      size: compressed.size, base64_data: compressed.base64,
      photo_taken_at: compressed.photoTakenAt,
      photo_date_source: compressed.photoDateSource,
      thumbnail_base64_data: compressed.thumbnailBase64,
      thumbnail_mime_type: compressed.thumbnailMimeType,
      thumbnail_size: compressed.thumbnailSize,
      thumbnail_width: compressed.thumbnailWidth,
      thumbnail_height: compressed.thumbnailHeight
    }, onProgress);
  }

  async function read({ accessToken, announcementId, variant = 'full' }) {
    return callAppsScript({
      action: 'read',
      access_token: accessToken,
      announcement_id: announcementId,
      variant: variant === 'thumbnail' ? 'thumbnail' : 'full'
    });
  }

  async function readThumbnails({ accessToken, announcementIds }) {
    const ids = Array.from(new Set((announcementIds || []).filter(Boolean))).slice(0, 8);
    if (!ids.length) return { ok: true, thumbnails: [] };
    return callAppsScript({
      action: 'read_thumbnails',
      access_token: accessToken,
      announcement_ids: ids
    });
  }

  async function saveThumbnail({ accessToken, announcementId, thumbnail }) {
    if (!thumbnail?.base64 || !thumbnail?.dataUrl) throw new Error('ไม่พบรูปตัวอย่าง');
    return callAppsScript({
      action: 'save_thumbnail',
      access_token: accessToken,
      announcement_id: announcementId,
      thumbnail_base64_data: thumbnail.base64,
      thumbnail_mime_type: thumbnail.mimeType,
      thumbnail_size: thumbnail.size,
      thumbnail_width: thumbnail.width,
      thumbnail_height: thumbnail.height
    });
  }

  async function remove({ accessToken, announcementId }) {
    return callAppsScript({ action: 'delete', access_token: accessToken, announcement_id: announcementId });
  }

  window.BENT_IMAGE = {
    compressImage,
    createThumbnailFromDataUrl,
    upload,
    read,
    readThumbnails,
    saveThumbnail,
    remove,
    call: callAppsScript,
    allowedTypes: ALLOWED
  };
})();
