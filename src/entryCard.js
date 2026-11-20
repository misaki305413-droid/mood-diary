import { app, getPhotoURL, go, persist } from './store.js';
import { activityOf, formatTime, moodOf, parseDateKey } from './models.js';
import { confirmDialog, el, escapeHtml } from './ui.js';
import { openPhotoViewer } from './photoViewer.js';

/** 记录卡片，今日页、日历、搜索、珍藏页共用 */
export function entryCard(entry, { showDate = false } = {}) {
  const mood = moodOf(app.state, entry.moodId);
  const activities = (entry.activityIds || [])
    .map((id) => activityOf(app.state, id))
    .filter(Boolean);

  let stamp = formatTime(entry.createdAt);
  if (showDate) {
    const date = parseDateKey(entry.date);
    stamp = `${date.getMonth() + 1}月${date.getDate()}日 ${stamp}`;
  }

  const card = el(`
    <div class="entry-card" role="button" tabindex="0" style="--mood-color:${escapeHtml(mood.color)}">
      <div class="entry-mood">${escapeHtml(mood.icon)}</div>
      <div class="entry-body">
        <div class="entry-top">
          <span class="entry-mood-label">
            ${entry.starred ? '<span class="entry-star">★</span>' : ''}${escapeHtml(mood.label)}
          </span>
          <span class="entry-side">
            <span class="entry-time">${stamp}</span>
            <button class="entry-like" type="button" aria-label="点赞"></button>
          </span>
        </div>
        ${activities.length
          ? `<div class="entry-tags">${activities
            .map((activity) => `<span class="tag">${escapeHtml(activity.icon)} ${escapeHtml(activity.name)}</span>`)
            .join('')}</div>`
          : ''}
        ${entry.note ? `<p class="entry-note">${escapeHtml(entry.note)}</p>` : ''}
        ${(entry.photoIds && entry.photoIds.length)
          ? `<div class="entry-photos">${entry.photoIds
            .map((id) => `<img data-photo="${escapeHtml(id)}" alt="" loading="lazy">`)
            .join('')}</div>`
          : ''}
      </div>
    </div>
  `);

  card.addEventListener('click', (event) => {
    if (event.target.closest('.entry-like')) return;
    if (event.target.closest('.entry-photos img')) return;
    app.editorDate = null;
    go('editor', { editorEntryId: entry.id });
  });
  card.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      app.editorDate = null;
      go('editor', { editorEntryId: entry.id });
    }
  });

  [...card.querySelectorAll('.entry-photos img')].forEach((image, index) => {
    image.addEventListener('click', (event) => {
      event.stopPropagation();
      openPhotoViewer(entry.photoIds, index);
    });
  });

  setupLike(card.querySelector('.entry-like'), entry);

  return card;
}

function setupLike(button, entry) {
  const refresh = () => {
    const count = entry.likes || 0;
    button.classList.toggle('is-liked', count > 0);
    button.innerHTML = `<span class="like-icon">♥</span>${count > 0 ? `<span class="like-count">${count}</span>` : ''}`;
  };
  refresh();

  let timer = null;
  let suppressClick = false;

  button.addEventListener('pointerdown', () => {
    suppressClick = false;
    timer = setTimeout(async () => {
      timer = null;
      suppressClick = true;
      if ((entry.likes || 0) === 0) return;
      const ok = await confirmDialog('清零点赞？', '这条记录的点赞数会归零。', {
        confirmText: '清零',
        danger: true,
      });
      if (!ok) return;
      entry.likes = 0;
      entry.updatedAt = Date.now();
      persist();
      refresh();
    }, 600);
  });

  const cancel = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };
  button.addEventListener('pointerup', cancel);
  button.addEventListener('pointerleave', cancel);
  button.addEventListener('pointercancel', cancel);

  button.addEventListener('click', (event) => {
    event.stopPropagation();
    if (suppressClick) {
      suppressClick = false;
      return;
    }
    entry.likes = (entry.likes || 0) + 1;
    entry.updatedAt = Date.now();
    persist();
    refresh();
    button.classList.add('is-bump');
    setTimeout(() => button.classList.remove('is-bump'), 240);
  });
}

export async function hydratePhotos(root) {
  const images = [...root.querySelectorAll('img[data-photo]')];
  for (const image of images) {
    const url = await getPhotoURL(image.dataset.photo);
    if (url) image.src = url;
  }
}
