/* Persistent YouTube thumbnail + metadata archive.
 * Stores a 120x68 JPEG Blob in the existing yph_metadata_db_v2 IndexedDB.
 * Records are never pruned by the extension's 30-day metadata cleanup.
 */
const THUMBNAIL_ARCHIVE_DB = "yph_metadata_db_v2";
const THUMBNAIL_ARCHIVE_STORE = "metadata";
const THUMBNAIL_ARCHIVE_PREFIX = "yph:thumb:";
const METADATA_PREFIX = "yph:meta:";
const THUMBNAIL_WIDTH = 120;
const THUMBNAIL_HEIGHT = 68;
const THUMBNAIL_MAX_BYTES = 5 * 1024;
const THUMBNAIL_MIN_QUALITY = 0.20;
// default.jpg is 120x90: 120x68 of real 16:9 picture + 11px black bars top and bottom.
// resizeAndCompress() crops exactly those bars, so the smallest file already has
// the final resolution. mqdefault.jpg (320x180, 16:9) is only a fallback.
// default.jpg stays first (smallest, already the final size). The later variants are
// fallbacks for videos where YouTube serves only some sizes (e.g. age-restricted ones).
const THUMBNAIL_SOURCE_URLS = (id) => [
  `https://i.ytimg.com/vi/${id}/default.jpg`,
  `https://i.ytimg.com/vi/${id}/mqdefault.jpg`,
  `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
  `https://i.ytimg.com/vi/${id}/0.jpg`,
  `https://i.ytimg.com/vi/${id}/sddefault.jpg`,
  `https://i.ytimg.com/vi_webp/${id}/mqdefault.webp`,
  `https://i.ytimg.com/vi_webp/${id}/hqdefault.webp`,
];

let archiveDbPromise = null;
const objectUrls = new Map();

function openArchiveDb() {
  if (archiveDbPromise) return archiveDbPromise;
  archiveDbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(THUMBNAIL_ARCHIVE_DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(THUMBNAIL_ARCHIVE_STORE)) {
        db.createObjectStore(THUMBNAIL_ARCHIVE_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return archiveDbPromise;
}

function key(videoId) {
  return THUMBNAIL_ARCHIVE_PREFIX + videoId;
}
function metadataKey(videoId) {
  return METADATA_PREFIX + videoId;
}

async function getArchiveRecord(videoId) {
  if (!videoId || typeof indexedDB === "undefined") return null;
  try {
    const db = await openArchiveDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(THUMBNAIL_ARCHIVE_STORE, "readonly");
      const req = tx.objectStore(THUMBNAIL_ARCHIVE_STORE).get(key(videoId));
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    console.warn("[THUMB-ARCHIVE] Read failed:", e);
    return null;
  }
}

async function putArchiveRecord(videoId, record) {
  const db = await openArchiveDb();
  return await new Promise((resolve, reject) => {
    const tx = db.transaction(THUMBNAIL_ARCHIVE_STORE, "readwrite");
    tx.objectStore(THUMBNAIL_ARCHIVE_STORE).put(record, key(videoId));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error("IndexedDB transaction aborted"));
  });
}

async function putMetadataMirror(videoId, metadata = {}) {
  if (!videoId || typeof indexedDB === "undefined") return;
  // Never wipe metadata that is already cached: empty incoming fields keep the existing values.
  let existing = null;
  try {
    const rdb = await openArchiveDb();
    existing = await new Promise((resolve, reject) => {
      const rtx = rdb.transaction(THUMBNAIL_ARCHIVE_STORE, "readonly");
      const req = rtx.objectStore(THUMBNAIL_ARCHIVE_STORE).get(metadataKey(videoId));
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    existing = null;
  }
  const flag = (name) => (metadata[name] !== undefined ? !!metadata[name] : !!(existing && existing[name]));
  const record = {
    ...(existing || {}),
    videoId,
    title: metadata.title && !isPlaceholderTitle(metadata.title) ? metadata.title : (existing?.title && !isPlaceholderTitle(existing.title) ? existing.title : metadata.title || existing?.title || ""),
    channel: metadata.channel || existing?.channel || "",
    durationISO: metadata.durationISO || existing?.durationISO || "",
    durationSeconds: Number(metadata.durationSeconds || existing?.durationSeconds || 0),
    isPrivate: flag("isPrivate"),
    isDeleted: flag("isDeleted"),
    isBroken: flag("isBroken"),
    isLive: flag("isLive"),
    lastCachedAt: Date.now(),
    lastFetchAttempt: metadata.lastFetchAttempt || Date.now(),
  };
  const db = await openArchiveDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(THUMBNAIL_ARCHIVE_STORE, "readwrite");
    tx.objectStore(THUMBNAIL_ARCHIVE_STORE).put(record, metadataKey(videoId));
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error("Metadata transaction aborted"));
  });
}

