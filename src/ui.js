export function el(html) {
  const template = document.createElement('template');
  template.innerHTML = html.trim();
  return template.content.firstElementChild;
}

export function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

let toastTimer = null;

export function toast(message) {
  let node = document.getElementById('toast');
  if (!node) {
    node = document.createElement('div');
    node.id = 'toast';
    document.body.appendChild(node);
  }
  node.textContent = message;
  node.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.classList.remove('is-visible'), 2200);
}

function buildOverlay() {
  const overlay = el(`
    <div class="modal-overlay">
      <div class="modal" role="dialog" aria-modal="true"></div>
    </div>
  `);
  document.body.appendChild(overlay);
  return overlay;
}

function closeOverlay(overlay) {
  overlay.classList.remove('is-open');
  setTimeout(() => overlay.remove(), 180);
}

export function alertDialog(title, message = '') {
  return new Promise((resolve) => {
    const overlay = buildOverlay();
    const modal = overlay.querySelector('.modal');
    modal.innerHTML = `
      <h2 class="modal-title">${escapeHtml(title)}</h2>
      ${message ? `<p class="modal-text">${escapeHtml(message)}</p>` : ''}
      <div class="modal-actions">
        <button class="btn btn-primary" data-value="ok">知道了</button>
      </div>
    `;
    requestAnimationFrame(() => overlay.classList.add('is-open'));
    modal.querySelector('[data-value="ok"]').addEventListener('click', () => {
      closeOverlay(overlay);
      resolve();
    });
  });
}

export function confirmDialog(title, message = '', { confirmText = '确定', danger = false } = {}) {
  return new Promise((resolve) => {
    const overlay = buildOverlay();
    const modal = overlay.querySelector('.modal');
    modal.innerHTML = `
      <h2 class="modal-title">${escapeHtml(title)}</h2>
      ${message ? `<p class="modal-text">${escapeHtml(message)}</p>` : ''}
      <div class="modal-actions">
        <button class="btn" data-value="cancel">取消</button>
        <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-value="ok">${escapeHtml(confirmText)}</button>
      </div>
    `;
    requestAnimationFrame(() => overlay.classList.add('is-open'));

    const finish = (value) => {
      closeOverlay(overlay);
      resolve(value);
    };
    modal.querySelector('[data-value="cancel"]').addEventListener('click', () => finish(false));
    modal.querySelector('[data-value="ok"]').addEventListener('click', () => finish(true));
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) finish(false);
    });
  });
}

export function choiceDialog(title, message, options) {
  return new Promise((resolve) => {
    const overlay = buildOverlay();
    const modal = overlay.querySelector('.modal');
    modal.innerHTML = `
      <h2 class="modal-title">${escapeHtml(title)}</h2>
      ${message ? `<p class="modal-text">${escapeHtml(message)}</p>` : ''}
      <div class="modal-actions modal-actions-column">
        ${options.map((option, index) => `
          <button class="btn ${option.danger ? 'btn-soft-danger' : ''}" data-index="${index}">
            ${escapeHtml(option.label)}
          </button>
        `).join('')}
        <button class="btn" data-value="cancel">取消</button>
      </div>
    `;
    requestAnimationFrame(() => overlay.classList.add('is-open'));

    const finish = (result) => {
      closeOverlay(overlay);
      resolve(result);
    };

    modal.querySelectorAll('[data-index]').forEach((button) => {
      button.addEventListener('click', () => {
        finish(options[Number(button.dataset.index)].value);
      });
    });
    modal.querySelector('[data-value="cancel"]').addEventListener('click', () => finish(null));
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) finish(null);
    });
  });
}

export function promptDialog(title, {
  label = '',
  placeholder = '',
  type = 'text',
  value = '',
  confirmText = '确定',
  maxLength = 0,
  minLength = 0,
  danger = false,
} = {}) {
  return new Promise((resolve) => {
    const overlay = buildOverlay();
    const modal = overlay.querySelector('.modal');
    modal.innerHTML = `
      <h2 class="modal-title">${escapeHtml(title)}</h2>
      ${label ? `<p class="modal-text">${escapeHtml(label)}</p>` : ''}
      <input class="modal-input" type="${type}" value="${escapeHtml(value)}"
        placeholder="${escapeHtml(placeholder)}"
        ${maxLength ? `maxlength="${maxLength}"` : ''} autocomplete="off" autocapitalize="off" spellcheck="false">
      <p class="modal-error" hidden></p>
      <div class="modal-actions">
        <button class="btn" data-value="cancel">取消</button>
        <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-value="ok">${escapeHtml(confirmText)}</button>
      </div>
    `;
    requestAnimationFrame(() => overlay.classList.add('is-open'));

    const input = modal.querySelector('.modal-input');
    const error = modal.querySelector('.modal-error');
    setTimeout(() => input.focus(), 200);

    const finish = (result) => {
      closeOverlay(overlay);
      resolve(result);
    };
    const submit = () => {
      const text = input.value.trim();
      if (text.length < minLength) {
        error.textContent = `至少需要 ${minLength} 个字符`;
        error.hidden = false;
        return;
      }
      finish(text);
    };

    modal.querySelector('[data-value="cancel"]').addEventListener('click', () => finish(null));
    modal.querySelector('[data-value="ok"]').addEventListener('click', submit);
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') submit();
    });
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) finish(null);
    });
  });
}

export function emptyState(title, description = '') {
  return el(`
    <div class="empty">
      <p class="empty-title">${escapeHtml(title)}</p>
      ${description ? `<p class="empty-text">${escapeHtml(description)}</p>` : ''}
    </div>
  `);
}
