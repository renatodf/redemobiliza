# Deploy — Rede Mobiliza

## Ambientes

| Ambiente   | URL                                  | Branch    | Deploy                                          | Banco                                              |
|------------|----------------------------------------|-----------|--------------------------------------------------|------------------------------------------------------|
| Staging    | https://staging.redemobiliza.com.br    | `develop` | Automático (GitHub Actions, gated por testes)     | Supabase `rede-mobiliza-staging` (dados de teste)    |
| Produção   | https://redemobiliza.com.br / www      | `main`    | Manual (`./deploy-prod.sh`)                       | Supabase de produção (dado real)                     |

## Fluxo do dia a dia

1. Desenvolve localmente na branch `develop` (ou numa branch de feature, mergeada em `develop`).
2. `git push origin develop` → GitHub Actions roda `prisma generate` + `tsc --noEmit` + `vitest run`; se passar, dispara deploy automático em staging.
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

## Ver logs de um run do GitHub Actions (staging)

```bash
gh run list -R renatodf/rede-mobiliza --branch develop --limit 5
gh run view --log -R renatodf/rede-mobiliza <run-id>
```

## Por que `autoDeploy` fica desligado nos dois serviços

O EasyPanel tem um `autoDeploy` nativo por branch, mas ele não roda testes antes de subir. Preferimos manter `autoDeploy:false` nos dois serviços e controlar o disparo explicitamente:
- **Staging**: GitHub Actions dispara o webhook só se `prisma generate` + `tsc --noEmit` + `vitest run` passarem.
- **Produção**: só o `deploy-prod.sh`, rodado manualmente, dispara o webhook (e roda os mesmos testes localmente antes).

## Por que os domínios usam "destino customizado" em vez do padrão do EasyPanel

O roteamento padrão do EasyPanel (VIP do Docker Swarm) já causou Bad Gateway (502) em produção. A solução foi apontar o domínio direto pra porta publicada no host em vez do VIP interno:

| Serviço       | Porta publicada | Destino customizado do domínio      |
|---------------|------------------|--------------------------------------|
| `app` (prod)  | `8080` → 3000    | `http://187.77.34.212:8080`          |
| `app-staging` | `8081` → 3000    | `http://187.77.34.212:8081`          |

Se algum domínio novo for criado no futuro, replicar esse padrão (`domains.createDomain`/`updateDomain` com `destinationType:"custom"`, escolhendo uma porta host ainda não publicada).

## Configuração de referência de cada ambiente

`.env.staging` e `.env.production` (na raiz do repo, ignorados pelo git) documentam os valores configurados em cada serviço do EasyPanel — não são lidos automaticamente pelo EasyPanel nem pelo app; servem só de referência local e para rodar o app apontando pra um ambiente específico durante desenvolvimento.

## Troubleshooting

- **Deploy não confirma o commit esperado**: rodar o script de checagem acima; se o build falhou, ver o log em `actions.getAction` (API do EasyPanel) ou pelo painel web.
- **Staging não atualizou depois do push**: checar `gh run list -R renatodf/rede-mobiliza --branch develop` — se o workflow falhou nos testes, o deploy nunca foi disparado (é o comportamento esperado). Causa comum: cliente Prisma não gerado — o workflow já roda `npx prisma generate` antes do typecheck, mas se esse step for removido o build falha com "Cannot find module '../src/generated/prisma/client'".
- **Migração do banco falhou no boot do container**: o `entrypoint.sh` engole erro de `prisma migrate deploy` (`|| echo AVISO...`) e sobe o app mesmo assim — sempre conferir o log do deploy depois de mudar o schema.
- **`git push` rejeitado com "without workflow scope"**: o token do `gh`/git credential helper precisa do escopo `workflow` pra alterar arquivos em `.github/workflows/*.yml`. Rodar `gh auth refresh -h github.com -s workflow` (abre o navegador) e depois `gh auth setup-git` pra sincronizar o credential helper do git com o token atualizado.
- **Nunca colocar dado real em staging.**

## Credenciais do `deploy-prod.sh`

O script nunca tem token/senha hardcoded nem lê de arquivo dentro do repo. Na primeira vez que rodar, ele vai pedir interativamente; pra não digitar toda vez, salve em `~/.config/rede-mobiliza-deploy/` (fora do repo) com permissão `600`:

```bash
mkdir -p ~/.config/rede-mobiliza-deploy
chmod 700 ~/.config/rede-mobiliza-deploy
echo -n "<token de deploy de producao>" > ~/.config/rede-mobiliza-deploy/prod-deploy-token
echo -n "<senha do EasyPanel>" > ~/.config/rede-mobiliza-deploy/easypanel-password
chmod 600 ~/.config/rede-mobiliza-deploy/prod-deploy-token ~/.config/rede-mobiliza-deploy/easypanel-password
```

## Dívidas técnicas conhecidas

- **Webhook de deploy e login em HTTP, não HTTPS**: o painel do EasyPanel (porta 3000) não tem TLS configurado, então tanto o token do webhook de deploy quanto a senha de login (usada por `deploy-prod.sh` pra consultar o status do deploy) trafegam em texto puro entre o cliente (GitHub Actions / máquina local) e o VPS. Risco considerado baixo pro token de deploy (só dispara rebuild), mas a senha de login merece atenção — o ideal seria colocar TLS na frente do painel do EasyPanel ou mover o acesso pra dentro de uma rede privada/VPN. Não tratado nesta spec — decisão consciente de aceitar o risco por ora, mesmo padrão já usado manualmente durante toda a configuração deste ambiente.
