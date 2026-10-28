import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../db.js';
import { requireRole } from '../auth.js';
import { hashEndpoint } from '../lib/push.js';
import { env } from '../env.js';
import { localParts, utcToLocalHHMM } from '../lib/time.js';
import { daySummary } from '../lib/day.js';

const guardianOnly = requireRole('guardian');

export async function parentRoutes(app: FastifyInstance) {
  app.get('/push/public-key', async () => ({ key: env.vapid.publicKey }));

  app.post('/push/subscribe', { preHandler: requireRole('guardian', 'admin', 'teacher') }, async (req) => {
    const body = z
      .object({ endpoint: z.string().url(), keys: z.object({ p256dh: z.string(), auth: z.string() }) })
      .parse(req.body);
    await db('push_subscriptions')
      .insert({
        user_id: req.user.sub, endpoint_hash: hashEndpoint(body.endpoint), endpoint: body.endpoint,
        p256dh: body.keys.p256dh, auth: body.keys.auth,
      })
      .onConflict('endpoint_hash')
      .merge({ user_id: req.user.sub, p256dh: body.keys.p256dh, auth: body.keys.auth });
    return { ok: true };
  });

  // Cada filho vem com o resumo de hoje: chegou, atraso, almoço, saída.
  app.get('/me/students', { preHandler: guardianOnly }, async (req) => {
    const kids = await db('students as s')
      .join('guardian_students as g', 'g.student_id', 's.id')
      .where('g.guardian_id', req.user.sub)
      .orderBy('s.name')
      .select('s.id', 's.name', 's.photo_url');
    const school = await db('schools').where({ id: req.user.school_id }).first('timezone');
    const tz = school?.timezone ?? 'UTC';
    const today = localParts(new Date(), tz).date;
    const evs = kids.length
      ? await db('events').whereIn('student_id', kids.map((k) => k.id)).where('local_date', today).select('student_id', 'type', 'late', 'tapped_at')
      : [];
    return kids.map((k) => ({ ...k, today: daySummary(evs.filter((e: any) => e.student_id === k.id) as any, tz) }));
  });

  // Timeline de um educando; só se pertencer ao encarregado autenticado.
  app.get('/me/students/:id/events', { preHandler: guardianOnly }, async (req, reply) => {
    const { id } = z.object({ id: z.coerce.number().int() }).parse(req.params);
    const { from, to } = z
      .object({ from: z.string().date().optional(), to: z.string().date().optional() })
      .parse(req.query);
    const link = await db('guardian_students').where({ guardian_id: req.user.sub, student_id: id }).first();
    const school = await db('schools').where({ id: req.user.school_id }).first('timezone');
    if (!link) return reply.code(404).send({ error: 'student_not_found' });

    const q = db('events').where({ student_id: id }).orderBy('tapped_at', 'desc').limit(500)
      .select('id', 'type', 'note', 'late', 'tapped_at', 'local_date');
    if (from) q.where('local_date', '>=', from);
    if (to) q.where('local_date', '<=', to);
    return (await q).map((e: any) => ({ ...e, local_time: utcToLocalHHMM(e.tapped_at, school?.timezone ?? 'UTC') }));
  });
}
