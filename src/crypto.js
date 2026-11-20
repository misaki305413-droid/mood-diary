const encoder = new TextEncoder();
const decoder = new TextDecoder();

export const KDF_ITERATIONS = 210000;
const B32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function randomBytes(length) {
  return crypto.getRandomValues(new Uint8Array(length));
}

/** 由 PIN 或恢复码派生密钥（PBKDF2-SHA256） */
export async function deriveKek(password, salt, iterations = KDF_ITERATIONS) {
  const baseKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encryptBytes(key, bytes) {
  const iv = randomBytes(12);
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, bytes);
  return { iv, cipher };
}

export async function decryptBytes(key, iv, cipher) {
  return crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: new Uint8Array(iv) },
    key,
    cipher
  );
}

export async function encryptJson(key, value) {
  return encryptBytes(key, encoder.encode(JSON.stringify(value)));
}

export async function decryptJson(key, record) {
  const buffer = await decryptBytes(key, record.iv, record.cipher);
  return JSON.parse(decoder.decode(buffer));
}

export function textToBytes(text) {
  return encoder.encode(text);
}

/** 生成随机数据密钥（DEK），vault 与照片都用它加密 */
export async function createDek() {
  const raw = randomBytes(32);
  const key = await crypto.subtle.importKey(
    'raw',
    raw,
    { name: 'AES-GCM' },
    true,
    ['encrypt', 'decrypt']
  );
  return { raw, key };
}

export async function importDek(raw) {
  return crypto.subtle.importKey(
    'raw',
    new Uint8Array(raw),
    { name: 'AES-GCM' },
    true,
    ['encrypt', 'decrypt']
  );
}

/** 把 {iv, cipher} 打包成自描述字节串，便于放进备份文件 */
export function packEncrypted(record) {
  const iv = new Uint8Array(record.iv);
  const cipher = new Uint8Array(record.cipher);
  const out = new Uint8Array(1 + iv.length + cipher.length);
  out[0] = iv.length;
  out.set(iv, 1);
  out.set(cipher, 1 + iv.length);
  return out;
}

export function unpackEncrypted(bytes) {
  const view = new Uint8Array(bytes);
  const ivLength = view[0];
  return {
    iv: view.slice(1, 1 + ivLength),
    cipher: view.slice(1 + ivLength).buffer,
  };
}

export function base32Encode(bytes) {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += B32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
    value &= (1 << bits) - 1;
  }
  if (bits > 0) {
    output += B32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

export function base32Decode(text) {
  const clean = String(text).toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0;
  let value = 0;
  const out = [];
  for (const char of clean) {
    const index = B32_ALPHABET.indexOf(char);
    if (index === -1) throw new Error('恢复码包含无效字符');
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
    value &= (1 << bits) - 1;
  }
  return new Uint8Array(out);
}

/** 归一化恢复码：去掉分隔符并统一大写，保证同一串码派生出同一密钥 */
export function normalizeRecoveryCode(text) {
  return String(text).toUpperCase().replace(/[^A-Z2-7]/g, '');
}

export function generateRecoveryCode() {
  const raw = randomBytes(20);
  const text = base32Encode(raw);
  return {
    raw,
    text: text.match(/.{1,4}/g).join('-'),
  };
}
