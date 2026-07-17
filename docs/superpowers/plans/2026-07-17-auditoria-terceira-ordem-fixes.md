# Correção dos Achados da Auditoria de Terceira Ordem — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corrigir os 10 achados confirmados na Auditoria de Terceira Ordem (`docs/auditorias/2026-07-17-auditoria-terceira-ordem.md`), sem reintroduzir nenhuma regressão nas duas rodadas de correção anteriores (P0 + regressão, já deployadas até `d3ac4c7`).

**Architecture:** Cada achado vira uma ou mais tasks isoladas e testáveis. Achados de concorrência em catálogos (`AreaDemanda`, `AreaColocacao`, `Segmento`, `Regiao`, `Profissao`, `Gabinete`) seguem o padrão já validado nesta sessão: Server Action retorna `{erro?: string}` + `useFormState`, catch de `P2002` do Prisma. Onde o modelo tem um campo de "ativo/inativo" (`status`/`ativa`) em vez de hard-unique, o índice usa a mesma técnica de índice único **parcial** já aplicada a `Pessoa`/`VinculoRede` nesta sessão — reaproveitando o SQL que já existe (mas nunca foi aplicado) em `scripts/setup-supabase.sql`.

**Tech Stack:** Next.js 14.2 App Router, TypeScript 5 strict, Prisma 7.8 (`adapter-pg`), Supabase (Auth+Storage+Postgres), Vitest.

## Descoberta importante feita durante o planejamento

`scripts/setup-supabase.sql` já contém, desde antes desta sessão, o design **correto** para os índices únicos parciais de `Segmento` (`WHERE status = 'ativo'`), `Regiao` (`WHERE ativa = true`) e `Profissao` (`WHERE ativa = true`), além das políticas RLS para 11 tabelas — nenhum desses trechos nunca foi aplicado ao banco real (evidência: `pg_policies` vazio em produção e staging, confirmado por SQL ao vivo). Isso **muda a correção correta do achado 1.6** do relatório de auditoria: não é um `@@unique` comum (que quebraria a regra de negócio existente de permitir reativar um nome igual ao de um segmento/região/profissão inativo), e sim aplicar o índice parcial já desenhado. O mesmo raciocínio eleva o achado de baixa severidade sobre `Regiao`/`Profissao` (seção 3 do relatório, antes tratado como "gap de design a confirmar") a uma correção estrutural real: o design já existe, só nunca foi aplicado.

`AreaDemanda` e `AreaColocacao` **não** têm campo `ativa`/`status` do tipo reativável (`AreaDemanda` não tem nenhum; `AreaColocacao` tem `status` mas seu `@@unique([gabineteId, nome])` já existe hard, sem partição — e a lógica de `criarAreaColocacao` já reativa registros inativos via `update`, não via `create` de um duplicado, então o unique hard existente está correto e não precisa virar parcial). Logo `AreaDemanda` recebe um `@@unique` comum (nenhum índice parcial necessário).

## Global Constraints

- Server Action que hoje usa `throw new Error(...)` cru deve virar `(prevState, formData) => Promise<{erro?: string}>` + `useFormState` do `react-dom` no componente client, **exceto** quando a action já usa exclusivamente `redirect(...)` para reportar erro (padrão query-string `?erro=...`) — nesse caso a mensagem já sobrevive à sanitização do Next porque nunca passa por `throw`, e a conversão não deve ser feita (evita retrabalho sem benefício e risco de regressão na UI de erro existente). `criar-gabinete.ts`/`editar-gabinete.ts` são desse segundo tipo — não convertê-los, só adicionar o catch de P2002 mantendo o mesmo `redirect`.
- `redirect()` do Next.js sempre fica fora/depois de qualquer `try/catch`, nunca dentro — ver `src/actions/admin/cadastrar-pessoa.ts` como referência já validada nesta sessão.
- P2002 (Prisma unique-constraint): `import { Prisma } from '@/generated/prisma/client'`, `catch (e) { if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return { erro: '...' } ... }`.
- Índice único **parcial** (quando o modelo tem campo de ativo/inativo): migration SQL manual em `prisma/migrations/<timestamp>_<nome>/migration.sql`, nunca `@@unique` no `schema.prisma` — o schema ganha só um comentário apontando pra migration (ver `model VinculoRede` como referência já existente).
- Toda migration deste plano é aplicada manualmente: escrever o `.sql`, rodar contra o banco via script Node usando `pg` (ver Task 3 para o comando exato), depois `npx prisma migrate resolve --applied <nome_da_migration>` (isso só registra como aplicada — não executa SQL, então a ordem importa).
- `.env.local`/`.env.production` apontam para o **mesmo banco Supabase real** (`hqyirlcmhrfdnzshbniy`) — não existe banco de sandbox. Nunca alterar/apagar um registro real pré-existente. Qualquer dado de teste usado para validar concorrência (ex.: Task 3, 5, 6, 7) usa nome prefixado `"TESTE TASKn ..."` e é limpo por completo ao final, com a limpeza confirmada por uma query de verificação.
- Staging (`xoczohjjqtowskzbxrdr`) é um banco Supabase separado — toda migration é aplicada primeiro em staging (`.env.staging`), verificada, e só depois em produção (`.env.local`/`.env.production`, mesmo banco).
- Sem teste automatizado para código dependente de Prisma/DB/Supabase — só função pura ganha teste Vitest. Exceção deliberada: o script da Task 9 (`scripts/verificar-rls.mjs`) é especificamente um verificador de estado de banco, não um teste de unidade — não faz parte da suíte `npm test`, é executado manualmente após deploy de migration, documentado no `HANDOFF.md`.
- Convenção de nomenclatura de migration: `YYYYMMDDHHMMSS_descricao_snake_case`, timestamp estritamente crescente em relação à última migration existente (a mais recente hoje é `20260717000000_vinculo_rede_soft_delete_partial_unique`).

---

### Task 1: Banco de Talentos não expõe mais pessoa soft-deletada

**Files:**
- Modify: `src/lib/filtros-banco-talentos.ts`
- Test: `src/lib/__tests__/filtros-banco-talentos.test.ts`

**Interfaces:**
- Consumes: nada de outras tasks.
- Produces: `WhereBancoTalentos.pessoa` passa a ter `deletedAt: null` sempre presente — nenhum consumidor externo depende do formato antigo (o único uso de `buildWhereBancoTalentos` é dentro da própria rota de filtros do Banco de Talentos, fora do escopo desta task).

- [ ] **Step 1: Escrever o teste que hoje falha**

Adicionar ao final de `src/lib/__tests__/filtros-banco-talentos.test.ts` (antes do último `})` de fechamento do `describe`, ou seja, como mais um `it(...)` dentro do mesmo bloco):

```typescript
  it('sempre filtra deletedAt: null via relação pessoa', () => {
    const where = buildWhereBancoTalentos('gab-1', {})
    expect(where.pessoa.deletedAt).toBeNull()
  })

  it('inclui deletedAt: null mesmo combinando outros filtros', () => {
    const where = buildWhereBancoTalentos('gab-1', { regiaoId: 'regiao-1' })
    expect(where.pessoa).toEqual({ gabineteId: 'gab-1', regiaoId: 'regiao-1', deletedAt: null })
  })
```

Também atualizar o teste existente `'combina todos os filtros ao mesmo tempo'` (já no arquivo), trocando a linha `pessoa: { gabineteId: 'gab-1', regiaoId: 'regiao-1' },` por:

```typescript
      pessoa: { gabineteId: 'gab-1', regiaoId: 'regiao-1', deletedAt: null },
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `npx vitest run src/lib/__tests__/filtros-banco-talentos.test.ts`
Expected: FAIL nos três testes que mencionam `deletedAt` (o campo ainda não existe no objeto retornado).

- [ ] **Step 3: Implementar a correção**

Em `src/lib/filtros-banco-talentos.ts`, trocar a linha 11:

```typescript
  pessoa: { gabineteId: string; regiaoId?: string }
```

por:

```typescript
  pessoa: { gabineteId: string; deletedAt: null; regiaoId?: string }
```

E trocar as linhas 21-25:

```typescript
  const where: WhereBancoTalentos = {
    colocado: false,
    curriculoUrl: { not: null },
    pessoa: { gabineteId },
  }
```

por:

```typescript
  const where: WhereBancoTalentos = {
    colocado: false,
    curriculoUrl: { not: null },
    pessoa: { gabineteId, deletedAt: null },
  }
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `npx vitest run src/lib/__tests__/filtros-banco-talentos.test.ts`
Expected: PASS em todos os testes (17 no total após esta task).

- [ ] **Step 5: Rodar typecheck**

Run: `npx tsc --noEmit`
Expected: sem erros novos.

- [ ] **Step 6: Commit**

```bash
git add src/lib/filtros-banco-talentos.ts src/lib/__tests__/filtros-banco-talentos.test.ts
git commit -m "fix: Banco de Talentos não expõe mais pessoa soft-deletada (achado 1.5 da auditoria de terceira ordem)"
```

---

### Task 2: `criar-demanda.ts` alinha filtro de solicitante com `criar-demanda-com-cadastro.ts`

**Files:**
- Modify: `src/actions/admin/criar-demanda.ts:40-43`

**Interfaces:**
- Consumes: nada de outras tasks.
- Produces: nada consumido por outras tasks.

- [ ] **Step 1: Aplicar a correção**

Em `src/actions/admin/criar-demanda.ts`, trocar (linhas 39-44):

```typescript
  // Validar que solicitante pertence ao gabinete
  const solicitanteCheck = await prisma.pessoa.findFirst({
    where: { id: solicitanteId, gabineteId: gabinete.id },
    select: { id: true },
  })
  if (!solicitanteCheck) throw new Error('Solicitante não encontrado')
```

por:

```typescript
  // Validar que solicitante pertence ao gabinete e não está soft-deletado
  const solicitanteCheck = await prisma.pessoa.findFirst({
    where: { id: solicitanteId, gabineteId: gabinete.id, deletedAt: null },
    select: { id: true },
  })
  if (!solicitanteCheck) throw new Error('Solicitante não encontrado')
```

- [ ] **Step 2: Rodar typecheck**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 3: Verificação manual**

Não há teste automatizado (dependente de Prisma/DB, convenção do projeto). Verificação: confirmar por leitura que o `where` agora é idêntico em forma ao de `criar-demanda-com-cadastro.ts:74-78` (`{ id, gabineteId, deletedAt: null }`).

- [ ] **Step 4: Commit**

```bash
git add src/actions/admin/criar-demanda.ts
git commit -m "fix: criar-demanda.ts ignora pessoa soft-deletada como solicitante (achado 1.4 da auditoria de terceira ordem)"
```

---

### Task 3: `AreaDemanda` — unicidade real + tratamento de concorrência

