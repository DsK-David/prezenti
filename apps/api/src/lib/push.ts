import crypto from 'node:crypto';
import webpush from 'web-push';
import { db } from '../db.js';
import { env } from '../env.js';

const enabled = Boolean(env.vapid.publicKey && env.vapid.privateKey);
if (enabled) webpush.setVapidDetails(env.vapid.subject, env.vapid.publicKey, env.vapid.privateKey);

export const hashEndpoint = (endpoint: string) =>
  crypto.createHash('sha256').update(endpoint).digest('hex');

/**
 * Envia push aos encarregados do aluno e regista cada resultado em notification_log.
 * O texto é decidido por quem chama; ocorrências usam texto genérico (ecrã bloqueado).
 */
export async function notifyGuardians(
  eventId: number,
  studentId: number,
  payload: { title: string; body: string; url?: string },
) {
  if (!enabled) return;
  const subs = await db('push_subscriptions as p')
    .join('guardian_students as g', 'g.guardian_id', 'p.user_id')
    .where('g.student_id', studentId)
    .select('p.id', 'p.user_id', 'p.endpoint', 'p.p256dh', 'p.auth');

  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify(payload),
          { TTL: 3600, urgency: 'high' },
        );
        await db('notification_log').insert({
          event_id: eventId, user_id: s.user_id, channel: 'push', status: 'sent',
        });
      } catch (err: any) {
        const gone = err?.statusCode === 404 || err?.statusCode === 410;
        if (gone) await db('push_subscriptions').where({ id: s.id }).del();
        await db('notification_log').insert({
          event_id: eventId,
          user_id: s.user_id,
          channel: 'push',
          status: gone ? 'expired' : 'failed',
          error: String(err?.body || err?.message || err?.code || err).slice(0, 255),
        });
      }
    }),
  );
}
