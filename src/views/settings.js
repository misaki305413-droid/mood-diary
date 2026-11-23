import {
  app,
  applyTheme,
  go,
  lock,
  persist,
  updateSettings,
} from '../store.js';
import * as db from '../db.js';
import * as crypto from '../crypto.js';
import { dateKey } from '../models.js';
import {
  buildBackup,
  downloadBlob,
  mergeById,
  mergeEntries,
  readBackup,
  suggestedFileName,
} from '../backup.js';
import {
  choiceDialog,
  confirmDialog,
  el,
  escapeHtml,
  promptDialog,
  toast,
} from '../ui.js';

const AUTO_LOCK_OPTIONS = [
  { value: 0, label: '立即' },
  { value: 1, label: '1 分钟' },
  { value: 5, label: '5 分钟' },
  { value: 30, label: '30 分钟' },
  { value: -1, label: '永不' },
];

export function renderSettings() {
  const settings = app.state.settings;
  const page = el(`
    <div class="page">
      <header class="page-header">
        <div>
          <p class="date-line">设置</p>
          <h1 class="page-title">偏好与数据</h1>
        </div>
      </header>

      <section class="card">
        <h2 class="card-title">安全</h2>
        <div class="setting-row">
          <div>
            <p class="setting-label">自动锁定</p>
            <p class="setting-hint">离开应用多久后需要重新输入密码</p>
          </div>
          <select class="select" data-role="autolock">
            ${AUTO_LOCK_OPTIONS.map((option) => `
              <option value="${option.value}" ${settings.autoLockMinutes === option.value ? 'selected' : ''}>
                ${option.label}
              </option>
            `).join('')}
          </select>
        </div>
        <button class="setting-row setting-row-button" type="button" data-role="change-pin">
          <div>
            <p class="setting-label">修改密码</p>
            <p class="setting-hint">换成只有你知道的 6 位数字</p>
          </div>
          <span class="setting-chevron">›</span>
        </button>
        <button class="setting-row setting-row-button" type="button" data-role="recovery">
          <div>
            <p class="setting-label">重新生成恢复码</p>
            <p class="setting-hint">确认保存新码后，旧码才会失效</p>
          </div>
          <span class="setting-chevron">›</span>
        </button>
        <button class="setting-row setting-row-button" type="button" data-role="lock">
          <div>
            <p class="setting-label">立即锁定</p>
            <p class="setting-hint">清除内存中的解密数据</p>
          </div>
          <span class="setting-chevron">›</span>
        </button>
      </section>

      <section class="card">
        <h2 class="card-title">备份与恢复</h2>
        <div class="setting-row">
          <div>
            <p class="setting-label">上次备份</p>
            <p class="setting-hint" data-role="backup-time"></p>
          </div>
        </div>
        <button class="btn btn-primary btn-block" type="button" data-role="export">导出加密备份</button>
        <button class="btn btn-block" type="button" data-role="import">从备份恢复</button>
        <button class="btn btn-block" type="button" data-role="export-csv">导出 CSV（明文）</button>
        <p class="card-foot">备份文件用密码加密，只有你能打开。建议存到自己的网盘或电脑上。</p>
        <input class="import-input" type="file" accept=".zip,application/zip" hidden>
      </section>

      <section class="card">
        <div class="card-head">
          <h2 class="card-title">活动标签</h2>
          <button class="text-btn text-btn-strong" type="button" data-role="add-activity">新增</button>
        </div>
        <div class="activity-manage"></div>
        <p class="card-foot">「停用」只是从选择列表隐藏，历史记录里仍保留标签；「彻底删除」会把所有记录里的这个标签一起移除。</p>
      </section>

      <section class="card">
        <h2 class="card-title">外观</h2>
        <div class="segmented">
          ${[['system', '跟随系统'], ['light', '浅色'], ['dark', '深色']].map(([value, label]) => `
            <button class="segment ${settings.theme === value ? 'is-active' : ''}" type="button" data-theme-value="${value}">
              ${label}
            </button>
          `).join('')}
        </div>
      </section>

      <section class="card">
        <h2 class="card-title">关于</h2>
        <div class="setting-row">
          <p class="setting-label">版本</p>
          <p class="setting-hint">1.0.0</p>
        </div>
        <div class="setting-row">
          <p class="setting-label">本机占用</p>
          <p class="setting-hint" data-role="usage">计算中…</p>
        </div>
        <p class="card-foot">所有内容经 AES-GCM 加密后存放在本机，不上传任何服务器。</p>
        <button class="setting-row setting-row-button" type="button" data-role="demo-add">
          <div>
            <p class="setting-label">填充 10 天演示数据</p>
            <p class="setting-hint">用来看图表的实际效果，之后可以一键删除</p>
          </div>
          <span class="setting-chevron">›</span>
        </button>
        <button class="setting-row setting-row-button" type="button" data-role="demo-clear" hidden>
          <div>
            <p class="setting-label">删除演示数据</p>
            <p class="setting-hint">只删除带演示标记的记录，真实记录不动</p>
          </div>
          <span class="setting-chevron">›</span>
        </button>
        <button class="danger-link" type="button" data-role="wipe">清空所有数据</button>
      </section>
    </div>
  `);

  const backupTime = page.querySelector('[data-role="backup-time"]');
  backupTime.textContent = describeBackupTime(settings.lastBackupAt);

  page.querySelector('[data-role="autolock"]').addEventListener('change', (event) => {
    updateSettings({ autoLockMinutes: Number(event.target.value) });
    toast('已更新自动锁定');
  });

  page.querySelector('[data-role="lock"]').addEventListener('click', () => lock());

  page.querySelector('[data-role="change-pin"]').addEventListener('click', changePin);

  page.querySelector('[data-role="recovery"]').addEventListener('click', regenerateRecoveryCode);

  page.querySelector('[data-role="export"]').addEventListener('click', async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    try {
      const password = await promptDialog('导出备份', {
        label: '设置备份密码。留空则使用当前 PIN。',
        placeholder: '留空使用当前 PIN',
        type: 'password',
      });
      if (password === null) return;
      const finalPassword = password || app.pin;
      if (!finalPassword) {
        toast('未设置密码，无法导出');
        return;
      }
      toast('正在打包…');
      const { blob } = await buildBackup({
        state: app.state,
        dek: app.dek,
        password: finalPassword,
      });
      downloadBlob(blob, suggestedFileName());
      updateSettings({
        lastBackupAt: Date.now(),
        lastBackupEntryCount: app.state.entries.length,
      });
      await persist();
      backupTime.textContent = describeBackupTime(Date.now());
      toast('备份已导出');
    } catch (error) {
      toast(error.message || '导出失败');
    } finally {
      button.disabled = false;
    }
  });

  const importInput = page.querySelector('.import-input');
  page.querySelector('[data-role="import"]').addEventListener('click', () => importInput.click());
  importInput.addEventListener('change', async () => {
    const file = importInput.files[0];
    importInput.value = '';
    if (!file) return;

    const password = await promptDialog('恢复备份', {
      label: '输入这份备份的密码',
      placeholder: '留空则使用当前 PIN',
      type: 'password',
    });
    if (password === null) return;
    const finalPassword = password || app.pin;
    if (!finalPassword) {
      toast('请输入备份密码');
      return;
    }

    try {
      toast('正在读取备份…');
      const buffer = await file.arrayBuffer();
      const { state: incoming } = await readBackup(buffer, finalPassword, { dek: app.dek });

      const shouldMerge = await confirmDialog(
        '如何合并数据？',
        `备份包含 ${incoming.entries.length} 条记录。选择「合并」会保留现有内容，选择「替换」会清空当前所有记录。`,
        { confirmText: '合并', danger: false }
      );

      if (shouldMerge) {
        app.state.entries = mergeEntries(app.state.entries, incoming.entries);
        app.state.activities = mergeById(app.state.activities, incoming.activities);
        app.state.moods = mergeById(app.state.moods, incoming.moods);
      } else {
        const sure = await confirmDialog(
          '确认替换？',
          '当前所有记录都会被备份内容覆盖，且无法撤销。',
          { confirmText: '替换', danger: true }
        );
        if (!sure) return;
        app.state.entries = incoming.entries;
        app.state.activities = incoming.activities;
        app.state.moods = incoming.moods;
        await prunePhotos();
      }

      await persist();
      toast('数据已恢复');
      go('today');
    } catch (error) {
      toast(error.message || '恢复失败');
    }
  });

  page.querySelector('[data-role="export-csv"]').addEventListener('click', async () => {
    const ok = await confirmDialog(
      '导出 CSV？',
      'CSV 是明文表格，任何人拿到都能直接读，也不含照片和视频。适合自己分析或迁移数据。',
      { confirmText: '导出' }
    );
    if (!ok) return;
    try {
      const csv = buildCsv(app.state);
      const stamp = new Date().toISOString().slice(0, 10);
      downloadBlob(
        new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' }),
        `mood-diary-${stamp}.csv`
      );
      toast('CSV 已导出');
    } catch (error) {
      toast(error.message || '导出失败');
    }
  });

  page.querySelector('[data-role="add-activity"]').addEventListener('click', async () => {
    const name = await promptDialog('新增活动', {
      label: '给这个活动起个名字',
      placeholder: '例如：遛狗',
      maxLength: 12,
    });
    if (!name) return;
    app.state.activities.push({
      id: crypto.randomUUID ? crypto.randomUUID() : `a-${Date.now()}`,
      name,
      icon: '🏷️',
      category: '自定义',
      order: app.state.activities.length,
      archived: false,
    });
    await persist();
    go('settings');
  });

  const manageList = page.querySelector('.activity-manage');
  app.state.activities
    .filter((activity) => !activity.archived)
    .sort((a, b) => a.order - b.order)
    .forEach((activity) => {
      const row = el(`
        <div class="manage-row">
          <span class="manage-name">${escapeHtml(activity.icon)} ${escapeHtml(activity.name)}</span>
          <div class="manage-actions">
            <button class="mini-btn" type="button" data-role="rename">改名</button>
            <button class="mini-btn mini-btn-danger" type="button" data-role="remove">删除</button>
          </div>
        </div>
      `);
      row.querySelector('[data-role="rename"]').addEventListener('click', async () => {
        const name = await promptDialog('修改名称', { value: activity.name, maxLength: 12 });
        if (!name) return;
        activity.name = name;
        await persist();
        go('settings');
      });
      row.querySelector('[data-role="remove"]').addEventListener('click', async () => {
        const choice = await choiceDialog(
          `处理「${activity.name}」`,
          '停用只是不再出现在选择列表，历史记录里仍然保留这个标签。彻底删除会把它从所有已有记录里一并移除，无法恢复。',
          [
            { label: '停用（保留历史记录）', value: 'archive' },
            { label: '彻底删除（从所有记录中移除）', value: 'delete', danger: true },
          ]
        );
        if (!choice) return;
        if (choice === 'archive') {
          activity.archived = true;
        } else {
          app.state.activities = app.state.activities.filter((item) => item.id !== activity.id);
          for (const entry of app.state.entries) {
            entry.activityIds = (entry.activityIds || []).filter((id) => id !== activity.id);
          }
        }
        await persist();
        go('settings');
      });
      manageList.appendChild(row);
    });

  page.querySelectorAll('[data-theme-value]').forEach((button) => {
    button.addEventListener('click', () => {
      const theme = button.dataset.themeValue;
      updateSettings({ theme });
      applyTheme(theme);
      page.querySelectorAll('[data-theme-value]').forEach((node) => {
        node.classList.toggle('is-active', node === button);
      });
    });
  });

  const demoClear = page.querySelector('[data-role="demo-clear"]');
  demoClear.hidden = !app.state.entries.some((entry) => entry.demo);
  demoClear.addEventListener('click', async () => {
    const ok = await confirmDialog(
      '删除演示数据？',
      '只删除标记为演示的记录，你的真实记录不受影响。',
      { confirmText: '删除', danger: true }
    );
    if (!ok) return;
    app.state.entries = app.state.entries.filter((entry) => !entry.demo);
    await persist();
    toast('演示数据已清除');
    go('settings');
  });

  page.querySelector('[data-role="demo-add"]').addEventListener('click', async () => {
    const ok = await confirmDialog(
      '填充 10 天演示数据？',
      '会写入最近 10 天、每天 1–2 条的假记录，用来看首页时间线、像素图和统计的实际效果。之后可以在本页一键删除。',
      { confirmText: '填充' }
    );
    if (!ok) return;
    app.state.entries.push(...buildDemoEntries());
    await persist();
    toast('演示数据已写入');
    go('today');
  });

  page.querySelector('[data-role="wipe"]').addEventListener('click', async () => {
    const first = await confirmDialog(
      '清空所有数据？',
      '所有记录、照片和设置都会被永久删除。请确认已经导出备份。',
      { confirmText: '继续', danger: true }
    );
    if (!first) return;
    const second = await confirmDialog('最后确认', '此操作不可撤销。', {
      confirmText: '永久删除',
      danger: true,
    });
    if (!second) return;
    await db.clearAll();
    location.reload();
  });

  db.estimateUsage().then((usage) => {
    const node = page.querySelector('[data-role="usage"]');
    if (!node) return;
    node.textContent = usage
      ? `${formatBytes(usage.usage)} / 可用 ${formatBytes(usage.quota)}`
      : '无法获取';
  });

  return page;
}

