/**
 * Senhas com PBKDF2-SHA256 da Web Crypto: nativo nos Workers (cabe no tempo de CPU do plano grátis)
 * e igual no Node, onde corre o script dos dados de demonstração.
 * Formato guardado: pbkdf2$<iterações>$<sal base64>$<hash base64>.
 */

const ITERATIONS = 100_000; // o máximo que os Workers aceitam
const enc = new TextEncoder();
const toB64 = (b: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(b)));
const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function derive(password: string, salt: Uint8Array, iterations: number) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256));
}

export async function hashPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2$${ITERATIONS}$${toB64(salt)}$${toB64(await derive(password, salt, ITERATIONS))}`;
}

export async function verifyPassword(password: string, stored: string | null | undefined) {
  const [scheme, iter, salt, hash] = (stored ?? '').split('$');
  if (scheme !== 'pbkdf2' || !iter || !salt || !hash) return false;
  const got = await derive(password, fromB64(salt), Number(iter));
  const want = fromB64(hash);
  if (got.length !== want.length) return false;
  let diff = 0;
  for (let i = 0; i < got.length; i++) diff |= got[i] ^ want[i];
  return diff === 0;
}

/** Senha temporária legível (sem 0/O, 1/l), mostrada uma vez a quem cria a conta. */
export function tempPassword(length = 10) {
  const alphabet = 'abcdefghijkmnpqrstuvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

export async function sha256Hex(value: string) {
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(value));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

export function randomHex(bytes = 32) {
  return Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (b) => b.toString(16).padStart(2, '0')).join('');
}
