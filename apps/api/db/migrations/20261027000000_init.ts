import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('schools', (t) => {
    t.increments('id');
    t.string('name').notNullable();
    t.string('slug', 64).notNullable().unique();
    t.string('timezone', 64).notNullable().defaultTo('Atlantic/Cape_Verde');
    // Saída só é aceite a partir desta hora local (HH:MM), evita saídas por toque duplo.
    t.string('min_exit_time', 5).notNullable().defaultTo('11:00');
    // Entrada depois desta hora local conta como atraso.
    t.string('late_after', 5).notNullable().defaultTo('08:15');
    t.boolean('active').notNullable().defaultTo(true);
    t.timestamps(true, true);
  });

  await knex.schema.createTable('users', (t) => {
    t.increments('id');
    // null = super_admin da plataforma
    t.integer('school_id').unsigned().nullable().references('schools.id').onDelete('CASCADE');
    t.string('name').notNullable();
    t.string('email').notNullable().unique();
    t.string('phone', 32).nullable();
    t.string('password_hash').nullable();
    t.enu('role', ['super_admin', 'admin', 'teacher', 'guardian']).notNullable();
    t.boolean('active').notNullable().defaultTo(true);
    t.timestamps(true, true);
    t.index(['school_id', 'role']);
  });

  await knex.schema.createTable('classes', (t) => {
    t.increments('id');
    t.integer('school_id').unsigned().notNullable().references('schools.id').onDelete('CASCADE');
    t.string('name').notNullable();
    t.integer('teacher_id').unsigned().nullable().references('users.id').onDelete('SET NULL');
    t.unique(['school_id', 'name']);
  });

  await knex.schema.createTable('students', (t) => {
    t.increments('id');
    t.integer('school_id').unsigned().notNullable().references('schools.id').onDelete('CASCADE');
    t.integer('class_id').unsigned().nullable().references('classes.id').onDelete('SET NULL');
    t.string('name').notNullable();
    t.string('photo_url', 512).nullable();
    t.string('card_uid', 32).nullable();
    t.boolean('active').notNullable().defaultTo(true);
    t.timestamps(true, true);
    t.unique(['school_id', 'card_uid']);
    t.index(['school_id', 'class_id']);
  });

  await knex.schema.createTable('guardian_students', (t) => {
    t.integer('guardian_id').unsigned().notNullable().references('users.id').onDelete('CASCADE');
    t.integer('student_id').unsigned().notNullable().references('students.id').onDelete('CASCADE');
    t.string('relation', 32).nullable();
    t.primary(['guardian_id', 'student_id']);
  });

  await knex.schema.createTable('devices', (t) => {
    t.increments('id');
    t.integer('school_id').unsigned().notNullable().references('schools.id').onDelete('CASCADE');
    t.string('name').notNullable();
    t.enu('location', ['gate', 'canteen']).notNullable();
    t.string('token_hash', 64).notNullable().unique();
    t.boolean('active').notNullable().defaultTo(true);
    t.timestamp('last_seen_at').nullable();
    t.timestamps(true, true);
  });

  await knex.schema.createTable('events', (t) => {
    t.bigIncrements('id');
    t.integer('school_id').unsigned().notNullable().references('schools.id').onDelete('CASCADE');
    t.integer('student_id').unsigned().notNullable().references('students.id').onDelete('CASCADE');
    t.enu('type', ['entry', 'lunch', 'exit', 'incident']).notNullable();
    t.integer('device_id').unsigned().nullable().references('devices.id').onDelete('SET NULL');
    t.integer('created_by').unsigned().nullable().references('users.id').onDelete('SET NULL');
    t.string('note', 500).nullable();
    t.boolean('late').notNullable().defaultTo(false);
    // Hora do toque no aparelho (importante para a fila offline) e dia local da escola.
    t.timestamp('tapped_at').notNullable();
    t.date('local_date').notNullable();
    // Idempotência: o kiosk gera um id por toque e reenvia o mesmo se a rede falhar.
    t.string('client_id', 64).nullable();
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    t.unique(['device_id', 'client_id']);
    t.index(['school_id', 'local_date']);
    t.index(['student_id', 'local_date']);
  });

  await knex.schema.createTable('unknown_cards', (t) => {
    t.increments('id');
    t.integer('school_id').unsigned().notNullable().references('schools.id').onDelete('CASCADE');
    t.string('card_uid', 32).notNullable();
    t.integer('device_id').unsigned().nullable().references('devices.id').onDelete('SET NULL');
    t.timestamp('seen_at').notNullable().defaultTo(knex.fn.now());
    t.timestamp('resolved_at').nullable();
    t.index(['school_id', 'resolved_at']);
  });

  await knex.schema.createTable('push_subscriptions', (t) => {
    t.increments('id');
    t.integer('user_id').unsigned().notNullable().references('users.id').onDelete('CASCADE');
    t.string('endpoint_hash', 64).notNullable().unique();
    t.text('endpoint').notNullable();
    t.string('p256dh', 255).notNullable();
    t.string('auth', 255).notNullable();
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
  });

  // Mede a taxa de entrega, que é o critério para estender o piloto.
  await knex.schema.createTable('notification_log', (t) => {
    t.bigIncrements('id');
    t.bigInteger('event_id').unsigned().notNullable().references('events.id').onDelete('CASCADE');
    t.integer('user_id').unsigned().notNullable().references('users.id').onDelete('CASCADE');
    t.enu('channel', ['push', 'sms']).notNullable();
    t.enu('status', ['sent', 'failed', 'expired']).notNullable();
    t.string('error', 255).nullable();
    t.timestamp('sent_at').notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('consents', (t) => {
    t.increments('id');
    t.integer('guardian_id').unsigned().notNullable().references('users.id').onDelete('CASCADE');
    t.integer('student_id').unsigned().notNullable().references('students.id').onDelete('CASCADE');
    t.string('version', 16).notNullable();
    t.timestamp('accepted_at').notNullable().defaultTo(knex.fn.now());
    t.unique(['guardian_id', 'student_id', 'version']);
  });
}

export async function down(knex: Knex): Promise<void> {
  for (const t of [
    'consents', 'notification_log', 'push_subscriptions', 'unknown_cards', 'events',
    'devices', 'guardian_students', 'students', 'classes', 'users', 'schools',
  ]) {
    await knex.schema.dropTableIfExists(t);
  }
}