async function canvasToBlob(canvas, quality) {
  // OffscreenCanvas (background service worker) has convertToBlob() instead of toBlob().
  if (typeof canvas.convertToBlob === "function") {
    return await canvas.convertToBlob({ type: "image/jpeg", quality });
  }
  return await new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Canvas JPEG encoding failed")), "image/jpeg", quality);
  });
}

// The Chrome background is a service worker: no `document`, so use OffscreenCanvas there.
function createThumbnailCanvas() {
  if (typeof document !== "undefined" && typeof document.createElement === "function") {
    const canvas = document.createElement("canvas");
    canvas.width = THUMBNAIL_WIDTH;
    canvas.height = THUMBNAIL_HEIGHT;
    return canvas;
  }
  if (typeof OffscreenCanvas !== "undefined") {
    return new OffscreenCanvas(THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT);
  }
  throw new Error("No canvas implementation available");
}

async function resizeAndCompress(blob) {
  const bitmap = await createImageBitmap(blob);
  try {
    const canvas = createThumbnailCanvas();
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("Canvas 2D context unavailable");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    // YouTube's default/hq thumbnails are commonly 4:3 (120x90) with
    // 11px black bars at the top and bottom. Crop to the real 16:9-ish
    // content area before scaling, instead of scaling the black bars into
    // the archived thumbnail. For other source sizes, use the same target
    // aspect ratio and crop symmetrically from the longer dimension.
    const targetAspect = THUMBNAIL_WIDTH / THUMBNAIL_HEIGHT;
    const sourceAspect = bitmap.width / bitmap.height;
    let sx = 0;
    let sy = 0;
    let sw = bitmap.width;
    let sh = bitmap.height;
    if (sourceAspect > targetAspect) {
      sw = bitmap.height * targetAspect;
      sx = (bitmap.width - sw) / 2;
    } else if (sourceAspect < targetAspect) {
      sh = bitmap.width / targetAspect;
      sy = (bitmap.height - sh) / 2;
    }
    ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT);

    // Start at the requested 60% quality. If that exceeds 5 KiB, lower the
    // quality until the hard size limit is met. Never increase above 60%.
    let quality = 0.60;
    let best = await canvasToBlob(canvas, quality);
    if (best.size <= THUMBNAIL_MAX_BYTES) return best;

    let high = quality;
    let low = 0.01;
    const lowBlob = await canvasToBlob(canvas, low);
    if (lowBlob.size > THUMBNAIL_MAX_BYTES) return lowBlob;
    best = lowBlob;

    for (let i = 0; i < 9; i++) {
      const q = (low + high) / 2;
      const candidate = await canvasToBlob(canvas, q);
      if (candidate.size <= THUMBNAIL_MAX_BYTES) {
        best = candidate;
        low = q;
      } else {
        high = q;
      }
    }
    return best;
  } finally {
    bitmap.close();
  }
}

async function updateArchivedStatus(videoId, status = {}) {
  if (!videoId) return false;
  const existing = await getArchiveRecord(videoId);
  if (!existing) return false;
  await putArchiveRecord(videoId, {
    ...existing,
    isPrivate: !!status.isPrivate,
    isDeleted: !!status.isDeleted,
    isBroken: !!status.isBroken,
    isLive: !!status.isLive,
  });
  return true;
}

