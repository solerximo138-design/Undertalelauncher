import { applyI18n, getLang, setLang, t, tList } from './i18n.js';
import {
  applySettings, getSettings, resetAllData, setSetting
} from './settings.js';
import { audio } from './audio.js';
import { RuinsScene } from './scene.js';
import { SoulTrial } from './demo.js';
import { DEFAULT_PACK } from './packs.js';
import { clearMods, getActivePack, getMod } from './store.js';
import {
  focusSearch, initMods, openMods, refreshInstalled
} from './mods.js';
import {
  closeModal, confirmDialog, escapeHtml, flash, isModalOpen, toast
} from './ui.js';

const $ = (id) => document.getElementById(id);

const dom = {};
const menuItems = [];
let menuIndex = 0;
let currentView = 'launcher';
let settingsReturn = 'launcher';
let scene = null;
let demo = null;
let activeRecord = null;
let activePack = DEFAULT_PACK;
let celebrated = false;
let bootDone = false;
let bootTimer = null;
let bootFinishTimer = null;
let bootStartTime = 0;
let quoteTimer = null;
let typeTimer = null;
let quoteIndex = -1;

const isAndroidWebView = /Android/i.test(navigator.userAgent) && /;\s*wv[);]/i.test(navigator.userAgent);

/* ------------------------------------------------------------------ */
/* boot                                                               */
/* ------------------------------------------------------------------ */

function startBoot() {
  bootStartTime = performance.now();
  const lines = [t('boot.line1'), t('boot.line2'), t('boot.line3'), t('boot.line4'), t('boot.ready')];
  dom.bootLog.innerHTML = '';
  let index = 0;

  const addLine = () => {
    if (index >= lines.length) return;
    dom.bootLog.querySelectorAll('.boot-line.is-active').forEach((line) => {
      line.classList.remove('is-active');
      const badge = line.querySelector('b');
      if (badge) badge.textContent = '[ OK ]';
    });
    const line = document.createElement('div');
    line.className = 'boot-line is-active';
    line.innerHTML = `<b>[ >> ]</b><span>${escapeHtml(lines[index])}</span>`;
    dom.bootLog.appendChild(line);
    while (dom.bootLog.children.length > 4) dom.bootLog.firstElementChild?.remove();
    index += 1;
    const pct = Math.min(94, Math.round((index / lines.length) * 100));
    dom.bootBar.style.width = `${pct}%`;
  };

  addLine();
  bootTimer = setInterval(() => {
    if (index < lines.length) addLine();
    if (index >= lines.length) clearInterval(bootTimer);
  }, 330);

  dom.bootSkip.addEventListener('click', () => finishBoot(true), { once: true });
  dom.bootScreen.addEventListener('click', (event) => {
    if (event.target === dom.bootScreen) finishBoot(true);
  });
}

function finishBoot(immediate = false) {
  if (bootDone) return;
  bootDone = true;
  clearInterval(bootTimer);
  clearTimeout(bootFinishTimer);
  dom.bootBar.style.width = '100%';
  dom.bootLog.querySelectorAll('.boot-line b').forEach((badge) => { badge.textContent = '[ OK ]'; });
  const elapsed = performance.now() - bootStartTime;
  const delay = immediate ? 60 : Math.max(120, 1850 - elapsed);
  bootFinishTimer = setTimeout(() => {
    dom.bootScreen.classList.add('is-done');
    dom.bootScreen.setAttribute('aria-hidden', 'true');
    setTimeout(() => { dom.bootScreen.style.display = 'none'; }, 700);
    setTimeout(() => restartQuote(), 420);
  }, delay);
}

/* ------------------------------------------------------------------ */
/* quotes                                                             */
/* ------------------------------------------------------------------ */

function restartQuote() {
  clearTimeout(quoteTimer);
  clearInterval(typeTimer);
  const quotes = tList('quotes');
  if (!quotes.length) return;
  quoteIndex = (quoteIndex + 1) % quotes.length;
  const text = quotes[quoteIndex];
  const el = dom.heroQuote;
  if (!el) return;
  el.classList.add('is-typing');
  el.textContent = '';
  const reduced = getSettings().motion || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (reduced) {
    el.textContent = text;
    el.classList.remove('is-typing');
    quoteTimer = setTimeout(restartQuote, 9000);
    return;
  }
  let index = 0;
  typeTimer = setInterval(() => {
    index += 1;
    el.textContent = text.slice(0, index);
    if (index >= text.length) {
      clearInterval(typeTimer);
      el.classList.remove('is-typing');
      quoteTimer = setTimeout(restartQuote, 7200);
    }
  }, 26);
}

