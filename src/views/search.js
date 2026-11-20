import { app, go } from '../store.js';
import { activityOf, dateKey, sortEntries } from '../models.js';
import { el, escapeHtml, emptyState } from '../ui.js';
import { entryCard, hydratePhotos } from '../entryCard.js';

const RANGES = [
  { id: 'all', label: '全部' },
  { id: '7', label: '7 天' },
  { id: '30', label: '30 天' },
  { id: '90', label: '90 天' },
  { id: '365', label: '一年' },
];

const VISIBLE_ACTIVITIES = 10;

const filters = {
  keyword: '',
  range: 'all',
  moodIds: new Set(),
  activityIds: new Set(),
  expanded: false,
};

export function renderSearch() {
  const page = el(`
    <div class="page search-page">
      <header class="page-header">
        <div>
          <p class="date-line">搜索</p>
          <h1 class="page-title">找记录</h1>
        </div>
        <button class="text-btn" type="button" data-role="back">返回</button>
      </header>
      <input class="search-input" type="search" placeholder="搜文字、活动或心情"
        autocomplete="off" autocapitalize="off" spellcheck="false">
      <div class="filter-group">
        <p class="filter-group-title">时间</p>
        <div class="filter-chips range-chips"></div>
      </div>
      <div class="filter-group">
        <p class="filter-group-title">心情</p>
        <div class="filter-chips mood-chips"></div>
      </div>
      <div class="filter-group">
        <p class="filter-group-title">活动</p>
        <div class="filter-chips activity-chips"></div>
      </div>
      <p class="result-count"></p>
      <section class="entry-list results"></section>
    </div>
  `);

  const input = page.querySelector('.search-input');
  const rangeChips = page.querySelector('.range-chips');
  const moodChips = page.querySelector('.mood-chips');
  const activityChips = page.querySelector('.activity-chips');
  const countNode = page.querySelector('.result-count');
  const results = page.querySelector('.results');

  input.value = filters.keyword;
  page.querySelector('[data-role="back"]').addEventListener('click', () => go('today'));

  let timer = null;
  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      filters.keyword = input.value.trim();
      run();
    }, 150);
  });

  RANGES.forEach((range) => {
    const chip = el(`<button class="filter-chip" type="button">${range.label}</button>`);
    chip.classList.toggle('is-active', filters.range === range.id);
    chip.addEventListener('click', () => {
      filters.range = range.id;
      [...rangeChips.children].forEach((node) => node.classList.remove('is-active'));
      chip.classList.add('is-active');
      run();
    });
    rangeChips.appendChild(chip);
  });

  [...app.state.moods]
    .sort((a, b) => a.level - b.level)
    .forEach((mood) => {
      const chip = el(`
        <button class="filter-chip" type="button" style="--chip-color:${escapeHtml(mood.color)}">
          ${escapeHtml(mood.icon)} ${escapeHtml(mood.label)}
        </button>
      `);
      chip.classList.toggle('is-active', filters.moodIds.has(mood.id));
      chip.addEventListener('click', () => {
        if (filters.moodIds.has(mood.id)) filters.moodIds.delete(mood.id);
        else filters.moodIds.add(mood.id);
        chip.classList.toggle('is-active');
        run();
      });
      moodChips.appendChild(chip);
    });

  const renderActivityChips = () => {
    activityChips.innerHTML = '';
    const activities = app.state.activities.filter((activity) => !activity.archived);
    const ordered = sortByUsage(activities);
    const limited = filters.expanded ? ordered : ordered.slice(0, VISIBLE_ACTIVITIES);

    limited.forEach((activity) => {
      const chip = el(`
        <button class="filter-chip" type="button">
          ${escapeHtml(activity.icon)} ${escapeHtml(activity.name)}
        </button>
      `);
      chip.classList.toggle('is-active', filters.activityIds.has(activity.id));
      chip.addEventListener('click', () => {
        if (filters.activityIds.has(activity.id)) filters.activityIds.delete(activity.id);
        else filters.activityIds.add(activity.id);
        chip.classList.toggle('is-active');
        run();
      });
      activityChips.appendChild(chip);
    });

    if (ordered.length > VISIBLE_ACTIVITIES) {
      const more = el(
        `<button class="filter-chip filter-chip-more" type="button">${filters.expanded ? '收起' : '更多'}</button>`
      );
      more.addEventListener('click', () => {
        filters.expanded = !filters.expanded;
        renderActivityChips();
      });
      activityChips.appendChild(more);
    }
  };

  const run = () => {
    const matched = sortEntries(app.state.entries.filter(matchEntry));
    results.innerHTML = '';
    countNode.textContent = matched.length ? `共 ${matched.length} 条` : '';

    if (!matched.length) {
      results.appendChild(emptyState('没有匹配的记录', '换个关键词，或减少筛选条件'));
      return;
    }

    const shown = matched.slice(0, 100);
    shown.forEach((entry) => results.appendChild(entryCard(entry, { showDate: true })));
    if (matched.length > shown.length) {
      results.appendChild(el(
        `<p class="card-foot">只显示最近 100 条，缩小时间范围可以看更早的记录</p>`
      ));
    }
    hydratePhotos(results);
  };

  renderActivityChips();
  run();

  setTimeout(() => input.focus(), 60);
  return page;
}

function matchEntry(entry) {
  if (filters.moodIds.size && !filters.moodIds.has(entry.moodId)) return false;

  if (filters.activityIds.size) {
    const ids = entry.activityIds || [];
    if (!ids.some((id) => filters.activityIds.has(id))) return false;
  }

  if (filters.range !== 'all') {
    const days = Number(filters.range);
    const from = new Date();
    from.setDate(from.getDate() - days + 1);
    if (entry.date < dateKey(from)) return false;
  }

  if (filters.keyword) {
    const keyword = filters.keyword.toLowerCase();
    const mood = app.state.moods.find((item) => item.id === entry.moodId);
    const activityNames = (entry.activityIds || [])
      .map((id) => activityOf(app.state, id))
      .filter(Boolean)
      .map((activity) => activity.name)
      .join(' ');
    const haystack = `${entry.note || ''} ${activityNames} ${mood ? mood.label : ''}`.toLowerCase();
    if (!haystack.includes(keyword)) return false;
  }

  return true;
}

function sortByUsage(activities) {
  const counter = new Map();
  for (const entry of app.state.entries) {
    for (const id of entry.activityIds || []) {
      counter.set(id, (counter.get(id) || 0) + 1);
    }
  }
  return [...activities].sort((a, b) => {
    const diff = (counter.get(b.id) || 0) - (counter.get(a.id) || 0);
    return diff !== 0 ? diff : a.order - b.order;
  });
}
