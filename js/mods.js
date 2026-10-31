import { getLang, t } from './i18n.js';
import { getSettings, setSetting } from './settings.js';
import { audio } from './audio.js';
import { browseMods, searchMods, fetchModDetail, GAME_URL, imageUrl } from './gamebanana.js';
import {
  initStore, getAllMods, getMod, putMod, deleteMod, ensureBuiltinPack,
  inspectFile, buildLocalRecord, kindLabel, exportMod, formatBytes,
  storageInfo, downloadWithProgress, isMemoryMode
} from './store.js';
import { BUILTIN_PACKS } from './packs.js';
import {
  icon, escapeHtml, toast, openModal, closeModal, confirmDialog, busyButton, timeAgo
} from './ui.js';

const browse = {
  tab: 'browse',
  sort: 'default',
  query: '',
  page: 1,
  records: [],
  total: 0,
  hasMore: true,
  loading: false,
  error: null,
  seq: 0,
  controller: null
};

const state = {
  installed: [],
  installedById: new Map(),
  installedByMod: new Set(),
  opened: false,
  loadingInstalled: false,
  detailOpen: false,
  detailAbort: null,
  detailId: null,
  installAbort: null,
  pending: null
};

let hooks = {};
let el = {};
let searchTimer = null;

export async function initMods(options = {}) {
  hooks = {
    onLibraryChange: () => {},
    onActivePackChange: () => {},
    ...options
  };
  cacheDom();
  bindEvents();
  await initStore();
  await refreshInstalled();
  updateOnlineStatus();
  if (isMemoryMode()) {
    toast('IndexedDB недоступен: моды будут храниться только до перезагрузки.', 'error', 6000);
  }
  return { installed: state.installed };
}

function cacheDom() {
  el = {
    view: document.getElementById('modsView'),
    tabs: [...document.querySelectorAll('.mods-tab')],
    browsePane: document.getElementById('browsePane'),
    installedPane: document.getElementById('installedPane'),
    search: document.getElementById('modSearch'),
    sortChips: document.getElementById('sortChips'),
    refresh: document.getElementById('refreshBtn'),
    grid: document.getElementById('modsGrid'),
    meta: document.getElementById('browseMeta'),
    state: document.getElementById('browseState'),
    stateTitle: document.getElementById('browseStateTitle'),
    stateText: document.getElementById('browseStateText'),
    retry: document.getElementById('browseRetry'),
    loadMore: document.getElementById('loadMoreBtn'),
    browseCount: document.getElementById('browseCount'),
    installedCount: document.getElementById('installedCount'),
    libraryCount: document.getElementById('libraryCount'),
    installedSummary: document.getElementById('installedSummary'),
    installedList: document.getElementById('installedList'),
    installedEmpty: document.getElementById('installedEmpty'),
    starterGrid: document.getElementById('starterGrid'),
    dropzone: document.getElementById('dropzone'),
    fileInput: document.getElementById('fileInput'),
    importBtn: document.getElementById('importBtn'),
    importBtn2: document.getElementById('importBtn2'),
    clearInactive: document.getElementById('clearInactive'),
    gbStatus: document.getElementById('gbStatus'),
    footStatus: document.getElementById('modsFootStatus')
  };
}

