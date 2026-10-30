import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

export const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');

export const randomToken = (bytes = 32) => randomBytes(bytes).toString('base64url');

export const randomDigits = (n: number) =>
  Array.from({ length: n }, () => randomInt(0, 10)).join('');

export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

export function hmacSha256Hex(secret: string, payload: string | Buffer): string {
  return createHmac('sha256', secret).update(payload).digest('hex');
}
