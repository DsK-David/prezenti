-- Esquema do Prezenti em D1 (SQLite). Datas em UTC como texto "YYYY-MM-DD HH:MM:SS"; booleanos 0/1.

CREATE TABLE schools (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  timezone TEXT NOT NULL DEFAULT 'Atlantic/Cape_Verde',
  -- Saída só é aceite a partir desta hora local (HH:MM), evita saídas por toque duplo.
  min_exit_time TEXT NOT NULL DEFAULT '11:00',
  -- Entrada depois desta hora local conta como atraso.
  late_after TEXT NOT NULL DEFAULT '08:15',
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  -- null = super_admin da plataforma
  school_id INTEGER REFERENCES schools(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  -- Entra-se com o nome de utilizador; o email é só contacto.
  username TEXT NOT NULL UNIQUE,
  email TEXT,
  phone TEXT,
  password_hash TEXT,
  role TEXT NOT NULL CHECK (role IN ('super_admin', 'admin', 'teacher', 'guardian')),
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX users_school_role ON users (school_id, role);

CREATE TABLE classes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  teacher_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE (school_id, name)
);

CREATE TABLE students (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  class_id INTEGER REFERENCES classes(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  photo_url TEXT,
  card_uid TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (school_id, card_uid)
);
CREATE INDEX students_school_class ON students (school_id, class_id);

CREATE TABLE guardian_students (
  guardian_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  relation TEXT,
  PRIMARY KEY (guardian_id, student_id)
);

CREATE TABLE devices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  location TEXT NOT NULL CHECK (location IN ('gate', 'canteen')),
  token_hash TEXT NOT NULL UNIQUE,
  active INTEGER NOT NULL DEFAULT 1,
  last_seen_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('entry', 'lunch', 'exit', 'incident')),
  device_id INTEGER REFERENCES devices(id) ON DELETE SET NULL,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  note TEXT,
  late INTEGER NOT NULL DEFAULT 0,
  -- Hora do toque no aparelho (importante para a fila offline) e dia local da escola.
  tapped_at TEXT NOT NULL,
  local_date TEXT NOT NULL,
  -- Idempotência: o kiosk gera um id por toque e reenvia o mesmo se a rede falhar.
  client_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (device_id, client_id)
);
CREATE INDEX events_school_date ON events (school_id, local_date);
CREATE INDEX events_student_date ON events (student_id, local_date);

CREATE TABLE unknown_cards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  card_uid TEXT NOT NULL,
  device_id INTEGER REFERENCES devices(id) ON DELETE SET NULL,
  seen_at TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at TEXT
);
CREATE INDEX unknown_cards_open ON unknown_cards (school_id, resolved_at);

CREATE TABLE push_subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint_hash TEXT NOT NULL UNIQUE,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Mede a taxa de entrega, que é o critério para estender o piloto.
CREATE TABLE notification_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('push', 'sms')),
  status TEXT NOT NULL CHECK (status IN ('sent', 'failed', 'expired')),
  error TEXT,
  sent_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE consents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guardian_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  version TEXT NOT NULL,
  accepted_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (guardian_id, student_id, version)
);

-- Tentativas de login falhadas, para travar quem tenta adivinhar senhas.
CREATE TABLE login_failures (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL,
  at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX login_failures_user ON login_failures (username, at);
