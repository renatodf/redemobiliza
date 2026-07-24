# Botão "+Admin" na ficha + lista de admins no super-admin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A ficha da pessoa ganha um botão **+Admin** (mesmo padrão do `+Mobilizador` já existente — dialog com senha, cria/reaproveita conta no Supabase), num grid 2×2 junto com Colaborador/Mobilizador/Banco de Talentos. O painel do super-admin passa a listar os admins de cada gabinete pelo nome (quando há `Pessoa` vinculada) ou e-mail (admins legados sem ficha), com ícone de editar (entra em modo suporte e vai direto pra ficha) e de excluir (remove o acesso).

**Architecture:** Novo campo `Pessoa.isAdmin` (mesmo padrão de `isColaborador`/`isMobilizador`). Duas novas Server Actions no namespace `admin` (`promoverAdmin`, `removerAdmin`) espelhando `promoverMobilizador`/`revogarMobilizador` byte a byte na estrutura, reaproveitando a função de criação de conta já existente (renomeada pra um nome neutro, já que passa a servir dois papéis). `removerAdmin` é reaproveitada tanto pelo botão da ficha quanto pelo ícone de lixeira do super-admin (mesma assinatura `slug+pessoaId`, e `assertAdminAccess` já trata `role==='super-admin'` como admin de qualquer gabinete). Admins "legados" sem `Pessoa` vinculada (convidados por e-mail antes desta feature existir) usam uma Server Action separada e mais simples, restrita a super-admin, que só mexe em `UsuarioGabinete` (não existe `Pessoa`/ficha pra esses).

**Tech Stack:** Next.js 14 (App Router) + React 18 + TypeScript 5 + Tailwind 3.4 + Prisma 7.8 + Supabase Auth.

## Global Constraints

- Uma pessoa só tem um papel (`admin` ou `mobilizador`) por gabinete de cada vez. Promover a admin quem já é mobilizador **substitui** o papel (remove o vínculo de mobilizador na mesma transação) — decisão do usuário, não é bloqueado nem acumulado.
- Se a `Pessoa` já tem `userId` (ex.: já foi mobilizadora antes), a promoção a admin **reaproveita a conta Supabase existente redefinindo a senha** (`auth.admin.updateUserById`), em vez de tentar criar uma conta nova com o mesmo e-mail — criar uma nova falharia (e-mail já cadastrado) e cairia no caminho de erro de "conta órfã" da função de criação de conta, que não sabe que a conta "órfã" na verdade já pertence a esta mesma pessoa.
- Remover o admin de alguém não tem trava especial (pode zerar todos os admins do gabinete) — decisão do usuário. Espelha exatamente o comportamento já existente de `revogarMobilizador` (zera `Pessoa.userId` também, mesmo padrão).
- `criarOuReaproveitarUsuarioMobilizador` (`src/lib/supabase/criar-usuario-mobilizador.ts`) é renomeada pra `criarOuReaproveitarUsuarioAcesso` (`src/lib/supabase/criar-usuario-acesso.ts`) — passa a servir os dois fluxos (mobilizador e admin), sem nenhuma mudança de lógica interna.
- Nenhuma mudança em `convidarAdmin`/`reenviarConvite` (fluxo de convite por e-mail do super-admin) — continua existindo, inalterado, como caminho secundário.

Spec completo: `docs/superpowers/specs/2026-07-23-admin-via-ficha-design.md`.

---

### Task 1: Fundação — schema + rename da lib de criação de conta

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260723120000_pessoa_is_admin/migration.sql`
- Create: `src/lib/supabase/criar-usuario-acesso.ts` (conteúdo idêntico ao arquivo atual, só renomeado)
- Delete: `src/lib/supabase/criar-usuario-mobilizador.ts`
- Modify: `src/actions/admin/promover-mobilizador.ts`

**Interfaces:**
- Produces: `Pessoa.isAdmin: boolean` (novo campo, disponível em qualquer `prisma.pessoa.findFirst`/`findMany` sem precisar adicionar a nenhum `select` existente — os call sites atuais usam `include` ou já retornam todos os escalares). `criarOuReaproveitarUsuarioAcesso(supabaseAdmin: SupabaseClient, email: string, senha: string): Promise<{userId: string} | {erro: string}>` — mesma assinatura de antes, só o nome muda.

- [ ] **Step 1: Adicionar `isAdmin` ao modelo `Pessoa`**

Em `prisma/schema.prisma`, localizar (linhas 135-137 atuais):

```prisma
  isColaborador    Boolean   @default(false)
  isMobilizador    Boolean   @default(false)
  tokenMobilizador String?
```

Substituir por:

```prisma
  isColaborador    Boolean   @default(false)
  isMobilizador    Boolean   @default(false)
  tokenMobilizador String?
  isAdmin          Boolean   @default(false)
```

- [ ] **Step 2: Criar a migration**

Criar o diretório `prisma/migrations/20260723120000_pessoa_is_admin/` com o arquivo `migration.sql`:

```sql
-- prisma/migrations/20260723120000_pessoa_is_admin/migration.sql

