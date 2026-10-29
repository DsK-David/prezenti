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

Tudo corre no Cloudflare, publicado em **https://prezenti.pages.dev**:

- `apps/web`: Next.js 16 + Tailwind 4 (PWA, kiosk NFC, painéis), exportado como site estático para o Cloudflare Pages.
- `apps/api`: API em Hono sobre **D1** (SQLite), que corre nos Workers. Em produção é a Pages Function `apps/web/functions/api/[[route]].ts`, no mesmo endereço da web (`/api`); em desenvolvimento corre com `wrangler dev`.

Entra-se com **nome de utilizador** e senha. O email é opcional, só para contacto. As contas novas recebem uma senha temporária, mostrada uma vez a quem as cria.

## Desenvolvimento

```bash
npm run install:all
cp apps/api/.dev.vars.example apps/api/.dev.vars   # JWT_SECRET e chaves VAPID locais
cp apps/web/.env.example apps/web/.env.local
npm run db:migrate          # cria o esquema na D1 local
npm run db:seed             # 2 escolas de demonstração + 14 dias de atividade (APAGA os dados locais)
npm run dev                 # API em :4000 e web em http://localhost:3000
```

A web chama a API em `/api`, na mesma origem; o `next dev` encaminha para `API_INTERNAL_URL` (por defeito `http://localhost:4000`). Assim há um só endereço HTTPS para o Web NFC, o PWA e o túnel.

Contas de demonstração locais (senha `prezenti123`): `super`, `admin1`, `prof1`, `pai1`.

Para ver localmente exatamente o que vai para produção (site estático + Function + D1 local): `npm --prefix apps/web run preview:pages` e abrir http://localhost:8788.

## Kiosk NFC e PWA

O kiosk (portaria e cantina) e o botão **Ler cartão** dos formulários usam o **Web NFC**, que só existe no **Chrome para Android** e só em **HTTPS**. No iPhone nenhum browser o tem (a Apple não o implementa); aí o UID escreve-se à mão ou com um leitor USB em modo teclado.

Testar num telemóvel antes do deploy (o túnel publica o servidor de desenvolvimento num endereço `https://….trycloudflare.com`):

```bash
npm run dev       # num terminal
npm run tunnel    # noutro: mostra o endereço https://….trycloudflare.com
```

Instalar o kiosk num Android:

1. No painel, em **Dispositivos**, crie o aparelho (Portaria ou Cantina) e copie o token.
2. No Android, ligue o **NFC** nas definições, abra o Chrome em `https://<endereço>/kiosk` e cole o token.
3. Menu do Chrome → **Instalar app**: fica um ícone **Kiosk** que abre em ecrã inteiro, direto no leitor.
4. Toque em **Iniciar leitura** e aceite o pedido de NFC. Daí em diante o kiosk começa a ler sozinho ao abrir.
5. Para uso diário: **Fixar app** (Definições → Segurança) para o telemóvel não sair do kiosk, tirar o Chrome da otimização de bateria e deixar o carregador ligado.

Sem rede, o kiosk abre na mesma (cópia guardada pelo service worker), guarda os toques e envia-os quando a rede volta.

## Notas

- O push no iPhone só chega com o PWA instalado no ecrã principal (iOS 16.4 ou superior).
- Não corra `next build` com o `next dev` ligado na mesma pasta: os dois escrevem em `.next`.

## Deploy (Cloudflare)

Projeto Pages **prezenti** e base D1 **prezenti** (ID em `apps/web/wrangler.jsonc` e `apps/api/wrangler.jsonc`).

```bash
npm run deploy                                   # gera o site estático e publica no Pages
npm --prefix apps/api run db:migrate:remote      # aplica migrações novas na D1 de produção
```

- **Segredos** (já configurados): `JWT_SECRET`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`. Para trocar: `npx wrangler pages secret put JWT_SECRET --project-name prezenti`, a partir de `apps/web`.
- **Dados de demonstração em produção**: `npm --prefix apps/api run db:seed:remote` **APAGA tudo** e cria as contas com senhas aleatórias em `credenciais.local.md` (fora do git). Não o corra depois de haver dados reais.
- O login tem um limite de 10 senhas erradas por utilizador em 15 minutos.
