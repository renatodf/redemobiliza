# Convite de admin via Resend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `convidarAdmin` e `reenviarConvite` (painel do super-admin) param de depender do serviço de e-mail nativo do Supabase Auth (`inviteUserByEmail`, que está falhando) — passam a criar o link via `generateLink` (que cria/atualiza o usuário sem mandar e-mail nenhum) e entregar esse link via `enviarEmail`/Resend, igual ao resto do sistema.

**Architecture:** Novo template de e-mail (`templateConviteAdmin`) em `src/lib/email.ts`, reaproveitado pelas duas Server Actions. `convidarAdmin` troca `inviteUserByEmail` por `generateLink({type: 'invite'})`. `reenviarConvite` já usava `generateLink({type: 'magiclink'})` — só troca o final (mandar e-mail em vez de devolver o link pra tela mostrar). A UI (`ReenviarConviteSection`) troca a caixa de "copie o link" por uma mensagem de confirmação de envio. Nenhuma mudança na rota `/auth/confirm` (já suporta `token_hash`+`type` genericamente) nem em schema.

**Tech Stack:** Next.js 14 (App Router) + TypeScript 5 + Supabase Auth (Admin API) + Resend.

## Global Constraints

- Link montado manualmente como `${getAppUrl()}/auth/confirm?token_hash=${hashed_token}&type=<tipo>` — não usar `linkData.properties.action_link` (aponta pro `/verify` do Supabase, que pode devolver o token via hash fragment em vez de query param, incompatível com o que `/auth/confirm` espera).
- Nenhuma mudança em `src/app/auth/confirm/route.ts` — já trata `type=invite` e `type=magiclink` genericamente via `supabase.auth.verifyOtp({ token_hash, type })`.
- Nenhum campo novo no schema (`Gabinete`) — decisão do usuário, e-mail de sistema por gabinete fica pra quando o domínio customizado existir.
- A troca de `REMETENTE_EMAIL` em produção (de `onboarding@resend.dev` pra `naoresponda@redemobiliza.com.br`) é uma ação de infraestrutura (env var no EasyPanel), **não faz parte das tasks de código deste plano** — feita pelo controller, com confirmação do usuário, depois que o código estiver revisado.

Spec completo: `docs/superpowers/specs/2026-07-24-convite-admin-via-resend-design.md`.

---

### Task 1: Template de e-mail + `convidarAdmin`

**Files:**
- Modify: `src/lib/email.ts`
- Modify: `src/actions/super-admin/convidar-admin.ts`

**Interfaces:**
- Produces: `templateConviteAdmin({ nomeGabinete: string; urlConvite: string }): string` em `src/lib/email.ts`, mesmo padrão dos templates já existentes no arquivo (`templateDemandaAtribuida`, etc. — função pura que retorna HTML, usa `escapeHtml` no dado dinâmico).

- [ ] **Step 1: Adicionar `templateConviteAdmin` em `src/lib/email.ts`**

No final do arquivo, depois da função `templateExportacaoPronta` (mantém tudo antes dela intacto), adicionar:

```ts

export function templateConviteAdmin({
  nomeGabinete,
  urlConvite,
}: {
  nomeGabinete: string
  urlConvite: string
}): string {
  return `
    <p>Olá!</p>
    <p>Você foi convidado(a) para ser administrador(a) do gabinete <strong>${escapeHtml(nomeGabinete)}</strong> na Rede Mobiliza.</p>
    <p><a href="${escapeHtml(urlConvite)}">Aceitar convite →</a></p>
  `
}
```

- [ ] **Step 2: Trocar `inviteUserByEmail` por `generateLink` + `enviarEmail` em `convidar-admin.ts`**

Localizar o import (linhas 1-7 atuais):

```ts
'use server'

import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { getAppUrl } from '@/lib/app-url'
import { prisma } from '@/lib/prisma'
```

Substituir por:

```ts
'use server'

import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { getAppUrl } from '@/lib/app-url'
import { prisma } from '@/lib/prisma'
import { enviarEmail, templateConviteAdmin } from '@/lib/email'
```

Localizar a chamada que cria o convite (linhas 25-28 atuais):

