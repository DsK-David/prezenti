import bcrypt from 'bcryptjs';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../db.js';

export async function authRoutes(app: FastifyInstance) {
  app.post('/auth/login', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req, reply) => {
    const body = z.object({ email: z.string().email(), password: z.string().min(1) }).parse(req.body);
    const user = await db('users').where({ email: body.email.toLowerCase(), active: true }).first();
    if (!user?.password_hash || !(await bcrypt.compare(body.password, user.password_hash))) {
      return reply.code(401).send({ error: 'invalid_credentials' });
    }
    const token = app.jwt.sign(
      { sub: user.id, role: user.role, school_id: user.school_id },
      { expiresIn: '7d' },
    );
    return { token, user: { id: user.id, name: user.name, role: user.role, school_id: user.school_id } };
  });
}
