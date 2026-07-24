# Convite de admin via Resend (em vez do e-mail nativo do Supabase) — Design

## Contexto

Quarto item da lista de 5 ajustes de UI/produto desta sessão (ver seções 33-35 do HANDOFF para os três primeiros). O pedido original ("deu problema no envio de email" ao criar um admin no gabinete IZALCI) misturava duas coisas: um remetente de e-mail por gabinete (fora de escopo por agora, ver decisão abaixo) e domínio customizado por gabinete (item separado, ainda não brainstormado). Investigação nesta sessão revelou a causa raiz real:

- O painel do super-admin tem dois fluxos de criar/reenviar acesso — **"Convidar novo admin"** (`convidarAdmin`) e **"Reenviar convite"** (`reenviarConvite`) — e os dois dependem do **serviço de e-mail nativo do Supabase Auth** (`inviteUserByEmail`, que cria o usuário E dispara o e-mail de convite automaticamente). Esse serviço é separado do Resend que o resto do app já usa (`enviarEmail`, em `src/lib/email.ts`, usado hoje só pelos alertas de Demanda e pela exportação assíncrona) — e é ele que está falhando.
- O domínio `redemobiliza.com.br` **já está verificado no Resend** (confirmado via API do Resend nesta sessão, verificado desde 13/07/2026) — a variável `REMETENTE_EMAIL` em produção é que ainda aponta pro sandbox (`onboarding@resend.dev`), herdado de quando o domínio ainda não estava pronto.
- **Decisão do usuário**: por enquanto, sem campo de "e-mail de sistema por gabinete" no schema — só um remetente global (`naoresponda@redemobiliza.com.br`), suficiente pra corrigir o problema real de hoje. Um campo por-gabinete fica pra quando o domínio customizado (item futuro, ainda não brainstormado) existir de verdade — evita construir algo especulativo agora.

## Objetivo

- Trocar `REMETENTE_EMAIL` de produção pro domínio já verificado.
- `convidarAdmin` e `reenviarConvite` param de depender do e-mail nativo do Supabase — passam a gerar o link via `generateLink` (que cria o usuário sem mandar e-mail nenhum) e entregar esse link via `enviarEmail`/Resend, igual ao resto do sistema.

## Mudança de config (produção, feita fora do plano de código)

`REMETENTE_EMAIL=onboarding@resend.dev` → `REMETENTE_EMAIL=naoresponda@redemobiliza.com.br`, no serviço `app` do EasyPanel (`services.app.updateEnv`, mesmo mecanismo já usado nesta sessão pra outras confirmações de deploy). Ação de infraestrutura, executada pelo controller com confirmação do usuário antes de rodar — não faz parte das tasks do plano de implementação (não é código).

## `generateLink({type: 'invite'})` em vez de `inviteUserByEmail`

Confirmado via documentação do Supabase (`generateLink` "handles the creation of the user for signup, invite and magiclink" — cria o usuário mas nunca envia e-mail, diferente de `inviteUserByEmail`): `data.properties.hashed_token` vem pronto pra montar um link direto pra rota que este projeto já usa (`src/app/auth/confirm/route.ts`), que já aceita `token_hash`+`type` genericamente via `supabase.auth.verifyOtp({ token_hash, type })` — nenhuma mudança nessa rota é necessária, `type=invite` já é um valor válido de `EmailOtpType` que ela já sabe tratar.

Link montado manualmente como `${getAppUrl()}/auth/confirm?token_hash=${hashed_token}&type=invite` — mesmo padrão (URL direto pro `/auth/confirm`, não o `action_link` do Supabase, que aponta pro `/verify` deles e pode devolver token via hash fragment em vez de query param, inconsistente com o que `/auth/confirm` espera) já usado em verificações manuais desta sessão.

## `convidarAdmin.ts`

Troca:

```ts
const { data: invite, error: inviteError } =
  await getSupabaseAdmin().auth.admin.inviteUserByEmail(email, {
    redirectTo: `${getAppUrl()}/auth/confirm`,
  })
```

Por:

```ts
const { data: linkData, error: linkError } =
  await getSupabaseAdmin().auth.admin.generateLink({
    type: 'invite',
    email,
    options: { redirectTo: `${getAppUrl()}/auth/confirm` },
  })
```

O restante da lógica (checagem de "e-mail já cadastrado", atualização de `app_metadata`, mensagens de erro) não muda — só o passo de criação do usuário. Depois de criar com sucesso, monta o link (`token_hash` → URL) e chama `enviarEmail` com o novo template `templateConviteAdmin` em vez de confiar no Supabase pra entregar. Mensagem de sucesso continua "Convite enviado com sucesso!".

## `reenviarConvite.ts`

Já usa `generateLink` (com `type: 'magiclink'`, pra usuário que já existe) — só muda o final: em vez de retornar `{ link }` pra tela mostrar e o super-admin copiar manualmente, chama `enviarEmail` com o mesmo template e retorna um indicativo de sucesso (`{ enviado: true }` ou similar). A UI (`ReenviarConviteSection` em `src/app/super-admin/gabinetes/[id]/page.tsx`) troca a caixa de "copie o link" por uma mensagem de confirmação de envio.

## Novo template de e-mail

`templateConviteAdmin({ nomeGabinete, urlConvite })` em `src/lib/email.ts`, mesmo estilo dos templates existentes (`templateDemandaAtribuida` etc.) — HTML simples, `escapeHtml` no nome do gabinete, link de convite.

## Fora de escopo

- Campo de "e-mail de sistema" por `Gabinete` no schema — decisão explícita do usuário, fica pra quando o domínio customizado existir.
- Domínio customizado por gabinete (roteamento por hostname, logo dinâmica) — item separado da lista de 5, ainda não brainstormado.
- Qualquer mudança na rota `/auth/confirm` — já suporta o que é necessário.
- SMTP customizado nas configurações do próprio Supabase Auth — decisão do usuário foi unificar tudo no Resend via `enviarEmail`, não configurar o Supabase pra usar o Resend como transporte.

## Verificação

- `npx tsc --noEmit` limpo.
- Manual (Playwright ou navegador real, painel do super-admin): "Convidar novo admin" com um e-mail novo — usuário criado no Supabase Auth (sem e-mail nativo disparado), e-mail chega via Resend com link funcional (`/auth/confirm?token_hash=...&type=invite` loga e redireciona pro gabinete certo). "Reenviar convite" com um e-mail já cadastrado — e-mail novo chega, sem mostrar link na tela.
- Confirmar em produção, depois da troca do `REMETENTE_EMAIL`, que o remetente exibido no e-mail recebido é `naoresponda@redemobiliza.com.br`, não mais `onboarding@resend.dev`.