```ts
  const { data: invite, error: inviteError } =
    await getSupabaseAdmin().auth.admin.inviteUserByEmail(email, {
      redirectTo: `${getAppUrl()}/auth/confirm`,
    })
```

Substituir por:

```ts
  const { data: linkData, error: inviteError } =
    await getSupabaseAdmin().auth.admin.generateLink({
      type: 'invite',
      email,
      options: { redirectTo: `${getAppUrl()}/auth/confirm` },
    })
```

Localizar o restante da função, do uso de `invite.user.id` até o final (linhas 57-69 atuais):

```ts
  const userId = invite.user.id

  const { error: updateError } =
    await getSupabaseAdmin().auth.admin.updateUserById(userId, {
      app_metadata: { gabineteId, papel: 'admin' },
    })

  if (updateError) {
    redirect(`/super-admin/gabinetes/${gabineteId}?erro=metadata_falhou&userId=${userId}`)
  }

  redirect(`/super-admin/gabinetes/${gabineteId}?sucesso=convite_enviado`)
}
```

Substituir por:

```ts
  const userId = linkData.user.id

  const { error: updateError } =
    await getSupabaseAdmin().auth.admin.updateUserById(userId, {
      app_metadata: { gabineteId, papel: 'admin' },
    })

  if (updateError) {
    redirect(`/super-admin/gabinetes/${gabineteId}?erro=metadata_falhou&userId=${userId}`)
  }

  const gabinete = await prisma.gabinete.findUnique({ where: { id: gabineteId }, select: { nome: true } })
  const urlConvite = `${getAppUrl()}/auth/confirm?token_hash=${linkData.properties.hashed_token}&type=invite`

  try {
    await enviarEmail({
      para: email,
      assunto: `Convite para administrar ${gabinete?.nome ?? 'o gabinete'}`,
      html: templateConviteAdmin({ nomeGabinete: gabinete?.nome ?? 'o gabinete', urlConvite }),
    })
  } catch {
    redirect(`/super-admin/gabinetes/${gabineteId}?erro=email_falhou`)
  }

  redirect(`/super-admin/gabinetes/${gabineteId}?sucesso=convite_enviado`)
}
```

O restante da função (checagem `jaExiste` de e-mail já cadastrado, linhas 30-55 atuais) não muda — o formato de erro do `generateLink` pra e-mail já existente é o mesmo `email_exists`/"already registered" já tratado ali (checar isso especificamente no Step 4 de verificação manual da Task 3).

- [ ] **Step 3: Adicionar a nova mensagem de erro `email_falhou` na página do super-admin**

Em `src/app/super-admin/gabinetes/[id]/page.tsx`, localizar (linhas 27-34 atuais):

```ts
const mensagensErro: Record<string, string> = {
  email_obrigatorio: 'Informe o e-mail do admin.',
  usuario_ja_existe:
    'Este e-mail já está cadastrado. Use "Reenviar convite" abaixo.',
  convite_falhou: 'Erro ao enviar convite. Tente novamente.',
  metadata_falhou:
    'Convite enviado, mas houve erro ao gravar permissões. Use "Reenviar convite" para corrigir.',
}
```

Substituir por:

```ts
const mensagensErro: Record<string, string> = {
  email_obrigatorio: 'Informe o e-mail do admin.',
  usuario_ja_existe:
    'Este e-mail já está cadastrado. Use "Reenviar convite" abaixo.',
  convite_falhou: 'Erro ao enviar convite. Tente novamente.',
  metadata_falhou:
    'Convite enviado, mas houve erro ao gravar permissões. Use "Reenviar convite" para corrigir.',
  email_falhou:
    'Convite criado, mas houve erro ao enviar o e-mail. Use "Reenviar convite" para tentar de novo.',
}
```

- [ ] **Step 4: Checar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros novos relacionados aos 3 arquivos desta task.

- [ ] **Step 5: Commit**

