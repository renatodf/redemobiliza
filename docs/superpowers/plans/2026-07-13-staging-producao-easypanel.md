# Staging + Produção separados no EasyPanel — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Abrir um segundo ambiente (`staging.redemobiliza.com.br`) com deploy automático gated por testes, mantendo a produção atual intocada, e dar ao usuário um script local (`deploy-prod.sh`) pra promover `develop` → `main` sob demanda.

**Architecture:** Novo serviço EasyPanel `app-staging` (mesmo projeto `rede-mobiliza`), branch `develop`, apontando direto pro repo canônico `renatodf/rede-mobiliza` (não pro espelho). GitHub Actions roda testes a cada push em `develop` e, se passar, dispara o webhook de deploy do EasyPanel. Produção continua manual (`autoDeploy:false`, branch `main`, webhook disparado só pelo `deploy-prod.sh`).

**Tech Stack:** Next.js 14 / Prisma 7 / Supabase / EasyPanel (API tRPC) / GitHub Actions / bash.

## Global Constraints

- Não mexer na branch `deploy` órfã existente (fora de escopo, spec seção "Fora de escopo").
- Não mudar a configuração do serviço `app` (produção) — domínios, branch, env — exceto o que for explicitamente listado numa task.
- Nenhum segredo novo entra no git. `.env.staging`/`.env.production` vão pro `.gitignore`.
- Staging nunca recebe dado real — só schema migrado + seed de teste.
- Toda chamada à API do EasyPanel usa o padrão descoberto nesta sessão: `POST http://187.77.34.212:3000/api/trpc/<procedure>` com corpo `{"json": {...}}` (sem batch), header `authorization: <token de sessão>` obtido via `auth.login`.

---

### Task 1: Branch `develop`

**Files:** nenhum arquivo, só operação git.

- [ ] **Step 1: Criar e enviar a branch**

```bash
git checkout main
git pull origin main
git checkout -b develop
git push origin develop
```

- [ ] **Step 2: Confirmar**

Run: `git branch -a | grep develop`
Expected: lista `develop` e `remotes/origin/develop`.

---

### Task 2: Projeto Supabase de staging (passo manual guiado)

**Files:** nenhum — ação no painel do usuário, eu só oriento e depois capturo as chaves.

- [ ] **Step 1: Orientar a criação**

Pedir ao usuário pra criar em https://supabase.com/dashboard/new (conta já logada, mesma usada no projeto de produção):
- Nome: `rede-mobiliza-staging`
- Região: `South America (São Paulo)` (mesma da produção — `sa-east-1`)
- Plano: Free/Nano
- Senha do banco: gerar uma forte e anotar (vai compor `DATABASE_URL`)

- [ ] **Step 2: Capturar as credenciais**

Pedir pro usuário colar (Project Settings → API, e Project Settings → Database → Connection string, modo "Transaction" porta 6543 e "Session" porta 5432, igual ao padrão já usado em produção — ver `project_deploy.md` na memória):
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` (publishable, formato novo `sb_publishable_...`)
- `SUPABASE_SERVICE_ROLE_KEY` (formato novo `sb_secret_...`)
- `DATABASE_URL` (pooler porta 6543, com `?pgbouncer=true`)
- `DIRECT_URL` (pooler porta 5432, sem `pgbouncer`)

- [ ] **Step 3: Guardar num arquivo local temporário**

Colar os valores em `/tmp/staging-supabase-creds.txt` (fora do repo) só pra uso nas próximas tasks — apagar esse arquivo ao final da Task 6.

---

### Task 3: Domínio `staging.redemobiliza.com.br` no DNS (passo manual guiado)

**Files:** nenhum — Registro.br, mesma tela "Configurar zona DNS" já usada nesta sessão.

- [ ] **Step 1: Adicionar registro A**

Pedir pro usuário adicionar, na mesma tabela de zonas DNS de hoje:
- Tipo: `A`
- Nome: `staging`
- Dados: `187.77.34.212`

- [ ] **Step 2: Confirmar propagação (pode rodar em paralelo com as próximas tasks)**

Run: `dig A staging.redemobiliza.com.br @a.auto.dns.br +short`
Expected (eventualmente, após a janela de transição do Registro.br): `187.77.34.212`

---

### Task 4: Criar o serviço `app-staging` no EasyPanel via API

**Files:** nenhum arquivo do repo — só chamadas de API.

**Interfaces:**
- Consome: token de sessão do EasyPanel (via `auth.login`, credenciais na memória `project_deploy.md`); credenciais Supabase de staging da Task 2.
- Produz: `serviceName: "app-staging"` dentro do `projectName: "rede-mobiliza"`, host publicado na porta `8081` (produção usa `8080`), domínio `staging.redemobiliza.com.br` com `destinationType: "custom"` apontando pra `http://187.77.34.212:8081` — mesmo padrão que evita o Bad Gateway documentado no HANDOFF.

