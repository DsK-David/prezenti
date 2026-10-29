import { Hono } from 'hono';
import { ZodError } from 'zod';
import { authRoutes } from './routes/auth.js';
import { tapRoutes } from './routes/tap.js';
import { schoolRoutes } from './routes/school.js';
import { parentRoutes } from './routes/parents.js';
import { adminRoutes } from './routes/admin.js';
import { statsRoutes } from './routes/stats.js';
import type { AppEnv } from './env.js';

/**
 * A API do Prezenti. Corre nos Cloudflare Workers: em produção como Pages Function em /api
 * (mesmo endereço da web), em desenvolvimento com `wrangler dev`.
 */
const app = new Hono<AppEnv>().basePath('/api');

app.onError((err, c) => {
  if (err instanceof ZodError) return c.json({ error: 'validation', issues: err.issues }, 400);
  if (err instanceof SyntaxError) return c.json({ error: 'validation' }, 400);
  console.error(err);
  return c.json({ error: 'internal' }, 500);
});

app.get('/health', async (c) => {
  await c.env.DB.prepare('SELECT 1').first();
  return c.json({ ok: true });
});

app.route('/', authRoutes);
app.route('/', tapRoutes);
app.route('/', schoolRoutes);
app.route('/', parentRoutes);
app.route('/', adminRoutes);
app.route('/', statsRoutes);

app.notFound((c) => c.json({ error: 'not_found' }, 404));

export default app;
