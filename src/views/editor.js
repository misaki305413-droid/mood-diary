import {
  app,
  deletePhoto,
  getPhotoURL,
  go,
  persist,
  savePhoto,
} from '../store.js';
import {
  dateKey,
  formatDateLabel,
} from '../models.js';
import { confirmDialog, el, escapeHtml, promptDialog, toast } from '../ui.js';

export function renderEditor() {
  const entryId = app.editorEntryId;
  const existing = entryId
    ? app.state.entries.find((entry) => entry.id === entryId)
    : null;

  const draftDate = existing ? existing.date : (app.editorDate || dateKey());
  const saved = app.state.draft;
  const restorable = saved
    && saved.date === draftDate
    && (saved.entryId || null) === (entryId || null);

  const draft = {
    id: existing ? existing.id : (crypto.randomUUID ? crypto.randomUUID() : `e-${Date.now()}`),
    date: draftDate,
    createdAt: existing ? existing.createdAt : Date.now(),
    updatedAt: Date.now(),
    moodId: restorable ? (saved.moodId || '') : (existing ? existing.moodId : ''),
    activityIds: new Set(restorable ? saved.activityIds : (existing ? existing.activityIds : [])),
    note: restorable ? (saved.note || '') : (existing ? existing.note : ''),
    photoIds: restorable ? [...(saved.photoIds || [])] : (existing ? [...existing.photoIds] : []),
    starred: restorable ? Boolean(saved.starred) : Boolean(existing && existing.starred),
  };

  const addedPhotoIds = new Set();
  const removedPhotoIds = new Set();

  let draftTimer = null;
  /** 把草稿写进加密保险库，锁屏或切后台后不会丢 */
  const queueDraft = () => {
    clearTimeout(draftTimer);
    draftTimer = setTimeout(() => {
      app.state.draft = {
        entryId: existing ? existing.id : null,
        date: draft.date,
        moodId: draft.moodId,
        activityIds: [...draft.activityIds],
        note: draft.note,
        photoIds: [...draft.photoIds],
        starred: draft.starred,
      };
      persist();
    }, 300);
  };

  const clearDraft = () => {
    clearTimeout(draftTimer);
    draftTimer = null;
    app.state.draft = null;
  };

  const root = el(`
    <div class="editor">
      <header class="editor-header">
        <button class="text-btn" type="button" data-role="cancel">取消</button>
        <button class="editor-date" type="button" data-role="date">
          <span class="editor-date-text">${escapeHtml(formatDateLabel(draft.date))}</span>
          <span class="editor-date-caret">▾</span>
        </button>
        <button class="text-btn text-btn-strong" type="button" data-role="save" disabled>保存</button>
      </header>
      <input class="date-input" type="date" value="${draft.date}" max="${dateKey()}">
      <div class="editor-body">
        <section class="field">
          <h2 class="field-label">此刻心情</h2>
          <div class="mood-row"></div>
        </section>
        <section class="field">
          <h2 class="field-label">做了什么</h2>
          <div class="chip-grid"></div>
          <button class="ghost-chip" type="button" data-role="add-activity">+ 新活动</button>
        </section>
        <section class="field">
          <h2 class="field-label">想写点什么</h2>
          <textarea class="note-input" rows="5" placeholder="可以留空"></textarea>
        </section>
        <section class="field">
          <h2 class="field-label">照片</h2>
          <div class="photo-grid">
            <button class="photo-add" type="button" aria-label="添加照片">+</button>
          </div>
          <input class="photo-input" type="file" accept="image/*" multiple hidden>
        </section>
        ${existing ? '<button class="danger-link" type="button" data-role="delete">删除这条记录</button>' : ''}
        <button class="star-toggle" type="button" data-role="star">☆ 收藏这一天</button>
        <p class="editor-hint">内容会用你的密码加密后保存在本机</p>
      </div>
    </div>
  `);

  const saveButton = root.querySelector('[data-role="save"]');
  const dateButton = root.querySelector('[data-role="date"]');
  const dateInput = root.querySelector('.date-input');
  const dateText = root.querySelector('.editor-date-text');
  const moodRow = root.querySelector('.mood-row');
  const chipGrid = root.querySelector('.chip-grid');
  const noteInput = root.querySelector('.note-input');
  const photoGrid = root.querySelector('.photo-grid');
  const photoInput = root.querySelector('.photo-input');

  const refreshSaveState = () => {
    saveButton.disabled = !draft.moodId;
    saveButton.classList.toggle('is-disabled', !draft.moodId);
  };

  dateButton.addEventListener('click', () => {
    if (typeof dateInput.showPicker === 'function') {
      try {
        dateInput.showPicker();
        return;
      } catch {
        // 某些浏览器要求用户手势才允许，回退到普通点击
      }
    }
    dateInput.click();
  });

  dateInput.addEventListener('change', () => {
    if (!dateInput.value) return;
    draft.date = dateInput.value;
    dateText.textContent = formatDateLabel(draft.date);
    queueDraft();
  });

  const starButton = root.querySelector('[data-role="star"]');
  const refreshStar = () => {
    starButton.classList.toggle('is-on', draft.starred);
    starButton.textContent = draft.starred ? '★ 已收藏' : '☆ 收藏这一天';
  };
  refreshStar();
  starButton.addEventListener('click', () => {
    draft.starred = !draft.starred;
    refreshStar();
    queueDraft();
  });

  const moods = app.state.moods
    .filter((mood) => !mood.archived)
    .sort((a, b) => a.level - b.level);

  moods.forEach((mood) => {
    const button = el(`
      <button class="mood-button" type="button" style="--mood-color:${escapeHtml(mood.color)}">
        <span class="mood-icon">${escapeHtml(mood.icon)}</span>
        <span class="mood-label">${escapeHtml(mood.label)}</span>
      </button>
    `);
    button.classList.toggle('is-active', draft.moodId === mood.id);
    button.addEventListener('click', () => {
      draft.moodId = mood.id;
      [...moodRow.children].forEach((child) => child.classList.remove('is-active'));
      button.classList.add('is-active');
      refreshSaveState();
      queueDraft();
    });
    moodRow.appendChild(button);
  });

  const sortedActivities = sortActivitiesByUsage(app.state);
  sortedActivities.forEach((activity) => {
    chipGrid.appendChild(activityChip(
      activity,
      draft.activityIds,
      queueDraft,
      activity.category === '自定义'
        ? (chip) => deleteCustomActivity(activity, chip)
        : null
    ));
  });

  /** 自定义活动可以在编辑器里长按删除，不用绕到设置页 */
  async function deleteCustomActivity(activity, chipNode) {
    const ok = await confirmDialog(
      `删除「${activity.name}」？`,
      '它会从活动列表和所有已有记录中移除，无法恢复。',
      { confirmText: '删除', danger: true }
    );
    if (!ok) return;
    app.state.activities = app.state.activities.filter((item) => item.id !== activity.id);
    for (const entry of app.state.entries) {
      entry.activityIds = (entry.activityIds || []).filter((id) => id !== activity.id);
    }
    draft.activityIds.delete(activity.id);
    await persist();
    chipNode.remove();
  }

  noteInput.value = draft.note;
  noteInput.addEventListener('input', () => {
    draft.note = noteInput.value;
    queueDraft();
  });

  const renderPhotos = async () => {
    [...photoGrid.querySelectorAll('img')].forEach((node) => node.remove());
    [...photoGrid.querySelectorAll('.photo-item')].forEach((node) => node.remove());
    const addButton = photoGrid.querySelector('.photo-add');
    for (const id of draft.photoIds) {
      const url = await getPhotoURL(id);
      const item = el(`
        <div class="photo-item">
          <img alt="" ${url ? `src="${url}"` : ''}>
          <button class="photo-remove" type="button" aria-label="移除照片">×</button>
        </div>
      `);
      item.querySelector('.photo-remove').addEventListener('click', () => {
        draft.photoIds = draft.photoIds.filter((photoId) => photoId !== id);
        if (addedPhotoIds.has(id)) {
          addedPhotoIds.delete(id);
          deletePhoto(id);
        } else {
          removedPhotoIds.add(id);
        }
        item.remove();
        queueDraft();
      });
      photoGrid.insertBefore(item, addButton);
    }
  };

  renderPhotos();

  photoGrid.querySelector('.photo-add').addEventListener('click', () => photoInput.click());
  photoInput.addEventListener('change', async () => {
    const files = [...photoInput.files];
    photoInput.value = '';
    for (const file of files) {
      try {
        const { id } = await savePhoto(file);
        addedPhotoIds.add(id);
        draft.photoIds.push(id);
        await renderPhotos();
        queueDraft();
      } catch (error) {
        toast(error.message || '照片添加失败');
      }
    }
  });

  root.querySelector('[data-role="add-activity"]').addEventListener('click', async () => {
    const name = await promptDialog('新活动', {
      label: '给这个活动起个名字',
      placeholder: '例如：遛狗',
      maxLength: 12,
    });
    if (!name) return;
    const activity = {
      id: crypto.randomUUID ? crypto.randomUUID() : `a-${Date.now()}`,
      name,
      icon: '🏷️',
      category: '自定义',
      order: app.state.activities.length,
      archived: false,
    };
    app.state.activities.push(activity);
    await persist();
    const chip = activityChip(
      activity,
      draft.activityIds,
      queueDraft,
      (node) => deleteCustomActivity(activity, node)
    );
    chipGrid.appendChild(chip);
    chip.click();
    toast('已添加，长按标签可以删除');
  });

  root.querySelector('[data-role="cancel"]').addEventListener('click', async () => {
    clearDraft();
    const referenced = new Set(app.state.entries.flatMap((entry) => entry.photoIds || []));
    for (const id of draft.photoIds) {
      if (!referenced.has(id)) await deletePhoto(id);
    }
    await persist();
    go('today');
  });

  saveButton.addEventListener('click', async () => {
    if (!draft.moodId) {
      toast('先选一个心情');
      return;
    }
    saveButton.disabled = true;
    clearDraft();
    const record = {
      id: draft.id,
      date: draft.date,
      createdAt: draft.createdAt,
      updatedAt: Date.now(),
      moodId: draft.moodId,
      activityIds: [...draft.activityIds],
      note: draft.note.trim(),
      photoIds: draft.photoIds,
      starred: draft.starred,
      likes: existing ? (existing.likes || 0) : 0,
    };

    const index = app.state.entries.findIndex((entry) => entry.id === record.id);
    if (index >= 0) app.state.entries[index] = record;
    else app.state.entries.push(record);

    for (const id of removedPhotoIds) await deletePhoto(id);
    await persist();
    go('today');
  });

  const deleteButton = root.querySelector('[data-role="delete"]');
  if (deleteButton) {
    deleteButton.addEventListener('click', async () => {
      const ok = await confirmDialog('删除这条记录？', '照片也会一并删除，无法恢复。', {
        confirmText: '删除',
        danger: true,
      });
      if (!ok) return;
      clearDraft();
      app.state.entries = app.state.entries.filter((entry) => entry.id !== draft.id);
      for (const id of draft.photoIds) await deletePhoto(id);
      await persist();
      go('today');
    });
  }

  refreshSaveState();
  setTimeout(() => noteInput.blur(), 0);
  return root;
}

