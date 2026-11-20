import { app, go } from '../store.js';
import { moodOf, parseDateKey } from '../models.js';
import { el, emptyState } from '../ui.js';
import { drawBars, drawTrend } from '../charts.js';

const MIN_SAMPLES = 3;
const PERIOD_MIN_SPAN = 60;
const PERIOD_MIN_DAYS = 45;

const WEEKDAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
const DAY_PARTS = [
  { label: '凌晨', from: 0, to: 6 },
  { label: '上午', from: 6, to: 12 },
  { label: '下午', from: 12, to: 18 },
  { label: '晚上', from: 18, to: 24 },
];

export function renderPatterns() {
  const entries = app.state.entries;

  const page = el(`
    <div class="page">
      <header class="page-header">
        <div>
          <p class="date-line">规律</p>
          <h1 class="page-title">情绪节律</h1>
        </div>
        <button class="text-btn" type="button" data-role="back">返回</button>
      </header>

      <div class="card">
        <h2 class="card-title">星期几</h2>
        <canvas class="chart chart-bars weekday-chart"></canvas>
        <p class="card-foot">条形是该天的平均心情等级。少于 ${MIN_SAMPLES} 条的日子不计入，避免一条记录就下结论。</p>
      </div>

      <div class="card">
        <h2 class="card-title">一天里的时段</h2>
        <canvas class="chart chart-bars part-chart"></canvas>
        <p class="card-foot">按记录时间分四段，同样是平均值，不带结论。</p>
      </div>

      <div class="card">
        <h2 class="card-title">每月几号</h2>
        <canvas class="chart chart-trend dom-chart"></canvas>
        <p class="card-foot">横轴是 1–31 号，空白表示那天样本不足。如果某几天长期偏低，可能和工作节奏或生理周期有关。</p>
      </div>

      <div class="card period-card">
        <h2 class="card-title">周期检测</h2>
        <div class="period-body"></div>
      </div>
    </div>
  `);

  page.querySelector('[data-role="back"]').addEventListener('click', () => go('stats'));

  if (!entries.length) {
    page.querySelectorAll('.card').forEach((card) => card.remove());
    page.appendChild(emptyState('还没有数据', '记满几周后再来看'));
    return page;
  }

  drawWeekday(page.querySelector('.weekday-chart'), entries);
  drawDayParts(page.querySelector('.part-chart'), entries);
  drawDayOfMonth(page.querySelector('.dom-chart'), entries);
  renderPeriod(page.querySelector('.period-body'), entries);

  return page;
}

function levelOf(entry) {
  return moodOf(app.state, entry.moodId).level;
}

function average(list) {
  return list.reduce((sum, value) => sum + value, 0) / list.length;
}

function drawWeekday(canvas, entries) {
  const buckets = WEEKDAYS.map(() => []);
  for (const entry of entries) {
    const date = parseDateKey(entry.date);
    const index = (date.getDay() + 6) % 7;
    buckets[index].push(levelOf(entry));
  }

  const items = WEEKDAYS
    .map((label, index) => ({
      label,
      value: buckets[index].length >= MIN_SAMPLES ? average(buckets[index]) : 0,
      count: buckets[index].length,
    }))
    .filter((item) => item.count >= MIN_SAMPLES)
    .map((item) => ({ label: item.label, value: item.value, suffix: item.value.toFixed(1) }));

  if (!items.length) {
    canvas.replaceWith(el(`<p class="card-foot">每个星期几至少要有 ${MIN_SAMPLES} 条记录才能比较。</p>`));
    return;
  }
  drawBars(canvas, items, { maxValue: 5 });
}

function drawDayParts(canvas, entries) {
  const buckets = DAY_PARTS.map(() => []);
  for (const entry of entries) {
    const hour = new Date(entry.createdAt).getHours();
    const index = DAY_PARTS.findIndex((part) => hour >= part.from && hour < part.to);
    if (index >= 0) buckets[index].push(levelOf(entry));
  }

  const items = DAY_PARTS
    .map((part, index) => ({ label: part.label, list: buckets[index] }))
    .filter((item) => item.list.length >= MIN_SAMPLES)
    .map((item) => ({
      label: item.label,
      value: average(item.list),
      suffix: average(item.list).toFixed(1),
    }));

  if (!items.length) {
    canvas.replaceWith(el(`<p class="card-foot">每个时段至少要有 ${MIN_SAMPLES} 条记录才能比较。</p>`));
    return;
  }
  drawBars(canvas, items, { maxValue: 5 });
}

