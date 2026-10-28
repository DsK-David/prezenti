import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import { ZodError } from 'zod';
import { env } from './env.js';
import { db } from './db.js';
import { authRoutes } from './routes/auth.js';
import { tapRoutes } from './routes/tap.js';
import { schoolRoutes } from './routes/school.js';
import { parentRoutes } from './routes/parents.js';
import { adminRoutes } from './routes/admin.js';
import { statsRoutes } from './routes/stats.js';

const app = Fastify({ logger: true, trustProxy: true });

await app.register(cors, { origin: env.corsOrigin });
await app.register(jwt, { secret: env.jwtSecret });
await app.register(rateLimit, { global: false });

app.setErrorHandler((err: Error & { statusCode?: number }, _req, reply) => {
  if (err instanceof ZodError) return reply.code(400).send({ error: 'validation', issues: err.issues });
  app.log.error(err);
  const status = err.statusCode ?? 500;
  return reply.code(status).send({ error: status < 500 ? err.message : 'internal' });
});

app.get('/health', async () => {
  await db.raw('select 1');
  return { ok: true };
});

await app.register(authRoutes);
await app.register(tapRoutes);
await app.register(schoolRoutes);
await app.register(parentRoutes);
await app.register(adminRoutes);
await app.register(statsRoutes);

await app.listen({ port: env.port, host: '0.0.0.0' });