function activityChip(activity, selectedSet, onChange, onDelete) {
  const chip = el(`
    <button class="chip" type="button">
      <span class="chip-icon">${escapeHtml(activity.icon)}</span>
      <span>${escapeHtml(activity.name)}</span>
    </button>
  `);
  chip.classList.toggle('is-active', selectedSet.has(activity.id));

  let timer = null;
  let suppressClick = false;

  if (onDelete) {
    const start = () => {
      suppressClick = false;
      timer = setTimeout(() => {
        timer = null;
        suppressClick = true;
        onDelete(chip);
      }, 600);
    };
    const cancel = () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    };
    chip.addEventListener('pointerdown', start);
    chip.addEventListener('pointerup', cancel);
    chip.addEventListener('pointerleave', cancel);
    chip.addEventListener('pointercancel', cancel);
  }

  chip.addEventListener('click', () => {
    if (suppressClick) {
      suppressClick = false;
      return;
    }
    if (selectedSet.has(activity.id)) selectedSet.delete(activity.id);
    else selectedSet.add(activity.id);
    chip.classList.toggle('is-active');
    onChange();
  });
  return chip;
}

function sortActivitiesByUsage(state) {
  const counter = new Map();
  for (const entry of state.entries) {
    for (const id of entry.activityIds || []) {
      counter.set(id, (counter.get(id) || 0) + 1);
    }
  }
  return state.activities
    .filter((activity) => !activity.archived)
    .sort((a, b) => {
      const diff = (counter.get(b.id) || 0) - (counter.get(a.id) || 0);
      if (diff !== 0) return diff;
      return a.order - b.order;
    });
}
