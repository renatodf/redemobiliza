# Remover Foto de Perfil — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que admin ou a própria pessoa remova a foto de perfil com confirmação inline.

**Architecture:** Nova server action `removerFotoPessoa` (espelho de `uploadFotoPessoa`) deleta o arquivo do Supabase Storage e seta `fotoUrl = null` no banco. O componente `FotoPerfilAvatar` ganha estado `confirmandoRemocao` que troca os botões por "Confirmar remoção? Sim / Cancelar".

**Tech Stack:** Next.js 14 App Router, Prisma, Supabase Storage, Tailwind CSS, `useTransition`.

## Global Constraints

- Controle de acesso: admin do gabinete OU `pessoa.userId === user.id`
- `getUser()` em vez de `getSession()` na server action
- Path no storage extraído de `pessoa.fotoUrl` via `split('gabinete-assets/')[1]?.split('?')[0]`
- Sem testes automatizados (projeto não tem suite configurada para server actions/componentes)
- Seguir padrão de `upload-foto-pessoa.ts` para auth e permissão

---

## File Map

| Arquivo | Ação |
|---|---|
| `src/actions/admin/remover-foto-pessoa.ts` | Criar |
| `src/app/[slug]/admin/pessoas/[pessoaId]/FotoPerfilAvatar.tsx` | Modificar |

---

### Task 1: Server Action `removerFotoPessoa`

**Files:**
- Create: `src/actions/admin/remover-foto-pessoa.ts`

**Interfaces:**
- Consumes: `createSupabaseServerClient` de `@/lib/supabase/server`, `getSupabaseAdmin` de `@/lib/supabase/admin`, `getGabineteBySlug` de `@/lib/gabinete`, `prisma` de `@/lib/prisma`
- Produces: `async function removerFotoPessoa(formData: FormData): Promise<void>` — named export

- [ ] **Step 1: Criar o arquivo da server action**

Criar `src/actions/admin/remover-foto-pessoa.ts`:

```typescript
'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getGabineteBySlug } from '@/lib/gabinete'

export async function removerFotoPessoa(formData: FormData) {
  const slug = formData.get('slug')
  const pessoaId = formData.get('pessoaId')
  if (!slug || !pessoaId) throw new Error('Parâmetros inválidos')

  const supabase = createSupabaseServerClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) throw new Error('Não autenticado')

  const gabinete = await getGabineteBySlug(slug as string)
  if (!gabinete) throw new Error('Gabinete não encontrado')

  const pessoa = await prisma.pessoa.findFirst({
    where: { id: pessoaId as string, gabineteId: gabinete.id },
    select: { id: true, userId: true, fotoUrl: true },
  })
  if (!pessoa) throw new Error('Pessoa não encontrada')

  const role = user.app_metadata?.role as string | undefined
  const usuarioGabinete = await prisma.usuarioGabinete.findUnique({
    where: { userId_gabineteId: { userId: user.id, gabineteId: gabinete.id } },
    select: { papel: true },
  })
  const isAdmin = usuarioGabinete?.papel === 'admin' || role === 'super-admin'
  const isPropriaPessoa = pessoa.userId === user.id

  if (!isAdmin && !isPropriaPessoa) throw new Error('Sem permissão')

  if (pessoa.fotoUrl) {
    const oldPath = pessoa.fotoUrl.split('gabinete-assets/')[1]?.split('?')[0]
    if (oldPath) {
      await getSupabaseAdmin().storage.from('gabinete-assets').remove([oldPath])
    }
  }

  await prisma.pessoa.update({
    where: { id: pessoaId as string },
    data: { fotoUrl: null },
  })

  revalidatePath(`/${slug}/admin/pessoas/${pessoaId}`)
}
```

- [ ] **Step 2: Verificar TypeScript**

```bash
npx tsc --noEmit
```