function bindEvents() {
  el.tabs.forEach((tab) => tab.addEventListener('click', () => {
    audio.play('move');
    setTab(tab.dataset.tab);
  }));

  document.querySelectorAll('[data-tab-jump]').forEach((button) => {
    button.addEventListener('click', () => {
      audio.play('select');
      setTab(button.dataset.tabJump);
    });
  });

  el.search?.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      browse.query = el.search.value.trim();
      loadBrowse(true);
    }, 460);
  });
  el.search?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      clearTimeout(searchTimer);
      browse.query = el.search.value.trim();
      loadBrowse(true);
    } else if (event.key === 'Escape') {
      el.search.value = '';
      browse.query = '';
      loadBrowse(true);
    }
  });

  el.sortChips?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-sort]');
    if (!button) return;
    audio.play('move');
    browse.sort = button.dataset.sort;
    el.sortChips.querySelectorAll('[data-sort]').forEach((chip) => chip.classList.toggle('is-active', chip === button));
    loadBrowse(true);
  });

  el.refresh?.addEventListener('click', () => {
    audio.play('download');
    loadBrowse(true);
  });
  el.retry?.addEventListener('click', () => loadBrowse(true));
  el.loadMore?.addEventListener('click', () => loadBrowse(false));

  el.grid?.addEventListener('click', (event) => {
    const card = event.target.closest('[data-mod-id]');
    if (!card) return;
    const record = browse.records.find((item) => String(item.id) === card.dataset.modId);
    if (record) openDetail(record);
  });

  const openFilePicker = () => { audio.play('select'); el.fileInput?.click(); };
  el.importBtn?.addEventListener('click', openFilePicker);
  el.importBtn2?.addEventListener('click', openFilePicker);
  el.dropzone?.addEventListener('click', openFilePicker);
  el.dropzone?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openFilePicker(); }
  });
  el.fileInput?.addEventListener('change', () => {
    const file = el.fileInput.files?.[0];
    el.fileInput.value = '';
    if (file) handleImport(file);
  });

  ['dragenter', 'dragover'].forEach((type) => {
    el.dropzone?.addEventListener(type, (event) => {
      event.preventDefault();
      el.dropzone.classList.add('is-over');
    });
  });
  ['dragleave', 'drop'].forEach((type) => {
    el.dropzone?.addEventListener(type, (event) => {
      event.preventDefault();
      el.dropzone.classList.remove('is-over');
    });
  });
  el.dropzone?.addEventListener('drop', (event) => {
    const file = event.dataTransfer?.files?.[0];
    if (file) handleImport(file);
  });

  el.starterGrid?.addEventListener('click', (event) => {
    const card = event.target.closest('[data-starter-id]');
    if (!card) return;
    const pack = BUILTIN_PACKS.find((item) => item.id === card.dataset.starterId);
    if (pack) activateStarter(pack);
  });

  el.installedList?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-mod-action]');
    if (!button) return;
    const record = state.installedById.get(button.dataset.modId);
    if (!record) return;
    const action = button.dataset.modAction;
    if (action === 'activate') activateRecord(record);
    else if (action === 'default') activateDefault();
    else if (action === 'export') doExport(record);
    else if (action === 'delete') askDelete(record);
    else if (action === 'howto') showHowTo(record);
  });

  el.clearInactive?.addEventListener('click', clearInactive);

  window.addEventListener('online', () => {
    updateOnlineStatus();
    toast(t('mods.meta.ready'), 'ok');
  });
  window.addEventListener('offline', () => {
    updateOnlineStatus();
    toast(t('toast.offline'), 'error');
  });
}

export async function openMods() {
  if (!state.opened) {
    state.opened = true;
    loadBrowse(false);
  }
  await refreshInstalled();
  renderBrowse();
}

export function focusSearch() {
  el.search?.focus({ preventScroll: true });
}

function setTab(tab) {
  browse.tab = tab === 'installed' ? 'installed' : 'browse';
  el.tabs.forEach((button) => {
    const active = button.dataset.tab === browse.tab;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-selected', String(active));
  });
  el.browsePane?.classList.toggle('is-hidden', browse.tab !== 'browse');
  el.installedPane?.classList.toggle('is-hidden', browse.tab !== 'installed');
  if (browse.tab === 'installed') refreshInstalled();
  else if (browse.records.length === 0 && !browse.loading && !browse.error) loadBrowse(false);
}

/* ------------------------------------------------------------------ */
/* browse                                                             */
/* ------------------------------------------------------------------ */

async function loadBrowse(reset) {
  if (reset) {
    browse.page = 1;
    browse.records = [];
    browse.hasMore = true;
    browse.total = 0;
  }
  if (!browse.hasMore && !reset) return;
  browse.controller?.abort();
  const controller = new AbortController();
  browse.controller = controller;
  const seq = ++browse.seq;
  browse.loading = true;
  browse.error = null;
  renderBrowse();
  try {
    const params = { page: browse.page, signal: controller.signal };
    const result = browse.query
      ? await searchMods({ ...params, query: browse.query })
      : await browseMods({ ...params, sort: browse.sort });
    if (seq !== browse.seq) return;
    const seen = new Set(browse.records.map((record) => record.id));
    for (const record of result.records) if (!seen.has(record.id)) browse.records.push(record);
    browse.total = result.total;
    browse.hasMore = Boolean(result.more) && browse.page < 80;
    browse.page += 1;
  } catch (error) {
    if (seq !== browse.seq || controller.signal.aborted) return;
    browse.error = error;
    browse.hasMore = false;
    if (browse.records.length) toast(t('mods.toast.network'), 'error');
  } finally {
    if (seq === browse.seq) {
      browse.loading = false;
      renderBrowse();
    }
  }
}

