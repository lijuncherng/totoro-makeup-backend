/**
 * 加密服务 - 使用 Node.js 原生 crypto 模块
 * 稳定可靠，避免 Web Crypto API 在 Node 环境下的兼容性问题
 */
import * as crypto from 'crypto';

// 龙猫 RSA 公钥（PEM 格式）
const PUBLIC_KEY_PEM = [
  '-----BEGIN PUBLIC KEY-----',
  'MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDU/j+c5FdkEwhSIF9jmw+050iN0',
  '/yfjhk/669RyFiG5wu0Adpk3NR2Ikbo2lA+rTBJBx1bpGVGCvMKKQ/pljNUSmJt',
  'JaM5ieONFrZD6RhSUbjrNENH89Ks9GGWi+1dkOfdSHNujQilF5oLOIHez1HYmwm',
  'lADA29Ux4yb8e4+PtLQIDAQAB',
  '-----END PUBLIC KEY-----',
].join('\n');

/**
 * 加密请求内容 - 使用 Node.js 原生 crypto 公钥分块加密
 * 与龙猫服务器加密方式一致（RSAES-PKCS1-v1_5）
 */
export async function encryptRequestContent(data: Record<string, any>): Promise<string> {
  const reqStr = JSON.stringify(data);

  try {
    const publicKey = crypto.createPublicKey(PUBLIC_KEY_PEM);

    // RSA 1024-bit 公钥最大加密块 = 128 - 11 = 117 字节
    const maxChunkSize = 117;

    // 分块加密
    const chunks: Buffer[] = [];
    const buffer = Buffer.from(reqStr, 'utf8');
    for (let offset = 0; offset < buffer.length; offset += maxChunkSize) {
      const chunk = buffer.slice(offset, offset + maxChunkSize);
      const encryptedChunk = crypto.publicEncrypt(
        { key: publicKey, padding: crypto.constants.RSA_PKCS1_PADDING },
        chunk
      );
      chunks.push(encryptedChunk);
    }

    return Buffer.concat(chunks).toString('base64');
  } catch (e: any) {
    console.error('RSA 加密失败:', e.message);
    throw e;
  }
}

/**
 * 生成 SHA-256 哈希（用于签名）
 */
export function generateMd5Hash(data: string): string {
  return crypto.createHash('sha256').update(data, 'utf8').digest('hex').substring(0, 32);
}

/**
 * 生成签名
 */
export function generateSignature(params: Record<string, any>): string {
  const sortedKeys = Object.keys(params).sort();
  const signStr = sortedKeys.map(key => `${key}=${params[key]}`).join('&');
  return generateMd5Hash(signStr);
}

/**
 * 生成请求 ID
 */
export function generateRequestId(): string {
  return `${Date.now()}${Math.random().toString(36).substring(2, 11)}`;
}