Saída esperada: sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/actions/admin/remover-foto-pessoa.ts
git commit -m "feat: server action removerFotoPessoa"
```

---

### Task 2: Botão de remoção com confirmação inline em `FotoPerfilAvatar`

**Files:**
- Modify: `src/app/[slug]/admin/pessoas/[pessoaId]/FotoPerfilAvatar.tsx`

**Interfaces:**
- Consumes: `removerFotoPessoa(formData: FormData): Promise<void>` de `@/actions/admin/remover-foto-pessoa`

- [ ] **Step 1: Adicionar import e estado de confirmação**

No topo do arquivo, adicionar o import da nova action ao bloco existente:

```tsx
import { uploadFotoPessoa } from '@/actions/admin/upload-foto-pessoa'
import { removerFotoPessoa } from '@/actions/admin/remover-foto-pessoa'
```

Dentro do componente, adicionar o estado após `errorMsg`:

```tsx
const [confirmandoRemocao, setConfirmandoRemocao] = useState(false)
```

- [ ] **Step 2: Adicionar handler de remoção**

Após a função `handleFileChange`, adicionar:

```tsx
function handleRemover() {
  setErrorMsg(null)
  const formData = new FormData()
  formData.set('slug', slug)
  formData.set('pessoaId', pessoaId)

  startTransition(async () => {
    try {
      await removerFotoPessoa(formData)
      setConfirmandoRemocao(false)
      router.refresh()
    } catch (err) {
      setConfirmandoRemocao(false)
      setErrorMsg(err instanceof Error ? err.message : 'Erro ao remover foto')
    }
  })
}
```

- [ ] **Step 3: Substituir o bloco de botões abaixo do avatar**

Localizar o bloco atual:

```tsx
      {canEdit && fotoUrl && (
        <button
          type="button"
          onClick={isPending ? undefined : () => inputRef.current?.click()}
          aria-disabled={isPending}
          className={`text-xs text-blue-600 hover:underline${isPending ? ' opacity-50' : ''}`}
        >
          Alterar foto
        </button>
      )}
```

Substituir por:

```tsx
      {canEdit && fotoUrl && (
        confirmandoRemocao ? (
          <div className="flex items-center gap-2 text-xs">
            <span className="text-gray-600">Remover foto?</span>
            <button
              type="button"
              onClick={isPending ? undefined : handleRemover}
              aria-disabled={isPending}
              className={`text-red-600 font-medium hover:underline${isPending ? ' opacity-50' : ''}`}
            >
              Sim
            </button>
            <button
              type="button"
              onClick={() => setConfirmandoRemocao(false)}
              disabled={isPending}
              className="text-gray-500 hover:underline disabled:opacity-50"
            >
              Cancelar
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={isPending ? undefined : () => inputRef.current?.click()}
              aria-disabled={isPending}
              className={`text-xs text-blue-600 hover:underline${isPending ? ' opacity-50' : ''}`}
            >
              Alterar foto
            </button>
            <button
              type="button"
              onClick={() => { setConfirmandoRemocao(true); setErrorMsg(null) }}
              disabled={isPending}
              className="text-xs text-red-500 hover:underline disabled:opacity-50"
            >
              Remover foto
            </button>
          </div>
        )
      )}
```

- [ ] **Step 4: Verificar TypeScript**

```bash
npx tsc --noEmit
```

Saída esperada: sem erros.

- [ ] **Step 5: Testar manualmente**

```bash
npm run dev
```

Abrir `http://localhost:3000/{slug}/admin/pessoas/{pessoaId}` com uma pessoa que tem foto e verificar:

1. Botões "Alterar foto" e "Remover foto" aparecem lado a lado abaixo do avatar
2. Clicar "Remover foto" → mostra "Remover foto? Sim / Cancelar"
3. Clicar "Cancelar" → volta aos botões normais
4. Clicar "Sim" → avatar fica translúcido durante remoção → volta ao placeholder após refresh
5. Sem foto: botões não aparecem
6. Usuário sem permissão: botões não aparecem

- [ ] **Step 6: Commit**

```bash
git add src/app/\[slug\]/admin/pessoas/\[pessoaId\]/FotoPerfilAvatar.tsx
git commit -m "feat: botão de remoção de foto com confirmação inline"
```
