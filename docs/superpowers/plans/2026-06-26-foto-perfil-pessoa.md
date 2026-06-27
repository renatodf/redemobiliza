# Foto de Perfil da Pessoa — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Exibir e permitir o upload de foto de perfil circular na ficha de uma pessoa, com lightbox para visualização e controle de acesso por papel.

**Architecture:** Server action para upload (Supabase Storage + Prisma), Client Component `FotoPerfilAvatar` para UI interativa (lightbox + upload), integrado na página existente de ficha da pessoa.

**Tech Stack:** Next.js 14 (App Router), Prisma, Supabase Storage, yet-another-react-lightbox, Tailwind CSS.

## Global Constraints

- Bucket de storage: `gabinete-assets` (já existente — não criar novo)
- Path no storage: `{gabineteId}/pessoas/{pessoaId}/foto.{ext}`
- Tamanho máximo de upload: 5MB
- Tipos aceitos: qualquer `image/*`
- Controle de acesso: admin do gabinete OU `pessoa.userId === session.user.id`
- Sem testes automatizados (projeto não tem suite configurada)
- Seguir padrão de upload já existente em `src/actions/admin/upload-logo.ts`

---

## File Map

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `prisma/schema.prisma` | Modificar | Adicionar `fotoUrl String?` ao modelo `Pessoa` |
| `prisma/migrations/*/migration.sql` | Criar (auto) | Migration gerada pelo Prisma |
| `src/actions/admin/upload-foto-pessoa.ts` | Criar | Server action de upload com verificação de permissão |
| `src/app/[slug]/admin/pessoas/[pessoaId]/FotoPerfilAvatar.tsx` | Criar | Client Component com avatar circular, lightbox e upload |
| `src/app/[slug]/admin/pessoas/[pessoaId]/page.tsx` | Modificar | Integrar `FotoPerfilAvatar` no cabeçalho da ficha |

---

### Task 1: Instalar dependência e adicionar campo ao schema

**Files:**
- Modify: `prisma/schema.prisma` (modelo `Pessoa`)
- Create: `prisma/migrations/*/migration.sql` (auto-gerado)

**Interfaces:**
- Produces: campo `fotoUrl: string | null` disponível em qualquer query `prisma.pessoa.findFirst/findMany`

- [ ] **Step 1: Instalar yet-another-react-lightbox**

```bash
npm install yet-another-react-lightbox
```

Saída esperada: `added 1 package` (sem erros).

- [ ] **Step 2: Adicionar `fotoUrl` ao modelo `Pessoa` no schema**

Arquivo: `prisma/schema.prisma`

Localizar o bloco `model Pessoa {` e adicionar o campo após `criadoEm`:

```prisma
model Pessoa {
  id               String    @id @default(cuid())
  gabineteId       String
  nome             String
  whatsapp         String
  email            String?
  regiaoId         String?
  profissaoId      String?
  nascimento       DateTime?
  origem           String?
  genero           String?
  fotoUrl          String?
  isEquipe         Boolean   @default(false)
  isMobilizador    Boolean   @default(false)
  tokenMobilizador String?
  userId           String?
  criadoEm        DateTime  @default(now())
  atualizadoEm    DateTime  @updatedAt

  gabinete           Gabinete         @relation(fields: [gabineteId], references: [id])
  regiao             Regiao?          @relation(fields: [regiaoId], references: [id])
  profissao          Profissao?       @relation(fields: [profissaoId], references: [id])
  segmentos          PessoaSegmento[]
  redesComoIndicado  VinculoRede[]    @relation("Indicado")
  redesComoIndicador VinculoRede[]    @relation("Indicador")
  linksCompostos     LinkComposto[]   @relation("LinksMobilizador")
  observacoes        ObservacaoPessoa[]

  @@unique([gabineteId, whatsapp])
  @@unique([gabineteId, tokenMobilizador])
}
```

- [ ] **Step 3: Criar a migration**

```bash
npx prisma migrate dev --name add_foto_url_to_pessoa
```

Saída esperada: `Your database is now in sync with your schema.`

- [ ] **Step 4: Verificar que o campo existe no banco**

```bash
npx prisma studio
```

