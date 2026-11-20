import { app, go } from '../store.js';
import {
  dateKey,
  entriesOfDate,
  moodColorForEntries,
  parseDateKey,
} from '../models.js';
import { el, emptyState } from '../ui.js';
import { entryCard, hydratePhotos } from '../entryCard.js';

const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日'];

export function renderCalendar() {
  const today = new Date();
  if (!app.calendarCursor) {
    app.calendarCursor = {
      year: today.getFullYear(),
      month: today.getMonth(),
      selected: dateKey(today),
    };
  }
  const cursor = app.calendarCursor;

  const page = el(`
    <div class="page">
      <header class="page-header">
        <div>
          <p class="date-line">日历</p>
          <h1 class="page-title">${cursor.year} 年 ${cursor.month + 1} 月</h1>
        </div>
        <div class="month-nav">
          <button class="icon-btn" type="button" data-role="prev" aria-label="上个月">‹</button>
          <button class="icon-btn" type="button" data-role="next" aria-label="下个月">›</button>
        </div>
      </header>
      <div class="weekday-row">
        ${WEEKDAYS.map((day) => `<span>${day}</span>`).join('')}
      </div>
      <div class="calendar-grid"></div>
      <section class="day-panel"></section>
    </div>
  `);

  const grid = page.querySelector('.calendar-grid');
  const panel = page.querySelector('.day-panel');

  const firstDay = new Date(cursor.year, cursor.month, 1);
  const daysInMonth = new Date(cursor.year, cursor.month + 1, 0).getDate();
  const offset = (firstDay.getDay() + 6) % 7;

  const byDate = new Map();
  for (const entry of app.state.entries) {
    if (!byDate.has(entry.date)) byDate.set(entry.date, []);
    byDate.get(entry.date).push(entry);
  }

  for (let i = 0; i < offset; i += 1) {
    grid.appendChild(el('<span class="cal-cell cal-cell-empty"></span>'));
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const key = `${cursor.year}-${String(cursor.month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const dayEntries = byDate.get(key) || [];
    const color = moodColorForEntries(app.state, dayEntries);
    const cell = el(`
      <button class="cal-cell" type="button" data-date="${key}">
        <span class="cal-day">${day}</span>
        <span class="cal-dot" style="${color ? `background:${color}` : 'display:none'}"></span>
      </button>
    `);
    cell.classList.toggle('is-today', key === dateKey(today));
    cell.classList.toggle('is-selected', key === cursor.selected);
    cell.addEventListener('click', () => {
      cursor.selected = key;
      [...grid.querySelectorAll('.cal-cell')].forEach((node) => {
        node.classList.toggle('is-selected', node.dataset.date === key);
      });
      renderPanel(panel, key);
    });
    grid.appendChild(cell);
  }

  page.querySelector('[data-role="prev"]').addEventListener('click', () => {
    const date = new Date(cursor.year, cursor.month - 1, 1);
    cursor.year = date.getFullYear();
    cursor.month = date.getMonth();
    go('calendar');
  });
  page.querySelector('[data-role="next"]').addEventListener('click', () => {
    const date = new Date(cursor.year, cursor.month + 1, 1);
    cursor.year = date.getFullYear();
    cursor.month = date.getMonth();
    go('calendar');
  });

  renderPanel(panel, cursor.selected);
  return page;
}

function renderPanel(panel, key) {
  panel.innerHTML = '';
  const date = parseDateKey(key);
  const label = `${date.getMonth() + 1} 月 ${date.getDate()} 日`;
  const entries = entriesOfDate(app.state.entries, key);

  const header = el(`
    <div class="panel-header">
      <h2 class="panel-title">${label}</h2>
      <button class="text-btn text-btn-strong" type="button" data-role="add">补记</button>
    </div>
  `);
  header.querySelector('[data-role="add"]').addEventListener('click', () => {
    app.editorDate = key;
    go('editor', { editorEntryId: null });
  });
  panel.appendChild(header);

  if (!entries.length) {
    panel.appendChild(emptyState('这天没有记录'));
    return;
  }

  const list = el('<div class="entry-list"></div>');
  entries.forEach((entry) => list.appendChild(entryCard(entry)));
  panel.appendChild(list);
  hydratePhotos(list);
}
