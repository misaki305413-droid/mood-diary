import { app } from '../store.js';
import { activityOf, calcStreak, dateKey, moodOf, totalDays } from '../models.js';
import { el, emptyState, escapeHtml } from '../ui.js';
import { drawBars, drawRing, drawTrend } from '../charts.js';

const RANGES = [
  { days: 7, label: '7 天' },
  { days: 30, label: '30 天' },
  { days: 90, label: '90 天' },
  { days: 365, label: '一年' },
];

let activeRange = 30;

export function renderStats() {
  const entries = app.state.entries;
  const page = el(`
    <div class="page">
      <header class="page-header">
        <div>
          <p class="date-line">统计</p>
          <h1 class="page-title">情绪趋势</h1>
        </div>
      </header>
      <div class="summary-grid"></div>
      <div class="card">
        <div class="card-head">
          <h2 class="card-title">心情走势</h2>
          <div class="range-tabs"></div>
        </div>
        <canvas class="chart chart-trend"></canvas>
        <p class="card-foot">纵轴为心情等级 1–5，空档表示那天没有记录</p>
      </div>
      <div class="card">
        <h2 class="card-title">心情分布</h2>
        <div class="ring-wrap">
          <canvas class="chart chart-ring"></canvas>
          <div class="ring-legend"></div>
        </div>
      </div>
      <div class="card">
        <h2 class="card-title">活动与心情</h2>
        <canvas class="chart chart-bars"></canvas>
        <p class="card-foot" data-role="correlation-foot"></p>
      </div>
      <div class="card">
        <h2 class="card-title">里程碑</h2>
        <div class="milestones"></div>
      </div>
    </div>
  `);

  renderSummary(page.querySelector('.summary-grid'), entries);

  const tabs = page.querySelector('.range-tabs');
  RANGES.forEach((range) => {
    const button = el(`<button class="range-tab" type="button">${range.label}</button>`);
    button.classList.toggle('is-active', range.days === activeRange);
    button.addEventListener('click', () => {
      activeRange = range.days;
      [...tabs.children].forEach((node) => node.classList.remove('is-active'));
      button.classList.add('is-active');
      drawTrendChart(page.querySelector('.chart-trend'));
    });
    tabs.appendChild(button);
  });

  drawTrendChart(page.querySelector('.chart-trend'));
  drawDistribution(page.querySelector('.chart-ring'), page.querySelector('.ring-legend'), entries);
  drawCorrelation(
    page.querySelector('.chart-bars'),
    page.querySelector('[data-role="correlation-foot"]'),
    entries
  );
  renderMilestones(page.querySelector('.milestones'), entries);

  return page;
}

function renderSummary(container, entries) {
  const levels = entries.map((entry) => moodOf(app.state, entry.moodId).level);
  const average = levels.length
    ? (levels.reduce((sum, level) => sum + level, 0) / levels.length).toFixed(1)
    : '—';
  const items = [
    { value: calcStreak(entries), label: '连续天数' },
    { value: entries.length, label: '记录条数' },
    { value: totalDays(entries), label: '记录天数' },
    { value: average, label: '平均心情' },
  ];
  items.forEach((item) => {
    container.appendChild(el(`
      <div class="summary-card">
        <span class="summary-value">${item.value}</span>
        <span class="summary-label">${item.label}</span>
      </div>
    `));
  });
}

function drawTrendChart(canvas) {
  const today = new Date();
  const points = [];
  const map = new Map();
  for (const entry of app.state.entries) {
    const mood = moodOf(app.state, entry.moodId);
    if (!map.has(entry.date)) map.set(entry.date, []);
    map.get(entry.date).push(mood.level);
  }

  const sampleStep = activeRange > 120 ? Math.ceil(activeRange / 60) : 1;
  for (let i = activeRange - 1; i >= 0; i -= 1) {
    const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
    const key = dateKey(date);
    const levels = map.get(key);
    const label = activeRange <= 30
      ? `${date.getMonth() + 1}/${date.getDate()}`
      : `${date.getMonth() + 1}月`;
    points.push({
      label: i % sampleStep === 0 || i === 0 ? label : '',
      value: levels && levels.length
        ? levels.reduce((sum, level) => sum + level, 0) / levels.length
        : null,
    });
  }
  drawTrend(canvas, points);
}

