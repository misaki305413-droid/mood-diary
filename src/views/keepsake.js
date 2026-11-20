import { app, go } from '../store.js';
import { sortEntries } from '../models.js';
import { el, emptyState } from '../ui.js';
import { entryCard, hydratePhotos } from '../entryCard.js';

export function renderKeepsake() {
  const starred = sortEntries(app.state.entries.filter((entry) => entry.starred));
  const top = [...app.state.entries]
    .filter((entry) => (entry.likes || 0) > 0)
    .sort((a, b) => (b.likes || 0) - (a.likes || 0) || b.createdAt - a.createdAt)
    .slice(0, 10);

  const page = el(`
    <div class="page">
      <header class="page-header">
        <div>
          <p class="date-line">珍藏</p>
          <h1 class="page-title">舍不得忘的</h1>
        </div>
        <button class="text-btn" type="button" data-role="back">返回</button>
      </header>
      <section class="card">
        <div class="card-head">
          <h2 class="card-title">收藏的一天</h2>
          <span class="card-count">${starred.length} 条</span>
        </div>
        <div class="starred-list"></div>
      </section>
      <section class="card">
        <div class="card-head">
          <h2 class="card-title">点赞最多</h2>
          <span class="card-count">Top ${top.length || 10}</span>
        </div>
        <div class="top-list"></div>
      </section>
    </div>
  `);

  page.querySelector('[data-role="back"]').addEventListener('click', () => go('stats'));

  const starredList = page.querySelector('.starred-list');
  if (!starred.length) {
    starredList.appendChild(emptyState('还没有收藏', '在记录编辑页点「收藏这一天」'));
  } else {
    const list = el('<div class="entry-list"></div>');
    starred.forEach((entry) => list.appendChild(entryCard(entry, { showDate: true })));
    starredList.appendChild(list);
    hydratePhotos(list);
  }

  const topList = page.querySelector('.top-list');
  if (!top.length) {
    topList.appendChild(emptyState('还没有点赞', '在记录卡片的爱心上点一下，可以重复点'));
  } else {
    const list = el('<div class="entry-list"></div>');
    top.forEach((entry) => list.appendChild(entryCard(entry, { showDate: true })));
    topList.appendChild(list);
    hydratePhotos(list);
  }

  return page;
}
