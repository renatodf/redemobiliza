# Correção dos Achados Críticos (P0) da Auditoria — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corrigir os 3 achados críticos (P0) ainda abertos da auditoria adversarial de 16/07/2026 — upload de logo/banner sem validação (path traversal cross-tenant + XSS + DoS), índice único parcial de `Pessoa` documentado mas inexistente (bloqueio permanente de WhatsApp/token após soft-delete), e a promoção de mobilizador-por-mobilizador que nunca gera `tokenMobilizador` (conta inutilizável). O quarto achado crítico (senha de produção vazada) já foi remediado numa sessão anterior.

**Architecture:** Três correções independentes, sem dependência entre si — podem ser executadas em qualquer ordem, mas o plano segue da mudança mais isolada (mobilizador) para a que tem mais superfície (upload) e termina na mudança de schema/banco (mais arriscada, por último). Upload ganha um helper puro `validarImagemUpload()` em `src/lib/`, reaproveitado pelos 3 pontos de upload de imagem do sistema (logo, banner, foto de pessoa) — elimina a duplicação que causou o bug original. O índice único troca de `@@unique` simples do Prisma para um índice único parcial via SQL bruto (`WHERE "deletedAt" IS NULL`), e os dois call sites que dependiam do nome da chave composta Prisma (`gabineteId_whatsapp`) passam a usar `findFirst` com filtro explícito de `deletedAt: null`.

**Tech Stack:** Next.js 14 (App Router) + TypeScript 5 (strict) + Prisma 7.8 (`adapter-pg`) + Supabase Storage + Vitest.

## Global Constraints

- Este projeto não escreve teste automatizado para código que depende de Prisma/DB/Supabase Storage (convenção já estabelecida) — só funções puras (sem `prisma`, sem `fetch`, sem `supabase`) ganham teste TDD. As Server Actions modificadas neste plano são verificadas manualmente (Passo de verificação em cada task + Task final).
- Nenhuma mudança de comportamento visível para usuários que já enviam upload válido (JPEG/PNG/WebP/GIF até 5MB) — a correção é estritamente mais restritiva, nunca menos.
- A correção do índice único deve ser uma migration manual (o Prisma não suporta índice único parcial nativamente) — mesmo padrão já usado em `20260628000000_add_soft_delete/migration.sql` (SQL idempotente com `IF EXISTS`/`IF NOT EXISTS`).
- Não introduzir nenhuma dependência nova (sem lib de validação de imagem externa) — a validação por MIME allowlist já é o padrão aceito neste projeto (ver `upload-foto-pessoa.ts`).

---

### Task 1: Corrigir `promoverMobilizadorPorMobilizador` sem `tokenMobilizador`

**Files:**
- Modify: `src/actions/mobilizador/promover-mobilizador.ts:37-45`

**Interfaces:** nenhuma — mudança isolada, não afeta nenhuma outra task deste plano.

- [ ] **Step 1: Adicionar a geração de `tokenMobilizador`, igual à variante admin**

Bloco atual (`src/actions/mobilizador/promover-mobilizador.ts:37-45`):

```ts
    try {
      await prisma.$transaction([
        prisma.pessoa.update({
          where: { id: pessoaId },
          data: { isMobilizador: true, userId },
        }),
        prisma.usuarioGabinete.create({
          data: { userId, gabineteId: gabinete.id, papel: 'mobilizador' },
        }),
      ])
    } catch (txError) {
```

Vira:

```ts
    const tokenMobilizador = crypto.randomUUID().replace(/-/g, '')

    try {
      await prisma.$transaction([
        prisma.pessoa.update({
          where: { id: pessoaId },
          data: { isMobilizador: true, userId, tokenMobilizador },
        }),
        prisma.usuarioGabinete.create({
          data: { userId, gabineteId: gabinete.id, papel: 'mobilizador' },
        }),
      ])
    } catch (txError) {
```

- [ ] **Step 2: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sem erro.

- [ ] **Step 3: Verificação manual**

Não há teste automatizado para esta action (depende de Prisma + Supabase Auth, fora da convenção de teste deste projeto). Verificar manualmente contra um gabinete de teste:
1. Logar como mobilizador com pelo menos uma pessoa na própria rede direta sem `isMobilizador`.
2. Promover essa pessoa via `promoverMobilizadorPorMobilizador` (mesmo fluxo da UI existente).
3. Confirmar via query direta (`SELECT "tokenMobilizador" FROM "Pessoa" WHERE id = '<id>'`) que o campo não é mais `NULL`.
4. Logar como a pessoa recém-promovida e confirmar que `/mobilizador/rede` carrega sem o erro "Mobilizador não encontrado".