**Files:**
- Modify: `prisma/schema.prisma` (model `AreaDemanda`)
- Create: `prisma/migrations/20260718000000_area_demanda_unique_nome/migration.sql`
- Modify: `src/actions/admin/criar-area-demanda.ts`
- Create: `src/components/admin/CriarAreaDemandaForm.tsx`
- Modify: `src/app/[slug]/admin/demandas/areas/page.tsx`
- Modify: `src/app/[slug]/admin/configuracoes/demandas/page.tsx`

**Interfaces:**
- Produces: `criarAreaDemanda(prevState: {erro?: string}, formData: FormData): Promise<{erro?: string}>` (assinatura muda de `(formData) => Promise<void>` para o padrão `useFormState`). `CriarAreaDemandaForm` — props `{ slug: string; corPrimaria: string; corTexto: string }`.

- [ ] **Step 1: Adicionar o `@@unique` no schema**

Em `prisma/schema.prisma`, no `model AreaDemanda`, trocar:

```prisma
  @@index([gabineteId])
}
```

(dentro do bloco `model AreaDemanda { ... }`) por:

```prisma
  @@unique([gabineteId, nome])
  @@index([gabineteId])
}
```

- [ ] **Step 2: Criar a migration**

Create `prisma/migrations/20260718000000_area_demanda_unique_nome/migration.sql`:

```sql
-- AreaDemanda não tinha nenhuma constraint de unicidade — dois admins
-- criando a mesma área simultaneamente geravam duplicata silenciosa
-- (achado 1.2 da auditoria de terceira ordem, 2026-07-17).
CREATE UNIQUE INDEX IF NOT EXISTS "AreaDemanda_gabineteId_nome_key"
  ON "AreaDemanda"("gabineteId", "nome");
```

- [ ] **Step 3: Aplicar a migration em staging**

```bash
cd /Users/renato/Documents/meubd
set -a; source .env.staging; set +a
node -e "
import('pg').then(async ({Client}) => {
  const client = new Client({connectionString: process.env.DIRECT_URL})
  await client.connect()
  const fs = await import('fs')
  const sql = fs.readFileSync('prisma/migrations/20260718000000_area_demanda_unique_nome/migration.sql', 'utf8')
  await client.query(sql)
  console.log('aplicado em staging')
  await client.end()
})
"
set -a; source .env.staging; set +a
npx prisma migrate resolve --applied 20260718000000_area_demanda_unique_nome
```

Expected: `aplicado em staging`, seguido de `Migration ... marked as applied`.

- [ ] **Step 4: Aplicar a migration em produção**

```bash
cd /Users/renato/Documents/meubd
set -a; source .env.local; set +a
node -e "
import('pg').then(async ({Client}) => {
  const client = new Client({connectionString: process.env.DIRECT_URL})
  await client.connect()
  const fs = await import('fs')
  const sql = fs.readFileSync('prisma/migrations/20260718000000_area_demanda_unique_nome/migration.sql', 'utf8')
  await client.query(sql)
  console.log('aplicado em produção')
  await client.end()
})
"
set -a; source .env.local; set +a
npx prisma migrate resolve --applied 20260718000000_area_demanda_unique_nome
```

Expected: `aplicado em produção`, seguido de `Migration ... marked as applied`.

- [ ] **Step 5: Rodar `npx prisma generate`**

Run: `npx prisma generate`
Expected: sucesso, sem erros.

- [ ] **Step 6: Reescrever a Server Action**

Replace o conteúdo inteiro de `src/actions/admin/criar-area-demanda.ts`:

```typescript
'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { assertAdminAccess } from '@/lib/assert-admin-access'
import { Prisma } from '@/generated/prisma/client'

export async function criarAreaDemanda(
  _prevState: { erro?: string },
  formData: FormData
): Promise<{ erro?: string }> {
  const slug = formData.get('slug') as string
  const nome = (formData.get('nome') as string).trim()
  if (!nome) return { erro: 'Nome é obrigatório' }

  try {
    const { gabinete } = await assertAdminAccess(slug)

    const existente = await prisma.areaDemanda.findFirst({
      where: { gabineteId: gabinete.id, nome: { equals: nome, mode: 'insensitive' } },
    })
    if (existente) return { erro: 'Já existe uma área com esse nome' }

    await prisma.areaDemanda.create({ data: { nome, gabineteId: gabinete.id } })
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return { erro: 'Já existe uma área com esse nome' }
    }
    return { erro: e instanceof Error ? e.message : 'Erro ao criar área' }
  }

  revalidatePath(`/${slug}/admin/demandas/areas`)
  revalidatePath(`/${slug}/admin/configuracoes/demandas`)
  return {}
}
```

- [ ] **Step 7: Criar o componente client compartilhado**

Create `src/components/admin/CriarAreaDemandaForm.tsx`:

```tsx
'use client'

import { useFormState } from 'react-dom'
import { criarAreaDemanda } from '@/actions/admin/criar-area-demanda'

export default function CriarAreaDemandaForm({
  slug,
  corPrimaria,
  corTexto,
}: {
  slug: string
  corPrimaria: string
  corTexto: string
}) {
  const [state, formAction] = useFormState(criarAreaDemanda, {})

  return (
    <div>
      <form action={formAction} className="flex gap-2">
        <input type="hidden" name="slug" value={slug} />
        <input
          name="nome"
          required
          placeholder="Nome da nova área"
          className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm"
        />
        <button
          type="submit"
          style={{ backgroundColor: corPrimaria, color: corTexto }}
          className="px-4 py-2 rounded-md text-sm font-medium"
        >
          Criar
        </button>
      </form>
      {state.erro && <p className="mt-1 text-sm text-red-600">{state.erro}</p>}
    </div>
  )
}
```

- [ ] **Step 8: Atualizar `src/app/[slug]/admin/demandas/areas/page.tsx`**

Remover o import de `criarAreaDemanda` (linha 5) e adicionar o import do componente:

```typescript
import CriarAreaDemandaForm from '@/components/admin/CriarAreaDemandaForm'
```

Trocar o bloco (linhas 24-39):

```tsx
      <form action={criarAreaDemanda} className="flex gap-2">
        <input type="hidden" name="slug" value={params.slug} />
        <input
          name="nome"
          required
          placeholder="Nome da nova área"
          className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm"
        />
        <button
          type="submit"
          style={{ backgroundColor: gabinete.corPrimaria, color: corTexto }}
          className="px-4 py-2 rounded-md text-sm font-medium"
        >
          Criar
        </button>
      </form>
```

por:

```tsx
      <CriarAreaDemandaForm slug={params.slug} corPrimaria={gabinete.corPrimaria} corTexto={corTexto} />
```

- [ ] **Step 9: Atualizar `src/app/[slug]/admin/configuracoes/demandas/page.tsx`**

Remover o import de `criarAreaDemanda` (linha 8) e adicionar:

```typescript
import CriarAreaDemandaForm from '@/components/admin/CriarAreaDemandaForm'
```

Trocar o bloco (linhas 92-107):

```tsx
        <form action={criarAreaDemanda} className="flex gap-2">
          <input type="hidden" name="slug" value={params.slug} />
          <input
            name="nome"
            required
            placeholder="Nome da nova área"
            className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm"
          />
          <button
            type="submit"
            style={{ backgroundColor: gabinete.corPrimaria, color: corTexto }}
            className="px-4 py-2 rounded-md text-sm font-medium"
          >
            Criar
          </button>
        </form>
```

por:

```tsx
        <CriarAreaDemandaForm slug={params.slug} corPrimaria={gabinete.corPrimaria} corTexto={corTexto} />
```

- [ ] **Step 10: Rodar typecheck e build**

Run: `npx tsc --noEmit && npm run build`
Expected: sem erros.

- [ ] **Step 11: Verificação manual em staging (concorrência real)**

Regra de segurança de dados: usar nome de área prefixado `TESTE TASK3` e limpar ao final. Contra o gabinete de teste em staging: criar uma área `"TESTE TASK3 Concorrência"` duas vezes em paralelo (duas abas, ou duas chamadas `fetch` simultâneas ao endpoint da Server Action via um script). Esperado: uma chamada cria, a outra retorna `{erro: "Já existe uma área com esse nome"}` — nenhuma duplicata na tabela. Confirmar com `SELECT count(*) FROM "AreaDemanda" WHERE nome = 'TESTE TASK3 Concorrência'` (deve retornar 1). Deletar a linha de teste e confirmar deleção com uma segunda query.

- [ ] **Step 12: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260718000000_area_demanda_unique_nome src/actions/admin/criar-area-demanda.ts src/components/admin/CriarAreaDemandaForm.tsx "src/app/[slug]/admin/demandas/areas/page.tsx" "src/app/[slug]/admin/configuracoes/demandas/page.tsx"
git commit -m "fix: AreaDemanda ganha unicidade real e trata concorrência (achado 1.2 da auditoria de terceira ordem)"
```

---

### Task 4: `AreaColocacao` — trata concorrência (constraint já existe)

**Files:**
- Modify: `src/actions/admin/criar-area-colocacao.ts`
- Create: `src/components/admin/CriarAreaColocacaoForm.tsx`
- Modify: `src/app/[slug]/admin/configuracoes/areas-colocacao/page.tsx`

**Interfaces:**
- Consumes: nenhuma migration necessária (`AreaColocacao` já tem `@@unique([gabineteId, nome])` real no schema, confirmado em `prisma/schema.prisma`).
- Produces: `criarAreaColocacao(prevState: {erro?: string}, formData: FormData): Promise<{erro?: string}>`.

- [ ] **Step 1: Reescrever a Server Action**

Replace o conteúdo inteiro de `src/actions/admin/criar-area-colocacao.ts`:

```typescript
'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { assertAdminAccess } from '@/lib/assert-admin-access'
import { Prisma } from '@/generated/prisma/client'

export async function criarAreaColocacao(
  _prevState: { erro?: string },
  formData: FormData
): Promise<{ erro?: string }> {
  const slug = formData.get('slug') as string
  const nome = (formData.get('nome') as string).trim()
  if (!nome) return { erro: 'Nome é obrigatório' }

  try {
    const { gabinete } = await assertAdminAccess(slug)

    const existente = await prisma.areaColocacao.findFirst({
      where: { gabineteId: gabinete.id, nome },
    })

    if (existente) {
      if (existente.status === 'ativa') {
        return { erro: `Já existe uma área ativa com esse nome: "${existente.nome}"` }
      }
      await prisma.areaColocacao.update({
        where: { id: existente.id },
        data: { status: 'ativa' },
      })
    } else {
      await prisma.areaColocacao.create({
        data: { nome, gabineteId: gabinete.id, status: 'ativa' },
      })
    }
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return { erro: `Já existe uma área ativa com esse nome: "${nome}"` }
    }
    return { erro: e instanceof Error ? e.message : 'Erro ao criar área' }
  }

  revalidatePath(`/${slug}/admin/configuracoes/areas-colocacao`)
  return {}
}
```

- [ ] **Step 2: Criar o componente client**

Create `src/components/admin/CriarAreaColocacaoForm.tsx`:

```tsx
'use client'