```bash
git add src/lib/email.ts src/actions/super-admin/convidar-admin.ts "src/app/super-admin/gabinetes/[id]/page.tsx"
git commit -m "$(cat <<'EOF'
feat: convidarAdmin usa generateLink + Resend em vez do e-mail nativo do Supabase

O e-mail nativo do Supabase (inviteUserByEmail) é o que está
falhando ao criar admin — generateLink cria o usuário sem mandar
e-mail nenhum, e o link é entregue via enviarEmail (Resend), mesmo
sistema já usado pelo resto do app.
EOF
)"
```

---

### Task 2: `reenviarConvite` também passa a mandar por Resend

**Files:**
- Modify: `src/actions/super-admin/reenviar-convite.ts`
- Modify: `src/app/super-admin/gabinetes/[id]/page.tsx`

**Interfaces:**
- Consumes: `templateConviteAdmin` (Task 1).
- Produces: `ReenviarResult` muda de `{ link?: string; erro?: string }` pra `{ enviado?: boolean; erro?: string }`.

- [ ] **Step 1: Reescrever `reenviar-convite.ts`**

Arquivo completo atual:

```ts
'use server'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { getAppUrl } from '@/lib/app-url'

interface ReenviarResult {
  link?: string
  erro?: string
}

export async function reenviarConvite(
  gabineteId: string,
  email: string
): Promise<ReenviarResult> {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.app_metadata?.role !== 'super-admin') {
    return { erro: 'Não autorizado.' }
  }
  const { data: users, error: listError } =
    await getSupabaseAdmin().auth.admin.listUsers()

  if (listError) return { erro: 'Erro ao buscar usuário.' }

  const usuario = users.users.find(
    (u) => u.email?.toLowerCase() === email.toLowerCase()
  )

  if (!usuario) {
    return { erro: 'Usuário não encontrado. Use "Convidar admin" para criar o convite.' }
  }

  const metaGabineteId = usuario.app_metadata?.gabineteId
  if (!metaGabineteId || metaGabineteId !== gabineteId) {
    const { error: updateError } =
      await getSupabaseAdmin().auth.admin.updateUserById(usuario.id, {
        app_metadata: { gabineteId, papel: 'admin' },
      })
    if (updateError) {
      return {
        erro: 'Não foi possível atualizar os dados do usuário. Tente novamente.',
      }
    }
  }

  const { data: linkData, error: linkError } =
    await getSupabaseAdmin().auth.admin.generateLink({
      type: 'magiclink',
      email,
      options: {
        redirectTo: `${getAppUrl()}/auth/confirm`,
      },
    })

  if (linkError || !linkData.properties?.action_link) {
    return { erro: 'Não foi possível gerar o link. Tente novamente.' }
  }

  return { link: linkData.properties.action_link }
}
```

Substituir por:

```ts
'use server'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { getAppUrl } from '@/lib/app-url'
import { prisma } from '@/lib/prisma'
import { enviarEmail, templateConviteAdmin } from '@/lib/email'

interface ReenviarResult {
  enviado?: boolean
  erro?: string
}

export async function reenviarConvite(
  gabineteId: string,
  email: string
): Promise<ReenviarResult> {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.app_metadata?.role !== 'super-admin') {
    return { erro: 'Não autorizado.' }
  }
  const { data: users, error: listError } =
    await getSupabaseAdmin().auth.admin.listUsers()

  if (listError) return { erro: 'Erro ao buscar usuário.' }

  const usuario = users.users.find(
    (u) => u.email?.toLowerCase() === email.toLowerCase()
  )

  if (!usuario) {
    return { erro: 'Usuário não encontrado. Use "Convidar admin" para criar o convite.' }
  }

  const metaGabineteId = usuario.app_metadata?.gabineteId
  if (!metaGabineteId || metaGabineteId !== gabineteId) {
    const { error: updateError } =
      await getSupabaseAdmin().auth.admin.updateUserById(usuario.id, {
        app_metadata: { gabineteId, papel: 'admin' },
      })
    if (updateError) {
      return {
        erro: 'Não foi possível atualizar os dados do usuário. Tente novamente.',
      }
    }
  }

  const { data: linkData, error: linkError } =
    await getSupabaseAdmin().auth.admin.generateLink({
      type: 'magiclink',
      email,
      options: {
        redirectTo: `${getAppUrl()}/auth/confirm`,
      },
    })

  if (linkError || !linkData.properties?.hashed_token) {
    return { erro: 'Não foi possível gerar o link. Tente novamente.' }
  }

  const gabinete = await prisma.gabinete.findUnique({ where: { id: gabineteId }, select: { nome: true } })
  const urlConvite = `${getAppUrl()}/auth/confirm?token_hash=${linkData.properties.hashed_token}&type=magiclink`

  try {
    await enviarEmail({
      para: email,
      assunto: `Convite para administrar ${gabinete?.nome ?? 'o gabinete'}`,
      html: templateConviteAdmin({ nomeGabinete: gabinete?.nome ?? 'o gabinete', urlConvite }),
    })
  } catch {
    return { erro: 'Não foi possível enviar o e-mail. Tente novamente.' }
  }

  return { enviado: true }
}
```

