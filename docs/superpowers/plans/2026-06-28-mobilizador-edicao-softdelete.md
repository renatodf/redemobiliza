# Mobilizador, Edição e Soft Delete — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar promoção a mobilizador com senha, permissões de edição por perfil, soft delete com restauração pelo super-admin e autogestão de perfil do mobilizador.

**Architecture:** Soft delete via campo `deletedAt DateTime?` nos models principais; promoção cria usuário no Supabase Auth + entrada em `UsuarioGabinete` com `papel: 'mobilizador'`; permissões verificadas server-side em cada action; page `[slug]/login` criada para capturar logins de mobilizadores e redirecionar corretamente.

**Tech Stack:** Next.js 14 App Router, Server Actions, Prisma, Supabase Auth Admin API, Tailwind CSS, Resend (opcional).

## Global Constraints

- Next.js 14.2 — `useFormState` do `react-dom` (não `useActionState` do React 19)
- Multi-tenant: todas as queries com `gabineteId` do gabinete resolvido via slug
- Soft delete: `deletedAt: null` obrigatório em TODA query de `Pessoa`, `Demanda`, `ObservacaoPessoa` e `VinculoRede`
- Permissões sempre verificadas no servidor — nunca confiar em parâmetros do cliente
- Mobilizador só opera dentro da sua rede direta (`VinculoRede.indicadoPorId = mobilizador.pessoaId`)
- E-mail via `enviarEmail()` — sem erro se `RESEND_API_KEY` ausente (já implementado)
- Nenhuma biblioteca nova de UI — usar padrões Tailwind existentes

---

## Mapa de Arquivos

**Criar:**
- `src/actions/admin/soft-delete-pessoa.ts`
- `src/actions/admin/restaurar-pessoa.ts`
- `src/actions/admin/promover-mobilizador.ts`
- `src/actions/mobilizador/promover-mobilizador.ts`
- `src/actions/mobilizador/alterar-senha.ts`
- `src/app/[slug]/login/page.tsx`
- `src/app/[slug]/admin/pessoas/[pessoaId]/PromoverMobilizadorDialog.tsx`
- `src/app/[slug]/mobilizador/AlterarSenhaDialog.tsx`

**Modificar:**
- `prisma/schema.prisma` — adicionar `deletedAt` em 4 models
- `src/actions/auth/login-admin.ts` — tratar login de mobilizador
- `src/actions/admin/editar-pessoa.ts` — permitir mobilizador editar sua rede
- `src/app/[slug]/admin/pessoas/page.tsx` — filtro deletedAt + ícone lápis
- `src/app/[slug]/admin/pessoas/[pessoaId]/page.tsx` — botões promover + excluir + edição condicional
- `src/app/[slug]/admin/demandas/page.tsx` — filtro deletedAt
- `src/app/[slug]/admin/demandas/nova/page.tsx` — filtro deletedAt
- `src/app/[slug]/admin/configuracoes/page.tsx` — painel "Cadastros excluídos" (super-admin)
- `src/app/[slug]/mobilizador/page.tsx` — botão promover + edição de rede + autogestão

---

## Task 1: Schema — Soft Delete

**Files:**
- Modify: `prisma/schema.prisma`

**Interfaces:**
- Produces: campo `deletedAt DateTime?` em `Pessoa`, `Demanda`, `ObservacaoPessoa`, `VinculoRede`

- [ ] **Step 1: Adicionar campo `deletedAt` nos 4 models**

Em `prisma/schema.prisma`, adicionar `deletedAt DateTime?` em cada model:

```prisma
model Pessoa {
  // ... campos existentes ...
  deletedAt    DateTime?
  // ...
}

model Demanda {
  // ... campos existentes ...
  deletedAt    DateTime?
  // ...
}

model ObservacaoPessoa {
  // ... campos existentes ...
  deletedAt    DateTime?
  // ...
}

model VinculoRede {
  // ... campos existentes ...
  deletedAt    DateTime?
  // ...
}
```

- [ ] **Step 2: Criar migration**

```bash
npx prisma migrate dev --name add-soft-delete
```

Expected: migration criada e aplicada, schema atualizado.

- [ ] **Step 3: Gerar client**