// Placeholder titles are not real titles: a real title may replace them later.
const PLACEHOLDER_TITLES = new Set(["[Film prywatny]", "[Film usunięty]", "[Film niedostępny]", "Private video", "Deleted video", "Unknown Video", "Unplayable video"]);
const isPlaceholderTitle = (t) => !t || PLACEHOLDER_TITLES.has(t);
const betterTitle = (oldT, newT) => (isPlaceholderTitle(oldT) && newT && !isPlaceholderTitle(newT) ? newT : oldT || newT || "");

async function archiveThumbnail(videoId, metadata = {}) {
  if (!videoId) return null;
  const existing = await getArchiveRecord(videoId);
  if (existing?.thumbnailBlob instanceof Blob) {
    // Preserve the first archived thumbnail permanently. Update metadata only if missing.
    const forceDuration = metadata.forceDuration === true;
    if ((isPlaceholderTitle(existing.title) && metadata.title && betterTitle(existing.title, metadata.title) !== existing.title) || (!existing.channel && metadata.channel) || forceDuration || (!existing.durationSeconds && metadata.durationSeconds) || metadata.isPrivate || metadata.isDeleted || metadata.isBroken || metadata.isLive) {
      const merged = {
        ...existing,
        title: betterTitle(existing.title, metadata.title),
        channel: existing.channel || metadata.channel || "",
        durationISO: forceDuration && metadata.durationISO ? metadata.durationISO : (existing.durationISO || metadata.durationISO || ""),
        durationSeconds: forceDuration && metadata.durationSeconds ? Number(metadata.durationSeconds) : (existing.durationSeconds || metadata.durationSeconds || 0),
        // Keep the stored status when the caller did not pass one (e.g. a channel-only update).
        isPrivate: metadata.isPrivate !== undefined ? !!metadata.isPrivate : !!existing.isPrivate,
        isDeleted: metadata.isDeleted !== undefined ? !!metadata.isDeleted : !!existing.isDeleted,
        isBroken: metadata.isBroken !== undefined ? !!metadata.isBroken : !!existing.isBroken,
        isLive: metadata.isLive !== undefined ? !!metadata.isLive : !!existing.isLive,
      };
      await putArchiveRecord(videoId, merged);
      await putMetadataMirror(videoId, merged);
    }
    await putMetadataMirror(videoId, {
      ...existing,
      title: betterTitle(existing.title, metadata.title),
      channel: existing.channel || metadata.channel || "",
      durationISO: metadata.forceDuration && metadata.durationISO ? metadata.durationISO : (existing.durationISO || metadata.durationISO || ""),
      durationSeconds: metadata.forceDuration && metadata.durationSeconds ? Number(metadata.durationSeconds) : (existing.durationSeconds || metadata.durationSeconds || 0),
      isPrivate: metadata.isPrivate ?? existing.isPrivate,
      isDeleted: metadata.isDeleted ?? existing.isDeleted,
      isBroken: metadata.isBroken ?? existing.isBroken,
      isLive: metadata.isLive ?? existing.isLive,
    });
    return existing;
  }

  const sourceUrls = THUMBNAIL_SOURCE_URLS(videoId);

  let sourceBlob = null;
  for (const url of sourceUrls) {
    try {
      const response = await fetch(url, { cache: "no-store" });
      if (response.ok) {
        const blob = await response.blob();
        if (blob.type.startsWith("image/")) {
          sourceBlob = blob;
          break;
        }
      }
    } catch (e) {
      // Try the next YouTube thumbnail variant.
    }
  }
  if (!sourceBlob) return null;

  try {
    const thumbnailBlob = await resizeAndCompress(sourceBlob);
    const record = {
      videoId,
      title: metadata.title || "",
      channel: metadata.channel || "",
      durationISO: metadata.durationISO || "",
      durationSeconds: Number(metadata.durationSeconds || 0),
      isPrivate: !!metadata.isPrivate,
      isDeleted: !!metadata.isDeleted,
      isBroken: !!metadata.isBroken,
      isLive: !!metadata.isLive,
      thumbnailBlob,
      width: THUMBNAIL_WIDTH,
      height: THUMBNAIL_HEIGHT,
      mimeType: "image/jpeg",
      size: thumbnailBlob.size,
      archivedAt: Date.now(),
    };
    await putArchiveRecord(videoId, record);
    await putMetadataMirror(videoId, {
      ...record,
      isPrivate: metadata.isPrivate,
      isDeleted: metadata.isDeleted,
      isBroken: metadata.isBroken,
      isLive: metadata.isLive,
    });
    return record;
  } catch (e) {
    console.warn("[THUMB-ARCHIVE] Failed to process thumbnail:", e);
    return null;
  }
}

