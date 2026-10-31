import { normalizePack, DEFAULT_PACK } from './packs.js';

const DB_NAME = 'utl-mods';
const DB_VERSION = 1;
const MOD_STORE = 'mods';
const FILE_STORE = 'files';

let dbPromise = null;
let memoryMode = false;
const memoryMods = new Map();
const memoryFiles = new Map();

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('IndexedDB unavailable')); return; }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(MOD_STORE)) {
        const store = db.createObjectStore(MOD_STORE, { keyPath: 'id' });
        store.createIndex('installedAt', 'installedAt');
      }
      if (!db.objectStoreNames.contains(FILE_STORE)) db.createObjectStore(FILE_STORE, { keyPath: 'id' });
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
    request.onerror = () => reject(request.error || new Error('IndexedDB error'));
    request.onblocked = () => reject(new Error('IndexedDB blocked'));
  }).catch((error) => {
    memoryMode = true;
    console.warn('Mod storage fell back to memory:', error);
    return null;
  });
  return dbPromise;
}

export function isMemoryMode() { return memoryMode; }

function withStore(name, mode, fn) {
  return openDB().then((db) => new Promise((resolve, reject) => {
    if (!db) return resolve(fn(null));
    const tx = db.transaction(name, mode);
    const store = tx.objectStore(name);
    let result;
    try { result = fn(store); } catch (error) { reject(error); return; }
    tx.oncomplete = () => resolve(result && result.__request ? result.__request.result : result);
    tx.onerror = () => reject(tx.error || new Error('IndexedDB transaction failed'));
    tx.onabort = () => reject(tx.error || new Error('IndexedDB transaction aborted'));
  }));
}

function requestResult(request) {
  return { __request: request };
}

export async function initStore() {
  await openDB();
  if (memoryMode) return { mode: 'memory' };
  return { mode: 'indexeddb' };
}

export async function getAllMods() {
  await openDB();
  if (memoryMode) return [...memoryMods.values()].sort((a, b) => b.installedAt - a.installedAt);
  return new Promise((resolve, reject) => {
    openDB().then((db) => {
      const tx = db.transaction(MOD_STORE, 'readonly');
      const req = tx.objectStore(MOD_STORE).getAll();
      req.onsuccess = () => resolve((req.result || []).sort((a, b) => b.installedAt - a.installedAt));
      req.onerror = () => reject(req.error);
    });
  });
}

export async function getMod(id) {
  if (!id) return null;
  await openDB();
  if (memoryMode) return memoryMods.get(id) || null;
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(MOD_STORE, 'readonly').objectStore(MOD_STORE).get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

export async function getModBlob(id) {
  if (!id) return null;
  await openDB();
  if (memoryMode) return memoryFiles.get(id) || null;
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(FILE_STORE, 'readonly').objectStore(FILE_STORE).get(id);
    req.onsuccess = () => resolve(req.result?.blob || null);
    req.onerror = () => reject(req.error);
  });
}

export async function putMod(record, blob = null) {
  await openDB();
  const clean = { ...record };
  if (memoryMode) {
    memoryMods.set(clean.id, clean);
    if (blob) memoryFiles.set(clean.id, blob);
    return clean;
  }
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([MOD_STORE, FILE_STORE], 'readwrite');
    tx.objectStore(MOD_STORE).put(clean);
    if (blob) tx.objectStore(FILE_STORE).put({ id: clean.id, blob });
    tx.oncomplete = () => resolve(clean);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Could not save mod'));
  });
}

