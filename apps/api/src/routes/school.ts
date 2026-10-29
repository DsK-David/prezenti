import { Hono } from 'hono';
import { z } from 'zod';
import { all, first, insert, isDup, marks, run, sqlTime, stmt } from '../db.js';
import { requireRole } from '../auth.js';
import { localParts, utcToLocalHHMM } from '../lib/time.js';
import { notifyGuardians } from '../lib/push.js';
import { hashPassword, randomHex, sha256Hex, tempPassword } from '../lib/password.js';
import { normalizeUsername, uniqueUsername, USERNAME } from '../lib/username.js';
import type { AppEnv } from '../env.js';

const staff = requireRole('admin', 'teacher');
const adminOnly = requireRole('admin');

export const normalizeCard = (v: string | null | undefined) => (v ? v.replace(/[:\s-]/g, '').toUpperCase() : '') || null;
const username = z.string().trim().toLowerCase().regex(USERNAME, 'username');
const email = z.string().trim().email().optional().or(z.literal('').transform(() => undefined));

export const schoolRoutes = new Hono<AppEnv>();

// Presentes, ausentes e atrasados de hoje. Professor só vê as suas turmas.
schoolRoutes.get('/school/today', staff, async (c) => {
  const { sub, role, school_id } = c.get('user');
  const db = c.env.DB;
  const school = await first<{ timezone: string }>(db, 'SELECT timezone FROM schools WHERE id = ?', school_id);
  const tz = school?.timezone ?? 'UTC';
  const date = localParts(new Date(), tz).date;
  const list = await all<{ id: number; name: string; photo_url: string | null; class_id: number | null; class_name: string | null }>(db,
    `SELECT s.id, s.name, s.photo_url, s.class_id, c.name AS class_name FROM students s LEFT JOIN classes c ON c.id = s.class_id
     WHERE s.school_id = ? AND s.active = 1 ${role === 'teacher' ? 'AND c.teacher_id = ?' : ''}`,
    ...(role === 'teacher' ? [school_id, sub] : [school_id]));
  const events = await all<{ student_id: number; type: string; late: number; tapped_at: string }>(db,
    'SELECT student_id, type, late, tapped_at FROM events WHERE school_id = ? AND local_date = ? ORDER BY tapped_at', school_id, date);

  return c.json(list.map((s) => {
    const mine = events.filter((e) => e.student_id === s.id);
    const entry = mine.find((e) => e.type === 'entry');
    const exit = mine.find((e) => e.type === 'exit');
    const lunch = mine.find((e) => e.type === 'lunch');
    return {
      ...s,
      status: exit ? 'left' : entry ? (entry.late ? 'late' : 'present') : 'absent',
      late: !!entry?.late,
      entry_at: entry?.tapped_at ?? null,
      entry_time: utcToLocalHHMM(entry?.tapped_at ?? null, tz),
      lunch: !!lunch,
      lunch_time: utcToLocalHHMM(lunch?.tapped_at ?? null, tz),
      exit_at: exit?.tapped_at ?? null,
      exit_time: utcToLocalHHMM(exit?.tapped_at ?? null, tz),
    };
  }));
});

schoolRoutes.post('/incidents', staff, async (c) => {
  const body = z.object({ student_id: z.number().int(), category: z.enum(['health', 'behavior', 'other']), note: z.string().min(1).max(400) }).parse(await c.req.json());
  const { sub, role, school_id } = c.get('user');
  const db = c.env.DB;
  const student = await first<{ id: number; teacher_id: number | null }>(db,
    'SELECT s.id, c.teacher_id FROM students s LEFT JOIN classes c ON c.id = s.class_id WHERE s.id = ? AND s.school_id = ?', body.student_id, school_id);
  if (!student || (role === 'teacher' && student.teacher_id !== sub)) return c.json({ error: 'student_not_found' }, 404);
  const school = await first<{ timezone: string }>(db, 'SELECT timezone FROM schools WHERE id = ?', school_id);
  const now = new Date();
  const id = await insert(db,
    'INSERT INTO events (school_id, student_id, type, created_by, note, tapped_at, local_date) VALUES (?, ?, ?, ?, ?, ?, ?)',
    school_id, body.student_id, 'incident', sub, `${body.category}: ${body.note}`, sqlTime(now), localParts(now, school?.timezone ?? 'UTC').date);
  // Texto genérico no push: o detalhe (saúde) só aparece dentro do app.
  c.executionCtx.waitUntil(notifyGuardians(c.env, id, body.student_id, { title: 'Prezenti', body: 'Nova ocorrência registada. Abra o app para ver.', url: '/pais' }).catch(() => {}));
  return c.json({ id }, 201);
});

