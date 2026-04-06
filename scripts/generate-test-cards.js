// 生成测试卡密脚本
// 运行方式：node scripts/generate-test-cards.js

import crypto from 'crypto';

const CARD_KIND_PREFIX = {
  makeup: 'TMC',
  sunrun: 'TSR',
};

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

  const rawData = [
    randomPart,
    batchId,
    times.toString(),
    '',
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

// 生成测试卡密
console.log('========================================');
console.log('       阳光跑/补跑 测试卡密生成');
console.log('========================================\n');

console.log('【补跑卡密 (TMC) - 每次补跑消耗1次】\n');
for (let i = 0; i < 5; i++) {
  console.log(`  ${i + 1}. ${generateCardCode('makeup', 1)}`);
}

console.log('\n【阳光跑卡密 (TSR) - 每次阳光跑消耗1次】\n');
for (let i = 0; i < 5; i++) {
  console.log(`  ${i + 1}. ${generateCardCode('sunrun', 1)}`);
}

console.log('\n========================================');
console.log('  说明：');
console.log('  - TMC 开头：补跑卡密');
console.log('  - TSR 开头：阳光跑卡密');
console.log('  - 每张卡密只能使用一次');
console.log('  - 使用后立即失效');
console.log('========================================');