/* ------------------------------------------------------------------ */
/* views                                                              */
/* ------------------------------------------------------------------ */

function setView(view) {
  currentView = view;
  document.body.dataset.view = view;
  const showLauncher = view === 'launcher';
  dom.launcherView.classList.toggle('is-hidden', !showLauncher);
  dom.settingsView.classList.toggle('is-hidden', view !== 'settings');
  dom.settingsView.setAttribute('aria-hidden', String(view !== 'settings'));
  dom.modsView.classList.toggle('is-hidden', view !== 'mods');
  dom.modsView.setAttribute('aria-hidden', String(view !== 'mods'));
  dom.demoView.classList.toggle('is-hidden', view !== 'demo');
  dom.demoView.setAttribute('aria-hidden', String(view !== 'demo'));
  if (showLauncher) {
    updateMenuStatus();
    selectMenu(menuIndex, { silent: true });
  }
}

function showLauncher() {
  if (currentView === 'demo') {
    quitDemo();
    return;
  }
  setView('launcher');
  audio.setTheme('menu', 1);
}

function showSettings(returnTo = 'launcher') {
  settingsReturn = returnTo;
  if (returnTo === 'demo' && demo) {
    demo.pause();
    demo.hidePauseOverlay();
  }
  syncSettingsUI();
  setView('settings');
  dom.settingsView.scrollTop = 0;
  audio.play('select');
}

function leaveSettings() {
  audio.play('back');
  if (settingsReturn === 'demo' && demo) {
    setView('demo');
    demo.resume();
    demo.updateRotateHint?.();
    settingsReturn = 'launcher';
    return;
  }
  setView('launcher');
}

async function showMods() {
  setView('mods');
  await openMods();
  audio.play('select');
}

function leaveMods() {
  audio.play('back');
  showLauncher();
}

/* ------------------------------------------------------------------ */
/* menu                                                               */
/* ------------------------------------------------------------------ */

function selectMenu(index, { silent = false } = {}) {
  if (!menuItems.length) return;
  menuIndex = (index + menuItems.length) % menuItems.length;
  menuItems.forEach((item, i) => {
    const active = i === menuIndex;
    item.classList.toggle('is-selected', active);
    item.setAttribute('aria-current', active ? 'true' : 'false');
  });
  if (!silent) audio.play('move');
}

function moveMenu(delta) {
  selectMenu(menuIndex + delta);
}

function activateMenu(action = menuItems[menuIndex]?.dataset.action) {
  if (!action) return;
  audio.unlock();
  if (action === 'new-game') {
    audio.play('select');
    startDemo();
  } else if (action === 'settings') {
    audio.play('select');
    showSettings('launcher');
  } else if (action === 'mods') {
    audio.play('select');
    showMods();
  }
}

function updateMenuStatus() {
  const settings = getSettings();
  const label = activeRecord ? (activePack?.name || activeRecord.name) : t('menu.defaultPack');
  if (dom.activeModName) dom.activeModName.textContent = label;
  if (dom.activeModStatus) dom.activeModStatus.title = activeRecord ? (activePack?.author || '') : t('menu.defaultPack');
  if (dom.hudPackName) dom.hudPackName.textContent = label;
  if (dom.clearBadge) dom.clearBadge.textContent = settings.cleared ? `${t('hero.badge3')} ✓` : t('hero.badge3');
}

/* ------------------------------------------------------------------ */
/* demo                                                               */
/* ------------------------------------------------------------------ */

async function startDemo() {
  audio.unlock();
  let pack = DEFAULT_PACK;
  const settings = getSettings();
  if (settings.activePack) {
    try {
      pack = await getActivePack(settings.activePack);
    } catch {
      pack = DEFAULT_PACK;
    }
  }
  setView('demo');
  if (!demo) {
    demo = new SoulTrial(dom.gameCanvas, {
      onQuit: () => quitDemo(),
      onSettings: () => showSettings('demo'),
      onClear: () => handleDemoClear()
    });
  }
  demo.start(pack);
  requestAnimationFrame(() => demo?.updateRotateHint?.());
}

function quitDemo() {
  if (demo) demo.stop();
  audio.setTheme('menu', 1);
  setView('launcher');
  audio.play('back');
  updateMenuStatus();
}

