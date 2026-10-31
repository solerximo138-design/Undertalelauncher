let modalEl = null;
let lastFocus = null;
let modalDismissible = true;
let onModalClose = null;

export function icon(name, className = 'pixel-icon') {
  return `<svg class="${className}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function toast(message, type = 'info', timeout = 4200) {
  const root = document.getElementById('toastRoot');
  if (!root) return;
  const el = document.createElement('div');
  el.className = `toast is-${type}`;
  const iconName = type === 'error' ? 'close' : type === 'ok' ? 'check' : 'heart';
  el.innerHTML = `${icon(iconName)}<span>${escapeHtml(message)}</span>`;
  el.setAttribute('role', type === 'error' ? 'alert' : 'status');
  root.appendChild(el);
  while (root.children.length > 4) root.firstElementChild?.remove();
  setTimeout(() => {
    el.classList.add('is-out');
    setTimeout(() => el.remove(), 320);
  }, timeout);
}

export function openModal(html, options = {}) {
  closeModal({ silent: true });
  const root = document.getElementById('modalRoot');
  if (!root) return null;
  lastFocus = document.activeElement;
  modalDismissible = options.dismissible !== false;
  onModalClose = options.onClose || null;

  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  const card = document.createElement('div');
  card.className = `modal-card ${options.className || ''}`.trim();
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-modal', 'true');
  if (options.labelledBy) card.setAttribute('aria-labelledby', options.labelledBy);
  card.innerHTML = `${options.showClose === false ? '' : `<button class="modal-close" type="button" data-modal-close aria-label="Close">${icon('close')}</button>`}${html}`;
  backdrop.appendChild(card);
  root.appendChild(backdrop);
  modalEl = { backdrop, card };

  backdrop.addEventListener('click', (event) => {
    if (event.target === backdrop && modalDismissible) closeModal();
  });
  card.addEventListener('click', (event) => {
    const close = event.target.closest('[data-modal-close]');
    if (close) { event.preventDefault(); closeModal(); }
  });

  const onKey = (event) => {
    if (!modalEl || !modalDismissible) return;
    if (event.key === 'Escape') { event.preventDefault(); closeModal(); }
  };
  document.addEventListener('keydown', onKey);
  backdrop._onKey = onKey;

  options.onMount?.(card, closeModal);

  requestAnimationFrame(() => {
    const focusable = card.querySelector('[autofocus], button:not([disabled]), input, a[href]');
    focusable?.focus?.({ preventScroll: true });
  });

  return card;
}

export function closeModal({ silent = false } = {}) {
  const root = document.getElementById('modalRoot');
  if (!modalEl) return;
  const { backdrop } = modalEl;
  if (backdrop?._onKey) document.removeEventListener('keydown', backdrop._onKey);
  backdrop?.remove();
  modalEl = null;
  const callback = onModalClose;
  onModalClose = null;
  if (!silent) lastFocus?.focus?.({ preventScroll: true });
  lastFocus = null;
  if (typeof callback === 'function') callback();
  if (root) root.innerHTML = '';
}

export function isModalOpen() { return Boolean(modalEl); }

export function confirmDialog({
  title,
  text,
  confirmLabel = 'OK',
  cancelLabel = 'CANCEL',
  danger = false
}) {
  return new Promise((resolve) => {
    let resolved = false;
    const finish = (value) => {
      if (resolved) return;
      resolved = true;
      resolve(value);
    };
    openModal(
      `<div class="modal-small">
        <h2>${escapeHtml(title)}</h2>
        <p>${escapeHtml(text)}</p>
        <div class="modal-actions">
          <button class="pixel-btn ghost" type="button" data-confirm-cancel>${escapeHtml(cancelLabel)}</button>
          <button class="pixel-btn ${danger ? 'danger' : ''}" type="button" data-confirm-ok>${escapeHtml(confirmLabel)}</button>
        </div>
      </div>`,
      {
        className: 'confirm-modal',
        showClose: false,
        dismissible: true,
        onClose: () => finish(false),
        onMount(card, close) {
          card.querySelector('[data-confirm-cancel]')?.addEventListener('click', () => { finish(false); close(); });
          card.querySelector('[data-confirm-ok]')?.addEventListener('click', () => { finish(true); close(); });
        }
      }
    );
  });
}

export function busyButton(button, label) {
  if (!button) return () => {};
  const original = button.innerHTML;
  button.disabled = true;
  button.innerHTML = `<span class="spin-dot"></span>${escapeHtml(label)}`;
  return () => {
    button.disabled = false;
    button.innerHTML = original;
  };
}

export function flash(color = 'white') {
  const el = document.getElementById('flash');
  if (!el) return;
  el.style.background = color;
  el.classList.remove('is-on');
  void el.offsetWidth;
  el.classList.add('is-on');
  setTimeout(() => el.classList.remove('is-on'), 500);
}

export function timeAgo(timestamp, lang = 'ru') {
  const value = Number(timestamp);
  if (!value) return '';
  const seconds = Math.max(0, Math.floor(Date.now() / 1000 - value));
  const day = 86_400;
  if (seconds < 3600) {
    const mins = Math.max(1, Math.floor(seconds / 60));
    return lang === 'ru' ? `${mins} мин назад` : `${mins} min ago`;
  }
  if (seconds < day) {
    const hours = Math.floor(seconds / 3600);
    return lang === 'ru' ? `${hours} ч назад` : `${hours} h ago`;
  }
  if (seconds < day * 2) return lang === 'ru' ? 'вчера' : 'yesterday';
  if (seconds < day * 30) {
    const days = Math.floor(seconds / day);
    return lang === 'ru' ? `${days} дн. назад` : `${days} d ago`;
  }
  if (seconds < day * 365) {
    const months = Math.floor(seconds / (day * 30));
    return lang === 'ru' ? `${months} мес. назад` : `${months} mo ago`;
  }
  const years = Math.floor(seconds / (day * 365));
  return lang === 'ru' ? `${years} г. назад` : `${years} y ago`;
}