```bash
npx prisma generate
```

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat: adicionar deletedAt para soft delete em Pessoa, Demanda, ObservacaoPessoa e VinculoRede"
```

---

## Task 2: Filtrar deletedAt em todas as queries de listagem

**Files:**
- Modify: `src/app/[slug]/admin/pessoas/page.tsx` (linha ~19)
- Modify: `src/app/[slug]/admin/pessoas/[pessoaId]/page.tsx` (linha ~36)
- Modify: `src/app/[slug]/admin/demandas/page.tsx`
- Modify: `src/app/[slug]/admin/demandas/nova/page.tsx`
- Modify: `src/app/[slug]/mobilizador/page.tsx`

**Interfaces:**
- Consumes: campo `deletedAt` do Task 1

- [ ] **Step 1: Pessoas listing**

Em `src/app/[slug]/admin/pessoas/page.tsx`, no `findMany` de pessoas:

```typescript
where: {
  gabineteId: gabinete.id,
  deletedAt: null,  // ← adicionar
  ...(q ? { OR: [...] } : {}),
},
```

- [ ] **Step 2: Ficha da pessoa**

Em `src/app/[slug]/admin/pessoas/[pessoaId]/page.tsx`, no `findFirst`:

```typescript
where: { id: params.pessoaId, gabineteId: gabinete.id, deletedAt: null },
```

- [ ] **Step 3: Demandas — listagem e nova demanda**

Em `src/app/[slug]/admin/demandas/page.tsx`, nos `findMany` de pessoas (para filtros/selects):

```typescript
where: { gabineteId: gabinete.id, deletedAt: null }
```

Em `src/app/[slug]/admin/demandas/nova/page.tsx`, no `findMany` de pessoas:

```typescript
where: { gabineteId: gabinete.id, deletedAt: null }
```

- [ ] **Step 4: Mobilizador**

Em `src/app/[slug]/mobilizador/page.tsx`, nos `findMany` relacionados à rede:

```typescript
where: { gabineteId: gabinete.id, deletedAt: null, ... }
```

- [ ] **Step 5: Commit**

```bash
git add src/app/
git commit -m "fix: filtrar deletedAt: null em todas as queries de listagem de pessoas e demandas"
```

---

## Task 3: Action soft-delete + botão Excluir na ficha

**Files:**
- Create: `src/actions/admin/soft-delete-pessoa.ts`
- Modify: `src/app/[slug]/admin/pessoas/[pessoaId]/page.tsx`

**Interfaces:**
- Consumes: `assertAdminAccess` de `src/lib/assert-admin-access.ts`
- Produces: `softDeletePessoa(formData: FormData): Promise<void>`

- [ ] **Step 1: Criar action**

```typescript
// src/actions/admin/soft-delete-pessoa.ts
'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { assertAdminAccess } from '@/lib/assert-admin-access'

export async function softDeletePessoa(formData: FormData) {
  const slug = formData.get('slug') as string
  const pessoaId = formData.get('pessoaId') as string

  const { gabinete } = await assertAdminAccess(slug)

  await prisma.pessoa.updateMany({
    where: { id: pessoaId, gabineteId: gabinete.id },
    data: { deletedAt: new Date() },
  })

  redirect(`/${slug}/admin/pessoas`)
}
```

- [ ] **Step 2: Adicionar botão Excluir na ficha da pessoa**

Em `src/app/[slug]/admin/pessoas/[pessoaId]/page.tsx`, no bloco de botões de ação do topo (onde fica `isColaborador` e `isMobilizador`), adicionar — visível apenas para `isAdmin`:

```tsx
{isAdmin && (
  <form action={softDeletePessoa}>
    <input type="hidden" name="slug" value={params.slug} />
    <input type="hidden" name="pessoaId" value={params.pessoaId} />
    <button
      type="submit"
      className="text-sm text-red-600 hover:underline"
      onClick={(e) => {
        if (!confirm('Excluir este cadastro? A ação pode ser revertida pelo super-admin.')) e.preventDefault()
      }}
    >
      Excluir cadastro
    </button>
  </form>
)}
```

Importar a action no topo do arquivo:
```typescript
import { softDeletePessoa } from '@/actions/admin/soft-delete-pessoa'
```

- [ ] **Step 3: Testar manualmente**

1. Abrir ficha de uma pessoa como admin
2. Clicar "Excluir cadastro" → confirmar
3. Verificar que redireciona para listagem
4. Verificar que a pessoa não aparece mais na listagem
5. Confirmar no banco que `deletedAt` foi preenchido (não apagado)

- [ ] **Step 4: Commit**

```bash
git add src/actions/admin/soft-delete-pessoa.ts src/app/[slug]/admin/pessoas/[pessoaId]/page.tsx
git commit -m "feat: soft delete de pessoa — marca deletedAt sem apagar do banco"
```

---

## Task 4: Action restaurar + painel Super Admin em Configurações

**Files:**
- Create: `src/actions/admin/restaurar-pessoa.ts`
- Modify: `src/app/[slug]/admin/configuracoes/page.tsx`

**Interfaces:**
- Consumes: campo `deletedAt` do Task 1
- Produces: `restaurarPessoa(formData: FormData): Promise<void>`

- [ ] **Step 1: Criar action restaurar**

```typescript
// src/actions/admin/restaurar-pessoa.ts
'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import { getGabineteBySlug } from '@/lib/gabinete'