function handleDemoClear() {
  const settings = getSettings();
  updateGoldSoul(settings.cleared);
  if (!celebrated) {
    celebrated = true;
    setSetting('soul', 'gold');
    syncSouls();
    flash('#ffd75e');
    audio.play('unlock');
    toast(t('game.clearToast'), 'ok', 6500);
  }
  updateMenuStatus();
}

/* ------------------------------------------------------------------ */
/* settings                                                           */
/* ------------------------------------------------------------------ */

function updateGoldSoul(cleared) {
  const gold = dom.soulColors?.querySelector('[data-color="gold"]');
  if (!gold) return;
  gold.classList.toggle('is-locked', !cleared);
  gold.dataset.locked = cleared ? 'false' : 'true';
  gold.setAttribute('aria-label', cleared ? 'Gold' : `${t('settings.soul')} (locked)`);
  if (!cleared && getSettings().soul === 'gold') setSetting('soul', 'red');
}

function syncSouls() {
  const settings = getSettings();
  dom.soulColors?.querySelectorAll('[data-color]').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.color === settings.soul);
  });
  updateGoldSoul(settings.cleared);
}

function setToggle(button, checked) {
  if (!button) return;
  button.setAttribute('aria-checked', String(Boolean(checked)));
  const label = button.querySelector('.toggle-label');
  if (label) label.textContent = checked ? 'ON' : 'OFF';
}

function syncSettingsUI() {
  const settings = getSettings();
  if (dom.musicRange) {
    dom.musicRange.value = String(settings.music);
    dom.musicOut.textContent = `${Math.round(settings.music)}%`;
  }
  if (dom.sfxRange) {
    dom.sfxRange.value = String(settings.sfx);
    dom.sfxOut.textContent = `${Math.round(settings.sfx)}%`;
  }
  if (dom.opacityRange) {
    dom.opacityRange.value = String(settings.opacity);
    dom.opacityOut.textContent = `${Math.round(settings.opacity)}%`;
  }
  setToggle(dom.crtToggle, settings.crt);
  setToggle(dom.shakeToggle, settings.shake);
  setToggle(dom.leftyToggle, settings.lefty);
  setToggle(dom.motionToggle, settings.motion);
  dom.touchMode?.querySelectorAll('[data-value]').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.value === settings.touch);
  });
  dom.langMode?.querySelectorAll('[data-value]').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.value === settings.lang);
  });
  syncSouls();
  updateSoundButton();
  updateLanguageLabel();
}

function updateSoundButton() {
  if (!dom.soundBtn) return;
  const muted = getSettings().muted;
  const use = dom.soundBtn.querySelector('use');
  if (use) use.setAttribute('href', muted ? '#i-mute' : '#i-sound');
  dom.soundBtn.setAttribute('aria-pressed', String(!muted));
  dom.soundBtn.title = muted ? 'Звук выключен / Sound off' : 'Звук / Sound';
}

function updateLanguageLabel() {
  if (dom.langLabel) dom.langLabel.textContent = getLang().toUpperCase();
  updateSoundButton();
}

function applyVolumes() {
  const settings = getSettings();
  audio.setVolumes(settings.music, settings.sfx, settings.muted);
}

function switchLanguage(next, { persist = true } = {}) {
  const language = next === 'en' ? 'en' : 'ru';
  setLang(language);
  if (persist) setSetting('lang', language);
  applyI18n();
  updateLanguageLabel();
  updateMenuStatus();
  updateGoldSoul(getSettings().cleared);
  restartQuote();
  syncSettingsUI();
  document.title = language === 'ru'
    ? 'UNDERTALE LAUNCHER // Пиксельное издание'
    : 'UNDERTALE LAUNCHER // Pixel Edition';
  if (currentView === 'mods') {
    openMods();
  } else {
    refreshInstalled().catch(() => {});
  }
}