- [ ] **Step 1: Login e criar o serviço**

```bash
TOKEN=$(curl -s -X POST http://187.77.34.212:3000/api/trpc/auth.login \
  -H "Content-Type: application/json" \
  -d '{"json":{"email":"renato.df@gmail.com","password":"<senha da memoria project_deploy.md>"}}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['json']['token'])")

curl -s -X POST "http://187.77.34.212:3000/api/trpc/services.app.createService" \
  -H "authorization: $TOKEN" -H "Content-Type: application/json" \
  -d '{"json":{"projectName":"rede-mobiliza","serviceName":"app-staging"}}'
```

Expected: `{"json":{...}}` sem erro (se vier `BAD_REQUEST` com `zodErrors`, ajustar campos exigidos e repetir — mesmo padrão de tentativa segura usado nesta sessão pro `domains.createDomain`, já que validação falha nunca cria estado parcial).

- [ ] **Step 2: Apontar a fonte pro repo canônico, branch develop**

```bash
curl -s -X POST "http://187.77.34.212:3000/api/trpc/services.app.updateSourceGithub" \
  -H "authorization: $TOKEN" -H "Content-Type: application/json" \
  -d '{"json":{"projectName":"rede-mobiliza","serviceName":"app-staging","owner":"renatodf","repo":"rede-mobiliza","branch":"develop"}}'
```

- [ ] **Step 3: Configurar env vars de staging**

Usar as credenciais capturadas na Task 2 (arquivo `/tmp/staging-supabase-creds.txt`):

```bash
curl -s -X POST "http://187.77.34.212:3000/api/trpc/services.app.updateEnv" \
  -H "authorization: $TOKEN" -H "Content-Type: application/json" \
  -d '{"json":{"projectName":"rede-mobiliza","serviceName":"app-staging","env":"NEXT_PUBLIC_SUPABASE_URL=<url staging>\nNEXT_PUBLIC_SUPABASE_ANON_KEY=<anon staging>\nSUPABASE_SERVICE_ROLE_KEY=<service role staging>\nDATABASE_URL=<database url staging>\nDIRECT_URL=<direct url staging>\nNEXT_PUBLIC_APP_URL=https://staging.redemobiliza.com.br\nAPP_URL=https://staging.redemobiliza.com.br\nPORT=3000\nRESEND_API_KEY=REDACTED_RESEND_API_KEY_ROTATED\nREMETENTE_EMAIL=onboarding@resend.dev\nCRON_SECRET=<gerar um novo, diferente do de producao>"}}'
```

Nota: `REMETENTE_EMAIL` fica no sandbox do Resend propositalmente em staging — não precisamos do domínio verificado lá, e assim nenhum e-mail de teste vaza pra destinatário real fora da allowlist do Resend.

- [ ] **Step 4: Publicar a porta 8081 → 3000**