async function getArchivedThumbnailUrl(videoId) {
  const record = await getArchiveRecord(videoId);
  if (!record?.thumbnailBlob) return null;
  const old = objectUrls.get(videoId);
  if (old) return old;
  const url = URL.createObjectURL(record.thumbnailBlob);
  objectUrls.set(videoId, url);
  return url;
}

async function getArchivedMetadata(videoId) {
  const record = await getArchiveRecord(videoId);
  if (!record) return null;
  return {
    videoId: record.videoId,
    title: record.title || "",
    channel: record.channel || "",
    durationISO: record.durationISO || "",
    durationSeconds: Number(record.durationSeconds || 0),
    isPrivate: !!record.isPrivate,
    isDeleted: !!record.isDeleted,
    isBroken: !!record.isBroken,
    isLive: !!record.isLive,
    thumbnailUrl: await getArchivedThumbnailUrl(videoId),
  };
}


async function pruneIfUnreferenced(videoId) {
  if (!videoId || typeof window.getPlaylists !== "function") return false;
  try {
    const playlists = await window.getPlaylists();
    const stillUsed = (Array.isArray(playlists) ? playlists : []).some(p =>
      Array.isArray(p?.videos) && p.videos.some(v => (typeof v === "string" ? v : v?.videoId) === videoId)
    );
    if (stillUsed) return false;
    const db = await openArchiveDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(THUMBNAIL_ARCHIVE_STORE, "readwrite");
      const store = tx.objectStore(THUMBNAIL_ARCHIVE_STORE);
      store.delete(key(videoId));
      store.delete(metadataKey(videoId));
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error("IndexedDB transaction aborted"));
    });
    const old = objectUrls.get(videoId);
    if (old) { try { URL.revokeObjectURL(old); } catch {} objectUrls.delete(videoId); }
    return true;
  } catch (e) { console.warn("[THUMB-ARCHIVE] Prune failed:", e); return false; }
}
async function pruneVideosIfUnreferenced(videoIds) {
  const ids=[...new Set((videoIds||[]).filter(Boolean))];
  const removed=[]; for(const id of ids) if(await pruneIfUnreferenced(id)) removed.push(id); return removed;
}
async function clearThumbnailArchive() {
  if (typeof indexedDB === "undefined") return 0;
  const db = await openArchiveDb();
  return await new Promise((resolve, reject) => {
    let count = 0;
    const tx = db.transaction(THUMBNAIL_ARCHIVE_STORE, "readwrite");
    const store = tx.objectStore(THUMBNAIL_ARCHIVE_STORE);
    const range = IDBKeyRange.bound(THUMBNAIL_ARCHIVE_PREFIX, THUMBNAIL_ARCHIVE_PREFIX + "\uffff");
    const req = store.openCursor(range);
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor) return;
      count++;
      store.delete(cursor.key);
      cursor.continue();
    };
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => {
      for (const url of objectUrls.values()) { try { URL.revokeObjectURL(url); } catch {} }
      objectUrls.clear();
      resolve(count);
    };
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error("Thumbnail archive clear aborted"));
  });
}
async function getThumbnailStats() {
  if (typeof indexedDB === "undefined") return { count: 0, bytes: 0 };
  const db = await openArchiveDb();
  return await new Promise((resolve, reject) => {
    let count = 0;
    let bytes = 0;
    const tx = db.transaction(THUMBNAIL_ARCHIVE_STORE, "readonly");
    const range = IDBKeyRange.bound(THUMBNAIL_ARCHIVE_PREFIX, THUMBNAIL_ARCHIVE_PREFIX + "\uffff");
    const req = tx.objectStore(THUMBNAIL_ARCHIVE_STORE).openCursor(range);
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor) return resolve({ count, bytes });
      const rec = cursor.value;
      if (rec?.thumbnailBlob) {
        count++;
        bytes += Number(rec.thumbnailBlob.size ?? rec.size ?? 0);
      }
      cursor.continue();
    };
    req.onerror = () => reject(req.error);
  });
}
async function getTotalCacheStats() {
  // Total size of everything kept in the local metadata cache DB
  // (video metadata records + archived thumbnails, incl. their blobs).
  if (typeof indexedDB === "undefined") return { count: 0, bytes: 0, thumbCount: 0, thumbBytes: 0 };
  const db = await openArchiveDb();
  const enc = new TextEncoder();
  return await new Promise((resolve, reject) => {
    let count = 0;
    let bytes = 0;
    let thumbCount = 0;
    let thumbBytes = 0;
    const tx = db.transaction(THUMBNAIL_ARCHIVE_STORE, "readonly");
    const req = tx.objectStore(THUMBNAIL_ARCHIVE_STORE).openCursor();
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor) return resolve({ count, bytes, thumbCount, thumbBytes });
      const rec = cursor.value;
      count++;
      const keyStr = String(cursor.key);
      bytes += enc.encode(keyStr).length;
      if (keyStr.startsWith(THUMBNAIL_ARCHIVE_PREFIX) && rec?.thumbnailBlob instanceof Blob) {
        thumbCount++;
        thumbBytes += Number(rec.thumbnailBlob.size ?? rec.size ?? 0);
      }
      if (rec && typeof rec === "object") {
        const rest = {};
        for (const k of Object.keys(rec)) {
          if (rec[k] instanceof Blob) bytes += rec[k].size;
          else rest[k] = rec[k];
        }
        try { bytes += enc.encode(JSON.stringify(rest)).length; } catch {}
      } else if (rec != null) {
        try { bytes += enc.encode(JSON.stringify(rec)).length; } catch {}
      }
      cursor.continue();
    };
    req.onerror = () => reject(req.error);
  });
}

