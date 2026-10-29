import { buildPushPayload } from '@block65/webcrypto-web-push';
import { all, stmt, type DB } from '../db.js';
import type { Bindings } from '../env.js';
import { sha256Hex } from './password.js';

export const hashEndpoint = (endpoint: string) => sha256Hex(endpoint);

/**
 * Envia push aos encarregados do aluno e regista cada resultado em notification_log.
 * O texto é decidido por quem chama; ocorrências usam texto genérico (ecrã bloqueado).
 * Usa só Web Crypto + fetch, por isso corre nos Workers.
 */
export async function notifyGuardians(env: Bindings, eventId: number, studentId: number, payload: { title: string; body: string; url?: string }) {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return;
  const db: DB = env.DB;
  const subs = await all<{ id: number; user_id: number; endpoint: string; p256dh: string; auth: string }>(db,
    `SELECT p.id, p.user_id, p.endpoint, p.p256dh, p.auth FROM push_subscriptions p
     JOIN guardian_students g ON g.guardian_id = p.user_id WHERE g.student_id = ?`, studentId);
  const vapid = { subject: env.VAPID_SUBJECT ?? 'mailto:admin@prezenti.app', publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY };

  await Promise.all(subs.map(async (s) => {
    let status: 'sent' | 'failed' | 'expired' = 'sent';
    let error: string | null = null;
    try {
      const req = await buildPushPayload(
        { data: payload, options: { ttl: 3600, urgency: 'high' } },
        { endpoint: s.endpoint, expirationTime: null, keys: { p256dh: s.p256dh, auth: s.auth } },
        vapid,
      );
      const res = await fetch(s.endpoint, req);
      if (res.status === 404 || res.status === 410) { status = 'expired'; error = `HTTP ${res.status}`; }
      else if (!res.ok) { status = 'failed'; error = `HTTP ${res.status} ${(await res.text()).slice(0, 200)}`; }
    } catch (err) {
      status = 'failed'; error = String((err as Error)?.message ?? err).slice(0, 255);
    }
    const writes = [stmt(db, 'INSERT INTO notification_log (event_id, user_id, channel, status, error) VALUES (?, ?, ?, ?, ?)', eventId, s.user_id, 'push', status, error)];
    if (status === 'expired') writes.push(stmt(db, 'DELETE FROM push_subscriptions WHERE id = ?', s.id));
    await db.batch(writes);
  }));
}

