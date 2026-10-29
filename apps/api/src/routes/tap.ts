import { Hono } from 'hono';
import { z } from 'zod';
import { deviceAuth } from '../auth.js';
import { first } from '../db.js';
import { processTap } from '../lib/tap.js';
import type { AppEnv } from '../env.js';

export const tapRoutes = new Hono<AppEnv>();

// O kiosk confirma o token ao configurar e mostra onde está (nome, portaria/cantina, escola).
tapRoutes.get('/device/me', deviceAuth, async (c) => {
  const row = await first<{ name: string; location: string; school_name: string; school_active: number }>(c.env.DB,
    'SELECT d.name, d.location, s.name AS school_name, s.active AS school_active FROM devices d JOIN schools s ON s.id = d.school_id WHERE d.id = ?',
    c.get('device').id);
  return c.json({ ...row, school_active: !!row?.school_active });
});

tapRoutes.post('/tap', deviceAuth, async (c) => {
  const body = z.object({
    card_uid: z.string().regex(/^[0-9A-Fa-f:]{4,32}$/),
    tapped_at: z.string().datetime().optional(),
    client_id: z.string().max(64).optional(),
  }).parse(await c.req.json());

  const uid = body.card_uid.replace(/:/g, '').toUpperCase();
  // Toques offline trazem a hora real; recusa horas no futuro.
  const tapped = body.tapped_at ? new Date(body.tapped_at) : new Date();
  const tappedAt = tapped.getTime() > Date.now() ? new Date() : tapped;
  return c.json(await processTap(c.env, c.get('device'), uid, tappedAt, body.client_id, (p) => c.executionCtx.waitUntil(p)));
});
