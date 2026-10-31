/* SOUL LINK — launcher shell, routing, settings, input and ambient world. */
(function () {
  'use strict';

  const t = function (key, vars) { return SL.i18n.t(key, vars); };
  const $ = function (id) { return document.getElementById(id); };
  const $$ = function (selector, root) { return Array.from((root || document).querySelectorAll(selector)); };

  const appState = {
    view: 'home',
    booted: false,
    gameMounted: false,
    modalOpen: false,
    modalResolve: null,
    lastFocus: null,
    dragDepth: 0,
    searchTimer: null,
    apkBytes: 0,
    clockTimer: null
  };

  const isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0) || window.matchMedia('(pointer: coarse)').matches;
  const isAndroidApp = /SoulLinkAndroid/i.test(navigator.userAgent);

  /* ── Toast ───────────────────────────────────────────────── */

  function toast(title, message, type, iconName) {
    const region = $('toast-region');
    if (!region) return;
    const node = document.createElement('div');
    node.className = 'toast' + (type ? ' is-' + type : '');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'icon');
    svg.setAttribute('aria-hidden', 'true');
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', '#i-' + (iconName || (type === 'success' ? 'check' : type === 'error' || type === 'warning' ? 'warning' : 'spark')));
    svg.appendChild(use);
    const copy = document.createElement('div');
    const strong = document.createElement('strong');
    strong.textContent = title || '';
    copy.appendChild(strong);
    if (message) {
      const span = document.createElement('span');
      span.textContent = message;
      copy.appendChild(span);
    }
    node.appendChild(svg);
    node.appendChild(copy);
    region.appendChild(node);
    while (region.children.length > 4) region.removeChild(region.firstElementChild);
    const remove = function () {
      if (!node.parentNode) return;
      node.classList.add('is-out');
      setTimeout(function () { if (node.parentNode) node.remove(); }, 240);
    };
    node.addEventListener('click', remove);
    setTimeout(remove, type === 'error' ? 6200 : 4200);
  }

  /* ── Modal ───────────────────────────────────────────────── */

  function openModal(content, options) {
    const layer = $('modal-layer');
    const body = $('modal-body');
    if (!layer || !body) return;
    appState.lastFocus = document.activeElement;
    appState.modalOpen = true;
    if (appState.modalResolve) { appState.modalResolve(false); appState.modalResolve = null; }
    body.textContent = '';
    if (typeof content === 'string') {
      const wrapper = document.createElement('div');
      wrapper.textContent = content;
      body.appendChild(wrapper);
    } else {
      body.appendChild(content);
    }
    const dialog = layer.querySelector('.modal');
    if (dialog) dialog.setAttribute('aria-label', (options && options.label) || '');
    layer.hidden = false;
    document.body.classList.add('modal-open');
    const close = layer.querySelector('.modal-close');
    if (close) {
      close.setAttribute('aria-label', t('modal.close'));
      setTimeout(function () { close.focus(); }, 30);
    }
    document.addEventListener('keydown', modalKeydown, true);
  }

  function closeModal(result) {
    const layer = $('modal-layer');
    if (!layer || layer.hidden) {
      if (appState.modalResolve) {
        const r = appState.modalResolve;
        appState.modalResolve = null;
        r(false);
      }
      return;
    }
    layer.hidden = true;
    appState.modalOpen = false;
    document.body.classList.remove('modal-open');
    document.removeEventListener('keydown', modalKeydown, true);
    const body = $('modal-body');
    if (body) body.textContent = '';
    if (appState.modalResolve) {
      const resolve = appState.modalResolve;
      appState.modalResolve = null;
      resolve(result === true);
    }
    if (appState.lastFocus && typeof appState.lastFocus.focus === 'function') {
      try { appState.lastFocus.focus(); } catch (_) {}
    }
    appState.lastFocus = null;
  }

  function modalKeydown(e) {
    if (!appState.modalOpen) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      closeModal(false);
      return;
    }
    if (e.key !== 'Tab') return;
    const layer = $('modal-layer');
    if (!layer) return;
    const focusables = $$('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])', layer)
      .filter(function (node) { return node.offsetParent !== null; });
    if (!focusables.length) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  function confirmDialog(opts) {
    const box = document.createElement('div');
    box.className = 'confirm-box';
    const icon = document.createElement('div');
    icon.className = 'confirm-icon';
    icon.innerHTML = '<svg class="icon" aria-hidden="true"><use href="#i-' + (opts.icon || 'warning') + '"></use></svg>';
    const h = document.createElement('h2');
    h.textContent = opts.title || '';
    const p = document.createElement('p');
    p.textContent = opts.copy || '';
    const actions = document.createElement('div');
    actions.className = 'confirm-actions';
    const cancel = document.createElement('button');
    cancel.className = 'pixel-button ghost';
    cancel.type = 'button';
    cancel.textContent = opts.cancelText || t('common.cancel');
    const ok = document.createElement('button');
    ok.className = 'pixel-button ' + (opts.danger ? 'danger' : 'primary');
    ok.type = 'button';
    ok.textContent = opts.confirmText || t('common.confirm');
    actions.appendChild(cancel);
    actions.appendChild(ok);
    box.appendChild(icon);
    box.appendChild(h);
    box.appendChild(p);
    box.appendChild(actions);
    openModal(box, { label: opts.title });
    return new Promise(function (resolve) {
      appState.modalResolve = resolve;
      cancel.addEventListener('click', function () { closeModal(false); });
      ok.addEventListener('click', function () { closeModal(true); });
      setTimeout(function () { ok.focus(); }, 40);
    });
  }

  /* ── Routing ─────────────────────────────────────────────── */

  function navigate(view, options) {
    const target = ['home', 'game', 'settings', 'mods'].indexOf(view) >= 0 ? view : 'home';
    if (appState.modalOpen) closeModal(false);
    if (appState.view === 'game' && target !== 'game') stopGame();
    appState.view = target;
    $$('.view').forEach(function (section) {
      const active = section.getAttribute('data-view') === target;
      section.hidden = !active;
      section.classList.toggle('is-active', active);
    });
    document.body.classList.toggle('is-playing', target === 'game');
    document.body.classList.remove('modal-open');
    const stage = $('main-stage');
    if (stage) stage.scrollTop = 0;
    window.scrollTo(0, 0);
    if (target === 'game') startGame();
    if (target === 'settings') refreshSettingsUI();
    if (target === 'mods') {
      if (options && options.tab) SL.mods.setTab(options.tab);
      SL.mods.updateCounts();
    }
    if (target !== 'game') {
      const heading = document.querySelector('#view-' + target + ' h1, #view-' + target + ' h2');
      if (heading) {
        heading.setAttribute('tabindex', '-1');
        setTimeout(function () { try { heading.focus({ preventScroll: true }); } catch (_) {} }, 60);
      }
    }
    setStatus(target === 'home' ? t('footer.ready') : target === 'mods' ? 'GAMEBANANA // 5506' : target === 'settings' ? 'SYSTEM CONFIG' : 'THE SEAM');
    try {
      if (location.protocol !== 'file:') history.replaceState(null, '', '#' + target);
    } catch (_) {}
  }

  /* Hardware back button inside the Android wrapper. */
  window.SLAndroidBack = function () {
    if (appState.modalOpen) {
      closeModal(false);
      return 'handled';
    }
    if (appState.view === 'game') {
      if (SL.game && SL.game.mode() === 'paused') {
        SL.game.resume();
        return 'handled';
      }
      stopGame();
      navigate('home');
      return 'handled';
    }
    if (appState.view !== 'home') {
      navigate('home');
      return 'handled';
    }
    return 'exit';
  };

  function startGame() {
    const canvas = $('game-canvas');
    if (!canvas) return;
    if (!appState.gameMounted) {
      SL.game.mount(canvas);
      appState.gameMounted = true;
    }
    document.body.classList.add('is-playing');
    SL.game.start();
    try { canvas.focus({ preventScroll: true }); } catch (_) {}
    updateGameChrome();
  }

  function stopGame() {
    if (appState.gameMounted) SL.game.stop();
    document.body.classList.remove('is-playing');
    SL.game.clearKeys();
    document.querySelectorAll('.dpad-btn.is-pressed, .round-btn.is-pressed').forEach(function (b) { b.classList.remove('is-pressed'); });
  }

  function updateGameChrome() {
    const active = SL.store.themeMod();
    const name = active ? active.name : 'VANILLA';
    const hud = $('hud-mod');
    const chip = $('game-mod-chip');
    if (hud) hud.textContent = name;
    if (chip) chip.textContent = name;
  }

  /* ── Settings ────────────────────────────────────────────── */

  function refreshSettingsUI() {
    const s = SL.store.settings;
    setRange('master-volume', 'master-volume-out', s.master);
    setRange('music-volume', 'music-volume-out', s.music);
    setRange('sfx-volume', 'sfx-volume-out', s.sfx);
    $$('[data-setting]').forEach(function (btn) {
      const key = btn.getAttribute('data-setting');
      const value = !!s[key];
      btn.setAttribute('aria-checked', value ? 'true' : 'false');
    });
    const lang = SL.i18n.lang;
    $$('#language-switch [data-lang]').forEach(function (btn) {
      btn.classList.toggle('is-active', btn.getAttribute('data-lang') === lang);
      btn.setAttribute('aria-pressed', btn.getAttribute('data-lang') === lang ? 'true' : 'false');
    });
    const count = $('settings-mod-count');
    if (count) count.textContent = String(SL.store.mods.length);
    const storage = $('settings-storage');
    if (storage) storage.textContent = SL.store.formatBytes(SL.store.totalBytes());
    const profile = $('settings-profile');
    if (profile) {
      profile.textContent = SL.store.themeName();
      profile.classList.toggle('is-accent', !!SL.store.themeMod());
    }
    syncSound();
  }

  function setRange(inputId, outputId, value) {
    const input = $(inputId);
    const out = $(outputId);
    if (input) {
      input.value = String(value);
      input.style.setProperty('--fill', value + '%');
    }
    if (out) out.textContent = String(value);
  }

  function syncSound() {
    const muted = SL.store.settings.muted;
    document.body.classList.toggle('is-muted', muted);
    const btn = $('sound-toggle');
    if (btn) btn.setAttribute('aria-pressed', muted ? 'false' : 'true');
  }

  function applyAudioSettings() {
    const s = SL.store.settings;
    SL.audio.setVolumes({ master: s.master, music: s.music, sfx: s.sfx, muted: s.muted });
  }

  /* ── Mods view wiring ────────────────────────────────────── */

  function wireMods() {
    $$('[data-mods-tab]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        SL.mods.setTab(btn.getAttribute('data-mods-tab'));
        if (SL.audio) SL.audio.sfx('move');
      });
    });
    const search = $('mod-search');
    if (search) {
      search.addEventListener('input', function () {
        if (appState.searchTimer) clearTimeout(appState.searchTimer);
        appState.searchTimer = setTimeout(function () { SL.mods.setQuery(search.value); }, 130);
      });
    }
    const sort = $('mod-sort');
    if (sort) sort.addEventListener('change', function () { SL.mods.setSort(sort.value); });
    $$('[data-filter]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        SL.mods.setCategory(btn.getAttribute('data-filter'));
        if (SL.audio) SL.audio.sfx('move');
      });
    });
    const drop = $('import-panel');
    const dropOverlay = $('drop-overlay');
    const view = $('view-mods');
    if (view) {
      ['dragenter', 'dragover'].forEach(function (event) {
        view.addEventListener(event, function (e) {
          if (!e.dataTransfer || Array.prototype.indexOf.call(e.dataTransfer.types || [], 'Files') < 0) return;
          e.preventDefault();
          appState.dragDepth += 1;
          if (drop) drop.classList.add('is-drag');
          if (dropOverlay) dropOverlay.hidden = false;
        });
      });
      ['dragleave', 'drop'].forEach(function (event) {
        view.addEventListener(event, function (e) {
          if (event === 'drop') e.preventDefault();
          appState.dragDepth = Math.max(0, appState.dragDepth - 1);
          if (appState.dragDepth === 0) {
            if (drop) drop.classList.remove('is-drag');
            if (dropOverlay) dropOverlay.hidden = true;
          }
          if (event === 'drop') {
            const files = e.dataTransfer && e.dataTransfer.files;
            if (files && files.length) SL.mods.installLocalFile(files[0]);
          }
        });
      });
    }
  }

  /* ── Actions ─────────────────────────────────────────────── */

  function handleAction(action) {
    switch (action) {
      case 'go-home':
        if (SL.audio) SL.audio.sfx('back');
        stopGame();
        navigate('home');
        break;
      case 'new-game':
        if (SL.audio) SL.audio.sfx('confirm');
        navigate('game');
        break;
      case 'open-settings':
        if (SL.audio) SL.audio.sfx('confirm');
        stopGame();
        navigate('settings');
        break;
      case 'open-mods':
        if (SL.audio) SL.audio.sfx('confirm');
        stopGame();
        navigate('mods');
        break;
      case 'sound-toggle': {
        const next = !SL.store.settings.muted;
        SL.store.saveSettings({ muted: next });
        if (SL.audio) {
          SL.audio.setMuted(next);
          if (!next) { SL.audio.unlock(); SL.audio.sfx('confirm'); }
        }
        syncSound();
        toast(next ? t('settings.mute') : t('common.ready'), '', next ? 'warning' : 'success', next ? 'sound-off' : 'sound-on');
        break;
      }
      case 'fullscreen': {
        toggleFullscreen();
        break;
      }
      case 'featured-open':
        SL.mods.openFeatured();
        break;
      case 'import-file': {
        const input = $('mod-file-input');
        if (input) input.click();
        break;
      }
      case 'install-demo':
        SL.mods.installDemo();
        break;
      case 'load-more':
        SL.mods.loadMore();
        break;
      case 'clear-filters':
        SL.mods.setQuery('');
        SL.mods.setCategory('all');
        const search = $('mod-search');
        if (search) search.value = '';
        break;
      case 'browse-mods':
        SL.mods.setTab('browse');
        break;
      case 'reset-data':
        confirmDialog({
          title: t('settings.resetTitle'),
          copy: t('settings.resetCopy'),
          confirmText: t('settings.resetConfirm'),
          cancelText: t('common.cancel'),
          danger: true,
          icon: 'trash'
        }).then(function (ok) {
          if (!ok) return;
          SL.store.resetAll().then(function () {
            refreshSettingsUI();
            SL.mods.renderAll();
            SL.i18n.apply(document);
            if (SL.audio) SL.audio.sfx('delete');
            toast(t('settings.resetDone'), '', 'success', 'check');
            navigate('home');
          });
        });
        break;
      case 'pause':
        if (SL.game.isRunning() && !SL.game.isPaused()) SL.game.pause();
        break;
      case 'resume':
        SL.game.resume();
        break;
      case 'pause-settings':
        stopGame();
        navigate('settings');
        break;
      case 'game-menu':
        stopGame();
        navigate('home');
        break;
      case 'retry':
        SL.game.retry();
        break;
      case 'replay':
        SL.game.retry();
        break;
      default:
        break;
    }
  }

  function toggleFullscreen() {
    const root = document.documentElement;
    try {
      if (!document.fullscreenElement) {
        if (root.requestFullscreen) root.requestFullscreen();
        else if (root.webkitRequestFullscreen) root.webkitRequestFullscreen();
      } else {
        if (document.exitFullscreen) document.exitFullscreen();
        else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
      }
    } catch (_) {}
  }

  /* ── Input ───────────────────────────────────────────────── */

  function isEditable(target) {
    if (!target) return false;
    const tag = target.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
  }

  function menuItems() { return $$('#main-menu .menu-item'); }

  function moveMenuFocus(delta) {
    const items = menuItems();
    if (!items.length) return;
    const index = items.indexOf(document.activeElement);
    let next = index < 0 ? (delta > 0 ? 0 : items.length - 1) : index + delta;
    if (next < 0) next = items.length - 1;
    if (next >= items.length) next = 0;
    items[next].focus();
    items[next].classList.add('is-bump');
    setTimeout(function () { items[next].classList.remove('is-bump'); }, 180);
    if (SL.audio) SL.audio.sfx('move');
  }

  function keydown(e) {
    if (appState.modalOpen) return;
    const target = e.target;
    if (isEditable(target)) {
      if (e.key === 'Escape') { target.blur(); }
      return;
    }
    const key = e.key;
    if (appState.view === 'game') {
      const map = {
        ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
        w: 'up', W: 'up', s: 'down', S: 'down', a: 'left', A: 'left', d: 'right', D: 'right'
      };
      if (map[key]) {
        e.preventDefault();
        SL.game.setDirection(map[key], true);
        return;
      }
      if (key === 'Enter' || key === ' ' || key === 'z' || key === 'Z') {
        e.preventDefault();
        if (!e.repeat) SL.game.action();
        return;
      }
      if (key === 'Escape' || key === 'x' || key === 'X' || key === 'Backspace') {
        e.preventDefault();
        if (SL.game.mode() === 'dead' || SL.game.mode() === 'complete') return;
        SL.game.cancel();
        return;
      }
      return;
    }

    if (key === 'Escape') {
      if (appState.view !== 'home') {
        e.preventDefault();
        if (SL.audio) SL.audio.sfx('back');
        navigate('home');
      }
      return;
    }
    if (appState.view === 'mods' && key === '/') {
      const search = $('mod-search');
      if (search) { e.preventDefault(); search.focus(); search.select(); }
      return;
    }
    if (appState.view === 'home') {
      if (key === 'ArrowDown' || key === 'ArrowUp') {
        e.preventDefault();
        moveMenuFocus(key === 'ArrowDown' ? 1 : -1);
        return;
      }
      if (key === 'Enter' || key === ' ') {
        const active = document.activeElement;
        if (active && active.classList.contains('menu-item')) {
          e.preventDefault();
          active.click();
        } else if (menuItems()[0]) {
          e.preventDefault();
          menuItems()[0].click();
        }
        return;
      }
      if (key === 'm' || key === 'M') { handleAction('open-mods'); return; }
      if (key === 's' || key === 'S') { handleAction('open-settings'); return; }
      if (key === 'n' || key === 'N') { handleAction('new-game'); return; }
      if (key === 'f' || key === 'F') { toggleFullscreen(); return; }
    }
  }

  function keyup(e) {
    if (appState.view !== 'game') return;
    const map = {
      ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
      w: 'up', W: 'up', s: 'down', S: 'down', a: 'left', A: 'left', d: 'right', D: 'right'
    };
    if (map[e.key]) SL.game.setDirection(map[e.key], false);
  }

  function wireTouchControls() {
    $$('.dpad-btn').forEach(function (btn) {
      const dir = btn.getAttribute('data-dir');
      const press = function (e) {
        e.preventDefault();
        try { btn.setPointerCapture(e.pointerId); } catch (_) {}
        btn.classList.add('is-pressed');
        SL.game.setDirection(dir, true);
        vibrate(6);
      };
      const release = function (e) {
        if (e) e.preventDefault();
        btn.classList.remove('is-pressed');
        SL.game.setDirection(dir, false);
      };
      btn.addEventListener('pointerdown', press);
      btn.addEventListener('pointerup', release);
      btn.addEventListener('pointercancel', release);
      btn.addEventListener('lostpointercapture', release);
      btn.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    });
    $$('.round-btn').forEach(function (btn) {
      const kind = btn.getAttribute('data-btn');
      const press = function (e) {
        e.preventDefault();
        btn.classList.add('is-pressed');
        vibrate(10);
        if (kind === 'a') SL.game.action();
        else SL.game.cancel();
      };
      const release = function (e) {
        if (e) e.preventDefault();
        btn.classList.remove('is-pressed');
      };
      btn.addEventListener('pointerdown', press);
      btn.addEventListener('pointerup', release);
      btn.addEventListener('pointercancel', release);
      btn.addEventListener('pointerleave', release);
      btn.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    });
  }

  function vibrate(ms) {
    if (!SL.store.settings.haptics) return;
    if (navigator.vibrate) {
      try { navigator.vibrate(ms); } catch (_) {}
    }
  }

  function wireSettings() {
    $$('[data-setting]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const key = btn.getAttribute('data-setting');
        const current = !!SL.store.settings[key];
        const next = !current;
        const patch = {};
        patch[key] = next;
        SL.store.saveSettings(patch);
        btn.setAttribute('aria-checked', next ? 'true' : 'false');
        if (SL.audio) {
          if (key === 'muted') SL.audio.setMuted(next);
          else SL.audio.sfx('move');
        }
        if (key === 'muted') syncSound();
        if (key === 'reduceMotion') {
          // keep the ambient canvas consistent with the setting
          restartAmbient();
        }
      });
    });
    [['master-volume', 'master-volume-out', 'master'], ['music-volume', 'music-volume-out', 'music'], ['sfx-volume', 'sfx-volume-out', 'sfx']].forEach(function (spec) {
      const input = $(spec[0]);
      const out = $(spec[1]);
      if (!input) return;
      input.addEventListener('input', function () {
        const value = Number(input.value) || 0;
        if (out) out.textContent = String(value);
        input.style.setProperty('--fill', value + '%');
        const patch = {};
        patch[spec[2]] = value;
        SL.store.saveSettings(patch);
        const s = SL.store.settings;
        SL.audio.setVolumes({ master: s.master, music: s.music, sfx: s.sfx, muted: s.muted });
      });
    });
    const langSwitch = $('language-switch');
    if (langSwitch) {
      langSwitch.addEventListener('click', function (e) {
        const btn = e.target.closest('[data-lang]');
        if (!btn) return;
        const next = btn.getAttribute('data-lang');
        if (SL.i18n.setLang(next)) {
          SL.i18n.apply(document);
          SL.mods.refreshLanguage();
          refreshSettingsUI();
          updateCounts();
          if (SL.audio) SL.audio.sfx('confirm');
          toast(t('settings.languageChanged'), '', 'success', 'globe');
        }
      });
    }
  }

  /* ── Ambient background ──────────────────────────────────── */

  let ambient = null;

  function initAmbient() {
    const canvas = $('ambient-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const particles = [];
    const count = 62;
    for (let i = 0; i < count; i++) {
      particles.push({
        x: Math.random(), y: Math.random(),
        size: Math.random() < 0.76 ? 1 : 2,
        speed: 0.006 + Math.random() * 0.02,
        drift: (Math.random() - 0.5) * 0.004,
        alpha: 0.08 + Math.random() * 0.34,
        gold: Math.random() < 0.17,
        phase: Math.random() * Math.PI * 2
      });
    }
    let raf = null;
    let last = 0;
    let w = 0, h = 0, dpr = 1;
    function resize() {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = Math.max(1, Math.floor(w * dpr));
      canvas.height = Math.max(1, Math.floor(h * dpr));
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingEnabled = false;
    }
    function frame(now) {
      if (!last) last = now;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      raf = requestAnimationFrame(frame);
      const reduce = SL.store.settings.reduceMotion;
      ctx.clearRect(0, 0, w, h);
      const palette = SL.store.currentPalette();
      const accent = (palette && palette.accent) || '#ff3355';
      const gold = (palette && palette.gold) || '#ffd75e';
      // a very faint pixel heart watermark
      ctx.save();
      ctx.globalAlpha = 0.018;
      ctx.fillStyle = accent;
      const scale = Math.max(16, Math.min(30, w / 46));
      const cx = w * 0.76;
      const cy = h * 0.5 + Math.sin(now / 6000) * 10;
      const heart = [
        [4, 0, 2, 1], [10, 0, 2, 1], [3, 1, 4, 1], [9, 1, 4, 1], [2, 2, 12, 1],
        [1, 3, 14, 1], [0, 4, 16, 3], [1, 7, 14, 2], [2, 9, 12, 1], [3, 10, 10, 1],
        [4, 11, 8, 1], [5, 12, 6, 1], [6, 13, 4, 1], [7, 14, 2, 1]
      ];
      heart.forEach(function (r) { ctx.fillRect(cx + (r[0] - 8) * scale, cy + (r[1] - 7) * scale, r[2] * scale, r[3] * scale); });
      ctx.restore();

      particles.forEach(function (p) {
        if (!reduce) {
          p.y -= p.speed * dt * (0.6 + p.size * 0.3);
          p.x += p.drift * dt;
          if (p.y < -0.02) { p.y = 1.02; p.x = Math.random(); }
          if (p.x < -0.02) p.x = 1.02;
          if (p.x > 1.02) p.x = -0.02;
        }
        const twinkle = 0.55 + Math.sin(now / 900 + p.phase) * 0.45;
        ctx.globalAlpha = p.alpha * twinkle;
        ctx.fillStyle = p.gold ? gold : accent;
        ctx.fillRect(Math.floor(p.x * w), Math.floor(p.y * h), p.size, p.size);
        if (p.size === 2) {
          ctx.globalAlpha = p.alpha * twinkle * 0.3;
          ctx.fillRect(Math.floor(p.x * w) - 1, Math.floor(p.y * h) + 2, 4, 1);
        }
      });
      ctx.globalAlpha = 1;
    }
    resize();
    window.addEventListener('resize', resize);
    raf = requestAnimationFrame(frame);
    ambient = {
      stop: function () { if (raf) cancelAnimationFrame(raf); raf = null; window.removeEventListener('resize', resize); },
      restart: function () { if (ambient) ambient.stop(); initAmbient(); }
    };
  }

  function restartAmbient() {
    if (ambient) ambient.restart();
  }

  /* ── APK detection ───────────────────────────────────────── */

  function setupApk() {
    if (isAndroidApp) {
      document.body.classList.add('is-android-app');
      const hide = ['android-badge', 'apk-card', 'settings-apk-link'];
      hide.forEach(function (id) {
        const node = $(id);
        if (node) node.hidden = true;
      });
      return;
    }
    fetch('download/soul-link-launcher.apk', { method: 'HEAD' }).then(function (res) {
      if (!res.ok) {
        document.body.classList.add('no-apk');
        return;
      }
      const size = Number(res.headers.get('content-length')) || 0;
      if (size) {
        appState.apkBytes = size;
        const label = document.querySelector('#settings-apk-link span');
        if (label) label.textContent = t('common.download') + ' APK · ' + SL.store.formatBytes(size);
        const meta = document.querySelector('#apk-card .apk-copy span:last-child');
        if (meta) meta.textContent = t('common.download') + ' · 1.0.0 · ' + SL.store.formatBytes(size);
      }
    }).catch(function () {
      document.body.classList.add('no-apk');
    });
  }

  /* ── Counts / theme chrome ───────────────────────────────── */

  function updateCounts() {
    const count = SL.store.mods.length;
    ['tab-installed-count', 'mods-installed-count', 'footer-mod-count', 'settings-mod-count'].forEach(function (id) {
      const node = $(id);
      if (node) node.textContent = String(count);
    });
    const storage = $('settings-storage');
    if (storage) storage.textContent = SL.store.formatBytes(SL.store.totalBytes());
    const active = SL.store.themeMod();
    const name = active ? active.name : t('home.noMods');
    const homeName = $('home-active-mod');
    const homeMeta = $('home-mod-meta');
    if (homeName) homeName.textContent = name;
    if (homeMeta) homeMeta.textContent = active ? active.source === 'gamebanana' ? 'GAMEBANANA · ACTIVE' : active.source === 'demo' ? 'DEMO THEME · ACTIVE' : 'LOCAL FILE · ACTIVE' : 'VANILLA PROFILE';
    const profile = $('settings-profile');
    if (profile) {
      profile.textContent = SL.store.themeName();
      profile.classList.toggle('is-accent', !!active);
    }
    updateGameChrome();
  }

  /* ── Boot ────────────────────────────────────────────────── */

  function initClock() {
    const el = $('status-clock');
    if (!el) return;
    function tick() {
      const d = new Date();
      el.textContent = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    }
    tick();
    if (appState.clockTimer) clearInterval(appState.clockTimer);
    appState.clockTimer = setInterval(tick, 30000);
  }

  function setStatus(text) {
    const el = $('status-message');
    if (el) el.textContent = text;
  }

  function bindGlobalEvents() {
    document.addEventListener('click', function (e) {
      const actionEl = e.target.closest('[data-action]');
      if (actionEl) {
        e.preventDefault();
        handleAction(actionEl.getAttribute('data-action'));
        return;
      }
      const modalClose = e.target.closest('[data-modal-close]');
      if (modalClose) {
        e.preventDefault();
        closeModal(false);
      }
    });
    document.addEventListener('keydown', keydown);
    document.addEventListener('keyup', keyup);
    window.addEventListener('blur', function () {
      SL.game.clearKeys();
      document.querySelectorAll('.dpad-btn.is-pressed, .round-btn.is-pressed').forEach(function (b) { b.classList.remove('is-pressed'); });
      if (appState.view === 'game' && SL.game.isRunning() && !SL.game.isPaused() && SL.game.mode() !== 'dead' && SL.game.mode() !== 'complete') SL.game.pause();
    });
    document.addEventListener('visibilitychange', function () {
      if (document.hidden && appState.view === 'game' && SL.game.isRunning() && !SL.game.isPaused() && SL.game.mode() !== 'dead' && SL.game.mode() !== 'complete') {
        SL.game.pause();
      }
    });
    document.addEventListener('fullscreenchange', function () {
      const btn = $('fullscreen-btn');
      if (btn) btn.setAttribute('aria-pressed', document.fullscreenElement ? 'true' : 'false');
    });
    const fileInput = $('mod-file-input');
    if (fileInput) {
      fileInput.addEventListener('change', function () {
        if (fileInput.files && fileInput.files[0]) SL.mods.installLocalFile(fileInput.files[0]);
        fileInput.value = '';
      });
    }
    document.addEventListener('soullink:mods', function () {
      updateCounts();
      if (appState.view === 'mods') SL.mods.renderInstalled();
    });
    document.addEventListener('soullink:theme', function () {
      updateCounts();
      if (appState.gameMounted && SL.game.isRunning()) SL.game.refreshHud();
    });
    document.addEventListener('soullink:settings', function () {
      syncSound();
      if (appState.view === 'settings') refreshSettingsUI();
    });
    document.addEventListener('soullink:language', function () {
      SL.i18n.apply(document);
      SL.mods.refreshLanguage();
      updateCounts();
      if (appState.view === 'settings') refreshSettingsUI();
    });
    const menu = $('main-menu');
    if (menu) {
      menu.addEventListener('pointerenter', function () {}, true);
    }
    $$('.menu-item').forEach(function (item) {
      item.addEventListener('pointerenter', function () {
        if (SL.audio && SL.audio.isPlaying) SL.audio.sfx('move');
      });
    });
    // First interaction unlocks WebAudio.
    const unlock = function () {
      SL.audio.unlock();
      applyAudioSettings();
      document.removeEventListener('pointerdown', unlock, true);
      document.removeEventListener('keydown', unlock, true);
    };
    document.addEventListener('pointerdown', unlock, true);
    document.addEventListener('keydown', unlock, true);
  }

  function init() {
    SL.i18n.apply(document);
    SL.store.applySettingsClasses();
    SL.store.applyTheme();
    if (isTouch) document.body.classList.add('is-touch');
    if (isAndroidApp) document.body.classList.add('is-android-app');
    document.body.classList.toggle('show-touch-always', SL.store.settings.touchAlways);
    syncSound();
    initClock();
    initAmbient();
    setupApk();
    wireSettings();
    wireTouchControls();
    wireMods();
    bindGlobalEvents();
    SL.mods.init();
    refreshSettingsUI();
    updateCounts();
    updateGameChrome();
    setStatus(t('footer.ready'));

    const hash = (location.hash || '').replace('#', '');
    if (['home', 'settings', 'mods'].indexOf(hash) >= 0) {
      setTimeout(function () { navigate(hash); }, 40);
    }

    // Apply audio once, quietly; browsers keep it suspended until interaction.
    try { applyAudioSettings(); } catch (_) {}

    const boot = $('boot-screen');
    const bootStatus = $('boot-status');
    if (bootStatus) bootStatus.textContent = 'LINKING GAMEBANANA';
    const finishBoot = function () {
      if (appState.booted) return;
      appState.booted = true;
      if (boot) {
        boot.classList.add('is-done');
        setTimeout(function () { boot.setAttribute('aria-hidden', 'true'); }, 600);
      }
      document.body.classList.add('is-ready');
      if (bootStatus) bootStatus.textContent = 'SOUL LINK READY';
    };
    const fontsReady = (document.fonts && document.fonts.ready) ? document.fonts.ready.catch(function () {}) : Promise.resolve();
    Promise.race([
      fontsReady,
      new Promise(function (resolve) { setTimeout(resolve, 1100); })
    ]).then(function () {
      setTimeout(finishBoot, 420);
    });
    setTimeout(finishBoot, 2200);
  }

  window.SL = window.SL || {};
  SL.ui = {
    toast: toast,
    openModal: openModal,
    closeModal: closeModal,
    confirm: confirmDialog,
    navigate: navigate,
    setStatus: setStatus,
    isAndroidApp: isAndroidApp
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