function drawDayOfMonth(canvas, entries) {
  const buckets = Array.from({ length: 31 }, () => []);
  for (const entry of entries) {
    const day = parseDateKey(entry.date).getDate();
    buckets[day - 1].push(levelOf(entry));
  }

  const points = buckets.map((list, index) => ({
    label: String(index + 1),
    value: list.length >= 2 ? average(list) : null,
  }));

  if (points.every((point) => point.value == null)) {
    canvas.replaceWith(el('<p class="card-foot">每个日期至少要有 2 条记录才能画出来。</p>'));
    return;
  }
  drawTrend(canvas, points);
}

function buildDailySeries(entries) {
  const byDate = new Map();
  for (const entry of entries) {
    if (!byDate.has(entry.date)) byDate.set(entry.date, []);
    byDate.get(entry.date).push(levelOf(entry));
  }

  const keys = [...byDate.keys()].sort();
  if (!keys.length) return [];
  const start = parseDateKey(keys[0]);
  const today = new Date();
  const series = [];

  for (let cursor = new Date(start); cursor <= today; cursor.setDate(cursor.getDate() + 1)) {
    const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`;
    const list = byDate.get(key);
    series.push(list ? average(list) : null);
    if (series.length > 800) break;
  }
  return series;
}

function autocorrelation(series, lag) {
  const pairs = [];
  for (let i = 0; i + lag < series.length; i += 1) {
    if (series[i] != null && series[i + lag] != null) {
      pairs.push([series[i], series[i + lag]]);
    }
  }
  if (pairs.length < 20) return null;

  const meanX = average(pairs.map((pair) => pair[0]));
  const meanY = average(pairs.map((pair) => pair[1]));
  let numerator = 0;
  let varianceX = 0;
  let varianceY = 0;

  for (const [x, y] of pairs) {
    numerator += (x - meanX) * (y - meanY);
    varianceX += (x - meanX) ** 2;
    varianceY += (y - meanY) ** 2;
  }
  if (varianceX === 0 || varianceY === 0) return null;
  return numerator / Math.sqrt(varianceX * varianceY);
}

function renderPeriod(container, entries) {
  const series = buildDailySeries(entries);
  const daysWithData = series.filter((value) => value != null).length;
  const span = series.length;

  if (span < PERIOD_MIN_SPAN || daysWithData < PERIOD_MIN_DAYS) {
    const needSpan = Math.max(0, PERIOD_MIN_SPAN - span);
    const needDays = Math.max(0, PERIOD_MIN_DAYS - daysWithData);
    container.appendChild(el(`
      <p class="card-foot">数据还不够，暂时算不出周期。还需要 ${
        needSpan > 0 ? `再积累 ${needSpan} 天` : ''
      }${needSpan > 0 && needDays > 0 ? '、' : ''}${
        needDays > 0 ? `多记 ${needDays} 天` : ''
      }（当前 ${daysWithData} 天有记录，覆盖 ${span} 天）。</p>
    `));
    return;
  }

  const lags = [7, 14, 28, 30];
  const results = lags
    .map((lag) => ({ lag, value: autocorrelation(series, lag) }))
    .filter((item) => item.value != null);

  if (!results.length) {
    container.appendChild(el('<p class="card-foot">数据波动太小或太稀疏，算不出有意义的相关系数。</p>'));
    return;
  }

  const best = results.reduce((a, b) => (Math.abs(a.value) > Math.abs(b.value) ? a : b));
  const strength = Math.abs(best.value);
  const label = best.lag <= 7 ? '周' : best.lag >= 28 ? '月' : `${best.lag} 天`;

  let verdict;
  if (strength >= 0.35) {
    verdict = `看起来存在约 ${label}的节律，相关系数 ${best.value.toFixed(2)}。`;
  } else if (strength >= 0.2) {
    verdict = `有一点 ${label} 节律的迹象，但很弱（${best.value.toFixed(2)}），不足以当作规律。`;
  } else {
    verdict = '目前看不出固定的周或月周期，心情更像是受每天具体的事影响。';
  }

  container.appendChild(el(`<p class="period-verdict">${verdict}</p>`));
  container.appendChild(el(`
    <div class="period-detail">
      ${results.map((item) => `
        <span class="period-chip">
          <span>${item.lag} 天</span>
          <strong>${item.value.toFixed(2)}</strong>
        </span>
      `).join('')}
    </div>
  `));
  container.appendChild(el(`
    <p class="card-foot">样本：${daysWithData} 天有记录，覆盖 ${span} 天。相关系数只是描述同期与滞后期的相似程度，不是因果，也不是诊断。</p>
  `));
}
