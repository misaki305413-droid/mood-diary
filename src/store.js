import * as db from './db.js';
import * as crypto from './crypto.js';
import { createInitialState, ensureState } from './models.js';

export const app = {
  state: null,
  dek: null,
  kek: null,
  pin: '',
  locked: true,
  route: 'today',
  editorEntryId: null,
  theme: localStorage.getItem('mood-diary-theme') || 'system',
  photoUrls: new Map(),
  sessionStart: Date.now(),
  hiddenAt: 0,
};

const listeners = new Set();

export function onChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function emit() {
  listeners.forEach((listener) => listener(app));
}

export function go(route, options = {}) {
  app.route = route;
  if ('editorEntryId' in options) app.editorEntryId = options.editorEntryId;
  emit();
}

export async function hasVault() {
  const meta = await db.get('meta', 'kdf');
  return Boolean(meta);
}

export async function createVault(pin) {
  const salt = crypto.randomBytes(16);
  const kek = await crypto.deriveKek(pin, salt);

  const recovery = crypto.generateRecoveryCode();
  const recoverySalt = crypto.randomBytes(16);
  const recoveryKek = await crypto.deriveKek(
    crypto.normalizeRecoveryCode(recovery.text),
    recoverySalt
  );

  const { raw, key } = await crypto.createDek();
  const state = createInitialState();

  await db.put('meta', 'kdf', {
    version: 1,
    salt,
    iterations: crypto.KDF_ITERATIONS,
    dekByPin: await crypto.encryptBytes(kek, raw),
    recoverySalt,
    dekByRecovery: await crypto.encryptBytes(recoveryKek, raw),
  });
  await db.put('vault', 'main', await crypto.encryptJson(key, state));

  app.kek = kek;
  app.dek = key;
  app.pin = pin;
  app.state = state;
  app.locked = false;
  applyTheme(state.settings.theme);
  db.requestPersistence();
  return recovery.text;
}

export async function unlockWithPin(pin) {
  const meta = await db.get('meta', 'kdf');
  if (!meta) throw new Error('尚未创建数据');
  const kek = await crypto.deriveKek(pin, new Uint8Array(meta.salt), meta.iterations);
  let raw;
  try {
    raw = await crypto.decryptBytes(kek, meta.dekByPin.iv, meta.dekByPin.cipher);
  } catch {
    throw new Error('密码不正确');
  }
  await finishUnlock(kek, raw, pin);
}

export async function unlockWithRecovery(code) {
  const meta = await db.get('meta', 'kdf');
  if (!meta || !meta.dekByRecovery) throw new Error('此设备没有设置恢复码');
  const normalized = crypto.normalizeRecoveryCode(code);
  if (normalized.length < 32) throw new Error('恢复码长度不足');
  const kek = await crypto.deriveKek(normalized, new Uint8Array(meta.recoverySalt), meta.iterations);
  let raw;
  try {
    raw = await crypto.decryptBytes(kek, meta.dekByRecovery.iv, meta.dekByRecovery.cipher);
  } catch {
    throw new Error('恢复码不正确');
  }
  await finishUnlock(null, raw, '');
}

async function finishUnlock(kek, raw, pin) {
  const dek = await crypto.importDek(raw);
  const vault = await db.get('vault', 'main');
  const state = ensureState(await crypto.decryptJson(dek, vault));

  app.kek = kek;
  app.dek = dek;
  app.pin = pin;
  app.state = state;
  app.locked = false;
  app.sessionStart = Date.now();
  applyTheme(state.settings.theme);
  db.requestPersistence();
  emit();
}

export function lock() {
  app.state = null;
  app.dek = null;
  app.kek = null;
  app.pin = '';
  app.locked = true;
  app.route = 'today';
  app.editorEntryId = null;
  app.photoUrls.forEach((url) => URL.revokeObjectURL(url));
  app.photoUrls.clear();
  emit();
}

let saveChain = Promise.resolve();

/** 串行化写入，避免并发保存互相覆盖 */
export function persist() {
  const snapshot = app.state;
  const dek = app.dek;
  if (!snapshot || !dek) return Promise.resolve();
  saveChain = saveChain
    .catch(() => {})
    .then(async () => {
      const record = await crypto.encryptJson(dek, snapshot);
      await db.put('vault', 'main', record);
    });
  return saveChain;
}

export function updateSettings(patch) {
  Object.assign(app.state.settings, patch);
  if (patch.theme) applyTheme(patch.theme);
  persist();
}

export function applyTheme(theme) {
  app.theme = theme || 'system';
  localStorage.setItem('mood-diary-theme', app.theme);
  const root = document.documentElement;
  if (app.theme === 'system') {
    root.removeAttribute('data-theme');
  } else {
    root.setAttribute('data-theme', app.theme);
  }
}

export async function savePhoto(file) {
  const { blob, width, height } = await compressImage(file);
  const buffer = await blob.arrayBuffer();
  const record = await crypto.encryptBytes(app.dek, buffer);
  const id = globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : fallbackId();
  await db.put('photos', id, { ...record, width, height, size: blob.size });
  return { id, width, height };
}

export async function getPhotoURL(id) {
  if (app.photoUrls.has(id)) return app.photoUrls.get(id);
  const record = await db.get('photos', id);
  if (!record) return null;
  const buffer = await crypto.decryptBytes(app.dek, record.iv, record.cipher);
  const url = URL.createObjectURL(new Blob([buffer], { type: 'image/jpeg' }));
  app.photoUrls.set(id, url);
  return url;
}

export async function deletePhoto(id) {
  const url = app.photoUrls.get(id);
  if (url) {
    URL.revokeObjectURL(url);
    app.photoUrls.delete(id);
  }
  await db.remove('photos', id);
}

function fallbackId() {
  return 'p-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('无法读取这张图片，请尝试选择 JPEG 格式'));
    image.src = url;
  });
}

/** 压缩到长边 1080、JPEG 0.8，控制存储和备份体积 */
async function compressImage(file) {
  const url = URL.createObjectURL(file);
  try {
    const image = await loadImage(url);
    const naturalWidth = image.naturalWidth || image.width;
    const naturalHeight = image.naturalHeight || image.height;
    if (!naturalWidth || !naturalHeight) throw new Error('无法读取这张图片');

    const maxEdge = 1080;
    const scale = Math.min(1, maxEdge / Math.max(naturalWidth, naturalHeight));
    const width = Math.max(1, Math.round(naturalWidth * scale));
    const height = Math.max(1, Math.round(naturalHeight * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    context.drawImage(image, 0, 0, width, height);

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.8));
    if (!blob) throw new Error('图片处理失败');
    return { blob, width, height };
  } finally {
    URL.revokeObjectURL(url);
  }
}
