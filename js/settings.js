const STORAGE_KEY = 'utl.settings.v1';

export const DEFAULT_SETTINGS = Object.freeze({
  lang: 'ru',
  music: 45,
  sfx: 70,
  muted: false,
  crt: true,
  shake: true,
  touch: 'auto',
  opacity: 82,
  lefty: false,
  motion: false,
  soul: 'red',
  activePack: null,
  cleared: false
});

function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }

function sanitize(raw) {
  const s = { ...DEFAULT_SETTINGS, ...(raw && typeof raw === 'object' ? raw : {}) };
  s.lang = s.lang === 'en' ? 'en' : 'ru';
  s.music = clamp(Number(s.music) || 0, 0, 100);
  s.sfx = clamp(Number(s.sfx) || 0, 0, 100);
  s.muted = Boolean(s.muted);
  s.crt = Boolean(s.crt);
  s.shake = Boolean(s.shake);
  s.touch = ['auto', 'on', 'off'].includes(s.touch) ? s.touch : 'auto';
  s.opacity = clamp(Number(s.opacity) || 82, 30, 100);
  s.lefty = Boolean(s.lefty);
  s.motion = Boolean(s.motion);
  s.soul = ['red', 'cyan', 'lime', 'gold'].includes(s.soul) ? s.soul : 'red';
  if (s.soul === 'gold' && !s.cleared) s.soul = 'red';
  s.activePack = typeof s.activePack === 'string' && s.activePack ? s.activePack : null;
  s.cleared = Boolean(s.cleared);
  return s;
}

let settings = load();

function load() {
  try {
    return sanitize(JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'));
  } catch {
    return sanitize(null);
  }
}

export function getSettings() { return settings; }

export function saveSettings() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch { /* storage may be unavailable */ }
}

export function setSetting(key, value, { save = true } = {}) {
  settings[key] = value;
  settings = sanitize(settings);
  if (save) saveSettings();
  applySettings();
  window.dispatchEvent(new CustomEvent('utl:settings', { detail: { key, value, settings } }));
  return settings[key];
}

export function updateSettings(patch) {
  settings = sanitize({ ...settings, ...patch });
  saveSettings();
  applySettings();
  window.dispatchEvent(new CustomEvent('utl:settings', { detail: { settings } }));
  return settings;
}

export function isTouchDevice() {
  return (navigator.maxTouchPoints || 0) > 0 || window.matchMedia('(pointer: coarse)').matches;
}

export function shouldShowTouch() {
  if (settings.touch === 'on') return true;
  if (settings.touch === 'off') return false;
  return isTouchDevice();
}

export function applySettings() {
  const root = document.documentElement;
  const body = document.body;
  if (!body) return;
  body.dataset.soul = settings.soul;
  body.dataset.crt = settings.crt ? 'on' : 'off';
  body.dataset.motion = settings.motion ? 'off' : 'on';
  body.dataset.lang = settings.lang;
  body.classList.toggle('lefty', settings.lefty);
  body.classList.toggle('show-touch', shouldShowTouch());
  root.style.setProperty('--touch-opacity', String(settings.opacity / 100));
  root.lang = settings.lang;
  root.dataset.lang = settings.lang;
}

export function resetAllData() {
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
  settings = sanitize(null);
}