import { useFormState } from 'react-dom'
import { criarAreaColocacao } from '@/actions/admin/criar-area-colocacao'

export default function CriarAreaColocacaoForm({ slug }: { slug: string }) {
  const [state, formAction] = useFormState(criarAreaColocacao, {})

  return (
    <div>
      <form action={formAction} className="flex gap-2">
        <input type="hidden" name="slug" value={slug} />
        <input
          name="nome"
          required
          placeholder="Nome da nova área"
          className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm"
        />
        <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium">
          Criar
        </button>
      </form>
      {state.erro && <p className="mt-1 text-sm text-red-600">{state.erro}</p>}
    </div>
  )
}
```

- [ ] **Step 3: Atualizar `src/app/[slug]/admin/configuracoes/areas-colocacao/page.tsx`**

Remover o import de `criarAreaColocacao` (linha 4) e adicionar:

```typescript
import CriarAreaColocacaoForm from '@/components/admin/CriarAreaColocacaoForm'
```

Trocar o bloco (linhas 23-34):

```tsx
      <form action={criarAreaColocacao} className="flex gap-2">
        <input type="hidden" name="slug" value={params.slug} />
        <input
          name="nome"
          required
          placeholder="Nome da nova área"
          className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm"
        />
        <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium">
          Criar
        </button>
      </form>
```

por:

```tsx
      <CriarAreaColocacaoForm slug={params.slug} />
```

- [ ] **Step 4: Rodar typecheck e build**

Run: `npx tsc --noEmit && npm run build`
Expected: sem erros.

- [ ] **Step 5: Verificação manual em staging**

Mesma regra: nome `"TESTE TASK4 ..."`. Cenário 1: criar área nova — sucesso. Cenário 2: tentar criar com nome já ativo — recebe a mensagem de erro (não crash). Cenário 3 (concorrência): duas criações simultâneas do mesmo nome novo — uma sucede, outra recebe erro amigável, sem exceção não tratada. Limpar os dados de teste e confirmar via query.

- [ ] **Step 6: Commit**

```bash
git add src/actions/admin/criar-area-colocacao.ts src/components/admin/CriarAreaColocacaoForm.tsx "src/app/[slug]/admin/configuracoes/areas-colocacao/page.tsx"
git commit -m "fix: AreaColocacao trata colisão de unique constraint sob concorrência (achado 1.3 da auditoria de terceira ordem)"
```

---

### Task 5: `Segmento` — índice único parcial (reaproveitando design de `setup-supabase.sql`) + tratamento de concorrência

**Files:**
- Modify: `prisma/schema.prisma` (model `Segmento`)
- Create: `prisma/migrations/20260718000001_segmento_partial_unique/migration.sql`
- Modify: `src/actions/admin/criar-segmento.ts`
- Create: `src/components/admin/CriarSegmentoForm.tsx`
- Modify: `src/app/[slug]/admin/segmentos/page.tsx`
- Modify: `src/app/[slug]/admin/configuracoes/segmentos/page.tsx`

**Interfaces:**
- Produces: `criarSegmento(prevState: {erro?: string}, formData: FormData): Promise<{erro?: string}>`. `CriarSegmentoForm` — props `{ slug: string; corPrimaria: string; corTexto: string }`.

- [ ] **Step 1: Comentar o schema (sem `@@unique` — índice parcial vive só na migration)**

Em `prisma/schema.prisma`, no `model Segmento`, adicionar comentário antes do fechamento `}`:

```prisma
  gabinete       Gabinete         @relation(fields: [gabineteId], references: [id])
  pessoas        PessoaSegmento[]
  linksCompostos LinkComposto[]

  // Unicidade de (gabineteId, nome) e (gabineteId, slug) entre segmentos
  // com status='ativo' é garantida por índices únicos parciais na migration
  // 20260718000001_segmento_partial_unique — não por @@unique, que
  // bloquearia recriar um segmento com o mesmo nome/slug de um segmento
  // inativado (a lógica de criarSegmento já permite isso, filtrando por
  // status: 'ativo'). Mesma técnica já aplicada em Pessoa/VinculoRede.
}
```

- [ ] **Step 2: Criar a migration**

Create `prisma/migrations/20260718000001_segmento_partial_unique/migration.sql`:

```sql
-- Segmento não tinha nenhuma constraint de unicidade — dois admins criando
-- o mesmo segmento simultaneamente geravam duplicata silenciosa (achado
-- 1.2/1.6 da auditoria de terceira ordem, 2026-07-17). O índice parcial
-- (WHERE status = 'ativo') já estava desenhado em scripts/setup-supabase.sql
-- mas nunca foi aplicado ao banco real — reaproveitado aqui como migration.
CREATE UNIQUE INDEX IF NOT EXISTS "Segmento_gabineteId_nome_ativo_idx"
  ON "Segmento"("gabineteId", "nome") WHERE status = 'ativo';

CREATE UNIQUE INDEX IF NOT EXISTS "Segmento_gabineteId_slug_ativo_idx"
  ON "Segmento"("gabineteId", "slug") WHERE status = 'ativo';
```

- [ ] **Step 3: Aplicar em staging e produção**

Mesmo padrão de comando da Task 3 (Steps 3-4), trocando o nome do arquivo/migration para `20260718000001_segmento_partial_unique`. Rodar primeiro contra `.env.staging`, verificar, depois contra `.env.local` (produção).

Verificação pós-aplicação (rodar contra os dois bancos):
```bash
node -e "
import('pg').then(async ({Client}) => {
  const client = new Client({connectionString: process.env.DIRECT_URL})
  await client.connect()
  const r = await client.query(\"SELECT indexname FROM pg_indexes WHERE tablename='Segmento'\")
  console.log(r.rows.map(x => x.indexname))
  await client.end()
})
"
```
Expected: lista incluindo `Segmento_gabineteId_nome_ativo_idx` e `Segmento_gabineteId_slug_ativo_idx`.

- [ ] **Step 4: `npx prisma generate`**

Run: `npx prisma generate`

- [ ] **Step 5: Reescrever a Server Action**

Replace o conteúdo inteiro de `src/actions/admin/criar-segmento.ts`:

```typescript
'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { assertAdminAccess } from '@/lib/assert-admin-access'
import { toSlug } from '@/lib/slug'
import { Prisma } from '@/generated/prisma/client'

export async function criarSegmento(
  _prevState: { erro?: string },
  formData: FormData
): Promise<{ erro?: string }> {
  const slug = formData.get('slug') as string
  const nome = (formData.get('nome') as string).trim()
  if (!nome) return { erro: 'Nome é obrigatório' }

  const segmentoSlug = toSlug(nome)

  try {
    const { gabinete } = await assertAdminAccess(slug)

    const existente = await prisma.segmento.findFirst({
      where: { gabineteId: gabinete.id, slug: segmentoSlug, status: 'ativo' },
    })
    if (existente) {
      return { erro: `Já existe um segmento ativo com nome similar: "${existente.nome}"` }
    }

    await prisma.segmento.create({
      data: { nome, slug: segmentoSlug, gabineteId: gabinete.id, tipo: 'geral', status: 'ativo' },
    })
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return { erro: `Já existe um segmento ativo com nome similar: "${nome}"` }
    }
    return { erro: e instanceof Error ? e.message : 'Erro ao criar segmento' }
  }

  revalidatePath(`/${slug}/admin/segmentos`)
  revalidatePath(`/${slug}/admin/configuracoes/segmentos`)
  return {}
}
```

- [ ] **Step 6: Criar o componente client**

Create `src/components/admin/CriarSegmentoForm.tsx`:

```tsx
'use client'

import { useFormState } from 'react-dom'
import { criarSegmento } from '@/actions/admin/criar-segmento'

export default function CriarSegmentoForm({
  slug,
  corPrimaria,
  corTexto,
}: {
  slug: string
  corPrimaria: string
  corTexto: string
}) {
  const [state, formAction] = useFormState(criarSegmento, {})

  return (
    <div>
      <form action={formAction} className="flex gap-2">
        <input type="hidden" name="slug" value={slug} />
        <input
          name="nome"
          required
          placeholder="Nome do novo segmento"
          className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm"
        />
        <button
          type="submit"
          style={{ backgroundColor: corPrimaria, color: corTexto }}
          className="px-4 py-2 rounded-md text-sm font-medium"
        >
          Criar
        </button>
      </form>
      {state.erro && <p className="mt-1 text-sm text-red-600">{state.erro}</p>}
    </div>
  )
}
```

- [ ] **Step 7: Atualizar `src/app/[slug]/admin/segmentos/page.tsx`**

Remover o import de `criarSegmento` (linha 6), adicionar:

```typescript
import CriarSegmentoForm from '@/components/admin/CriarSegmentoForm'
```

Trocar o bloco (linhas 24-39):

```tsx
      <form action={criarSegmento} className="flex gap-2">
        <input type="hidden" name="slug" value={params.slug} />
        <input
          name="nome"
          required
          placeholder="Nome do novo segmento"
          className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm"
        />
        <button
          type="submit"
          style={{ backgroundColor: gabinete.corPrimaria, color: corTexto }}
          className="px-4 py-2 rounded-md text-sm font-medium"
        >
          Criar
        </button>
      </form>
```

por:

```tsx
      <CriarSegmentoForm slug={params.slug} corPrimaria={gabinete.corPrimaria} corTexto={corTexto} />
```

- [ ] **Step 8: Atualizar `src/app/[slug]/admin/configuracoes/segmentos/page.tsx`**

Remover o import de `criarSegmento` (linha 6), adicionar:

```typescript
import CriarSegmentoForm from '@/components/admin/CriarSegmentoForm'
```

Trocar o bloco (linhas 23-38):

```tsx
      <form action={criarSegmento} className="flex gap-2">
        <input type="hidden" name="slug" value={params.slug} />
        <input
          name="nome"
          required
          placeholder="Nome do novo segmento"
          className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm"
        />
        <button
          type="submit"
          style={{ backgroundColor: gabinete.corPrimaria, color: corTexto }}
          className="px-4 py-2 rounded-md text-sm font-medium"
        >
          Criar
        </button>
      </form>
```

por:

```tsx
      <CriarSegmentoForm slug={params.slug} corPrimaria={gabinete.corPrimaria} corTexto={corTexto} />
