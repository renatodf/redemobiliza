#!/bin/bash
set -euo pipefail

EASYPANEL_HOST="187.77.34.212:3000"
EASYPANEL_EMAIL="renato.df@gmail.com"
CREDS_DIR="${HOME}/.config/rede-mobiliza-deploy"
DEPLOY_TOKEN_FILE="${CREDS_DIR}/prod-deploy-token"
PASSWORD_FILE="${CREDS_DIR}/easypanel-password"

check_perms() {
  local file="$1"
  local perms
  perms="$(stat -f '%Lp' "$file" 2>/dev/null || stat -c '%a' "$file" 2>/dev/null)"
  if [ "$perms" != "600" ]; then
    echo "ERRO: $file precisa ter permissão 600 (rodar: chmod 600 \"$file\")."
    exit 1
  fi
}

if [ -z "${DEPLOY_TOKEN:-}" ]; then
  if [ -f "$DEPLOY_TOKEN_FILE" ]; then
    check_perms "$DEPLOY_TOKEN_FILE"
    DEPLOY_TOKEN="$(cat "$DEPLOY_TOKEN_FILE")"
  else
    read -s -p "Token de deploy de produção (EasyPanel): " DEPLOY_TOKEN
    echo
  fi
fi

echo "==> Verificando working tree limpo (arquivos rastreados)"
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "ERRO: há mudanças não commitadas em arquivos rastreados. Commit ou stash antes de promover."
  exit 1
fi

echo "==> Atualizando main e develop"
git checkout main
git pull origin main
git checkout develop
git pull origin develop

echo "==> Rodando testes locais antes da promoção"
if [ -f .env.production ] && [ -z "${RESEND_API_KEY:-}" ]; then
  export RESEND_API_KEY="$(grep '^RESEND_API_KEY=' .env.production | cut -d= -f2-)"
fi
npx tsc --noEmit
npx vitest run --exclude '**/.worktrees/**' --exclude '**/.claude/worktrees/**'

echo "==> Merge develop -> main"
git checkout main
git merge develop --no-ff -m "chore: promove develop para producao"

echo "==> Push para os dois remotes"
git push origin main
git push easypanel main

echo "==> Login no EasyPanel"
if [ -f "$PASSWORD_FILE" ]; then
  check_perms "$PASSWORD_FILE"
  EASYPANEL_PASSWORD="$(cat "$PASSWORD_FILE")"
else
  read -s -p "Senha EasyPanel: " EASYPANEL_PASSWORD
  echo
fi

TOKEN=$(curl -s -X POST "http://${EASYPANEL_HOST}/api/trpc/auth.login" \
  -H "Content-Type: application/json" \
  -d "{\"json\":{\"email\":\"${EASYPANEL_EMAIL}\",\"password\":\"${EASYPANEL_PASSWORD}\"}}" \
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