export async function restaurarPessoa(formData: FormData) {
  const slug = formData.get('slug') as string
  const pessoaId = formData.get('pessoaId') as string

  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.app_metadata?.role !== 'super-admin') throw new Error('Apenas super-admin pode restaurar')

  const gabinete = await getGabineteBySlug(slug)
  if (!gabinete) throw new Error('Gabinete não encontrado')

  await prisma.pessoa.updateMany({
    where: { id: pessoaId, gabineteId: gabinete.id },
    data: { deletedAt: null },
  })

  revalidatePath(`/${slug}/admin/configuracoes`)
}
```

- [ ] **Step 2: Adicionar painel em Configurações (visível apenas para super-admin)**

Em `src/app/[slug]/admin/configuracoes/page.tsx`:

Importar no topo:
```typescript
import { restaurarPessoa } from '@/actions/admin/restaurar-pessoa'
```

Adicionar query no `Promise.all`:
```typescript
// dentro do Promise.all existente, adicionar:
isSuperAdmin
  ? prisma.pessoa.findMany({
      where: { gabineteId: gabinete.id, deletedAt: { not: null } },
      orderBy: { deletedAt: 'desc' },
      select: { id: true, nome: true, whatsapp: true, deletedAt: true },
    })
  : Promise.resolve([]),
```

Antes do `Promise.all`, detectar se é super-admin:
```typescript
const role = session?.user?.app_metadata?.role as string | undefined
const isSuperAdmin = role === 'super-admin'
```

Para obter a sessão, adicionar no início da função (após `getGabineteBySlug`):
```typescript
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

// dentro do componente, antes do Promise.all:
const cookieStore = cookies()
const supabase = createServerClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { cookies: { getAll: () => cookieStore.getAll() } }
)
const { data: { session } } = await supabase.auth.getSession()
const isSuperAdmin = session?.user?.app_metadata?.role === 'super-admin'
```

Adicionar ao final da página (antes do `</div>` fechador), condicional:
```tsx
{isSuperAdmin && pessoasExcluidas.length > 0 && (
  <div className="bg-white rounded-lg shadow-sm p-6 space-y-4">
    <h2 className="text-base font-semibold text-red-700">Cadastros excluídos</h2>
    <ul className="divide-y divide-gray-200 border border-gray-200 rounded-md">
      {pessoasExcluidas.map((p) => (
        <li key={p.id} className="flex items-center justify-between px-4 py-3">
          <div>
            <p className="text-sm font-medium text-gray-900">{p.nome}</p>
            <p className="text-xs text-gray-500">
              {p.whatsapp} · excluído em {p.deletedAt!.toLocaleDateString('pt-BR')}
            </p>
          </div>
          <form action={restaurarPessoa}>
            <input type="hidden" name="slug" value={params.slug} />
            <input type="hidden" name="pessoaId" value={p.id} />
            <button type="submit" className="text-blue-600 text-xs hover:underline">
              Restaurar
            </button>
          </form>
        </li>
      ))}
    </ul>
  </div>
)}
```

- [ ] **Step 3: Commit**

```bash
git add src/actions/admin/restaurar-pessoa.ts src/app/[slug]/admin/configuracoes/page.tsx
git commit -m "feat: painel de restauração de cadastros excluídos para super-admin em Configurações"
```

---

## Task 5: Login unificado para admin e mobilizador

**Files:**
- Modify: `src/actions/auth/login-admin.ts`
- Create: `src/app/[slug]/login/page.tsx`

**Interfaces:**
- Produces: login de mobilizador redireciona para `/${slug}/mobilizador/`

- [ ] **Step 1: Atualizar `loginAdmin` para tratar mobilizador**

Em `src/actions/auth/login-admin.ts`, substituir o bloco de lookup de `UsuarioGabinete`:

```typescript
// Verificar se é admin de algum gabinete
const usuarioGabinete = await prisma.usuarioGabinete.findFirst({
  where: { userId: session.user.id, papel: 'admin' },
  include: { gabinete: { select: { slug: true, ativo: true } } },
})