function renderBrowse() {
  if (!el.grid) return;
  const empty = browse.records.length === 0;
  if (browse.loading && empty) {
    el.grid.innerHTML = Array.from({ length: 8 }, () => `
      <div class="mod-card is-skeleton" aria-hidden="true">
        <div class="sk-cover"></div>
        <div class="sk-line"></div>
        <div class="sk-line short"></div>
        <div class="sk-line tiny"></div>
      </div>`).join('');
  } else {
    el.grid.innerHTML = browse.records.map(cardHtml).join('');
    bindCovers(el.grid);
  }

  const showState = empty && !browse.loading;
  el.state?.classList.toggle('is-hidden', !showState);
  if (showState) {
    if (browse.error) {
      el.stateTitle.textContent = t('mods.error.title');
      el.stateText.textContent = t('mods.error.text');
      el.retry?.classList.remove('is-hidden');
    } else if (browse.query) {
      el.stateTitle.textContent = t('mods.search.empty.title');
      el.stateText.textContent = t('mods.search.empty.text');
      el.retry?.classList.add('is-hidden');
    } else {
      el.stateTitle.textContent = t('mods.detail.error');
      el.stateText.textContent = t('mods.error.text');
      el.retry?.classList.remove('is-hidden');
    }
  }

  el.loadMore?.classList.toggle('is-hidden', !browse.hasMore || browse.loading || empty);

  if (el.browseCount) el.browseCount.textContent = String(browse.records.length || browse.total || '');
  if (el.meta) {
    if (browse.loading && empty) el.meta.textContent = t('mods.loading');
    else if (browse.error) el.meta.textContent = t('mods.meta.offline');
    else if (browse.query) el.meta.textContent = t('mods.meta.search', { n: browse.records.length });
    else el.meta.textContent = t('mods.meta.browse', { n: browse.total || browse.records.length, p: Math.max(1, browse.page - 1) });
  }
  syncCardInstalled();
}

function bindCovers(root) {
  root.querySelectorAll('img[data-cover]').forEach((img) => {
    if (img.complete && img.naturalWidth) img.classList.add('is-loaded');
    img.addEventListener('load', () => img.classList.add('is-loaded'), { once: true });
    img.addEventListener('error', () => { img.remove(); }, { once: true });
  });
}

const CATEGORY_RU = {
  'Game files': 'Файлы игры',
  'Skins': 'Скины',
  'Audio': 'Звук',
  'Gameplay': 'Геймплей',
  'Characters': 'Персонажи',
  'Other/Misc': 'Другое',
  'Misc': 'Другое',
  'UI': 'Интерфейс',
  'Environment': 'Окружение',
  'Overhauls': 'Оверхаулы',
  'Executables': 'Программы'
};

function categoryLabel(name) {
  if (!name) return 'Mod';
  if (getLang() !== 'ru') return name;
  return CATEGORY_RU[name] || name;
}

function cardHtml(record) {
  const installed = state.installedByMod.has(record.id);
  const cover = record.cover
    ? `<img data-cover src="${escapeHtml(record.cover)}" alt="" loading="lazy" decoding="async">`
    : '';
  return `
    <button class="mod-card ${installed ? 'is-installed' : ''}" type="button" data-mod-id="${record.id}" aria-label="${escapeHtml(record.name)}">
      <div class="mod-cover">
        <div class="mod-cover-placeholder">${icon('heart')}</div>
        ${cover}
        <div class="mod-badges">
          <span class="mod-cat">${escapeHtml(categoryLabel(record.category))}</span>
          <span class="mod-likes">${icon('heart')}${record.likes || 0}</span>
        </div>
      </div>
      <div class="mod-card-body">
        <div class="mod-card-title">${escapeHtml(record.name)}</div>
        <div class="mod-card-author">${t('mods.card.by')} ${escapeHtml(record.author)}</div>
        <div class="mod-card-foot">
          <span class="version">${escapeHtml(record.version || 'v1.0')}</span>
          <span>${escapeHtml(timeAgo(record.dateUpdated || record.dateAdded, getLang()))}</span>
          ${installed ? `<span class="installed-flag">${icon('check')}${t('mods.card.installed')}</span>` : ''}
        </div>
      </div>
    </button>`;
}

function syncCardInstalled() {
  if (!el.grid) return;
  el.grid.querySelectorAll('[data-mod-id]').forEach((card) => {
    const installed = state.installedByMod.has(Number(card.dataset.modId));
    card.classList.toggle('is-installed', installed);
  });
}

function updateOnlineStatus() {
  const online = navigator.onLine !== false;
  if (el.gbStatus) {
    el.gbStatus.classList.toggle('is-error', !online);
    const label = el.gbStatus.querySelector('span:last-child');
    if (label) label.textContent = online ? t('mods.online') : 'OFFLINE';
  }
  if (el.footStatus) el.footStatus.textContent = online ? 'API READY' : 'OFFLINE';
}

/* ------------------------------------------------------------------ */
/* detail modal                                                       */
/* ------------------------------------------------------------------ */

function openDetail(record) {
  audio.play('select');
  state.detailId = record.id;
  state.detailOpen = true;
  state.detailAbort?.abort();
  const controller = new AbortController();
  state.detailAbort = controller;

  const initial = detailShell(record);
  const card = openModal(initial, {
    className: 'mod-detail-modal',
    onClose: () => {
      state.detailOpen = false;
      state.detailId = null;
      controller.abort();
      state.installAbort?.abort();
      state.installAbort = null;
    }
  });
  if (!card) return;
  bindCovers(card);
  bindScreens(card);
  const retry = card.querySelector('[data-detail-retry]');
  retry?.addEventListener('click', () => openDetail(record));

  fetchModDetail(record.id, { signal: controller.signal })
    .then((detail) => {
      if (!state.detailOpen || state.detailId !== record.id) return;
      renderDetail(detail);
    })
    .catch((error) => {
      if (controller.signal.aborted || !state.detailOpen) return;
      if (error?.code === 'aborted') return;
      renderDetailError(record);
    });
}

