# Login com Google para admin — Plano de Implementação

> **Para quem for executar:** este item não tem tasks de código — use superpowers:executing-plans (execução inline) para acompanhar os passos abaixo. Não há trabalho paralelizável nem revisão de diff (não existe diff).

**Objetivo:** Habilitar o login com Google para admin já convidado, usando o código e a rota `/auth/confirm` que já existem, sem nenhuma mudança de código — só configuração no painel do Supabase e no Google Cloud Console.

**Arquitetura:** Nenhuma. `loginAdminGoogle` (`src/actions/auth/login-admin.ts:52`) e `/auth/confirm` (`src/app/auth/confirm/route.ts`) já implementam o fluxo correto; falta só o provider Google estar habilitado no projeto Supabase.

**Tech Stack:** Supabase Auth (provider Google OAuth), Google Cloud Console (OAuth Client já existente do usuário).

## Restrições globais

- Nenhum arquivo de código é criado, modificado ou testado neste plano — confirmado no spec (`docs/superpowers/specs/2026-07-24-login-google-admin-design.md`).
- Login com Google continua exigindo convite prévio (mesmo e-mail já cadastrado) — não é cadastro/self-service. Comportamento já garantido pela vinculação automática de identidade do Supabase + checagem de `app_metadata.gabineteId` já existente em `/auth/confirm`.
- Client ID e Client Secret do Google **nunca** devem ser colados nesta conversa nem em nenhum arquivo do repositório — são inseridos só diretamente no painel do Supabase pelo usuário.

---

### Task 1: Habilitar o provider Google no Supabase (ação manual do usuário)

**Quem faz:** o usuário, fora desta sessão de código.

- [ ] **Passo 1:** No painel do Supabase (projeto `rede-mobiliza`, ref `hqyirlcmhrfdnzshbniy`) → **Authentication → Providers → Google** → habilitar o provider, colar o Client ID e o Client Secret já existentes no Google Cloud Console.
- [ ] **Passo 2:** No Google Cloud Console, no OAuth Client usado (mesmo Client ID do passo 1) → conferir que **Authorized redirect URIs** inclui:
  ```
  https://hqyirlcmhrfdnzshbniy.supabase.co/auth/v1/callback
  ```
  Essa é a URL de callback do próprio Supabase (não uma rota deste app) — se não estiver na lista, adicionar e salvar.
- [ ] **Passo 3:** Avisar quando os dois passos acima estiverem feitos, pra seguir pra verificação (Task 2).

### Task 2: Verificação end-to-end (controller, depois que a Task 1 estiver feita)

**Interfaces consumidas:** `loginAdminGoogle` (`src/actions/auth/login-admin.ts:52`), rota `/auth/confirm` (`src/app/auth/confirm/route.ts`) — nenhuma delas muda neste item.

- [ ] **Passo 1:** Verificar, sem navegador, que o provider está de fato habilitado — chamar `supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: ... } })` (ou equivalente via REST) e confirmar que retorna uma URL de autorização do Google (`accounts.google.com/o/oauth2/...`) em vez do erro 400 "provider is not enabled" visto antes.
- [ ] **Passo 2:** Testar o fluxo completo pelo navegador (Playwright) com uma conta Google real que corresponda a um e-mail de admin já cadastrado em produção (ex.: `renato.df@gmail.com`, super-admin/admin já confirmado): clicar "Entrar com Google" em `/login`, completar a autorização, confirmar que cai no painel do gabinete certo — mesma sessão/`app_metadata.gabineteId` de sempre, não uma conta duplicada.
- [ ] **Passo 3:** Confirmar, consultando o Supabase Auth diretamente (`listUsers`/`getUserById`), que não foi criado um `user.id` novo para esse e-mail — a identidade Google foi vinculada ao usuário existente (comportamento de auto-linking do Supabase, documentado no spec).
- [ ] **Passo 4:** Reportar o resultado. Se algo falhar de um jeito que aponte pra um problema real de código (não de configuração), voltar e ajustar o spec/plano antes de qualquer mudança — não esperado, mas o comportamento correto se acontecer.

---

## Sem tasks de código

Este plano não tem etapas de `Write failing test` / `Implement` / `Commit` porque não há código a mudar — confirmado no spec. Se a verificação (Task 2) revelar necessidade de mudança de código, esse achado deve ser tratado como um novo item de spec, não uma correção improvisada dentro deste plano.
