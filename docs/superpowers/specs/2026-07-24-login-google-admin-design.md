# Login com Google para admin — Design

## Contexto

Quinto e último item da lista de 5 ajustes de UI/produto desta sessão (ver seções 33, 34, 35 e 36 do HANDOFF para os quatro primeiros). Achado incidental durante a verificação manual do item 3 (seção 35 do HANDOFF): o botão "Entrar com Google" da tela de login (`/login`) retorna erro 400 "provider is not enabled" do Supabase.

Investigação nesta sessão confirmou que **o código já está pronto** — não é um bug de implementação:

- `loginAdminGoogle` (`src/actions/auth/login-admin.ts:52`) já chama `supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: \`${getAppUrl()}/auth/confirm\` } })` corretamente.
- A rota `/auth/confirm` (`src/app/auth/confirm/route.ts`) já trata o `code` de retorno do OAuth via `exchangeCodeForSession`, já verifica `app_metadata.gabineteId` e redireciona pro painel certo — mesmo caminho já usado pelos fluxos de convite/magic link.
- O que falta é só **habilitar o provider Google no painel do Supabase** (Authentication → Providers → Google), com Client ID e Client Secret que o usuário já tem no Google Cloud Console. Isso é configuração de infraestrutura, fora deste repositório — não há arquivo de config local do Supabase (projeto usa instância hospedada, gerenciada só pelo painel).

## Decisão de escopo (usuário)

Login com Google funciona **só como forma alternativa de entrar numa conta de admin já convidada** (mesmo modelo de hoje: só quem foi convidado por um admin/super-admin tem acesso). Não é cadastro/self-service — logar com Google não cria acesso novo para quem nunca foi convidado.

Confirmado via documentação do Supabase (Context7) que isso já é o comportamento padrão: quando um usuário loga via OAuth com um e-mail que já tem conta confirmada (criada via convite, por exemplo), o Supabase **vincula automaticamente** a identidade Google à mesma conta existente — mantém o mesmo `user.id` e, portanto, o mesmo `app_metadata.gabineteId`. Se o e-mail do Google não corresponder a nenhuma conta já confirmada no projeto, o Supabase cria um usuário novo sem `gabineteId` em `app_metadata`, e a checagem já existente em `/auth/confirm` (linhas 43-50) desloga e redireciona pra `/login?erro=invite_invalid` — bloqueando exatamente o cadastro não convidado, sem precisar de nenhuma lógica nova.

## O que precisa ser feito

1. **Painel do Supabase → Authentication → Providers → Google**: habilitar o provider, informar Client ID e Client Secret (já existentes, do Google Cloud Console do usuário). Ação manual do usuário — credencial sensível, não deve ser colada na conversa.
2. **Google Cloud Console → credenciais OAuth do client usado**: confirmar que a "Authorized redirect URI" inclui a URL de callback do próprio Supabase: `https://hqyirlcmhrfdnzshbniy.supabase.co/auth/v1/callback` (não é uma rota deste app — é do Supabase). Ação manual do usuário.
3. **Nenhuma mudança de código.**

## Fora de escopo

- Cadastro/self-service via Google (decisão explícita do usuário — ver seção acima).
- Qualquer mudança em `/auth/confirm` ou `loginAdminGoogle` — já corretos para o fluxo decidido.
- Login com Google para mobilizador (fluxo é só magic link, sem tela de senha/Google) ou super-admin (login separado, `/super-admin/login`) — fora do pedido original, que era especificamente sobre o login de admin.

## Verificação

Depois que o usuário habilitar o provider no painel do Supabase (passo manual, fora do alcance de uma sessão de código):

1. Confirmar, com um admin real já existente (mesmo e-mail já cadastrado), que "Entrar com Google" completa o fluxo OAuth e cai no painel do gabinete certo — sessão carregando o `app_metadata.gabineteId` esperado.
2. Confirmar que um e-mail do Google **sem** conta prévia no sistema cai em `/login?erro=invite_invalid` (bloqueado corretamente, sem criar acesso indevido).
3. Sem `npx tsc --noEmit` nem `vitest` a rodar — não há mudança de código neste item.