function detailShell(record) {
  return `
    <div class="mod-detail" id="modDetail">
      <div class="mod-detail-hero">
        ${record.cover ? `<img class="detail-cover" data-cover src="${escapeHtml(record.cover)}" alt="">` : ''}
        <div class="detail-stats">
          <span class="detail-stat"><b>${record.likes || 0}</b> LIKES</span>
          <span class="detail-stat"><b>${record.views || 0}</b> VIEWS</span>
          ${record.version ? `<span class="detail-stat">VER <b>${escapeHtml(record.version)}</b></span>` : ''}
        </div>
        <div class="mod-detail-head">
          <span class="detail-cat">${escapeHtml(categoryLabel(record.category).toUpperCase())}</span>
          <h2>${escapeHtml(record.name)}</h2>
          <div class="detail-author">${t('mods.card.by')} <a href="${escapeHtml(record.authorUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(record.author)}</a></div>
        </div>
      </div>
      <div class="mod-detail-body">
        <div>
          <div class="subpage-kicker">${t('mods.detail.about')}</div>
          <div class="detail-description" id="detailDescription">${t('common.loading')}</div>
          <div class="detail-screens" id="detailScreens"></div>
        </div>
        <div class="detail-side">
          <div class="install-panel" id="installPanel">
            <div class="install-panel-head"><span>${t('mods.detail.files')}</span><span class="status-dot"></span></div>
            <div class="file-list" id="detailFiles">
              <div class="file-row"><div class="file-copy"><span class="file-name">${t('common.loading')}</span></div></div>
            </div>
            <div class="install-actions">
              <div class="progress-meta is-hidden" id="detailProgressMeta"><span id="detailProgressLabel">0%</span><span id="detailProgressBytes"></span></div>
              <div class="progress is-hidden" id="detailProgress"><span id="detailProgressBar"></span></div>
              <p class="detail-note">${t('mods.detail.installNote')}</p>
              <a class="detail-link" href="${escapeHtml(record.profileUrl)}" target="_blank" rel="noopener noreferrer">${icon('external')}${t('mods.detail.view')}</a>
            </div>
          </div>
        </div>
      </div>
    </div>`;
}

function renderDetail(detail) {
  const card = document.getElementById('modDetail');
  if (!card) return;
  const description = card.querySelector('#detailDescription');
  if (description) description.textContent = detail.description || t('mods.detail.noFiles');
  const screens = card.querySelector('#detailScreens');
  if (screens) {
    screens.innerHTML = detail.images.slice(0, 6).map((img, index) => `
      <button type="button" class="${index === 0 ? 'is-active' : ''}" data-screen="${escapeHtml(img.large)}" aria-label="Screenshot ${index + 1}">
        <img src="${escapeHtml(img.small)}" alt="" loading="lazy" decoding="async">
      </button>`).join('');
    bindScreens(card);
  }
  const head = card.querySelector('.mod-detail-head');
  if (head) {
    head.querySelector('.detail-cat').textContent = categoryLabel(detail.category).toUpperCase();
    head.querySelector('h2').textContent = detail.name;
    head.querySelector('.detail-author').innerHTML = `${t('mods.card.by')} <a href="${escapeHtml(detail.authorUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(detail.author)}</a>`;
  }
  const stats = card.querySelector('.detail-stats');
  if (stats) {
    stats.innerHTML = `
      <span class="detail-stat"><b>${detail.likes || 0}</b> LIKES</span>
      <span class="detail-stat"><b>${detail.views || 0}</b> VIEWS</span>
      <span class="detail-stat"><b>${detail.downloads || 0}</b> DOWNLOADS</span>
      ${detail.version ? `<span class="detail-stat">VER <b>${escapeHtml(detail.version)}</b></span>` : ''}`;
  }
  const files = card.querySelector('#detailFiles');
  if (files) {
    if (!detail.files.length) {
      files.innerHTML = `<div class="file-row"><div class="file-copy"><span class="file-name">${t('mods.detail.noFiles')}</span></div></div>`;
    } else {
      files.innerHTML = detail.files.map((file) => {
        const already = state.installedById.has(`gb-${file.id}`);
        const ext = (file.name.split('.').pop() || 'FILE').slice(0, 4).toUpperCase();
        return `
          <div class="file-row">
            <span class="file-icon">${escapeHtml(ext)}</span>
            <div class="file-copy">
              <span class="file-name" title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</span>
              <span class="file-meta">${formatBytes(file.size)} · ${escapeHtml(timeAgo(file.date, getLang()))} · ${file.downloads || 0} DL</span>
            </div>
            <button class="file-install" type="button" data-install-file="${file.id}" aria-label="${already ? t('common.reinstall') : t('common.install')}" title="${already ? t('common.reinstall') : t('common.install')}">
              ${icon(already ? 'check' : 'download')}
            </button>
          </div>`;
      }).join('');
      files.querySelectorAll('[data-install-file]').forEach((button) => {
        button.addEventListener('click', () => {
          const file = detail.files.find((item) => String(item.id) === button.dataset.installFile);
          if (file) installGameBananaFile(detail, file, button);
        });
      });
    }
  }
  const link = card.querySelector('.detail-link');
  if (link) link.href = detail.profileUrl;
  window.__utlDetail = detail;
}