- [ ] **Step 4: Commit**

```bash
git add src/actions/mobilizador/promover-mobilizador.ts
git commit -m "fix: promoverMobilizadorPorMobilizador gera tokenMobilizador (achado C4 da auditoria)"
```

---

### Task 2: Extrair `validarImagemUpload` — helper puro e testado

**Files:**
- Create: `src/lib/validar-imagem-upload.ts`
- Test: `src/lib/__tests__/validar-imagem-upload.test.ts`

**Interfaces:**
- Produces: `validarImagemUpload(file: File): { ext: string }` — lança `Error` com mensagem amigável se o tipo não estiver na allowlist ou o tamanho exceder 5MB. Tasks 3 e 4 consomem esta função e este tipo de retorno.

- [ ] **Step 1: Escrever os testes que falham**

```ts
// src/lib/__tests__/validar-imagem-upload.test.ts
import { describe, it, expect } from 'vitest'
import { validarImagemUpload } from '../validar-imagem-upload'

function criarArquivo(tipo: string, tamanhoBytes: number, nome = 'arquivo'): File {
  const conteudo = new Uint8Array(tamanhoBytes)
  return new File([conteudo], nome, { type: tipo })
}

describe('validarImagemUpload', () => {
  it('aceita JPEG dentro do limite de tamanho', () => {
    const file = criarArquivo('image/jpeg', 1024)
    expect(validarImagemUpload(file)).toEqual({ ext: 'jpg' })
  })

  it('aceita PNG dentro do limite de tamanho', () => {
    const file = criarArquivo('image/png', 1024)
    expect(validarImagemUpload(file)).toEqual({ ext: 'png' })
  })

  it('aceita WebP dentro do limite de tamanho', () => {
    const file = criarArquivo('image/webp', 1024)
    expect(validarImagemUpload(file)).toEqual({ ext: 'webp' })
  })

  it('aceita GIF dentro do limite de tamanho', () => {
    const file = criarArquivo('image/gif', 1024)
    expect(validarImagemUpload(file)).toEqual({ ext: 'gif' })
  })

  it('rejeita SVG (vetor de XSS armazenado)', () => {
    const file = criarArquivo('image/svg+xml', 1024)
    expect(() => validarImagemUpload(file)).toThrow('Tipo de imagem não permitido')
  })

  it('rejeita tipo arbitrário não relacionado a imagem', () => {
    const file = criarArquivo('application/octet-stream', 1024)
    expect(() => validarImagemUpload(file)).toThrow('Tipo de imagem não permitido')
  })

  it('rejeita arquivo maior que 5MB mesmo com tipo válido', () => {
    const file = criarArquivo('image/png', 5 * 1024 * 1024 + 1)
    expect(() => validarImagemUpload(file)).toThrow('máximo 5MB')
  })

  it('aceita arquivo exatamente no limite de 5MB', () => {
    const file = criarArquivo('image/png', 5 * 1024 * 1024)
    expect(validarImagemUpload(file)).toEqual({ ext: 'png' })
  })

  it('ignora extensão do nome do arquivo — extensão vem sempre do MIME validado', () => {
    const file = criarArquivo('image/png', 1024, '../../../etc/passwd.png')
    expect(validarImagemUpload(file)).toEqual({ ext: 'png' })
  })

  it('é case-insensitive no MIME type', () => {
    const file = criarArquivo('IMAGE/PNG', 1024)
    expect(validarImagemUpload(file)).toEqual({ ext: 'png' })
  })
})
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `npx vitest run src/lib/__tests__/validar-imagem-upload.test.ts`
Expected: FAIL — `Cannot find module '../validar-imagem-upload'`.

- [ ] **Step 3: Implementar a função**

```ts
// src/lib/validar-imagem-upload.ts
const TIPOS_IMAGEM_PERMITIDOS = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
} as const

const TAMANHO_MAXIMO_BYTES = 5 * 1024 * 1024

type TipoImagemPermitido = keyof typeof TIPOS_IMAGEM_PERMITIDOS

