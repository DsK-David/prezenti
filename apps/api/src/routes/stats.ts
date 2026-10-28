import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../db.js';
import { requireRole } from '../auth.js';
import { localParts } from '../lib/time.js';

const staff = requireRole('admin', 'teacher');
const DAY = 864e5;

export async function statsRoutes(app: FastifyInstance) {
  // Números do painel: série diária (presentes, atrasos, almoços, ocorrências) e chegadas de hoje.
  // O professor só vê a sua turma, como no resto da API.
  app.get('/stats/overview', { preHandler: staff }, async (req) => {
    const { days } = z.object({ days: z.coerce.number().int().min(3).max(90).default(14) }).parse(req.query);
    const { sub, role, school_id } = req.user;
    const school = await db('schools').where({ id: school_id }).first('timezone', 'late_after', 'min_exit_time');
    const today = localParts(new Date(), school.timezone).date;
    const from = localParts(new Date(Date.now() - (days - 1) * DAY), school.timezone).date;

    const scoped = <T extends { where: (...a: any[]) => T }>(q: T) => (role === 'teacher' ? q.where('c.teacher_id', sub) : q);
    const base = () =>
      scoped(
        db('events as e')
          .join('students as s', 's.id', 'e.student_id')
          .leftJoin('classes as c', 'c.id', 's.class_id')
          .where('e.school_id', school_id),
      );

    const enrolled = Number(
      (await scoped(db('students as s').leftJoin('classes as c', 'c.id', 's.class_id').where({ 's.school_id': school_id, 's.active': 1 }).count({ n: 's.id' }).first() as any) as any)?.n ?? 0,
    );

    const rows = await base()
      .where('e.local_date', '>=', from)
      .groupBy('e.local_date', 'e.type')
      .select('e.local_date', 'e.type')
      .count({ n: 'e.id' })
      .sum({ late_n: 'e.late' });

    const byDate = new Map<string, { present: number; late: number; lunch: number; incidents: number }>();
    for (let i = days - 1; i >= 0; i--) {
      byDate.set(localParts(new Date(Date.now() - i * DAY), school.timezone).date, { present: 0, late: 0, lunch: 0, incidents: 0 });
    }
    for (const r of rows as any[]) {
      const d = byDate.get(r.local_date);
      if (!d) continue;
      if (r.type === 'entry') { d.present = Number(r.n); d.late = Number(r.late_n ?? 0); }
      if (r.type === 'lunch') d.lunch = Number(r.n);
      if (r.type === 'incident') d.incidents = Number(r.n);
    }

    const entries = await base().where({ 'e.local_date': today, 'e.type': 'entry' }).select('e.tapped_at', 'e.late');
    const arrivals = entries.map((e: any) => ({
      minutes: localParts(new Date(e.tapped_at.replace(' ', 'T') + 'Z'), school.timezone).minutes,
      late: !!e.late,
    }));

    return {
      today,
      late_after: school.late_after,
      min_exit_time: school.min_exit_time,
      enrolled,
      days: [...byDate.entries()].map(([date, v]) => ({ date, ...v })),
      arrivals,
    };
  });
}