function renderDetailError(record) {
  const card = document.getElementById('modDetail');
  if (!card) return;
  const description = card.querySelector('#detailDescription');
  if (description) description.textContent = t('mods.detail.error');
  const files = card.querySelector('#detailFiles');
  if (files) {
    files.innerHTML = `
      <div class="file-row">
        <div class="file-copy"><span class="file-name">${t('mods.detail.error')}</span></div>
        <button class="file-install" type="button" data-detail-retry aria-label="${t('common.retry')}">${icon('refresh')}</button>
      </div>`;
    files.querySelector('[data-detail-retry]')?.addEventListener('click', () => openDetail(record));
  }
}

function bindScreens(root) {
  const screens = root.querySelector('.detail-screens');
  if (!screens) return;
  screens.querySelectorAll('[data-screen]').forEach((button) => {
    button.addEventListener('click', () => {
      screens.querySelectorAll('button').forEach((item) => item.classList.toggle('is-active', item === button));
      const cover = root.querySelector('.detail-cover');
      if (cover) cover.src = button.dataset.screen;
    });
  });
}

async function installGameBananaFile(detail, file, button) {
  if (state.installAbort) return;
  audio.unlock();
  audio.play('download');
  const controller = new AbortController();
  state.installAbort = controller;
  const restore = busyButton(button, '…');
  const progress = document.getElementById('detailProgress');
  const progressBar = document.getElementById('detailProgressBar');
  const progressMeta = document.getElementById('detailProgressMeta');
  const progressLabel = document.getElementById('detailProgressLabel');
  const progressBytes = document.getElementById('detailProgressBytes');
  progress?.classList.remove('is-hidden');
  progressMeta?.classList.remove('is-hidden');
  if (progressBar) progressBar.style.width = '0%';

  let timeout = setTimeout(() => controller.abort(), 180_000);
  try {
    const blob = await downloadWithProgress(file.url, (received, total) => {
      const pct = total ? Math.min(100, (received / total) * 100) : 0;
      if (progressBar) progressBar.style.width = `${pct}%`;
      if (progressLabel) progressLabel.textContent = total ? `${Math.round(pct)}%` : t('common.loading');
      if (progressBytes) progressBytes.textContent = `${formatBytes(received)}${total ? ` / ${formatBytes(total)}` : ''}`;
    }, controller.signal);
    clearTimeout(timeout);
    if (controller.signal.aborted) return;
    const localFile = new File([blob], file.name, { type: blob.type || 'application/octet-stream' });
    const inspection = await inspectFile(localFile);
    const record = {
      id: `gb-${file.id}`,
      source: 'gamebanana',
      gamebanana: { modId: detail.id, fileId: file.id, profileUrl: detail.profileUrl },
      name: detail.name,
      author: detail.author,
      version: detail.version,
      category: detail.category,
      description: detail.shortDescription || detail.description.slice(0, 400),
      cover: detail.cover,
      profileUrl: detail.profileUrl,
      fileName: file.name,
      size: blob.size,
      mime: blob.type || 'application/octet-stream',
      kind: inspection.kind,
      info: inspection.info,
      pack: inspection.kind === 'pack' ? inspection.info?.packData : null,
      md5: file.md5,
      installedAt: Date.now(),
      active: false
    };
    await putMod(record, blob);
    await refreshInstalled();
    renderBrowse();
    if (progressBar) progressBar.style.width = '100%';
    if (progressLabel) progressLabel.textContent = '100%';
    audio.play('success');
    toast(t('mods.toast.installed', { name: detail.name }), 'ok');
    if (record.kind === 'pack') {
      await activateRecord(record, { silent: true });
      toast(t('mods.import.packActive', { name: record.name }), 'ok');
    } else {
      const info = document.getElementById('installPanel');
      if (info) {
        const note = document.createElement('p');
        note.className = 'detail-note';
        note.innerHTML = `<b>${escapeHtml(kindLabel(record))}</b> · ${t('mods.detail.installNote')}`;
        info.querySelector('.install-actions')?.appendChild(note);
      }
    }
  } catch (error) {
    if (!controller.signal.aborted) {
      toast(t('mods.toast.downloadError'), 'error');
    }
  } finally {
    clearTimeout(timeout);
    state.installAbort = null;
    restore();
    setTimeout(() => {
      progress?.classList.add('is-hidden');
      progressMeta?.classList.add('is-hidden');
    }, 700);
  }
}