```bash
curl -s -X POST "http://187.77.34.212:3000/api/trpc/ports.createPort" \
  -H "authorization: $TOKEN" -H "Content-Type: application/json" \
  -d '{"json":{"projectName":"rede-mobiliza","serviceName":"app-staging","publishedPort":8081,"targetPort":3000,"protocol":"tcp"}}'
```

- [ ] **Step 5: Criar o domínio staging com destino customizado (evita Bad Gateway)**

```bash
curl -s -X POST "http://187.77.34.212:3000/api/trpc/domains.createDomain" \
  -H "authorization: $TOKEN" -H "Content-Type: application/json" \
  -d '{"json":{"projectName":"rede-mobiliza","serviceName":"app-staging","host":"staging.redemobiliza.com.br","https":true,"path":"/","wildcard":false,"middlewares":[],"certificateResolver":"letsencrypt","destinationType":"custom","id":"placeholder","customDestination":{"servers":[{"url":"http://187.77.34.212:8081","weight":1}]}}}'
```

- [ ] **Step 6: Confirmar `autoDeploy` desligado (deploy só via webhook do Actions)**

```bash
curl -s -X POST "http://187.77.34.212:3000/api/trpc/projects.listProjectsAndServices" \
  -H "authorization: $TOKEN" -H "Content-Type: application/json" \
  -d '{"json":null}' | python3 -c "
import sys, json
d = json.load(sys.stdin)
for s in d['json']['services']:
    if s['name'] == 'app-staging':
        print('autoDeploy:', s['source']['autoDeploy'])
        print('token webhook:', s['token'])
"
```

Expected: `autoDeploy: False`. **Guardar o `token webhook` impresso** — é o `EASYPANEL_STAGING_DEPLOY_HOOK` usado na Task 7.

- [ ] **Step 7: Disparar o primeiro build manualmente (staging ainda não tem imagem)**

```bash
curl -s "http://187.77.34.212:3000/api/deploy/<token webhook capturado no Step 6>"
```

Expected: `Deploying...`. Aguardar 2-5 min e checar `commit.sha` do serviço `app-staging` via `projects.listProjectsAndServices`, mesmo padrão usado pra confirmar deploys de produção nesta sessão.

---

### Task 5: Arquivos `.env.staging` / `.env.production` locais

**Files:**
- Create: `.env.staging`
- Create: `.env.production`
- Modify: `.gitignore`

- [ ] **Step 1: Adicionar ao `.gitignore`**

```bash
printf '\n# Copias locais de referencia por ambiente (nao usadas pelo EasyPanel em runtime)\n.env.staging\n.env.production\n' >> .gitignore
```

- [ ] **Step 2: Criar `.env.production`** com os valores atuais do serviço `app` (já documentados em `project_deploy.md`):

```
NEXT_PUBLIC_SUPABASE_URL=https://hqyirlcmhrfdnzshbniy.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_3V2Ba9qtnO-PtNiITjkoqA_-155oLrY
SUPABASE_SERVICE_ROLE_KEY=REDACTED_SUPABASE_SERVICE_ROLE_KEY_ROTATED
DATABASE_URL=postgresql://postgres.hqyirlcmhrfdnzshbniy:REDACTED_DB_PASSWORD_ROTATED@aws-1-sa-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true
DIRECT_URL=postgresql://postgres.hqyirlcmhrfdnzshbniy:REDACTED_DB_PASSWORD_ROTATED@aws-1-sa-east-1.pooler.supabase.com:5432/postgres
NEXT_PUBLIC_APP_URL=https://redemobiliza.com.br
APP_URL=https://redemobiliza.com.br
PORT=3000
RESEND_API_KEY=REDACTED_RESEND_API_KEY_ROTATED
REMETENTE_EMAIL=onboarding@resend.dev
CRON_SECRET=8920abca523ade14e93dd170e87e46be7b5dc76c83c639a8902951b0616a28d3
```

