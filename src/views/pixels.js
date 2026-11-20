import { app, go } from '../store.js';
import {
  dateKey,
  entriesOfDate,
  moodOf,
  parseDateKey,
} from '../models.js';
import { el, escapeHtml } from '../ui.js';
import { entryCard, hydratePhotos } from '../entryCard.js';

let currentYear = new Date().getFullYear();
let selectedDate = null;

export function renderPixels() {
  const page = el(`
    <div class="page">
      <header class="page-header">
        <div>
          <p class="date-line">年度</p>
          <h1 class="page-title">像素图</h1>
        </div>
        <button class="text-btn" type="button" data-role="back">返回</button>
      </header>
      <div class="card">
        <div class="year-nav">
          <button class="icon-btn" type="button" data-role="prev" aria-label="上一年">‹</button>
          <span class="year-label"></span>
          <button class="icon-btn" type="button" data-role="next" aria-label="下一年">›</button>
        </div>
        <div class="pixels-grid"></div>
        <p class="card-foot">圆点是那天各心情占比的饼图，从 12 点方向顺时针，心情越差越靠前。</p>
        <div class="pixel-legend"></div>
      </div>
      <div class="card pixel-summary"></div>
      <div class="pixel-detail"></div>
    </div>
  `);

  page.querySelector('[data-role="back"]').addEventListener('click', () => go('stats'));
  page.querySelector('.year-label').textContent = `${currentYear} 年`;

  page.querySelector('[data-role="prev"]').addEventListener('click', () => {
    currentYear -= 1;
    selectedDate = null;
    go('pixels');
  });
  page.querySelector('[data-role="next"]').addEventListener('click', () => {
    if (currentYear >= new Date().getFullYear()) return;
    currentYear += 1;
    selectedDate = null;
    go('pixels');
  });

  const grid = page.querySelector('.pixels-grid');
  const byDate = new Map();
  for (const entry of app.state.entries) {
    if (!byDate.has(entry.date)) byDate.set(entry.date, []);
    byDate.get(entry.date).push(entry);
  }

  for (let month = 0; month < 12; month += 1) {
    grid.appendChild(el(`<span class="pixel-label">${month + 1}</span>`));
    const daysInMonth = new Date(currentYear, month + 1, 0).getDate();
    for (let day = 1; day <= 31; day += 1) {
      if (day > daysInMonth) {
        grid.appendChild(el('<span class="pixel pixel-blank"></span>'));
        continue;
      }
      const key = `${currentYear}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const entries = byDate.get(key) || [];
      const fill = dayFill(entries);
      const cell = el(`
        <button class="pixel" type="button" data-date="${key}" aria-label="${key}">
        </button>
      `);
      if (fill) cell.style.background = fill;
      if (key === selectedDate) cell.classList.add('is-selected');
      if (key === dateKey()) cell.classList.add('is-today');
      grid.appendChild(cell);
    }
  }

  grid.addEventListener('click', (event) => {
    const cell = event.target.closest('.pixel');
    if (!cell || !cell.dataset.date) return;
    selectedDate = cell.dataset.date;
    [...grid.querySelectorAll('.pixel.is-selected')].forEach((node) => node.classList.remove('is-selected'));
    cell.classList.add('is-selected');
    renderDetail(page, byDate);
  });

  renderLegend(page.querySelector('.pixel-legend'));
  renderSummary(page.querySelector('.pixel-summary'), byDate);
  renderDetail(page, byDate);

  return page;
}

/**
 * 一天的填充：按心情占比画成扇形饼图，从 12 点方向顺时针，心情越差越靠前。
 * 只有一种心情时就是纯色。
 */
function dayFill(entries) {
  if (!entries || !entries.length) return null;

  const counts = new Map();
  for (const entry of entries) {
    counts.set(entry.moodId, (counts.get(entry.moodId) || 0) + 1);
  }

  const ordered = [...counts.entries()]
    .map(([moodId, count]) => ({ mood: moodOf(app.state, moodId), count }))
    .sort((a, b) => a.mood.level - b.mood.level);

  if (ordered.length === 1) return ordered[0].mood.color;

  const total = entries.length;
  let acc = 0;
  const stops = ordered.map((item) => {
    const start = (acc / total) * 360;
    acc += item.count;
    const end = (acc / total) * 360;
    return `${item.mood.color} ${start}deg ${end}deg`;
  });

  return `conic-gradient(${stops.join(', ')})`;
}

function renderLegend(container) {
  const moods = [...app.state.moods].sort((a, b) => a.level - b.level);
  container.innerHTML = '';
  moods.forEach((mood) => {
    container.appendChild(el(`
      <span class="legend-item">
        <span class="legend-dot" style="background:${mood.color}"></span>
        ${escapeHtml(mood.label)}
      </span>
    `));
  });
  container.appendChild(el(`
    <span class="legend-item">
      <span class="legend-dot legend-dot-empty"></span>
      无记录
    </span>
  `));
}

function renderSummary(container, byDate) {
  const keys = [...byDate.keys()].filter((key) => key.startsWith(`${currentYear}-`));
  const totalEntries = keys.reduce((sum, key) => sum + byDate.get(key).length, 0);
  const levels = [];
  for (const key of keys) {
    for (const entry of byDate.get(key)) {
      levels.push(moodOf(app.state, entry.moodId).level);
    }
  }
  const average = levels.length
    ? (levels.reduce((sum, level) => sum + level, 0) / levels.length).toFixed(1)
    : '—';

  container.innerHTML = `
    <div class="pixel-stats">
      <div class="pixel-stat">
        <span class="pixel-stat-value">${keys.length}</span>
        <span class="pixel-stat-label">记录天数</span>
      </div>
      <div class="pixel-stat">
        <span class="pixel-stat-value">${totalEntries}</span>
        <span class="pixel-stat-label">记录条数</span>
      </div>
      <div class="pixel-stat">
        <span class="pixel-stat-value">${average}</span>
        <span class="pixel-stat-label">平均心情</span>
      </div>
    </div>
  `;
}

function renderDetail(page, byDate) {
  const panel = page.querySelector('.pixel-detail');
  panel.innerHTML = '';

  if (!selectedDate) {
    panel.appendChild(el('<p class="pixel-hint">点任意一个色块，查看那天的记录</p>'));
    return;
  }

  const date = parseDateKey(selectedDate);
  const entries = entriesOfDate(app.state.entries, selectedDate);
  const header = el(`
    <div class="panel-header">
      <h2 class="panel-title">${date.getMonth() + 1} 月 ${date.getDate()} 日</h2>
      <button class="text-btn text-btn-strong" type="button" data-role="open-day">在日历中查看</button>
    </div>
  `);
  header.querySelector('[data-role="open-day"]').addEventListener('click', () => {
    app.calendarCursor = {
      year: date.getFullYear(),
      month: date.getMonth(),
      selected: selectedDate,
    };
    go('calendar');
  });
  panel.appendChild(header);

  if (!entries.length) {
    panel.appendChild(el('<p class="pixel-hint">这天没有记录</p>'));
    return;
  }

  const list = el('<div class="entry-list"></div>');
  entries.forEach((entry) => list.appendChild(entryCard(entry)));
  panel.appendChild(list);
  hydratePhotos(list);
}