schoolRoutes.get('/students', adminOnly, async (c) =>
  c.json(await all(c.env.DB, 'SELECT * FROM students WHERE school_id = ? ORDER BY name', c.get('user').school_id)));

/**
 * Cria o aluno e, se vier, o encarregado: liga a um encarregado que já existe (pelo nome de utilizador
 * ou pelo email, na mesma escola) ou cria a conta com uma senha temporária devolvida uma só vez.
 */
schoolRoutes.post('/students', adminOnly, async (c) => {
  const body = z.object({
    name: z.string().trim().min(1).max(120),
    class_id: z.number().int().nullable().optional(),
    card_uid: z.string().nullable().optional(),
    guardian: z.object({ name: z.string().trim().max(120).optional(), username: username.optional().or(z.literal('').transform(() => undefined)), email }).optional(),
  }).parse(await c.req.json());
  const school_id = c.get('user').school_id!;
  const db = c.env.DB;
  if (body.class_id != null && !(await first(db, 'SELECT id FROM classes WHERE id = ? AND school_id = ?', body.class_id, school_id))) return c.json({ error: 'invalid_class' }, 400);

  const g = body.guardian && (body.guardian.name || body.guardian.username || body.guardian.email) ? body.guardian : null;
  let guardian: { id: number | null; name: string; username: string; temporary_password?: string; created: boolean } | null = null;
  if (g) {
    const existing = g.username
      ? await first<{ id: number; name: string; username: string; role: string; school_id: number | null }>(db, 'SELECT id, name, username, role, school_id FROM users WHERE username = ?', g.username)
      : g.email ? await first<{ id: number; name: string; username: string; role: string; school_id: number | null }>(db, "SELECT id, name, username, role, school_id FROM users WHERE email = ? AND school_id = ? AND role = 'guardian'", g.email.toLowerCase(), school_id) : null;
    if (existing && (existing.role !== 'guardian' || existing.school_id !== school_id)) return c.json({ error: 'username_in_use' }, 409);
    if (existing) guardian = { id: existing.id, name: existing.name, username: existing.username, created: false };
    else {
      if (!g.name) return c.json({ error: 'guardian_name_required' }, 400);
      guardian = { id: null, name: g.name, username: g.username ?? await uniqueUsername(db, g.name), temporary_password: tempPassword(), created: true };
    }
  }

  let id: number;
  try {
    id = await insert(db, 'INSERT INTO students (school_id, class_id, name, card_uid) VALUES (?, ?, ?, ?)', school_id, body.class_id ?? null, body.name, normalizeCard(body.card_uid));
  } catch (e) {
    if (isDup(e)) return c.json({ error: 'card_in_use' }, 409);
    throw e;
  }
  if (guardian) {
    if (guardian.created) {
      guardian.id = await insert(db, "INSERT INTO users (school_id, name, username, email, role, password_hash) VALUES (?, ?, ?, ?, 'guardian', ?)",
        school_id, guardian.name, guardian.username, g?.email?.toLowerCase() ?? null, await hashPassword(guardian.temporary_password!));
    }
    await run(db, 'INSERT OR IGNORE INTO guardian_students (guardian_id, student_id) VALUES (?, ?)', guardian.id, id);
  }
  return c.json({ id, guardian }, 201);
});

// Associa (ou troca) o cartão de um aluno; resolve o cartão desconhecido correspondente.
schoolRoutes.put('/students/:id/card', adminOnly, async (c) => {
  const id = z.coerce.number().int().parse(c.req.param('id'));
  const { card_uid } = z.object({ card_uid: z.string().min(4) }).parse(await c.req.json());
  const uid = normalizeCard(card_uid);
  const school_id = c.get('user').school_id;
  try {
    const r = await run(c.env.DB, 'UPDATE students SET card_uid = ?, updated_at = datetime(\'now\') WHERE id = ? AND school_id = ?', uid, id, school_id);
    if (!r.meta.changes) return c.json({ error: 'student_not_found' }, 404);
  } catch (e) {
    if (isDup(e)) return c.json({ error: 'card_in_use' }, 409);
    throw e;
  }
  await run(c.env.DB, "UPDATE unknown_cards SET resolved_at = datetime('now') WHERE school_id = ? AND card_uid = ? AND resolved_at IS NULL", school_id, uid);
  return c.json({ ok: true });
});

