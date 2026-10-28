import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../db.js';
import { requireRole, sha256 } from '../auth.js';
import { localParts, utcToLocalHHMM } from '../lib/time.js';
import { notifyGuardians } from '../lib/push.js';

const staff = requireRole('admin', 'teacher');
const adminOnly = requireRole('admin');

export async function schoolRoutes(app: FastifyInstance) {
  // Presentes, ausentes e atrasados de hoje. Professor só vê a sua turma.
  app.get('/school/today', { preHandler: staff }, async (req) => {
    const { sub, role, school_id } = req.user;
    const school = await db('schools').where({ id: school_id }).first();
    const date = localParts(new Date(), school.timezone).date;

    const students = db('students as s')
      .leftJoin('classes as c', 'c.id', 's.class_id')
      .where({ 's.school_id': school_id, 's.active': true })
      .select('s.id', 's.name', 's.photo_url', 's.class_id', 'c.name as class_name');
    if (role === 'teacher') students.where('c.teacher_id', sub);
    const list = await students;

    const events = await db('events')
      .where({ school_id, local_date: date })
      .whereIn('student_id', list.map((s) => s.id))
      .orderBy('tapped_at');

    return list.map((s) => {
      const mine = events.filter((e) => e.student_id === s.id);
      const entry = mine.find((e) => e.type === 'entry');
      const exit = mine.find((e) => e.type === 'exit');
      return {
        ...s,
        status: exit ? 'left' : entry ? (entry.late ? 'late' : 'present') : 'absent',
        late: !!entry?.late,
        entry_at: entry?.tapped_at ?? null,
        entry_time: utcToLocalHHMM(entry?.tapped_at ?? null, school.timezone),
        lunch: mine.some((e) => e.type === 'lunch'),
        exit_at: exit?.tapped_at ?? null,
        exit_time: utcToLocalHHMM(exit?.tapped_at ?? null, school.timezone),
      };
    });
  });

  app.post('/incidents', { preHandler: staff }, async (req, reply) => {
    const body = z
      .object({ student_id: z.number().int(), category: z.enum(['health', 'behavior', 'other']), note: z.string().min(1).max(400) })
      .parse(req.body);
    const { sub, role, school_id } = req.user;

    const student = await db('students as s')
      .leftJoin('classes as c', 'c.id', 's.class_id')
      .where({ 's.id': body.student_id, 's.school_id': school_id })
      .first('s.id', 'c.teacher_id');
    if (!student || (role === 'teacher' && student.teacher_id !== sub)) {
      return reply.code(404).send({ error: 'student_not_found' });
    }

    const school = await db('schools').where({ id: school_id }).first();
    const now = new Date();
    const [id] = await db('events').insert({
      school_id, student_id: body.student_id, type: 'incident', created_by: sub,
      note: `${body.category}: ${body.note}`, tapped_at: now,
      local_date: localParts(now, school.timezone).date,
    });
    // Texto genérico no push: o detalhe (saúde) só aparece dentro do app.
    void notifyGuardians(id, body.student_id, {
      title: 'Prezenti', body: 'Nova ocorrência registada. Abra o app para ver.', url: '/pais',
    });
    return reply.code(201).send({ id });
  });

  app.get('/students', { preHandler: adminOnly }, async (req) =>
    db('students').where({ school_id: req.user.school_id }).orderBy('name'));

  app.post('/students', { preHandler: adminOnly }, async (req, reply) => {
    const body = z
      .object({ name: z.string().min(1), class_id: z.number().int().nullable().optional(), card_uid: z.string().nullable().optional() })
      .parse(req.body);
    const [id] = await db('students').insert({
      school_id: req.user.school_id, name: body.name, class_id: body.class_id ?? null,
      card_uid: body.card_uid?.replace(/:/g, '').toUpperCase() ?? null,
    });
    return reply.code(201).send({ id });
  });

  // Associa (ou troca) o cartão de um aluno; resolve o cartão desconhecido correspondente.
  app.put('/students/:id/card', { preHandler: adminOnly }, async (req, reply) => {
    const { id } = z.object({ id: z.coerce.number().int() }).parse(req.params);
    const { card_uid } = z.object({ card_uid: z.string().min(4) }).parse(req.body);
    const uid = card_uid.replace(/:/g, '').toUpperCase();
    const school_id = req.user.school_id;
    try {
      const n = await db('students').where({ id, school_id }).update({ card_uid: uid });
      if (!n) return reply.code(404).send({ error: 'student_not_found' });
    } catch (e: any) {
      if (e.code === 'ER_DUP_ENTRY') return reply.code(409).send({ error: 'card_in_use' });
      throw e;
    }
    await db('unknown_cards').where({ school_id, card_uid: uid }).whereNull('resolved_at').update({ resolved_at: db.fn.now() });
    return { ok: true };
  });

  app.get('/unknown-cards', { preHandler: adminOnly }, async (req) =>
    db('unknown_cards').where({ school_id: req.user.school_id }).whereNull('resolved_at').orderBy('seen_at', 'desc').limit(100));

  app.post('/guardians', { preHandler: adminOnly }, async (req, reply) => {
    const body = z
      .object({ name: z.string().min(1), email: z.string().email(), phone: z.string().optional(), student_ids: z.array(z.number().int()).min(1) })
      .parse(req.body);
    const school_id = req.user.school_id!;
    const owned = await db('students').where({ school_id }).whereIn('id', body.student_ids).pluck('id');
    if (owned.length !== body.student_ids.length) return reply.code(400).send({ error: 'invalid_students' });

    // Senha temporária mostrada uma só vez; o pai deve trocá-la (OTP por email fica para a próxima fase).
    const temp = crypto.randomBytes(5).toString('hex');
    let id: number;
    try {
      [id] = await db('users').insert({
        school_id, name: body.name, email: body.email.toLowerCase(), phone: body.phone ?? null,
        role: 'guardian', password_hash: await bcrypt.hash(temp, 10),
      });
    } catch (e: any) {
      if (e.code === 'ER_DUP_ENTRY') return reply.code(409).send({ error: 'email_in_use' });
      throw e;
    }
    await db('guardian_students').insert(body.student_ids.map((student_id) => ({ guardian_id: id, student_id })));
    return reply.code(201).send({ id, temporary_password: temp });
  });

  // O token do kiosk é devolvido uma só vez; só o hash fica na base.
  app.post('/devices', { preHandler: adminOnly }, async (req, reply) => {
    const body = z.object({ name: z.string().min(1), location: z.enum(['gate', 'canteen']) }).parse(req.body);
    const token = crypto.randomBytes(32).toString('hex');
    const [id] = await db('devices').insert({
      school_id: req.user.school_id, name: body.name, location: body.location, token_hash: sha256(token),
    });
    return reply.code(201).send({ id, token });
  });

  app.delete('/devices/:id', { preHandler: adminOnly }, async (req) => {
    const { id } = z.object({ id: z.coerce.number().int() }).parse(req.params);
    await db('devices').where({ id, school_id: req.user.school_id }).update({ active: false });
    return { ok: true };
  });

  // Painel do super_admin: criar escolas.
  app.post('/schools', { preHandler: requireRole('super_admin') }, async (req, reply) => {
    const body = z
      .object({ name: z.string().min(1), slug: z.string().regex(/^[a-z0-9-]+$/), admin_name: z.string(), admin_email: z.string().email() })
      .parse(req.body);
    const temp = crypto.randomBytes(5).toString('hex');
    const school_id = await db.transaction(async (trx) => {
      const [sid] = await trx('schools').insert({ name: body.name, slug: body.slug });
      await trx('users').insert({
        school_id: sid, name: body.admin_name, email: body.admin_email.toLowerCase(),
        role: 'admin', password_hash: await bcrypt.hash(temp, 10),
      });
      return sid;
    });
    return reply.code(201).send({ id: school_id, admin_temporary_password: temp });
  });
}