if (usuarioGabinete) {
  if (!usuarioGabinete.gabinete.ativo) {
    await supabase.auth.signOut()
    redirect('/login?erro=gabinete_inativo')
  }
  redirect(`/${usuarioGabinete.gabinete.slug}/admin/`)
}

// Verificar se é mobilizador
const usuarioMobilizador = await prisma.usuarioGabinete.findFirst({
  where: { userId: session.user.id, papel: 'mobilizador' },
  include: { gabinete: { select: { slug: true, ativo: true } } },
})

if (usuarioMobilizador) {
  if (!usuarioMobilizador.gabinete.ativo) {
    await supabase.auth.signOut()
    redirect('/login?erro=gabinete_inativo')
  }
  redirect(`/${usuarioMobilizador.gabinete.slug}/mobilizador/`)
}

await supabase.auth.signOut()
redirect('/login?erro=nao_autorizado')
```

- [ ] **Step 2: Criar página `[slug]/login`**

```tsx
// src/app/[slug]/login/page.tsx
import { redirect } from 'next/navigation'

export default function SlugLoginPage({ params }: { params: { slug: string } }) {
  redirect(`/login`)
}
```

Isso resolve o redirect do middleware para `/${slug}/login` — o usuário cai em `/login` normalmente.

- [ ] **Step 3: Commit**

```bash
git add src/actions/auth/login-admin.ts src/app/[slug]/login/page.tsx
git commit -m "feat: login unificado — admin vai para painel admin, mobilizador vai para painel mobilizador"
```

---

## Task 6: Action promover-mobilizador (admin) + Dialog

**Files:**
- Create: `src/actions/admin/promover-mobilizador.ts`
- Create: `src/app/[slug]/admin/pessoas/[pessoaId]/PromoverMobilizadorDialog.tsx`
- Modify: `src/app/[slug]/admin/pessoas/[pessoaId]/page.tsx`

**Interfaces:**
- Consumes: `getSupabaseAdmin()` de `@/lib/supabase/admin`, `enviarEmail` de `@/lib/email`
- Produces: `promoverMobilizador(prevState, formData): Promise<{ erro?: string }>`

- [ ] **Step 1: Criar action**

```typescript
// src/actions/admin/promover-mobilizador.ts
'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { assertAdminAccess } from '@/lib/assert-admin-access'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { enviarEmail } from '@/lib/email'

export async function promoverMobilizador(
  _prevState: { erro?: string },
  formData: FormData
): Promise<{ erro?: string }> {
  const slug = formData.get('slug') as string
  const pessoaId = formData.get('pessoaId') as string
  const senha = formData.get('senha') as string
  const confirmarSenha = formData.get('confirmarSenha') as string

  if (senha !== confirmarSenha) return { erro: 'As senhas não conferem.' }
  if (senha.length < 6) return { erro: 'A senha deve ter pelo menos 6 caracteres.' }

  try {
    const { gabinete } = await assertAdminAccess(slug)

    const pessoa = await prisma.pessoa.findFirst({
      where: { id: pessoaId, gabineteId: gabinete.id, deletedAt: null },
      select: { id: true, nome: true, email: true, isMobilizador: true },
    })
    if (!pessoa) return { erro: 'Pessoa não encontrada.' }
    if (!pessoa.email) return { erro: 'Pessoa não tem e-mail cadastrado. Adicione um e-mail antes de promover.' }
    if (pessoa.isMobilizador) return { erro: 'Pessoa já é mobilizadora.' }

    const { data, error } = await getSupabaseAdmin().auth.admin.createUser({
      email: pessoa.email,
      password: senha,
      email_confirm: true,
    })
    if (error || !data.user) return { erro: 'Erro ao criar acesso: ' + (error?.message ?? 'desconhecido') }

    await prisma.$transaction([
      prisma.pessoa.update({
        where: { id: pessoaId },
        data: { isMobilizador: true, userId: data.user.id },
      }),
      prisma.usuarioGabinete.create({
        data: { userId: data.user.id, gabineteId: gabinete.id, papel: 'mobilizador' },
      }),
    ])

    await enviarEmail({
      para: pessoa.email,
      assunto: 'Você agora tem acesso ao painel de mobilizador',
      html: `<p>Olá, ${pessoa.nome}!</p><p>Seu acesso foi criado. Entre em <strong>/login</strong> com seu e-mail e a senha definida.</p>`,
    })

    revalidatePath(`/${slug}/admin/pessoas/${pessoaId}`)
    return {}
  } catch (e) {
    return { erro: e instanceof Error ? e.message : 'Erro desconhecido.' }
  }
}
```

- [ ] **Step 2: Criar Dialog (client component)**

```tsx
// src/app/[slug]/admin/pessoas/[pessoaId]/PromoverMobilizadorDialog.tsx
'use client'