function describeBackupTime(timestamp) {
  if (!timestamp) return '还没有备份过';
  const days = Math.floor((Date.now() - timestamp) / 86400000);
  if (days <= 0) return '今天';
  return `${days} 天前`;
}

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(value >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
}

async function unwrapDekWithPin(pin) {
  const meta = await db.get('meta', 'kdf');
  if (!meta) throw new Error('数据不存在');
  const kek = await crypto.deriveKek(pin, new Uint8Array(meta.salt), meta.iterations);
  const raw = await crypto.decryptBytes(kek, meta.dekByPin.iv, meta.dekByPin.cipher);
  return { meta, raw };
}

async function changePin() {
  const current = await promptDialog('修改密码', {
    label: '输入当前密码',
    type: 'password',
    maxLength: 6,
  });
  if (!current) return;

  let unlocked;
  try {
    unlocked = await unwrapDekWithPin(current);
  } catch {
    toast('当前密码不正确');
    return;
  }

  const next = await promptDialog('设置新密码', {
    label: '输入 6 位数字密码',
    type: 'password',
    maxLength: 6,
    minLength: 6,
  });
  if (!next) return;
  if (!/^\d{6}$/.test(next)) {
    toast('密码必须是 6 位数字');
    return;
  }

  try {
    const salt = crypto.randomBytes(16);
    const kek = await crypto.deriveKek(next, salt);
    await db.put('meta', 'kdf', {
      ...unlocked.meta,
      salt,
      dekByPin: await crypto.encryptBytes(kek, unlocked.raw),
    });
    app.pin = next;
    toast('密码已修改');
  } catch (error) {
    toast(error.message || '修改失败');
  }
}