/* ------------------------------------------------------------------ */
/* installed library                                                  */
/* ------------------------------------------------------------------ */

export async function refreshInstalled() {
  if (state.loadingInstalled) return state.installed;
  state.loadingInstalled = true;
  try {
    const mods = await getAllMods();
    state.installed = mods;
    state.installedById = new Map(mods.map((mod) => [mod.id, mod]));
    state.installedByMod = new Set(mods.filter((mod) => mod.gamebanana?.modId).map((mod) => Number(mod.gamebanana.modId)));
    if (getSettings().activePack && !state.installedById.has(getSettings().activePack)) {
      setSetting('activePack', null);
    }
    renderStarter();
    renderInstalled();
    updateCounts();
    await updateStorage();
    hooks.onLibraryChange?.(state.installed, getSettings().activePack);
    window.dispatchEvent(new CustomEvent('utl:mods', { detail: { mods: state.installed } }));
  } catch (error) {
    console.error(error);
    toast('Не удалось прочитать библиотеку модов.', 'error');
  } finally {
    state.loadingInstalled = false;
  }
  return state.installed;
}

function renderStarter() {
  if (!el.starterGrid) return;
  el.starterGrid.innerHTML = BUILTIN_PACKS.map((pack) => {
    const installed = state.installedById.has(pack.id);
    const active = getSettings().activePack === pack.id;
    const stateText = active ? t('mods.starter.active') : installed ? t('mods.starter.activate') : t('mods.starter.install');
    const description = pack.description?.[getLang()] || pack.description?.en || '';
    return `
      <button class="starter-card" type="button" data-starter-id="${pack.id}">
        <span class="starter-swatch" style="--pack-bg:${pack.palette.bg};--pack-soul:${pack.palette.flower}"></span>
        <span class="starter-copy">
          <strong>${escapeHtml(pack.name)}</strong>
          <small>${escapeHtml(description)}</small>
        </span>
        <span class="starter-state ${active || installed ? '' : 'install'}">${escapeHtml(stateText)}</span>
      </button>`;
  }).join('');
}

function renderInstalled() {
  if (!el.installedList) return;
  const mods = [...state.installed].sort((a, b) => b.installedAt - a.installedAt);
  const active = getSettings().activePack;
  if (mods.length === 0) {
    el.installedList.innerHTML = '';
    el.installedEmpty?.classList.remove('is-hidden');
    return;
  }
  el.installedEmpty?.classList.add('is-hidden');
  el.installedList.innerHTML = mods.map((mod) => {
    const isActive = active === mod.id;
    const isPack = mod.kind === 'pack';
    const thumb = mod.cover
      ? `<img class="installed-thumb" src="${escapeHtml(mod.cover)}" alt="" loading="lazy" decoding="async">`
      : `<span class="installed-thumb installed-thumb-placeholder">${icon(isPack ? 'star' : 'puzzle')}</span>`;
    const description = mod.description ? escapeHtml(mod.description) : '';
    return `
      <div class="installed-row">
        ${thumb}
        <div class="installed-copy">
          <div class="installed-name">
            <span title="${escapeHtml(mod.name)}">${escapeHtml(mod.name)}</span>
            ${isActive ? `<span class="active-badge">${t('mods.installed.active')}</span>` : ''}
            ${isPack ? '' : `<span class="active-badge" style="border-color:rgba(169,139,255,.3);color:var(--violet)">${escapeHtml(kindLabel(mod))}</span>`}
          </div>
          <div class="installed-meta">
            <span>${escapeHtml(mod.author || 'LOCAL')}</span>
            <span>${escapeHtml(formatBytes(mod.size))}</span>
            <span>${escapeHtml(timeAgo(mod.installedAt, getLang()))}</span>
            ${mod.version ? `<span>v${escapeHtml(mod.version)}</span>` : ''}
          </div>
          ${description ? `<div class="installed-meta"><span title="${description}">${description.slice(0, 90)}${description.length > 90 ? '…' : ''}</span></div>` : ''}
        </div>
        <div class="installed-actions-row">
          ${isPack && !isActive ? `<button class="mini-btn is-primary" type="button" data-mod-action="activate" data-mod-id="${escapeHtml(mod.id)}">${icon('play')}${t('mods.installed.activate')}</button>` : ''}
          ${isPack && isActive ? `<button class="mini-btn" type="button" data-mod-action="default" data-mod-id="${escapeHtml(mod.id)}">${t('common.cancel')}</button>` : ''}
          ${!isPack ? `<button class="mini-btn" type="button" data-mod-action="howto" data-mod-id="${escapeHtml(mod.id)}">${icon('external')}${t('mods.detail.howto')}</button>` : ''}
          <button class="mini-btn" type="button" data-mod-action="export" data-mod-id="${escapeHtml(mod.id)}">${icon('download')}${t('mods.installed.export')}</button>
          <button class="mini-btn is-danger" type="button" data-mod-action="delete" data-mod-id="${escapeHtml(mod.id)}">${icon('trash')}${t('mods.installed.delete')}</button>
        </div>
      </div>`;
  }).join('');
}

