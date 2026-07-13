# Staging + Produção separados no EasyPanel — design

> Spec gerada em 2026-07-13, a partir de brainstorming sobre como configurar dois ambientes
> (staging e produção) pro Rede Mobiliza, com deploy automático em staging (gated por testes)
> e promoção manual controlada para produção.

## Contexto e motivação

Hoje existe um único ambiente: o serviço `app` no projeto EasyPanel `rede-mobiliza`, branch
`main`, com deploy manual (`autoDeploy:false`) via push + webhook. Não há como testar uma
mudança "ao vivo" antes de expor pra produção — o próprio HANDOFF.md relata bugs achados só em
smoke test manual pós-deploy (seção 15). O objetivo aqui é abrir um segundo ambiente de teste,
mantendo produção do jeito que está (mesmo domínio `redemobiliza.com.br`/`www` configurado
nesta mesma sessão, mesmo banco Supabase de produção intocado).

## Branches

- `main` — produção. Só recebe código via merge feito pelo script de promoção. Continua
  protegida do jeito que já é hoje (nenhuma mudança de permissão/branch protection nesta spec).
- `develop` — nova branch, criada a partir do `main` atual. É onde o desenvolvimento do dia a
  dia acontece; todo push nela dispara o pipeline de staging.
- A branch `deploy` existente (263 commits atrás de `main`, órfã de uma configuração inicial de
  deploy) não é tocada por esta spec — fica como está, fora de escopo.

## Apps no EasyPanel

### Produção (existente, sem mudança de configuração)
- Projeto `rede-mobiliza`, serviço `app`.
- Branch `main`, `autoDeploy:false`.
- Domínios: `redemobiliza.com.br` + `www.redemobiliza.com.br` (configurados nesta sessão),
  destino customizado (`http://187.77.34.212:8080`) — evita o Bad Gateway de VIP do Docker
  Swarm já documentado no HANDOFF.
- Env vars: as mesmas de hoje (projeto Supabase de produção, `NEXT_PUBLIC_APP_URL` etc.).

### Staging (novo)
- Mesmo projeto EasyPanel `rede-mobiliza`, novo serviço `app-staging`.
- Branch `develop`, `autoDeploy:false` — o deploy não é disparado pelo polling nativo do
  EasyPanel, e sim pelo GitHub Actions (ver pipeline abaixo), depois que os testes passam.
- Domínio: `staging.redemobiliza.com.br`, mesmo padrão de destino customizado (apontando pra
  uma porta própria publicada no host, análoga ao `:8080` da produção — a porta exata é
  definida na implementação, ao criar o serviço).
- Repositório: aponta direto pro repo canônico `renatodf/rede-mobiliza` (não pro espelho
  `redemobiliza` que a produção usa) — elimina a necessidade de duplo push pra staging.
- Env vars: projeto Supabase próprio de staging (ver abaixo), `NEXT_PUBLIC_APP_URL` apontando
  pra `https://staging.redemobiliza.com.br`.

## Banco de dados

- **Produção**: projeto Supabase atual (`hqyirlcmhrfdnzshbniy`), sem mudança.
- **Staging**: projeto Supabase novo e separado, criado manualmente pelo usuário no painel
  Supabase (ação que exige acesso à conta, guiada passo a passo na implementação, mesmo padrão
  usado pra configurar o domínio nesta sessão). Schema aplicado via `prisma migrate deploy`
  contra esse banco novo. Pode ser populado com o `prisma/seed.ts` já existente no repo, já que
  staging não tem dado real.

## Variáveis de ambiente

- `.env.staging` e `.env.production` são arquivos **locais**, adicionados ao `.gitignore` —
  documentam os valores configurados em cada serviço do EasyPanel, e servem pra rodar o app
  localmente apontando pra um ambiente específico quando necessário. **Não são lidos
  automaticamente pelo EasyPanel** — cada serviço mantém sua própria cópia das env vars na
  configuração do EasyPanel, exatamente como já acontece hoje com produção.
- Nenhum segredo novo é versionado no git.

## Pipeline de CI (staging)

Workflow do GitHub Actions (`.github/workflows/deploy-staging.yml`), gatilho: push em `develop`.

1. Checkout, `npm ci`.
2. `npx tsc --noEmit` (typecheck).
3. `npx vitest run` (suíte de testes). O secret `RESEND_API_KEY` é configurado no GitHub Actions
   (mesma chave já usada em produção) especificamente pra isso — sem ele, as 2 falhas
   pré-existentes de `email.test.ts` sempre apareceriam e o gate nunca teria um baseline limpo
   pra comparar. Com o secret, a expectativa é 138/138 passando; qualquer falha real bloqueia
   o deploy de staging.
4. Se os dois passos acima passarem: `curl` no webhook de deploy do serviço `app-staging`
   (token guardado como secret do GitHub `EASYPANEL_STAGING_DEPLOY_HOOK`).
5. Se qualquer passo falhar, o workflow para e staging não é tocado — o código quebrado nunca
   chega a subir.

## Promoção pra produção (`deploy-prod.sh`)

Script local, rodado manualmente pelo usuário quando quiser promover:

1. Garante working tree limpo (aborta se houver mudança não commitada).
2. `git checkout main && git pull origin main`.
3. `git merge develop --no-ff` (merge commit explícito, preserva histórico de que foi uma
   promoção, não um fast-forward silencioso).
4. Roda `tsc --noEmit` + `vitest run` locais antes de dar push (segunda camada de segurança,
   já que produção não passa pelo gate do GitHub Actions).
5. `git push origin main && git push easypanel main` (mesmo padrão dual-remote já usado hoje).
6. `curl` no webhook de deploy da produção (mesmo token já usado nas sessões anteriores).
7. Faz polling na API do EasyPanel (`projects.listProjectsAndServices`) até o `commit.sha` do
   serviço `app` bater com o HEAD de `main`, com timeout — mesma lógica já usada manualmente
   nesta sessão pra confirmar deploys.
8. Se o merge tiver conflito, o script para e avisa — não tenta resolver sozinho.

## Documentação (`DEPLOY.md`)

Novo arquivo na raiz do repo, cobrindo:
- Diagrama do fluxo (local → push `develop` → staging automático → validação manual →
  `deploy-prod.sh` → produção).
- URLs de cada ambiente.
- Como rodar `deploy-prod.sh` e o que esperar em cada etapa.
- Troubleshooting: por que `autoDeploy` fica desligado nos dois serviços, por que os domínios
  usam destino customizado em vez do padrão do EasyPanel (referência ao Bad Gateway já
  documentado no HANDOFF), como checar o status de um deploy via API do EasyPanel.
- Aviso explícito: staging usa banco de dados de teste — nunca colocar dado real lá.

## Fora de escopo

- Não mexe na branch `deploy` órfã existente.
- Não muda nenhuma configuração de branch protection no GitHub (fora do que já existe).
- Não configura preview deploys por PR (só as duas branches fixas, `develop` e `main`).
- Não migra o domínio da produção pra `app.redemobiliza.com.br` (decisão já tomada nesta
  sessão: produção fica em `redemobiliza.com.br`/`www`).
- Criação do projeto Supabase de staging e dos secrets do GitHub Actions são passos manuais
  guiados durante a implementação, não automatizáveis sem acesso interativo do usuário às
  respectivas contas.