async function regenerateRecoveryCode() {
  const pin = await promptDialog('验证身份', {
    label: '输入当前密码',
    type: 'password',
    maxLength: 6,
  });
  if (!pin) return;

  let unlocked;
  try {
    unlocked = await unwrapDekWithPin(pin);
  } catch {
    toast('密码不正确');
    return;
  }

  const recovery = crypto.generateRecoveryCode();
  const recoverySalt = crypto.randomBytes(16);
  const recoveryKek = await crypto.deriveKek(
    crypto.normalizeRecoveryCode(recovery.text),
    recoverySalt
  );
  const dekByRecovery = await crypto.encryptBytes(recoveryKek, unlocked.raw);

  const confirmed = await promptDialog('新的恢复码', {
    label: `请立即抄写保存：\n\n${recovery.text}\n\n在你点「我已保存」之前，旧恢复码仍然有效。`,
    value: recovery.text,
    confirmText: '我已保存',
    maxLength: 64,
  });

  if (confirmed === null) {
    toast('已取消，原恢复码仍然有效');
    return;
  }

  try {
    await db.put('meta', 'kdf', { ...unlocked.meta, recoverySalt, dekByRecovery });
    toast('恢复码已更新');
  } catch (error) {
    toast(error.message || '生成失败');
  }
}

