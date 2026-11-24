import { app, applyTheme, go, lock, onChange, persist } from './store.js';
import { buildDemoEntries } from './demo.js';
import { el } from './ui.js';
import { detachLock, renderLock } from './views/lock.js';
import { renderToday } from './views/today.js';
import { renderEditor } from './views/editor.js';
import { renderCalendar } from './views/calendar.js';
import { renderStats } from './views/stats.js';
import { renderSettings } from './views/settings.js';
import { renderSearch } from './views/search.js';
import { renderPixels } from './views/pixels.js';
import { renderKeepsake } from './views/keepsake.js';
import { renderPatterns } from './views/patterns.js';
import { renderReview } from './views/review.js';

const TABS = [
  { id: 'today', label: '今日', icon: '<circle cx="12" cy="12" r="8.5"/><path d="M8.8 14.2c.8 1.1 1.9 1.7 3.2 1.7s2.4-.6 3.2-1.7M9.4 9.8h.01M14.6 9.8h.01"/>' },
  { id: 'calendar', label: '日历', icon: '<rect x="3.5" y="5" width="17" height="15" rx="3"/><path d="M8 3v4M16 3v4M3.5 10h17"/>' },
  { id: 'stats', label: '统计', icon: '<path d="M5.5 19v-6M12 19V6M18.5 19v-9"/>' },
  { id: 'settings', label: '设置', icon: '<path d="M4 7.5h8M16 7.5h4M4 16.5h4M12 16.5h8"/><circle cx="14" cy="7.5" r="2"/><circle cx="10" cy="16.5" r="2"/>' },
];

const VIEWS = {
  today: renderToday,
  calendar: renderCalendar,
  stats: renderStats,
  settings: renderSettings,
  search: renderSearch,
  pixels: renderPixels,
  keepsake: renderKeepsake,
  patterns: renderPatterns,
  review: renderReview,
};

let scrollMemory = 0;

function render() {
  const root = document.getElementById('app');
  if (!root) return;

  if (app.locked || !app.state) {
    root.innerHTML = '';
    renderLock(root);
    return;
  }

  detachLock();

  const isEditor = app.route === 'editor';
  if (!isEditor) scrollMemory = window.scrollY;

  root.innerHTML = '';

  if (isEditor) {
    root.appendChild(renderEditor());
    window.scrollTo(0, 0);
    return;
  }

  const shell = el('<div class="app-shell"></div>');
  const main = el('<main class="screen"></main>');
  const renderView = VIEWS[app.route] || renderToday;
  main.appendChild(renderView());
  shell.appendChild(main);

  const showFab = app.route === 'today' || app.route === 'calendar';
  if (showFab) {
    const fab = el('<button class="fab" type="button" aria-label="记录心情">+</button>');
    fab.addEventListener('click', () => {
      app.editorDate = null;
      go('editor', { editorEntryId: null });
    });
    shell.appendChild(fab);
  }

  shell.appendChild(buildTabBar());
  root.appendChild(shell);
  requestAnimationFrame(() => window.scrollTo(0, scrollMemory));
}

function buildTabBar() {
  const nav = el('<nav class="tabbar"></nav>');
  TABS.forEach((tab) => {
    const button = el(`
      <button class="tab ${app.route === tab.id ? 'is-active' : ''}" type="button" data-tab="${tab.id}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
          stroke-linecap="round" stroke-linejoin="round">${tab.icon}</svg>
        <span>${tab.label}</span>
      </button>
    `);
    button.addEventListener('click', () => {
      if (app.route === tab.id) {
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
      go(tab.id);
    });
    nav.appendChild(button);
  });
  return nav;
}

function setupAutoLock() {
  document.addEventListener('visibilitychange', () => {
    if (app.locked) return;
    const minutes = app.state?.settings.autoLockMinutes;
    if (minutes === -1) return;

    if (document.visibilityState === 'hidden') {
      app.hiddenAt = Date.now();
      if (minutes === 0) lock();
      return;
    }

    if (document.visibilityState === 'visible' && app.hiddenAt) {
      const elapsed = Date.now() - app.hiddenAt;
      if (elapsed >= minutes * 60000) lock();
      app.hiddenAt = 0;
    }
  });

  window.addEventListener('pagehide', () => {
    const minutes = app.state?.settings.autoLockMinutes;
    if (minutes === 0 && !app.locked) lock();
  });
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
    return;
  }

  const hadController = Boolean(navigator.serviceWorker.controller);
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing || !hadController) return;
    refreshing = true;
    window.location.reload();
  });

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then((registration) => registration.update())
      .catch(() => {});
  });
}

function boot() {
  applyTheme(app.theme);

  /** 打开 ?demo=N 时，解锁后自动写入 N 天演示数据 */
  let pendingDemo = Number(new URLSearchParams(location.search).get('demo')) || 0;
  if (pendingDemo > 0) {
    history.replaceState(null, '', location.pathname);
    onChange(() => {
      if (!pendingDemo || !app.state) return;
      const days = pendingDemo;
      pendingDemo = 0;
      app.state.entries.push(...buildDemoEntries(app.state, days));
      persist();
    });
  }

  onChange(render);
  setupAutoLock();
  registerServiceWorker();
  render();
}

boot();