import { useFormState } from 'react-dom'
import { promoverMobilizador } from '@/actions/admin/promover-mobilizador'

interface Props {
  slug: string
  pessoaId: string
  nomeAbreviado: string
}

export default function PromoverMobilizadorDialog({ slug, pessoaId, nomeAbreviado }: Props) {
  const [state, action, pending] = useFormState(promoverMobilizador, {})
  // useFormState é do 'react-dom' no Next.js 14

  return (
    <>
      <button
        type="button"
        className="text-sm text-purple-700 hover:underline"
        onClick={() => (document.getElementById('dialog-promover') as HTMLDialogElement)?.showModal()}
      >
        + Mobilizador
      </button>

      <dialog id="dialog-promover" className="rounded-lg shadow-xl p-6 w-full max-w-sm backdrop:bg-black/40">
        <h2 className="text-base font-semibold mb-4">Promover {nomeAbreviado} a Mobilizador</h2>
        <form action={action} className="space-y-4">
          <input type="hidden" name="slug" value={slug} />
          <input type="hidden" name="pessoaId" value={pessoaId} />
          <div>
            <label className="block text-sm font-medium text-gray-700">Senha</label>
            <input
              name="senha"
              type="password"
              required
              minLength={6}
              className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Confirmar senha</label>
            <input
              name="confirmarSenha"
              type="password"
              required
              minLength={6}
              className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
            />
          </div>
          {state.erro && (
            <p className="text-sm text-red-600">{state.erro}</p>
          )}
          {state.erro === undefined && Object.keys(state).length === 0 ? null : !state.erro ? (
            <p className="text-sm text-green-600">Mobilizador criado com sucesso!</p>
          ) : null}
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              className="text-sm text-gray-600 hover:underline"
              onClick={() => (document.getElementById('dialog-promover') as HTMLDialogElement)?.close()}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={pending}
              className="bg-purple-600 text-white px-4 py-2 rounded-md text-sm font-medium disabled:opacity-50"
            >
              {pending ? 'Salvando...' : 'Confirmar'}
            </button>
          </div>
        </form>
      </dialog>
    </>
  )
}
```

- [ ] **Step 3: Adicionar Dialog na ficha da pessoa**

Em `src/app/[slug]/admin/pessoas/[pessoaId]/page.tsx`:

Importar:
```typescript
import PromoverMobilizadorDialog from './PromoverMobilizadorDialog'
```

No bloco de botões de ação (onde fica o badge de Colaborador/Mobilizador), adicionar — visível para `isAdmin` e apenas se `!pessoa.isMobilizador`:

```tsx
{isAdmin && !pessoa.isMobilizador && (
  <PromoverMobilizadorDialog
    slug={params.slug}
    pessoaId={pessoa.id}
    nomeAbreviado={pessoa.nome.split(' ')[0]}
  />
)}
```

- [ ] **Step 4: Testar manualmente**

1. Abrir ficha de pessoa com e-mail cadastrado
2. Clicar "+ Mobilizador"
3. Inserir senha e confirmar → clicar Confirmar
4. Verificar que badge "Mobilizador" aparece na ficha
5. Fazer logout → login com e-mail da pessoa e a senha definida
6. Verificar que vai para `/${slug}/mobilizador/`

- [ ] **Step 5: Commit**

```bash
git add src/actions/admin/promover-mobilizador.ts src/app/[slug]/admin/pessoas/[pessoaId]/PromoverMobilizadorDialog.tsx src/app/[slug]/admin/pessoas/[pessoaId]/page.tsx
git commit -m "feat: promoção a mobilizador — cria credenciais Supabase, vincula UsuarioGabinete e envia e-mail"
```

---

## Task 7: Mobilizador promove pessoa da sua rede

**Files:**
- Create: `src/actions/mobilizador/promover-mobilizador.ts`
- Modify: `src/app/[slug]/mobilizador/page.tsx`

**Interfaces:**
- Consumes: `assertMobilizadorAccess` de `@/lib/assert-mobilizador-access.ts`
- Produces: `promoverMobilizadorPorMobilizador(prevState, formData): Promise<{ erro?: string }>`

- [ ] **Step 1: Criar action (com verificação de rede)**

```typescript
// src/actions/mobilizador/promover-mobilizador.ts
'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { assertMobilizadorAccess } from '@/lib/assert-mobilizador-access'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { enviarEmail } from '@/lib/email'