function bindSettings() {
  dom.musicRange?.addEventListener('input', () => {
    const value = Number(dom.musicRange.value);
    dom.musicOut.textContent = `${value}%`;
    setSetting('music', value);
    applyVolumes();
  });
  dom.sfxRange?.addEventListener('input', () => {
    const value = Number(dom.sfxRange.value);
    dom.sfxOut.textContent = `${value}%`;
    setSetting('sfx', value);
    applyVolumes();
    if (value > 0) audio.play('move');
  });
  dom.opacityRange?.addEventListener('input', () => {
    const value = Number(dom.opacityRange.value);
    dom.opacityOut.textContent = `${value}%`;
    setSetting('opacity', value);
  });

  const toggleBinding = (button, key) => {
    button?.addEventListener('click', () => {
      const next = !getSettings()[key];
      setSetting(key, next);
      setToggle(button, next);
      audio.play(next ? 'select' : 'back');
      if (key === 'motion') scene?.setMotion(!next);
    });
  };
  toggleBinding(dom.crtToggle, 'crt');
  toggleBinding(dom.shakeToggle, 'shake');
  toggleBinding(dom.leftyToggle, 'lefty');
  toggleBinding(dom.motionToggle, 'motion');

  dom.touchMode?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-value]');
    if (!button) return;
    setSetting('touch', button.dataset.value);
    dom.touchMode.querySelectorAll('[data-value]').forEach((item) => {
      item.classList.toggle('is-active', item === button);
    });
    audio.play('move');
  });

  dom.langMode?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-value]');
    if (!button || button.dataset.value === getLang()) return;
    switchLanguage(button.dataset.value);
  });

  dom.soulColors?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-color]');
    if (!button) return;
    if (button.dataset.locked === 'true' || button.classList.contains('is-locked')) {
      audio.play('error');
      toast(t('settings.soulLocked'), 'error', 5200);
      return;
    }
    setSetting('soul', button.dataset.color);
    syncSouls();
    audio.play('select');
  });

  dom.resetBtn?.addEventListener('click', async () => {
    audio.play('move');
    const yes = await confirmDialog({
      title: t('settings.reset.title'),
      text: t('settings.reset.text'),
      confirmLabel: t('settings.reset.confirm'),
      cancelLabel: t('common.cancel'),
      danger: true
    });
    if (!yes) return;
    resetAllData();
    try { await clearMods(); } catch { /* ignore */ }
    toast(t('settings.reset.done'), 'ok', 2000);
    setTimeout(() => location.reload(), 650);
  });
}

/* ------------------------------------------------------------------ */
/* top bar                                                            */
/* ------------------------------------------------------------------ */

function bindTopbar() {
  dom.langBtn?.addEventListener('click', () => {
    audio.unlock();
    audio.play('move');
    switchLanguage(getLang() === 'ru' ? 'en' : 'ru');
  });

  dom.soundBtn?.addEventListener('click', () => {
    audio.unlock();
    const muted = !getSettings().muted;
    setSetting('muted', muted);
    applyVolumes();
    updateSoundButton();
    if (!muted) audio.play('select');
  });

  dom.fullscreenBtn?.addEventListener('click', async () => {
    audio.unlock();
    audio.play('select');
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen?.({ navigationUI: 'hide' });
      } else {
        await document.exitFullscreen?.();
      }
    } catch {
      toast(getLang() === 'ru' ? 'Полный экран недоступен.' : 'Fullscreen is not available.', 'error');
    }
  });

  document.addEventListener('fullscreenchange', () => {
    dom.fullscreenBtn?.setAttribute('aria-pressed', String(Boolean(document.fullscreenElement)));
  });
}

/* ------------------------------------------------------------------ */
/* static bindings                                                    */
/* ------------------------------------------------------------------ */

function bindStatic() {
  menuItems.length = 0;
  document.querySelectorAll('.menu-item').forEach((item, index) => {
    menuItems.push(item);
    item.addEventListener('mouseenter', () => {
      if (menuIndex !== index) selectMenu(index);
    });
    item.addEventListener('focus', () => {
      if (menuIndex !== index) selectMenu(index, { silent: true });
    });
    item.addEventListener('click', () => {
      menuIndex = index;
      activateMenu(item.dataset.action);
    });
  });

  document.querySelectorAll('[data-back]').forEach((button) => {
    button.addEventListener('click', () => {
      if (currentView === 'mods') leaveMods();
      else if (currentView === 'settings') leaveSettings();
      else showLauncher();
    });
  });

  document.querySelectorAll('.menu-touch [data-dir]').forEach((button) => {
    const press = (event) => {
      event.preventDefault();
      button.classList.add('is-down');
      if (navigator.vibrate) navigator.vibrate(6);
      if (button.dataset.dir === 'up' || button.dataset.dir === 'left') moveMenu(-1);
      else moveMenu(1);
    };
    const release = () => button.classList.remove('is-down');
    button.addEventListener('pointerdown', press);
    button.addEventListener('pointerup', release);
    button.addEventListener('pointercancel', release);
    button.addEventListener('pointerleave', release);
    button.addEventListener('contextmenu', (event) => event.preventDefault());
  });

  document.querySelectorAll('.menu-touch [data-act]').forEach((button) => {
    const press = (event) => {
      event.preventDefault();
      button.classList.add('is-down');
      if (navigator.vibrate) navigator.vibrate(8);
      if (button.dataset.act === 'a') activateMenu();
      else audio.play('back');
    };
    const release = () => button.classList.remove('is-down');
    button.addEventListener('pointerdown', press);
    button.addEventListener('pointerup', release);
    button.addEventListener('pointercancel', release);
    button.addEventListener('pointerleave', release);
    button.addEventListener('contextmenu', (event) => event.preventDefault());
  });

  dom.demoQuit?.addEventListener('click', () => {
    audio.play('select');
    quitDemo();
  });
  dom.demoPause?.addEventListener('click', () => {
    audio.play('move');
    demo?.pause();
  });

  window.addEventListener('utl:settings', () => {
    syncSettingsUI();
    updateMenuStatus();
  });

  window.addEventListener('resize', () => {
    if (currentView === 'demo') demo?.updateRotateHint?.();
  });

  document.addEventListener('keydown', onGlobalKeyDown, { passive: false });
}

