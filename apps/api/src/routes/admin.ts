import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../db.js';
import { requireRole } from '../auth.js';
import { localParts, utcToLocalHHMM } from '../lib/time.js';
import { daySummary } from '../lib/day.js';

const staff = requireRole('admin', 'teacher');
const adminOnly = requireRole('admin');
const anyUser = requireRole('admin', 'teacher', 'guardian', 'super_admin');
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const tempPassword = () => crypto.randomBytes(5).toString('hex');
const isDup = (e: any) => e?.code === 'ER_DUP_ENTRY';

const csvCell = (v: unknown) => {
  const s = v == null ? '' : String(v);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export async function adminRoutes(app: FastifyInstance) {
  // ───── Eu ─────
  app.get('/me', { preHandler: anyUser }, async (req) => {
    const u = await db('users').where({ id: req.user.sub }).first('id', 'name', 'email', 'role', 'school_id');
    const consent = u.role === 'guardian'
      ? !!(await db('consents').where({ guardian_id: u.id }).first('id'))
      : true;
    const school = u.school_id ? await db('schools').where({ id: u.school_id }).first('name') : null;
    return { ...u, consented: consent, school_name: school?.name ?? null };
  });

  app.post('/me/consent', { preHandler: requireRole('guardian') }, async (req) => {
    const kids = await db('guardian_students').where({ guardian_id: req.user.sub }).pluck('student_id');
    if (kids.length) {
      await db('consents')
        .insert(kids.map((student_id) => ({ guardian_id: req.user.sub, student_id, version: '1' })))
        .onConflict().ignore();
    }
    return { ok: true };
  });

  app.post('/auth/change-password', { preHandler: anyUser }, async (req, reply) => {
    const body = z.object({ current: z.string().min(1), next: z.string().min(8).max(100) }).parse(req.body);
    const u = await db('users').where({ id: req.user.sub }).first('password_hash');
    if (!u?.password_hash || !(await bcrypt.compare(body.current, u.password_hash))) {
      return reply.code(400).send({ error: 'wrong_password' });
    }
    await db('users').where({ id: req.user.sub }).update({ password_hash: await bcrypt.hash(body.next, 10) });
    return { ok: true };
  });

  // ───── Definições da escola ─────
  app.get('/school', { preHandler: staff }, async (req) =>
    db('schools').where({ id: req.user.school_id }).first('id', 'name', 'timezone', 'min_exit_time', 'late_after'));

  app.put('/school', { preHandler: adminOnly }, async (req) => {
    const body = z.object({ name: z.string().min(1).max(120), min_exit_time: hhmm, late_after: hhmm }).parse(req.body);
    await db('schools').where({ id: req.user.school_id }).update(body);
    return { ok: true };
  });

  // ───── Turmas ─────
  app.get('/classes', { preHandler: staff }, async (req) => {
    const q = db('classes as c')
      .leftJoin('users as u', 'u.id', 'c.teacher_id')
      .leftJoin('students as s', function () { this.on('s.class_id', 'c.id').andOn('s.active', db.raw('1')); })
      .where('c.school_id', req.user.school_id)
      .groupBy('c.id', 'c.name', 'c.teacher_id', 'u.name')
      .orderBy('c.name')
      .select('c.id', 'c.name', 'c.teacher_id', 'u.name as teacher_name')
      .count({ students: 's.id' });
    if (req.user.role === 'teacher') q.where('c.teacher_id', req.user.sub);
    return (await q).map((r: any) => ({ ...r, students: Number(r.students) }));
  });

  const teacherOk = async (school_id: number | null, id: number | null | undefined) =>
    id == null || !!(await db('users').where({ id, school_id, role: 'teacher' }).first('id'));

  app.post('/classes', { preHandler: adminOnly }, async (req, reply) => {
    const body = z.object({ name: z.string().min(1).max(60), teacher_id: z.number().int().nullable().optional() }).parse(req.body);
    const school_id = req.user.school_id;
    if (!(await teacherOk(school_id, body.teacher_id))) return reply.code(400).send({ error: 'invalid_teacher' });
    try {
      const [id] = await db('classes').insert({ school_id, name: body.name, teacher_id: body.teacher_id ?? null });
      return reply.code(201).send({ id });
    } catch (e) {
      if (isDup(e)) return reply.code(409).send({ error: 'class_exists' });
      throw e;
    }
  });

  app.patch('/classes/:id', { preHandler: adminOnly }, async (req, reply) => {
    const { id } = z.object({ id: z.coerce.number().int() }).parse(req.params);
    const body = z.object({ name: z.string().min(1).max(60).optional(), teacher_id: z.number().int().nullable().optional() }).parse(req.body);
    if (!(await teacherOk(req.user.school_id, body.teacher_id))) return reply.code(400).send({ error: 'invalid_teacher' });
    try {
      const n = await db('classes').where({ id, school_id: req.user.school_id }).update(body);
      if (!n) return reply.code(404).send({ error: 'class_not_found' });
    } catch (e) {
      if (isDup(e)) return reply.code(409).send({ error: 'class_exists' });
      throw e;
    }
    return { ok: true };
  });

  app.delete('/classes/:id', { preHandler: adminOnly }, async (req) => {
    const { id } = z.object({ id: z.coerce.number().int() }).parse(req.params);
    await db('classes').where({ id, school_id: req.user.school_id }).del();
    return { ok: true };
  });

  // Alunos de uma turma, quem chegou hoje e a presença dos últimos dias letivos.
  // O professor só abre as suas turmas; o gestor abre qualquer uma.
  app.get('/classes/:id/attendance', { preHandler: staff }, async (req, reply) => {
    const { id } = z.object({ id: z.coerce.number().int() }).parse(req.params);
    const { days } = z.object({ days: z.coerce.number().int().min(3).max(31).default(10) }).parse(req.query);
    const { sub, role, school_id } = req.user;
    const cls = await db('classes').where({ id, school_id }).first('id', 'name', 'teacher_id');
    if (!cls || (role === 'teacher' && cls.teacher_id !== sub)) return reply.code(404).send({ error: 'class_not_found' });

    const school = await db('schools').where({ id: school_id }).first('timezone', 'late_after');
    const tz = school.timezone;
    const today = localParts(new Date(), tz).date;
    const from = localParts(new Date(Date.now() - (days - 1) * 864e5), tz).date;
    const students = await db('students').where({ school_id, class_id: id, active: 1 }).orderBy('name').select('id', 'name', 'photo_url');
    const evs = students.length
      ? await db('events').whereIn('student_id', students.map((s) => s.id)).where('local_date', '>=', from).select('student_id', 'type', 'late', 'tapped_at', 'local_date')
      : [];
    // Dias letivos: aqueles em que a escola registou alguma entrada (fins de semana ficam de fora).
    const schoolDays: string[] = await db('events').where({ school_id, type: 'entry' }).where('local_date', '>=', from).groupBy('local_date').pluck('local_date');
    const dayList = [...new Set([...schoolDays, today])].sort();

    return {
      class: { id: cls.id, name: cls.name },
      today,
      late_after: school.late_after,
      days: dayList,
      students: students.map((s) => {
        const mine = evs.filter((e: any) => e.student_id === s.id) as any[];
        const history = dayList.map((date) => {
          const entry = mine.find((e) => e.local_date === date && e.type === 'entry');
          return { date, status: entry ? (entry.late ? 'late' : 'present') : date === today ? 'pending' : 'absent' };
        });
        return { ...s, ...daySummary(mine.filter((e) => e.local_date === today), tz), history };
      }),
    };
  });

  // ───── Professores ─────
  app.get('/teachers', { preHandler: adminOnly }, async (req) =>
    db('users').where({ school_id: req.user.school_id, role: 'teacher' }).orderBy('name').select('id', 'name', 'email', 'active'));

  app.post('/teachers', { preHandler: adminOnly }, async (req, reply) => {
    const body = z.object({ name: z.string().min(1), email: z.string().email() }).parse(req.body);
    const temp = tempPassword();
    try {
      const [id] = await db('users').insert({
        school_id: req.user.school_id, name: body.name, email: body.email.toLowerCase(),
        role: 'teacher', password_hash: await bcrypt.hash(temp, 10),
      });
      return reply.code(201).send({ id, temporary_password: temp });
    } catch (e) {
      if (isDup(e)) return reply.code(409).send({ error: 'email_in_use' });
      throw e;
    }
  });

  // Nova senha temporária para professor ou encarregado da mesma escola.
  app.post('/users/:id/reset-password', { preHandler: adminOnly }, async (req, reply) => {
    const { id } = z.object({ id: z.coerce.number().int() }).parse(req.params);
    const temp = tempPassword();
    const n = await db('users').where({ id, school_id: req.user.school_id }).whereIn('role', ['teacher', 'guardian'])
      .update({ password_hash: await bcrypt.hash(temp, 10) });
    if (!n) return reply.code(404).send({ error: 'user_not_found' });
    return { temporary_password: temp };
  });

  app.patch('/users/:id', { preHandler: adminOnly }, async (req, reply) => {
    const { id } = z.object({ id: z.coerce.number().int() }).parse(req.params);
    const { active } = z.object({ active: z.boolean() }).parse(req.body);
    const n = await db('users').where({ id, school_id: req.user.school_id }).whereIn('role', ['teacher', 'guardian']).update({ active });
    if (!n) return reply.code(404).send({ error: 'user_not_found' });
    return { ok: true };
  });

  // ───── Encarregados ─────
  app.get('/guardians', { preHandler: adminOnly }, async (req) => {
    const school_id = req.user.school_id;
    const guardians = await db('users').where({ school_id, role: 'guardian' }).orderBy('name').select('id', 'name', 'email', 'phone', 'active');
    const links = await db('guardian_students as g').join('students as s', 's.id', 'g.student_id')
      .whereIn('g.guardian_id', guardians.map((g) => g.id)).select('g.guardian_id', 's.id', 's.name');
    const subs = await db('push_subscriptions').whereIn('user_id', guardians.map((g) => g.id)).select('user_id').count({ n: 'id' }).groupBy('user_id');
    return guardians.map((g) => ({
      ...g,
      students: links.filter((l) => l.guardian_id === g.id).map((l) => ({ id: l.id, name: l.name })),
      push_devices: Number(subs.find((s: any) => s.user_id === g.id)?.n ?? 0),
    }));
  });

  app.put('/guardians/:id/students', { preHandler: adminOnly }, async (req, reply) => {
    const { id } = z.object({ id: z.coerce.number().int() }).parse(req.params);
    const { student_ids } = z.object({ student_ids: z.array(z.number().int()) }).parse(req.body);
    const school_id = req.user.school_id;
    const g = await db('users').where({ id, school_id, role: 'guardian' }).first('id');
    if (!g) return reply.code(404).send({ error: 'user_not_found' });
    const owned = student_ids.length ? await db('students').where({ school_id }).whereIn('id', student_ids).pluck('id') : [];
    if (owned.length !== student_ids.length) return reply.code(400).send({ error: 'invalid_students' });
    await db.transaction(async (trx) => {
      await trx('guardian_students').where({ guardian_id: id }).del();
      if (owned.length) await trx('guardian_students').insert(owned.map((student_id) => ({ guardian_id: id, student_id })));
    });
    return { ok: true };
  });

  // ───── Alunos (edição) ─────
  app.patch('/students/:id', { preHandler: adminOnly }, async (req, reply) => {
    const { id } = z.object({ id: z.coerce.number().int() }).parse(req.params);
    const body = z.object({
      name: z.string().min(1).optional(), class_id: z.number().int().nullable().optional(), active: z.boolean().optional(),
    }).parse(req.body);
    const school_id = req.user.school_id;
    if (body.class_id != null && !(await db('classes').where({ id: body.class_id, school_id }).first('id'))) {
      return reply.code(400).send({ error: 'invalid_class' });
    }
    const n = await db('students').where({ id, school_id }).update(body);
    if (!n) return reply.code(404).send({ error: 'student_not_found' });
    return { ok: true };
  });


  // ───── Importar alunos (CSV já lido no navegador) ─────
  // Cria turmas que faltem, alunos e encarregados (reaproveita o encarregado se o email já existir).
  app.post('/import/students', { preHandler: adminOnly }, async (req) => {
    const body = z.object({
      rows: z.array(z.object({
        name: z.string().trim().min(1).max(120),
        class: z.string().trim().max(60).optional(),
        card_uid: z.string().trim().max(32).optional(),
        guardian_name: z.string().trim().max(120).optional(),
        guardian_email: z.string().trim().email().optional().or(z.literal('')),
      })).min(1).max(500),
    }).parse(req.body);
    const school_id = req.user.school_id!;
    const classes = new Map<string, number>((await db('classes').where({ school_id }).select('id', 'name')).map((c: any) => [String(c.name).toLowerCase(), c.id] as [string, number]));
    const result = { students: 0, classes: 0, guardians: 0, links: 0, credentials: [] as { name: string; email: string; temporary_password: string }[], errors: [] as { row: number; name: string; error: string }[] };
    const guardianByEmail = new Map<string, number>();

    for (const [i, r] of body.rows.entries()) {
      // Tudo o que a linha cria fica numa transação; só se conta (e só se memoriza) depois de gravar.
      const made = { newClass: null as [string, number] | null, newGuardian: null as { email: string; id: number; name: string; temp: string } | null, linked: false };
      try {
        await db.transaction(async (trx) => {
          let class_id: number | null = null;
          if (r.class) {
            const key = r.class.toLowerCase();
            class_id = classes.get(key) ?? null;
            if (class_id === null) { [class_id] = await trx('classes').insert({ school_id, name: r.class }); made.newClass = [key, class_id!]; }
          }
          const [sid] = await trx('students').insert({ school_id, class_id, name: r.name, card_uid: r.card_uid ? r.card_uid.replace(/[:\s]/g, '').toUpperCase() : null });
          const email = r.guardian_email?.toLowerCase();
          if (email) {
            let gid = guardianByEmail.get(email);
            if (!gid) {
              const found = await trx('users').where({ email }).first('id', 'role', 'school_id');
              if (found && (found.role !== 'guardian' || found.school_id !== school_id)) throw new Error('email_in_use');
              if (found) gid = found.id;
              else {
                const temp = tempPassword();
                const name = r.guardian_name || email;
                [gid] = await trx('users').insert({ school_id, name, email, role: 'guardian', password_hash: await bcrypt.hash(temp, 10) });
                made.newGuardian = { email, id: gid!, name, temp };
              }
            }
            await trx('guardian_students').insert({ guardian_id: gid, student_id: sid }).onConflict().ignore();
            made.linked = true;
            if (!made.newGuardian) guardianByEmail.set(email, gid!);
          }
        });
        result.students++;
        if (made.newClass) { classes.set(made.newClass[0], made.newClass[1]); result.classes++; }
        if (made.newGuardian) {
          guardianByEmail.set(made.newGuardian.email, made.newGuardian.id);
          result.guardians++;
          result.credentials.push({ name: made.newGuardian.name, email: made.newGuardian.email, temporary_password: made.newGuardian.temp });
        }
        if (made.linked) result.links++;
      } catch (e: any) {
        result.errors.push({ row: i + 1, name: r.name, error: e?.code === 'ER_DUP_ENTRY' ? 'card_in_use' : e?.message === 'email_in_use' ? 'email_in_use' : 'invalid' });
      }
    }
    return result;
  });

  // ───── Dispositivos ─────
  app.get('/devices', { preHandler: adminOnly }, async (req) =>
    db('devices').where({ school_id: req.user.school_id }).orderBy('id', 'desc').select('id', 'name', 'location', 'active', 'last_seen_at'));

  // ───── Histórico e relatório ─────
  const eventsQuery = (req: any, q: { from?: string; to?: string; type?: string; student_id?: number }) => {
    const query = db('events as e')
      .join('students as s', 's.id', 'e.student_id')
      .leftJoin('classes as c', 'c.id', 's.class_id')
      .where('e.school_id', req.user.school_id)
      .orderBy('e.tapped_at', 'desc')
      .select('e.id', 'e.type', 'e.note', 'e.late', 'e.tapped_at', 'e.local_date', 's.id as student_id', 's.name as student_name', 'c.name as class_name');
    if (req.user.role === 'teacher') query.where('c.teacher_id', req.user.sub);
    if (q.from) query.where('e.local_date', '>=', q.from);
    if (q.to) query.where('e.local_date', '<=', q.to);
    if (q.type) query.where('e.type', q.type);
    if (q.student_id) query.where('e.student_id', q.student_id);
    return query;
  };
  const filters = z.object({
    from: z.string().date().optional(), to: z.string().date().optional(),
    type: z.enum(['entry', 'lunch', 'exit', 'incident']).optional(), student_id: z.coerce.number().int().optional(),
  });

  const schoolTz = async (school_id: number | null) => (await db('schools').where({ id: school_id }).first('timezone'))?.timezone ?? 'UTC';

  app.get('/events', { preHandler: staff }, async (req) => {
    const [rows, tz] = await Promise.all([eventsQuery(req, filters.parse(req.query)).limit(400), schoolTz(req.user.school_id)]);
    return rows.map((r: any) => ({ ...r, local_time: utcToLocalHHMM(r.tapped_at, tz) }));
  });

  app.get('/reports/attendance.csv', { preHandler: adminOnly }, async (req, reply) => {
    const [rows, tz] = await Promise.all([eventsQuery(req, filters.parse(req.query)).limit(50_000), schoolTz(req.user.school_id)]);
    const names: Record<string, string> = { entry: 'Entrada', lunch: 'Almoço', exit: 'Saída', incident: 'Ocorrência' };
    const lines = [['Data', 'Hora', 'Aluno', 'Turma', 'Tipo', 'Atraso', 'Nota'].join(';')];
    for (const r of rows) {
      lines.push([r.local_date, utcToLocalHHMM(r.tapped_at, tz), r.student_name, r.class_name ?? '', names[r.type], r.late ? 'Sim' : '', r.note ?? ''].map(csvCell).join(';'));
    }
    return reply.header('content-type', 'text/csv; charset=utf-8').header('content-disposition', 'attachment; filename="presencas.csv"').send('﻿' + lines.join('\n'));
  });

  // ───── Plataforma (super_admin) ─────
  app.get('/schools', { preHandler: requireRole('super_admin') }, async () => {
    const schools = await db('schools').orderBy('name').select('id', 'name', 'slug', 'active', 'created_at');
    const count = async (table: string) => {
      const rows = await db(table).select('school_id').count({ n: 'id' }).groupBy('school_id');
      return (id: number) => Number(rows.find((r: any) => r.school_id === id)?.n ?? 0);
    };
    const [students, devices] = await Promise.all([count('students'), count('devices')]);
    return schools.map((s) => ({ ...s, students: students(s.id), devices: devices(s.id) }));
  });

  app.patch('/schools/:id', { preHandler: requireRole('super_admin') }, async (req) => {
    const { id } = z.object({ id: z.coerce.number().int() }).parse(req.params);
    const { active } = z.object({ active: z.boolean() }).parse(req.body);
    await db('schools').where({ id }).update({ active });
    return { ok: true };
  });
}
