// 直接生成卡密（不调用 API）
// 运行方式：node scripts/generate-100-cards.mjs

import crypto from 'crypto';

const CARD_KIND_PREFIX = {
  makeup: 'TMC',
  sunrun: 'TSR',
};

const CARD_SECRET_KEY = 'totoro-makeup-secret-key-2024';
const BATCH_ID_LENGTH = 6;

function generateRandomString(length) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function generateBatchId() {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = generateRandomString(BATCH_ID_LENGTH);
  return `${timestamp}-${random}`.substring(0, 12);
}

function calculateChecksum(data) {
  const hash = crypto.createHash('sha256').update(data + CARD_SECRET_KEY).digest('hex');
  return hash.substring(0, 2).toUpperCase();
}

function generateCardCode(kind, times) {
  const prefix = CARD_KIND_PREFIX[kind];
  const randomPart = generateRandomString(12);
  const batchId = generateBatchId();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 365);

  const rawData = [
    randomPart,
    batchId,
    times.toString(),
    expiresAt.getTime().toString(),
  ].join('|');

  const checksum = calculateChecksum(rawData);

  const formatted = [
    randomPart.substring(0, 4),
    randomPart.substring(4, 8),
    randomPart.substring(8, 12),
    checksum.toString(16).toUpperCase(),
  ].join('-');

  return `${prefix}-${formatted}`;
}

console.log('===== 100 次补跑卡密 =====');
const makeupCode = generateCardCode('makeup', 100);
console.log(makeupCode);

console.log('\n===== 100 次阳光跑卡密 =====');
const sunrunCode = generateCardCode('sunrun', 100);
console.log(sunrunCode);