function onGlobalKeyDown(event) {
  if (isModalOpen()) return;
  const target = event.target;
  const tag = target?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
  const key = event.key;

  if (currentView === 'launcher') {
    if (tag === 'BUTTON' && (key === 'Enter' || key === ' ')) return;
    if (key === 'ArrowUp' || key === 'w' || key === 'W' || key === 'ц' || key === 'Ц') {
      event.preventDefault();
      moveMenu(-1);
    } else if (key === 'ArrowDown' || key === 's' || key === 'S' || key === 'ы' || key === 'Ы') {
      event.preventDefault();
      moveMenu(1);
    } else if (key === 'Enter' || key === ' ' || key === 'z' || key === 'Z' || key === 'я' || key === 'Я') {
      event.preventDefault();
      activateMenu();
    } else if (key === 'c' || key === 'C' || key === 'с' || key === 'С') {
      event.preventDefault();
      activateMenu('mods');
    } else if (key === 'x' || key === 'X' || key === 'ч' || key === 'Ч') {
      event.preventDefault();
      audio.play('back');
    }
    return;
  }

  if (currentView === 'settings') {
    if (key === 'Escape' || key === 'x' || key === 'X') {
      event.preventDefault();
      leaveSettings();
    }
    return;
  }

  if (currentView === 'mods') {
    if (key === 'Escape' || key === 'x' || key === 'X') {
      event.preventDefault();
      leaveMods();
    } else if (key === '/' && !event.metaKey && !event.ctrlKey) {
      const browsePane = $('browsePane');
      if (browsePane && !browsePane.classList.contains('is-hidden')) {
        event.preventDefault();
        focusSearch();
      }
    }
    return;
  }

  if (currentView === 'demo') {
    if (key === 'Escape') demo?.pause();
  }
}

/* ------------------------------------------------------------------ */
/* active pack / android                                              */
/* ------------------------------------------------------------------ */

function applyActiveRecord(record) {
  if (record?.pack) {
    activeRecord = record;
    activePack = record.pack;
  } else {
    activeRecord = null;
    activePack = DEFAULT_PACK;
  }
  updateMenuStatus();
}

async function hydrateActivePack() {
  const settings = getSettings();
  if (!settings.activePack) {
    applyActiveRecord(null);
    return;
  }
  try {
    const record = await getMod(settings.activePack);
    applyActiveRecord(record);
  } catch {
    applyActiveRecord(null);
  }
}

function setupAndroidCard() {
  if (isAndroidWebView) {
    const card = document.querySelector('.android-card');
    const link = card?.querySelector('.side-link');
    if (dom.apkSize) {
      dom.apkSize.textContent = getLang() === 'ru'
        ? 'ANDROID-СБОРКА · WEBVIEW'
        : 'ANDROID BUILD · WEBVIEW';
    }
    if (link) {
      link.removeAttribute('href');
      link.removeAttribute('download');
      link.setAttribute('role', 'button');
      link.addEventListener('click', (event) => {
        event.preventDefault();
        audio.play('select');
        toast(getLang() === 'ru' ? t('about.apk.active') : 'You are already running the Android build.', 'ok');
      });
    }
    return;
  }

  fetch('./downloads/undertale-launcher.apk', { method: 'HEAD' })
    .then((response) => {
      if (!response.ok) throw new Error('missing');
      const size = Number(response.headers.get('content-length')) || 0;
      if (size && dom.apkSize) {
        const mb = (size / (1024 * 1024)).toFixed(1);
        dom.apkSize.textContent = `${mb} MB · ANDROID 7.0+`;
      }
    })
    .catch(() => {
      if (dom.apkSize) dom.apkSize.textContent = 'ANDROID 7.0+ · WEBVIEW';
    });
}