export async function deleteMod(id) {
  await openDB();
  if (memoryMode) {
    memoryMods.delete(id);
    memoryFiles.delete(id);
    return;
  }
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([MOD_STORE, FILE_STORE], 'readwrite');
    tx.objectStore(MOD_STORE).delete(id);
    tx.objectStore(FILE_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function clearMods() {
  await openDB();
  if (memoryMode) { memoryMods.clear(); memoryFiles.clear(); return; }
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([MOD_STORE, FILE_STORE], 'readwrite');
    tx.objectStore(MOD_STORE).clear();
    tx.objectStore(FILE_STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getActivePack(activeId) {
  if (!activeId) return DEFAULT_PACK;
  const record = await getMod(activeId);
  if (record?.pack) return record.pack;
  return DEFAULT_PACK;
}

export async function ensureBuiltinPack(pack) {
  const existing = await getMod(pack.id);
  if (existing) return existing;
  const blob = new Blob([JSON.stringify(pack, null, 2)], { type: 'application/json' });
  const record = {
    id: pack.id,
    source: 'builtin',
    name: pack.name,
    author: pack.author,
    version: pack.version,
    category: 'Theme pack',
    description: pack.description?.ru || pack.description?.en || '',
    fileName: `${pack.id}.utmod`,
    size: blob.size,
    mime: 'application/json',
    kind: 'pack',
    info: { label: '.utmod', pack: true },
    pack,
    installedAt: Date.now(),
    active: false
  };
  return putMod(record, blob);
}

export function isDataWin(file) {
  return /\.win$/i.test(file?.name || '');
}

/* ------------------------------------------------------------------ */
/* inspection                                                          */
/* ------------------------------------------------------------------ */

const KNOWN_CHUNKS = [
  'GEN8', 'LANG', 'EXT ', 'SOND', 'AGRP', 'SPRT', 'BGND', 'PATH', 'SCPT', 'GLOB',
  'SHDR', 'FONT', 'TMLN', 'OBJT', 'ROOM', 'DAFL', 'TPAG', 'CODE', 'VARI', 'FUNC',
  'STRG', 'TXTR', 'AUDO', 'OPTN', 'TGIN', 'EMBI', 'PSEM', 'ACRV', 'SEQ '
];

const BYTECODE_LABELS = {
  13: 'GameMaker 8.x',
  14: 'GameMaker: Studio 1.2+',
  15: 'GameMaker: Studio 1.4',
  16: 'GameMaker Studio 2',
  17: 'GameMaker 2022+',
  18: 'GameMaker 2023+'
};

function ascii(bytes, offset, length) {
  let out = '';
  for (let i = 0; i < length; i++) out += String.fromCharCode(bytes[offset + i] || 0);
  return out;
}

function bytesStartWith(bytes, signature) {
  if (!bytes || bytes.length < signature.length) return false;
  for (let i = 0; i < signature.length; i++) if (bytes[i] !== signature[i]) return false;
  return true;
}

export async function inspectFile(file) {
  const headSize = Math.min(file.size, 512 * 1024);
  const head = new Uint8Array(await file.slice(0, headSize).arrayBuffer());
  const size = file.size;

  if (bytesStartWith(head, [0x50, 0x4b, 0x03, 0x04]) || bytesStartWith(head, [0x50, 0x4b, 0x05, 0x06])) {
    const zip = await inspectZip(file);
    const hasDataWin = zip.entries.some((entry) => /(^|\/)data\.win$/i.test(entry.name) || /\.win$/i.test(entry.name));
    return {
      kind: hasDataWin ? 'zip-datawin' : 'zip',
      label: hasDataWin ? 'ZIP + data.win' : 'ZIP archive',
      info: { ...zip, hasDataWin }
    };
  }

  if (bytesStartWith(head, [0x46, 0x4f, 0x52, 0x4d])) {
    return inspectDataWin(head, size);
  }

  const looksJson = /^\s*[\{[]/.test(new TextDecoder().decode(head.slice(0, Math.min(head.length, 4096))));
  if (looksJson && size < 8 * 1024 * 1024) {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const pack = normalizePack(parsed, file.name.replace(/\.[^.]+$/, ''));
      if (pack) {
        return { kind: 'pack', label: '.utmod pack', info: { pack: true, packData: pack } };
      }
      return { kind: 'unknown', label: 'JSON (not a pack)', info: { reason: 'invalid-pack' } };
    } catch {
      return { kind: 'unknown', label: 'Invalid JSON', info: {} };
    }
  }

  return {
    kind: 'unknown',
    label: /\.win$/i.test(file.name) ? 'data.win (invalid header)' : 'Unknown file',
    info: {}
  };
}

function inspectDataWin(head, size) {
  const view = new DataView(head.buffer, head.byteOffset, head.byteLength);
  const formSize = view.getUint32(4, true);
  const gen8Size = head.length >= 16 ? view.getUint32(12, true) : 0;
  const bytecode = head.length > 17 ? head[17] : 0;
  const chunks = [];
  for (let i = 0; i < head.length - 8; i++) {
    const name = ascii(head, i, 4);
    if (!KNOWN_CHUNKS.includes(name)) continue;
    const chunkSize = view.getUint32(i + 4, true);
    if (chunkSize > size || chunkSize === 0) continue;
    if (!chunks.includes(name)) chunks.push(name);
  }
  return {
    kind: 'datawin',
    label: 'GameMaker data.win',
    info: {
      gameMaker: BYTECODE_LABELS[bytecode] || (bytecode ? `GameMaker b${bytecode}` : 'GameMaker'),
      bytecode,
      formSize: formSize ? formSize + 8 : 0,
      gen8Size,
      chunks: chunks.slice(0, 26)
    }
  };
}

async function inspectZip(file) {
  const tailSize = Math.min(file.size, 66_000);
  const tail = new Uint8Array(await file.slice(file.size - tailSize).arrayBuffer());
  const tailView = new DataView(tail.buffer, tail.byteOffset, tail.byteLength);
  let eocd = -1;
  for (let i = tail.length - 22; i >= 0; i--) {
    if (tailView.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) return { count: 0, entries: [], error: 'eocd' };
  const count = tailView.getUint16(eocd + 10, true);
  const cdSize = tailView.getUint32(eocd + 12, true);
  const cdOffset = tailView.getUint32(eocd + 16, true);
  if (!count || !cdSize) return { count: 0, entries: [] };
  const readSize = Math.min(cdSize + 8, 4 * 1024 * 1024);
  const cd = new Uint8Array(await file.slice(cdOffset, Math.min(file.size, cdOffset + readSize)).arrayBuffer());
  const cdView = new DataView(cd.buffer, cd.byteOffset, cd.byteLength);
  const decoder = new TextDecoder('utf-8');
  const entries = [];
  let offset = 0;
  for (let i = 0; i < count && offset + 46 <= cd.length && entries.length < 500; i++) {
    if (cdView.getUint32(offset, true) !== 0x02014b50) break;
    const nameLen = cdView.getUint16(offset + 28, true);
    const extraLen = cdView.getUint16(offset + 30, true);
    const commentLen = cdView.getUint16(offset + 32, true);
    const compressed = cdView.getUint32(offset + 20, true);
    const uncompressed = cdView.getUint32(offset + 24, true);
    const name = decoder.decode(cd.slice(offset + 46, offset + 46 + nameLen)).replace(/\0/g, '');
    entries.push({ name, size: uncompressed || compressed });
    offset += 46 + nameLen + extraLen + commentLen;
  }
  return { count, entries };
}

export function kindLabel(record) {
  if (record.kind === 'datawin') return 'DATA.WIN';
  if (record.kind === 'zip-datawin') return 'ZIP · DATA.WIN';
  if (record.kind === 'zip') return 'ZIP';
  if (record.kind === 'pack') return '.UTMOD';
  return 'FILE';
}

export function makeLocalId(file, info) {
  if (info.kind === 'pack' && info.info?.packData?.id) return info.info.packData.id;
  const base = file.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'mod';
  return `local-${base}-${file.size}`;
}

export function buildLocalRecord(file, info) {
  const pack = info.kind === 'pack' ? info.info.packData : null;
  const name = pack?.name || file.name.replace(/\.[^.]+$/, '');
  const author = pack?.author || 'LOCAL FILE';
  const version = pack?.version || '';
  const description = pack ? (pack.description?.ru || pack.description?.en || '') : '';
  return {
    id: makeLocalId(file, info),
    source: 'local',
    name,
    author,
    version,
    category: pack ? 'Theme pack' : (info.kind === 'datawin' || info.kind === 'zip-datawin' ? 'Game files' : 'Local file'),
    description,
    fileName: file.name,
    size: file.size,
    mime: file.type || 'application/octet-stream',
    kind: info.kind,
    info: info.info || {},
    pack,
    installedAt: Date.now(),
    active: false
  };
}

/* ------------------------------------------------------------------ */
/* download & export                                                   */
/* ------------------------------------------------------------------ */

export async function downloadWithProgress(url, onProgress, signal) {
  const response = await fetch(url, { mode: 'cors', credentials: 'omit', signal });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const total = Number(response.headers.get('content-length')) || 0;
  if (!response.body) {
    const blob = await response.blob();
    onProgress?.(blob.size, total || blob.size);
    return blob;
  }
  const reader = response.body.getReader();
  const chunks = [];
  let received = 0;
  let last = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    const now = performance.now();
    if (now - last > 80 || received === total) {
      last = now;
      onProgress?.(received, total);
    }
  }
  const blob = new Blob(chunks, { type: response.headers.get('content-type') || 'application/octet-stream' });
  onProgress?.(received, total || received);
  return blob;
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = sanitizeFilename(filename);
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export async function exportMod(record) {
  let blob = await getModBlob(record.id);
  if (!blob && record.pack) {
    blob = new Blob([JSON.stringify(record.pack, null, 2)], { type: 'application/json' });
  }
  if (!blob) throw new Error('File data is missing');
  const fallback = record.kind === 'pack' ? `${record.name}.utmod` : 'data.win';
  downloadBlob(blob, record.fileName || fallback);
}

export function sanitizeFilename(name) {
  return String(name || 'mod').replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim().slice(0, 120) || 'mod';
}

export function formatBytes(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10 * 1024 ? 1 : 0)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(n < 10 * 1024 * 1024 ? 1 : 0)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export async function storageInfo(mods) {
  let quota = 0;
  let usage = 0;
  try {
    if (navigator.storage?.estimate) {
      const estimate = await navigator.storage.estimate();
      quota = estimate.quota || 0;
      usage = estimate.usage || 0;
    }
  } catch { /* ignore */ }
  const modBytes = (mods || []).reduce((sum, mod) => sum + (Number(mod.size) || 0), 0);
  return { quota, usage, modBytes, used: modBytes || usage };
}
