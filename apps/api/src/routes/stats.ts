import { Hono } from 'hono';
import { z } from 'zod';
import { all, first } from '../db.js';
import { requireRole } from '../auth.js';
import { localParts } from '../lib/time.js';
import type { AppEnv } from '../env.js';

const staff = requireRole('admin', 'teacher');
const DAY = 864e5;

export const statsRoutes = new Hono<AppEnv>();

// Números do painel: série diária (presentes, atrasos, almoços, ocorrências) e chegadas de hoje.
// O professor só vê as suas turmas, como no resto da API.
statsRoutes.get('/stats/overview', staff, async (c) => {
  const { days } = z.object({ days: z.coerce.number().int().min(3).max(90).default(14) }).parse(c.req.query());
  const { sub, role, school_id } = c.get('user');
  const db = c.env.DB;
  const school = await first<{ timezone: string; late_after: string; min_exit_time: string }>(db, 'SELECT timezone, late_after, min_exit_time FROM schools WHERE id = ?', school_id);
  const tz = school?.timezone ?? 'UTC';
  const today = localParts(new Date(), tz).date;
  const from = localParts(new Date(Date.now() - (days - 1) * DAY), tz).date;
  const scope = role === 'teacher' ? 'AND c.teacher_id = ?' : '';
  const scopeParams = role === 'teacher' ? [sub] : [];

  const enrolled = Number((await first<{ n: number }>(db,
    `SELECT COUNT(s.id) AS n FROM students s LEFT JOIN classes c ON c.id = s.class_id WHERE s.school_id = ? AND s.active = 1 ${scope}`,
    school_id, ...scopeParams))?.n ?? 0);

  const rows = await all<{ local_date: string; type: string; n: number; late_n: number | null }>(db,
    `SELECT e.local_date, e.type, COUNT(e.id) AS n, SUM(e.late) AS late_n
     FROM events e JOIN students s ON s.id = e.student_id LEFT JOIN classes c ON c.id = s.class_id
     WHERE e.school_id = ? AND e.local_date >= ? ${scope} GROUP BY e.local_date, e.type`,
    school_id, from, ...scopeParams);

  const byDate = new Map<string, { present: number; late: number; lunch: number; incidents: number }>();
  for (let i = days - 1; i >= 0; i--) byDate.set(localParts(new Date(Date.now() - i * DAY), tz).date, { present: 0, late: 0, lunch: 0, incidents: 0 });
  for (const r of rows) {
    const d = byDate.get(r.local_date);
    if (!d) continue;
    if (r.type === 'entry') { d.present = Number(r.n); d.late = Number(r.late_n ?? 0); }
    if (r.type === 'lunch') d.lunch = Number(r.n);
    if (r.type === 'incident') d.incidents = Number(r.n);
  }

  const entries = await all<{ tapped_at: string; late: number }>(db,
    `SELECT e.tapped_at, e.late FROM events e JOIN students s ON s.id = e.student_id LEFT JOIN classes c ON c.id = s.class_id
     WHERE e.school_id = ? AND e.local_date = ? AND e.type = 'entry' ${scope}`,
    school_id, today, ...scopeParams);

  return c.json({
    today,
    late_after: school?.late_after,
    min_exit_time: school?.min_exit_time,
    enrolled,
    days: [...byDate.entries()].map(([date, v]) => ({ date, ...v })),
    arrivals: entries.map((e) => ({ minutes: localParts(new Date(e.tapped_at.replace(' ', 'T') + 'Z'), tz).minutes, late: !!e.late })),
  });
});
