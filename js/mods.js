/* SOUL LINK — GameBanana browser, local data.win importer and mod library. */
(function () {
  'use strict';

  const API = 'https://gamebanana.com/apiv11';
  const GAME_ID = (window.SL && SL.data && SL.data.GB_GAME_ID) || 5506;
  const MAX_FILE = 220 * 1024 * 1024;
  /* GameBanana's download redirect chain drops CORS headers on the middle hop.
     The proxy only sees the public download URL and is used as a fallback. */
  const CORS_PROXY = 'https://proxy.corsfix.com/?';
  const DIRECT_TIMEOUT = 9000;
  const PROXY_TIMEOUT = 90000;
  const androidJobs = {};
  let androidSeq = 0;

  const state = {
    catalog: [],
    total: 534,
    page: 1,
    hasMore: true,
    loading: false,
    live: null,
    tab: 'browse',
    query: '',
    category: 'all',
    sort: 'featured',
    featured: null,
    detail: null,
    detailFiles: [],
    busy: false
  };

  function t(key, vars) { return SL.i18n.t(key, vars); }
  function $id(id) { return document.getElementById(id); }
  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }
  function icon(name, className) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'icon' + (className ? ' ' + className : ''));
    svg.setAttribute('aria-hidden', 'true');
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', '#i-' + name);
    svg.appendChild(use);
    return svg;
  }
  function append(parent) {
    for (let i = 1; i < arguments.length; i++) {
      if (arguments[i]) parent.appendChild(arguments[i]);
    }
    return parent;
  }
  function categoryLabel(raw) {
    const key = String(raw || 'other').toLowerCase();
    const map = SL.data.CATEGORY_LABELS[key];
    return map ? map[SL.i18n.lang] || map.en : String(raw || 'OTHER').toUpperCase();
  }
  function apiError(msg) {
    const err = new Error(msg || 'GameBanana request failed');
    err.api = true;
    return err;
  }
  function safeText(html) {
    if (!html) return '';
    try {
      const doc = new DOMParser().parseFromString(String(html), 'text/html');
      doc.querySelectorAll('script,style,iframe,video,object,embed').forEach(function (node) { node.remove(); });
      doc.querySelectorAll('br').forEach(function (node) { node.replaceWith('\n'); });
      doc.querySelectorAll('p,li,div').forEach(function (node) { node.append('\n'); });
      return doc.body.textContent
        .replace(/\r/g, '')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
        .slice(0, 4200);
    } catch (_) {
      return String(html).replace(/<[^>]*>/g, ' ').trim().slice(0, 4200);
    }
  }
  function normalize(record) {
    if (!record || !record._idRow) return null;
    const images = ((record._aPreviewMedia || {})._aImages || []).map(function (img) {
      let file = img._sFile || '';
      let base = img._sBaseUrl || '';
      if (!file && img._sUrl) return img._sUrl;
      if (!base || !file) return '';
      return base.replace(/\/$/, '') + '/' + file;
    }).filter(Boolean);
    return {
      id: Number(record._idRow),
      name: record._sName || ('Mod ' + record._idRow),
      author: (record._aSubmitter || {})._sName || t('mods.unknownAuthor'),
      authorUrl: (record._aSubmitter || {})._sProfileUrl || '',
      category: ((record._aRootCategory || {})._sName || 'other').toLowerCase(),
      version: record._sVersion || '',
      likes: record._nLikeCount || 0,
      views: record._nViewCount || 0,
      downloads: record._nDownloadCount || 0,
      thumb: images[0] || '',
      screenshots: images.slice(0, 6),
      url: record._sProfileUrl || ('https://gamebanana.com/mods/' + record._idRow),
      ts: record._tsDateAdded || 0,
      source: 'gamebanana'
    };
  }
  function mergeCatalog(list) {
    const seen = new Map();
    state.catalog.forEach(function (m) { seen.set(m.id, m); });
    list.forEach(function (m) {
      if (!m) return;
      const old = seen.get(m.id);
      if (old) Object.assign(old, m);
      else seen.set(m.id, m);
    });
    state.catalog = Array.from(seen.values());
  }
  function isInstalled(gbId) {
    return SL.store.mods.some(function (m) { return m.source === 'gamebanana' && Number(m.gbId) === Number(gbId); });
  }

  /* ── API ─────────────────────────────────────────────────── */

  async function jsonFetch(url) {
    const res = await fetch(url, {
      mode: 'cors',
      credentials: 'omit',
      headers: { Accept: 'application/json' }
    });
    if (!res.ok) throw apiError('HTTP ' + res.status);
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch (_) {
      throw apiError('Invalid GameBanana response');
    }
  }

  async function fetchFeed(page) {
    const url = API + '/Game/' + GAME_ID + '/Subfeed?_nPage=' + page + '&_sSort=default&_csvModelInclusions=Mod';
    const data = await jsonFetch(url);
    const records = Array.isArray(data._aRecords) ? data._aRecords : [];
    const meta = data._aMetadata || {};
    if (meta._nRecordCount) state.total = meta._nRecordCount;
    return {
      mods: records.map(normalize).filter(Boolean),
      total: meta._nRecordCount || state.total,
      complete: !!meta._bIsComplete,
      perPage: meta._nPerpage || records.length
    };
  }

  async function fetchDetail(gbId) {
    const [profile, files] = await Promise.all([
      jsonFetch(API + '/Mod/' + gbId + '/ProfilePage'),
      jsonFetch(API + '/Mod/' + gbId + '/Files').catch(function () { return null; })
    ]);
    const base = normalize(profile) || {};
    base.description = safeText(profile._sText || profile._sDescription || '');
    base.downloads = profile._nDownloadCount || base.downloads || 0;
    base.license = profile._sLicense || '';
    const profileImages = ((profile._aPreviewMedia || {})._aImages || []).map(function (img) {
      if (img._sUrl) return img._sUrl;
      if (img._sBaseUrl && img._sFile) return img._sBaseUrl.replace(/\/$/, '') + '/' + img._sFile;
      return '';
    }).filter(Boolean);
    if (profileImages.length) base.screenshots = profileImages.slice(0, 8);
    base.category = ((profile._aCategory || profile._aRootCategory || {})._sName || base.category || 'other').toLowerCase();
    base.version = profile._sVersion || base.version || '';
    base.files = normalizeFiles(files || profile._aFiles || []);
    return base;
  }

  function normalizeFiles(files) {
    if (!Array.isArray(files)) return [];
    return files.map(function (f) {
      return {
        id: Number(f._idRow),
        name: f._sFile || ('file-' + f._idRow),
        size: Number(f._nFilesize) || 0,
        url: f._sDownloadUrl || '',
        version: f._sVersion || '',
        description: f._sDescription || '',
        md5: f._sMd5Checksum || '',
        archived: !!f._bIsArchived,
        safe: f._sAnalysisState === 'done' && f._sAnalysisResult === 'ok',
        av: f._sAvResult || ''
      };
    }).filter(function (f) { return f.url; });
  }

  async function loadFeed(page, append) {
    if (state.loading) return;
    state.loading = true;
    setApiStatus('loading');
    try {
      const result = await fetchFeed(page);
      if (!append) state.catalog = [];
      mergeCatalog(result.mods);
      state.total = result.total || state.total;
      state.page = page;
      state.hasMore = !result.complete && result.mods.length > 0;
      state.live = true;
      setApiStatus('online');
      if (!append) chooseFeatured();
      renderAll();
    } catch (err) {
      state.live = false;
      setApiStatus('offline');
      if (!state.catalog.length) {
        state.catalog = SL.data.FALLBACK_MODS.map(function (m) { return Object.assign({}, m); });
        state.total = 534;
        state.hasMore = false;
        chooseFeatured();
        renderAll();
      }
      if (window.console) console.warn('[SOUL LINK] GameBanana feed:', err && err.message);
    } finally {
      state.loading = false;
      updateSyncLabel();
    }
  }

  function setApiStatus(kind) {
    const net = $id('net-pill');
    const netLabel = $id('net-label');
    const footerNet = $id('footer-net');
    const apiState = $id('api-state');
    const sync = $id('mods-sync');
    const labels = {
      loading: t('common.connecting'),
      online: t('common.online'),
      offline: t('common.cached')
    };
    if (net) {
      net.classList.toggle('is-online', kind === 'online');
      net.classList.toggle('is-offline', kind === 'offline');
    }
    if (netLabel) netLabel.textContent = labels[kind] || labels.loading;
    if (footerNet) {
      footerNet.classList.toggle('is-online', kind === 'online');
      footerNet.classList.toggle('is-offline', kind === 'offline');
      const span = footerNet.querySelector('span');
      if (span) span.textContent = labels[kind] || labels.loading;
    }
    if (apiState) {
      apiState.classList.toggle('is-online', kind === 'online');
      apiState.classList.toggle('is-offline', kind === 'offline');
      const span = apiState.querySelector('span');
      if (span) span.textContent = kind === 'online' ? t('mods.apiOnline') : kind === 'offline' ? t('mods.apiOffline') : t('common.connecting');
    }
    if (sync) sync.textContent = kind === 'online' ? t('mods.synced') : kind === 'offline' ? t('mods.apiFallback').toUpperCase() : t('mods.syncing');
  }
  function updateSyncLabel() {
    if (state.loading) return;
    const sync = $id('mods-sync');
    if (sync) sync.textContent = state.live ? t('mods.synced') : t('mods.apiFallback').toUpperCase();
  }

  function chooseFeatured() {
    state.featured = state.catalog.find(function (m) { return m.id === 669734; }) ||
      state.catalog.slice().sort(function (a, b) { return (b.views || 0) - (a.views || 0); })[0] || null;
    updateFeatured();
  }

  function updateFeatured() {
    const mod = state.featured;
    const card = $id('featured-card');
    if (!mod || !card) return;
    const img = $id('featured-image');
    const wrap = img ? img.closest('.featured-media') : null;
    if (img) {
      img.alt = mod.name;
      img.onload = function () { if (wrap) wrap.classList.add('has-image'); };
      img.onerror = function () { if (wrap) wrap.classList.remove('has-image'); img.removeAttribute('src'); };
      img.src = mod.thumb || '';
      if (img.complete && img.naturalWidth) wrap.classList.add('has-image');
    }
    const title = $id('featured-title');
    const author = $id('featured-author');
    const cat = $id('featured-category');
    const views = $id('featured-views');
    const likes = $id('featured-likes');
    const version = $id('featured-version');
    if (title) title.textContent = mod.name;
    if (author) author.textContent = mod.author;
    if (cat) cat.textContent = categoryLabel(mod.category);
    if (views) views.textContent = SL.store.formatNumber(mod.views);
    if (likes) likes.textContent = SL.store.formatNumber(mod.likes);
    if (version) version.textContent = mod.version || '—';
    card.classList.add('is-ready');
  }

  /* ── Render browse ──────────────────────────────────────── */

  function filteredCatalog() {
    let list = state.catalog.slice();
    if (state.category !== 'all') {
      list = list.filter(function (m) { return String(m.category).toLowerCase() === state.category; });
    }
    const q = state.query.trim().toLowerCase();
    if (q) {
      list = list.filter(function (m) {
        return (m.name + ' ' + m.author + ' ' + m.category + ' ' + m.version).toLowerCase().indexOf(q) >= 0;
      });
    }
    const sort = state.sort;
    if (sort === 'popular') list.sort(function (a, b) { return (b.views + b.likes * 40) - (a.views + a.likes * 40); });
    else if (sort === 'new') list.sort(function (a, b) { return (b.ts || 0) - (a.ts || 0); });
    else if (sort === 'name') list.sort(function (a, b) { return a.name.localeCompare(b.name); });
    else {
      const order = {};
      state.catalog.forEach(function (m, i) { order[m.id] = i; });
      list.sort(function (a, b) { return (order[a.id] || 0) - (order[b.id] || 0); });
    }
    return list;
  }

  function renderBrowse() {
    const grid = $id('mod-grid');
    if (!grid) return;
    const list = filteredCatalog();
    grid.textContent = '';
    const empty = $id('mods-empty');
    if (empty) empty.hidden = list.length > 0;
    const wrap = $id('load-more-wrap');
    if (wrap) wrap.hidden = !state.hasMore || state.live === false || list.length === 0;
    list.forEach(function (mod) { grid.appendChild(modCard(mod)); });
    if (!list.length && state.catalog.length && state.live !== false) {
      // Filter produced no matches; keep empty state.
    }
  }

  function modCard(mod) {
    const card = el('article', 'mod-card');
    card.dataset.modId = String(mod.id);
    const thumbBtn = el('button', 'mod-thumb');
    thumbBtn.type = 'button';
    thumbBtn.setAttribute('aria-label', mod.name);
    const img = document.createElement('img');
    img.loading = 'lazy';
    img.alt = '';
    img.referrerPolicy = 'no-referrer';
    if (mod.thumb) {
      img.src = mod.thumb;
      img.onload = function () { thumbBtn.classList.add('has-image'); };
      img.onerror = function () { thumbBtn.classList.add('is-broken'); img.removeAttribute('src'); };
    } else {
      thumbBtn.classList.add('is-broken');
    }
    const fallback = el('span', 'thumb-fallback');
    fallback.appendChild(icon('spark'));
    const badges = el('span', 'mod-badges');
    const srcBadge = el('span', 'mod-badge', mod.source === 'gamebanana' ? 'GB' : 'LOCAL');
    badges.appendChild(srcBadge);
    if (isInstalled(mod.id)) badges.appendChild(el('span', 'mod-badge installed', '✓'));
    const idLabel = el('span', 'mod-id', '#' + mod.id);
    append(thumbBtn, img, fallback, badges, idLabel);
    thumbBtn.addEventListener('click', function () { openDetail(mod.id); });

    const body = el('div', 'mod-body');
    const title = el('h3', 'mod-title', mod.name);
    const author = el('div', 'mod-author', t('mods.by', { author: mod.author }));
    const meta = el('div', 'mod-meta');
    const views = el('span');
    append(views, icon('eye'), document.createTextNode(SL.store.formatNumber(mod.views)));
    const likes = el('span');
    append(likes, icon('heart'), document.createTextNode(SL.store.formatNumber(mod.likes)));
    const cat = el('span', '', categoryLabel(mod.category));
    append(meta, views, likes, cat);
    const actions = el('div', 'mod-actions');
    const open = el('button', 'pixel-button small');
    open.type = 'button';
    append(open, icon('download'), el('span', '', isInstalled(mod.id) ? t('mods.installedState') : t('common.install')));
    open.addEventListener('click', function () { openDetail(mod.id); });
    const details = el('button', 'pixel-button small ghost icon-only');
    details.type = 'button';
    details.setAttribute('aria-label', t('common.details'));
    details.appendChild(icon('arrow-right'));
    details.addEventListener('click', function () { openDetail(mod.id); });
    append(actions, open, details);
    append(body, title, author, meta, actions);
    append(card, thumbBtn, body);
    return card;
  }

  /* ── Installed ──────────────────────────────────────────── */

  function kindLabel(kind) {
    if (kind === 'datawin') return t('mods.kindDatawin');
    if (kind === 'patch') return t('mods.kindPatch');
    if (kind === 'theme') return t('mods.kindTheme');
    return t('mods.kindArchive');
  }

  function renderInstalled() {
    const list = $id('installed-list');
    const empty = $id('installed-empty');
    if (!list) return;
    const mods = SL.store.mods.slice().sort(function (a, b) { return (b.installDate || 0) - (a.installDate || 0); });
    list.textContent = '';
    if (empty) empty.hidden = mods.length > 0;
    mods.forEach(function (mod) { list.appendChild(installedCard(mod)); });
    updateCounts();
  }

  function installedCard(mod) {
    const palette = SL.store.paletteFor(mod) || { accent: '#ff3355' };
    const card = el('article', 'installed-card' + (mod.active ? ' is-active' : ''));
    card.dataset.installedId = mod.id;
    card.style.setProperty('--card-accent', palette.accent);
    const thumb = el('div', 'installed-thumb');
    if (mod.thumbnail) {
      const img = document.createElement('img');
      img.src = mod.thumbnail;
      img.alt = '';
      img.referrerPolicy = 'no-referrer';
      img.onerror = function () { img.remove(); thumb.appendChild(icon('cube')); };
      thumb.appendChild(img);
    } else {
      thumb.appendChild(icon(mod.kind === 'theme' ? 'spark' : mod.kind === 'patch' ? 'file' : 'cube'));
    }

    const main = el('div', 'installed-main');
    const name = el('div', 'installed-name');
    name.appendChild(document.createTextNode(mod.name));
    if (mod.active) name.appendChild(el('span', 'status-chip', t('mods.activeState')));
    const sub = el('div', 'installed-sub');
    const source = el('span', '', mod.source === 'gamebanana' ? t('mods.sourceGb') : mod.source === 'demo' ? t('mods.demoAuthor') : t('mods.sourceLocal'));
    const kind = el('span', 'installed-kind', kindLabel(mod.kind));
    const size = el('span', '', mod.size ? SL.store.formatBytes(mod.size) : '—');
    const date = el('span', '', t('mods.installedOn', { date: SL.store.formatDate(mod.installDate) }));
    append(sub, source, kind, size, date);
    if (mod.validDataWin) {
      const valid = el('span', '', 'FORM/GEN8');
      valid.style.color = 'var(--green)';
      sub.appendChild(valid);
    }
    append(main, name, sub);

    const actions = el('div', 'installed-actions');
    const toggle = el('button', 'install-toggle' + (mod.active ? ' is-active' : ''));
    toggle.type = 'button';
    toggle.setAttribute('aria-pressed', mod.active ? 'true' : 'false');
    append(toggle, el('i'), el('span', '', mod.active ? t('common.active') : t('common.inactive')));
    toggle.addEventListener('click', function () {
      SL.store.setActive(mod.id, !mod.active);
      if (SL.audio) SL.audio.sfx(mod.active ? 'back' : 'confirm');
      SL.ui.toast(mod.active ? t('mods.deactivated') : t('mods.activated', { name: mod.name }), '', 'success', 'check');
      renderAll();
    });
    actions.appendChild(toggle);

    if (mod.blobId) {
      const exportBtn = el('button', 'icon-action');
      exportBtn.type = 'button';
      exportBtn.title = t('mods.export');
      exportBtn.setAttribute('aria-label', t('mods.export'));
      exportBtn.appendChild(icon('download'));
      exportBtn.addEventListener('click', function () { exportMod(mod); });
      actions.appendChild(exportBtn);
    }
    if (mod.sourceUrl) {
      const link = document.createElement('a');
      link.className = 'icon-action';
      link.href = mod.sourceUrl;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.title = 'GameBanana';
      link.setAttribute('aria-label', 'GameBanana');
      link.appendChild(icon('external'));
      actions.appendChild(link);
    }
    const del = el('button', 'icon-action danger');
    del.type = 'button';
    del.title = t('common.delete');
    del.setAttribute('aria-label', t('common.delete'));
    del.appendChild(icon('trash'));
    del.addEventListener('click', function () { askDelete(mod); });
    actions.appendChild(del);

    append(card, thumb, main, actions);
    return card;
  }

  function askDelete(mod) {
    SL.ui.confirm({
      title: t('mods.deleteTitle'),
      copy: t('mods.deleteCopy', { name: mod.name }),
      confirmText: t('mods.deleteButton'),
      cancelText: t('common.cancel'),
      danger: true,
      icon: 'trash'
    }).then(function (ok) {
      if (!ok) return;
      SL.store.removeMod(mod.id).then(function () {
        SL.audio.sfx('delete');
        SL.ui.toast(t('mods.deleted'), '', 'success', 'trash');
        renderAll();
      });
    });
  }

  async function exportMod(mod) {
    try {
      const blob = mod.blobId ? await SL.store.getFile(mod.blobId) : null;
      if (!blob) { SL.ui.toast(t('mods.exportUnavailable'), '', 'warning', 'warning'); return; }
      const a = document.createElement('a');
      const url = URL.createObjectURL(blob);
      a.href = url;
      a.download = mod.fileName || (mod.name.replace(/[^\w.-]+/g, '_') + '.win');
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
      SL.ui.toast(t('mods.exported'), mod.fileName || '', 'success', 'download');
    } catch (_) {
      SL.ui.toast(t('mods.exportUnavailable'), '', 'warning', 'warning');
    }
  }

  function updateCounts() {
    const mods = SL.store.mods;
    const installed = mods.length;
    const countEls = ['tab-installed-count', 'mods-installed-count', 'footer-mod-count', 'settings-mod-count'];
    countEls.forEach(function (id) {
      const node = $id(id);
      if (node) node.textContent = String(installed);
    });
    const storage = $id('settings-storage');
    if (storage) storage.textContent = SL.store.formatBytes(SL.store.totalBytes());
    const profile = $id('settings-profile');
    if (profile) profile.textContent = SL.store.themeName();
    const active = SL.store.themeMod();
    const home = $id('home-active-mod');
    const meta = $id('home-mod-meta');
    if (home) home.textContent = active ? active.name : t('home.noMods');
    if (meta) meta.textContent = active ? kindLabel(active.kind) + ' · ' + (active.source === 'gamebanana' ? 'GAMEBANANA' : active.source === 'demo' ? 'DEMO' : 'LOCAL') : 'VANILLA PROFILE';
    const hud = $id('hud-mod');
    const chip = $id('game-mod-chip');
    if (hud) hud.textContent = active ? active.name : 'VANILLA';
    if (chip) chip.textContent = active ? active.name : 'VANILLA';
    const total = $id('mods-total');
    if (total) total.textContent = SL.store.formatNumber(state.total);
    const community = $id('community-count');
    if (community) community.textContent = SL.store.formatNumber(state.total);
  }

  function renderAll() {
    renderBrowse();
    renderInstalled();
    updateCounts();
    updateFilters();
  }

  function updateFilters() {
    document.querySelectorAll('[data-filter]').forEach(function (btn) {
      btn.classList.toggle('is-active', btn.getAttribute('data-filter') === state.category);
    });
    const search = $id('mod-search');
    if (search && search.value !== state.query) search.value = state.query;
    const sort = $id('mod-sort');
    if (sort && sort.value !== state.sort) sort.value = state.sort;
  }

  function setTab(tab) {
    state.tab = tab === 'installed' ? 'installed' : 'browse';
    document.querySelectorAll('[data-mods-tab]').forEach(function (btn) {
      const active = btn.getAttribute('data-mods-tab') === state.tab;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    const browse = $id('pane-browse');
    const installed = $id('pane-installed');
    if (browse) browse.classList.toggle('is-active', state.tab === 'browse');
    if (installed) installed.classList.toggle('is-active', state.tab === 'installed');
    if (state.tab === 'installed') renderInstalled();
  }

  /* ── Detail modal ───────────────────────────────────────── */

  function modalShell(mod) {
    const root = el('div', 'mod-detail');
    const hero = el('div', 'modal-hero');
    if (mod.thumb) {
      const img = document.createElement('img');
      img.src = mod.thumb;
      img.alt = '';
      img.referrerPolicy = 'no-referrer';
      img.onload = function () { hero.classList.add('has-image'); };
      img.onerror = function () { img.remove(); hero.classList.add('is-broken'); };
      hero.appendChild(img);
    } else {
      hero.classList.add('is-broken');
    }
    const fallback = el('span', 'thumb-fallback');
    fallback.appendChild(icon('spark'));
    hero.appendChild(fallback);
    const head = el('div', 'modal-head');
    const kicker = el('div', 'modal-kicker');
    append(kicker, icon('cube'), el('span', '', 'GAMEBANANA · #' + mod.id));
    const h = el('h2', '', mod.name);
    const meta = el('div', 'modal-meta');
    const author = el('span', '', t('mods.by', { author: mod.author }));
    const cat = el('span', '', categoryLabel(mod.category));
    const ver = el('span', '', (mod.version ? t('mods.version') + ' ' + mod.version : ''));
    const views = el('span');
    append(views, icon('eye'), document.createTextNode(SL.store.formatNumber(mod.views) + ' ' + t('mods.views')));
    const likes = el('span');
    append(likes, icon('heart'), document.createTextNode(SL.store.formatNumber(mod.likes) + ' ' + t('mods.likes')));
    append(meta, author, cat, ver, views, likes);
    append(head, kicker, h, meta);
    const content = el('div', 'modal-content');
    append(root, hero, head, content);
    return { root: root, content: content, hero: hero, head: head };
  }

  async function openDetail(id) {
    const mod = state.catalog.find(function (m) { return m.id === Number(id); });
    if (!mod) return;
    state.detail = mod;
    state.detailFiles = [];
    if (SL.audio) SL.audio.sfx('confirm');
    const shell = modalShell(mod);
    state.detailShell = shell;
    const loading = el('div', 'modal-loading');
    loading.appendChild(icon('heart', 'loader-heart'));
    loading.appendChild(el('span', '', t('common.loading')));
    shell.content.appendChild(loading);
    SL.ui.openModal(shell.root, { label: mod.name });
    try {
      const detail = await fetchDetail(mod.id);
      state.detail = Object.assign({}, mod, detail);
      state.detailFiles = detail.files || [];
      renderDetail(shell, state.detail);
    } catch (err) {
      renderDetail(shell, Object.assign({}, mod, { description: '', files: [] }), true);
      SL.ui.toast(t('mods.detailError'), '', 'warning', 'warning');
    }
  }

  function renderDetail(shell, mod, failed) {
    const content = shell.content;
    content.textContent = '';
    const desc = el('div', 'modal-desc', mod.description || t('mods.descMissing'));
    content.appendChild(desc);

    if (mod.screenshots && mod.screenshots.length > 1) {
      const strip = el('div', 'modal-screens');
      mod.screenshots.slice(0, 3).forEach(function (src) {
        const img = document.createElement('img');
        img.src = src;
        img.alt = '';
        img.loading = 'lazy';
        img.referrerPolicy = 'no-referrer';
        img.onclick = function () { window.open(src, '_blank', 'noopener'); };
        strip.appendChild(img);
      });
      content.appendChild(strip);
    }

    const title = el('div', 'modal-section-title');
    append(title, icon('file'), el('span', '', failed ? t('mods.filesError') : t('mods.files')));
    content.appendChild(title);

    const files = (mod.files || []).slice().sort(function (a, b) {
      if (a.archived !== b.archived) return a.archived ? 1 : -1;
      return (b.size || 0) - (a.size || 0);
    }).slice(0, 6);

    if (!files.length) {
      const empty = el('div', 'modal-hint', failed ? t('mods.detailError') : t('mods.filesError'));
      content.appendChild(empty);
    } else {
      files.forEach(function (file) {
        content.appendChild(fileRow(mod, file));
      });
    }

    const actions = el('div', 'modal-actions');
    if (files.length) {
      const latest = files.find(function (f) { return !f.archived; }) || files[0];
      const btn = el('button', 'pixel-button primary');
      btn.type = 'button';
      append(btn, icon('download'), el('span', '', isInstalled(mod.id) ? t('mods.installedState') : t('common.install')));
      btn.addEventListener('click', function () {
        if (btn.disabled) return;
        installGameBanana(mod, latest, btn);
      });
      actions.appendChild(btn);
    }
    const link = document.createElement('a');
    link.className = 'pixel-button';
    link.href = mod.url || ('https://gamebanana.com/mods/' + mod.id);
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    append(link, icon('external'), el('span', '', t('mods.openFile')));
    actions.appendChild(link);
    const spacer = el('span', 'modal-spacer');
    actions.appendChild(spacer);
    content.appendChild(actions);
    const hint = el('p', 'modal-hint', t('mods.installedInfo') + ' ' + (failed ? t('mods.detailError') : t('legal.modCredit')));
    content.appendChild(hint);
  }

  function fileRow(mod, file) {
    const row = el('div', 'file-row');
    const info = el('div');
    const name = el('div', 'file-name', file.name);
    const meta = el('div', 'file-meta');
    meta.appendChild(el('span', '', SL.store.formatBytes(file.size)));
    if (file.version) meta.appendChild(el('span', '', 'v' + file.version.replace(/^v/i, '')));
    if (file.archived) meta.appendChild(el('span', '', t('mods.archived')));
    if (file.safe) meta.appendChild(el('span', 'ok', '✓ scanned'));
    append(info, name, meta);
    const actions = el('div', 'file-actions');
    const btn = el('button', 'pixel-button small');
    btn.type = 'button';
    append(btn, icon('download'), el('span', '', isInstalled(mod.id) ? t('mods.installedState') : t('mods.install')));
    btn.addEventListener('click', function () {
      if (btn.disabled) return;
      installGameBanana(mod, file, btn, row);
    });
    actions.appendChild(btn);
    const progress = el('div', 'progress-line');
    progress.appendChild(el('i'));
    append(row, info, actions, progress);
    return row;
  }

  function setBusyUi(disabled) {
    document.querySelectorAll('.modal .pixel-button, .modal .file-actions button').forEach(function (btn) {
      if (btn.dataset.keepEnabled === '1') return;
      btn.disabled = !!disabled;
    });
  }

  async function installGameBanana(mod, file, btn, row) {
    if (state.busy) return;
    state.busy = true;
    setBusyUi(true);
    if (btn) {
      btn.disabled = true;
      const label = btn.querySelector('span');
      if (label) label.textContent = t('common.installing');
    }
    const progress = row ? row.querySelector('.progress-line i') : null;
    try {
      if (file.size > MAX_FILE) throw new Error(t('mods.fileTooBig'));
      const blob = await downloadBlob(file.url, function (received, total) {
        if (progress) {
          if (total) progress.style.width = Math.min(100, (received / total) * 100) + '%';
          else progress.style.width = Math.min(92, (received / (file.size || MAX_FILE)) * 100) + '%';
          const label = row ? row.querySelector('.file-meta') : null;
          if (label) {
            let status = label.querySelector('.dl-status');
            if (!status) { status = el('span', 'dl-status'); label.appendChild(status); }
            status.textContent = t('mods.downloading') + ' ' + SL.store.formatBytes(received);
          }
        }
      }, file.name);
      if (progress) progress.style.width = '100%';
      const record = await installBlob(blob, {
        gbId: mod.id,
        name: mod.name,
        author: mod.author,
        source: 'gamebanana',
        sourceUrl: mod.url,
        thumbnail: mod.thumb,
        category: mod.category,
        version: mod.version || file.version,
        fileName: file.name,
        description: mod.description || '',
        screenshots: mod.screenshots || [],
        downloadUrl: file.url
      });
      SL.audio.sfx('install');
      SL.ui.toast(t('mods.installSuccess', { name: record.name }), t('mods.installSuccessSub'), 'success', 'check');
      if (btn) {
        const label = btn.querySelector('span');
        if (label) label.textContent = t('mods.installedState');
      }
      renderAll();
      if (state.tab !== 'installed') setTab('installed');
    } catch (err) {
      if (window.console) console.warn('[SOUL LINK] install:', err);
      SL.audio.sfx('error');
      SL.ui.toast(t('mods.installError'), (err && err.message) || t('mods.downloadFailed'), 'error', 'warning');
      if (err && err.blocked) showManualFallback(row, mod);
    } finally {
      state.busy = false;
      setBusyUi(false);
      if (btn) {
        const installed = isInstalled(mod.id);
        btn.disabled = installed;
        const label = btn.querySelector('span');
        if (label) label.textContent = installed ? t('mods.installedState') : t('mods.install');
      }
    }
  }

  function showManualFallback(row, mod) {
    if (!row || row.querySelector('.dl-manual')) return;
    const box = el('div', 'dl-manual');
    const note = el('span', 'dl-manual-note', t('mods.downloadBlocked'));
    box.appendChild(note);
    if (mod && mod.url) {
      const link = el('a', 'pixel-button small ghost', t('mods.openGamebanana'));
      link.href = mod.url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      box.appendChild(link);
    }
    const importBtn = el('button', 'pixel-button small');
    importBtn.type = 'button';
    append(importBtn, icon('folder'), el('span', '', t('mods.importManual')));
    importBtn.addEventListener('click', function () {
      const input = document.getElementById('mod-file-input');
      if (input) input.click();
    });
    box.appendChild(importBtn);
    row.appendChild(box);
  }

  async function downloadBlob(url, onProgress, fileName) {
    if (!url) throw new Error(t('mods.downloadFailed'));
    let lastError = null;
    const fallbackName = fileName || (String(url).split('?')[0].split('/').pop() || 'mod.bin');

    /* Inside the Android wrapper native HTTP has no CORS at all. */
    if (hasAndroidDownload()) {
      try {
        return await androidDownload(url, fallbackName, onProgress);
      } catch (err) {
        lastError = err;
      }
    }

    try {
      const res = await fetchTimed(url, isGameBananaFile(url) ? DIRECT_TIMEOUT : 25000);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return await responseBlob(res, onProgress);
    } catch (err) {
      lastError = err;
    }

    if (isGameBananaFile(url)) {
      try {
        const res = await fetchTimed(CORS_PROXY + url, PROXY_TIMEOUT);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return await responseBlob(res, onProgress);
      } catch (err) {
        lastError = err;
      }
    }

    const blocked = new Error(t('mods.downloadBlocked'));
    blocked.blocked = true;
    blocked.cause = lastError;
    throw blocked;
  }

  function isGameBananaFile(url) {
    return /^https?:\/\/(?:www\.)?gamebanana\.com\/dl\//i.test(String(url || ''));
  }

  function hasAndroidDownload() {
    return !!(window.SLAndroid && typeof window.SLAndroid.downloadFile === 'function');
  }

  function androidDownload(url, fileName, onProgress) {
    return new Promise(function (resolve, reject) {
      const id = 'sl' + (++androidSeq) + '-' + Date.now().toString(36);
      androidJobs[id] = {
        resolve: resolve,
        reject: reject,
        progress: typeof onProgress === 'function' ? onProgress : null
      };
      try {
        window.SLAndroid.downloadFile(url, fileName || 'mod.bin', id);
      } catch (err) {
        delete androidJobs[id];
        reject(err);
      }
    });
  }

  /* Called from MainActivity.java after a native download finishes. */
  window.SLAndroidBridge = {
    onDownloadProgress: function (id, received, total) {
      const job = androidJobs[id];
      if (!job || !job.progress) return;
      job.progress(Number(received) || 0, Number(total) || 0);
    },
    onDownloadDone: function (id, localUrl) {
      const job = androidJobs[id];
      if (!job) return;
      delete androidJobs[id];
      fetch(localUrl, { cache: 'no-store' }).then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.blob();
      }).then(job.resolve, job.reject);
    },
    onDownloadError: function (id, message) {
      const job = androidJobs[id];
      if (!job) return;
      delete androidJobs[id];
      job.reject(new Error(message || 'Android download failed'));
    }
  };

  function fetchTimed(url, timeout) {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = setTimeout(function () {
      if (controller) controller.abort();
    }, timeout);
    return fetch(url, {
      mode: 'cors',
      credentials: 'omit',
      cache: 'no-store',
      signal: controller ? controller.signal : undefined
    }).then(function (res) {
      clearTimeout(timer);
      return res;
    }, function (err) {
      clearTimeout(timer);
      throw err;
    });
  }

  async function responseBlob(res, onProgress) {
    const total = Number(res.headers.get('content-length')) || 0;
    if (!res.body || !res.body.getReader) {
      const blob = await res.blob();
      if (onProgress) onProgress(blob.size, blob.size);
      return blob;
    }
    const reader = res.body.getReader();
    const chunks = [];
    let received = 0;
    while (true) {
      const step = await reader.read();
      if (step.done) break;
      if (step.value) {
        chunks.push(step.value);
        received += step.value.byteLength;
        if (onProgress) onProgress(received, total);
      }
    }
    return new Blob(chunks, { type: res.headers.get('content-type') || 'application/octet-stream' });
  }

  /* ── Installing files ───────────────────────────────────── */

  async function installBlob(blob, meta) {
    if (!blob) throw new Error(t('mods.invalidFile'));
    if (blob.size > MAX_FILE) throw new Error(t('mods.fileTooBig'));
    const fileName = meta.fileName || meta.name || 'mod.bin';    const ext = (fileName.split('.').pop() || '').toLowerCase();
    let target = blob;
    let kind = 'archive';
    let storedName = fileName;
    let validDataWin = false;
    let warning = '';

    const looksZip = ext === 'zip' || (blob.size > 4 && await isZip(blob));
    if (looksZip) {
      if (typeof JSZip === 'undefined') throw new Error('ZIP support is not loaded');
      const zip = await JSZip.loadAsync(blob);
      const names = Object.keys(zip.files);
      const winNames = names.filter(function (n) { return /(^|\/)(data|game)\.win$/i.test(n) || /\.win$/i.test(n); });
      const patchNames = names.filter(function (n) { return /\.(xdelta|patch|bps)$/i.test(n); });
      if (winNames.length) {
        const pick = winNames.find(function (n) { return /(^|\/)data\.win$/i.test(n); }) || winNames[0];
        target = await zip.file(pick).async('blob');
        storedName = pick.split('/').pop();
        kind = 'datawin';
      } else if (patchNames.length) {
        target = await zip.file(patchNames[0]).async('blob');
        storedName = patchNames[0].split('/').pop();
        kind = 'patch';
        warning = t('mods.zipNoWin');
      } else {
        warning = t('mods.zipNoWin');
      }
    } else if (ext === 'win' || ext === 'datawin' || (await isForm(blob))) {
      kind = 'datawin';
      storedName = fileName;
    } else if (ext === 'xdelta' || ext === 'patch' || ext === 'bps') {
      kind = 'patch';
      storedName = fileName;
    }

    if (kind === 'datawin') {
      const check = await SL.store.inspectDataWin(target);
      validDataWin = check.valid;
    }
    if (target.size > MAX_FILE) throw new Error(t('mods.fileTooBig'));
    const hash = await SL.store.blobHash(target);
    const id = meta.source === 'gamebanana' && meta.gbId ? 'gb-' + meta.gbId : 'local-' + hash;
    await SL.store.putFile(id, target);
    const paletteIndex = SL.store.derivePaletteIndex(id + ':' + fileName + ':' + hash);
    const record = {
      id: id,
      gbId: meta.source === 'gamebanana' ? meta.gbId : null,
      name: meta.name || storedName.replace(/\.(win|zip|xdelta|patch|bps)$/i, ''),
      author: meta.author || t('mods.sourceLocal'),
      source: meta.source || 'local',
      sourceUrl: meta.sourceUrl || '',
      thumbnail: meta.thumbnail || '',
      category: meta.category || '',
      version: meta.version || '',
      description: meta.description || '',
      screenshots: meta.screenshots || [],
      installDate: Date.now(),
      activatedAt: Date.now(),
      active: true,
      size: target.size,
      kind: kind,
      fileName: storedName,
      blobId: id,
      hash: hash,
      validDataWin: validDataWin,
      paletteIndex: paletteIndex
    };
    SL.store.addMod(record);
    if (warning) SL.ui.toast(warning, '', 'warning', 'warning');
    return record;
  }

  async function isZip(blob) {
    try {
      const head = new Uint8Array(await blob.slice(0, 4).arrayBuffer());
      return head[0] === 0x50 && head[1] === 0x4b;
    } catch (_) { return false; }
  }
  async function isForm(blob) {
    try {
      const head = new Uint8Array(await blob.slice(0, 4).arrayBuffer());
      return head[0] === 0x46 && head[1] === 0x4f && head[2] === 0x52 && head[3] === 0x4d;
    } catch (_) { return false; }
  }

  async function installLocalFile(file) {
    if (!file) return;
    if (file.size > MAX_FILE) { SL.ui.toast(t('mods.installError'), t('mods.fileTooBig'), 'error', 'warning'); return; }
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    if (['win', 'datawin', 'zip', 'xdelta', 'patch', 'bps'].indexOf(ext) < 0) {
      SL.ui.toast(t('mods.invalidFile'), file.name, 'warning', 'warning');
      return;
    }
    SL.ui.toast(t('common.installing'), file.name, 'info', 'download');
    try {
      const record = await installBlob(file, {
        name: file.name.replace(/\.(win|zip|xdelta|patch|bps)$/i, ''),
        author: t('mods.sourceLocal'),
        source: 'local',
        fileName: file.name
      });
      SL.audio.sfx('install');
      SL.ui.toast(t('mods.installSuccess', { name: record.name }), t('mods.installSuccessSub'), 'success', 'check');
      renderAll();
      setTab('installed');
    } catch (err) {
      if (window.console) console.warn('[SOUL LINK] local install:', err);
      SL.audio.sfx('error');
      SL.ui.toast(t('mods.installError'), (err && err.message) || t('mods.invalidFile'), 'error', 'warning');
    }
  }

  function installDemo() {
    const existing = SL.store.mods.find(function (m) { return m.id === 'demo-golden-bloom'; });
    if (existing) {
      SL.store.setActive(existing.id, true);
      SL.ui.toast(t('mods.activated', { name: existing.name }), '', 'success', 'spark');
      renderAll();
      return;
    }
    const paletteIndex = SL.data.PALETTES.findIndex(function (p) { return p.id === 'golden-bloom'; });
    SL.store.addMod({
      id: 'demo-golden-bloom',
      name: t('mods.demoName'),
      author: t('mods.demoAuthor'),
      source: 'demo',
      sourceUrl: '',
      thumbnail: '',
      category: 'themes',
      version: '1.0',
      description: t('mods.demoDesc'),
      screenshots: [],
      installDate: Date.now(),
      activatedAt: Date.now(),
      active: true,
      size: 0,
      kind: 'theme',
      fileName: '',
      blobId: '',
      hash: 'demo',
      validDataWin: false,
      paletteIndex: paletteIndex >= 0 ? paletteIndex : 2
    });
    SL.audio.sfx('install');
    SL.ui.toast(t('mods.installSuccess', { name: t('mods.demoName') }), t('mods.installSuccessSub'), 'success', 'spark');
    renderAll();
    setTab('installed');
  }

  /* ── Boot / public ───────────────────────────────────────── */

  function init() {
    state.catalog = SL.data.FALLBACK_MODS.map(function (m) { return Object.assign({}, m); });
    chooseFeatured();
    renderAll();
    setTab('browse');
    setApiStatus('loading');
    loadFeed(1, false);
    window.addEventListener('online', function () {
      if (!state.live) loadFeed(1, false);
    });
  }

  function refreshLanguage() {
    setApiStatus(state.live === false ? 'offline' : state.live ? 'online' : 'loading');
    updateFeatured();
    renderAll();
    if (state.detail && state.detailShell) {
      renderDetail(state.detailShell, state.detail, false);
    }
  }

  function setQuery(value) {
    state.query = value || '';
    renderBrowse();
  }
  function setCategory(value) {
    state.category = value || 'all';
    renderBrowse();
    updateFilters();
  }
  function setSort(value) {
    state.sort = value || 'featured';
    renderBrowse();
  }
  function loadMore() {
    if (state.loading || !state.hasMore) return;
    const btn = $id('load-more-btn');
    if (btn) btn.disabled = true;
    loadFeed(state.page + 1, true).finally(function () {
      if (btn) btn.disabled = false;
    });
  }

  window.SL = window.SL || {};
  SL.mods = {
    init: init,
    renderAll: renderAll,
    renderInstalled: renderInstalled,
    refreshLanguage: refreshLanguage,
    openDetail: openDetail,
    openFeatured: function () { if (state.featured) openDetail(state.featured.id); },
    installDemo: installDemo,
    installLocalFile: installLocalFile,
    setTab: setTab,
    setQuery: setQuery,
    setCategory: setCategory,
    setSort: setSort,
    loadMore: loadMore,
    updateCounts: updateCounts,
    get featured() { return state.featured; },
    get catalog() { return state.catalog.slice(); },
    get live() { return state.live; },
    get total() { return state.total; }
  };
})();