function updateCounts() {
  if (el.installedCount) el.installedCount.textContent = String(state.installed.length);
  if (el.libraryCount) el.libraryCount.textContent = String(state.installed.length);
  if (el.installedSummary) {
    const size = state.installed.reduce((sum, mod) => sum + (Number(mod.size) || 0), 0);
    el.installedSummary.textContent = state.installed.length
      ? t('mods.installed.summary', { n: state.installed.length, size: formatBytes(size) })
      : t('mods.installed.desc');
  }
}

async function updateStorage() {
  const info = await storageInfo(state.installed);
  const text = document.getElementById('storageText');
  const bar = document.getElementById('storageBar');
  if (text) text.textContent = info.quota
    ? `${formatBytes(info.modBytes)} / ${formatBytes(info.quota)}`
    : formatBytes(info.modBytes);
  if (bar) {
    const pct = info.quota ? Math.min(100, (info.modBytes / info.quota) * 100) : Math.min(100, info.modBytes / (50 * 1024 * 1024) * 100);
    bar.style.width = `${pct}%`;
  }
}

async function activateStarter(pack) {
  audio.unlock();
  const existing = state.installedById.get(pack.id);
  if (existing) {
    if (getSettings().activePack === pack.id) {
      activateDefault();
      return;
    }
    await activateRecord(existing);
    return;
  }
  audio.play('download');
  try {
    await ensureBuiltinPack(pack);
    await refreshInstalled();
    await activateRecord(await getMod(pack.id));
  } catch (error) {
    toast(t('common.error'), 'error');
  }
}

async function activateRecord(record, { silent = false } = {}) {
  if (!record || record.kind !== 'pack') return;
  setSetting('activePack', record.id);
  audio.unlock();
  audio.play('success');
  if (!silent) toast(t('mods.installed.activated', { name: record.name }), 'ok');
  renderStarter();
  renderInstalled();
  hooks.onActivePackChange?.(record);
  window.dispatchEvent(new CustomEvent('utl:activepack', { detail: { record } }));
}

function activateDefault() {
  setSetting('activePack', null);
  audio.play('back');
  toast(t('mods.installed.default'), 'ok');
  renderStarter();
  renderInstalled();
  hooks.onActivePackChange?.(null);
  window.dispatchEvent(new CustomEvent('utl:activepack', { detail: { record: null } }));
}

async function doExport(record) {
  audio.unlock();
  audio.play('download');
  try {
    await exportMod(record);
    toast(t('mods.installed.exported'), 'ok');
  } catch (error) {
    toast(t('common.error'), 'error');
  }
}

async function askDelete(record) {
  audio.play('move');
  const yes = await confirmDialog({
    title: t('mods.installed.delete.title'),
    text: t('mods.installed.delete.text', { name: record.name }),
    confirmLabel: t('mods.installed.delete.confirm'),
    cancelLabel: t('common.cancel'),
    danger: true
  });
  if (!yes) return;
  await deleteMod(record.id);
  if (getSettings().activePack === record.id) {
    setSetting('activePack', null);
    hooks.onActivePackChange?.(null);
  }
  await refreshInstalled();
  renderBrowse();
  audio.play('back');
  toast(t('mods.installed.deleted'), 'ok');
}

async function clearInactive() {
  const active = getSettings().activePack;
  const targets = state.installed.filter((mod) => mod.id !== active);
  if (!targets.length) return;
  const yes = await confirmDialog({
    title: t('mods.installed.clear.title'),
    text: t('mods.installed.clear.text'),
    confirmLabel: t('common.delete'),
    cancelLabel: t('common.cancel'),
    danger: true
  });
  if (!yes) return;
  for (const mod of targets) await deleteMod(mod.id);
  await refreshInstalled();
  renderBrowse();
  toast(t('mods.installed.cleared'), 'ok');
}

/* ------------------------------------------------------------------ */
/* import                                                             */
/* ------------------------------------------------------------------ */

async function handleImport(file) {
  audio.unlock();
  if (file.size > 256 * 1024 * 1024) { toast(t('mods.import.tooBig'), 'error'); return; }
  let inspection;
  try {
    inspection = await inspectFile(file);
  } catch {
    toast(t('mods.import.invalid'), 'error');
    return;
  }
  if (inspection.kind === 'unknown' && /\.(win|zip|utmod|json)$/i.test(file.name)) {
    toast(t('mods.import.invalid'), 'error');
    return;
  }
  const record = buildLocalRecord(file, inspection);
  if (inspection.kind === 'unknown') record.kind = 'other';
  state.pending = { file, inspection, record };
  showImportModal();
}