```

- [ ] **Step 9: Rodar typecheck e build**

Run: `npx tsc --noEmit && npm run build`
Expected: sem erros.

- [ ] **Step 10: Verificação manual em staging**

Nome `"TESTE TASK5 ..."`. Cenário 1: criar segmento — sucesso. Cenário 2: inativar o segmento (via `inativarSegmento`, já existente) e criar de novo com o mesmo nome — deve suceder (índice parcial só considera `status='ativo'`). Cenário 3: duas criações simultâneas do mesmo nome novo — uma sucede, outra recebe erro amigável. Limpar tudo (`Segmento` + qualquer `PessoaSegmento`/`LinkComposto` de teste, se criados) e confirmar via query.

- [ ] **Step 11: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260718000001_segmento_partial_unique src/actions/admin/criar-segmento.ts src/components/admin/CriarSegmentoForm.tsx "src/app/[slug]/admin/segmentos/page.tsx" "src/app/[slug]/admin/configuracoes/segmentos/page.tsx"
git commit -m "fix: Segmento ganha índice único parcial e trata concorrência (achados 1.2/1.6 da auditoria de terceira ordem)"
```

---

### Task 6: `Profissao` — índice único parcial + tratamento de concorrência

**Files:**
- Create: `prisma/migrations/20260718000002_profissao_partial_unique/migration.sql`
- Modify: `src/actions/admin/criar-profissao.ts`
- Create: `src/components/admin/CriarProfissaoForm.tsx`
- Modify: `src/app/[slug]/admin/profissoes/page.tsx`
- Modify: `src/app/[slug]/admin/configuracoes/profissoes/page.tsx`

**Interfaces:**
- Produces: `criarProfissao(prevState: {erro?: string}, formData: FormData): Promise<{erro?: string}>`.

`Profissao` não precisa de comentário novo no schema além do já implícito pelo padrão — o modelo não tem nenhum campo `@@unique` hoje, e este plano não adiciona nenhum (o índice vive só na migration). Não é necessário editar `prisma/schema.prisma` nesta task.

- [ ] **Step 1: Criar a migration**

Create `prisma/migrations/20260718000002_profissao_partial_unique/migration.sql`:

```sql
-- Profissao permitia criar duplicatas sem nenhum aviso (nem findFirst
-- prévio existia). O índice parcial (WHERE ativa = true) já estava
-- desenhado em scripts/setup-supabase.sql mas nunca foi aplicado ao banco
-- real — reaproveitado aqui como migration (achado de baixa severidade,
-- seção 3 do relatório da auditoria de terceira ordem, 2026-07-17,
-- reclassificado como correção estrutural real após a descoberta de que o
-- design já existia).
CREATE UNIQUE INDEX IF NOT EXISTS "Profissao_gabineteId_nome_ativo_idx"
  ON "Profissao"("gabineteId", "nome") WHERE ativa = true;
```

- [ ] **Step 2: Aplicar em staging e produção**

Mesmo padrão das Tasks 3/5. Verificar com `SELECT indexname FROM pg_indexes WHERE tablename='Profissao'` nos dois bancos.

- [ ] **Step 3: `npx prisma generate`**

Run: `npx prisma generate`

- [ ] **Step 4: Reescrever a Server Action**

Replace o conteúdo inteiro de `src/actions/admin/criar-profissao.ts`:

```typescript
'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { assertAdminAccess } from '@/lib/assert-admin-access'
import { Prisma } from '@/generated/prisma/client'

export async function criarProfissao(
  _prevState: { erro?: string },
  formData: FormData
): Promise<{ erro?: string }> {
  const slug = formData.get('slug') as string
  const nome = (formData.get('nome') as string).trim()
  if (!nome) return { erro: 'Nome é obrigatório' }

  try {
    const { gabinete } = await assertAdminAccess(slug)

    const existente = await prisma.profissao.findFirst({
      where: { gabineteId: gabinete.id, nome: { equals: nome, mode: 'insensitive' }, ativa: true },
    })
    if (existente) return { erro: `Já existe uma profissão ativa com esse nome: "${existente.nome}"` }

    await prisma.profissao.create({
      data: { nome, gabineteId: gabinete.id, ativa: true },
    })
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return { erro: `Já existe uma profissão ativa com esse nome: "${nome}"` }
    }
    return { erro: e instanceof Error ? e.message : 'Erro ao criar profissão' }
  }

  revalidatePath(`/${slug}/admin/profissoes`)
  revalidatePath(`/${slug}/admin/configuracoes/profissoes`)
  return {}
}
```

Nota: esta reescrita adiciona um `findFirst` prévio que não existia (a action original criava direto). Isso é necessário porque, sem ele, a UX de duplicata passaria a ser sempre "erro de conflito" mesmo em uso sequencial normal (um admin cadastra a mesma profissão duas vezes, sem concorrência real) — o `findFirst` preserva a experiência normal (mensagem amigável), e o catch de P2002 cobre só a janela de corrida.

- [ ] **Step 5: Criar o componente client**

Create `src/components/admin/CriarProfissaoForm.tsx`:

```tsx
'use client'

import { useFormState } from 'react-dom'
import { criarProfissao } from '@/actions/admin/criar-profissao'

export default function CriarProfissaoForm({
  slug,
  corPrimaria,
  corTexto,
}: {
  slug: string
  corPrimaria: string
  corTexto: string
}) {
  const [state, formAction] = useFormState(criarProfissao, {})

  return (
    <div>
      <form action={formAction} className="flex gap-2">
        <input type="hidden" name="slug" value={slug} />
        <input
          name="nome"
          required
          placeholder="Nome da nova profissão"
          className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm"
        />
        <button
          type="submit"
          style={{ backgroundColor: corPrimaria, color: corTexto }}
          className="px-4 py-2 rounded-md text-sm font-medium"
        >
          Adicionar
        </button>
      </form>
      {state.erro && <p className="mt-1 text-sm text-red-600">{state.erro}</p>}
    </div>
  )
}
```

- [ ] **Step 6: Atualizar `src/app/[slug]/admin/profissoes/page.tsx`**

Remover o import de `criarProfissao` (linha 5), adicionar:

```typescript
import CriarProfissaoForm from '@/components/admin/CriarProfissaoForm'
```

Trocar o bloco (linhas 23-38):

```tsx
      <form action={criarProfissao} className="flex gap-2">
        <input type="hidden" name="slug" value={params.slug} />
        <input
          name="nome"
          required
          placeholder="Nome da nova profissão"
          className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm"
        />
        <button
          type="submit"
          style={{ backgroundColor: gabinete.corPrimaria, color: corTexto }}
          className="px-4 py-2 rounded-md text-sm font-medium"
        >
          Adicionar
        </button>
      </form>
```

por:

```tsx
      <CriarProfissaoForm slug={params.slug} corPrimaria={gabinete.corPrimaria} corTexto={corTexto} />
```

- [ ] **Step 7: Atualizar `src/app/[slug]/admin/configuracoes/profissoes/page.tsx`**

Remover o import de `criarProfissao` (linha 5), adicionar:

```typescript
import CriarProfissaoForm from '@/components/admin/CriarProfissaoForm'
```

Trocar o bloco (linhas 22-37):

```tsx
      <form action={criarProfissao} className="flex gap-2">
        <input type="hidden" name="slug" value={params.slug} />
        <input
          name="nome"
          required
          placeholder="Nome da nova profissão"
          className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm"
        />
        <button
          type="submit"
          style={{ backgroundColor: gabinete.corPrimaria, color: corTexto }}
          className="px-4 py-2 rounded-md text-sm font-medium"
        >
          Adicionar
        </button>
      </form>
```

por:

```tsx
      <CriarProfissaoForm slug={params.slug} corPrimaria={gabinete.corPrimaria} corTexto={corTexto} />
```

- [ ] **Step 8: Rodar typecheck e build**

Run: `npx tsc --noEmit && npm run build`
Expected: sem erros.

- [ ] **Step 9: Verificação manual em staging**

Nome `"TESTE TASK6 ..."`. Mesmos 3 cenários da Task 5 (criar, reativar após desativar com mesmo nome, concorrência). Limpar e confirmar via query.

- [ ] **Step 10: Commit**

```bash
git add prisma/migrations/20260718000002_profissao_partial_unique src/actions/admin/criar-profissao.ts src/components/admin/CriarProfissaoForm.tsx "src/app/[slug]/admin/profissoes/page.tsx" "src/app/[slug]/admin/configuracoes/profissoes/page.tsx"
git commit -m "fix: Profissao ganha verificação de duplicata e índice único parcial (achado de baixa severidade elevado, auditoria de terceira ordem)"
```

---

### Task 7: `Regiao` — índice único parcial + tratamento de concorrência

**Files:**
- Create: `prisma/migrations/20260718000003_regiao_partial_unique/migration.sql`
- Modify: `src/actions/admin/criar-regiao.ts`
- Create: `src/components/admin/CriarRegiaoForm.tsx`
- Modify: `src/app/[slug]/admin/configuracoes/cidades/page.tsx`

**Interfaces:**
- Produces: `criarRegiao(prevState: {erro?: string}, formData: FormData): Promise<{erro?: string}>`.

- [ ] **Step 1: Criar a migration**

Create `prisma/migrations/20260718000003_regiao_partial_unique/migration.sql`:

```sql
-- Regiao permitia criar duplicatas sem nenhum aviso. O índice parcial
-- (WHERE ativa = true) já estava desenhado em scripts/setup-supabase.sql
-- mas nunca foi aplicado ao banco real — reaproveitado aqui como migration
-- (achado de baixa severidade, auditoria de terceira ordem, 2026-07-17).
CREATE UNIQUE INDEX IF NOT EXISTS "Regiao_gabineteId_nome_ativo_idx"
  ON "Regiao"("gabineteId", "nome") WHERE ativa = true;
```

- [ ] **Step 2: Aplicar em staging e produção**

Mesmo padrão das tasks anteriores. Verificar com `SELECT indexname FROM pg_indexes WHERE tablename='Regiao'` nos dois bancos.

- [ ] **Step 3: `npx prisma generate`**

Run: `npx prisma generate`

- [ ] **Step 4: Reescrever a Server Action**

Replace o conteúdo inteiro de `src/actions/admin/criar-regiao.ts`:

```typescript
'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { assertAdminAccess } from '@/lib/assert-admin-access'
import { geocodificarRegiao } from '@/lib/geocodificar-regiao'
import { ESTADOS_BR } from '@/lib/estados-br'
import { Prisma } from '@/generated/prisma/client'

export async function criarRegiao(
  _prevState: { erro?: string },
  formData: FormData
): Promise<{ erro?: string }> {
  const slug = formData.get('slug') as string
  const nome = (formData.get('nome') as string).trim()
  const uf = formData.get('uf') as string
  if (!nome) return { erro: 'Nome é obrigatório' }
  if (!ESTADOS_BR.some((e) => e.sigla === uf)) return { erro: 'UF inválida' }

  let regiaoId: string

  try {
    const { gabinete } = await assertAdminAccess(slug)

    const existente = await prisma.regiao.findFirst({
      where: { gabineteId: gabinete.id, nome: { equals: nome, mode: 'insensitive' }, ativa: true },
    })
    if (existente) return { erro: `Já existe uma cidade ativa com esse nome: "${existente.nome}"` }

    const regiao = await prisma.regiao.create({
      data: { nome, uf, gabineteId: gabinete.id, ativa: true },
    })
    regiaoId = regiao.id
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return { erro: `Já existe uma cidade ativa com esse nome: "${nome}"` }
    }
    return { erro: e instanceof Error ? e.message : 'Erro ao criar cidade' }
  }

  try {
    const coordenada = await geocodificarRegiao(nome, uf)
    if (coordenada) {
      await prisma.regiao.update({
        where: { id: regiaoId },
        data: { latitude: coordenada.latitude, longitude: coordenada.longitude },
      })
    }
  } catch (e) {
    console.error('[criarRegiao] falha na geocodificação — cidade criada sem coordenadas:', e)
  }

  revalidatePath(`/${slug}/admin/configuracoes/cidades`)
  revalidatePath(`/${slug}/admin/dashboard`)
  return {}
}
```

