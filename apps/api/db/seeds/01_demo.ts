import bcrypt from 'bcryptjs';
import type { Knex } from 'knex';

// Dados de demonstração: duas escolas para validar o isolamento entre elas.
export async function seed(knex: Knex): Promise<void> {
  await knex.raw('SET FOREIGN_KEY_CHECKS = 0');
  for (const t of ['notification_log', 'consents', 'push_subscriptions', 'unknown_cards', 'events', 'devices', 'guardian_students', 'students', 'classes', 'users', 'schools']) {
    await knex(t).truncate();
  }
  await knex.raw('SET FOREIGN_KEY_CHECKS = 1');

  const hash = await bcrypt.hash('prezenti123', 10);
  await knex('users').insert({ name: 'Super Admin', email: 'super@prezenti.app', role: 'super_admin', password_hash: hash });

  for (const [i, name] of ['Escola Piloto', 'Escola Demo B'].entries()) {
    const [sid] = await knex('schools').insert({ name, slug: i === 0 ? 'piloto' : 'demo-b' });
    const [admin] = await knex('users').insert({ school_id: sid, name: `Gestor ${i + 1}`, email: `admin${i + 1}@prezenti.app`, role: 'admin', password_hash: hash });
    const [teacher] = await knex('users').insert({ school_id: sid, name: `Prof. ${i + 1}`, email: `prof${i + 1}@prezenti.app`, role: 'teacher', password_hash: hash });
    const [cls] = await knex('classes').insert({ school_id: sid, name: '1.º A', teacher_id: teacher });
    const [stu] = await knex('students').insert({ school_id: sid, class_id: cls, name: `Aluno Teste ${i + 1}`, card_uid: `04A1B2C3D4E5${i}0` });
    const [guardian] = await knex('users').insert({ school_id: sid, name: `Pai ${i + 1}`, email: `pai${i + 1}@prezenti.app`, role: 'guardian', password_hash: hash });
    await knex('guardian_students').insert({ guardian_id: guardian, student_id: stu });
    void admin;
  }
}
