import { createMiddleware } from 'hono/factory';
import { sign, verify } from 'hono/jwt';
import { first, run, sqlTime } from './db.js';
import { sha256Hex } from './lib/password.js';
import type { AppEnv, Device, JwtUser, Role } from './env.js';

const WEEK = 7 * 24 * 3600;

export const signToken = (u: JwtUser, secret: string) =>
  sign({ sub: u.sub, role: u.role, school_id: u.school_id, exp: Math.floor(Date.now() / 1000) + WEEK }, secret, 'HS256');

/**
 * Exige sessão com um dos perfis. A cada pedido confirma que a conta continua ativa e que a escola
 * não foi suspensa: desativar alguém no painel corta-lhe o acesso logo, sem esperar que o token expire.
 */
export const requireRole = (...roles: Role[]) =>
  createMiddleware<AppEnv>(async (c, next) => {
    const header = c.req.header('authorization');
    if (!header?.startsWith('Bearer ')) return c.json({ error: 'unauthorized' }, 401);
    let payload: JwtUser;
    try { payload = (await verify(header.slice(7), c.env.JWT_SECRET, 'HS256')) as unknown as JwtUser; }
    catch { return c.json({ error: 'unauthorized' }, 401); }
    const live = await first<{ active: number; school_active: number | null }>(c.env.DB,
      'SELECT u.active, s.active AS school_active FROM users u LEFT JOIN schools s ON s.id = u.school_id WHERE u.id = ?', payload.sub);
    if (!live?.active || (payload.role !== 'super_admin' && !live.school_active)) return c.json({ error: 'unauthorized' }, 401);
    if (!roles.includes(payload.role)) return c.json({ error: 'forbidden' }, 403);
    c.set('user', { sub: Number(payload.sub), role: payload.role, school_id: payload.school_id == null ? null : Number(payload.school_id) });
    await next();
  });

/** Autentica o kiosk pelo token do dispositivo (nunca por conta de utilizador). */
export const deviceAuth = createMiddleware<AppEnv>(async (c, next) => {
  const token = c.req.header('x-device-token');
  if (!token) return c.json({ error: 'missing_token' }, 401);
  const device = await first<Device>(c.env.DB,
    `SELECT d.id, d.school_id, d.location FROM devices d JOIN schools s ON s.id = d.school_id
     WHERE d.token_hash = ? AND d.active = 1 AND s.active = 1`, await sha256Hex(token));
  if (!device) return c.json({ error: 'invalid_token' }, 401);
  await run(c.env.DB, 'UPDATE devices SET last_seen_at = ? WHERE id = ?', sqlTime(new Date()), device.id);
  c.set('device', device);
  await next();
});