export async function promoverMobilizadorPorMobilizador(
  _prevState: { erro?: string },
  formData: FormData
): Promise<{ erro?: string }> {
  const slug = formData.get('slug') as string
  const pessoaId = formData.get('pessoaId') as string
  const senha = formData.get('senha') as string
  const confirmarSenha = formData.get('confirmarSenha') as string

  if (senha !== confirmarSenha) return { erro: 'As senhas não conferem.' }
  if (senha.length < 6) return { erro: 'A senha deve ter pelo menos 6 caracteres.' }

  try {
    const { gabinete, pessoa: mobilizador } = await assertMobilizadorAccess(slug)

    // Verificar que pessoaId está na rede direta do mobilizador
    const vinculo = await prisma.vinculoRede.findFirst({
      where: {
        gabineteId: gabinete.id,
        pessoaId,
        indicadoPorId: mobilizador.id,
        deletedAt: null,
      },
    })
    if (!vinculo) return { erro: 'Esta pessoa não faz parte da sua rede.' }

    const pessoa = await prisma.pessoa.findFirst({
      where: { id: pessoaId, gabineteId: gabinete.id, deletedAt: null },
      select: { id: true, nome: true, email: true, isMobilizador: true },
    })
    if (!pessoa) return { erro: 'Pessoa não encontrada.' }
    if (!pessoa.email) return { erro: 'Pessoa não tem e-mail cadastrado.' }
    if (pessoa.isMobilizador) return { erro: 'Pessoa já é mobilizadora.' }

    const { data, error } = await getSupabaseAdmin().auth.admin.createUser({
      email: pessoa.email,
      password: senha,
      email_confirm: true,
    })
    if (error || !data.user) return { erro: 'Erro ao criar acesso: ' + (error?.message ?? 'desconhecido') }

    await prisma.$transaction([
      prisma.pessoa.update({
        where: { id: pessoaId },
        data: { isMobilizador: true, userId: data.user.id },
      }),
      prisma.usuarioGabinete.create({
        data: { userId: data.user.id, gabineteId: gabinete.id, papel: 'mobilizador' },
      }),
    ])

    await enviarEmail({
      para: pessoa.email,
      assunto: 'Você agora tem acesso ao painel de mobilizador',
      html: `<p>Olá, ${pessoa.nome}!</p><p>Seu acesso foi criado. Entre em <strong>/login</strong> com seu e-mail e a senha definida.</p>`,
    })

    revalidatePath(`/${slug}/mobilizador`)
    return {}
  } catch (e) {
    return { erro: e instanceof Error ? e.message : 'Erro desconhecido.' }
  }
}
```

- [ ] **Step 2: Adicionar botão "+ Mobilizador" na lista da rede do mobilizador**

Em `src/app/[slug]/mobilizador/page.tsx`, para cada pessoa da rede, adicionar um link/dialog "+ Mobilizador" quando `!pessoa.isMobilizador`. Como o page é server component, criar um componente client separado ou usar o mesmo padrão do `PromoverMobilizadorDialog` mas importando a action do mobilizador.

Criar `src/app/[slug]/mobilizador/PromoverMobilizadorDialog.tsx` com o mesmo conteúdo do admin, mas importando `promoverMobilizadorPorMobilizador` em vez de `promoverMobilizador`.

- [ ] **Step 3: Commit**

```bash
git add src/actions/mobilizador/promover-mobilizador.ts src/app/[slug]/mobilizador/
git commit -m "feat: mobilizador pode promover pessoas da sua rede direta a mobilizador"
```

---

## Task 8: Edição por mobilizador (sua rede)

**Files:**
- Modify: `src/actions/admin/editar-pessoa.ts`
- Modify: `src/app/[slug]/mobilizador/page.tsx` (link para ficha da pessoa)

**Interfaces:**
- Consumes: `assertMobilizadorAccess` de `@/lib/assert-mobilizador-access.ts`

- [ ] **Step 1: Atualizar `editarPessoa` para aceitar mobilizador editando sua rede**

Em `src/actions/admin/editar-pessoa.ts`, substituir `assertAdminAccess` por lógica dual:

```typescript
'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getGabineteBySlug } from '@/lib/gabinete'
import { normalizeWhatsApp } from '@/lib/whatsapp'