- [ ] **Step 3: Criar `.env.staging`** com os valores usados na Task 4 Step 3 (copiar exatamente o que foi configurado no `services.app.updateEnv`).

- [ ] **Step 4: Apagar o arquivo temporário da Task 2**

```bash
rm -f /tmp/staging-supabase-creds.txt
```

- [ ] **Step 5: Commit**

```bash
git add .gitignore
git commit -m "chore: ignora .env.staging e .env.production (copias locais de referencia)"
```

(`.env.staging`/`.env.production` em si NÃO são commitados — só a entrada no `.gitignore`.)

---

### Task 6: GitHub Actions — testes + deploy automático de staging

**Files:**
- Create: `.github/workflows/deploy-staging.yml`

**Interfaces:**
- Consome: `EASYPANEL_STAGING_DEPLOY_HOOK` (token capturado na Task 4 Step 6) e `RESEND_API_KEY` como secrets do repo GitHub.

- [ ] **Step 1: Criar os secrets no GitHub via `gh`**

```bash
gh secret set EASYPANEL_STAGING_DEPLOY_HOOK -R renatodf/rede-mobiliza --body "<token capturado na Task 4 Step 6>"
gh secret set RESEND_API_KEY -R renatodf/rede-mobiliza --body "REDACTED_RESEND_API_KEY_ROTATED"
```

Run: `gh secret list -R renatodf/rede-mobiliza`
Expected: lista `EASYPANEL_STAGING_DEPLOY_HOOK` e `RESEND_API_KEY`.

- [ ] **Step 2: Escrever o workflow**

```yaml
name: Deploy Staging

on:
  push:
    branches: [develop]

jobs:
  test-and-deploy:
    runs-on: ubuntu-latest
    env:
      RESEND_API_KEY: ${{ secrets.RESEND_API_KEY }}
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Instalar dependências
        run: npm ci

      - name: Typecheck
        run: npx tsc --noEmit

      - name: Testes
        run: npx vitest run --exclude '**/.worktrees/**' --exclude '**/.claude/worktrees/**'

      - name: Disparar deploy no EasyPanel (staging)
        run: curl -f "http://187.77.34.212:3000/api/deploy/${{ secrets.EASYPANEL_STAGING_DEPLOY_HOOK }}"
```

- [ ] **Step 3: Commit e push**

```bash
git add .github/workflows/deploy-staging.yml
git commit -m "ci: pipeline de testes + deploy automatico de staging a cada push em develop"
git push origin develop
```

- [ ] **Step 4: Verificar a run**

Run: `gh run list -R renatodf/rede-mobiliza --branch develop --limit 1`
Expected: run com status `completed`/`success`. Se falhar, checar `gh run view --log -R renatodf/rede-mobiliza` antes de prosseguir.

---

### Task 7: Script `deploy-prod.sh`

**Files:**
- Create: `deploy-prod.sh`

**Interfaces:**
- Consome: token de deploy de produção (`4fb23b54b9e6efc04d120dca9440ae30153d7a8825d12905`, já em uso nesta sessão), credenciais de login do EasyPanel (memória `project_deploy.md`).
- Produz: `main` atualizado localmente e nos dois remotes, produção redeployada.

- [ ] **Step 1: Escrever o script**

