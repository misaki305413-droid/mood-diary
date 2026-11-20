import { app, go } from '../store.js';
import { activityOf, moodOf, parseDateKey } from '../models.js';
import { el, emptyState } from '../ui.js';

export function renderReview() {
  const now = new Date();
  if (!app.reviewCursor) {
    app.reviewCursor = { year: now.getFullYear(), month: now.getMonth() };
  }
  const cursor = app.reviewCursor;

  const page = el(`
    <div class="page">
      <header class="page-header">
        <div>
          <p class="date-line">回顾</p>
          <h1 class="page-title">${cursor.year} 年 ${cursor.month + 1} 月</h1>
        </div>
        <button class="text-btn" type="button" data-role="back">返回</button>
      </header>
      <div class="month-nav review-nav">
        <button class="icon-btn" type="button" data-role="prev" aria-label="上个月">‹</button>
        <button class="icon-btn" type="button" data-role="next" aria-label="下个月">›</button>
      </div>
      <div class="review-body"></div>
    </div>
  `);

  page.querySelector('[data-role="back"]').addEventListener('click', () => go('stats'));
  page.querySelector('[data-role="prev"]').addEventListener('click', () => {
    const date = new Date(cursor.year, cursor.month - 1, 1);
    cursor.year = date.getFullYear();
    cursor.month = date.getMonth();
    go('review');
  });
  page.querySelector('[data-role="next"]').addEventListener('click', () => {
    const next = new Date(cursor.year, cursor.month + 1, 1);
    if (next > now) return;
    cursor.year = next.getFullYear();
    cursor.month = next.getMonth();
    go('review');
  });

  renderBody(page.querySelector('.review-body'), cursor.year, cursor.month);
  return page;
}

function monthEntries(year, month) {
  const prefix = `${year}-${String(month + 1).padStart(2, '0')}`;
  return app.state.entries.filter((entry) => entry.date.startsWith(prefix));
}

function renderBody(container, year, month) {
  const entries = monthEntries(year, month);
  if (!entries.length) {
    container.appendChild(emptyState('这个月没有记录', '换个有记录的时间看看'));
    return;
  }

  const levels = entries.map((entry) => moodOf(app.state, entry.moodId).level);
  const average = levels.reduce((sum, level) => sum + level, 0) / levels.length;
  const days = new Set(entries.map((entry) => entry.date)).size;

  const prev = monthEntries(...previousMonth(year, month));
  const prevAverage = prev.length
    ? prev.reduce((sum, entry) => sum + moodOf(app.state, entry.moodId).level, 0) / prev.length
    : null;

  const summary = el(`
    <div class="card">
      <div class="summary-grid">
        <div class="summary-card">
          <span class="summary-value">${days}</span>
          <span class="summary-label">记录天数</span>
        </div>
        <div class="summary-card">
          <span class="summary-value">${entries.length}</span>
          <span class="summary-label">记录条数</span>
        </div>
        <div class="summary-card">
          <span class="summary-value">${average.toFixed(1)}</span>
          <span class="summary-label">平均心情</span>
        </div>
        <div class="summary-card">
          <span class="summary-value" data-role="delta"></span>
          <span class="summary-label">较上月</span>
        </div>
      </div>
    </div>
  `);

  const deltaNode = summary.querySelector('[data-role="delta"]');
  if (prevAverage == null) {
    deltaNode.textContent = '—';
  } else {
    const diff = average - prevAverage;
    deltaNode.textContent = `${diff >= 0 ? '+' : ''}${diff.toFixed(1)}`;
    deltaNode.classList.toggle('is-up', diff > 0);
    deltaNode.classList.toggle('is-down', diff < 0);
  }
  container.appendChild(summary);

  container.appendChild(buildDistribution(entries));
  container.appendChild(buildActivities(entries));
  container.appendChild(buildExtremes(entries));
}

function previousMonth(year, month) {
  const date = new Date(year, month - 1, 1);
  return [date.getFullYear(), date.getMonth()];
}

function buildDistribution(entries) {
  const counts = new Map();
  for (const entry of entries) {
    counts.set(entry.moodId, (counts.get(entry.moodId) || 0) + 1);
  }

  const card = el(`
    <div class="card">
      <h2 class="card-title">心情分布</h2>
      <div class="review-rows"></div>
    </div>
  `);
  const rows = card.querySelector('.review-rows');
  const moods = [...app.state.moods].sort((a, b) => b.level - a.level);
  const total = entries.length;

  moods.forEach((mood) => {
    const count = counts.get(mood.id) || 0;
    if (!count) return;
    rows.appendChild(el(`
      <div class="review-row">
        <span class="legend-dot" style="background:${mood.color}"></span>
        <span class="review-label">${mood.icon} ${mood.label}</span>
        <span class="review-bar"><i style="width:${(count / total) * 100}%;background:${mood.color}"></i></span>
        <span class="review-value">${count}</span>
      </div>
    `));
  });
  return card;
}

function buildActivities(entries) {
  const counts = new Map();
  for (const entry of entries) {
    for (const id of entry.activityIds || []) {
      counts.set(id, (counts.get(id) || 0) + 1);
    }
  }

  const top = [...counts.entries()]
    .map(([id, count]) => ({ activity: activityOf(app.state, id), count }))
    .filter((item) => item.activity)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const card = el(`
    <div class="card">
      <h2 class="card-title">出现最多的活动</h2>
      <div class="review-rows"></div>
    </div>
  `);
  const rows = card.querySelector('.review-rows');

  if (!top.length) {
    rows.appendChild(el('<p class="card-foot">这个月没有勾选活动</p>'));
    return card;
  }

  const max = top[0].count;
  top.forEach((item) => {
    rows.appendChild(el(`
      <div class="review-row">
        <span class="review-emoji">${item.activity.icon}</span>
        <span class="review-label">${item.activity.name}</span>
        <span class="review-bar"><i style="width:${(item.count / max) * 100}%"></i></span>
        <span class="review-value">${item.count}</span>
      </div>
    `));
  });
  return card;
}

function buildExtremes(entries) {
  const byDate = new Map();
  for (const entry of entries) {
    if (!byDate.has(entry.date)) byDate.set(entry.date, []);
    byDate.get(entry.date).push(moodOf(app.state, entry.moodId).level);
  }

  const daily = [...byDate.entries()].map(([date, levels]) => ({
    date,
    average: levels.reduce((sum, level) => sum + level, 0) / levels.length,
  }));

  const best = daily.reduce((a, b) => (b.average > a.average ? b : a));
  const worst = daily.reduce((a, b) => (b.average < a.average ? b : a));
  const format = (item) => {
    const date = parseDateKey(item.date);
    return `${date.getMonth() + 1} 月 ${date.getDate()} 日`;
  };

  return el(`
    <div class="card">
      <h2 class="card-title">这个月的两个极端</h2>
      <div class="review-extremes">
        <div class="extreme">
          <span class="extreme-label">最好的一天</span>
          <span class="extreme-date">${format(best)}</span>
          <span class="extreme-value">${best.average.toFixed(1)}</span>
        </div>
        <div class="extreme">
          <span class="extreme-label">最难的一天</span>
          <span class="extreme-date">${format(worst)}</span>
          <span class="extreme-value">${worst.average.toFixed(1)}</span>
        </div>
      </div>
      <p class="card-foot">同一天有多条记录时取平均，不作为任何判断依据。</p>
    </div>
  `);
}