function showImportModal() {
  const { file, inspection, record } = state.pending;
  const exists = state.installedById.has(record.id);
  const lang = getLang();
  const pack = inspection.info?.packData;
  const entryInfo = inspection.info?.entries
    ? t('mods.import.zipCount', { n: inspection.info.count || inspection.info.entries.length })
    : '';
  const rows = [
    [t('mods.import.name'), file.name],
    [t('mods.import.kind'), kindLabel(record)],
    [t('mods.import.size'), formatBytes(file.size)]
  ];
  if (pack) {
    rows.push([t('mods.import.version'), pack.version]);
    rows.push([t('mods.import.entries'), pack.name]);
  } else if (entryInfo) {
    rows.push([t('mods.import.entries'), entryInfo]);
  }
  if (inspection.info?.gameMaker) rows.push(['ENGINE', inspection.info.gameMaker]);
  if (inspection.info?.chunks) rows.push(['CHUNKS', inspection.info.chunks.slice(0, 8).join(' · ')]);
  let note = t('mods.import.noteUnknown');
  if (record.kind === 'datawin') note = t('mods.import.noteDatawin');
  else if (record.kind === 'zip-datawin') note = t('mods.import.noteZip');
  else if (record.kind === 'pack') note = t('mods.import.notePack');

  const card = openModal(`
    <div class="import-modal">
      <span class="subpage-kicker">FILE INSPECTOR // ${escapeHtml(kindLabel(record))}</span>
      <h2>${t('mods.import.title')}</h2>
      <p>${exists ? t('mods.import.exists') : t('mods.import.desc')}</p>
      <div class="import-file-info">
        <span class="file-icon">${escapeHtml((file.name.split('.').pop() || 'FILE').slice(0, 4).toUpperCase())}</span>
        <div><strong>${escapeHtml(pack?.name || record.name)}</strong><small>${escapeHtml(file.name)} · ${formatBytes(file.size)}</small></div>
      </div>
      <div class="import-facts">
        ${rows.map(([label, value]) => `<div><span>${escapeHtml(label)}</span><b>${escapeHtml(value)}</b></div>`).join('')}
      </div>
      <p class="detail-note">${escapeHtml(note)}</p>
      <div class="modal-actions">
        <button class="pixel-btn ghost" type="button" data-import-cancel>${t('common.cancel')}</button>
        <button class="pixel-btn" type="button" data-import-ok>${exists ? t('mods.import.replace') : t('mods.import.confirm')}</button>
      </div>
    </div>`, {
    className: 'import-modal-card',
    showClose: true,
    onClose: () => { state.pending = null; }
  });
  if (!card) return;
  card.querySelector('[data-import-cancel]')?.addEventListener('click', () => closeModal());
  card.querySelector('[data-import-ok]')?.addEventListener('click', (event) => confirmImport(event.currentTarget, card));
}

async function confirmImport(button, card) {
  if (!state.pending) return;
  const { file, inspection, record } = state.pending;
  const restore = busyButton(button, t('mods.import.working'));
  try {
    await putMod(record, file);
    state.pending = null;
    closeModal();
    await refreshInstalled();
    renderBrowse();
    audio.play('success');
    if (record.kind === 'pack') {
      await activateRecord(record, { silent: true });
      toast(t('mods.import.packActive', { name: record.name }), 'ok');
    } else {
      toast(t('mods.import.done', { name: record.name }), 'ok');
    }
  } catch (error) {
    restore();
    toast(t('common.error'), 'error');
  }
}

function showHowTo(record) {
  openModal(`
    <div class="import-modal">
      <span class="subpage-kicker">${escapeHtml(kindLabel(record))}</span>
      <h2>${t('mods.detail.howto')}</h2>
      <p>${t('mods.detail.howtoText')}</p>
      <div class="import-facts">
        <div><span>${t('mods.import.name')}</span><b>${escapeHtml(record.fileName || record.name)}</b></div>
        <div><span>${t('mods.import.size')}</span><b>${formatBytes(record.size)}</b></div>
        <div><span>${t('mods.import.entries')}</span><b>${escapeHtml(record.info?.gameMaker || kindLabel(record))}</b></div>
      </div>
      <p class="detail-note">${escapeHtml(t('mods.import.noteDatawin'))}</p>
      <div class="modal-actions">
        <button class="pixel-btn ghost" type="button" data-howto-export>${t('common.export')}</button>
        <button class="pixel-btn" type="button" data-modal-close>${t('common.close')}</button>
      </div>
    </div>`, { showClose: true });
  document.querySelector('[data-howto-export]')?.addEventListener('click', () => doExport(record));
}

export function getActiveRecord() {
  const id = getSettings().activePack;
  return id ? state.installedById.get(id) || null : null;
}

export function getInstalled() { return state.installed; }