```bash
#!/bin/bash
set -euo pipefail

EASYPANEL_HOST="187.77.34.212:3000"
DEPLOY_TOKEN="4fb23b54b9e6efc04d120dca9440ae30153d7a8825d12905"
EASYPANEL_EMAIL="renato.df@gmail.com"

echo "==> Verificando working tree limpo"
if [ -n "$(git status --porcelain)" ]; then
  echo "ERRO: há mudanças não commitadas. Commit ou stash antes de promover."
  exit 1
fi

echo "==> Atualizando main e develop"
git checkout main
git pull origin main
git checkout develop
git pull origin develop

echo "==> Rodando testes locais antes da promoção"
npx tsc --noEmit
npx vitest run --exclude '**/.worktrees/**' --exclude '**/.claude/worktrees/**'

echo "==> Merge develop -> main"
git checkout main
git merge develop --no-ff -m "chore: promove develop para producao"

echo "==> Push para os dois remotes"
git push origin main
git push easypanel main

echo "==> Login no EasyPanel"
TOKEN=$(curl -s -X POST "http://${EASYPANEL_HOST}/api/trpc/auth.login" \
  -H "Content-Type: application/json" \
  -d "{\"json\":{\"email\":\"${EASYPANEL_EMAIL}\",\"password\":\"$(cat .easypanel-password 2>/dev/null || read -s -p 'Senha EasyPanel: ' p && echo "$p")\"}}" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['json']['token'])")

echo "==> Disparando deploy de producao"
curl -s "http://${EASYPANEL_HOST}/api/deploy/${DEPLOY_TOKEN}"
echo

TARGET_SHA=$(git rev-parse HEAD)
echo "==> Aguardando confirmação do deploy (commit ${TARGET_SHA:0:7})..."
for i in $(seq 1 20); do
  SHA=$(curl -s -X POST "http://${EASYPANEL_HOST}/api/trpc/projects.listProjectsAndServices" \
    -H "authorization: $TOKEN" -H "Content-Type: application/json" \
    -d '{"json":null}' | python3 -c "
import sys, json
d = json.load(sys.stdin)
for s in d['json']['services']:
    if s['name'] == 'app' and s['projectName'] == 'rede-mobiliza':
        print(s['commit']['sha'])
")
  if [[ "$SHA" == "$TARGET_SHA"* ]]; then
    echo "✅ Deploy confirmado: $SHA"
    exit 0
  fi
  echo "  ainda no commit $SHA, aguardando... ($i/20)"
  sleep 15
done

echo "⚠️  Timeout: deploy não confirmado em 5 minutos. Verifique manualmente no EasyPanel."
exit 1
```

- [ ] **Step 2: Tornar executável**

```bash
chmod +x deploy-prod.sh
```

- [ ] **Step 3: Não commitar a senha em lugar nenhum**

Confirmar que `.easypanel-password` (se o usuário optar por criar esse arquivo local pra não digitar senha toda vez) está no `.gitignore`:

```bash
grep -q '.easypanel-password' .gitignore || echo '.easypanel-password' >> .gitignore
```

- [ ] **Step 4: Commit**

```bash
git add deploy-prod.sh .gitignore
git commit -m "feat: script deploy-prod.sh para promover develop -> main e disparar deploy de producao"
```

(**Não rodar o script agora** — só na Task 9, depois do `DEPLOY.md` e com o usuário ciente de que vai disparar um deploy de produção de verdade.)

---

### Task 8: `DEPLOY.md`

**Files:**
- Create: `DEPLOY.md`

- [ ] **Step 1: Escrever o documento**

```markdown
# Deploy — Rede Mobiliza

## Ambientes

| Ambiente   | URL                              | Branch    | Deploy                          | Banco                        |
|------------|-----------------------------------|-----------|----------------------------------|-------------------------------|
| Staging    | https://staging.redemobiliza.com.br | `develop` | Automático (GitHub Actions, gated por testes) | Supabase `rede-mobiliza-staging` (dados de teste) |
| Produção   | https://redemobiliza.com.br / www | `main`    | Manual (`./deploy-prod.sh`)     | Supabase de produção (dado real) |

## Fluxo do dia a dia

1. Desenvolve localmente na branch `develop` (ou numa branch de feature, mergeada em `develop`).
2. `git push origin develop` → GitHub Actions roda `tsc --noEmit` + `vitest run`; se passar, dispara deploy automático em staging.
3. Testa em `https://staging.redemobiliza.com.br`.
4. Quando aprovar: `./deploy-prod.sh` — faz merge `develop → main`, roda os testes de novo localmente, push pros dois remotes, dispara o deploy de produção e confirma o commit.