Abrir a tabela `Pessoa` e confirmar que a coluna `fotoUrl` aparece (com valor `null` nos registros existentes). Fechar o Studio.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/ package.json package-lock.json
git commit -m "feat: adicionar fotoUrl ao modelo Pessoa e instalar yet-another-react-lightbox"
```

---

### Task 2: Server Action `uploadFotoPessoa`

**Files:**
- Create: `src/actions/admin/upload-foto-pessoa.ts`

**Interfaces:**
- Consumes: `createSupabaseServerClient` de `@/lib/supabase/server`, `getSupabaseAdmin` de `@/lib/supabase/admin`, `getGabineteBySlug` de `@/lib/gabinete`, `prisma` de `@/lib/prisma`
- Produces: `async function uploadFotoPessoa(formData: FormData): Promise<void>` — exportada como named export

- [ ] **Step 1: Criar o arquivo da server action**

Criar `src/actions/admin/upload-foto-pessoa.ts` com o conteúdo:

```typescript
'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getGabineteBySlug } from '@/lib/gabinete'

export async function uploadFotoPessoa(formData: FormData) {
  const slug = formData.get('slug') as string
  const pessoaId = formData.get('pessoaId') as string
  const file = formData.get('foto') as File | null

  if (!file || file.size === 0) return

  const supabase = createSupabaseServerClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Não autenticado')

  if (!file.type.startsWith('image/')) throw new Error('Arquivo inválido — envie uma imagem')
  if (file.size > 5 * 1024 * 1024) throw new Error('Imagem muito grande — máximo 5MB')

  const gabinete = await getGabineteBySlug(slug)
  if (!gabinete) throw new Error('Gabinete não encontrado')

  const pessoa = await prisma.pessoa.findFirst({
    where: { id: pessoaId, gabineteId: gabinete.id },
    select: { id: true, userId: true },
  })
  if (!pessoa) throw new Error('Pessoa não encontrada')

  const role = session.user.app_metadata?.role as string | undefined
  const usuarioGabinete = await prisma.usuarioGabinete.findUnique({
    where: { userId_gabineteId: { userId: session.user.id, gabineteId: gabinete.id } },
    select: { papel: true },
  })
  const isAdmin = usuarioGabinete?.papel === 'admin' || role === 'super-admin'
  const isPropriaPessoa = pessoa.userId === session.user.id

  if (!isAdmin && !isPropriaPessoa) throw new Error('Sem permissão')

  const ext = file.name.split('.').pop() ?? 'jpg'
  const path = `${gabinete.id}/pessoas/${pessoaId}/foto.${ext}`
  const buffer = Buffer.from(await file.arrayBuffer())

  const { error } = await getSupabaseAdmin().storage
    .from('gabinete-assets')
    .upload(path, buffer, { upsert: true, contentType: file.type })

  if (error) throw new Error(`Erro no upload: ${error.message}`)

  const { data: { publicUrl } } = getSupabaseAdmin().storage
    .from('gabinete-assets')
    .getPublicUrl(path)

  await prisma.pessoa.update({
    where: { id: pessoaId },
    data: { fotoUrl: publicUrl },
  })

  revalidatePath(`/${slug}/admin/pessoas/${pessoaId}`)
}
```

- [ ] **Step 2: Verificar compilação TypeScript**

```bash
npx tsc --noEmit
```

Saída esperada: sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/actions/admin/upload-foto-pessoa.ts
git commit -m "feat: server action uploadFotoPessoa com controle de acesso"
```

---

### Task 3: Client Component `FotoPerfilAvatar`

**Files:**
- Create: `src/app/[slug]/admin/pessoas/[pessoaId]/FotoPerfilAvatar.tsx`

**Interfaces:**
- Consumes: `uploadFotoPessoa(formData: FormData): Promise<void>` da Task 2
- Produces: `export default function FotoPerfilAvatar(props: FotoPerfilAvatarProps): JSX.Element`

```ts
interface FotoPerfilAvatarProps {
  fotoUrl: string | null
  pessoaId: string
  slug: string
  canEdit: boolean
}
```

- [ ] **Step 1: Criar o componente**

Criar `src/app/[slug]/admin/pessoas/[pessoaId]/FotoPerfilAvatar.tsx`:

```tsx
'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Lightbox from 'yet-another-react-lightbox'
import 'yet-another-react-lightbox/styles.css'
import { uploadFotoPessoa } from '@/actions/admin/upload-foto-pessoa'

interface FotoPerfilAvatarProps {
  fotoUrl: string | null
  pessoaId: string
  slug: string
  canEdit: boolean
}

export default function FotoPerfilAvatar({ fotoUrl, pessoaId, slug, canEdit }: FotoPerfilAvatarProps) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  function handleAvatarClick() {
    if (fotoUrl) {
      setLightboxOpen(true)
    } else if (canEdit) {
      inputRef.current?.click()
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    const formData = new FormData()
    formData.set('slug', slug)
    formData.set('pessoaId', pessoaId)
    formData.set('foto', file)

    startTransition(async () => {
      try {
        await uploadFotoPessoa(formData)
        router.refresh()
      } catch (err) {
        alert(err instanceof Error ? err.message : 'Erro ao enviar foto')
      }
    })
  }

  const isClickable = !!fotoUrl || canEdit

  return (
    <div className="flex flex-col items-center gap-1">
      <button
        type="button"
        onClick={handleAvatarClick}
        disabled={isPending}
        className={[
          'w-24 h-24 rounded-full overflow-hidden border-2 border-gray-200 flex-shrink-0',
          isClickable && !isPending ? 'cursor-pointer' : 'cursor-default',
          isPending ? 'opacity-50 cursor-wait' : '',
        ].join(' ')}
        aria-label={fotoUrl ? 'Ver foto em tamanho real' : canEdit ? 'Adicionar foto de perfil' : 'Sem foto'}
      >
        {fotoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={fotoUrl} alt="Foto de perfil" className="w-full h-full object-cover" />
        ) : (
          <svg viewBox="0 0 96 96" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
            <circle cx="48" cy="48" r="48" fill="#E5E7EB" />
            <circle cx="48" cy="38" r="16" fill="#9CA3AF" />
            <path d="M16 80c0-17.673 14.327-32 32-32s32 14.327 32 32" fill="#9CA3AF" />
          </svg>
        )}
      </button>

      {canEdit && fotoUrl && (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={isPending}
          className="text-xs text-blue-600 hover:underline disabled:opacity-50"
        >
          Alterar foto
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />

      {fotoUrl && (
        <Lightbox
          open={lightboxOpen}
          close={() => setLightboxOpen(false)}
          slides={[{ src: fotoUrl }]}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verificar compilação TypeScript**

```bash
npx tsc --noEmit
```

Saída esperada: sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/app/\[slug\]/admin/pessoas/\[pessoaId\]/FotoPerfilAvatar.tsx
git commit -m "feat: componente FotoPerfilAvatar com lightbox e upload"
```

---

### Task 4: Integrar `FotoPerfilAvatar` na página de ficha

**Files:**
- Modify: `src/app/[slug]/admin/pessoas/[pessoaId]/page.tsx`

**Interfaces:**
- Consumes: `FotoPerfilAvatar` (default export) de `./FotoPerfilAvatar`; `canEdit: boolean` calculado como `isAdmin || pessoa.userId === session.user.id`

- [ ] **Step 1: Atualizar o cabeçalho da página**

Em `src/app/[slug]/admin/pessoas/[pessoaId]/page.tsx`:

1. Adicionar import no topo do arquivo (após os imports existentes):

```tsx
import FotoPerfilAvatar from './FotoPerfilAvatar'
```

2. Localizar o bloco do cabeçalho:

```tsx
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{pessoa.nome}</h1>
        {pessoa.isEquipe && (
          <span className="bg-green-100 text-green-800 text-xs px-2 py-1 rounded-full">
            Membro da Equipe
          </span>
        )}
      </div>
```

Substituir por:

```tsx
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <FotoPerfilAvatar
            fotoUrl={pessoa.fotoUrl}
            pessoaId={pessoa.id}
            slug={params.slug}
            canEdit={isAdmin || pessoa.userId === session.user.id}
          />
          <h1 className="text-2xl font-bold">{pessoa.nome}</h1>
        </div>
        {pessoa.isEquipe && (
          <span className="bg-green-100 text-green-800 text-xs px-2 py-1 rounded-full">
            Membro da Equipe
          </span>
        )}
      </div>
```

- [ ] **Step 2: Verificar compilação TypeScript**

```bash
npx tsc --noEmit
```

Saída esperada: sem erros.

- [ ] **Step 3: Testar manualmente**

Iniciar o servidor de desenvolvimento:

```bash
npm run dev
```

Abrir a ficha de qualquer pessoa em `http://localhost:3000/{slug}/admin/pessoas/{pessoaId}` e verificar:

1. **Sem foto:** avatar cinza com silhueta aparece à esquerda do nome
2. **Clicar no avatar (sem foto, admin logado):** abre seletor de arquivo
3. **Selecionar imagem:** avatar atualiza após upload sem recarregar a página toda
4. **Com foto:** clicar no avatar abre lightbox com a imagem em tamanho real
5. **Lightbox:** fecha ao clicar fora ou no X
6. **"Alterar foto":** link discreto abaixo do avatar quando há foto e usuário tem permissão
7. **Usuário sem permissão:** avatar não é clicável, sem link "Alterar foto"

- [ ] **Step 4: Commit**

```bash
git add src/app/\[slug\]/admin/pessoas/\[pessoaId\]/page.tsx
git commit -m "feat: integrar FotoPerfilAvatar na ficha da pessoa"
```