export async function editarPessoa(formData: FormData) {
  const slug = formData.get('slug') as string
  const pessoaId = formData.get('pessoaId') as string
  const nome = (formData.get('nome') as string).trim()
  const whatsappRaw = (formData.get('whatsapp') as string | null) ?? ''
  const email = (formData.get('email') as string | null)?.trim() || null
  const regiaoId = (formData.get('regiaoId') as string | null) || null
  const profissaoId = (formData.get('profissaoId') as string | null) || null
  const genero = (formData.get('genero') as string | null) || null

  if (!nome) throw new Error('Nome é obrigatório')
  if (!whatsappRaw) throw new Error('WhatsApp é obrigatório')

  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Não autenticado')

  const gabinete = await getGabineteBySlug(slug)
  if (!gabinete) throw new Error('Gabinete não encontrado')

  const role = user.app_metadata?.role as string | undefined
  const usuarioGabinete = await prisma.usuarioGabinete.findUnique({
    where: { userId_gabineteId: { userId: user.id, gabineteId: gabinete.id } },
    select: { papel: true },
  })

  const isAdmin = usuarioGabinete?.papel === 'admin' || role === 'super-admin'
  const isMobilizador = usuarioGabinete?.papel === 'mobilizador'

  if (!isAdmin && !isMobilizador) throw new Error('Sem permissão')

  if (isMobilizador && !isAdmin) {
    // Verificar que a pessoa está na rede direta do mobilizador
    const mobilizadorPessoa = await prisma.pessoa.findFirst({
      where: { userId: user.id, gabineteId: gabinete.id, isMobilizador: true },
      select: { id: true },
    })
    if (!mobilizadorPessoa) throw new Error('Mobilizador não encontrado')

    const vinculo = await prisma.vinculoRede.findFirst({
      where: { gabineteId: gabinete.id, pessoaId, indicadoPorId: mobilizadorPessoa.id, deletedAt: null },
    })
    if (!vinculo) throw new Error('Pessoa fora da sua rede')
  }

  const whatsapp = normalizeWhatsApp(whatsappRaw)
  if (!whatsapp) throw new Error('Número de WhatsApp inválido')

  await prisma.pessoa.updateMany({
    where: { id: pessoaId, gabineteId: gabinete.id },
    data: { nome, whatsapp, email, genero, regiaoId, profissaoId },
  })

  revalidatePath(`/${slug}/admin/pessoas/${pessoaId}`)
}
```

- [ ] **Step 2: Commit**

```bash
git add src/actions/admin/editar-pessoa.ts
git commit -m "feat: mobilizador pode editar pessoas da sua rede direta"
```

---

## Task 9: Autogestão — mobilizador edita perfil próprio + altera senha

**Files:**
- Create: `src/actions/mobilizador/alterar-senha.ts`
- Create: `src/app/[slug]/mobilizador/AlterarSenhaDialog.tsx`
- Modify: `src/app/[slug]/mobilizador/page.tsx`

**Interfaces:**
- Produces: `alterarSenha(prevState, formData): Promise<{ erro?: string; sucesso?: boolean }>`

- [ ] **Step 1: Criar action de alteração de senha**

```typescript
// src/actions/mobilizador/alterar-senha.ts
'use server'

import { createSupabaseServerClient } from '@/lib/supabase/server'

export async function alterarSenha(
  _prevState: { erro?: string; sucesso?: boolean },
  formData: FormData
): Promise<{ erro?: string; sucesso?: boolean }> {
  const senhaAtual = formData.get('senhaAtual') as string
  const novaSenha = formData.get('novaSenha') as string
  const confirmarSenha = formData.get('confirmarSenha') as string

  if (novaSenha !== confirmarSenha) return { erro: 'As senhas não conferem.' }
  if (novaSenha.length < 6) return { erro: 'A nova senha deve ter pelo menos 6 caracteres.' }

  const supabase = createSupabaseServerClient()

  // Buscar e-mail do usuário atual
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return { erro: 'Usuário não encontrado.' }

  // Re-autenticar para verificar senha atual
  const { error: loginError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: senhaAtual,
  })
  if (loginError) return { erro: 'Senha atual incorreta.' }

  // Atualizar para nova senha
  const { error: updateError } = await supabase.auth.updateUser({ password: novaSenha })
  if (updateError) return { erro: 'Erro ao atualizar senha: ' + updateError.message }

  return { sucesso: true }
}
```

- [ ] **Step 2: Criar Dialog de alteração de senha**

```tsx
// src/app/[slug]/mobilizador/AlterarSenhaDialog.tsx
'use client'

