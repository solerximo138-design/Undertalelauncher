export const GAME_ID = 5506;
export const GAME_URL = `https://gamebanana.com/games/${GAME_ID}`;
const API = 'https://gamebanana.com/apiv11';

export class GameBananaError extends Error {
  constructor(message, { code = 'network', status = 0 } = {}) {
    super(message);
    this.name = 'GameBananaError';
    this.code = code;
    this.status = status;
  }
}

async function fetchJSON(url, { signal, timeout = 25_000 } = {}) {
  if (navigator.onLine === false) throw new GameBananaError('Offline', { code: 'offline' });
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeout);
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      mode: 'cors',
      credentials: 'omit',
      signal: controller.signal
    });
    if (!response.ok) throw new GameBananaError(`HTTP ${response.status}`, { code: 'http', status: response.status });
    return await response.json();
  } catch (error) {
    if (error?.name === 'GameBananaError') throw error;
    if (signal?.aborted) throw new GameBananaError('Aborted', { code: 'aborted' });
    if (timedOut) throw new GameBananaError('Timeout', { code: 'timeout' });
    throw new GameBananaError('Network error', { code: 'network' });
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}

export function imageUrl(image, size = '530') {
  if (!image) return '';
  const file = size === '220' && image._sFile220
    ? image._sFile220
    : size === '100' && image._sFile100
      ? image._sFile100
      : size === '530' && image._sFile530
        ? image._sFile530
        : image._sFile;
  if (!file) return '';
  return `${image._sBaseUrl}/${file}`;
}

function mapRecord(record) {
  const image = record._aPreviewMedia?._aImages?.[0];
  const category = record._aRootCategory?._sName || record._aCategory?._sName || 'Mod';
  return {
    id: Number(record._idRow),
    name: record._sName || 'Untitled mod',
    profileUrl: record._sProfileUrl || `https://gamebanana.com/mods/${record._idRow}`,
    author: record._aSubmitter?._sName || 'Unknown',
    authorUrl: record._aSubmitter?._sProfileUrl || '',
    authorAvatar: record._aSubmitter?._sAvatarUrl || '',
    category,
    version: record._sVersion || '',
    likes: Number(record._nLikeCount) || 0,
    views: Number(record._nViewCount) || 0,
    posts: Number(record._nPostCount) || 0,
    dateAdded: Number(record._tsDateAdded) || 0,
    dateUpdated: Number(record._tsDateUpdated || record._tsDateModified || record._tsDateAdded) || 0,
    hasFiles: Boolean(record._bHasFiles),
    obsolete: Boolean(record._bIsObsolete),
    game: record._aGame ? { id: Number(record._aGame._idRow), name: record._aGame._sName } : null,
    cover: imageUrl(image, '530'),
    coverSmall: imageUrl(image, '220') || imageUrl(image, '100'),
    screens: (record._aPreviewMedia?._aImages || []).map((img) => ({
      full: imageUrl(img, 'full'),
      large: imageUrl(img, '530'),
      small: imageUrl(img, '220'),
      caption: img._sCaption || ''
    })).filter((img) => img.large),
    raw: record
  };
}

function mapDetail(record) {
  const base = mapRecord(record);
  return {
    ...base,
    description: htmlToText(record._sText || record._sDescription || ''),
    shortDescription: htmlToText(record._sDescription || ''),
    downloads: Number(record._nDownloadCount) || 0,
    files: (record._aFiles || []).map((file) => ({
      id: Number(file._idRow),
      name: file._sFile || `file-${file._idRow}`,
      size: Number(file._nFilesize) || 0,
      date: Number(file._tsDateAdded) || 0,
      downloads: Number(file._nDownloadCount) || 0,
      url: file._sDownloadUrl || '',
      md5: file._sMd5Checksum || '',
      analysis: file._sAnalysisResult || '',
      av: file._sAvResult || '',
      description: file._sDescription || ''
    })),
    images: (record._aPreviewMedia?._aImages || []).map((img) => ({
      large: imageUrl(img, '530'),
      small: imageUrl(img, '220'),
      caption: img._sCaption || ''
    })).filter((img) => img.large),
    credits: record._aCredits || []
  };
}

export async function browseMods({ sort = 'default', page = 1, signal } = {}) {
  const safeSort = ['default', 'new', 'updated'].includes(sort) ? sort : 'default';
  const url = `${API}/Game/${GAME_ID}/Subfeed?_nPage=${page}&_sSort=${safeSort}`;
  const data = await fetchJSON(url, { signal });
  const records = (data._aRecords || []).map(mapRecord);
  return {
    records,
    total: Number(data._aMetadata?._nRecordCount) || 0,
    page,
    more: !data._aMetadata?._bIsComplete,
    perPage: Number(data._aMetadata?._nPerpage) || records.length
  };
}

export async function searchMods({ query, page = 1, signal }) {
  const text = String(query || '').trim();
  if (!text) return { records: [], total: 0, page, more: false };
  const url = `${API}/Util/Search/Results?_sSearchString=${encodeURIComponent(text)}&_sModelName=Mod&_nPage=${page}`;
  const data = await fetchJSON(url, { signal });
  const records = (data._aRecords || [])
    .filter((record) => Number(record._aGame?._idRow) === GAME_ID)
    .map(mapRecord);
  return {
    records,
    total: records.length,
    page,
    more: !data._aMetadata?._bIsComplete
  };
}

export async function fetchModDetail(id, { signal } = {}) {
  if (!id) throw new GameBananaError('Missing mod id', { code: 'input' });
  const data = await fetchJSON(`${API}/Mod/${id}/ProfilePage`, { signal });
  if (!data || !data._idRow) throw new GameBananaError('Mod not found', { code: 'notfound' });
  return mapDetail(data);
}

export function htmlToText(html) {
  if (!html) return '';
  let source = String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|ul|ol)>/gi, '\n\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<\/li>/gi, '\n');
  try {
    const doc = new DOMParser().parseFromString(`<div>${source}</div>`, 'text/html');
    source = doc.body.textContent || '';
  } catch {
    source = source.replace(/<[^>]+>/g, ' ');
  }
  return source
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, 14_000);
}

export function modFileKind(file) {
  const name = String(file?.name || '').toLowerCase();
  if (name.endsWith('.win')) return 'data.win';
  if (name.endsWith('.zip')) return 'ZIP';
  if (name.endsWith('.utmod') || name.endsWith('.json')) return '.utmod';
  return 'FILE';
}
