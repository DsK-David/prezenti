# Prezenti

Saiba que chegaram bem. Presenças escolares por cartão NFC, com aviso em tempo real aos encarregados. Multi-escola.

O aluno encosta o cartão num telemóvel Android (portaria ou cantina), o sistema regista o evento e a família recebe a notificação.

## Perfis

| Perfil | O que vê e faz |
|---|---|
| Gestor | Cria turmas, professores, alunos e encarregados (também por CSV), associa cartões, vê a escola em gráficos, exporta relatórios, configura horários e dispositivos |
| Professor | Vê as suas turmas: quem chegou, a lista de alunos e a presença dos últimos dias. Regista ocorrências |
| Encarregado | Vê só os filhos: chegou, chegou atrasado, almoçou, saiu, ocorrências. Recebe notificações |
| Plataforma | Cria e suspende escolas |

## Estrutura

- `apps/web`: Next.js 16 + Tailwind 4 (PWA, kiosk NFC, painéis). Deploy no Cloudflare.
- `apps/api`: Node.js + Fastify + Knex + mysql2 (MySQL 8).

## Desenvolvimento

```bash
# API
cd apps/api
cp .env.example .env        # ajustar DB_*, JWT_SECRET e as chaves VAPID
npx web-push generate-vapid-keys   # colar em VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY
npm install
npm run migrate             # cria o schema
npm run seed                # 2 escolas de demonstração + 14 dias de atividade (APAGA os dados)
npm run dev                 # http://localhost:4000

# Web
cd apps/web
cp .env.example .env.local
npm install
npm run dev                 # http://localhost:3000  (use http://, não https://)
```

Contas de demonstração (senha `prezenti123`): `super@`, `admin1@`, `prof1@`, `pai1@prezenti.app`.

## Notas

- O Web NFC só funciona no Chrome para Android e exige HTTPS. Para testar o kiosk num telemóvel antes do deploy, use um túnel (`cloudflared tunnel --url http://localhost:3000`).
- O push no iPhone só chega com o PWA instalado no ecrã principal (iOS 16.4 ou superior).
- Não corra `next build` com o `next dev` ligado na mesma pasta: os dois escrevem em `.next`.

## Deploy (Cloudflare)

- **Web**: Next.js via `@opennextjs/cloudflare` (Workers).
- **API + MySQL**: o Workers não corre um servidor Node com Knex/mysql2 de forma fiável. A API corre num Node normal (VPS ou Cloudflare Containers), ligada à internet por Cloudflare Tunnel (`api.seudominio.com`), com o MySQL na mesma máquina ou gerido, com backups.
