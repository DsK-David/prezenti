import { Hono } from 'hono';
import { z } from 'zod';
import { first, run } from '../db.js';
import { signToken } from '../auth.js';
import { dummyHash, verifyPassword } from '../lib/password.js';
import { normalizeUsername } from '../lib/username.js';
import type { AppEnv, Role } from '../env.js';

// Na janela de 15 minutos: 10 senhas erradas para o mesmo utilizador a partir do mesmo IP, ou 30 falhas
// de um IP, bloqueiam novas tentativas até a janela passar. Por IP, para ninguém trancar contas alheias.
const MAX_FAILURES = 10;
const MAX_IP_FAILURES = 30;
const WINDOW = '-15 minutes';
const RETRY_AFTER = String(15 * 60);

export const authRoutes = new Hono<AppEnv>();

authRoutes.post('/auth/login', async (c) => {
  const body = z.object({ username: z.string().trim().min(1).max(64), password: z.string().min(1) }).parse(await c.req.json());
  const username = normalizeUsername(body.username);
  const db = c.env.DB;
  const ip = c.req.header('cf-connecting-ip') ?? 'unknown';

  const failures = await first<{ pair: number | null; byIp: number }>(db,
    `SELECT SUM(username = ?) AS pair, COUNT(*) AS byIp FROM login_failures WHERE ip = ? AND at > datetime('now', ?)`, username, ip, WINDOW);
  if ((failures?.pair ?? 0) >= MAX_FAILURES || (failures?.byIp ?? 0) >= MAX_IP_FAILURES) {
    c.header('Retry-After', RETRY_AFTER);
    return c.json({ error: 'too_many_attempts' }, 429);
  }

  const user = await first<{ id: number; name: string; role: Role; school_id: number | null; password_hash: string; school_active: number | null }>(db,
    `SELECT u.id, u.name, u.role, u.school_id, u.password_hash, s.active AS school_active
     FROM users u LEFT JOIN schools s ON s.id = u.school_id WHERE u.username = ? AND u.active = 1`, username);
  // Corre sempre o PBKDF2 (com um hash fictício se o utilizador não existe) para o tempo não revelar quem tem conta.
  const passwordOk = await verifyPassword(body.password, user?.password_hash ?? await dummyHash());
  const ok = user && passwordOk && (user.role === 'super_admin' || user.school_active);
  if (!ok) {
    await run(db, `DELETE FROM login_failures WHERE at <= datetime('now', ?)`, WINDOW);
    await run(db, 'INSERT INTO login_failures (username, ip) VALUES (?, ?)', username, ip);
    return c.json({ error: 'invalid_credentials' }, 401);
  }
  await run(db, 'DELETE FROM login_failures WHERE username = ? AND ip = ?', username, ip);
  const token = await signToken({ sub: user.id, role: user.role, school_id: user.school_id }, c.env.JWT_SECRET);
  return c.json({ token, user: { id: user.id, name: user.name, role: user.role, school_id: user.school_id } });
});