export function validarImagemUpload(file: File): { ext: string } {
  const tipo = file.type.toLowerCase() as TipoImagemPermitido

  if (!(tipo in TIPOS_IMAGEM_PERMITIDOS)) {
    throw new Error('Tipo de imagem não permitido — use JPEG, PNG, WebP ou GIF')
  }

  if (file.size > TAMANHO_MAXIMO_BYTES) {
    throw new Error('Imagem muito grande — máximo 5MB')
  }

  return { ext: TIPOS_IMAGEM_PERMITIDOS[tipo] }
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `npx vitest run src/lib/__tests__/validar-imagem-upload.test.ts`
Expected: PASS — 10/10 testes.

- [ ] **Step 5: Commit**

```bash
git add src/lib/validar-imagem-upload.ts src/lib/__tests__/validar-imagem-upload.test.ts
git commit -m "feat: extrai validarImagemUpload (helper puro, TDD) para achado C2 da auditoria"
```

---

### Task 3: Aplicar `validarImagemUpload` em `uploadLogo`/`uploadBanner`

**Files:**
- Modify: `src/actions/admin/upload-logo.ts`
- Modify: `src/actions/admin/upload-banner.ts`

**Interfaces:**
- Consumes: `validarImagemUpload(file: File): { ext: string }` (Task 2).

- [ ] **Step 1: Reescrever `upload-logo.ts`**

Arquivo completo (`src/actions/admin/upload-logo.ts`) vira:

```ts
'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { assertAdminAccess } from '@/lib/assert-admin-access'
import { validarImagemUpload } from '@/lib/validar-imagem-upload'

export async function uploadLogo(formData: FormData) {
  const slug = formData.get('slug') as string
  const file = formData.get('logo') as File | null
  if (!file || file.size === 0) return

  const { gabinete } = await assertAdminAccess(slug)

  const { ext } = validarImagemUpload(file)
  const path = `${gabinete.id}/logo.${ext}`
  const buffer = Buffer.from(await file.arrayBuffer())

  const { error } = await getSupabaseAdmin().storage
    .from('gabinete-assets')
    .upload(path, buffer, { upsert: true, contentType: file.type })

  if (error) throw new Error(`Erro no upload: ${error.message}`)

  const { data: { publicUrl } } = getSupabaseAdmin().storage
    .from('gabinete-assets')
    .getPublicUrl(path)

  await prisma.gabinete.update({
    where: { id: gabinete.id },
    data: { logoUrl: `${publicUrl}?v=${Date.now()}` },
  })

  revalidatePath(`/${slug}/admin/personalizacao`)
}
```

Nota: `?v=${Date.now()}` foi adicionado (cache-busting) porque `path` agora é sempre `logo.${ext}` determinístico — sem isso, trocar o logo por outro do mesmo tipo MIME serviria a versão em cache do navegador. Mesmo padrão já usado em `upload-foto-pessoa.ts`.

- [ ] **Step 2: Reescrever `upload-banner.ts`**

Arquivo completo (`src/actions/admin/upload-banner.ts`) vira:

```ts
'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { assertAdminAccess } from '@/lib/assert-admin-access'
import { validarImagemUpload } from '@/lib/validar-imagem-upload'

export async function uploadBanner(formData: FormData) {
  const slug = formData.get('slug') as string
  const file = formData.get('banner') as File | null
  if (!file || file.size === 0) return

  const { gabinete } = await assertAdminAccess(slug)

  const { ext } = validarImagemUpload(file)
  const path = `${gabinete.id}/banner.${ext}`
  const buffer = Buffer.from(await file.arrayBuffer())

  const { error } = await getSupabaseAdmin().storage
    .from('gabinete-assets')
    .upload(path, buffer, { upsert: true, contentType: file.type })

  if (error) throw new Error(`Erro no upload: ${error.message}`)

  const { data: { publicUrl } } = getSupabaseAdmin().storage
    .from('gabinete-assets')
    .getPublicUrl(path)

  await prisma.gabinete.update({
    where: { id: gabinete.id },
    data: { imagemBannerUrl: `${publicUrl}?v=${Date.now()}` },
  })

  revalidatePath(`/${slug}/admin/personalizacao`)
}
```

- [ ] **Step 3: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sem erro.

- [ ] **Step 4: Verificação manual**

1. Tentar upload de um arquivo `.svg` como logo — deve ser rejeitado com a mensagem "Tipo de imagem não permitido".
2. Tentar upload de um arquivo &gt;5MB como banner — deve ser rejeitado com "Imagem muito grande".
3. Upload de um PNG válido como logo — deve funcionar normalmente e a imagem deve aparecer atualizada na tela de Personalização imediatamente (sem precisar de hard-refresh, graças ao `?v=`).

- [ ] **Step 5: Commit**

```bash
git add src/actions/admin/upload-logo.ts src/actions/admin/upload-banner.ts
git commit -m "fix: valida tipo/tamanho de imagem em uploadLogo/uploadBanner (achado C2 da auditoria)"
```

---

### Task 4: Centralizar `upload-foto-pessoa.ts` no mesmo helper

**Files:**
- Modify: `src/actions/admin/upload-foto-pessoa.ts`

**Interfaces:**
- Consumes: `validarImagemUpload(file: File): { ext: string }` (Task 2).

**Motivação:** `upload-foto-pessoa.ts` já tinha a validação correta, mas com sua própria cópia da allowlist — exatamente o padrão de duplicação que fez `upload-logo`/`upload-banner` divergirem silenciosamente (achado C2). Esta task elimina a última cópia duplicada, deixando `validarImagemUpload` como única fonte de verdade.

- [ ] **Step 1: Substituir a allowlist local pela função compartilhada**

Bloco atual (topo do arquivo):

```ts
const ALLOWED_TYPES = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
} as const
```

Remove esse bloco inteiro e adiciona o import:

```ts
import { validarImagemUpload } from '@/lib/validar-imagem-upload'
```

Bloco atual (dentro de `uploadFotoPessoa`):

```ts
  const safeType = file.type.toLowerCase() as keyof typeof ALLOWED_TYPES
  if (!(safeType in ALLOWED_TYPES)) throw new Error('Tipo de imagem não permitido — use JPEG, PNG, WebP ou GIF')
  if (file.size > 5 * 1024 * 1024) throw new Error('Imagem muito grande — máximo 5MB')
```

Vira:

```ts
  const { ext } = validarImagemUpload(file)
```

Bloco atual (mais abaixo, onde `ext` era derivado de `safeType`):

```ts
  const ext = ALLOWED_TYPES[safeType]
  const path = `${gabinete.id}/pessoas/${pessoaId}/foto.${ext}`
```

Vira (remove a linha duplicada de `ext`, já veio de `validarImagemUpload`):

```ts
  const path = `${gabinete.id}/pessoas/${pessoaId}/foto.${ext}`
```

E a chamada de upload, que usava `contentType: safeType`, passa a usar `contentType: file.type`:

```ts
  const { error } = await getSupabaseAdmin().storage
    .from('gabinete-assets')
    .upload(path, buffer, { upsert: true, contentType: file.type })
```

- [ ] **Step 2: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sem erro — nenhuma referência a `ALLOWED_TYPES`/`safeType` deve sobrar no arquivo.

Run: `grep -n "ALLOWED_TYPES\|safeType" src/actions/admin/upload-foto-pessoa.ts`
Expected: sem saída (nenhum match).

- [ ] **Step 3: Verificação manual**

Repetir o upload de foto de uma pessoa (fluxo já existente na ficha) com um JPEG válido e confirmar que continua funcionando idêntico a antes (mesmo path, mesma foto salva).

- [ ] **Step 4: Commit**

```bash
git add src/actions/admin/upload-foto-pessoa.ts
git commit -m "refactor: upload-foto-pessoa.ts reaproveita validarImagemUpload (elimina última duplicação)"
```

---

### Task 5: Índice único parcial de `Pessoa` (schema + migration)

**Files:**
- Modify: `prisma/schema.prisma:133-134`
- Create: `prisma/migrations/20260716120000_pessoa_soft_delete_partial_unique/migration.sql`

**Interfaces:** nenhuma — mudança de schema/banco, consumida pela Task 6 (que depende do comportamento do banco, não de nenhum tipo TypeScript novo).

- [ ] **Step 1: Remover os `@@unique` simples do schema**

Bloco atual (`prisma/schema.prisma`, dentro de `model Pessoa`):

```prisma
  @@unique([gabineteId, whatsapp])
  @@unique([gabineteId, tokenMobilizador])
```

Vira (removido — a unicidade agora só existe como índice parcial via SQL bruto, abaixo):

```prisma
  // Unicidade de whatsapp/tokenMobilizador enquanto ativo é garantida por
  // índice único parcial (WHERE "deletedAt" IS NULL) na migration
  // 20260716120000_pessoa_soft_delete_partial_unique — não por @@unique,
  // que bloquearia recriar o registro depois de um soft-delete.
```

- [ ] **Step 2: Criar a migration manual**

```bash
mkdir -p prisma/migrations/20260716120000_pessoa_soft_delete_partial_unique
```

```sql
-- prisma/migrations/20260716120000_pessoa_soft_delete_partial_unique/migration.sql

-- Remove os índices únicos simples gerados originalmente pelo Prisma
-- (bloqueavam recriar whatsapp/tokenMobilizador depois de soft-delete).
DROP INDEX IF EXISTS "Pessoa_gabineteId_whatsapp_key";
DROP INDEX IF EXISTS "Pessoa_gabineteId_tokenMobilizador_key";

-- Recria como índice único PARCIAL — unicidade só entre pessoas ativas.
-- Uma pessoa soft-deletada libera o whatsapp/token para reuso por um
-- cadastro novo, sem colidir com o registro antigo (que continua existindo,
-- só não conta mais pra unicidade).
CREATE UNIQUE INDEX IF NOT EXISTS "Pessoa_gabineteId_whatsapp_key"
  ON "Pessoa"("gabineteId", "whatsapp")
  WHERE "deletedAt" IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "Pessoa_gabineteId_tokenMobilizador_key"
  ON "Pessoa"("gabineteId", "tokenMobilizador")
  WHERE "deletedAt" IS NULL;
```

- [ ] **Step 3: Aplicar a migration e marcar como aplicada**

Como as migrations manuais anteriores deste projeto (ex. `20260628000000_add_soft_delete`) foram aplicadas diretamente contra o banco em vez de via `migrate dev` (que tentaria recriar do zero e falharia por drift), siga o mesmo padrão: execute o SQL diretamente e depois marque a migration como aplicada no histórico do Prisma.

Run: `npx prisma db execute --file prisma/migrations/20260716120000_pessoa_soft_delete_partial_unique/migration.sql --schema prisma/schema.prisma`
Expected: sem erro de execução.

Run: `npx prisma migrate resolve --applied 20260716120000_pessoa_soft_delete_partial_unique`
Expected: `Migration ... marked as applied.`

- [ ] **Step 4: Verificação manual do comportamento do índice**

Rodar contra o banco de teste (nunca produção diretamente sem antes confirmar em ambiente de teste/staging):

```sql
-- 1. Confirmar que os dois índices existem e são parciais
SELECT indexname, indexdef FROM pg_indexes
  WHERE tablename = 'Pessoa' AND indexname LIKE '%whatsapp%' OR indexname LIKE '%tokenMobilizador%';
-- Esperado: indexdef de cada um termina em `WHERE (deletedAt IS NULL)` (ou similar)

-- 2. Confirmar que duas pessoas ATIVAS com o mesmo whatsapp no mesmo gabinete
--    continuam sendo bloqueadas (a proteção original não regrediu)
-- (rodar um INSERT de teste duplicado — deve falhar com unique violation)

-- 3. Confirmar que uma pessoa soft-deletada libera o whatsapp:
--    UPDATE "Pessoa" SET "deletedAt" = now() WHERE id = '<id de teste>';
--    -- depois, inserir uma nova pessoa com o mesmo whatsapp+gabineteId deve funcionar
```

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260716120000_pessoa_soft_delete_partial_unique
git commit -m "fix: indice unico parcial real para Pessoa.whatsapp/tokenMobilizador (achado C3 da auditoria)"
```

---

### Task 6: Atualizar `verificar-whatsapp.ts` e `submeter-cadastro.ts` para respeitar soft-delete

**Files:**
- Modify: `src/actions/public/verificar-whatsapp.ts:17-20`
- Modify: `src/actions/public/submeter-cadastro.ts:62-65`

**Interfaces:** nenhuma — os dois arquivos passam a usar `prisma.pessoa.findFirst` em vez de `findUnique` (a chave composta `gabineteId_whatsapp` deixou de existir no Prisma Client após a Task 5).

**Motivação:** sem esta task, o build quebraria (TypeScript não reconhece mais `gabineteId_whatsapp` como chave válida depois de remover o `@@unique`). E mesmo se compilasse por acaso, os dois call sites atualmente **não filtram `deletedAt`** — ou seja, encontrariam uma pessoa soft-deletada e tratariam como "já cadastrada", fundindo silenciosamente um cadastro novo na identidade antiga (o próprio bug que a Task 5 corrige no banco, mas que continuaria existindo na aplicação sem esta mudança).

- [ ] **Step 1: Corrigir `verificar-whatsapp.ts`**

Bloco atual:

```ts
  const pessoa = await prisma.pessoa.findUnique({
    where: { gabineteId_whatsapp: { gabineteId: gabinete.id, whatsapp } },
    select: { id: true },
  })
```

Vira:

```ts
  const pessoa = await prisma.pessoa.findFirst({
    where: { gabineteId: gabinete.id, whatsapp, deletedAt: null },
    select: { id: true },
  })
```

- [ ] **Step 2: Corrigir `submeter-cadastro.ts`**

Bloco atual:

```ts
  const pessoaExistente = await prisma.pessoa.findUnique({
    where: { gabineteId_whatsapp: { gabineteId: gabinete.id, whatsapp } },
    select: { id: true },
  })
```

Vira:

```ts
  const pessoaExistente = await prisma.pessoa.findFirst({
    where: { gabineteId: gabinete.id, whatsapp, deletedAt: null },
    select: { id: true },
  })
```

- [ ] **Step 3: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sem erro (nenhuma referência restante a `gabineteId_whatsapp` em todo `src/`).

Run: `grep -rn "gabineteId_whatsapp\|gabineteId_tokenMobilizador" src/ --include="*.ts" | grep -v generated`
Expected: sem saída.

- [ ] **Step 4: Verificação manual — cenário completo do achado C3**

1. Cadastrar uma pessoa nova pelo link público de um gabinete de teste, anotando o WhatsApp usado.
2. Soft-deletar essa pessoa (botão "Excluir" na ficha, admin).
3. Cadastrar de novo pelo link público com o **mesmo WhatsApp** — deve criar uma pessoa **nova** (não reaproveitar/fundir com a antiga soft-deletada), e não deve dar erro.
4. Confirmar via query que agora existem duas linhas em `Pessoa` com o mesmo `whatsapp`/`gabineteId` — uma com `deletedAt` preenchido, outra com `deletedAt` nulo.
5. Repetir o cadastro uma terceira vez com o mesmo WhatsApp, **sem** soft-deletar a segunda — deve ser tratado como "pessoa já existe" (fluxo de confirmação de presença), não criar uma terceira linha.

- [ ] **Step 5: Commit**

```bash
git add src/actions/public/verificar-whatsapp.ts src/actions/public/submeter-cadastro.ts
git commit -m "fix: verificar-whatsapp/submeter-cadastro ignoram pessoa soft-deletada (achado C3 da auditoria)"
```

---

### Task 7: Verificação final

**Files:** nenhum arquivo novo — verificação de todo o plano.

- [ ] **Step 1: Typecheck completo**

Run: `npx tsc --noEmit`
Expected: sem erro.

- [ ] **Step 2: Build de produção**

Run: `npm run build`
Expected: build conclui sem erro.

- [ ] **Step 3: Suite de testes completa**

Run: `npx vitest run`
Expected: todos os testes passam, incluindo os 10 novos de `validar-imagem-upload.test.ts`; nenhuma regressão nos testes existentes (mesma contagem de falhas pré-existentes de sempre — `email.test.ts`, por falta de `RESEND_API_KEY` local).

- [ ] **Step 4: Checklist de verificação manual consolidado**

- [ ] C4: mobilizador promovido por outro mobilizador consegue acessar `/mobilizador/rede` sem erro.
- [ ] C2: upload de `.svg` como logo/banner é rejeitado; upload válido funciona e atualiza a imagem na tela sem precisar de hard-refresh.
- [ ] C2: upload de foto de pessoa continua funcionando idêntico a antes (regressão da Task 4).
- [ ] C3: cadastro público com WhatsApp de pessoa soft-deletada cria uma pessoa nova, sem erro e sem fundir com a antiga.
- [ ] C3: cadastro público com WhatsApp de pessoa **ativa** continua bloqueando duplicata (sem regressão).

Sem commit nesta task — é só verificação. Se algum passo falhar, volte pra task correspondente, corrija, e repita a verificação a partir daí.
