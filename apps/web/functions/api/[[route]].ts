// Cloudflare Pages Function: tudo o que chega a /api/* vai para a API do Prezenti (Hono + D1),
// no mesmo endereço da web. O código da API vive em apps/api.
import app from '../../../api/src/app';
import type { Bindings } from '../../../api/src/env';

export const onRequest: PagesFunction<Bindings> = (ctx) => app.fetch(ctx.request, ctx.env, ctx);
