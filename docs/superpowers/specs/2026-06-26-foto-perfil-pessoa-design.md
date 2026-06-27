# Design: Foto de Perfil da Pessoa

**Data:** 2026-06-26
**Status:** Aprovado

---

## Objetivo

Exibir e permitir o upload da foto de perfil de uma pessoa na ficha individual (`/[slug]/admin/pessoas/[pessoaId]`), com moldura circular estilo WhatsApp, lightbox para visualização e controle de acesso por papel.

---

## Schema e Storage

### Prisma

Adicionar campo ao modelo `Pessoa`:

```prisma
fotoUrl String?
```

Migration: `add_foto_url_to_pessoa`

### Supabase Storage

- Bucket: `gabinete-assets` (já existente)
- Path: `{gabineteId}/pessoas/{pessoaId}/foto.{ext}`
- Substituição via `upsert: true`

---

## Controle de Acesso

A alteração da foto é permitida para:
- Usuários com papel `admin` no gabinete
- O próprio usuário, quando `pessoa.userId === session.user.id`

Super-admins também têm acesso via papel `super-admin` no `app_metadata`.

---

## Server Action

**Arquivo:** `src/actions/admin/upload-foto-pessoa.ts`

**Fluxo:**
1. Recebe `FormData` com campos `slug`, `pessoaId` e `foto` (File)
2. Verifica sessão ativa via Supabase SSR
3. Carrega gabinete pelo slug
4. Carrega `Pessoa` pelo `pessoaId` (verifica que pertence ao gabinete)
5. Verifica permissão: admin do gabinete **ou** `pessoa.userId === session.user.id`
6. Valida `file.type` (deve iniciar com `image/`)
7. Valida tamanho máximo de 5MB
8. Faz upload no Supabase Storage com `upsert: true`
9. Obtém `publicUrl` e atualiza `Pessoa.fotoUrl` via Prisma
10. Chama `revalidatePath` para a ficha da pessoa

**Erro de permissão:** `throw new Error('Sem permissão')`
**Erro de tipo:** `throw new Error('Arquivo inválido — envie uma imagem')`
**Erro de tamanho:** `throw new Error('Imagem muito grande — máximo 5MB')`

---

## Componente `FotoPerfilAvatar`

**Arquivo:** `src/app/[slug]/admin/pessoas/[pessoaId]/FotoPerfilAvatar.tsx`

**Tipo:** Client Component (`'use client'`)

### Props

```ts
interface FotoPerfilAvatarProps {
  fotoUrl: string | null
  pessoaId: string
  slug: string
  canEdit: boolean
}
```

### Estados visuais

| Situação | Visual | Ação ao clicar |
|---|---|---|
| Sem foto, `canEdit: false` | Silhueta SVG cinza 96px circular | Nenhuma |
| Sem foto, `canEdit: true` | Silhueta SVG cinza 96px circular, cursor pointer | Abre `<input type="file">` oculto |
| Com foto | Foto circular 96px | Abre lightbox |
| Com foto, `canEdit: true` | Idem + link "Alterar foto" abaixo | Link abre `<input type="file">` oculto |

### Comportamento de upload

1. `<input type="file" accept="image/*">` oculto com `ref`
2. `onChange` monta `FormData` e chama server action via `startTransition`
3. Durante upload: opacidade reduzida + `cursor-wait` na moldura
4. Ao concluir com sucesso: `router.refresh()`
5. Em caso de erro: `alert(error.message)`

### Lightbox

- Biblioteca: `yet-another-react-lightbox`
- Ativado apenas quando `fotoUrl !== null` e usuário clica na foto
- Fecha ao clicar fora ou no botão X

### Placeholder (sem foto)

SVG inline simples de silhueta de pessoa, sem dependências externas:

```svg
<svg viewBox="0 0 96 96" fill="none" xmlns="http://www.w3.org/2000/svg">
  <circle cx="48" cy="48" r="48" fill="#E5E7EB"/>
  <circle cx="48" cy="38" r="16" fill="#9CA3AF"/>
  <path d="M16 80c0-17.673 14.327-32 32-32s32 14.327 32 32" fill="#9CA3AF"/>
</svg>
```

---

## Integração na Página

**Arquivo:** `src/app/[slug]/admin/pessoas/[pessoaId]/page.tsx`

O cabeçalho atual:

```tsx
<div className="flex items-center justify-between">
  <h1 className="text-2xl font-bold">{pessoa.nome}</h1>
  ...
</div>
```

Passa a ser:

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
  ...
</div>
```

---

## Dependências

| Pacote | Uso |
|---|---|
| `yet-another-react-lightbox` | Lightbox para visualização da foto em tamanho real |

Instalação: `npm install yet-another-react-lightbox`

---

## Restrições e Limites

- Tamanho máximo: 5MB por arquivo
- Tipos aceitos: qualquer `image/*` (PNG, JPEG, WebP, etc.)
- Sem redimensionamento server-side — a foto é armazenada no tamanho original
- Sem testes automatizados (projeto não tem suite de testes configurada)