## Checar o status de um deploy manualmente

```bash
TOKEN=$(curl -s -X POST http://187.77.34.212:3000/api/trpc/auth.login \
  -H "Content-Type: application/json" \
  -d '{"json":{"email":"renato.df@gmail.com","password":"<ver memoria project_deploy.md>"}}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['json']['token'])")

curl -s -X POST "http://187.77.34.212:3000/api/trpc/projects.listProjectsAndServices" \
  -H "authorization: $TOKEN" -H "Content-Type: application/json" \
  -d '{"json":null}' | python3 -c "
import sys, json
d = json.load(sys.stdin)
for s in d['json']['services']:
    print(s['name'], '->', s['commit']['sha'][:7])
"
```

## Por que `autoDeploy` fica desligado nos dois serviços

O EasyPanel tem um `autoDeploy` nativo por branch, mas ele não roda testes antes de subir. Preferimos manter `autoDeploy:false` nos dois serviços e controlar o disparo explicitamente:
- Staging: GitHub Actions dispara o webhook só se os testes passarem.
- Produção: só o `deploy-prod.sh`, rodado manualmente, dispara o webhook.

## Por que os domínios usam "destino customizado" em vez do padrão do EasyPanel

O roteamento padrão do EasyPanel (VIP do Docker Swarm) já causou Bad Gateway (502) em produção — resolvido apontando o domínio direto pra porta publicada no host (`http://187.77.34.212:8080` em produção, `:8081` em staging) em vez do VIP interno. Se algum domínio novo for criado no futuro, replicar esse padrão (ver `domains.createDomain`/`updateDomain` com `destinationType:"custom"`).

## Troubleshooting

- **Deploy não confirma o commit esperado**: rodar o script de checagem acima; se o build falhou, ver o log em `actions.getAction` (API do EasyPanel) ou pelo painel web.
- **Staging não atualizou depois do push**: checar `gh run list -R renatodf/rede-mobiliza --branch develop` — se o workflow falhou nos testes, o deploy nunca foi disparado (é o comportamento esperado).
- **Migração do banco falhou no boot do container**: o `entrypoint.sh` engole erro de `prisma migrate deploy` (`|| echo AVISO...`) e sobe o app mesmo assim — sempre conferir o log do deploy depois de mudar o schema.
- **Nunca colocar dado real em staging.**
```

- [ ] **Step 2: Commit**

```bash
git add DEPLOY.md
git commit -m "docs: adiciona DEPLOY.md documentando o fluxo staging/producao"
```

---

### Task 9: Teste end-to-end do fluxo completo

**Files:** nenhum arquivo novo — validação do pipeline inteiro.

- [ ] **Step 1: Commit trivial em `develop`**

```bash
git checkout develop
echo "<!-- deploy pipeline test $(date +%s) -->" >> DEPLOY.md
git add DEPLOY.md
git commit -m "test: valida pipeline de deploy automatico de staging"
git push origin develop
```

- [ ] **Step 2: Confirmar que o Action rodou e disparou o deploy**

Run: `gh run watch -R renatodf/rede-mobiliza`
Expected: job `test-and-deploy` conclui com sucesso.

- [ ] **Step 3: Confirmar staging.redemobiliza.com.br respondendo**

Run: `curl -sS -o /dev/null -w "%{http_code}\n" https://staging.redemobiliza.com.br/`
Expected: `200` (ou `307`/`302` se houver redirect de login — qualquer coisa diferente de erro de conexão/502).

- [ ] **Step 4: Rodar a promoção real com o usuário observando**

Confirmar com o usuário antes: `./deploy-prod.sh`. Acompanhar a saída até o "✅ Deploy confirmado".

- [ ] **Step 5: Confirmar produção**

Run: `curl -sS -o /dev/null -w "%{http_code}\n" https://redemobiliza.com.br/`
Expected: `200` (mesmo padrão de antes, sem regressão).
