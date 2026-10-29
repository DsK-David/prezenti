import { first, type DB } from '../db.js';

/** 3 a 32 caracteres: letras minúsculas, números, ponto, hífen e sublinhado; começa por letra ou número. */
export const USERNAME = /^[a-z0-9][a-z0-9._-]{2,31}$/;

export const normalizeUsername = (v: string) => v.trim().toLowerCase();

/** "Joana Maria Silva" → "joana.silva". */
export function suggestUsername(name: string) {
  const parts = name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
  const base = parts.length > 1 ? `${parts[0]}.${parts[parts.length - 1]}` : parts[0] ?? '';
  return base.length >= 3 ? base.slice(0, 28) : `${base || 'utilizador'}${base.length ? '.pz' : ''}`.slice(0, 28);
}

/** O nome sugerido, ou o mesmo com um número a seguir se já existir (joana.silva2, joana.silva3…). */
export async function uniqueUsername(db: DB, name: string) {
  const base = suggestUsername(name);
  for (let n = 1; n < 500; n++) {
    const candidate = n === 1 ? base : `${base}${n}`;
    if (!(await first(db, 'SELECT id FROM users WHERE username = ?', candidate))) return candidate;
  }
  return `${base}${Date.now() % 100000}`;
}