import { useFormState } from 'react-dom'
import { alterarSenha } from '@/actions/mobilizador/alterar-senha'

export default function AlterarSenhaDialog() {
  const [state, action, pending] = useFormState(alterarSenha, {})

  return (
    <>
      <button
        type="button"
        className="text-sm text-gray-600 hover:underline"
        onClick={() => (document.getElementById('dialog-senha') as HTMLDialogElement)?.showModal()}
      >
        Alterar Senha
      </button>

      <dialog id="dialog-senha" className="rounded-lg shadow-xl p-6 w-full max-w-sm backdrop:bg-black/40">
        <h2 className="text-base font-semibold mb-4">Alterar Senha</h2>
        <form action={action} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Senha atual</label>
            <input name="senhaAtual" type="password" required className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Nova senha</label>
            <input name="novaSenha" type="password" required minLength={6} className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Confirmar nova senha</label>
            <input name="confirmarSenha" type="password" required minLength={6} className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm" />
          </div>
          {state.erro && <p className="text-sm text-red-600">{state.erro}</p>}
          {state.sucesso && <p className="text-sm text-green-600">Senha alterada com sucesso!</p>}
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              className="text-sm text-gray-600 hover:underline"
              onClick={() => (document.getElementById('dialog-senha') as HTMLDialogElement)?.close()}
            >
              Cancelar
            </button>
            <button type="submit" disabled={pending} className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium disabled:opacity-50">
              {pending ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </form>
      </dialog>
    </>
  )
}
```

- [ ] **Step 3: Adicionar edição do próprio perfil e botão "Alterar Senha" na página do mobilizador**

Em `src/app/[slug]/mobilizador/page.tsx`, na seção de dados do mobilizador, exibir o formulário de edição com todos os campos (igual ao form de edição existente na ficha do admin) chamando a action `editarPessoa`. Abaixo do form, renderizar `<AlterarSenhaDialog />`.

Importar:
```typescript
import AlterarSenhaDialog from './AlterarSenhaDialog'
import { editarPessoa } from '@/actions/admin/editar-pessoa'
```

A edição do próprio perfil já é permitida pela lógica do Task 8 (mobilizador edita sua rede). Para o próprio perfil, verificar também `pessoa.userId === user.id` na action `editarPessoa` — adicionar essa condição:

```typescript
const isPropriaPessoa = await prisma.pessoa.findFirst({
  where: { id: pessoaId, userId: user.id, gabineteId: gabinete.id },
})

if (!isAdmin && !isMobilizador && !isPropriaPessoa) throw new Error('Sem permissão')
```

- [ ] **Step 4: Commit**

```bash
git add src/actions/mobilizador/alterar-senha.ts src/app/[slug]/mobilizador/AlterarSenhaDialog.tsx src/app/[slug]/mobilizador/page.tsx src/actions/admin/editar-pessoa.ts
git commit -m "feat: mobilizador pode editar próprio perfil e alterar senha"
```

---

## Checklist de Cobertura do Spec

- [x] Super Admin / Admin / Mobilizador podem promover (com escopos corretos) — Tasks 6 e 7
- [x] Botão "+ Mobilizador" visível para cada perfil no escopo correto — Tasks 6 e 7
- [x] Pop-up senha + confirmação — Tasks 6 e 7
- [x] Supabase Auth criado + isMobilizador = true + e-mail boas-vindas — Tasks 6 e 7
- [x] Mobilizador vê rede, demandas, pode promover — Task 7
- [x] Mobilizador edita próprio perfil + botão Alterar Senha — Task 9
- [x] Edição por escopo (super-admin > admin > mobilizador rede) — Task 8
- [x] Ícone de lápis / edição inline — Tasks 8 (form já existe na ficha)
- [x] deletedAt em Pessoa, Demanda, ObservacaoPessoa, VinculoRede — Task 1
- [x] Filtro deletedAt: null em todas as queries — Task 2
- [x] Botão Excluir (soft delete) com confirmação — Task 3
- [x] Super Admin: vê e restaura excluídos em Configurações — Task 4
- [x] Login unificado admin/mobilizador — Task 5
