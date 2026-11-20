import * as db from './db.js';
import * as crypto from './crypto.js';
import { createZip, readZip } from './zip.js';
import { ensureState } from './models.js';

const decoder = new TextDecoder();

export const BACKUP_VERSION = 1;

function encodePhotoPayload(width, height, bytes) {
  const out = new Uint8Array(8 + bytes.byteLength);
  const view = new DataView(out.buffer);
  view.setUint32(0, width || 0);
  view.setUint32(4, height || 0);
  out.set(new Uint8Array(bytes), 8);
  return out;
}

function decodePhotoPayload(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return {
    width: view.getUint32(0),
    height: view.getUint32(4),
    bytes: bytes.slice(8),
  };
}

export async function buildBackup({ state, dek, password }) {
  const salt = crypto.randomBytes(16);
  const key = await crypto.deriveKek(password, salt);

  const photoIds = [...new Set(state.entries.flatMap((entry) => entry.photoIds || []))];

  const manifest = {
    format: 'mood-diary-backup',
    version: BACKUP_VERSION,
    exportedAt: Date.now(),
    entryCount: state.entries.length,
    photoCount: photoIds.length,
  };

  const files = [
    { name: 'manifest.json', data: crypto.textToBytes(JSON.stringify(manifest)) },
    {
      name: 'key.json',
      data: crypto.textToBytes(JSON.stringify({
        salt: Array.from(salt),
        iterations: crypto.KDF_ITERATIONS,
      })),
    },
  ];

  const payload = await crypto.encryptJson(key, {
    schemaVersion: state.schemaVersion,
    entries: state.entries,
    moods: state.moods,
    activities: state.activities,
    settings: state.settings,
  });
  files.push({ name: 'data.enc', data: crypto.packEncrypted(payload) });

  for (const id of photoIds) {
    const record = await db.get('photos', id);
    if (!record) continue;
    const raw = await crypto.decryptBytes(dek, record.iv, record.cipher);
    const encrypted = await crypto.encryptBytes(
      key,
      encodePhotoPayload(record.width, record.height, raw)
    );
    files.push({ name: `photos/${id}.enc`, data: crypto.packEncrypted(encrypted) });
  }

  return { blob: createZip(files), manifest };
}

/**
 * 读取备份并写入数据库。dek 用于把照片重新加密成当前设备的格式。
 * 返回解密后的状态，合并策略由调用方决定。
 */
export async function readBackup(buffer, password, { dek, onProgress } = {}) {
  const files = readZip(buffer);
  const manifestBytes = files.get('manifest.json');
  const keyBytes = files.get('key.json');
  const dataBytes = files.get('data.enc');

  if (!manifestBytes || !keyBytes || !dataBytes) {
    throw new Error('备份文件不完整');
  }

  let manifest;
  try {
    manifest = JSON.parse(decoder.decode(manifestBytes));
  } catch {
    throw new Error('备份文件已损坏');
  }
  if (manifest.format !== 'mood-diary-backup') throw new Error('不是本应用生成的备份文件');
  if (manifest.version > BACKUP_VERSION) {
    throw new Error('备份文件版本高于当前应用，请先更新应用');
  }

  const { salt, iterations } = JSON.parse(decoder.decode(keyBytes));
  const key = await crypto.deriveKek(password, new Uint8Array(salt), iterations);

  let state;
  try {
    state = ensureState(await crypto.decryptJson(key, crypto.unpackEncrypted(dataBytes)));
  } catch {
    throw new Error('密码不正确，或备份文件已损坏');
  }

  const photos = [];
  const entries = [...files.entries()].filter(([name]) => name.startsWith('photos/') && name.endsWith('.enc'));
  let index = 0;
  for (const [name, bytes] of entries) {
    const id = name.slice('photos/'.length, -'.enc'.length);
    try {
      const unpacked = crypto.unpackEncrypted(bytes);
      const plain = await crypto.decryptBytes(key, unpacked.iv, unpacked.cipher);
      const { width, height, bytes: imageBytes } = decodePhotoPayload(new Uint8Array(plain));
      if (dek) {
        const encrypted = await crypto.encryptBytes(dek, imageBytes);
        await db.put('photos', id, { ...encrypted, width, height, size: imageBytes.byteLength });
      }
      photos.push({ id, width, height });
    } catch {
      // 单张照片损坏不影响其余数据
    }
    index += 1;
    if (onProgress) onProgress(index, entries.length);
  }

  return { state, manifest, photos };
}

export function suggestedFileName() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  return `mood-diary-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}.zip`;
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

/** 合并：按 id 取 updatedAt 较新的一方 */
export function mergeEntries(localEntries, incomingEntries) {
  const map = new Map(localEntries.map((entry) => [entry.id, entry]));
  for (const entry of incomingEntries) {
    const existing = map.get(entry.id);
    if (!existing || (entry.updatedAt || 0) > (existing.updatedAt || 0)) {
      map.set(entry.id, entry);
    }
  }
  return [...map.values()];
}

export function mergeById(localItems, incomingItems) {
  const map = new Map(localItems.map((item) => [item.id, item]));
  for (const item of incomingItems) {
    if (!map.has(item.id)) map.set(item.id, item);
  }
  return [...map.values()];
}
