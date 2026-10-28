import crypto from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { db } from './db.js';

export type Role = 'super_admin' | 'admin' | 'teacher' | 'guardian';
export interface JwtUser { sub: number; role: Role; school_id: number | null }

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: JwtUser;
    user: JwtUser;
  }
}

export const sha256 = (v: string) => crypto.createHash('sha256').update(v).digest('hex');

export const requireRole =
  (...roles: Role[]) =>
  async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      await req.jwtVerify();
    } catch {
      return reply.code(401).send({ error: 'unauthorized' });
    }
    if (!roles.includes(req.user.role)) return reply.code(403).send({ error: 'forbidden' });
  };

/** Autentica o kiosk pelo token do dispositivo (nunca por conta de utilizador). */
export async function deviceAuth(req: FastifyRequest, reply: FastifyReply) {
  const token = req.headers['x-device-token'];
  if (typeof token !== 'string') return reply.code(401).send({ error: 'missing_token' });
  const device = await db('devices')
    .where({ token_hash: sha256(token), active: true })
    .first('id', 'school_id', 'location');
  if (!device) return reply.code(401).send({ error: 'invalid_token' });
  await db('devices').where({ id: device.id }).update({ last_seen_at: db.fn.now() });
  (req as any).device = device;
}