-- Novo campo pra marcar uma Pessoa como administradora do gabinete (mesmo
-- padrão de isColaborador/isMobilizador) — permite promover alguém a admin
-- direto pela ficha, sem passar pelo convite por e-mail do super-admin.
ALTER TABLE "Pessoa" ADD COLUMN "isAdmin" BOOLEAN NOT NULL DEFAULT false;
```

- [ ] **Step 3: Gerar o Prisma Client**

Run: `npx prisma generate`
Expected: `✔ Generated Prisma Client` sem erros.

**Não aplicar a migration contra o banco neste step** (nem `npx prisma migrate dev`, nem `db execute`) — o `.env.local` deste projeto aponta pro banco de **produção** (confirmado em sessão anterior, ver HANDOFF), então aplicar migration é uma ação de infraestrutura, feita manualmente pelo controller depois que todas as tasks de código deste plano estiverem prontas e revisadas — mesmo padrão já usado nas fases da importação Izalci (seção 24 do HANDOFF: SQL direto + `prisma migrate resolve --applied`, em staging e produção).

- [ ] **Step 4: Renomear a lib de criação de conta**

Ler o conteúdo atual de `src/lib/supabase/criar-usuario-mobilizador.ts` e criar `src/lib/supabase/criar-usuario-acesso.ts` com o **mesmo conteúdo**, só trocando:
- O nome da função exportada: `criarOuReaproveitarUsuarioMobilizador` → `criarOuReaproveitarUsuarioAcesso`.
- O comentário JSDoc acima da função, que hoje diz "Cria um usuário no Supabase Auth para promoção a mobilizador" — trocar pra "Cria um usuário no Supabase Auth para promoção a mobilizador ou administrador" (o resto do comentário, sobre nunca reaproveitar conta existente automaticamente, continua válido e não muda).

Depois de criar o arquivo novo, apagar `src/lib/supabase/criar-usuario-mobilizador.ts`.

- [x] **Step 5: Atualizar os call sites existentes**

**Correção pós-implementação (aplicada pelo controller, commit `6654b81`)**: o plano original dizia "único call site" — na verdade existem **dois**. `npx tsc --noEmit` pegou o segundo (`src/actions/mobilizador/promover-mobilizador.ts`, a action `promoverMobilizadorPorMobilizador`) que o levantamento original não tinha achado. Corrigido com o mesmo par de substituições abaixo, nos dois arquivos.

Em `src/actions/admin/promover-mobilizador.ts`, localizar (linha 6 atual):

```ts
import { criarOuReaproveitarUsuarioMobilizador } from '@/lib/supabase/criar-usuario-mobilizador'
```

Substituir por:

```ts
import { criarOuReaproveitarUsuarioAcesso } from '@/lib/supabase/criar-usuario-acesso'
```

Localizar (linha 33 atual):

```ts
    const resultado = await criarOuReaproveitarUsuarioMobilizador(getSupabaseAdmin(), pessoa.email, senha)
```

Substituir por:

```ts
    const resultado = await criarOuReaproveitarUsuarioAcesso(getSupabaseAdmin(), pessoa.email, senha)
```

Em `src/actions/mobilizador/promover-mobilizador.ts` (a action `promoverMobilizadorPorMobilizador`, mobilizador promovendo alguém da própria rede direta a mobilizador), o mesmo par de substituições (linhas 7 e 44 atuais):

```ts
import { criarOuReaproveitarUsuarioMobilizador } from '@/lib/supabase/criar-usuario-mobilizador'
```
→
```ts
import { criarOuReaproveitarUsuarioAcesso } from '@/lib/supabase/criar-usuario-acesso'
```

```ts
    const resultado = await criarOuReaproveitarUsuarioMobilizador(getSupabaseAdmin(), pessoa.email, senha)
```
→
```ts
    const resultado = await criarOuReaproveitarUsuarioAcesso(getSupabaseAdmin(), pessoa.email, senha)
```

- [ ] **Step 6: Checar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros novos relacionados aos arquivos desta task.

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260723120000_pessoa_is_admin src/lib/supabase/criar-usuario-acesso.ts src/actions/admin/promover-mobilizador.ts
git rm src/lib/supabase/criar-usuario-mobilizador.ts
git commit -m "$(cat <<'EOF'
feat: campo Pessoa.isAdmin + generaliza lib de criação de conta

Fundação pro botão +Admin: novo campo isAdmin (mesmo padrão de
isColaborador/isMobilizador) e renomeia a função de criação/reuso
de conta Supabase pra um nome neutro, já que passa a servir tanto
promoção a mobilizador quanto a administrador. Migration ainda não
aplicada contra o banco — feito manualmente pelo controller depois
que o plano inteiro estiver revisado.
EOF
)"
```

---

### Task 2: Server Action + dialog "+Admin"

**Files:**
- Create: `src/actions/admin/promover-admin.ts`
- Create: `src/app/[slug]/admin/pessoas/[pessoaId]/PromoverAdminDialog.tsx`

**Interfaces:**
- Consumes: `criarOuReaproveitarUsuarioAcesso` (Task 1), `assertAdminAccess` (`@/lib/assert-admin-access`), `getSupabaseAdmin` (`@/lib/supabase/admin`), `enviarEmail`/`escapeHtml` (`@/lib/email`).
- Produces: `promoverAdmin(_prevState: {erro?: string}, formData: FormData): Promise<{erro?: string}>` — mesma assinatura de `promoverMobilizador`, usável com `useFormState`. `PromoverAdminDialog` — mesmos props de `PromoverMobilizadorDialog` (`slug`, `pessoaId`, `nomeAbreviado`, `corPrimaria`).

- [ ] **Step 1: Criar a Server Action `promoverAdmin`**

Criar `src/actions/admin/promover-admin.ts`:

```ts
'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { assertAdminAccess } from '@/lib/assert-admin-access'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { criarOuReaproveitarUsuarioAcesso } from '@/lib/supabase/criar-usuario-acesso'
import { enviarEmail, escapeHtml } from '@/lib/email'

export async function promoverAdmin(
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
      select: { id: true, nome: true, email: true, userId: true, isAdmin: true, isMobilizador: true },
    })
    if (!pessoa) return { erro: 'Pessoa não encontrada.' }
    if (!pessoa.email) return { erro: 'Pessoa não tem e-mail cadastrado. Adicione um e-mail antes de promover.' }
    if (pessoa.isAdmin) return { erro: 'Pessoa já é administradora.' }

    // Se a pessoa já tem conta (ex.: já foi mobilizadora), reaproveita a
    // conta existente redefinindo a senha — criar uma conta nova com o
    // mesmo e-mail falharia e cairia no caminho de "conta órfã" de
    // criarOuReaproveitarUsuarioAcesso, que não sabe que a conta já é desta
    // mesma pessoa.
    let userId: string
    if (pessoa.userId) {
      const { error: pwError } = await getSupabaseAdmin().auth.admin.updateUserById(pessoa.userId, { password: senha })
      if (pwError) return { erro: 'Erro ao atualizar senha: ' + pwError.message }
      userId = pessoa.userId
    } else {
      const resultado = await criarOuReaproveitarUsuarioAcesso(getSupabaseAdmin(), pessoa.email, senha)
      if ('erro' in resultado) return { erro: resultado.erro }
      userId = resultado.userId
    }

    try {
      await prisma.$transaction([
        ...(pessoa.isMobilizador
          ? [
              prisma.pessoa.update({
                where: { id: pessoaId },
                data: { isMobilizador: false, tokenMobilizador: null },
              }),
              prisma.usuarioGabinete.deleteMany({
                where: { userId, gabineteId: gabinete.id, papel: 'mobilizador' },
              }),
            ]
          : []),
        prisma.pessoa.update({
          where: { id: pessoaId },
          data: { isAdmin: true, userId },
        }),
        prisma.usuarioGabinete.create({
          data: { userId, gabineteId: gabinete.id, papel: 'admin' },
        }),
      ])
    } catch (txError) {
      if (!pessoa.userId) {
        await getSupabaseAdmin().auth.admin.deleteUser(userId)
      }
      throw txError
    }

    await enviarEmail({
      para: pessoa.email,
      assunto: 'Você agora tem acesso ao painel de administrador',
      html: `<p>Olá, ${escapeHtml(pessoa.nome)}!</p><p>Seu acesso foi criado. Entre em <strong>/login</strong> com seu e-mail e a senha definida.</p>`,
    })

    revalidatePath(`/${slug}/admin/pessoas/${pessoaId}`)
    return {}
  } catch (e) {
    return { erro: e instanceof Error ? e.message : 'Erro desconhecido.' }
  }
}
```

Note o `if (!pessoa.userId)` no `catch` do `try/catch` da transação: só apaga o usuário Supabase recém-criado se ele foi de fato criado agora nesta chamada — se a conta já existia (pessoa já tinha `userId`), a transação falhando não deve apagar a conta da pessoa, só deixar de aplicar a mudança de papel.

- [ ] **Step 2: Criar o dialog `PromoverAdminDialog`**

Criar `src/app/[slug]/admin/pessoas/[pessoaId]/PromoverAdminDialog.tsx`, com o mesmo layout/estrutura de `PromoverMobilizadorDialog.tsx` (mesmo diretório) — só troca o texto e a Server Action:

```tsx
'use client'

import { useFormState } from 'react-dom'
import { promoverAdmin } from '@/actions/admin/promover-admin'
import { corTextoContraste } from '@/lib/cor-contraste'

interface Props {
  slug: string
  pessoaId: string
  nomeAbreviado: string
  corPrimaria: string
}

export default function PromoverAdminDialog({ slug, pessoaId, nomeAbreviado, corPrimaria }: Props) {
  const [state, action, pending] = useFormState(promoverAdmin, {})
  const corTexto = corTextoContraste(corPrimaria)

  return (
    <>
      <button
        type="button"
        style={{ backgroundColor: corPrimaria, color: corTexto }}
        className="text-[11px] px-2.5 py-1 rounded-md hover:opacity-90 font-medium"
        onClick={() => (document.getElementById('dialog-promover-admin') as HTMLDialogElement)?.showModal()}
      >
        + Admin
      </button>

      <dialog id="dialog-promover-admin" className="rounded-lg shadow-xl p-6 w-full max-w-sm backdrop:bg-black/40">
        <h2 className="text-base font-semibold mb-4">Promover {nomeAbreviado} a Administrador</h2>
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
            <p className="text-sm text-green-600">Administrador criado com sucesso!</p>
          ) : null}
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              className="text-sm text-gray-600 hover:underline"
              onClick={() => (document.getElementById('dialog-promover-admin') as HTMLDialogElement)?.close()}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={pending}
              style={{ backgroundColor: corPrimaria, color: corTexto }}
              className="px-4 py-2 rounded-md text-sm font-medium disabled:opacity-50"
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

- [ ] **Step 3: Checar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros novos relacionados aos 2 arquivos desta task. (Esta task depende da Task 1 já commitada — `Pessoa.isAdmin` e `criarOuReaproveitarUsuarioAcesso` precisam existir.)

- [ ] **Step 4: Commit**

```bash
git add src/actions/admin/promover-admin.ts "src/app/[slug]/admin/pessoas/[pessoaId]/PromoverAdminDialog.tsx"
git commit -m "$(cat <<'EOF'
feat: Server Action e dialog do botão +Admin