// ---- Export / import of archived thumbnails (as base64 data URLs inside JSON) ----
const THUMB_IMPORT_MAX_CHARS = 400 * 1024;
function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(blob);
  });
}
function dataUrlToBlob(url) {
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(url);
  if (!m) return null;
  try {
    const bin = atob(m[2]);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: m[1] });
  } catch { return null; }
}
async function exportThumbnails(videoIds) {
  const out = {};
  for (const id of new Set((videoIds || []).map(v => (typeof v === "string" ? v : v?.videoId)).filter(Boolean))) {
    const rec = await getArchiveRecord(id);
    if (rec?.thumbnailBlob instanceof Blob) {
      try { out[id] = await blobToDataUrl(rec.thumbnailBlob); } catch {}
    }
  }
  return out;
}
async function exportAllThumbnails() {
  if (typeof indexedDB === "undefined") return {};
  const db = await openArchiveDb();
  const ids = await new Promise((resolve, reject) => {
    const list = [];
    const tx = db.transaction(THUMBNAIL_ARCHIVE_STORE, "readonly");
    const range = IDBKeyRange.bound(THUMBNAIL_ARCHIVE_PREFIX, THUMBNAIL_ARCHIVE_PREFIX + "\uffff");
    const req = tx.objectStore(THUMBNAIL_ARCHIVE_STORE).openKeyCursor(range);
    req.onsuccess = () => {
      const c = req.result;
      if (!c) return resolve(list);
      list.push(String(c.key).slice(THUMBNAIL_ARCHIVE_PREFIX.length));
      c.continue();
    };
    req.onerror = () => reject(req.error);
  });
  return await exportThumbnails(ids);
}
// Restores thumbnails from { videoId: dataUrl }. Existing thumbnails are kept
// (first archived thumbnail is preserved) unless replace === true.
async function importThumbnails(map, metaMap = {}, replace = false) {
  if (!map || typeof map !== "object" || typeof indexedDB === "undefined") return 0;
  let count = 0;
  for (const [videoId, url] of Object.entries(map)) {
    if (!/^[-\w]{6,20}$/.test(videoId) || typeof url !== "string" || url.length > THUMB_IMPORT_MAX_CHARS) continue;
    const blob = dataUrlToBlob(url);
    if (!blob) continue;
    const existing = await getArchiveRecord(videoId);
    if (existing?.thumbnailBlob instanceof Blob && !replace) continue;
    const meta = (metaMap && metaMap[videoId]) || existing || {};
    await putArchiveRecord(videoId, {
      videoId,
      title: meta.title || "",
      channel: meta.channel || "",
      durationISO: meta.durationISO || "",
      durationSeconds: Number(meta.durationSeconds || 0),
      isPrivate: !!meta.isPrivate,
      isDeleted: !!meta.isDeleted,
      isBroken: !!meta.isBroken,
      isLive: !!meta.isLive,
      thumbnailBlob: blob,
      width: THUMBNAIL_WIDTH,
      height: THUMBNAIL_HEIGHT,
      mimeType: blob.type,
      size: blob.size,
      archivedAt: Date.now(),
    });
    count++;
  }
  return count;
}
function formatBytes(n) {
  n = Number(n) || 0;
  if (n < 1024) return n + " B";
  if (n < 1024 * 1024) return (n / 1024).toFixed(n < 10240 ? 1 : 0) + " KB";
  return (n / 1048576).toFixed(2) + " MB";
}
window.getThumbnailCacheStats = getThumbnailStats;
window.getTotalCacheStats = getTotalCacheStats;
// Metadata-only fill (title / channel / duration). Never fetches or touches thumbnails.
const PLACEHOLDER_CHANNELS = new Set(["Private channel", "Unknown Channel", "Unplayable channel", "-"]);
async function fillMetadata(videoId, meta = {}) {
  if (!videoId) return false;
  const rec = await getArchiveRecord(videoId);
  if (rec) {
    const merged = { ...rec };
    let changed = false;
    if (meta.title && isPlaceholderTitle(rec.title)) { merged.title = meta.title; changed = true; }
    if (meta.channel && (!rec.channel || PLACEHOLDER_CHANNELS.has(rec.channel))) { merged.channel = meta.channel; changed = true; }
    if (meta.durationSeconds && !rec.durationSeconds) { merged.durationSeconds = Number(meta.durationSeconds); merged.durationISO = meta.durationISO || rec.durationISO || ""; changed = true; }
    if (changed) await putArchiveRecord(videoId, merged);
  }
  await putMetadataMirror(videoId, {
    title: meta.title,
    channel: meta.channel,
    durationISO: meta.durationISO,
    durationSeconds: meta.durationSeconds,
  });
  return true;
}

window.clearThumbnailArchive = clearThumbnailArchive;
window.formatThumbBytes = formatBytes;
window.thumbnailArchive = {
  getThumbnailStats,
  exportThumbnails,
  exportAllThumbnails,
  importThumbnails,
  updateArchivedStatus,
  archiveThumbnail,
  fillMetadata,
  getArchivedThumbnailUrl,
  getArchivedMetadata,
  getArchiveRecord,
  pruneIfUnreferenced,
  pruneVideosIfUnreferenced,
  sourceUrls: THUMBNAIL_SOURCE_URLS,
  constants: {
    width: THUMBNAIL_WIDTH,
    height: THUMBNAIL_HEIGHT,
    maxBytes: THUMBNAIL_MAX_BYTES,
  },
};
