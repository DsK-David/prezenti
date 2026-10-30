-- O bloqueio de login passa a contar por utilizador + IP, para ninguém trancar contas alheias.
ALTER TABLE login_failures ADD COLUMN ip TEXT NOT NULL DEFAULT '';
CREATE INDEX login_failures_ip ON login_failures (ip, username, at);