Nota: a chamada de geocodificação ganha seu próprio try/catch (achado 3 do relatório — "sucesso parcial reportado como falha total"): se `geocodificarRegiao` lançar, a cidade já foi criada com sucesso e a action não deve reportar erro ao admin, só logar. Isso corrige de brinde um bug adjacente descoberto no mesmo arquivo durante esta task (mesma classe do achado 7 da seção 3 do relatório).

- [ ] **Step 5: Criar o componente client**

Create `src/components/admin/CriarRegiaoForm.tsx`:

```tsx
'use client'

import { useFormState } from 'react-dom'
import { criarRegiao } from '@/actions/admin/criar-regiao'
import { ESTADOS_BR } from '@/lib/estados-br'

export default function CriarRegiaoForm({
  slug,
  corPrimaria,
  corTexto,
}: {
  slug: string
  corPrimaria: string
  corTexto: string
}) {
  const [state, formAction] = useFormState(criarRegiao, {})

  return (
    <div>
      <form action={formAction} className="flex gap-2">
        <input type="hidden" name="slug" value={slug} />
        <input
          name="nome"
          required
          placeholder="Nome da nova cidade"
          className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm"
        />
        <select name="uf" required defaultValue="" className="border border-gray-300 rounded-md px-3 py-2 text-sm">
          <option value="" disabled>UF...</option>
          {ESTADOS_BR.map((e) => (
            <option key={e.sigla} value={e.sigla}>{e.sigla}</option>
          ))}
        </select>
        <button
          type="submit"
          style={{ backgroundColor: corPrimaria, color: corTexto }}
          className="px-4 py-2 rounded-md text-sm font-medium"
        >
          Adicionar
        </button>
      </form>
      {state.erro && <p className="mt-1 text-sm text-red-600">{state.erro}</p>}
    </div>
  )
}
```

- [ ] **Step 6: Atualizar `src/app/[slug]/admin/configuracoes/cidades/page.tsx`**

Remover o import de `criarRegiao` (linha 5) e o import de `ESTADOS_BR` se não for mais usado diretamente na page (checar: `ESTADOS_BR` só era usado dentro do `<select>` removido — pode remover o import). Adicionar:

```typescript
import CriarRegiaoForm from '@/components/admin/CriarRegiaoForm'
```

Trocar o bloco (linhas 24-45):

```tsx
      <form action={criarRegiao} className="flex gap-2">
        <input type="hidden" name="slug" value={params.slug} />
        <input
          name="nome"
          required
          placeholder="Nome da nova cidade"
          className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm"
        />
        <select name="uf" required defaultValue="" className="border border-gray-300 rounded-md px-3 py-2 text-sm">
          <option value="" disabled>UF...</option>
          {ESTADOS_BR.map((e) => (
            <option key={e.sigla} value={e.sigla}>{e.sigla}</option>
          ))}
        </select>
        <button
          type="submit"
          style={{ backgroundColor: gabinete.corPrimaria, color: corTexto }}
          className="px-4 py-2 rounded-md text-sm font-medium"
        >
          Adicionar
        </button>
      </form>
```

por:

```tsx
      <CriarRegiaoForm slug={params.slug} corPrimaria={gabinete.corPrimaria} corTexto={corTexto} />
```

- [ ] **Step 7: Rodar typecheck e build**

Run: `npx tsc --noEmit && npm run build`
Expected: sem erros. Se `ESTADOS_BR` ficar como import não utilizado na page após a remoção do Step 6, o build vai falhar — confirmar que o import foi removido da page (ele passa a ser usado só dentro de `CriarRegiaoForm.tsx`).

- [ ] **Step 8: Verificação manual em staging**

Nome `"TESTE TASK7 ..."`. Mesmos 3 cenários (criar, reativar após desativar, concorrência) + confirmar que uma falha simulada de geocodificação (ex.: nome de cidade inválido para o serviço de geocoding) ainda cria a região, sem reportar erro ao admin. Limpar e confirmar via query.

- [ ] **Step 9: Commit**

```bash
git add prisma/migrations/20260718000003_regiao_partial_unique src/actions/admin/criar-regiao.ts src/components/admin/CriarRegiaoForm.tsx "src/app/[slug]/admin/configuracoes/cidades/page.tsx"
git commit -m "fix: Regiao ganha verificação de duplicata, índice único parcial e não reporta falha total em geocodificação parcial"
```

---

### Task 8: `Gabinete` — trata concorrência em `criar-gabinete.ts`/`editar-gabinete.ts` (sem mudar o padrão de erro)

**Files:**
- Modify: `src/actions/super-admin/criar-gabinete.ts`
- Modify: `src/actions/super-admin/editar-gabinete.ts`

**Interfaces:**
- Consumes: nenhuma migration — `Gabinete.slug` já é `@unique` real no schema hoje.
- Produces: assinaturas inalteradas (`criarGabinete(formData): Promise<void>`, `editarGabinete(id, formData): Promise<void>`) — este é o caso do Global Constraints em que a conversão para `{erro}`/`useFormState` **não** se aplica, porque o erro já é reportado via `redirect(...?erro=...)`, que não passa pela sanitização de mensagem do Next.

- [ ] **Step 1: Adicionar catch de P2002 em `criar-gabinete.ts`**

Em `src/actions/super-admin/criar-gabinete.ts`, adicionar o import no topo:

```typescript
import { Prisma } from '@/generated/prisma/client'
```

Trocar (linhas 36-38):

```typescript
  const gabinete = await prisma.gabinete.create({
    data: { nome, slug, corPrimaria, corSecundaria },
  })
```

por:

```typescript
  let gabinete: { id: string }
  try {
    gabinete = await prisma.gabinete.create({
      data: { nome, slug, corPrimaria, corSecundaria },
    })
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      redirect('/super-admin/gabinetes/novo?erro=slug_duplicado')
    }
    throw e
  }
```

- [ ] **Step 2: Adicionar catch de P2002 em `editar-gabinete.ts`**

Em `src/actions/super-admin/editar-gabinete.ts`, adicionar o import no topo:

```typescript
import { Prisma } from '@/generated/prisma/client'
```

Trocar (linhas 34-37):

```typescript
  await prisma.gabinete.update({
    where: { id },
    data: { nome, slug, corPrimaria, corSecundaria },
  })
```

por:

```typescript
  try {
    await prisma.gabinete.update({
      where: { id },
      data: { nome, slug, corPrimaria, corSecundaria },
    })
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      redirect(`/super-admin/gabinetes/${id}/editar?erro=slug_duplicado`)
    }
    throw e
  }
```

- [ ] **Step 3: Rodar typecheck e build**

Run: `npx tsc --noEmit && npm run build`
Expected: sem erros. Atenção: `redirect()` dentro do `catch` aqui é seguro porque não há nenhum código depois do `try/catch` que dependa do resultado do `create`/`update` além do `redirect` final de sucesso, que já está fora do bloco — confirmar isso por leitura do arquivo completo antes de finalizar.

- [ ] **Step 4: Verificação manual em staging (concorrência)**

Nome de gabinete `"TESTE TASK8 ..."`. Duas criações simultâneas do mesmo nome (mesmo slug gerado) — uma sucede, outra é redirecionada para `?erro=slug_duplicado` em vez de crashar. Limpar (deletar o `Gabinete` de teste e tudo que o `seedRegioes`/`seedProfissoes`/etc. criaram junto — usar `prisma.gabinete.delete` com cascade se configurado, ou deletar manualmente as entidades filhas primeiro) e confirmar via query.

- [ ] **Step 5: Commit**

```bash
git add src/actions/super-admin/criar-gabinete.ts src/actions/super-admin/editar-gabinete.ts
git commit -m "fix: criar-gabinete/editar-gabinete tratam colisão de slug sob concorrência (achado 1.3 da auditoria de terceira ordem)"
```

---

### Task 9: RLS — reaplicar `setup-supabase.sql` e cobrir as 7 tabelas sem política

> **Task de alto cuidado — mexe com DDL de segurança em bancos reais (staging e produção).** Nenhuma alteração de dado, só DDL (`CREATE POLICY`/`CREATE OR REPLACE FUNCTION`), mas deve ser aplicada com o mesmo rigor de verificação usado nas migrations deste plano: staging primeiro, verificação explícita, produção depois.

**Files:**
- Modify: `scripts/setup-supabase.sql` (adicionar seção 5 com as políticas das 7 tabelas descobertas sem cobertura)

**Interfaces:**
- Consumes: nada de outras tasks.
- Produces: nada consumido por outras tasks (a Task 10 depende do resultado desta task existir no banco, não de nenhuma interface de código).

- [ ] **Step 1: Adicionar a seção 5 ao script**

Ao final de `scripts/setup-supabase.sql` (depois da seção 4, índices parciais), adicionar:

```sql

-- ------------------------------------------------------------
-- 5. Políticas RLS para as 7 tabelas descobertas sem cobertura
-- (achado 1.1 da auditoria de terceira ordem, 2026-07-17): RLS estava
-- habilitado (ALTER TABLE ... ENABLE ROW LEVEL SECURITY já rodado, provável
-- ação em massa do Security Advisor do Supabase) em produção e staging,
-- mas nenhuma política — nem as das seções 2-3 acima, nem estas — existia
-- de fato em nenhum dos dois bancos até esta migração ser aplicada.
-- ------------------------------------------------------------

-- AreaDemanda: escopo direto por gabineteId
CREATE POLICY "area_demanda_all" ON "AreaDemanda"
  FOR ALL TO authenticated
  USING ("gabineteId" = auth.uid_gabinete())
  WITH CHECK ("gabineteId" = auth.uid_gabinete());

-- Demanda: escopo direto por gabineteId
CREATE POLICY "demanda_all" ON "Demanda"
  FOR ALL TO authenticated
  USING ("gabineteId" = auth.uid_gabinete())
  WITH CHECK ("gabineteId" = auth.uid_gabinete());

-- MovimentacaoDemanda: sem gabineteId — join via Demanda do mesmo gabinete
CREATE POLICY "movimentacao_demanda_all" ON "MovimentacaoDemanda"
  FOR ALL TO authenticated
  USING (
    "demandaId" IN (
      SELECT id FROM "Demanda" WHERE "gabineteId" = auth.uid_gabinete()
    )
  );

-- ConfiguracaoSistema: escopo direto por gabineteId (coluna única)
CREATE POLICY "configuracao_sistema_all" ON "ConfiguracaoSistema"
  FOR ALL TO authenticated
  USING ("gabineteId" = auth.uid_gabinete())
  WITH CHECK ("gabineteId" = auth.uid_gabinete());

-- AreaColocacao: escopo direto por gabineteId
CREATE POLICY "area_colocacao_all" ON "AreaColocacao"
  FOR ALL TO authenticated
  USING ("gabineteId" = auth.uid_gabinete())
  WITH CHECK ("gabineteId" = auth.uid_gabinete());

-- BancoTalentos: sem gabineteId — join via Pessoa do mesmo gabinete
CREATE POLICY "banco_talentos_all" ON "BancoTalentos"
  FOR ALL TO authenticated
  USING (
    "pessoaId" IN (
      SELECT id FROM "Pessoa" WHERE "gabineteId" = auth.uid_gabinete()
    )
  );

-- BancoTalentosArea: sem gabineteId — join via AreaColocacao do mesmo gabinete
CREATE POLICY "banco_talentos_area_all" ON "BancoTalentosArea"
  FOR ALL TO authenticated
  USING (
    "areaColocacaoId" IN (
      SELECT id FROM "AreaColocacao" WHERE "gabineteId" = auth.uid_gabinete()
    )
  );

ALTER TABLE "AreaDemanda"          ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Demanda"              ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MovimentacaoDemanda"  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ConfiguracaoSistema"  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AreaColocacao"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BancoTalentos"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BancoTalentosArea"    ENABLE ROW LEVEL SECURITY;
```

Nota: os `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` para estas 7 tabelas já foram aplicados de fato nos dois bancos (confirmado pela auditoria via `pg_class.relrowsecurity`) — mas ficam explícitos aqui porque `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` é idempotente (não falha se já habilitado) e o script deve continuar sendo a fonte de verdade completa e re-executável do zero em caso de necessidade (ex.: banco de staging recriado do zero no futuro).

- [ ] **Step 2: Verificar o estado atual em staging antes de aplicar**

```bash
cd /Users/renato/Documents/meubd
set -a; source .env.staging; set +a
node -e "
import('pg').then(async ({Client}) => {
  const client = new Client({connectionString: process.env.DIRECT_URL})
  await client.connect()
  const pol = await client.query(\"SELECT count(*)::int AS n FROM pg_policies WHERE schemaname='public'\")
  console.log('Políticas antes:', pol.rows[0].n)
  await client.end()
})
"
```
Expected: `Políticas antes: 0`.

- [ ] **Step 3: Aplicar o script inteiro em staging**

```bash
cd /Users/renato/Documents/meubd
set -a; source .env.staging; set +a
node -e "
import('pg').then(async ({Client}) => {
  const client = new Client({connectionString: process.env.DIRECT_URL})
  await client.connect()
  const fs = await import('fs')
  const sql = fs.readFileSync('scripts/setup-supabase.sql', 'utf8')
  await client.query(sql)
  console.log('setup-supabase.sql aplicado em staging')
  await client.end()
})
"
```
Expected: `setup-supabase.sql aplicado em staging`, sem erro. Se der erro em algum `CREATE POLICY` porque a política já existe parcialmente (não deveria, já que `pg_policies` está vazio, mas por segurança), o erro vai indicar exatamente qual política — resolver manualmente com `DROP POLICY IF EXISTS "<nome>" ON "<tabela>";` antes de tentar de novo, nunca pulando a policy silenciosamente.

- [ ] **Step 4: Verificar o resultado em staging**

```bash
node -e "
import('pg').then(async ({Client}) => {
  const client = new Client({connectionString: process.env.DIRECT_URL})
  await client.connect()
  const pol = await client.query(\"SELECT count(*)::int AS n FROM pg_policies WHERE schemaname='public'\")
  const rls = await client.query(\"SELECT relname FROM pg_class WHERE relnamespace='public'::regnamespace AND relkind='r' AND relrowsecurity=true ORDER BY relname\")
  console.log('Políticas depois:', pol.rows[0].n)
  console.log('Tabelas com RLS:', rls.rows.length)
  await client.end()
})
"
```
Expected: `Políticas depois: 20` (18 políticas nomeadas nas seções 3+5, note que `pessoa_write`/`segmento_write`/`vinculo_rede_all`/etc. contam FOR ALL como uma política só — contar exatamente pelo script: 13 da seção 3 + 7 da seção 5 = 20). `Tabelas com RLS: 19` (ou o número real encontrado — deve bater com o que a auditoria original já confirmou).

- [ ] **Step 5: Teste funcional em staging — a aplicação continua funcionando**

Rodar o app apontado para staging (ou usar o ambiente de staging deployado) e confirmar um fluxo básico (login admin, listar pessoas, criar uma demanda de teste) — como toda leitura/escrita passa por Prisma com a service-role key (que ignora RLS incondicionalmente, confirmado na investigação), este passo deve simplesmente não quebrar nada. Se qualquer coisa quebrar, é sinal de que algo no código usa o cliente Supabase direto (anon/authenticated key) para acessar uma dessas tabelas — parar e investigar antes de prosseguir para produção.

- [ ] **Step 6: Aplicar em produção**

Repetir Steps 2-4 trocando `.env.staging` por `.env.local` (produção — mesmo banco do `.env.production`).

- [ ] **Step 7: Teste funcional em produção**

Confirmar (sem alterar dado real) que login e navegação básica continuam funcionando normalmente após a aplicação — checar logs de erro do EasyPanel/container nos minutos seguintes à aplicação.

- [ ] **Step 8: Commit**

```bash
git add scripts/setup-supabase.sql
git commit -m "fix: aplica políticas RLS faltantes em produção e staging — RLS estava habilitado sem nenhuma política em nenhum dos dois bancos (achado 1.1 da auditoria de terceira ordem)"
```

---

### Task 10: Script de verificação de divergência RLS + documentação

**Files:**
- Create: `scripts/verificar-rls.mjs`
- Modify: `HANDOFF.md`

**Interfaces:**
- Consumes: nenhuma dependência de código — só `pg` (já em `package.json`) e a env var `DIRECT_URL`.
- Produces: script standalone, não integrado a `npm test` (decisão documentada no Global Constraints deste plano — o projeto não tem pipeline de CI com acesso a banco, ver `.github/workflows/deploy-staging.yml`, que só dispara deploy, não testes).

- [ ] **Step 1: Criar o script**

Create `scripts/verificar-rls.mjs`:

```javascript
#!/usr/bin/env node
// Verifica se toda tabela com RLS habilitado (pg_class.relrowsecurity) tem
// ao menos uma política (pg_policies) — detecta a divergência descoberta na
// auditoria de terceira ordem (2026-07-17): RLS habilitado sem nenhuma
// política em produção e staging, nunca detectado porque as duas auditorias
// anteriores liam scripts/setup-supabase.sql como fonte de verdade em vez
// de consultar o banco real.
//
// Uso: DIRECT_URL=... node scripts/verificar-rls.mjs
// Ou:  set -a; source .env.staging; set +a; node scripts/verificar-rls.mjs
//
// Não faz parte de `npm test` — é um verificador de estado de banco, não um
// teste de unidade, e este projeto não roda testes contra banco real em CI.
// Rodar manualmente depois de qualquer migration/deploy que toque RLS.

import { Client } from 'pg'

const TABELAS_DENY_ALL_INTENCIONAL = new Set(['LogSuporte', '_prisma_migrations'])

async function main() {
  const connectionString = process.env.DIRECT_URL
  if (!connectionString) {
    console.error('DIRECT_URL não definido. Rode: set -a; source .env.staging; set +a; node scripts/verificar-rls.mjs')
    process.exit(1)
  }

  const client = new Client({ connectionString })
  await client.connect()

  const { rows: tabelasComRls } = await client.query(`
    SELECT relname
    FROM pg_class
    WHERE relnamespace = 'public'::regnamespace AND relkind = 'r' AND relrowsecurity = true
    ORDER BY relname
  `)
  const { rows: tabelasComPolicy } = await client.query(`
    SELECT DISTINCT tablename FROM pg_policies WHERE schemaname = 'public'
  `)
  await client.end()

  const comPolicy = new Set(tabelasComPolicy.map((r) => r.tablename))
  const semPolicy = tabelasComRls
    .map((r) => r.relname)
    .filter((nome) => !comPolicy.has(nome) && !TABELAS_DENY_ALL_INTENCIONAL.has(nome))

  if (semPolicy.length > 0) {
    console.error('DIVERGÊNCIA ENCONTRADA — tabelas com RLS habilitado e ZERO políticas:')
    for (const nome of semPolicy) console.error(`  - ${nome}`)
    console.error('\nIsso significa deny-all silencioso para qualquer acesso via anon/authenticated key.')
    console.error('Reaplique scripts/setup-supabase.sql ou investigue por que a política não existe.')
    process.exit(1)
  }

  console.log(`OK — ${tabelasComRls.length} tabelas com RLS habilitado, todas com ao menos 1 política (exceto: ${[...TABELAS_DENY_ALL_INTENCIONAL].join(', ')}, deny-all intencional).`)
}

main().catch((e) => {
  console.error('Erro ao verificar RLS:', e)
  process.exit(1)
})
```

- [ ] **Step 2: Rodar contra staging e confirmar OK**

```bash
cd /Users/renato/Documents/meubd
set -a; source .env.staging; set +a
node scripts/verificar-rls.mjs
```
Expected: `OK — 19 tabelas com RLS habilitado, todas com ao menos 1 política (exceto: LogSuporte, _prisma_migrations, deny-all intencional).` (assumindo Task 9 já aplicada; se rodado antes da Task 9, deve falhar listando as 7 tabelas — usar isso como confirmação de que o script de fato detecta o problema antes de prosseguir).

- [ ] **Step 3: Rodar contra produção e confirmar OK**

```bash
set -a; source .env.local; set +a
node scripts/verificar-rls.mjs
```
Expected: mesma saída `OK`.

- [ ] **Step 4: Documentar no HANDOFF.md**

Adicionar uma nova entrada na seção de "Problemas conhecidos" (ou seção equivalente mais recente) do `HANDOFF.md`, e uma linha no checklist de deploy (se existir uma seção de checklist), com o texto:

```markdown
### Verificação de RLS (scripts/verificar-rls.mjs)

Depois de qualquer migration que crie/altere tabela ou toque `scripts/setup-supabase.sql`,
rodar manualmente:

\`\`\`bash
set -a; source .env.staging; set +a && node scripts/verificar-rls.mjs
set -a; source .env.local; set +a && node scripts/verificar-rls.mjs
\`\`\`

Detecta tabelas com RLS habilitado (`pg_class.relrowsecurity`) e zero políticas
(`pg_policies`) — o estado que ficou sem detecção por duas auditorias inteiras
porque `scripts/setup-supabase.sql` era lido como fonte de verdade em vez do
banco real (achado 1.1 da auditoria de terceira ordem, 2026-07-17, corrigido
na mesma sessão). Não roda em CI — é um verificador de estado de banco, não
um teste de unidade; o projeto não tem pipeline de CI com acesso a banco real.
```

Usar o `Read` para localizar a seção correta antes de editar (a numeração de seções do HANDOFF.md muda a cada sessão — a task-brief não fixa um número).

- [ ] **Step 5: Commit**

```bash
git add scripts/verificar-rls.mjs HANDOFF.md
git commit -m "chore: adiciona script de verificação de divergência RLS e documenta no HANDOFF"
```

---

### Task 11: Exportação de demandas ganha paridade de limite síncrono com exportação de pessoas

**Files:**
- Modify: `src/app/api/[slug]/filtros/demandas/exportar/route.ts`

**Interfaces:**
- Consumes: `LIMITE_EXPORT_SINCRONO` (de `src/lib/filtros-pessoas.ts`, já existente), `uploadExportacaoESaerAssinada` (de `src/lib/upload-exportacao.ts`, já existente, assinatura `(gabineteId: string, exportId: string, extensao: string, contentType: string, buffer: Buffer): Promise<string>`), `enviarEmail`/`templateExportacaoPronta` (de `src/lib/email.ts`, já existentes).
- Produces: nada consumido por outras tasks.

- [ ] **Step 1: Reescrever a rota**

Replace o conteúdo inteiro de `src/app/api/[slug]/filtros/demandas/exportar/route.ts`:

```typescript
// src/app/api/[slug]/filtros/demandas/exportar/route.ts
import { randomUUID } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { assertAdminAccess } from '@/lib/assert-admin-access'
import { assertMobilizadorAccess } from '@/lib/assert-mobilizador-access'
import { buildWhereDemandas, type FiltrosDemandasParams } from '@/lib/filtros-demandas'
import { LIMITE_EXPORT_SINCRONO } from '@/lib/filtros-pessoas'
import { gerarPdfDemandas, gerarExcelDemandas, type DemandaExportavel } from '@/lib/exportar-demandas'
import { uploadExportacaoESaerAssinada } from '@/lib/upload-exportacao'
import { enviarEmail, templateExportacaoPronta } from '@/lib/email'

function paginaConfirmacao(): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="utf-8"><title>Exportação iniciada</title></head>
<body style="font-family: sans-serif; max-width: 480px; margin: 80px auto; text-align: center; color: #333;">
  <h1 style="font-size: 20px;">Exportação iniciada</h1>
  <p>Sua exportação foi iniciada. Você vai receber um e-mail com o link de download em alguns minutos.</p>
</body>
</html>`
}

// Mesmo racional de src/app/api/[slug]/filtros/pessoas/exportar/route.ts:
// roda em segundo plano sem bloquear a resposta HTTP — seguro porque o
// processo Node do Docker é persistente (não serverless).
async function gerarESalvarExportacao(
  demandas: DemandaExportavel[],
  formato: 'pdf' | 'excel',
  gabineteId: string,
  destinatario: { nome: string; email: string }
): Promise<void> {
  const buffer = formato === 'excel' ? await gerarExcelDemandas(demandas) : await gerarPdfDemandas(demandas)
  const extensao = formato === 'excel' ? 'xlsx' : 'pdf'
  const contentType =
    formato === 'excel'
      ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      : 'application/pdf'
  const url = await uploadExportacaoESaerAssinada(gabineteId, randomUUID(), extensao, contentType, buffer)
  const expiraEm = new Date(Date.now() + 48 * 60 * 60 * 1000)
  await enviarEmail({
    para: destinatario.email,
    assunto: 'Sua exportação está pronta',
    html: templateExportacaoPronta({ nomeDestinatario: destinatario.nome, urlDownload: url, expiraEm }),
  })
}

export async function GET(request: NextRequest, { params }: { params: { slug: string } }) {
  let gabineteId: string
  let responsavelId: string | undefined
  let solicitante: { nome: string; email: string } | undefined

  try {
    const { session, gabinete } = await assertAdminAccess(params.slug)
    gabineteId = gabinete.id
    if (session.user.email) {
      solicitante = {
        nome: (session.user.user_metadata?.full_name as string | undefined) ?? session.user.email,
        email: session.user.email,
      }
    }
  } catch {
    try {
      const { session, gabinete, pessoa } = await assertMobilizadorAccess(params.slug)
      gabineteId = gabinete.id
      responsavelId = pessoa.id
      if (session.user.email) {
        solicitante = {
          nome: (session.user.user_metadata?.full_name as string | undefined) ?? session.user.email,
          email: session.user.email,
        }
      }
    } catch {
      return new NextResponse('Não autorizado', { status: 403 })
    }
  }

  const sp = request.nextUrl.searchParams
  const filtros: FiltrosDemandasParams = {
    areaId: sp.get('areaId') ?? undefined,
    status: (sp.get('status') as 'atendida' | 'nao_atendida' | 'pendente' | null) ?? undefined,
    regiaoId: sp.get('regiaoId') ?? undefined,
    dataInicio: sp.get('dataInicio') ?? undefined,
    dataFim: sp.get('dataFim') ?? undefined,
  }
  const formato: 'pdf' | 'excel' = sp.get('formato') === 'excel' ? 'excel' : 'pdf'

  const where = buildWhereDemandas(gabineteId, filtros, responsavelId)
  const demandas: DemandaExportavel[] = await prisma.demanda.findMany({
    where,
    orderBy: { criadoEm: 'desc' },
    select: {
      titulo: true,
      status: true,
      prazoDesfecho: true,
      area: { select: { nome: true } },
      solicitante: { select: { nome: true } },
      responsavel: { select: { nome: true } },
    },
  })

  if (demandas.length >= LIMITE_EXPORT_SINCRONO) {
    if (solicitante) {
      gerarESalvarExportacao(demandas, formato, gabineteId, solicitante).catch((err) => {
        console.error('[exportar-demandas] falha na exportação assíncrona:', err)
      })
    } else {
      console.error('[exportar-demandas] sessão sem e-mail — exportação assíncrona não enviada')
    }
    return new NextResponse(paginaConfirmacao(), {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  }

  if (formato === 'excel') {
    const buffer = await gerarExcelDemandas(demandas)
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="demandas_filtradas.xlsx"',
      },
    })
  }

  const buffer = await gerarPdfDemandas(demandas)
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename="demandas_filtradas.pdf"',
    },
  })
}
```

- [ ] **Step 2: Rodar typecheck e build**

Run: `npx tsc --noEmit && npm run build`
Expected: sem erros.

- [ ] **Step 3: Verificação manual**

Sem dado real necessário: testar a rota com um gabinete de teste que tenha menos de 500 demandas — comportamento síncrono inalterado (baixa o arquivo direto). Simular o caminho assíncrono é impraticável sem 500+ demandas reais; validar por leitura que a lógica é estruturalmente idêntica à de `pessoas/exportar/route.ts` (já testada e em produção) — mesmo padrão, mesma constante, mesmas funções de upload/e-mail reaproveitadas sem modificação.

- [ ] **Step 4: Commit**

```bash
git add "src/app/api/[slug]/filtros/demandas/exportar/route.ts"
git commit -m "fix: exportação de demandas ganha paridade de limite síncrono/assíncrono com exportação de pessoas (achado 1.7 da auditoria de terceira ordem)"
```

---

### Task 12: Cron de verificação de demandas não aborta o lote inteiro por item

**Files:**
- Modify: `src/app/api/cron/verificar-demandas/route.ts`

**Interfaces:**
- Consumes: nada de outras tasks.
- Produces: nada consumido por outras tasks. Contrato de resposta HTTP muda de `{ expiradas, alertas }` para `{ expiradas, alertas, falhas }` (campo novo, aditivo — nenhum consumidor externo depende do formato exato, é só o log do cron job).

- [ ] **Step 1: Reescrever a rota com try/catch por item**

Replace o conteúdo inteiro de `src/app/api/cron/verificar-demandas/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { enviarEmail, templateAlertaExpiracao, templateDemandaExpirada } from '@/lib/email'

