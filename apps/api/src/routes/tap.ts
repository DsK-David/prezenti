import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { deviceAuth } from '../auth.js';
import { processTap, type Device } from '../lib/tap.js';

export async function tapRoutes(app: FastifyInstance) {
  app.post('/tap', { preHandler: deviceAuth, config: { rateLimit: { max: 120, timeWindow: '1 minute' } } }, async (req) => {
    const body = z
      .object({
        card_uid: z.string().regex(/^[0-9A-Fa-f:]{4,32}$/),
        tapped_at: z.string().datetime().optional(),
        client_id: z.string().max(64).optional(),
      })
      .parse(req.body);

    const uid = body.card_uid.replace(/:/g, '').toUpperCase();
    // Toques offline trazem a hora real; recusa horas no futuro.
    const tapped = body.tapped_at ? new Date(body.tapped_at) : new Date();
    const tappedAt = tapped.getTime() > Date.now() ? new Date() : tapped;
    return processTap((req as any).device as Device, uid, tappedAt, body.client_id);
  });
}
