/* SOUL LINK — settings, local mod library, IndexedDB blobs and theme profile. */
(function () {
  'use strict';

  const SETTINGS_KEY = 'soullink.settings.v1';
  const MODS_KEY = 'soullink.mods.v1';
  const DB_NAME = 'soullink.files.v1';
  const DB_STORE = 'files';

  const memoryFiles = new Map();
  let dbPromise = null;
  let dbBroken = false;

  const defaults = (window.SL && SL.data && SL.data.DEFAULT_SETTINGS) || {
    master: 72, music: 35, sfx: 68, muted: false, scanlines: true,
    shake: true, reduceMotion: false, pixelPerfect: true,
    touchAlways: true, lefty: false, haptics: true
  };

  const palettes = (window.SL && SL.data && SL.data.PALETTES) || [];

  function safeParse(value, fallback) {
    if (!value) return fallback;
    try { return JSON.parse(value); } catch (_) { return fallback; }
  }

  function loadSettings() {
    let saved = {};
    try { saved = safeParse(localStorage.getItem(SETTINGS_KEY), {}); } catch (_) {}
    const merged = Object.assign({}, defaults, saved && typeof saved === 'object' ? saved : {});
    ['master', 'music', 'sfx'].forEach(function (key) {
      const n = Number(merged[key]);
      merged[key] = Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : defaults[key];
    });
    ['muted', 'scanlines', 'shake', 'reduceMotion', 'pixelPerfect', 'touchAlways', 'lefty', 'haptics'].forEach(function (key) {
      merged[key] = !!merged[key];
    });
    return merged;
  }

  let settings = loadSettings();

  function saveSettings(patch) {
    settings = Object.assign({}, settings, patch || {});
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (_) {}
    applySettingsClasses();
    document.dispatchEvent(new CustomEvent('soullink:settings', { detail: { settings: settings } }));
    return settings;
  }

  function applySettingsClasses() {
    const body = document.body;
    if (!body) return;
    body.classList.toggle('no-scanlines', !settings.scanlines);
    body.classList.toggle('reduce-motion', settings.reduceMotion);
    body.classList.toggle('no-pixel-filter', !settings.pixelPerfect);
    body.classList.toggle('is-muted', settings.muted);
    body.classList.toggle('lefty', settings.lefty);
    body.classList.toggle('show-touch-always', settings.touchAlways);
    document.documentElement.style.setProperty('--settings-master', String(settings.master));
  }

  /* ── IndexedDB ───────────────────────────────────────────── */

  function openDb() {
    if (dbBroken) return Promise.resolve(null);
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve) {
      try {
        if (!window.indexedDB) return resolve(null);
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = function () {
          const db = req.result;
          if (!db.objectStoreNames.contains(DB_STORE)) db.createObjectStore(DB_STORE);
        };
        req.onsuccess = function () { resolve(req.result); };
        req.onerror = function () { dbBroken = true; resolve(null); };
        req.onblocked = function () { resolve(null); };
      } catch (_) {
        dbBroken = true;
        resolve(null);
      }
    });
    return dbPromise;
  }

  async function putFile(id, blob) {
    const db = await openDb();
    if (!db) {
      memoryFiles.set(id, blob);
      return false;
    }
    return new Promise(function (resolve, reject) {
      try {
        const tx = db.transaction(DB_STORE, 'readwrite');
        tx.objectStore(DB_STORE).put(blob, id);
        tx.oncomplete = function () { resolve(true); };
        tx.onerror = function () { reject(tx.error || new Error('indexeddb write failed')); };
        tx.onabort = function () { reject(tx.error || new Error('indexeddb write aborted')); };
      } catch (err) {
        reject(err);
      }
    });
  }

  async function getFile(id) {
    if (!id) return null;
    const db = await openDb();
    if (!db) return memoryFiles.get(id) || null;
    return new Promise(function (resolve, reject) {
      try {
        const tx = db.transaction(DB_STORE, 'readonly');
        const req = tx.objectStore(DB_STORE).get(id);
        req.onsuccess = function () { resolve(req.result || null); };
        req.onerror = function () { reject(req.error || new Error('indexeddb read failed')); };
      } catch (err) { reject(err); }
    });
  }

  async function deleteFile(id) {
    if (!id) return;
    memoryFiles.delete(id);
    const db = await openDb();
    if (!db) return;
    return new Promise(function (resolve) {
      try {
        const tx = db.transaction(DB_STORE, 'readwrite');
        tx.objectStore(DB_STORE).delete(id);
        tx.oncomplete = function () { resolve(true); };
        tx.onerror = function () { resolve(false); };
      } catch (_) { resolve(false); }
    });
  }

  async function clearFiles() {
    memoryFiles.clear();
    const db = await openDb();
    if (!db) return;
    return new Promise(function (resolve) {
      try {
        const tx = db.transaction(DB_STORE, 'readwrite');
        tx.objectStore(DB_STORE).clear();
        tx.oncomplete = function () { resolve(true); };
        tx.onerror = function () { resolve(false); };
      } catch (_) { resolve(false); }
    });
  }

  /* ── Mod library ─────────────────────────────────────────── */

  let mods = [];
  try {
    const raw = safeParse(localStorage.getItem(MODS_KEY), []);
    mods = Array.isArray(raw) ? raw.filter(function (m) { return m && typeof m === 'object' && m.id; }) : [];
  } catch (_) { mods = []; }

  function saveMods() {
    try { localStorage.setItem(MODS_KEY, JSON.stringify(mods)); } catch (_) {}
    document.dispatchEvent(new CustomEvent('soullink:mods', { detail: { mods: mods.slice() } }));
  }

  function addMod(record) {
    const now = Date.now();
    const existing = mods.find(function (m) { return m.id === record.id; });
    if (existing) {
      Object.assign(existing, record, { installDate: existing.installDate || now });
      if (record.blobId && existing.blobId && existing.blobId !== record.blobId) {
        deleteFile(existing.blobId).catch(function () {});
      }
    } else {
      const item = Object.assign({
        active: true,
        installDate: now,
        activatedAt: now,
        paletteIndex: derivePaletteIndex(record.id + ':' + (record.hash || record.name || '')),
        size: 0,
        kind: 'archive',
        source: 'local'
      }, record);
      mods.unshift(item);
    }
    saveMods();
    applyTheme();
    return mods;
  }

  function updateMod(id, patch) {
    const item = mods.find(function (m) { return m.id === id; });
    if (!item) return null;
    Object.assign(item, patch);
    saveMods();
    applyTheme();
    return item;
  }

  function setActive(id, active) {
    const item = mods.find(function (m) { return m.id === id; });
    if (!item) return;
    item.active = !!active;
    if (active) item.activatedAt = Date.now();
    saveMods();
    applyTheme();
  }

  async function removeMod(id) {
    const index = mods.findIndex(function (m) { return m.id === id; });
    if (index < 0) return;
    const item = mods[index];
    mods.splice(index, 1);
    if (item && item.blobId) {
      try { await deleteFile(item.blobId); } catch (_) {}
    }
    saveMods();
    applyTheme();
  }

  function findMod(id) {
    return mods.find(function (m) { return m.id === id; }) || null;
  }

  function activeMods() {
    return mods.filter(function (m) { return m.active; });
  }

  function themeMod() {
    const active = activeMods();
    if (!active.length) return null;
    return active.slice().sort(function (a, b) {
      return (b.activatedAt || 0) - (a.activatedAt || 0);
    })[0];
  }

  function derivePaletteIndex(seed) {
    let h = 2166136261;
    const text = String(seed || 'vanilla');
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return Math.abs(h) % Math.max(1, palettes.length);
  }

  function paletteFor(mod) {
    if (!palettes.length) return null;
    if (mod && Number.isInteger(mod.paletteIndex) && palettes[mod.paletteIndex]) return palettes[mod.paletteIndex];
    if (mod && mod.palette) {
      const found = palettes.find(function (p) { return p.id === mod.palette; });
      if (found) return found;
    }
    return palettes[0];
  }

  function currentPalette() {
    return paletteFor(themeMod()) || palettes[0] || null;
  }

  function themeName() {
    const mod = themeMod();
    return mod ? mod.name : 'VANILLA';
  }

  function applyTheme() {
    const mod = themeMod();
    const palette = paletteFor(mod) || palettes[0];
    if (!palette) return;
    const root = document.documentElement;
    root.style.setProperty('--mod-accent', palette.accent);
    root.style.setProperty('--mod-accent-2', palette.accent2);
    root.style.setProperty('--mod-glow', palette.glow);
    if (mod) {
      document.body.classList.add('has-mod');
      document.body.setAttribute('data-mod', mod.id);
    } else {
      document.body.classList.remove('has-mod');
      document.body.removeAttribute('data-mod');
    }
    document.dispatchEvent(new CustomEvent('soullink:theme', { detail: { mod: mod, palette: palette } }));
  }

  function totalBytes() {
    return mods.reduce(function (sum, m) { return sum + (Number(m.size) || 0); }, 0);
  }

  async function resetAll() {
    try {
      localStorage.removeItem(SETTINGS_KEY);
      localStorage.removeItem(MODS_KEY);
    } catch (_) {}
    await clearFiles();
    mods = [];
    settings = Object.assign({}, defaults);
    applySettingsClasses();
    applyTheme();
    document.dispatchEvent(new CustomEvent('soullink:mods', { detail: { mods: [] } }));
    document.dispatchEvent(new CustomEvent('soullink:settings', { detail: { settings: settings } }));
  }

  /* ── Helpers ─────────────────────────────────────────────── */

  async function blobHash(blob) {
    try {
      if (window.crypto && crypto.subtle && blob) {
        const chunk = blob.slice(0, Math.min(blob.size, 1024 * 1024));
        const buf = await chunk.arrayBuffer();
        const digest = await crypto.subtle.digest('SHA-256', buf);
        return Array.from(new Uint8Array(digest)).slice(0, 12).map(function (b) {
          return b.toString(16).padStart(2, '0');
        }).join('');
      }
    } catch (_) {}
    return 'h' + Math.random().toString(16).slice(2) + '-' + (blob ? blob.size : 0);
  }

  async function inspectDataWin(blob) {
    if (!blob) return { valid: false, form: '', chunk: '' };
    try {
      const head = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
      const text = String.fromCharCode.apply(null, Array.from(head));
      return {
        valid: text.slice(0, 4) === 'FORM' && text.slice(8, 12) === 'GEN8',
        form: text.slice(0, 4),
        chunk: text.slice(8, 12)
      };
    } catch (_) {
      return { valid: false, form: '', chunk: '' };
    }
  }

  function formatBytes(bytes) {
    const n = Number(bytes) || 0;
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(n < 10240 ? 1 : 0) + ' KB';
    if (n < 1024 * 1024 * 1024) return (n / (1024 * 1024)).toFixed(n < 10 * 1024 * 1024 ? 1 : 0) + ' MB';
    return (n / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
  }

  function formatNumber(n) {
    const num = Number(n) || 0;
    if (num >= 1000000) return (num / 1000000).toFixed(1).replace('.0', '') + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1).replace('.0', '') + 'K';
    return String(num);
  }

  function formatDate(ts) {
    if (!ts) return '';
    try {
      return new Intl.DateTimeFormat(SL.i18n.lang === 'ru' ? 'ru-RU' : 'en-US', {
        day: '2-digit', month: 'short', year: 'numeric'
      }).format(new Date(ts));
    } catch (_) {
      return new Date(ts).toLocaleDateString();
    }
  }

  window.SL = window.SL || {};
  SL.store = {
    get settings() { return settings; },
    get mods() { return mods.slice(); },
    loadSettings: loadSettings,
    saveSettings: saveSettings,
    applySettingsClasses: applySettingsClasses,
    addMod: addMod,
    updateMod: updateMod,
    setActive: setActive,
    removeMod: removeMod,
    findMod: findMod,
    activeMods: activeMods,
    themeMod: themeMod,
    currentPalette: currentPalette,
    themeName: themeName,
    paletteFor: paletteFor,
    applyTheme: applyTheme,
    derivePaletteIndex: derivePaletteIndex,
    putFile: putFile,
    getFile: getFile,
    deleteFile: deleteFile,
    clearFiles: clearFiles,
    resetAll: resetAll,
    totalBytes: totalBytes,
    blobHash: blobHash,
    inspectDataWin: inspectDataWin,
    formatBytes: formatBytes,
    formatNumber: formatNumber,
    formatDate: formatDate,
    settingsKey: SETTINGS_KEY,
    modsKey: MODS_KEY
  };
})();
