import { Hono } from 'hono';
import { z } from 'zod';
import { first, run } from '../db.js';
import { signToken } from '../auth.js';
import { verifyPassword } from '../lib/password.js';
import { normalizeUsername } from '../lib/username.js';
import type { AppEnv, Role } from '../env.js';

// 10 senhas erradas para o mesmo utilizador em 15 minutos bloqueiam novas tentativas até a janela passar.
const MAX_FAILURES = 10;
const WINDOW = '-15 minutes';

export const authRoutes = new Hono<AppEnv>();

authRoutes.post('/auth/login', async (c) => {
  const body = z.object({ username: z.string().trim().min(1).max(64), password: z.string().min(1) }).parse(await c.req.json());
  const username = normalizeUsername(body.username);
  const db = c.env.DB;

  const failures = await first<{ n: number }>(db, `SELECT COUNT(*) AS n FROM login_failures WHERE username = ? AND at > datetime('now', ?)`, username, WINDOW);
  if ((failures?.n ?? 0) >= MAX_FAILURES) return c.json({ error: 'too_many_attempts' }, 429);

  const user = await first<{ id: number; name: string; role: Role; school_id: number | null; password_hash: string; school_active: number | null }>(db,
    `SELECT u.id, u.name, u.role, u.school_id, u.password_hash, s.active AS school_active
     FROM users u LEFT JOIN schools s ON s.id = u.school_id WHERE u.username = ? AND u.active = 1`, username);
  const ok = user && (user.role === 'super_admin' || user.school_active) && await verifyPassword(body.password, user.password_hash);
  if (!ok) {
    await run(db, 'INSERT INTO login_failures (username) VALUES (?)', username);
    return c.json({ error: 'invalid_credentials' }, 401);
  }
  await run(db, 'DELETE FROM login_failures WHERE username = ?', username);
  const token = await signToken({ sub: user.id, role: user.role, school_id: user.school_id }, c.env.JWT_SECRET);
  return c.json({ token, user: { id: user.id, name: user.name, role: user.role, school_id: user.school_id } });
});