function drawDistribution(canvas, legend, entries) {
  const counts = new Map();
  for (const entry of entries) {
    const moodId = entry.moodId;
    counts.set(moodId, (counts.get(moodId) || 0) + 1);
  }

  const moods = [...app.state.moods].sort((a, b) => a.level - b.level);
  const segments = moods.map((mood) => ({
    value: counts.get(mood.id) || 0,
    color: mood.color,
    label: mood.label,
  }));

  if (entries.length === 0) {
    legend.appendChild(emptyState('还没有足够的数据'));
    return;
  }

  drawRing(canvas, segments);

  const total = entries.length;
  moods.forEach((mood) => {
    const count = counts.get(mood.id) || 0;
    if (!count) return;
    legend.appendChild(el(`
      <div class="legend-row">
        <span class="legend-dot" style="background:${mood.color}"></span>
        <span class="legend-label">${escapeHtml(mood.icon)} ${escapeHtml(mood.label)}</span>
        <span class="legend-value">${count} 次 · ${Math.round((count / total) * 100)}%</span>
      </div>
    `));
  });
}

function drawCorrelation(canvas, foot, entries) {
  if (entries.length < 5) {
    foot.textContent = '至少记录 5 条后，才能看出活动和心情的关系。';
    return;
  }

  const overall = entries.reduce(
    (sum, entry) => sum + moodOf(app.state, entry.moodId).level,
    0
  ) / entries.length;

  const stats = new Map();
  for (const entry of entries) {
    for (const id of entry.activityIds || []) {
      if (!stats.has(id)) stats.set(id, { with: [], without: [] });
      stats.get(id).with.push(moodOf(app.state, entry.moodId).level);
    }
  }

  const items = [];
  for (const [id, data] of stats) {
    if (data.with.length < 5) continue;
    const activity = activityOf(app.state, id);
    if (!activity) continue;
    const withAverage = data.with.reduce((sum, level) => sum + level, 0) / data.with.length;
    items.push({
      label: `${activity.icon} ${activity.name}`,
      value: withAverage,
      delta: withAverage - overall,
      count: data.with.length,
    });
  }

  items.sort((a, b) => b.delta - a.delta);
  const top = items.slice(0, 8);

  if (!top.length) {
    foot.textContent = '单个活动至少出现 5 次，才会显示在这里，避免得出结论过早。';
    return;
  }

  drawBars(canvas, top.map((item) => ({
    label: item.label,
    value: item.value,
    suffix: `${item.delta >= 0 ? '+' : ''}${item.delta.toFixed(1)}`,
  })), { maxValue: 5 });

  foot.textContent = '条形长度是该活动出现时的平均心情，右侧是与整体平均值的差。相关不等于因果，样本量小时尤其要谨慎。';
}

function renderMilestones(container, entries) {
  const days = totalDays(entries);
  const streak = calcStreak(entries);
  const milestones = [
    { label: '首次记录', done: entries.length > 0, hint: '写下第一条' },
    { label: '坚持 7 天', done: streak >= 7 || days >= 7, hint: '连续 7 天' },
    { label: '坚持 30 天', done: streak >= 30 || days >= 30, hint: '连续 30 天' },
    { label: '记录 100 条', done: entries.length >= 100, hint: '累计 100 条' },
    { label: '记录满一年', done: days >= 365, hint: '覆盖 365 天' },
  ];

  milestones.forEach((milestone) => {
    container.appendChild(el(`
      <div class="milestone ${milestone.done ? 'is-done' : ''}">
        <span class="milestone-icon">${milestone.done ? '✦' : '·'}</span>
        <div>
          <p class="milestone-label">${milestone.label}</p>
          <p class="milestone-hint">${milestone.hint}</p>
        </div>
      </div>
    `));
  });
}
