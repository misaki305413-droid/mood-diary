import { app, go } from '../store.js';
import {
  calcStreak,
  dateKey,
  entriesOfDate,
  formatDateLabel,
} from '../models.js';
import { el, escapeHtml, emptyState } from '../ui.js';
import { entryCard, hydratePhotos } from '../entryCard.js';

export function renderToday() {
  const today = dateKey();
  const todayEntries = entriesOfDate(app.state.entries, today);
  const streak = calcStreak(app.state.entries);
  const page = el(`
    <div class="page">
      <header class="page-header">
        <div>
          <p class="date-line">${escapeHtml(formatDateLabel(today))}</p>
          <h1 class="page-title">今天</h1>
        </div>
        <div class="header-actions">
          <button class="icon-btn" type="button" data-role="search" aria-label="搜索">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"
              stroke-linecap="round"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4 4"/></svg>
          </button>
          <div class="stat-pill">
            <span class="stat-pill-value">${streak}</span>
            <span class="stat-pill-label">连续天数</span>
          </div>
        </div>
      </header>
      <div class="banner-slot"></div>
      <section class="entry-list"></section>
    </div>
  `);

  page.querySelector('[data-role="search"]').addEventListener('click', () => go('search'));

  const bannerSlot = page.querySelector('.banner-slot');
  const draftBanner = buildDraftBanner();
  if (draftBanner) bannerSlot.appendChild(draftBanner);
  const banner = buildBackupBanner();
  if (banner) bannerSlot.appendChild(banner);

  const list = page.querySelector('.entry-list');
  if (todayEntries.length === 0) {
    list.appendChild(emptyState(
      '今天还没有记录',
      '点右下角的 + 花十几秒记下此刻的心情'
    ));
  } else {
    todayEntries.forEach((entry) => list.appendChild(entryCard(entry)));
  }

  hydratePhotos(list);
  return page;
}

function buildDraftBanner() {
  const draft = app.state.draft;
  if (!draft) return null;

  const banner = el(`
    <button class="banner banner-info" type="button">
      <span class="banner-icon">✍️</span>
      <span class="banner-text">有一条未完成的记录，点这里继续</span>
      <span class="banner-arrow">›</span>
    </button>
  `);
  banner.addEventListener('click', () => {
    app.editorDate = draft.date;
    go('editor', { editorEntryId: draft.entryId || null });
  });
  return banner;
}

function buildBackupBanner() {
  const settings = app.state.settings;
  const last = settings.lastBackupAt;
  const days = last ? Math.floor((Date.now() - last) / 86400000) : null;
  const entriesSince = app.state.entries.length - (settings.lastBackupEntryCount || 0);

  let tone = 'info';
  let text = '';
  if (!last) {
    text = '还没有备份过。数据只存在这台设备上，建议现在导出一次。';
    tone = 'warn';
  } else if (days >= 7) {
    text = `上次备份是 ${days} 天前，建议导出一次以免数据丢失。`;
    tone = days >= 14 ? 'danger' : 'warn';
  } else if (entriesSince >= 20) {
    text = `上次备份后新增了 ${entriesSince} 条记录，建议导出一次。`;
  } else {
    return null;
  }

  const banner = el(`
    <button class="banner banner-${tone}" type="button">
      <span class="banner-icon">${tone === 'info' ? '☁️' : '⚠️'}</span>
      <span class="banner-text">${escapeHtml(text)}</span>
      <span class="banner-arrow">›</span>
    </button>
  `);
  banner.addEventListener('click', () => go('settings'));
  return banner;
}