- [ ] **Step 2: Atualizar `ReenviarConviteSection` pra mostrar confirmação de envio em vez do link**

Em `src/app/super-admin/gabinetes/[id]/page.tsx`, localizar (linhas 240-268 atuais, a função inteira):

```tsx
async function ReenviarConviteSection({
  gabineteId,
  email,
}: {
  gabineteId: string
  email: string
}) {
  const resultado = await reenviarConvite(gabineteId, email)

  if (resultado.erro) {
    return (
      <div className="rounded-md bg-amber-50 border border-amber-200 p-3">
        <p className="text-sm text-amber-700">Reenvio: {resultado.erro}</p>
      </div>
    )
  }

  return (
    <div className="rounded-md bg-blue-50 border border-blue-200 p-3 space-y-2">
      <p className="text-sm font-medium text-blue-800">Link gerado — envie manualmente ao admin:</p>
      <p className="text-xs font-mono text-blue-700 break-all select-all bg-white rounded p-2 border border-blue-200">
        {resultado.link}
      </p>
      <p className="text-xs text-blue-600">
        Este link é de uso único. O Supabase não enviará e-mail automaticamente.
      </p>
    </div>
  )
}
```

Substituir por:

```tsx
async function ReenviarConviteSection({
  gabineteId,
  email,
}: {
  gabineteId: string
  email: string
}) {
  const resultado = await reenviarConvite(gabineteId, email)

  if (resultado.erro) {
    return (
      <div className="rounded-md bg-amber-50 border border-amber-200 p-3">
        <p className="text-sm text-amber-700">Reenvio: {resultado.erro}</p>
      </div>
    )
  }

  return (
    <div className="rounded-md bg-blue-50 border border-blue-200 p-3">
      <p className="text-sm text-blue-800">Convite reenviado por e-mail com sucesso.</p>
    </div>
  )
}
```

- [ ] **Step 3: Checar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros novos relacionados aos 2 arquivos desta task. (Depende da Task 1 já commitada, por `templateConviteAdmin`.)

- [ ] **Step 4: Commit**

```bash
git add src/actions/super-admin/reenviar-convite.ts "src/app/super-admin/gabinetes/[id]/page.tsx"
git commit -m "$(cat <<'EOF'
feat: reenviarConvite manda por Resend em vez de mostrar link manual

A exibição do link pra copiar/colar era um contorno do mesmo
problema do e-mail nativo do Supabase — deixa de ser necessário
com o convite principal já usando Resend (task anterior).
EOF
)"
```

---

### Task 3: Verificação final + troca de `REMETENTE_EMAIL` em produção

**Files:** nenhum arquivo de código (task de verificação + 1 ação de infraestrutura).

- [ ] **Step 1: Checar tipos e rodar a suíte de testes**

Run: `npx tsc --noEmit`
Expected: limpo, sem nenhum erro em todo o projeto.

Run: `npx vitest run`
Expected: mesmo baseline de antes deste plano (nenhum teste novo foi escrito — mudança é Server Actions + template de e-mail, sem lógica pura nova que justifique TDD; 2 falhas pré-existentes em `email.test.ts` são esperadas e não são regressão).

- [ ] **Step 2: Verificação manual no navegador — "Convidar novo admin"**