/** 生成 10 天演示记录，全部带 demo 标记，可一键清除 */
function buildDemoEntries() {
  const notes = [
    '普通的一天',
    '工作有点累',
    '和朋友吃了顿饭',
    '看了部电影',
    '早睡了一次',
    '有点焦虑，说不清原因',
    '散步半小时',
    '天气很好，心情也跟着好',
    '加班到很晚',
    '什么都没做，休息',
  ];
  const moodIds = ['m1', 'm2', 'm3', 'm4', 'm5'];
  const activityIds = app.state.activities
    .filter((activity) => !activity.archived)
    .map((activity) => activity.id);

  const entries = [];
  const today = new Date();

  for (let offset = 9; offset >= 0; offset -= 1) {
    const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() - offset);
    const key = dateKey(date);
    const count = offset % 3 === 0 ? 2 : 1;

    for (let index = 0; index < count; index += 1) {
      const hour = index === 0
        ? 8 + Math.floor(Math.random() * 4)
        : 18 + Math.floor(Math.random() * 5);
      const createdAt = new Date(
        date.getFullYear(),
        date.getMonth(),
        date.getDate(),
        hour,
        Math.floor(Math.random() * 60)
      ).getTime();

      const picks = [];
      const pickCount = 1 + Math.floor(Math.random() * 3);
      for (let k = 0; k < pickCount; k += 1) {
        if (!activityIds.length) break;
        const id = activityIds[Math.floor(Math.random() * activityIds.length)];
        if (!picks.includes(id)) picks.push(id);
      }

      entries.push({
        id: globalThis.crypto?.randomUUID
          ? globalThis.crypto.randomUUID()
          : `demo-${offset}-${index}`,
        date: key,
        createdAt,
        updatedAt: Date.now(),
        moodId: moodIds[Math.floor(Math.random() * moodIds.length)],
        activityIds: picks,
        note: notes[Math.floor(Math.random() * notes.length)],
        photoIds: [],
        starred: Math.random() < 0.2,
        likes: Math.random() < 0.3 ? 1 + Math.floor(Math.random() * 3) : 0,
        demo: true,
      });
    }
  }

  return entries;
}