schoolRoutes.get('/unknown-cards', adminOnly, async (c) =>
  c.json(await all(c.env.DB, 'SELECT * FROM unknown_cards WHERE school_id = ? AND resolved_at IS NULL ORDER BY seen_at DESC LIMIT 100', c.get('user').school_id)));

schoolRoutes.post('/guardians', adminOnly, async (c) => {
  const body = z.object({
    name: z.string().trim().min(1).max(120), username: username.optional(), email, phone: z.string().trim().max(32).optional(),
    student_ids: z.array(z.number().int()).min(1),
  }).parse(await c.req.json());
  const school_id = c.get('user').school_id!;
  const db = c.env.DB;
  const owned = await all<{ id: number }>(db, `SELECT id FROM students WHERE school_id = ? AND id IN (${marks(body.student_ids.length)})`, school_id, ...body.student_ids);
  if (owned.length !== body.student_ids.length) return c.json({ error: 'invalid_students' }, 400);

  // Senha temporária mostrada uma só vez; o encarregado troca-a em Definições.
  const temp = tempPassword();
  const user = body.username ?? await uniqueUsername(db, body.name);
  let id: number;
  try {
    id = await insert(db, "INSERT INTO users (school_id, name, username, email, phone, role, password_hash) VALUES (?, ?, ?, ?, ?, 'guardian', ?)",
      school_id, body.name, user, body.email?.toLowerCase() ?? null, body.phone || null, await hashPassword(temp));
  } catch (e) {
    if (isDup(e)) return c.json({ error: 'username_in_use' }, 409);
    throw e;
  }
  await db.batch(body.student_ids.map((sid) => stmt(db, 'INSERT INTO guardian_students (guardian_id, student_id) VALUES (?, ?)', id, sid)));
  return c.json({ id, username: user, temporary_password: temp }, 201);
});

// O token do kiosk é devolvido uma só vez; só o hash fica na base.
schoolRoutes.post('/devices', adminOnly, async (c) => {
  const body = z.object({ name: z.string().trim().min(1).max(60), location: z.enum(['gate', 'canteen']) }).parse(await c.req.json());
  const token = randomHex(32);
  const id = await insert(c.env.DB, 'INSERT INTO devices (school_id, name, location, token_hash) VALUES (?, ?, ?, ?)',
    c.get('user').school_id, body.name, body.location, await sha256Hex(token));
  return c.json({ id, token }, 201);
});

schoolRoutes.delete('/devices/:id', adminOnly, async (c) => {
  const id = z.coerce.number().int().parse(c.req.param('id'));
  await run(c.env.DB, 'UPDATE devices SET active = 0 WHERE id = ? AND school_id = ?', id, c.get('user').school_id);
  return c.json({ ok: true });
});

// Painel do super_admin: criar escolas com a conta do gestor.
schoolRoutes.post('/schools', requireRole('super_admin'), async (c) => {
  const body = z.object({
    name: z.string().trim().min(1).max(120), slug: z.string().regex(/^[a-z0-9-]+$/),
    admin_name: z.string().trim().min(1).max(120), admin_username: username.optional(), admin_email: email,
  }).parse(await c.req.json());
  const db = c.env.DB;
  const temp = tempPassword();
  const user = body.admin_username ?? await uniqueUsername(db, body.admin_name);
  if (await first(db, 'SELECT id FROM users WHERE username = ?', user)) return c.json({ error: 'username_in_use' }, 409);
  let school_id: number;
  try {
    school_id = await insert(db, 'INSERT INTO schools (name, slug) VALUES (?, ?)', body.name, body.slug);
  } catch (e) {
    if (isDup(e)) return c.json({ error: 'slug_in_use' }, 409);
    throw e;
  }
  await run(db, "INSERT INTO users (school_id, name, username, email, role, password_hash) VALUES (?, ?, ?, ?, 'admin', ?)",
    school_id, body.admin_name, user, body.admin_email?.toLowerCase() ?? null, await hashPassword(temp));
  return c.json({ id: school_id, admin_username: user, admin_temporary_password: temp }, 201);
});