```bash
npm run dev
```

Logado como super-admin, na página de um gabinete de teste (`/super-admin/gabinetes/[id]`):
1. Convidar um e-mail **novo** (nunca usado antes no Supabase Auth deste projeto): confirma mensagem "Convite enviado com sucesso!"; e-mail chega (checar caixa de entrada real, já que `RESEND_API_KEY` não está no `.env.local` local — esse teste específico só é possível contra um ambiente com a chave configurada, ex. produção/staging, ou usando a chave de produção temporariamente como já foi feito noutras verificações desta sessão); o link do e-mail (`/auth/confirm?token_hash=...&type=invite`) funciona: loga e cai no painel do gabinete certo, com `papel=admin`.
2. Convidar um e-mail **que já existe** no Supabase Auth: confirma que ainda cai no fluxo de erro `usuario_ja_existe` (mensagem "Este e-mail já está cadastrado. Use 'Reenviar convite' abaixo.") — **este é o ponto crítico pra confirmar**: `generateLink({type:'invite'})` precisa disparar o mesmo tipo de erro que `inviteUserByEmail` disparava, pra checagem `jaExiste` (código `email_exists`/mensagem "already registered"/status 422) continuar funcionando. Se o formato do erro for diferente, ajustar a checagem `jaExiste` em `convidar-admin.ts` antes de prosseguir.

- [ ] **Step 3: Verificação manual no navegador — "Reenviar convite"**

Com o e-mail já existente do Step 2 acima, no campo que aparece depois do erro `usuario_ja_existe`: confirma que a seção "Reenviar convite" aparece, mostra "Convite reenviado por e-mail com sucesso." (não mais a caixa de copiar link), e que o e-mail chega de fato com um link `/auth/confirm?token_hash=...&type=magiclink` funcional.

- [ ] **Step 4: Troca de `REMETENTE_EMAIL` em produção (controller, ação de infraestrutura, com confirmação do usuário antes de executar)**

Via API do EasyPanel (`services.app.updateEnv`, mesmo mecanismo já usado nesta sessão): trocar `REMETENTE_EMAIL=onboarding@resend.dev` por `REMETENTE_EMAIL=naoresponda@redemobiliza.com.br` no serviço `app` (produção). Depois de aplicar, confirmar que um e-mail de teste (ex. repetir o Step 2 acima contra produção) chega com o remetente novo, não mais `onboarding@resend.dev`.

- [ ] **Step 5: Commit (se algum ajuste for necessário durante a verificação)**

Se a verificação manual não pedir nenhum ajuste, não há o que commitar nesta task — as Tasks 1-2 já cobrem todo o código. Caso a checagem `jaExiste` do Step 2 precise de ajuste, ou qualquer outro fix, aplicar e commitar com uma mensagem descrevendo o que a verificação encontrou.

---

## Self-Review

**Spec coverage:** O spec (`docs/superpowers/specs/2026-07-24-convite-admin-via-resend-design.md`) cobre: template de e-mail + `convidarAdmin` (Task 1), `reenviarConvite` + UI (Task 2), troca de `REMETENTE_EMAIL` em produção (Task 3, ação de infra fora do código). Decisão explícita de fora de escopo (campo de e-mail por gabinete no schema) — nenhuma task toca `Gabinete` ou schema.

**Placeholder scan:** Nenhum "TBD"/"implementar depois" — todo código é completo e literal, copiável direto. A única ressalva registrada como tal (não como placeholder) é o Step 2 da Task 3, que já avisa explicitamente que pode exigir ajuste se o formato de erro do `generateLink` divergir do `inviteUserByEmail` — é uma instrução de verificação com contingência clara, não uma lacuna.

**Type consistency:** `templateConviteAdmin({ nomeGabinete: string; urlConvite: string }): string` é definida na Task 1 e consumida sem alteração de assinatura na Task 2. `ReenviarResult` muda de `{link?, erro?}` pra `{enviado?, erro?}` na Task 2, e o único consumidor (`ReenviarConviteSection`, mesma task) é atualizado junto, sem nenhum outro call site de `reenviarConvite` no projeto (confirmado — só é chamada por essa página).
