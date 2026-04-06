// 卡密加密和验证工具
import crypto from 'crypto';

/** 补跑卡 TMC-，阳光跑卡 TSR-，互不通用 */
export const CARD_KIND_PREFIX = {
  makeup: 'TMC',
  sunrun: 'TSR',
} as const;

export type CardKind = keyof typeof CARD_KIND_PREFIX;

/** 与 generateCardCode 输出一致：TMC/TSR-XXXX-XXXX-XXXX-校验2位 */
const REDEEM_CARD_CODE_REGEX = /^(TMC|TSR)-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{2}$/;

/**
 * 校验用户输入是否为合法卡密格式（充值前必须过此关，避免学号等被当成卡密）
 */
export function isValidRedeemCardCodeFormat(code: string): boolean {
  if (!code || typeof code !== 'string') return false;
  const normalized = code.trim().toUpperCase();
  return REDEEM_CARD_CODE_REGEX.test(normalized);
}

const CARD_CONFIG = {
  SECRET_KEY: process.env.CARD_SECRET_KEY || 'totoro-makeup-secret-key-2024',
  DEFAULT_EXPIRY_DAYS: 365,
  BATCH_ID_LENGTH: 6,
};

/**
 * 生成单个卡密
 * 格式: PREFIX-XXXX-XXXX-XXXX-校验码
 */
export function generateCardCode(options: {
  batchId?: string;
  times: number;
  expiresAt?: Date;
  /** 默认补跑 TMC */
  kind?: CardKind;
}): string {
  const { batchId, times, expiresAt, kind = 'makeup' } = options;
  const prefix = CARD_KIND_PREFIX[kind];

  const randomPart = generateRandomString(12);

  const rawData = [
    randomPart,
    batchId || generateBatchId(),
    times.toString(),
    expiresAt ? expiresAt.getTime().toString() : '',
  ].join('|');

  const checksum = calculateChecksum(rawData);

  const formatted = [
    randomPart.substring(0, 4),
    randomPart.substring(4, 8),
    randomPart.substring(8, 12),
    checksum.toUpperCase(),
  ].join('-');

  return `${prefix}-${formatted}`;
}

/**
 * 批量生成卡密
 */
export function generateBatchCards(
  count: number,
  times: number,
  options: {
    expiresDays?: number;
    kind?: CardKind;
  } = {}
): Array<{ code: string; batchId: string; times: number; expiresAt?: Date }> {
  const { expiresDays = CARD_CONFIG.DEFAULT_EXPIRY_DAYS, kind = 'makeup' } = options;

  const batchId = generateBatchId();

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + expiresDays);

  const cards = [];
  for (let i = 0; i < count; i++) {
    cards.push({
      code: generateCardCode({ batchId, times, expiresAt, kind }),
      batchId,
      times,
      expiresAt,
    });
  }

  return cards;
}

function generateRandomString(length: number): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const randomValues = new Uint8Array(length);
  crypto.getRandomValues(randomValues);
  return Array.from(randomValues, (v) => chars[v % chars.length]).join('');
}

function generateBatchId(): string {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = generateRandomString(CARD_CONFIG.BATCH_ID_LENGTH);
  return `${timestamp}-${random}`.substring(0, 12);
}

function calculateChecksum(data: string): string {
  const hash = crypto.createHash('sha256').update(data + CARD_CONFIG.SECRET_KEY).digest('hex');
  return hash.substring(0, 2).toUpperCase();
}
