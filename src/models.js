export const SCHEMA_VERSION = 1;

export const DEFAULT_MOODS = [
  { id: 'm1', label: '很糟', icon: '😖', color: '#a08cb8', level: 1, order: 0, archived: false },
  { id: 'm2', label: '不好', icon: '😕', color: '#8d9dc0', level: 2, order: 1, archived: false },
  { id: 'm3', label: '一般', icon: '😐', color: '#93a79f', level: 3, order: 2, archived: false },
  { id: 'm4', label: '不错', icon: '🙂', color: '#9dbd8a', level: 4, order: 3, archived: false },
  { id: 'm5', label: '很好', icon: '😄', color: '#e3b96b', level: 5, order: 4, archived: false },
];

export const DEFAULT_ACTIVITIES = [
  { name: '睡得好', icon: '😴', category: '生活' },
  { name: '早起', icon: '🌅', category: '生活' },
  { name: '做饭', icon: '🍳', category: '生活' },
  { name: '家务', icon: '🧹', category: '生活' },
  { name: '购物', icon: '🛍️', category: '生活' },
  { name: '看书', icon: '📖', category: '生活' },
  { name: '追剧', icon: '📺', category: '生活' },
  { name: '游戏', icon: '🎮', category: '生活' },
  { name: '听音乐', icon: '🎵', category: '生活' },
  { name: '上班', icon: '💼', category: '工作' },
  { name: '加班', icon: '🌙', category: '工作' },
  { name: '开会', icon: '🗣️', category: '工作' },
  { name: '通勤', icon: '🚇', category: '工作' },
  { name: '搞定难题', icon: '✅', category: '工作' },
  { name: '运动', icon: '🏃', category: '健康' },
  { name: '散步', icon: '🚶', category: '健康' },
  { name: '健身', icon: '💪', category: '健康' },
  { name: '早睡', icon: '🌛', category: '健康' },
  { name: '生病', icon: '🤒', category: '健康' },
  { name: '见朋友', icon: '👥', category: '社交' },
  { name: '陪家人', icon: '👨‍👩‍👧', category: '社交' },
  { name: '约会', icon: '💗', category: '社交' },
  { name: '聚会', icon: '🎉', category: '社交' },
  { name: '吵架', icon: '💢', category: '情绪' },
  { name: '被夸', icon: '👍', category: '情绪' },
  { name: '焦虑', icon: '😰', category: '情绪' },
  { name: '独处', icon: '🧘', category: '情绪' },
  { name: '花钱', icon: '💰', category: '其他' },
  { name: '天气好', icon: '☀️', category: '其他' },
  { name: '天气差', icon: '🌧️', category: '其他' },
  { name: '旅行', icon: '✈️', category: '其他' },
];

export function createInitialState() {
  return {
    schemaVersion: SCHEMA_VERSION,
    entries: [],
    draft: null,
    moods: DEFAULT_MOODS.map((mood) => ({ ...mood })),
    activities: DEFAULT_ACTIVITIES.map((activity, index) => ({
      id: crypto.randomUUID(),
      name: activity.name,
      icon: activity.icon,
      category: activity.category,
      order: index,
      archived: false,
    })),
    settings: {
      autoLockMinutes: 5,
      theme: 'system',
      weekStart: 1,
      lastBackupAt: null,
      lastBackupEntryCount: 0,
    },
  };
}

/** 兼容旧版本数据，补齐缺失字段 */
export function ensureState(state) {
  const next = state && typeof state === 'object' ? state : createInitialState();
  if (!Array.isArray(next.entries)) next.entries = [];
  if (!('draft' in next)) next.draft = null;
  if (!Array.isArray(next.moods) || next.moods.length === 0) {
    next.moods = DEFAULT_MOODS.map((mood) => ({ ...mood }));
  }
  if (!Array.isArray(next.activities)) next.activities = [];
  next.settings = Object.assign(
    {
      autoLockMinutes: 5,
      theme: 'system',
      weekStart: 1,
      lastBackupAt: null,
      lastBackupEntryCount: 0,
    },
    next.settings || {}
  );
  next.entries.forEach((entry) => {
    if (!Array.isArray(entry.activityIds)) entry.activityIds = [];
    if (!Array.isArray(entry.photoIds)) entry.photoIds = [];
    if (typeof entry.note !== 'string') entry.note = '';
    if (typeof entry.likes !== 'number') entry.likes = 0;
    if (typeof entry.starred !== 'boolean') entry.starred = false;
  });
  next.schemaVersion = SCHEMA_VERSION;
  return next;
}

export function dateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function parseDateKey(key) {
  const [year, month, day] = String(key).split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function addDays(date, amount) {
  const next = new Date(date.getTime());
  next.setDate(next.getDate() + amount);
  return next;
}

export function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

export function formatTime(timestamp) {
  const date = new Date(timestamp);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export function formatDateLabel(key) {
  const date = parseDateKey(key);
  const weekday = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][date.getDay()];
  return `${date.getMonth() + 1}月${date.getDate()}日 ${weekday}`;
}

export function sortEntries(entries) {
  return [...entries].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return b.createdAt - a.createdAt;
  });
}

export function entriesOfDate(entries, key) {
  return sortEntries(entries.filter((entry) => entry.date === key));
}

/** 计算连续记录天数，今天没记但昨天记了，连续天数仍然成立 */
export function calcStreak(entries, today = new Date()) {
  const days = new Set(entries.map((entry) => entry.date));
  let cursor = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (!days.has(dateKey(cursor))) {
    cursor = addDays(cursor, -1);
    if (!days.has(dateKey(cursor))) return 0;
  }
  let streak = 0;
  while (days.has(dateKey(cursor))) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

export function totalDays(entries) {
  return new Set(entries.map((entry) => entry.date)).size;
}

export function moodOf(state, moodId) {
  return state.moods.find((mood) => mood.id === moodId) || state.moods[0];
}

export function activityOf(state, activityId) {
  return state.activities.find((activity) => activity.id === activityId);
}

/** 一组记录的平均心情，映射到最接近的心情颜色 */
export function moodColorForEntries(state, entries) {
  if (!entries || !entries.length) return null;
  const average = entries.reduce(
    (sum, entry) => sum + moodOf(state, entry.moodId).level,
    0
  ) / entries.length;
  let best = null;
  let distance = Infinity;
  for (const mood of state.moods) {
    const diff = Math.abs(mood.level - average);
    if (diff < distance) {
      distance = diff;
      best = mood;
    }
  }
  return best ? best.color : null;
}
