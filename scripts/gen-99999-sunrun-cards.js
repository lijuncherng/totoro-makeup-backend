// 生成 99999 张阳光跑卡密并写入文件
// 运行方式：node scripts/gen-99999-sunrun-cards.js

import crypto from 'crypto';
import fs from 'fs';

const CARD_KIND_PREFIX = { makeup: 'TMC', sunrun: 'TSR' };
const CARD_SECRET_KEY = process.env.CARD_SECRET_KEY || 'totoro-makeup-secret-key-2024';

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
  const random = generateRandomString(6);
  return `${timestamp}-${random}`.substring(0, 12);
}

function calculateChecksum(data) {
  const hash = crypto.createHash('sha256').update(data + CARD_SECRET_KEY).digest('hex');
  return hash.substring(0, 2).toUpperCase();
}

function generateCardCode(kind, times) {
  const prefix = CARD_KIND_PREFIX[kind];
  const batchId = generateBatchId();
  const randomPart = generateRandomString(12);
  const rawData = [randomPart, batchId, times.toString(), ''].join('|');
  const checksum = calculateChecksum(rawData);
  const formatted = [
    randomPart.substring(0, 4),
    randomPart.substring(4, 8),
    randomPart.substring(8, 12),
    checksum.toString(16).toUpperCase(),
  ].join('-');
  return `${prefix}-${formatted}`;
}

const COUNT = 99999;
const OUTPUT_FILE = 'sunrun-99999-cards.txt';

console.log(`正在生成 ${COUNT} 张阳光跑卡密 (TSR)...`);
const cards = [];
for (let i = 0; i < COUNT; i++) {
  cards.push(generateCardCode('sunrun', 1));
  if ((i + 1) % 10000 === 0) {
    console.log(`  已生成 ${i + 1} / ${COUNT}`);
  }
}

fs.writeFileSync(OUTPUT_FILE, cards.join('\n'), 'utf8');
console.log(`\n完成！已写入 ${OUTPUT_FILE}，共 ${cards.length} 张。`);