Espelha promoverMobilizador/PromoverMobilizadorDialog. Substitui o
papel de mobilizador quando presente; reaproveita conta Supabase já
existente (redefinindo a senha) em vez de tentar criar uma nova com
o mesmo e-mail.
EOF
)"
```

---

### Task 3: Server Action + botão "Remover admin"

**Files:**
- Create: `src/actions/admin/remover-admin.ts`
- Create: `src/app/[slug]/admin/pessoas/[pessoaId]/RemoverAdminButton.tsx`

**Interfaces:**
- Produces: `removerAdmin(formData: FormData): Promise<{erro?: string}>` — lê `slug`/`pessoaId` do FormData, igual a `revogarMobilizador`. `RemoverAdminButton` — props `{slug, pessoaId, nome, corPrimaria?, iconOnly?}`; quando `iconOnly` é `true`, renderiza só o ícone `IconeExcluir` (sem o texto "Remover admin") — **este componente será reaproveitado na Task 5 pelo painel do super-admin**, por isso o prop `iconOnly` já nasce aqui.

- [ ] **Step 1: Criar a Server Action `removerAdmin`**

Criar `src/actions/admin/remover-admin.ts`:

```ts
'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { assertAdminAccess } from '@/lib/assert-admin-access'

export async function removerAdmin(formData: FormData): Promise<{ erro?: string }> {
  const slug = formData.get('slug') as string
  const pessoaId = formData.get('pessoaId') as string

  try {
    const { gabinete } = await assertAdminAccess(slug)

    const pessoa = await prisma.pessoa.findFirst({
      where: { id: pessoaId, gabineteId: gabinete.id },
      select: { id: true, userId: true, isAdmin: true },
    })
    if (!pessoa) return { erro: 'Pessoa não encontrada' }
    if (!pessoa.isAdmin) return { erro: 'Esta pessoa não é administradora' }

    await prisma.$transaction(async (tx) => {
      await tx.pessoa.update({
        where: { id: pessoaId },
        data: { isAdmin: false, userId: null },
      })

      if (pessoa.userId) {
        await tx.usuarioGabinete.deleteMany({
          where: {
            userId: pessoa.userId,
            gabineteId: gabinete.id,
            papel: 'admin',
          },
        })
      }
    })

    revalidatePath(`/${slug}/admin/pessoas/${pessoaId}`)
    revalidatePath(`/super-admin/gabinetes/${gabinete.id}`)
    return {}
  } catch (err: unknown) {
    return { erro: err instanceof Error ? err.message : 'Erro inesperado' }
  }
}
```

- [ ] **Step 2: Criar o botão `RemoverAdminButton`**

Criar `src/app/[slug]/admin/pessoas/[pessoaId]/RemoverAdminButton.tsx`, mesmo padrão de `RevogarMobilizadorTopButton.tsx` (mesmo diretório), com o prop `iconOnly` adicional (mesma ideia de `ExcluirPessoaButton.tsx`, que já tem esse prop hoje):

```tsx
'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { removerAdmin } from '@/actions/admin/remover-admin'
import { IconeExcluir } from '@/components/admin/TableIcons'