function csvCell(value) {
  const text = String(value == null ? '' : value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** 明文 CSV，方便在 Excel 里自己算或迁移，不含照片和视频 */
function buildCsv(state) {
  const rows = [['日期', '时间', '心情', '等级', '活动', '文字', '照片数', '点赞', '收藏']];
  const entries = [...state.entries].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    return a.createdAt - b.createdAt;
  });

  for (const entry of entries) {
    const mood = state.moods.find((item) => item.id === entry.moodId);
    const activities = (entry.activityIds || [])
      .map((id) => state.activities.find((item) => item.id === id))
      .filter(Boolean)
      .map((item) => item.name)
      .join(' / ');
    const date = new Date(entry.createdAt);
    const time = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;

    rows.push([
      entry.date,
      time,
      mood ? mood.label : '',
      mood ? mood.level : '',
      activities,
      (entry.note || '').replace(/\r?\n/g, ' '),
      (entry.photoIds || []).length,
      entry.likes || 0,
      entry.starred ? '是' : '否',
    ]);
  }

  return rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
}

async function prunePhotos() {
  const referenced = new Set(app.state.entries.flatMap((entry) => entry.photoIds || []));
  const stored = await db.keys('photos');
  for (const id of stored) {
    if (!referenced.has(id)) await db.remove('photos', id);
  }
}
