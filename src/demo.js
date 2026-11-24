import { dateKey } from './models.js';

/**
 * 生成演示记录，全部带 demo 标记，可一键清除。
 * days 为包含今天在内的天数。
 */
export function buildDemoEntries(state, days = 10) {
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
  const activityIds = state.activities
    .filter((activity) => !activity.archived)
    .map((activity) => activity.id);

  const entries = [];
  const today = new Date();
  const span = Math.max(1, Math.min(Number(days) || 10, 60));

  for (let offset = span - 1; offset >= 0; offset -= 1) {
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
          : `demo-${offset}-${index}-${Date.now()}`,
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