export async function POST(req: NextRequest) {
  const auth = req.headers.get('Authorization')
  const secret = process.env.CRON_SECRET
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ erro: 'Não autorizado' }, { status: 401 })
  }

  const agora = new Date()
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''
  let expiradas = 0
  let alertas = 0
  const falhas: string[] = []

  // 1. Marcar demandas expiradas
  const demandasExpiradas = await prisma.demanda.findMany({
    where: { status: 'aberta', deletedAt: null, prazoDesfecho: { lt: agora } },
    include: {
      gabinete: { select: { slug: true } },
      responsavel: { select: { nome: true, email: true } },
      solicitante: { select: { nome: true } },
      criadoPor: { select: { email: true, nome: true } },
    },
  })

  for (const demanda of demandasExpiradas) {
    try {
      await prisma.demanda.update({
        where: { id: demanda.id },
        data: { status: 'expirada' },
      })
      await prisma.movimentacaoDemanda.create({
        data: {
          demandaId: demanda.id,
          tipo: 'status_alterado',
          descricao: 'Demanda expirada automaticamente por ultrapassar o prazo',
          autorId: demanda.criadoPorId,
        },
      })

      const urlDemanda = `${appUrl}/${demanda.gabinete.slug}/admin/demandas/${demanda.id}`

      if (demanda.responsavel.email) {
        try {
          await enviarEmail({
            para: demanda.responsavel.email,
            assunto: `Demanda expirada: ${demanda.titulo}`,
            html: templateDemandaExpirada({
              nomeDestinatario: demanda.responsavel.nome,
              tituloDemanda: demanda.titulo,
              nomeSolicitante: demanda.solicitante.nome,
              urlDemanda,
            }),
          })
        } catch { /* não bloqueia */ }
      }

      if (demanda.criadoPor.email && demanda.criadoPor.email !== demanda.responsavel.email) {
        try {
          await enviarEmail({
            para: demanda.criadoPor.email,
            assunto: `Demanda expirada: ${demanda.titulo}`,
            html: templateDemandaExpirada({
              nomeDestinatario: demanda.criadoPor.nome,
              tituloDemanda: demanda.titulo,
              nomeSolicitante: demanda.solicitante.nome,
              urlDemanda,
            }),
          })
        } catch { /* não bloqueia */ }
      }

      expiradas++
    } catch (e) {
      console.error(`[cron/verificar-demandas] falha ao processar expiração da demanda ${demanda.id}:`, e)
      falhas.push(`expiracao:${demanda.id}`)
    }
  }

  // 2. Alertas de expiração próxima
  const configs = await prisma.configuracaoSistema.findMany({
    select: { gabineteId: true, alertaExpiracaoHoras: true },
  })

  for (const config of configs) {
    const limiteAlerta = new Date(agora.getTime() + config.alertaExpiracaoHoras * 60 * 60 * 1000)

    const demandasAlerta = await prisma.demanda.findMany({
      where: {
        gabineteId: config.gabineteId,
        status: 'aberta',
        deletedAt: null,
        alertaEnviadoEm: null,
        prazoDesfecho: { gte: agora, lte: limiteAlerta },
      },
      include: {
        gabinete: { select: { slug: true } },
        responsavel: { select: { nome: true, email: true } },
      },
    })

    for (const demanda of demandasAlerta) {
      if (!demanda.responsavel.email) continue
      try {
        await enviarEmail({
          para: demanda.responsavel.email,
          assunto: `Atenção: demanda próxima de expirar — ${demanda.titulo}`,
          html: templateAlertaExpiracao({
            nomeResponsavel: demanda.responsavel.nome,
            tituloDemanda: demanda.titulo,
            prazo: demanda.prazoDesfecho,
            urlDemanda: `${appUrl}/${demanda.gabinete.slug}/mobilizador/demandas/${demanda.id}`,
          }),
        })
        await prisma.demanda.update({
          where: { id: demanda.id },
          data: { alertaEnviadoEm: agora },
        })
        alertas++
      } catch (e) {
        console.error(`[cron/verificar-demandas] falha ao processar alerta da demanda ${demanda.id}:`, e)
        falhas.push(`alerta:${demanda.id}`)
      }
    }
  }

  return NextResponse.json({ expiradas, alertas, falhas })
}
```

Nota: a mudança central é mover o `try/catch` de "só em volta do `enviarEmail`" para "em volta do item inteiro do loop" (update + movimentação + e-mails, para expiração; e-mail + update, para alerta) — hoje uma falha no `prisma.demanda.update` ou no `prisma.movimentacaoDemanda.create` no meio do loop de expiração propagava e abortava silenciosamente todas as demandas seguintes do mesmo lote, sem nenhum registro do que ficou pra trás (achado 1.8). Cada item passa a ser independente: uma falha isolada não impede os demais, e a lista `falhas` no retorno registra o que precisa de atenção manual.

- [ ] **Step 2: Rodar typecheck e build**

Run: `npx tsc --noEmit && npm run build`
Expected: sem erros.

- [ ] **Step 3: Verificação manual**

Sem dado real necessário para simular a falha (exigiria induzir um erro de rede/DB no meio do processamento, fora do escopo desta auditoria — ver limitações declaradas no relatório). Verificação por leitura: confirmar que o `try/catch` externo de cada loop realmente envolve a chamada de `update`/`create` do Prisma (não só o e-mail), e que o loop continua (`for...of` sem `break`/`return` dentro do `catch`) para o próximo item.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/cron/verificar-demandas/route.ts
git commit -m "fix: cron de verificação de demandas não aborta o lote inteiro quando um item falha (achado 1.8 da auditoria de terceira ordem)"
```

---

### Task 13: `alterar-prazo-demanda.ts` — normaliza parsing de data sem timezone

**Files:**
- Modify: `src/actions/admin/alterar-prazo-demanda.ts:42`

**Interfaces:**
- Consumes: nada de outras tasks.
- Produces: nada consumido por outras tasks.

- [ ] **Step 1: Aplicar a correção**

Em `src/actions/admin/alterar-prazo-demanda.ts`, trocar a linha 42:

```typescript
  const prazoNovo = new Date(novoPrazo)
```

por:

```typescript
  // novoPrazo vem de <input type="date"> como "YYYY-MM-DD" — new Date()
  // direto interpreta isso como UTC meia-noite, o que pode exibir um dia a
  // menos em timezone de Brasília (UTC-3) dependendo de onde é renderizado
  // (achado 1.9 da auditoria de terceira ordem). Fixar meio-dia UTC evita
  // que qualquer conversão de timezone razoável (até UTC-12/+14) cruze pra
  // o dia anterior ou seguinte.
  const prazoNovo = new Date(`${novoPrazo}T12:00:00Z`)
```

- [ ] **Step 2: Rodar typecheck**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 3: Verificação manual**

Sem dado real necessário: em um REPL Node local, confirmar `new Date('2026-07-20T12:00:00Z').toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })` retorna `20/07/2026` (antes da correção, `new Date('2026-07-20').toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })` retornava `19/07/2026`).

- [ ] **Step 4: Commit**

```bash
git add src/actions/admin/alterar-prazo-demanda.ts
git commit -m "fix: alterar-prazo-demanda normaliza parsing de data para evitar off-by-one por timezone (achado 1.9 da auditoria de terceira ordem)"
```

---

### Task 14: `criarOuReaproveitarUsuarioMobilizador` — re-checa antes de reportar "conta órfã"

**Files:**
- Modify: `src/lib/supabase/criar-usuario-mobilizador.ts`

**Interfaces:**
- Consumes: nada de outras tasks.
- Produces: assinatura inalterada (`criarOuReaproveitarUsuarioMobilizador(supabaseAdmin, email, senha): Promise<{userId: string} | {erro: string}>`).

- [ ] **Step 1: Aplicar o re-check**

Em `src/lib/supabase/criar-usuario-mobilizador.ts`, trocar (linhas 48-63):

```typescript
  const vinculoExistente = await prisma.pessoa.findFirst({
    where: { userId: usuarioExistente.id },
    select: { id: true },
  })
  if (vinculoExistente) {
    return { erro: 'Já existe uma conta com este e-mail vinculada a outra pessoa. Verifique com o suporte.' }
  }

  return {
    erro:
      `Este e-mail já tem uma conta de acesso, mas sem vínculo com nenhuma pessoa cadastrada — ` +
      `provavelmente sobrou de uma promoção anterior que não terminou. Por segurança, essa conta não é ` +
      `reaproveitada automaticamente. Peça a um super-admin para excluir a conta órfã (ID ${usuarioExistente.id}) ` +
      `no Supabase Auth e tente promover novamente.`,
  }
```

por:

```typescript
  const vinculoExistente = await prisma.pessoa.findFirst({
    where: { userId: usuarioExistente.id },
    select: { id: true },
  })
  if (vinculoExistente) {
    return { erro: 'Já existe uma conta com este e-mail vinculada a outra pessoa. Verifique com o suporte.' }
  }

  // Corrida rara: duas promoções quase simultâneas do mesmo e-mail — a
  // primeira pode ainda não ter commitado o vínculo Pessoa/UsuarioGabinete
  // no instante em que a segunda chega aqui, gerando um falso positivo de
  // "conta órfã" (achado 2.1 da auditoria de terceira ordem). Um segundo
  // re-check, depois de uma pequena espera, cobre essa janela sem custo
  // perceptível no caminho comum (conta realmente órfã).
  await new Promise((resolve) => setTimeout(resolve, 500))
  const vinculoExistenteRecheck = await prisma.pessoa.findFirst({
    where: { userId: usuarioExistente.id },
    select: { id: true },
  })
  if (vinculoExistenteRecheck) {
    return { erro: 'Já existe uma conta com este e-mail vinculada a outra pessoa. Verifique com o suporte.' }
  }

  return {
    erro:
      `Este e-mail já tem uma conta de acesso, mas sem vínculo com nenhuma pessoa cadastrada — ` +
      `provavelmente sobrou de uma promoção anterior que não terminou. Por segurança, essa conta não é ` +
      `reaproveitada automaticamente. Peça a um super-admin para excluir a conta órfã (ID ${usuarioExistente.id}) ` +
      `no Supabase Auth e tente promover novamente.`,
  }
```

- [ ] **Step 2: Rodar typecheck**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 3: Verificação manual**

Sem dado real necessário para reproduzir a corrida exata (janela de milissegundos entre duas requisições reais — fora do escopo comprovável sem carga real, ver limitações do relatório). Verificação por leitura: confirmar que o `setTimeout`+re-check está posicionado depois do primeiro `findFirst` (que já provou não haver vínculo) e antes do `return` que reporta "órfã", e que o caminho `vinculoExistente` (primeiro check, achando vínculo) continua retornando imediatamente sem esperar — o delay só afeta o caminho que hoje já é o mais raro (conta sem vínculo nenhum).

- [ ] **Step 4: Commit**

```bash
git add src/lib/supabase/criar-usuario-mobilizador.ts
git commit -m "fix: re-checa vínculo antes de reportar conta órfã em promoção de mobilizador, reduzindo falso positivo sob corrida (achado 2.1 da auditoria de terceira ordem)"
```

---

## Self-Review (executado ao escrever este plano)

**1. Cobertura do relatório de auditoria:** achados 1.1 (Task 9+10), 1.2 (Tasks 3+5), 1.3 (Tasks 4+8), 1.4 (Task 2), 1.5 (Task 1), 1.6 (Task 5, redesenhado para índice parcial), 1.7 (Task 11), 1.8 (Task 12), 1.9 (Task 13), 2.1 (Task 14), e o achado de baixa severidade da seção 3 sobre `Regiao`/`Profissao` (Tasks 6+7, elevado a correção estrutural após a descoberta do design já existente em `setup-supabase.sql`) — todos cobertos. Os itens "confirmado como sem problema" (seção 4 do relatório) e o TOCTOU de `submeter-cadastro.ts` (já corrigido em plano anterior, achado C) não geram task nova, corretamente.

**2. Placeholder scan:** nenhum "TBD"/"implement later"/"add error handling" genérico neste plano — toda Server Action reescrita tem o código completo, toda migration tem o SQL completo, todo componente client tem o JSX completo.

**3. Consistência de tipos:** todas as Server Actions convertidas seguem a mesma assinatura `(prevState: {erro?: string}, formData: FormData): Promise<{erro?: string}>`; todos os componentes client seguem `useFormState(<action>, {})`; toda migration parcial segue o padrão `CREATE UNIQUE INDEX IF NOT EXISTS ... WHERE <condição>` já validado em produção nesta sessão (Pessoa, VinculoRede). `criar-gabinete.ts`/`editar-gabinete.ts` são a única exceção deliberada e documentada no Global Constraints.

**Ordem de execução recomendada:** Tasks 1-2 (independentes, sem risco) → Tasks 3-8 (migrations + actions de catálogo, cada uma independente das outras, mas todas antes da Task 9 para não competir por janelas de manutenção separadas) → Task 9-10 (RLS, isolada e de alto cuidado) → Tasks 11-14 (Prioridade 3, independentes entre si e do resto).
