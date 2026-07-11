# Rede Mobiliza

Plataforma SaaS multi-tenant de mobilização/engajamento civil. Cada **gabinete**
(tenant) tem seu próprio domínio de dados, marca visual (`corPrimaria`/
`corTextoContraste`) e três perfis de acesso: **super-admin** (gerencia gabinetes),
**admin** (gerencia um gabinete) e **mobilizador** (cadastra pessoas na própria rede e
acompanha demandas atribuídas a ele). Pessoas se cadastram publicamente por um link e
entram na rede do mobilizador que as indicou (ou na "Rede Raiz", sem mobilizador).

Para o histórico completo do projeto, decisões técnicas, pendências conhecidas e
detalhes de deploy, ver [`HANDOFF.md`](./HANDOFF.md).

## Stack

- [Next.js 14](https://nextjs.org) (App Router) + React 18 + TypeScript (strict)
- [Prisma 7](https://www.prisma.io) (`@prisma/adapter-pg`) sobre Postgres
- [Supabase](https://supabase.com) — Auth, Storage e Postgres/RLS
- Tailwind CSS
- [Vitest](https://vitest.dev) para testes
- Deploy: Docker no EasyPanel (VPS Hostinger)

## Como rodar localmente

1. Instale as dependências:

   ```bash
   npm install
   ```

2. Copie `.env.local.example` para `.env.local` e preencha as credenciais (Supabase,
   Resend, etc.):

   ```bash
   cp .env.local.example .env.local
   ```

3. Rode as migrations do Prisma (usa `DIRECT_URL`):

   ```bash
   npx prisma migrate dev
   ```

4. Suba o servidor de desenvolvimento:

   ```bash
   npm run dev
   ```

   Acesse [http://localhost:3000](http://localhost:3000).

## Scripts

| Comando | O que faz |
|---|---|
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` | Build de produção (checa tipos **e** ESLint — o build Docker falha se o lint falhar) |
| `npm start` | Roda o build de produção |
| `npm run lint` | Só o ESLint |
| `npm test` | Roda a suíte de testes (Vitest) uma vez |
| `npm run test:watch` | Vitest em modo watch |

**Atenção:** `tsc --noEmit` e `vitest` não pegam erros de ESLint — sempre rode
`npm run build` completo antes de considerar uma mudança pronta.

## Deploy

Produção: `https://rede-mobiliza-app.azl4mh.easypanel.host/`. O deploy no EasyPanel
**não é automático** — todo `git push` precisa ser seguido de um disparo manual do
webhook de build. Fluxo completo e credenciais em `HANDOFF.md` (seção "Deploy") e na
memória do projeto.
