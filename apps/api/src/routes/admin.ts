import { Hono } from 'hono';
import { z } from 'zod';
import { all, first, insert, isDup, marks, run, stmt } from '../db.js';
import { requireRole } from '../auth.js';
import { localParts, utcToLocalHHMM } from '../lib/time.js';
import { daySummary, type DayEvent } from '../lib/day.js';
import { hashPassword, tempPassword, verifyPassword } from '../lib/password.js';
import { uniqueUsername, USERNAME } from '../lib/username.js';
import { normalizeCard } from './school.js';
import type { AppEnv } from '../env.js';

const staff = requireRole('admin', 'teacher');
const adminOnly = requireRole('admin');
const anyUser = requireRole('admin', 'teacher', 'guardian', 'super_admin');
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const idParam = (v: string | undefined) => z.coerce.number().int().parse(v);
const username = z.string().trim().toLowerCase().regex(USERNAME, 'username');
const email = z.string().trim().email().optional().or(z.literal('').transform(() => undefined));
const schoolTz = async (db: D1Database, id: number | null) => (await first<{ timezone: string }>(db, 'SELECT timezone FROM schools WHERE id = ?', id))?.timezone ?? 'UTC';

const csvCell = (v: unknown) => {
  const s = v == null ? '' : String(v);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export const adminRoutes = new Hono<AppEnv>();

// ───── Eu ─────
adminRoutes.get('/me', anyUser, async (c) => {
  const db = c.env.DB;
  const u = await first<{ id: number; name: string; username: string; email: string | null; role: string; school_id: number | null }>(db,
    'SELECT id, name, username, email, role, school_id FROM users WHERE id = ?', c.get('user').sub);
  if (!u) return c.json({ error: 'unauthorized' }, 401);
  const consented = u.role === 'guardian' ? !!(await first(db, 'SELECT id FROM consents WHERE guardian_id = ?', u.id)) : true;
  const school = u.school_id ? await first<{ name: string }>(db, 'SELECT name FROM schools WHERE id = ?', u.school_id) : null;
  return c.json({ ...u, consented, school_name: school?.name ?? null });
});

adminRoutes.post('/me/consent', requireRole('guardian'), async (c) => {
  const db = c.env.DB;
  const sub = c.get('user').sub;
  const kids = await all<{ student_id: number }>(db, 'SELECT student_id FROM guardian_students WHERE guardian_id = ?', sub);
  if (kids.length) await db.batch(kids.map((k) => stmt(db, "INSERT OR IGNORE INTO consents (guardian_id, student_id, version) VALUES (?, ?, '1')", sub, k.student_id)));
  return c.json({ ok: true });
});

adminRoutes.post('/auth/change-password', anyUser, async (c) => {
  const body = z.object({ current: z.string().min(1), next: z.string().min(8).max(100) }).parse(await c.req.json());
  const db = c.env.DB;
  const sub = c.get('user').sub;
  const u = await first<{ password_hash: string }>(db, 'SELECT password_hash FROM users WHERE id = ?', sub);
  if (!(await verifyPassword(body.current, u?.password_hash))) return c.json({ error: 'wrong_password' }, 400);
  await run(db, "UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?", await hashPassword(body.next), sub);
  return c.json({ ok: true });
});

// ───── Definições da escola ─────
adminRoutes.get('/school', staff, async (c) =>
  c.json(await first(c.env.DB, 'SELECT id, name, timezone, min_exit_time, late_after FROM schools WHERE id = ?', c.get('user').school_id)));

adminRoutes.put('/school', adminOnly, async (c) => {
  const body = z.object({ name: z.string().trim().min(1).max(120), min_exit_time: hhmm, late_after: hhmm }).parse(await c.req.json());
  await run(c.env.DB, "UPDATE schools SET name = ?, min_exit_time = ?, late_after = ?, updated_at = datetime('now') WHERE id = ?",
    body.name, body.min_exit_time, body.late_after, c.get('user').school_id);
  return c.json({ ok: true });
});

// ───── Turmas ─────
adminRoutes.get('/classes', staff, async (c) => {
  const { sub, role, school_id } = c.get('user');
  const rows = await all(c.env.DB,
    `SELECT c.id, c.name, c.teacher_id, u.name AS teacher_name, COUNT(s.id) AS students
     FROM classes c LEFT JOIN users u ON u.id = c.teacher_id LEFT JOIN students s ON s.class_id = c.id AND s.active = 1
     WHERE c.school_id = ? ${role === 'teacher' ? 'AND c.teacher_id = ?' : ''}
     GROUP BY c.id ORDER BY c.name`,
    ...(role === 'teacher' ? [school_id, sub] : [school_id]));
  return c.json(rows.map((r) => ({ ...r, students: Number(r.students) })));
});

const teacherOk = async (db: D1Database, school_id: number | null, id: number | null | undefined) =>
  id == null || !!(await first(db, "SELECT id FROM users WHERE id = ? AND school_id = ? AND role = 'teacher'", id, school_id));

adminRoutes.post('/classes', adminOnly, async (c) => {
  const body = z.object({ name: z.string().trim().min(1).max(60), teacher_id: z.number().int().nullable().optional() }).parse(await c.req.json());
  const school_id = c.get('user').school_id;
  if (!(await teacherOk(c.env.DB, school_id, body.teacher_id))) return c.json({ error: 'invalid_teacher' }, 400);
  try {
    return c.json({ id: await insert(c.env.DB, 'INSERT INTO classes (school_id, name, teacher_id) VALUES (?, ?, ?)', school_id, body.name, body.teacher_id ?? null) }, 201);
  } catch (e) {
    if (isDup(e)) return c.json({ error: 'class_exists' }, 409);
    throw e;
  }
});

adminRoutes.patch('/classes/:id', adminOnly, async (c) => {
  const id = idParam(c.req.param('id'));
  const body = z.object({ name: z.string().trim().min(1).max(60).optional(), teacher_id: z.number().int().nullable().optional() }).parse(await c.req.json());
  const school_id = c.get('user').school_id;
  if (!(await teacherOk(c.env.DB, school_id, body.teacher_id))) return c.json({ error: 'invalid_teacher' }, 400);
  try {
    const r = await run(c.env.DB,
      `UPDATE classes SET name = COALESCE(?, name), teacher_id = CASE WHEN ? THEN ? ELSE teacher_id END WHERE id = ? AND school_id = ?`,
      body.name ?? null, 'teacher_id' in body, body.teacher_id ?? null, id, school_id);
    if (!r.meta.changes) return c.json({ error: 'class_not_found' }, 404);
  } catch (e) {
    if (isDup(e)) return c.json({ error: 'class_exists' }, 409);
    throw e;
  }
  return c.json({ ok: true });
});

adminRoutes.delete('/classes/:id', adminOnly, async (c) => {
  await run(c.env.DB, 'DELETE FROM classes WHERE id = ? AND school_id = ?', idParam(c.req.param('id')), c.get('user').school_id);
  return c.json({ ok: true });
});

// Alunos de uma turma, quem chegou hoje e a presença dos últimos dias letivos.
// O professor só abre as suas turmas; o gestor abre qualquer uma.
adminRoutes.get('/classes/:id/attendance', staff, async (c) => {
  const id = idParam(c.req.param('id'));
  const { days } = z.object({ days: z.coerce.number().int().min(3).max(31).default(10) }).parse(c.req.query());
  const { sub, role, school_id } = c.get('user');
  const db = c.env.DB;
  const cls = await first<{ id: number; name: string; teacher_id: number | null }>(db, 'SELECT id, name, teacher_id FROM classes WHERE id = ? AND school_id = ?', id, school_id);
  if (!cls || (role === 'teacher' && cls.teacher_id !== sub)) return c.json({ error: 'class_not_found' }, 404);

  const school = await first<{ timezone: string; late_after: string }>(db, 'SELECT timezone, late_after FROM schools WHERE id = ?', school_id);
  const tz = school?.timezone ?? 'UTC';
  const today = localParts(new Date(), tz).date;
  const from = localParts(new Date(Date.now() - (days - 1) * 864e5), tz).date;
  const students = await all<{ id: number; name: string; photo_url: string | null }>(db, 'SELECT id, name, photo_url FROM students WHERE school_id = ? AND class_id = ? AND active = 1 ORDER BY name', school_id, id);
  const evs = students.length
    ? await all<DayEvent & { student_id: number; local_date: string }>(db,
      `SELECT student_id, type, late, tapped_at, local_date FROM events WHERE student_id IN (${marks(students.length)}) AND local_date >= ?`, ...students.map((s) => s.id), from)
    : [];
  // Dias letivos: aqueles em que a escola registou alguma entrada (fins de semana ficam de fora).
  const schoolDays = (await all<{ local_date: string }>(db, "SELECT DISTINCT local_date FROM events WHERE school_id = ? AND type = 'entry' AND local_date >= ?", school_id, from)).map((r) => r.local_date);
  const dayList = [...new Set([...schoolDays, today])].sort();

  return c.json({
    class: { id: cls.id, name: cls.name },
    today,
    late_after: school?.late_after,
    days: dayList,
    students: students.map((s) => {
      const mine = evs.filter((e) => e.student_id === s.id);
      const history = dayList.map((date) => {
        const entry = mine.find((e) => e.local_date === date && e.type === 'entry');
        return { date, status: entry ? (entry.late ? 'late' : 'present') : date === today ? 'pending' : 'absent' };
      });
      return { ...s, ...daySummary(mine.filter((e) => e.local_date === today), tz), history };
    }),
  });
});

// ───── Professores ─────
adminRoutes.get('/teachers', adminOnly, async (c) =>
  c.json(await all(c.env.DB, "SELECT id, name, username, email, active FROM users WHERE school_id = ? AND role = 'teacher' ORDER BY name", c.get('user').school_id)));

adminRoutes.post('/teachers', adminOnly, async (c) => {
  const body = z.object({ name: z.string().trim().min(1).max(120), username: username.optional(), email }).parse(await c.req.json());
  const db = c.env.DB;
  const temp = tempPassword();
  const user = body.username ?? await uniqueUsername(db, body.name);
  try {
    const id = await insert(db, "INSERT INTO users (school_id, name, username, email, role, password_hash) VALUES (?, ?, ?, ?, 'teacher', ?)",
      c.get('user').school_id, body.name, user, body.email?.toLowerCase() ?? null, await hashPassword(temp));
    return c.json({ id, username: user, temporary_password: temp }, 201);
  } catch (e) {
    if (isDup(e)) return c.json({ error: 'username_in_use' }, 409);
    throw e;
  }
});

// Nova senha temporária para professor ou encarregado da mesma escola.
adminRoutes.post('/users/:id/reset-password', adminOnly, async (c) => {
  const id = idParam(c.req.param('id'));
  const temp = tempPassword();
  const r = await run(c.env.DB, "UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ? AND school_id = ? AND role IN ('teacher', 'guardian')",
    await hashPassword(temp), id, c.get('user').school_id);
  if (!r.meta.changes) return c.json({ error: 'user_not_found' }, 404);
  const u = await first<{ username: string }>(c.env.DB, 'SELECT username FROM users WHERE id = ?', id);
  return c.json({ username: u?.username, temporary_password: temp });
});

adminRoutes.patch('/users/:id', adminOnly, async (c) => {
  const id = idParam(c.req.param('id'));
  const { active } = z.object({ active: z.boolean() }).parse(await c.req.json());
  const r = await run(c.env.DB, "UPDATE users SET active = ?, updated_at = datetime('now') WHERE id = ? AND school_id = ? AND role IN ('teacher', 'guardian')", active, id, c.get('user').school_id);
  if (!r.meta.changes) return c.json({ error: 'user_not_found' }, 404);
  return c.json({ ok: true });
});

// ───── Encarregados ─────
adminRoutes.get('/guardians', adminOnly, async (c) => {
  const school_id = c.get('user').school_id;
  const db = c.env.DB;
  const guardians = await all<{ id: number }>(db, "SELECT id, name, username, email, phone, active FROM users WHERE school_id = ? AND role = 'guardian' ORDER BY name", school_id);
  if (!guardians.length) return c.json([]);
  const ids = guardians.map((g) => g.id);
  const links = await all<{ guardian_id: number; id: number; name: string }>(db,
    `SELECT g.guardian_id, s.id, s.name FROM guardian_students g JOIN students s ON s.id = g.student_id WHERE g.guardian_id IN (${marks(ids.length)})`, ...ids);
  const subs = await all<{ user_id: number; n: number }>(db, `SELECT user_id, COUNT(id) AS n FROM push_subscriptions WHERE user_id IN (${marks(ids.length)}) GROUP BY user_id`, ...ids);
  return c.json(guardians.map((g) => ({
    ...g,
    students: links.filter((l) => l.guardian_id === g.id).map((l) => ({ id: l.id, name: l.name })),
    push_devices: Number(subs.find((s) => s.user_id === g.id)?.n ?? 0),
  })));
});

adminRoutes.put('/guardians/:id/students', adminOnly, async (c) => {
  const id = idParam(c.req.param('id'));
  const { student_ids } = z.object({ student_ids: z.array(z.number().int()) }).parse(await c.req.json());
  const school_id = c.get('user').school_id;
  const db = c.env.DB;
  if (!(await first(db, "SELECT id FROM users WHERE id = ? AND school_id = ? AND role = 'guardian'", id, school_id))) return c.json({ error: 'user_not_found' }, 404);
  const owned = student_ids.length ? await all(db, `SELECT id FROM students WHERE school_id = ? AND id IN (${marks(student_ids.length)})`, school_id, ...student_ids) : [];
  if (owned.length !== student_ids.length) return c.json({ error: 'invalid_students' }, 400);
  // batch = tudo ou nada.
  await db.batch([
    stmt(db, 'DELETE FROM guardian_students WHERE guardian_id = ?', id),
    ...student_ids.map((sid) => stmt(db, 'INSERT INTO guardian_students (guardian_id, student_id) VALUES (?, ?)', id, sid)),
  ]);
  return c.json({ ok: true });
});

// ───── Alunos (edição) ─────
adminRoutes.patch('/students/:id', adminOnly, async (c) => {
  const id = idParam(c.req.param('id'));
  const body = z.object({ name: z.string().trim().min(1).max(120).optional(), class_id: z.number().int().nullable().optional(), active: z.boolean().optional() }).parse(await c.req.json());
  const school_id = c.get('user').school_id;
  const db = c.env.DB;
  if (body.class_id != null && !(await first(db, 'SELECT id FROM classes WHERE id = ? AND school_id = ?', body.class_id, school_id))) return c.json({ error: 'invalid_class' }, 400);
  const r = await run(db,
    `UPDATE students SET name = COALESCE(?, name), class_id = CASE WHEN ? THEN ? ELSE class_id END, active = COALESCE(?, active), updated_at = datetime('now')
     WHERE id = ? AND school_id = ?`,
    body.name ?? null, 'class_id' in body, body.class_id ?? null, body.active ?? null, id, school_id);
  if (!r.meta.changes) return c.json({ error: 'student_not_found' }, 404);
  return c.json({ ok: true });
});

// ───── Importar alunos (CSV já lido no navegador) ─────
// Cria turmas que faltem, alunos e encarregados (reaproveita o encarregado pelo email ou, sem email, pelo nome).
adminRoutes.post('/import/students', adminOnly, async (c) => {
  const body = z.object({
    rows: z.array(z.object({
      name: z.string().trim().min(1).max(120),
      class: z.string().trim().max(60).optional(),
      card_uid: z.string().trim().max(32).optional(),
      guardian_name: z.string().trim().max(120).optional(),
      guardian_email: email,
    })).min(1).max(500),
  }).parse(await c.req.json());
  const school_id = c.get('user').school_id!;
  const db = c.env.DB;
  const classes = new Map((await all<{ id: number; name: string }>(db, 'SELECT id, name FROM classes WHERE school_id = ?', school_id)).map((r) => [r.name.toLowerCase(), r.id] as [string, number]));
  const result = { students: 0, classes: 0, guardians: 0, links: 0, credentials: [] as { name: string; username: string; temporary_password: string }[], errors: [] as { row: number; name: string; error: string }[] };
  const known = new Map<string, number>(); // email ou nome do encarregado → id

  for (const [i, r] of body.rows.entries()) {
    try {
      let class_id: number | null = null;
      if (r.class) {
        const key = r.class.toLowerCase();
        class_id = classes.get(key) ?? null;
        if (class_id === null) { class_id = await insert(db, 'INSERT INTO classes (school_id, name) VALUES (?, ?)', school_id, r.class); classes.set(key, class_id); result.classes++; }
      }
      const sid = await insert(db, 'INSERT INTO students (school_id, class_id, name, card_uid) VALUES (?, ?, ?, ?)', school_id, class_id, r.name, normalizeCard(r.card_uid));
      result.students++;

      const gEmail = r.guardian_email?.toLowerCase();
      const key = gEmail ?? (r.guardian_name ? `nome:${r.guardian_name.toLowerCase()}` : null);
      if (key) {
        let gid = known.get(key);
        if (!gid && gEmail) {
          const found = await first<{ id: number; role: string; school_id: number | null }>(db, 'SELECT id, role, school_id FROM users WHERE email = ?', gEmail);
          if (found && (found.role !== 'guardian' || found.school_id !== school_id)) throw new Error('email_in_use');
          if (found) gid = found.id;
        }
        if (!gid) {
          const name = r.guardian_name || gEmail!;
          const temp = tempPassword();
          const user = await uniqueUsername(db, name);
          gid = await insert(db, "INSERT INTO users (school_id, name, username, email, role, password_hash) VALUES (?, ?, ?, ?, 'guardian', ?)", school_id, name, user, gEmail ?? null, await hashPassword(temp));
          result.guardians++;
          result.credentials.push({ name, username: user, temporary_password: temp });
        }
        known.set(key, gid);
        await run(db, 'INSERT OR IGNORE INTO guardian_students (guardian_id, student_id) VALUES (?, ?)', gid, sid);
        result.links++;
      }
    } catch (e) {
      result.errors.push({ row: i + 1, name: r.name, error: isDup(e) ? 'card_in_use' : (e as Error)?.message === 'email_in_use' ? 'email_in_use' : 'invalid' });
    }
  }
  return c.json(result);
});

// ───── Dispositivos ─────
adminRoutes.get('/devices', adminOnly, async (c) =>
  c.json(await all(c.env.DB, 'SELECT id, name, location, active, last_seen_at FROM devices WHERE school_id = ? ORDER BY id DESC', c.get('user').school_id)));

// ───── Histórico e relatório ─────
const filters = z.object({
  from: z.string().date().optional(), to: z.string().date().optional(),
  type: z.enum(['entry', 'lunch', 'exit', 'incident']).optional(), student_id: z.coerce.number().int().optional(),
});
// Teto da listagem do histórico; o relatório CSV vai até 50 000.
const EVENTS_LIMIT = 2000;

function eventsQuery(c: { get: (k: 'user') => { sub: number; role: string; school_id: number | null } }, q: z.infer<typeof filters>, limit: number) {
  const { sub, role, school_id } = c.get('user');
  const where = ['e.school_id = ?'];
  const params: unknown[] = [school_id];
  if (role === 'teacher') { where.push('c.teacher_id = ?'); params.push(sub); }
  if (q.from) { where.push('e.local_date >= ?'); params.push(q.from); }
  if (q.to) { where.push('e.local_date <= ?'); params.push(q.to); }
  if (q.type) { where.push('e.type = ?'); params.push(q.type); }
  if (q.student_id) { where.push('e.student_id = ?'); params.push(q.student_id); }
  return {
    sql: `SELECT e.id, e.type, e.note, e.late, e.tapped_at, e.local_date, s.id AS student_id, s.name AS student_name, c.name AS class_name
          FROM events e JOIN students s ON s.id = e.student_id LEFT JOIN classes c ON c.id = s.class_id
          WHERE ${where.join(' AND ')} ORDER BY e.tapped_at DESC LIMIT ${limit}`,
    params,
  };
}

adminRoutes.get('/events', staff, async (c) => {
  const q = eventsQuery(c, filters.parse(c.req.query()), EVENTS_LIMIT);
  const [rows, tz] = await Promise.all([all<{ tapped_at: string }>(c.env.DB, q.sql, ...q.params), schoolTz(c.env.DB, c.get('user').school_id)]);
  return c.json(rows.map((r) => ({ ...r, local_time: utcToLocalHHMM(r.tapped_at, tz) })));
});

adminRoutes.get('/reports/attendance.csv', adminOnly, async (c) => {
  const q = eventsQuery(c, filters.parse(c.req.query()), 50_000);
  const [rows, tz] = await Promise.all([all<Record<string, string>>(c.env.DB, q.sql, ...q.params), schoolTz(c.env.DB, c.get('user').school_id)]);
  const names: Record<string, string> = { entry: 'Entrada', lunch: 'Almoço', exit: 'Saída', incident: 'Ocorrência' };
  const lines = [['Data', 'Hora', 'Aluno', 'Turma', 'Tipo', 'Atraso', 'Nota'].join(';')];
  for (const r of rows) {
    lines.push([r.local_date, utcToLocalHHMM(r.tapped_at, tz), r.student_name, r.class_name ?? '', names[r.type], Number(r.late) ? 'Sim' : '', r.note ?? ''].map(csvCell).join(';'));
  }
  return c.body('﻿' + lines.join('\n'), 200, { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="presencas.csv"' });
});

// ───── Plataforma (super_admin) ─────
adminRoutes.get('/schools', requireRole('super_admin'), async (c) =>
  c.json(await all(c.env.DB,
    `SELECT s.id, s.name, s.slug, s.active, s.created_at,
       (SELECT COUNT(*) FROM students st WHERE st.school_id = s.id) AS students,
       (SELECT COUNT(*) FROM devices d WHERE d.school_id = s.id) AS devices
     FROM schools s ORDER BY s.name`)));

adminRoutes.patch('/schools/:id', requireRole('super_admin'), async (c) => {
  const { active } = z.object({ active: z.boolean() }).parse(await c.req.json());
  await run(c.env.DB, "UPDATE schools SET active = ?, updated_at = datetime('now') WHERE id = ?", active, idParam(c.req.param('id')));
  return c.json({ ok: true });
});