export default function RemoverAdminButton({
  slug,
  pessoaId,
  nome,
  corPrimaria,
  iconOnly = false,
}: {
  slug: string
  pessoaId: string
  nome: string
  corPrimaria?: string
  iconOnly?: boolean
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function handleClick() {
    if (!confirm(`Remover o acesso de administrador de ${nome}?`)) return
    const formData = new FormData()
    formData.set('slug', slug)
    formData.set('pessoaId', pessoaId)
    startTransition(async () => {
      await removerAdmin(formData)
      router.refresh()
    })
  }

  if (iconOnly) {
    return (
      <button type="button" onClick={handleClick} disabled={isPending} aria-label={`Remover admin ${nome}`}>
        <IconeExcluir />
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      style={corPrimaria ? { backgroundColor: '#fff', color: corPrimaria, border: `1px solid ${corPrimaria}` } : undefined}
      className="text-[11px] px-2.5 py-1 rounded-md hover:opacity-90 font-medium disabled:opacity-50"
    >
      {isPending ? 'Removendo...' : 'Remover admin'}
    </button>
  )
}
```

- [ ] **Step 3: Checar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros novos relacionados aos 2 arquivos desta task.

- [ ] **Step 4: Commit**

```bash
git add src/actions/admin/remover-admin.ts "src/app/[slug]/admin/pessoas/[pessoaId]/RemoverAdminButton.tsx"
git commit -m "$(cat <<'EOF'
feat: Server Action e botão "Remover admin"

Espelha revogarMobilizador/RevogarMobilizadorTopButton. Ganha prop
iconOnly desde já — será reaproveitado pelo painel do super-admin
numa task futura deste mesmo plano.
EOF
)"
```

---

### Task 4: Ficha da pessoa — grid 2×2

**Files:**
- Modify: `src/app/[slug]/admin/pessoas/[pessoaId]/page.tsx`

**Interfaces:**
- Consumes: `PromoverAdminDialog` (Task 2), `RemoverAdminButton` (Task 3) — ambos em `iconOnly=false` (padrão) nesta task.

- [ ] **Step 1: Importar os dois novos componentes**

Localizar (linhas 15-17 atuais):

```tsx
import PromoverMobilizadorDialog from './PromoverMobilizadorDialog'
import RevogarMobilizadorTopButton from './RevogarMobilizadorTopButton'
import ExcluirPessoaButton from './ExcluirPessoaButton'
```

Substituir por:

```tsx
import PromoverMobilizadorDialog from './PromoverMobilizadorDialog'
import RevogarMobilizadorTopButton from './RevogarMobilizadorTopButton'
import PromoverAdminDialog from './PromoverAdminDialog'
import RemoverAdminButton from './RemoverAdminButton'
import ExcluirPessoaButton from './ExcluirPessoaButton'
```

- [ ] **Step 2: Trocar a coluna vertical de botões por um grid 2×2, com o rótulo do Colaborador encurtado e o `+Admin`/`Remover admin` na posição certa**

Localizar o bloco inteiro (linhas 162-213 atuais, do `<div className="flex flex-col items-end gap-2">` até o fechamento do `<BancoTalentosDialog>`):

```tsx
          <div className="flex flex-col items-end gap-2">
            <form action={toggleColaborador}>
              <input type="hidden" name="slug" value={params.slug} />
              <input type="hidden" name="pessoaId" value={pessoa.id} />
              <input type="hidden" name="acao" value={pessoa.isColaborador ? 'desmarcar' : 'marcar'} />
              <button
                type="submit"
                style={
                  pessoa.isColaborador
                    ? { backgroundColor: '#fff', color: gabinete.corPrimaria, border: `1px solid ${gabinete.corPrimaria}` }
                    : { backgroundColor: gabinete.corPrimaria, color: corTextoContraste(gabinete.corPrimaria) }
                }
                className="text-[11px] px-2.5 py-1 rounded-md hover:opacity-90 font-medium"
              >
                {pessoa.isColaborador ? 'Remover como colaborador' : 'Marcar como colaborador'}
              </button>
            </form>
            {isAdmin && (
              pessoa.isMobilizador ? (
                <RevogarMobilizadorTopButton
                  slug={params.slug}
                  pessoaId={pessoa.id}
                  nome={pessoa.nome}
                  corPrimaria={gabinete.corPrimaria}
                />
              ) : (
                <PromoverMobilizadorDialog
                  slug={params.slug}
                  pessoaId={pessoa.id}
                  nomeAbreviado={pessoa.nome.split(' ')[0]}
                  corPrimaria={gabinete.corPrimaria}
                />
              )
            )}
            {isAdmin && (
              <BancoTalentosDialog
                slug={params.slug}
                pessoaId={pessoa.id}
                primeiroNome={pessoa.nome.split(' ')[0]}
                jaCadastrado={!!pessoa.bancoTalentos}
                areasDisponiveis={areasColocacao}
                corPrimaria={gabinete.corPrimaria}
                bancoTalentos={
                  pessoa.bancoTalentos
                    ? {
                        curriculoUrl: pessoa.bancoTalentos.curriculoUrl,
                        prioridade: pessoa.bancoTalentos.prioridade,
                        isPcd: pessoa.bancoTalentos.isPcd,
                        observacao: pessoa.bancoTalentos.observacao,
                        colocado: pessoa.bancoTalentos.colocado,
                        areaIds: pessoa.bancoTalentos.areas.map((a) => a.areaColocacaoId),
```

(o restante do `BancoTalentosDialog` continua depois dessa linha, sem mudar — só o `<div>` que envolve tudo muda de `flex flex-col` pra `grid`.)

Localizar especificamente a linha de abertura (linha 162 atual):

```tsx
          <div className="flex flex-col items-end gap-2">
```

Substituir por:

```tsx
          <div className="grid grid-cols-2 gap-2">
```

Localizar especificamente o texto dos dois estados do botão de colaborador (linha 176 atual):

```tsx
                {pessoa.isColaborador ? 'Remover como colaborador' : 'Marcar como colaborador'}
```

Substituir por:

```tsx
                {pessoa.isColaborador ? 'Remover colaborador' : '+ Colaborador'}
```

Localizar o bloco do `{isAdmin && (<BancoTalentosDialog ...>` (linha 196 atual, ANTES do bloco do BancoTalentosDialog) e inserir o bloco do `+Admin`/`Remover admin` logo antes dele:

```tsx
            {isAdmin && (
              <BancoTalentosDialog
```

Substituir por:

```tsx
            {isAdmin && (
              pessoa.isAdmin ? (
                <RemoverAdminButton
                  slug={params.slug}
                  pessoaId={pessoa.id}
                  nome={pessoa.nome}
                  corPrimaria={gabinete.corPrimaria}
                />
              ) : (
                <PromoverAdminDialog
                  slug={params.slug}
                  pessoaId={pessoa.id}
                  nomeAbreviado={pessoa.nome.split(' ')[0]}
                  corPrimaria={gabinete.corPrimaria}
                />
              )
            )}
            {isAdmin && (
              <BancoTalentosDialog
```

Resultado final da ordem no grid: Colaborador (topo-esquerda), Mobilizador (topo-direita), Admin (baixo-esquerda), Banco de Talentos (baixo-direita) — batendo com a ordem em que os componentes aparecem no JSX (grid de 2 colunas preenche linha por linha).

- [ ] **Step 3: Checar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros novos relacionados a este arquivo. (Depende das Tasks 2 e 3 já commitadas.)

- [ ] **Step 4: Commit**

```bash
git add "src/app/[slug]/admin/pessoas/[pessoaId]/page.tsx"
git commit -m "$(cat <<'EOF'
feat: grid 2x2 de botões na ficha, com +Admin

Colaborador/Mobilizador em cima, Admin/Banco de Talentos embaixo.
Rótulo do Colaborador encurtado pra +Colaborador/Remover colaborador,
mesmo padrão visual dos outros três.
EOF
)"
```

---

### Task 5: `entrarModoSuporte` com destino opcional + painel do super-admin

**Files:**
- Modify: `src/actions/super-admin/modo-suporte.ts`
- Create: `src/actions/super-admin/remover-admin-legado.ts`
- Modify: `src/app/super-admin/gabinetes/[id]/page.tsx`

**Interfaces:**
- Consumes: `RemoverAdminButton` (Task 3, com `iconOnly={true}`), `entrarModoSuporte` (modificado nesta task).
- Produces: `entrarModoSuporte(gabineteId: string, redirectPath?: string)` — assinatura estendida, retrocompatível (o único outro call site, o próprio botão "Entrar em modo suporte" já existente nesta mesma página, continua passando só `gabineteId` via `.bind(null, gabinete.id)` e cai no padrão `/${slug}/admin/`). `removerAdminLegado(gabineteId: string, userId: string): Promise<void>` — restrito a super-admin, sem tocar em `Pessoa` (não existe pra esses admins).

- [ ] **Step 1: `entrarModoSuporte` ganha `redirectPath` opcional**

Em `src/actions/super-admin/modo-suporte.ts`, localizar (linhas 12-42 atuais):

```ts
export async function entrarModoSuporte(gabineteId: string) {
  const supabase = createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user || user.app_metadata?.role !== 'super-admin') {
    redirect('/super-admin/login')
  }

  const sessaoId = gerarSessaoId()

  await prisma.logSuporte.create({
    data: {
      gabineteId,
      superAdminUserId: user.id,
      acao: 'acesso_inicio',
      sessaoId,
    },
  })

  cookies().set('suporteSessao', JSON.stringify({ gabineteId, sessaoId }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
  })

  const gabinete = await prisma.gabinete.findUnique({
    where: { id: gabineteId },
    select: { slug: true },
  })

  redirect(`/${gabinete?.slug ?? ''}/admin/`)
}
```

Substituir por:

```ts
export async function entrarModoSuporte(gabineteId: string, redirectPath?: string) {
  const supabase = createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user || user.app_metadata?.role !== 'super-admin') {
    redirect('/super-admin/login')
  }

  const sessaoId = gerarSessaoId()

  await prisma.logSuporte.create({
    data: {
      gabineteId,
      superAdminUserId: user.id,
      acao: 'acesso_inicio',
      sessaoId,
    },
  })

  cookies().set('suporteSessao', JSON.stringify({ gabineteId, sessaoId }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
  })

  const gabinete = await prisma.gabinete.findUnique({
    where: { id: gabineteId },
    select: { slug: true },
  })

  redirect(redirectPath ?? `/${gabinete?.slug ?? ''}/admin/`)
}
```

- [ ] **Step 2: Criar `removerAdminLegado`**

Criar `src/actions/super-admin/remover-admin-legado.ts`:

```ts
'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { createSupabaseServerClient } from '@/lib/supabase/server'

async function assertSuperAdmin() {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.app_metadata?.role !== 'super-admin') {
    redirect('/super-admin/login')
  }
}

// Remove o acesso de admin de um usuário sem Pessoa vinculada (convidado por
// e-mail antes do botão +Admin existir na ficha) — só mexe em
// UsuarioGabinete, não existe ficha/Pessoa pra atualizar.
export async function removerAdminLegado(gabineteId: string, userId: string) {
  await assertSuperAdmin()

  await prisma.usuarioGabinete.deleteMany({
    where: { userId, gabineteId, papel: 'admin' },
  })

  revalidatePath(`/super-admin/gabinetes/${gabineteId}`)
}
```

- [ ] **Step 3: Reescrever a seção "Administradores" do painel do super-admin**

Em `src/app/super-admin/gabinetes/[id]/page.tsx`, localizar o import (linhas 1-7 atuais):

```tsx
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { convidarAdmin } from '@/actions/super-admin/convidar-admin'
import { reenviarConvite } from '@/actions/super-admin/reenviar-convite'
import { toggleGabinete } from '@/actions/super-admin/toggle-gabinete'
import { entrarModoSuporte } from '@/actions/super-admin/modo-suporte'
```

Substituir por:

```tsx
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { convidarAdmin } from '@/actions/super-admin/convidar-admin'
import { reenviarConvite } from '@/actions/super-admin/reenviar-convite'
import { toggleGabinete } from '@/actions/super-admin/toggle-gabinete'
import { entrarModoSuporte } from '@/actions/super-admin/modo-suporte'
import { removerAdminLegado } from '@/actions/super-admin/remover-admin-legado'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import RemoverAdminButton from '@/app/[slug]/admin/pessoas/[pessoaId]/RemoverAdminButton'
import { IconeEditar } from '@/components/admin/TableIcons'
```

Localizar a query de admins (linhas 49-53 atuais):

```tsx
  const admins = await prisma.usuarioGabinete.findMany({
    where: { gabineteId: gabinete.id, papel: 'admin' },
    select: { id: true, userId: true, criadoEm: true },
    orderBy: { criadoEm: 'asc' },
  })
```

Substituir por (busca também as `Pessoa`s vinculadas, e resolve e-mail via Supabase Auth pros admins sem `Pessoa`):

```tsx
  const admins = await prisma.usuarioGabinete.findMany({
    where: { gabineteId: gabinete.id, papel: 'admin' },
    select: { id: true, userId: true, criadoEm: true },
    orderBy: { criadoEm: 'asc' },
  })

  const pessoasVinculadas = await prisma.pessoa.findMany({
    where: {
      gabineteId: gabinete.id,
      isAdmin: true,
      deletedAt: null,
      userId: { in: admins.map((a) => a.userId) },
    },
    select: { id: true, nome: true, userId: true },
  })
  const pessoaPorUserId = new Map(pessoasVinculadas.map((p) => [p.userId, p]))

  const adminsComRotulo = await Promise.all(
    admins.map(async (a) => {
      const pessoa = pessoaPorUserId.get(a.userId)
      if (pessoa) return { ...a, pessoa, email: null as string | null }
      const { data } = await getSupabaseAdmin().auth.admin.getUserById(a.userId)
      return { ...a, pessoa: null, email: data.user?.email ?? null }
    })
  )
```

Localizar o bloco de renderização da lista (linhas 105-124 atuais):

```tsx
      <div className="space-y-3">
        <h2 className="text-base font-semibold text-gray-900">Administradores</h2>
        {admins.length === 0 ? (
          <p className="text-sm text-gray-400">Nenhum admin cadastrado ainda.</p>
        ) : (
          <ul className="space-y-2">
            {admins.map((a) => (
              <li
                key={a.id}
                className="rounded-md border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700"
              >
                <span className="font-mono text-xs text-gray-500">{a.userId}</span>
                <span className="ml-3 text-gray-400 text-xs">
                  desde {new Date(a.criadoEm).toLocaleDateString('pt-BR')}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
```

Substituir por:

```tsx
      <div className="space-y-3">
        <h2 className="text-base font-semibold text-gray-900">Administradores</h2>
        {adminsComRotulo.length === 0 ? (
          <p className="text-sm text-gray-400">Nenhum admin cadastrado ainda.</p>
        ) : (
          <ul className="space-y-2">
            {adminsComRotulo.map((a) => (
              <li
                key={a.id}
                className="flex items-center justify-between rounded-md border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700"
              >
                <div>
                  <span>{a.pessoa ? a.pessoa.nome : (a.email ?? a.userId)}</span>
                  <span className="ml-3 text-gray-400 text-xs">
                    desde {new Date(a.criadoEm).toLocaleDateString('pt-BR')}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  {a.pessoa && (
                    <form
                      action={entrarModoSuporte.bind(
                        null,
                        gabinete.id,
                        `/${gabinete.slug}/admin/pessoas/${a.pessoa.id}`
                      )}
                    >
                      <button type="submit" aria-label={`Editar ${a.pessoa.nome}`}>
                        <IconeEditar />
                      </button>
                    </form>
                  )}
                  {a.pessoa ? (
                    <RemoverAdminButton
                      slug={gabinete.slug}
                      pessoaId={a.pessoa.id}
                      nome={a.pessoa.nome}
                      iconOnly
                    />
                  ) : (
                    <form action={removerAdminLegado.bind(null, gabinete.id, a.userId)}>
                      <button
                        type="submit"
                        aria-label={`Remover admin ${a.email ?? a.userId}`}
                        className="text-red-600 hover:opacity-70"
                      >
                        Remover
                      </button>
                    </form>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
```

Localizar o uso de `admins.length` no card de estatísticas (linha 96 atual):

```tsx
          { label: 'Admins', value: admins.length },
```

Manter como está — `admins` (a lista original de `UsuarioGabinete`) continua existindo, só `adminsComRotulo` é a versão enriquecida usada na renderização da lista.

- [ ] **Step 4: Checar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros novos relacionados aos 3 arquivos desta task. (Depende da Task 3 já commitada, pelo `RemoverAdminButton` com `iconOnly`.)

- [ ] **Step 5: Commit**

```bash
git add src/actions/super-admin/modo-suporte.ts src/actions/super-admin/remover-admin-legado.ts src/app/super-admin/gabinetes/\[id\]/page.tsx
git commit -m "$(cat <<'EOF'
feat: lista de admins do super-admin com nome, lápis e lixeira

entrarModoSuporte ganha destino opcional (usado pelo lápis, que
entra em modo suporte e já abre a ficha da pessoa). Admins com
Pessoa vinculada mostram nome + RemoverAdminButton (reaproveitado
da ficha); admins legados (convite por e-mail, sem Pessoa) mostram
e-mail resolvido via Supabase Auth e usam removerAdminLegado, que
só mexe em UsuarioGabinete.
EOF
)"
```

---

### Task 6: Verificação final

**Files:** nenhum (task só de verificação — nenhum código novo, e aplicação da migration pendente da Task 1).

- [ ] **Step 1: Aplicar a migration (controller, não subagente)**

Ação de infraestrutura, com credenciais reais de banco — não delega a um subagente. Depois que as Tasks 1-5 estiverem commitadas e revisadas:

1. Rodar o SQL da migration (`prisma/migrations/20260723120000_pessoa_is_admin/migration.sql`) diretamente contra o banco (staging primeiro, depois produção — ou só o banco que o `.env.local` deste ambiente aponta, confirmando qual é antes de rodar).
2. Marcar como aplicada: `npx prisma migrate resolve --applied 20260723120000_pessoa_is_admin` (mesmo padrão já usado nas fases da importação Izalci).
3. Confirmar com uma query direta (`SELECT column_name FROM information_schema.columns WHERE table_name = 'Pessoa' AND column_name = 'isAdmin'`) que a coluna existe antes de seguir pra verificação manual.

- [ ] **Step 2: Checar tipos e rodar a suíte de testes**

Run: `npx tsc --noEmit`
Expected: limpo, sem nenhum erro em todo o projeto.

Run: `npx vitest run`
Expected: mesmo baseline de antes deste plano (nenhum teste novo foi escrito — mudança é Server Actions + UI, sem lógica pura nova que justifique TDD; 2 falhas pré-existentes em `email.test.ts` são esperadas e não são regressão).

- [ ] **Step 3: Verificação manual no navegador**

```bash
npm run dev
```

Logado como admin num gabinete de teste com dados reais (ex. `amigos-do-izalci`):
1. Abrir a ficha de uma pessoa qualquer (sem ser admin nem mobilizadora): grid 2×2 aparece na ordem certa (Colaborador/Mobilizador em cima, Admin/Banco de Talentos embaixo), rótulos `+ Colaborador`/`+ Admin`.
2. Clicar em `+ Admin`, preencher senha+confirmar, confirmar: sucesso, botão vira "Remover admin"; abrir `/login` (aba anônima) e confirmar que a pessoa consegue entrar com o e-mail dela + a senha definida, e cai no painel de admin do gabinete certo.
3. Testar o caso de substituição: promover a `+Mobilizador` uma pessoa nova, confirmar que virou mobilizadora; depois clicar `+Admin` nela — confirmar que o papel de mobilizador some (volta a mostrar `+Mobilizador` disponível) e ela vira admin.
4. Testar reaproveitamento de conta: numa pessoa que já foi promovida (tem `userId`), remover o admin (`Remover admin`) e promover de novo — confirmar que funciona sem cair no erro de "conta órfã" (ou, se cair, investigar — é o cenário que o `if (pessoa.userId)` do Step 1 da Task 2 foi desenhado pra evitar, mas só se aplica quando `userId` já está setado *antes* da tentativa de promoção; depois de `removerAdmin`, `userId` volta a `null`, então uma segunda promoção da mesma pessoa efetivamente recria a conta do zero — **anotar como achado se a conta cair em estado órfão nesse fluxo específico de revogar+repromover**, já que é um comportamento herdado de `revogarMobilizador`, não introduzido por este plano).
5. `Remover admin`: confirma, volta a mostrar `+ Admin`.
6. Painel do super-admin (`/super-admin/gabinetes/[id]`): a pessoa promovida no passo 2 aparece na lista com o nome dela, ícone de lápis e lixeira. Clicar no lápis: entra em modo suporte (confirmar registro novo em `LogSuporte`) e vai direto pra ficha dessa pessoa. Voltar, clicar na lixeira: remove o admin com confirmação, lista atualiza.
7. Se houver algum admin "legado" (convidado por e-mail antes desta feature) no gabinete de teste, confirmar que aparece com o e-mail (não nome), sem ícone de lápis, só com o link/botão "Remover".
8. Sem erros no console em nenhum dos passos.

- [ ] **Step 4: Commit (se algum ajuste for necessário durante a verificação)**

Se a verificação manual não pedir nenhum ajuste, não há o que commitar nesta task — as Tasks 1-5 já cobrem todo o código. Caso algo precise de correção, aplicar o fix e commitar com uma mensagem descrevendo o que a verificação encontrou.

---

## Self-Review

**Spec coverage:** O spec (`docs/superpowers/specs/2026-07-23-admin-via-ficha-design.md`) cobre: schema (`Task 1`), botão `+Admin`/dialog (`Task 2`), botão `Remover admin` (`Task 3`), grid 2×2 na ficha (`Task 4`), e a reformulação do painel do super-admin com `entrarModoSuporte` estendido (`Task 5`). A regra de "substituir papel" e o caso de reaproveitar conta existente (ambos decisões do usuário/spec) estão implementados explicitamente na Task 2, com comentários no código explicando o porquê. A ausência de trava pra "não remover o último admin" é uma omissão deliberada (nenhuma task adiciona essa checagem) — bate com a decisão do usuário.

**Placeholder scan:** Nenhum "TBD"/"implementar depois" — todo código é completo e literal, copiável direto. A única ressalva registrada como tal (não como placeholder de código) é o achado potencial do Step 3.4 da Task 6, sobre um comportamento pré-existente herdado de `revogarMobilizador` que pode se manifestar num fluxo de teste específico — é uma instrução de verificação, não uma lacuna de implementação.

**Type consistency:** `promoverAdmin`/`PromoverAdminDialog` usam a mesma assinatura de `promoverMobilizador`/`PromoverMobilizadorDialog` (Task 2 espelha Task 1's pattern já existente no código-base). `removerAdmin`/`RemoverAdminButton` idem em relação a `revogarMobilizador`/`RevogarMobilizadorTopButton` (Task 3), com o prop `iconOnly` adicionado desde a criação do componente (Task 3) exatamente porque a Task 5 depende dele — checado explicitamente na Interfaces da Task 5. `criarOuReaproveitarUsuarioAcesso` mantém a assinatura de `criarOuReaproveitarUsuarioMobilizador` (Task 1), usado sem adaptação nenhuma na Task 2.
