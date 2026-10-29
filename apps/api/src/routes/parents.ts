import { Hono } from 'hono';
import { z } from 'zod';
import { all, first, marks, run } from '../db.js';
import { requireRole } from '../auth.js';
import { hashEndpoint } from '../lib/push.js';
import { localParts, utcToLocalHHMM } from '../lib/time.js';
import { daySummary, type DayEvent } from '../lib/day.js';
import type { AppEnv } from '../env.js';

const guardianOnly = requireRole('guardian');

export const parentRoutes = new Hono<AppEnv>();

parentRoutes.get('/push/public-key', (c) => c.json({ key: c.env.VAPID_PUBLIC_KEY ?? '' }));

parentRoutes.post('/push/subscribe', requireRole('guardian', 'admin', 'teacher'), async (c) => {
  const body = z.object({ endpoint: z.string().url(), keys: z.object({ p256dh: z.string(), auth: z.string() }) }).parse(await c.req.json());
  await run(c.env.DB,
    `INSERT INTO push_subscriptions (user_id, endpoint_hash, endpoint, p256dh, auth) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (endpoint_hash) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth`,
    c.get('user').sub, await hashEndpoint(body.endpoint), body.endpoint, body.keys.p256dh, body.keys.auth);
  return c.json({ ok: true });
});

// Cada filho vem com o resumo de hoje: chegou, atraso, almoço, saída.
parentRoutes.get('/me/students', guardianOnly, async (c) => {
  const { sub, school_id } = c.get('user');
  const db = c.env.DB;
  const kids = await all<{ id: number; name: string; photo_url: string | null }>(db,
    'SELECT s.id, s.name, s.photo_url FROM students s JOIN guardian_students g ON g.student_id = s.id WHERE g.guardian_id = ? ORDER BY s.name', sub);
  const tz = (await first<{ timezone: string }>(db, 'SELECT timezone FROM schools WHERE id = ?', school_id))?.timezone ?? 'UTC';
  const today = localParts(new Date(), tz).date;
  const evs = kids.length
    ? await all<DayEvent & { student_id: number }>(db, `SELECT student_id, type, late, tapped_at FROM events WHERE student_id IN (${marks(kids.length)}) AND local_date = ?`, ...kids.map((k) => k.id), today)
    : [];
  return c.json(kids.map((k) => ({ ...k, today: daySummary(evs.filter((e) => e.student_id === k.id), tz) })));
});

// Timeline de um educando; só se pertencer ao encarregado autenticado.
parentRoutes.get('/me/students/:id/events', guardianOnly, async (c) => {
  const id = z.coerce.number().int().parse(c.req.param('id'));
  const { from, to } = z.object({ from: z.string().date().optional(), to: z.string().date().optional() }).parse(c.req.query());
  const { sub, school_id } = c.get('user');
  const db = c.env.DB;
  if (!(await first(db, 'SELECT 1 FROM guardian_students WHERE guardian_id = ? AND student_id = ?', sub, id))) return c.json({ error: 'student_not_found' }, 404);
  const tz = (await first<{ timezone: string }>(db, 'SELECT timezone FROM schools WHERE id = ?', school_id))?.timezone ?? 'UTC';
  const rows = await all<{ tapped_at: string }>(db,
    `SELECT id, type, note, late, tapped_at, local_date FROM events WHERE student_id = ?
     AND (? IS NULL OR local_date >= ?) AND (? IS NULL OR local_date <= ?) ORDER BY tapped_at DESC LIMIT 500`,
    id, from ?? null, from ?? null, to ?? null, to ?? null);
  return c.json(rows.map((e) => ({ ...e, local_time: utcToLocalHHMM(e.tapped_at, tz) })));
});