function setupExitBridge() {
  window.utlAndroidBack = () => {
    if (isModalOpen()) {
      closeModal();
      return true;
    }
    if (!bootDone) {
      finishBoot(true);
      return true;
    }
    if (currentView === 'demo') {
      demo?.pause();
      return true;
    }
    if (currentView === 'settings') {
      leaveSettings();
      return true;
    }
    if (currentView === 'mods') {
      leaveMods();
      return true;
    }
    return false;
  };
}

/* ------------------------------------------------------------------ */
/* boot sequence                                                      */
/* ------------------------------------------------------------------ */

async function main() {
  const settings = getSettings();
  setLang(settings.lang);
  applySettings();
  applyI18n();
  celebrated = Boolean(settings.cleared);

  dom.bootScreen = $('bootScreen');
  dom.bootBar = $('bootBar');
  dom.bootLog = $('bootLog');
  dom.bootSkip = $('bootSkip');
  dom.launcherView = $('launcherView');
  dom.settingsView = $('settingsView');
  dom.modsView = $('modsView');
  dom.demoView = $('demoView');
  dom.heroQuote = $('heroQuote');
  dom.activeModName = $('activeModName');
  dom.activeModStatus = $('activeModStatus');
  dom.hudPackName = $('hudPackName');
  dom.clearBadge = $('clearBadge');
  dom.apkSize = $('apkSize');
  dom.langBtn = $('langBtn');
  dom.langLabel = $('langLabel');
  dom.soundBtn = $('soundBtn');
  dom.fullscreenBtn = $('fullscreenBtn');
  dom.musicRange = $('musicRange');
  dom.musicOut = $('musicOut');
  dom.sfxRange = $('sfxRange');
  dom.sfxOut = $('sfxOut');
  dom.opacityRange = $('opacityRange');
  dom.opacityOut = $('opacityOut');
  dom.crtToggle = $('crtToggle');
  dom.shakeToggle = $('shakeToggle');
  dom.leftyToggle = $('leftyToggle');
  dom.motionToggle = $('motionToggle');
  dom.touchMode = $('touchMode');
  dom.langMode = $('langMode');
  dom.soulColors = $('soulColors');
  dom.resetBtn = $('resetBtn');
  dom.demoQuit = $('demoQuit');
  dom.demoPause = $('demoPause');
  dom.gameCanvas = $('gameCanvas');

  scene = new RuinsScene($('bgCanvas'));
  scene.setMotion(!settings.motion);
  scene.start();

  bindStatic();
  bindTopbar();
  bindSettings();
  syncSettingsUI();
  updateLanguageLabel();
  updateGoldSoul(settings.cleared);
  updateMenuStatus();
  applyVolumes();
  setupAndroidCard();
  setupExitBridge();

  document.title = settings.lang === 'ru'
    ? 'UNDERTALE LAUNCHER // Пиксельное издание'
    : 'UNDERTALE LAUNCHER // Pixel Edition';

  startBoot();

  const unlock = () => {
    audio.unlock();
    applyVolumes();
  };
  window.addEventListener('pointerdown', unlock, { once: true, passive: true });
  window.addEventListener('keydown', unlock, { once: true });

  try {
    await initMods({
      onLibraryChange: (installed, activeId) => {
        const record = installed.find((mod) => mod.id === activeId) || null;
        applyActiveRecord(record?.pack ? record : null);
      },
      onActivePackChange: (record) => applyActiveRecord(record)
    });
  } catch (error) {
    console.warn('Mod library failed to initialise:', error);
  }

  await hydrateActivePack();
  updateMenuStatus();
  finishBoot();
}

main().catch((error) => {
  console.error(error);
  const screen = document.getElementById('bootScreen');
  if (screen) {
    screen.classList.add('is-done');
    screen.style.display = 'none';
  }
  toast('Failed to start the launcher. Check the console.', 'error', 8000);
});
