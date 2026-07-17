# Correção dos Achados Remanescentes da Auditoria — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fechar todos os achados ainda abertos de duas revisões adversariais encadeadas — a auditoria original (achados C2/C3/C4, já corrigidos em `35027cc..7a23b71`) e a revisão de regressão sobre esse diff (achados 5-9 e A-E, dos quais só 1-4 foram corrigidos em `faba09e..aaa06d3`). Nenhuma correção aqui deve eliminar só a instância do bug — sempre que o mesmo padrão aparecer em mais de um lugar, a correção cobre todos os lugares.

**Architecture:** Nove correções independentes entre si (podem ser revisadas fora de ordem), mais uma tarefa de arquitetura (error boundaries) que serve de rede de segurança para as demais, e uma tarefa final de verificação. Onde a mesma lógica se repete em 2+ arquivos (busca de mobilizador ativo por token), extrai um helper único em vez de corrigir cada cópia separadamente — mesma lição da correção C2 original (`validarImagemUpload`). Onde uma Server Action ainda usa `throw` + `<form action={fn}>` cru, converte para o padrão já validado nesta mesma auditoria: a action retorna `{erro?: string}` e o form vira Client Component com `useFormState` do `react-dom`.

**Tech Stack:** Next.js 14.2 (App Router) + React 18 + TypeScript 5 (strict) + Prisma 7.8 (`adapter-pg`) + Supabase (Auth + Storage + Postgres) + Tailwind 3.4 + Vitest.

## Global Constraints

- Este projeto não escreve teste automatizado para código que depende de `prisma`/DB/Supabase Storage — só funções puras (sem I/O) ganham teste TDD. Toda Server Action e toda query Prisma neste plano é verificada manualmente, nunca com teste automatizado.
- `Prisma.PrismaClientKnownRequestError` (para checar `code === 'P2002'`) importa de `@/generated/prisma/client` — mesmo caminho já usado em `src/actions/admin/restaurar-pessoa.ts`.
- **Next.js sanitiza a mensagem de exceções lançadas (`throw`) em Server Actions nos builds de produção** (só preserva a mensagem original em modo dev) — confirmado empiricamente na sessão anterior desta mesma auditoria. Por isso toda Server Action que precisa comunicar um erro específico ao usuário deve **retornar** `{erro: string}`, nunca `throw`, e o form correspondente deve usar `useFormState` do `react-dom` (não um `<form action={fn}>` cru chamando uma função que lança exceção).
- **Nunca chame `redirect()` de dentro de um `try { }` que tem um `catch` genérico** — `redirect()` funciona lançando uma exceção interna especial (`NEXT_REDIRECT`) que o Next.js precisa deixar passar; um `catch (e) { ... }` genérico a captura como se fosse um erro real e quebra o redirect. Sempre chame `redirect()` depois do bloco try/catch (só no caminho de sucesso), nunca dentro dele.
- Migration de índice único parcial é sempre SQL bruto manual (Prisma não gera isso nativamente) — mesmo padrão de `prisma/migrations/20260716120000_pessoa_soft_delete_partial_unique/migration.sql`: `DROP INDEX IF EXISTS` seguido de `CREATE UNIQUE INDEX IF NOT EXISTS ... WHERE "deletedAt" IS NULL`, usando o nome de índice que o Prisma geraria automaticamente para o `@@unique` removido (`<Model>_<campo1>_<campo2>_..._key`).
- Build roda `npx prisma generate` automaticamente (ver `Dockerfile`) — não precisa rodar manualmente antes de commitar, só antes de testar localmente.
- Verificação final de cada task: `npx tsc --noEmit` sem erro. Build completo (`rm -rf .next && npm run build`) só na Task 10 (fazer isso a cada task deixaria o ciclo lento demais).

---

### Task 1: Error boundaries — rede de segurança sistêmica

**Files:**
- Create: `src/components/ErroBoundaryConteudo.tsx`
- Create: `src/app/[slug]/admin/error.tsx`
- Create: `src/app/[slug]/mobilizador/error.tsx`
- Create: `src/app/[slug]/cadastro/error.tsx`

**Interfaces:**
- Produces: `ErroBoundaryConteudo({ error, reset }: { error: Error & { digest?: string }; reset: () => void })` — componente de UI compartilhado, consumido pelos 3 `error.tsx`.
- Nenhuma outra task depende desta — é independente, mas deve ser feita primeiro porque serve de rede de segurança enquanto as Tasks 2-9 ainda não corrigiram todos os `throw` remanescentes.

**Contexto:** hoje não existe nenhum `error.tsx` em nenhum segmento do app (`find src/app -iname error.tsx` não retorna nada). Qualquer exceção não tratada em qualquer Server Action ou Server Component derruba a tela inteira com a mensagem genérica que o Next.js usa em produção (`"An error occurred in the Server Components render..."`) — a mesma string sanitizada mencionada nas Global Constraints. Um `error.tsx` não recupera a mensagem original (ela já vem sanitizada do lado do servidor antes de chegar aqui), mas troca a tela de crash cru por uma UI amigável com botão de "tentar novamente".

- [ ] **Step 1: Criar o componente de UI compartilhado**

```tsx
// src/components/ErroBoundaryConteudo.tsx
'use client'

interface ErroBoundaryConteudoProps {
  error: Error & { digest?: string }
  reset: () => void
}

export default function ErroBoundaryConteudo({ error, reset }: ErroBoundaryConteudoProps) {
  return (
    <div className="min-h-[50vh] flex flex-col items-center justify-center gap-4 px-4 text-center">
      <h2 className="text-lg font-semibold text-gray-900">Algo deu errado</h2>
      <p className="text-sm text-gray-600 max-w-md">
        Ocorreu um erro inesperado. Tente novamente ou volte mais tarde.
      </p>
      {error.digest && (
        <p className="text-xs text-gray-400">Código: {error.digest}</p>
      )}
      <button
        type="button"
        onClick={reset}
        className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700"
      >
        Tentar novamente
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Criar os 3 error.tsx de segmento**

```tsx
// src/app/[slug]/admin/error.tsx
'use client'

import ErroBoundaryConteudo from '@/components/ErroBoundaryConteudo'

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return <ErroBoundaryConteudo error={error} reset={reset} />
}
```

```tsx
// src/app/[slug]/mobilizador/error.tsx
'use client'

import ErroBoundaryConteudo from '@/components/ErroBoundaryConteudo'

export default function MobilizadorError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return <ErroBoundaryConteudo error={error} reset={reset} />
}
```

```tsx
// src/app/[slug]/cadastro/error.tsx
'use client'

import ErroBoundaryConteudo from '@/components/ErroBoundaryConteudo'

export default function CadastroError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return <ErroBoundaryConteudo error={error} reset={reset} />
}
```

- [ ] **Step 3: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sem erro.

- [ ] **Step 4: Verificação manual — admin (usa um throw real já existente, ainda não corrigido nesta auditoria)**

Suba o dev server (`npm run dev`), logue como admin de um gabinete real, abra "Usuários" → "Cadastrar usuário", deixe o campo Nome vazio e submeta. Hoje (antes da Task 8 corrigir `cadastrarPessoa`) isso ainda lança `throw new Error('Nome é obrigatório')`. Confirme que a tela mostra "Algo deu errado" com botão "Tentar novamente" — **não** a tela crua do Next.js. Clique em "Tentar novamente" e confirme que o formulário volta a funcionar normalmente.

- [ ] **Step 5: Verificação manual — mobilizador e cadastro público (throw temporário)**

Não há um throw real convenientemente acessível nesses dois segmentos ainda. Insira temporariamente uma linha no topo do corpo da função, teste, e reverta:

Em `src/app/[slug]/mobilizador/dashboard/page.tsx`, logo após a linha `}) {` da assinatura de `MobilizadorDashboardPage` (antes de `const resultado = await assertMobilizadorAccess(...)`), adicione `throw new Error('teste error boundary')`. Acesse `/[slug]/mobilizador/dashboard` logado como mobilizador — confirme a tela "Algo deu errado". Remova a linha.

Em `src/app/[slug]/cadastro/[segmentoSlug]/page.tsx`, logo após a linha `}) {` da assinatura de `CadastroPage` (antes de `const gabinete = await getGabineteBySlug(...)`), adicione `throw new Error('teste error boundary')`. Acesse `/[slug]/cadastro/[segmentoSlug]` (sem estar logado) — confirme a tela "Algo deu errado". Remova a linha.

Confirme com `git diff` que nenhuma das duas linhas temporárias ficou no código antes de commitar.

- [ ] **Step 6: Commit**

```bash
git add src/components/ErroBoundaryConteudo.tsx "src/app/[slug]/admin/error.tsx" "src/app/[slug]/mobilizador/error.tsx" "src/app/[slug]/cadastro/error.tsx"
git commit -m "feat: error boundaries em admin/mobilizador/cadastro (achado E da revisão)"
```

---

### Task 2: Helper de mobilizador ativo por token + achado 5 (submeter-cadastro.ts)

**Files:**
- Create: `src/lib/mobilizador.ts`
- Modify: `src/actions/public/submeter-cadastro.ts:68-74`

**Interfaces:**
- Produces: `whereMobilizadorAtivoPorToken(gabineteId: string, token: string): { gabineteId: string; tokenMobilizador: string; isMobilizador: true; deletedAt: null }` — usado por esta task e pela Task 3.

**Contexto:** `submeter-cadastro.ts` já filtra `deletedAt: null` na busca de `pessoaExistente` (linha 57-60), mas a busca de `mobilizadorToken` 8 linhas abaixo não filtra — um mobilizador soft-deletado continua atribuindo (`mobilizadorId`) novos cadastros públicos a si mesmo.

- [ ] **Step 1: Criar o helper**

```ts
// src/lib/mobilizador.ts

// Resolve um token de mobilizador (vindo de link público ?m=token ou do
// magic link de login) para a Pessoa mobilizadora ATIVA correspondente.
// Sempre filtra deletedAt: null — sem esse filtro, o token de um
// mobilizador soft-deletado continuaria resolvendo (soft-delete não zera
// tokenMobilizador/isMobilizador, só deletedAt), dando acesso ou atribuição
// de novos cadastros a uma pessoa que devia estar inacessível.
export function whereMobilizadorAtivoPorToken(gabineteId: string, token: string) {
  return {
    gabineteId,
    tokenMobilizador: token,
    isMobilizador: true,
    deletedAt: null,
  } as const
}
```

- [ ] **Step 2: Usar o helper em submeter-cadastro.ts**

Em `src/actions/public/submeter-cadastro.ts`, adicione o import:

```ts
import { whereMobilizadorAtivoPorToken } from '@/lib/mobilizador'
```

Substitua (linhas 67-74):

```ts
  let mobilizadorId: string | null = null
  if (mobilizadorToken) {
    const mob = await prisma.pessoa.findFirst({
      where: { gabineteId: gabinete.id, tokenMobilizador: mobilizadorToken, isMobilizador: true },
      select: { id: true },
    })
    mobilizadorId = mob?.id ?? null
  }
```

por:

```ts
  let mobilizadorId: string | null = null
  if (mobilizadorToken) {
    const mob = await prisma.pessoa.findFirst({
      where: whereMobilizadorAtivoPorToken(gabinete.id, mobilizadorToken),
      select: { id: true },
    })
    mobilizadorId = mob?.id ?? null
  }
```

- [ ] **Step 3: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sem erro.

- [ ] **Step 4: Verificação manual**

Num gabinete de teste: promova uma pessoa a mobilizadora (admin → ficha da pessoa → "+ Mobilizador"), copie o link de cadastro dela (`/[slug]/cadastro/link?m=<token>`), depois soft-delete essa pessoa (Excluir cadastro). Acesse o link de cadastro copiado e cadastre uma pessoa nova pelo formulário. Confirme no banco (`prisma.vinculoRede.findFirst` pro novo cadastro, ou olhando a árvore de rede no admin) que `indicadoPorId` ficou `null` (mobilizador não encontrado), **não** o id do mobilizador soft-deletado.

- [ ] **Step 5: Commit**

```bash
git add src/lib/mobilizador.ts src/actions/public/submeter-cadastro.ts
git commit -m "fix: submeter-cadastro ignora token de mobilizador soft-deletado (achado 5)"
```

---

### Task 3: Achado 6 — auth/callback/route.ts ignora mobilizador soft-deletado

**Files:**
- Modify: `src/app/auth/callback/route.ts:23-30`

**Interfaces:**
- Consumes: `whereMobilizadorAtivoPorToken(gabineteId, token)` (Task 2).

**Contexto:** o magic link de login do mobilizador (`/auth/callback?code=...&token=...&gabineteId=...`) busca a `Pessoa` só por `{gabineteId, tokenMobilizador: token}`, sem `deletedAt: null` nem `isMobilizador: true`. Um mobilizador soft-deletado que ainda tenha o link antigo salvo consegue completar o login e ser redirecionado pro painel — acesso continuado depois do soft-delete.

- [ ] **Step 1: Usar o helper**

Em `src/app/auth/callback/route.ts`, adicione o import:

```ts
import { whereMobilizadorAtivoPorToken } from '@/lib/mobilizador'
```

Substitua (linhas 23-30):

```ts
  const pessoa = await prisma.pessoa.findFirst({
    where: { gabineteId, tokenMobilizador: token },
    select: {
      id: true,
      email: true,
      gabinete: { select: { slug: true, ativo: true } },
    },
  })
```

por:

```ts
  const pessoa = await prisma.pessoa.findFirst({
    where: whereMobilizadorAtivoPorToken(gabineteId, token),
    select: {
      id: true,
      email: true,
      gabinete: { select: { slug: true, ativo: true } },
    },
  })
```

- [ ] **Step 2: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sem erro.

- [ ] **Step 3: Verificação manual**

Promova uma pessoa a mobilizadora, gere o magic link dela (mesmo fluxo de login por e-mail), soft-delete a pessoa, depois tente completar o login com o magic link (ou visite `/auth/callback?code=<code_real>&token=<token_antigo>&gabineteId=<id>` manualmente com um `code` de uma sessão válida). Confirme que é redirecionado para `/login?erro=link_invalido`, **não** para `/[slug]/mobilizador/`.

Se não for prático gerar um `code` real de troca de sessão nesse teste, é aceitável verificar via leitura de código + o teste de deletedAt já coberto na Task 2 (mesma query, mesmo helper) como evidência indireta — mas tente o teste ao vivo primeiro.

- [ ] **Step 4: Commit**

```bash
git add src/app/auth/callback/route.ts
git commit -m "fix: auth/callback ignora magic link de mobilizador soft-deletado (achado 6)"
```

---

### Task 4: Achado 7 — VinculoRede: índice único parcial + vinculoExistente sem deletedAt

**Files:**
- Modify: `prisma/schema.prisma` (modelo `VinculoRede`, linha 181)
- Create: `prisma/migrations/20260717000000_vinculo_rede_soft_delete_partial_unique/migration.sql`
- Modify: `src/actions/public/submeter-cadastro.ts:127-132`

**Interfaces:** nenhuma — mudança de schema/banco consumida só por esta task.

**Contexto:** `VinculoRede` tem `deletedAt DateTime?` **e** `@@unique([gabineteId, pessoaId, indicadoPorId])` — a mesma forma que causou o bug C3 em `Pessoa` (índice único simples bloqueando permanentemente a recriação depois de um soft-delete). Hoje nenhuma feature soft-deleta um `VinculoRede` (bug dormente), mas `submeter-cadastro.ts:127-132` (`vinculoExistente`) já faz essa busca **sem** `deletedAt: null`, diferente de todo outro uso de `VinculoRede` no código (`src/lib/rede.ts:54-57`, `src/actions/mobilizador/promover-mobilizador.ts:26-33`, e as 3 outras queries em `admin/pessoas/page.tsx`, `mobilizador/pessoas/[pessoaId]/page.tsx`, `mobilizador/rede/page.tsx`, todas já corretas). No dia em que alguém implementar "remover pessoa da rede" via soft-delete de `VinculoRede`, essa query desatualizada trataria o vínculo removido como "ainda existe" e nunca recriaria o vínculo ativo.

- [ ] **Step 1: Remover o `@@unique` simples do schema**

Em `prisma/schema.prisma`, no modelo `VinculoRede` (linha 168-182), substitua:

```prisma
model VinculoRede {
  id            String   @id @default(cuid())
  gabineteId    String
  pessoaId      String
  indicadoPorId String?
  nivel         Int
  criadoEm     DateTime @default(now())
  deletedAt    DateTime?

  gabinete    Gabinete @relation(fields: [gabineteId], references: [id])
  pessoa      Pessoa   @relation("Indicado", fields: [pessoaId], references: [id])
  indicadoPor Pessoa?  @relation("Indicador", fields: [indicadoPorId], references: [id])

  @@unique([gabineteId, pessoaId, indicadoPorId])
}
```

por:

```prisma
model VinculoRede {
  id            String   @id @default(cuid())
  gabineteId    String
  pessoaId      String
  indicadoPorId String?
  nivel         Int
  criadoEm     DateTime @default(now())
  deletedAt    DateTime?

  gabinete    Gabinete @relation(fields: [gabineteId], references: [id])
  pessoa      Pessoa   @relation("Indicado", fields: [pessoaId], references: [id])
  indicadoPor Pessoa?  @relation("Indicador", fields: [indicadoPorId], references: [id])

  // Unicidade de (gabineteId, pessoaId, indicadoPorId) enquanto ativo é
  // garantida por índice único parcial (WHERE "deletedAt" IS NULL) na
  // migration 20260717000000_vinculo_rede_soft_delete_partial_unique — não
  // por @@unique, que bloquearia recriar o vínculo depois de um soft-delete
  // (mesma correção já aplicada em Pessoa.whatsapp/tokenMobilizador, achado
  // C3 da auditoria original).
}
```

- [ ] **Step 2: Criar a migration manual**

```bash
mkdir -p prisma/migrations/20260717000000_vinculo_rede_soft_delete_partial_unique
```

```sql
-- prisma/migrations/20260717000000_vinculo_rede_soft_delete_partial_unique/migration.sql

-- Mesmo problema do achado C3 em Pessoa: o @@unique simples bloquearia
-- recriar um VinculoRede depois de um soft-delete (não usado ainda, mas a
-- mesma forma — deletedAt + @@unique — foi a causa raiz do bug em Pessoa).
DROP INDEX IF EXISTS "VinculoRede_gabineteId_pessoaId_indicadoPorId_key";

-- Recria como índice único PARCIAL — unicidade só entre vínculos ativos.
CREATE UNIQUE INDEX IF NOT EXISTS "VinculoRede_gabineteId_pessoaId_indicadoPorId_key"
  ON "VinculoRede"("gabineteId", "pessoaId", "indicadoPorId")
  WHERE "deletedAt" IS NULL;
```

- [ ] **Step 3: Aplicar a migration no banco local e marcar como aplicada**

Primeiro rode o SQL do Step 2 diretamente contra o banco local (mesmo padrão usado pra aplicar a migration de `Pessoa` nesta auditoria — via `psql` ou um script node com o pacote `pg` usando a `DIRECT_URL` do `.env.local`). Só depois de o SQL já ter rodado de verdade, marque a migration como aplicada pro Prisma parar de reclamar que ela está pendente:

```bash
npx prisma migrate resolve --applied 20260717000000_vinculo_rede_soft_delete_partial_unique
```

`prisma migrate resolve --applied` só grava uma linha em `_prisma_migrations` — ele não roda o SQL. Rodar esse comando sem ter aplicado o SQL antes deixa o banco sem o índice mas o Prisma achando que está tudo em dia.

- [ ] **Step 4: Verificação manual do índice**

Confirme via SQL direto (mesma técnica da migration de Pessoa) que o índice existe com o predicado certo:

```sql
SELECT indexname, indexdef FROM pg_indexes
WHERE tablename = 'VinculoRede' AND indexname LIKE '%pessoaId%';
```

Esperado: `indexdef` contém `WHERE (deletedAt IS NULL)`.

- [ ] **Step 5: Corrigir vinculoExistente em submeter-cadastro.ts**

Em `src/actions/public/submeter-cadastro.ts`, substitua (linhas 126-132):

```ts
  // Cria vínculo de rede apenas se ainda não existir (NULL != NULL no SQL)
  const vinculoExistente = await prisma.vinculoRede.findFirst({
    where: { gabineteId: gabinete.id, pessoaId, indicadoPorId: mobilizadorId },
  })
```

por:

```ts
  // Cria vínculo de rede apenas se ainda não existir (NULL != NULL no SQL).
  // deletedAt: null é defensivo — nenhum fluxo soft-deleta VinculoRede hoje,
  // mas sem esse filtro um vínculo soft-deletado no futuro seria tratado
  // como "já existe" e nunca recriado (mesmo padrão de todo outro uso de
  // VinculoRede no código, ver src/lib/rede.ts).
  const vinculoExistente = await prisma.vinculoRede.findFirst({
    where: { gabineteId: gabinete.id, pessoaId, indicadoPorId: mobilizadorId, deletedAt: null },
  })
```

- [ ] **Step 6: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sem erro.

- [ ] **Step 7: Verificação manual — regressão do fluxo normal**

Cadastre uma pessoa nova pelo link fixo de um mobilizador ativo. Confirme que o vínculo de rede é criado (a pessoa aparece na listagem de rede do mobilizador, `indicadoPorId` correto). Cadastre a mesma pessoa de novo pela etapa de "confirmação de presença" (reenviar o mesmo WhatsApp) — confirme que **não** cria um segundo `VinculoRede` duplicado (sem regressão do comportamento de idempotência).

- [ ] **Step 8: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260717000000_vinculo_rede_soft_delete_partial_unique src/actions/public/submeter-cadastro.ts
git commit -m "fix: indice unico parcial para VinculoRede + vinculoExistente filtra deletedAt (achado 7)"
```

---

### Task 5: Achado 8 — upload-foto-pessoa.ts não filtra deletedAt na autorização

**Files:**
- Modify: `src/actions/admin/upload-foto-pessoa.ts:27-30`

**Interfaces:** nenhuma.

**Contexto:** a query que resolve a `Pessoa` alvo do upload (usada tanto pra checar permissão quanto pra pegar `fotoUrl` antiga) não filtra `deletedAt: null`. Se a pessoa for soft-deletada mas o `userId` do Supabase Auth continuar existindo, essa mesma conta consegue chamar `uploadFotoPessoa` pro próprio `pessoaId` (soft-deletado) e sobrescrever a foto — gravação de Storage/banco numa linha que deveria estar logicamente inacessível.

- [ ] **Step 1: Adicionar o filtro**

Em `src/actions/admin/upload-foto-pessoa.ts`, substitua (linhas 27-30):

```ts
  const pessoa = await prisma.pessoa.findFirst({
    where: { id: pessoaId as string, gabineteId: gabinete.id },
    select: { id: true, userId: true, fotoUrl: true },
  })
```

por:

```ts
  const pessoa = await prisma.pessoa.findFirst({
    where: { id: pessoaId as string, gabineteId: gabinete.id, deletedAt: null },
    select: { id: true, userId: true, fotoUrl: true },
  })
```

- [ ] **Step 2: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sem erro.

- [ ] **Step 3: Verificação manual**

Soft-delete uma pessoa que tenha login próprio vinculado (`userId` setado — ex: um mobilizador). Logado como essa pessoa (ou simulando a sessão), tente chamar `uploadFotoPessoa` pro próprio id (via a tela de perfil, se acessível, ou diretamente testando a Server Action). Confirme que retorna "Pessoa não encontrada" em vez de aceitar o upload. Teste também o caminho normal (pessoa ativa fazendo upload da própria foto) pra confirmar que não regrediu.

- [ ] **Step 4: Commit**

```bash
git add src/actions/admin/upload-foto-pessoa.ts
git commit -m "fix: upload-foto-pessoa ignora pessoa soft-deletada na autorizacao (achado 8)"
```

---

### Task 6: Achado 9 — gerar-link-cadastro.ts não filtra deletedAt

**Files:**
- Modify: `src/actions/admin/gerar-link-cadastro.ts:34-38`

**Interfaces:** nenhuma.

**Contexto:** a busca do mobilizador (por `id`, escolhido num dropdown administrativo — não por token público) também não filtra `deletedAt: null`. Severidade menor que os achados 5/6 (rota interna, admin autenticado, dropdown normalmente já mostra só pessoas ativas), mas mesmo padrão incompleto.

- [ ] **Step 1: Adicionar o filtro**

Em `src/actions/admin/gerar-link-cadastro.ts`, substitua (linhas 34-38):

```ts
  let token: string | null = null
  if (mobilizadorPessoaId) {
    const mobilizador = await prisma.pessoa.findFirst({
      where: { id: mobilizadorPessoaId, gabineteId: gabinete.id, isMobilizador: true },
      select: { tokenMobilizador: true },
    })
    if (!mobilizador?.tokenMobilizador) return { erro: 'Mobilizador inválido.' }
    token = mobilizador.tokenMobilizador
  }
```

por:

```ts
  let token: string | null = null
  if (mobilizadorPessoaId) {
    const mobilizador = await prisma.pessoa.findFirst({
      where: { id: mobilizadorPessoaId, gabineteId: gabinete.id, isMobilizador: true, deletedAt: null },
      select: { tokenMobilizador: true },
    })
    if (!mobilizador?.tokenMobilizador) return { erro: 'Mobilizador inválido.' }
    token = mobilizador.tokenMobilizador
  }
```

- [ ] **Step 2: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sem erro.

- [ ] **Step 3: Verificação manual**

Na tela de gerar link de cadastro (admin → Link de Cadastro), gere um link vinculado a um mobilizador ativo — confirme que o link sai com `?m=<token>` normalmente. Soft-delete esse mobilizador diretamente no banco (sem tirar da lista de seleção, se a UI já filtrar) e tente gerar de novo passando o mesmo `mobilizadorPessoaId` (via chamada direta da Server Action, já que a UI provavelmente não oferece mais essa pessoa na lista) — confirme retorno `{erro: 'Mobilizador inválido.'}`.

- [ ] **Step 4: Commit**

```bash
git add src/actions/admin/gerar-link-cadastro.ts
git commit -m "fix: gerar-link-cadastro ignora mobilizador soft-deletado (achado 9)"
```

---

### Task 7: Achado C — TOCTOU no cadastro público (submeter-cadastro.ts)

**Files:**
- Modify: `src/actions/public/submeter-cadastro.ts` (import + bloco de criação, linhas 83-98)

**Interfaces:** nenhuma.

**Contexto:** `submeter-cadastro.ts` verifica se a pessoa já existe (`findFirst`) e, se não, cria (`create`) — clássica race TOCTOU (check-then-act). Numa rota **pública, não autenticada**, um double-submit (duplo clique, reenvio por conexão instável, ou duas abas) com o mesmo WhatsApp pode fazer as duas requisições passarem pelo `findFirst` antes de qualquer `create` comitar, e a segunda `create()` bate no índice único parcial (`Pessoa_gabineteId_whatsapp_key`) e lança uma exceção Prisma não tratada — violando o próprio contrato de tipo da função (`Promise<{ erro: string } | never>`, onde `never` deveria significar só "redirecionou", não "explodiu").

- [ ] **Step 1: Importar Prisma**

Em `src/actions/public/submeter-cadastro.ts`, adicione o import:

```ts
import { Prisma } from '@/generated/prisma/client'
```

- [ ] **Step 2: Envolver o create() em try/catch**

Substitua (linhas 83-98):

```ts
  } else {
    const criada = await prisma.pessoa.create({
      data: {
        nome: nome.trim(),
        whatsapp,
        email: email?.trim() || null,
        nascimento,
        genero: genero || null,
        regiaoId: regiaoId || null,
        profissaoId: profissaoId || null,
        gabineteId: gabinete.id,
        isColaborador: false,
      },
    })
    pessoaId = criada.id
  }
```

por:

```ts
  } else {
    try {
      const criada = await prisma.pessoa.create({
        data: {
          nome: nome.trim(),
          whatsapp,
          email: email?.trim() || null,
          nascimento,
          genero: genero || null,
          regiaoId: regiaoId || null,
          profissaoId: profissaoId || null,
          gabineteId: gabinete.id,
          isColaborador: false,
        },
      })
      pessoaId = criada.id
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        return { erro: 'Este WhatsApp já foi cadastrado agora há pouco — atualize a página e tente de novo.' }
      }
      throw e
    }
  }
```

Note que `redirect()` (linha 141, fora deste bloco) continua fora de qualquer try/catch — não precisa mexer nele.

- [ ] **Step 3: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sem erro.

- [ ] **Step 4: Verificação manual — simular a race**

Não dá pra reproduzir a race de verdade de forma confiável manualmente, mas dá pra provar que o catch funciona: cadastre uma pessoa com um WhatsApp X pelo formulário público. Sem recarregar a página nem passar pela etapa de "confirmação de presença" (que checaria `pessoaExistente` de novo), chame a Server Action `submeterCadastro` diretamente de novo com o mesmo `whatsapp` X **antes** que o registro criado na primeira chamada apareça pro `findFirst` — na prática, isso é difícil de forçar manualmente porque o `findFirst` já vai achar a pessoa na segunda chamada (o cenário real de race exige duas chamadas literalmente concorrentes). Como prova alternativa e suficiente: confirme por leitura de código que o `try/catch` cobre exatamente o `prisma.pessoa.create()` e que `e.code === 'P2002'` é a forma correta de detectar violação de unique constraint no Prisma (mesmo padrão já usado e testado em `src/actions/admin/restaurar-pessoa.ts`, que já está em produção).

- [ ] **Step 5: Commit**

```bash
git add src/actions/public/submeter-cadastro.ts
git commit -m "fix: submeter-cadastro trata colisao de whatsapp na criacao (achado C, TOCTOU)"
```

---

### Task 8: Achados A+B — cadastrar-pessoa.ts (throw cru + P2002 não tratado)

**Files:**
- Modify: `src/actions/admin/cadastrar-pessoa.ts`
- Modify: `src/app/[slug]/admin/pessoas/CadastrarUsuarioModal.tsx`

**Interfaces:**
- Produces: `cadastrarPessoa(prevState: { erro?: string }, formData: FormData): Promise<{ erro?: string }>` (assinatura muda de `(formData) => void` para o padrão `useFormState`).

**Contexto:** `cadastrarPessoa` ainda lança `throw new Error(...)` para "Nome é obrigatório"/"WhatsApp é obrigatório"/"Número de WhatsApp inválido", e a chamada a `validarImagemUpload(foto)` (que também lança) não está em try/catch — mesmo bug de mensagem sanitizada do achado 3, nunca corrigido aqui. Além disso, `prisma.pessoa.create()` não trata `P2002` (colisão de whatsapp no índice único parcial que a correção C3 tornou possível). O form chamador (`CadastrarUsuarioModal.tsx`) usa `<form action={cadastrarPessoa}>` cru.

- [ ] **Step 1: Reescrever cadastrar-pessoa.ts**

Substitua o arquivo inteiro:

```ts
'use server'

import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { assertAdminAccess } from '@/lib/assert-admin-access'
import { normalizeWhatsApp } from '@/lib/whatsapp'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { validarImagemUpload } from '@/lib/validar-imagem-upload'
import { Prisma } from '@/generated/prisma/client'

export async function cadastrarPessoa(
  _prevState: { erro?: string },
  formData: FormData
): Promise<{ erro?: string }> {
  const slug = formData.get('slug') as string
  const nome = (formData.get('nome') as string).trim()
  const whatsappRaw = (formData.get('whatsapp') as string | null) ?? ''
  const email = (formData.get('email') as string | null)?.trim() || null
  const regiaoId = (formData.get('regiaoId') as string | null) || null
  const profissaoId = (formData.get('profissaoId') as string | null) || null
  const genero = (formData.get('genero') as string | null) || null
  const foto = formData.get('foto') as File | null

  if (!nome) return { erro: 'Nome é obrigatório' }
  if (!whatsappRaw) return { erro: 'WhatsApp é obrigatório' }

  const whatsapp = normalizeWhatsApp(whatsappRaw)
  if (!whatsapp) return { erro: 'Número de WhatsApp inválido' }

  let fotoValidada: { ext: string; contentType: string } | undefined
  if (foto && foto.size > 0) {
    try {
      fotoValidada = validarImagemUpload(foto)
    } catch (e) {
      return { erro: e instanceof Error ? e.message : 'Erro ao validar imagem' }
    }
  }

  let pessoaId: string

  try {
    const { gabinete } = await assertAdminAccess(slug)

    const pessoa = await prisma.pessoa.create({
      data: {
        nome,
        whatsapp,
        email,
        genero,
        gabineteId: gabinete.id,
        regiaoId,
        profissaoId,
        isColaborador: false,
      },
    })
    pessoaId = pessoa.id

    if (foto && foto.size > 0 && fotoValidada) {
      const path = `${gabinete.id}/pessoas/${pessoa.id}/foto.${fotoValidada.ext}`
      const buffer = Buffer.from(await foto.arrayBuffer())
      const { error } = await getSupabaseAdmin().storage
        .from('gabinete-assets')
        .upload(path, buffer, { upsert: true, contentType: fotoValidada.contentType })

      if (!error) {
        const { data: { publicUrl } } = getSupabaseAdmin().storage.from('gabinete-assets').getPublicUrl(path)
        await prisma.pessoa.update({
          where: { id: pessoa.id },
          data: { fotoUrl: `${publicUrl}?v=${Date.now()}` },
        })
      } else {
        console.error('[cadastrarPessoa] storage error:', error)
      }
    }
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return { erro: 'Este WhatsApp já está cadastrado.' }
    }
    return { erro: e instanceof Error ? e.message : 'Erro ao cadastrar pessoa' }
  }

  redirect(`/${slug}/admin/pessoas/${pessoaId}`)
}
```

Note que `redirect()` está fora do try/catch (só roda no caminho de sucesso) — ver Global Constraints sobre por que isso importa.

- [ ] **Step 2: Converter CadastrarUsuarioModal.tsx pra useFormState**

Em `src/app/[slug]/admin/pessoas/CadastrarUsuarioModal.tsx`, adicione o import e o hook:

```tsx
import { useFormState } from 'react-dom'
```

Adicione, junto com os outros hooks (depois de `const inputFotoRef = useRef<HTMLInputElement>(null)`):

```tsx
  const [state, action] = useFormState(cadastrarPessoa, {})
```

Troque `<form action={cadastrarPessoa} ...>` por `<form action={action} ...>`.

Adicione a exibição do erro logo antes do botão de submit (dentro do `<form>`, depois do último campo `<select name="genero">`, antes de `<button type="submit" ...>Cadastrar</button>`):

```tsx
          {state.erro && <p className="text-xs text-red-600">{state.erro}</p>}
```

- [ ] **Step 3: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sem erro.

- [ ] **Step 4: Verificação manual**

No dev server, abra "Cadastrar usuário", submeta sem preencher Nome — confirme que aparece a mensagem "Nome é obrigatório" **dentro do modal** (não uma tela de crash). Cadastre um WhatsApp já usado por outra pessoa ativa — confirme "Este WhatsApp já está cadastrado.". Cadastre uma pessoa válida com foto — confirme que funciona igual a antes (sem regressão) e redireciona pra ficha da pessoa.

- [ ] **Step 5: Commit**

```bash
git add src/actions/admin/cadastrar-pessoa.ts "src/app/[slug]/admin/pessoas/CadastrarUsuarioModal.tsx"
git commit -m "fix: cadastrar-pessoa retorna erro amigavel em vez de throw (achados A, B)"
```

---

### Task 9: Achado D — salvar-personalizacao.ts (padrão antigo, sem validação ativa hoje)

**Files:**
- Modify: `src/actions/admin/salvar-personalizacao.ts`
- Create: `src/components/admin/SalvarPersonalizacaoForm.tsx`
- Modify: `src/app/[slug]/admin/personalizacao/page.tsx`
- Modify: `src/app/[slug]/admin/configuracoes/personalizacao/page.tsx`

**Interfaces:**
- Produces: `salvarPersonalizacao(prevState: { erro?: string }, formData: FormData): Promise<{ erro?: string }>`.
- Produces: `SalvarPersonalizacaoForm({ slug, nomeSistema, corPrimaria, corSecundaria, acao, botaoStyle?, botaoClassName? })` — reutilizado pelas 2 páginas, mesmo padrão de `UploadImagemGabineteForm.tsx`.

**Contexto:** `salvarPersonalizacao` ainda usa `throw` + `<form action={fn}>` cru nas duas telas de Personalização. Sem validação de negócio ativa hoje (só os throws implícitos de `assertAdminAccess`), então não é ativamente explorável — mas é uma bomba-relógio: se alguém adicionar uma validação (ex: tamanho máximo de `nomeSistema`) sem perceber o padrão, reintroduz o bug de mensagem sanitizada.

- [ ] **Step 1: Reescrever salvar-personalizacao.ts**

```ts
'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { assertAdminAccess } from '@/lib/assert-admin-access'

export async function salvarPersonalizacao(
  _prevState: { erro?: string },
  formData: FormData
): Promise<{ erro?: string }> {
  const slug = formData.get('slug') as string
  const nomeSistemaRaw = (formData.get('nomeSistema') as string).trim()
  const corPrimaria = (formData.get('corPrimaria') as string).trim() || '#1D4ED8'
  const corSecundaria = (formData.get('corSecundaria') as string).trim() || '#3B82F6'

  try {
    const { gabinete } = await assertAdminAccess(slug)

    await prisma.gabinete.update({
      where: { id: gabinete.id },
      data: {
        nomeSistema: nomeSistemaRaw || undefined,
        corPrimaria,
        corSecundaria,
      },
    })

    revalidatePath(`/${slug}/admin/personalizacao`)
    revalidatePath(`/${slug}/admin/configuracoes/personalizacao`)
    return {}
  } catch (e) {
    return { erro: e instanceof Error ? e.message : 'Erro ao salvar personalização' }
  }
}
```

- [ ] **Step 2: Criar o componente compartilhado**

```tsx
// src/components/admin/SalvarPersonalizacaoForm.tsx
'use client'

import { useFormState } from 'react-dom'

interface SalvarPersonalizacaoFormProps {
  slug: string
  nomeSistema: string
  corPrimaria: string
  corSecundaria: string
  acao: (prevState: { erro?: string }, formData: FormData) => Promise<{ erro?: string }>
  botaoStyle?: React.CSSProperties
  botaoClassName?: string
}

const BOTAO_CLASSNAME_PADRAO = 'bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50'

export default function SalvarPersonalizacaoForm({
  slug,
  nomeSistema,
  corPrimaria,
  corSecundaria,
  acao,
  botaoStyle,
  botaoClassName = BOTAO_CLASSNAME_PADRAO,
}: SalvarPersonalizacaoFormProps) {
  const [state, action] = useFormState(acao, {})

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="slug" value={slug} />
      <div>
        <label className="block text-sm font-medium text-gray-700">Nome do sistema</label>
        <input
          name="nomeSistema"
          defaultValue={nomeSistema}
          className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
          placeholder="Ex: Mobiliza Fulano"
        />
      </div>
      <div className="flex gap-4">
        <div className="flex-1">
          <label className="block text-sm font-medium text-gray-700">Cor primária</label>
          <input
            name="corPrimaria"
            type="color"
            defaultValue={corPrimaria}
            className="mt-1 h-10 w-full border border-gray-300 rounded-md"
          />
        </div>
        <div className="flex-1">
          <label className="block text-sm font-medium text-gray-700">Cor secundária</label>
          <input
            name="corSecundaria"
            type="color"
            defaultValue={corSecundaria}
            className="mt-1 h-10 w-full border border-gray-300 rounded-md"
          />
        </div>
      </div>
      <button type="submit" style={botaoStyle} className={botaoClassName}>
        Salvar
      </button>
      {state.erro && <p className="text-xs text-red-600">{state.erro}</p>}
    </form>
  )
}
```

- [ ] **Step 3: Atualizar admin/personalizacao/page.tsx**

Em `src/app/[slug]/admin/personalizacao/page.tsx`, adicione o import:

```ts
import SalvarPersonalizacaoForm from '@/components/admin/SalvarPersonalizacaoForm'
```

Substitua o bloco (linhas 20-62, da `<section>` de "Identidade" inteira):

```tsx
      <section className="bg-white rounded-lg p-6 shadow-sm space-y-4">
        <h2 className="text-lg font-semibold">Identidade</h2>
        <form action={salvarPersonalizacao} className="space-y-4">
          <input type="hidden" name="slug" value={params.slug} />
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Nome do sistema
            </label>
            <input
              name="nomeSistema"
              defaultValue={gabinete.nomeSistema ?? ''}
              className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              placeholder="Ex: Mobiliza Fulano"
            />
          </div>
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700">Cor primária</label>
              <input
                name="corPrimaria"
                type="color"
                defaultValue={gabinete.corPrimaria ?? '#3B82F6'}
                className="mt-1 h-10 w-full border border-gray-300 rounded-md"
              />
            </div>
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700">Cor secundária</label>
              <input
                name="corSecundaria"
                type="color"
                defaultValue={gabinete.corSecundaria ?? '#1E40AF'}
                className="mt-1 h-10 w-full border border-gray-300 rounded-md"
              />
            </div>
          </div>
          <button
            type="submit"
            className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700"
          >
            Salvar
          </button>
        </form>
      </section>
```

por:

```tsx
      <section className="bg-white rounded-lg p-6 shadow-sm space-y-4">
        <h2 className="text-lg font-semibold">Identidade</h2>
        <SalvarPersonalizacaoForm
          slug={params.slug}
          nomeSistema={gabinete.nomeSistema ?? ''}
          corPrimaria={gabinete.corPrimaria ?? '#3B82F6'}
          corSecundaria={gabinete.corSecundaria ?? '#1E40AF'}
          acao={salvarPersonalizacao}
        />
      </section>
```

- [ ] **Step 4: Atualizar admin/configuracoes/personalizacao/page.tsx**

Em `src/app/[slug]/admin/configuracoes/personalizacao/page.tsx`, adicione o import:

```ts
import SalvarPersonalizacaoForm from '@/components/admin/SalvarPersonalizacaoForm'
```

Substitua o bloco `<form action={salvarPersonalizacao} ...>` (linhas 17-55) por:

```tsx
      <SalvarPersonalizacaoForm
        slug={params.slug}
        nomeSistema={gabinete.nomeSistema ?? ''}
        corPrimaria={gabinete.corPrimaria ?? '#3B82F6'}
        corSecundaria={gabinete.corSecundaria ?? '#1E40AF'}
        acao={salvarPersonalizacao}
        botaoStyle={{ backgroundColor: gabinete.corPrimaria, color: corTexto }}
        botaoClassName="px-4 py-2 rounded-md text-sm font-medium hover:opacity-90 disabled:opacity-50"
      />
```

- [ ] **Step 5: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sem erro.

- [ ] **Step 6: Verificação manual — as duas telas**

Em `/[slug]/admin/personalizacao`, altere o nome do sistema e as cores, salve — confirme que persiste (recarregue a página) e que a UI continua com estilo azul padrão. Em `/[slug]/admin/configuracoes/personalizacao`, faça o mesmo — confirme que o botão "Salvar" mantém a cor dinâmica do gabinete (`corPrimaria`/`corTexto`), não virou azul fixo.

- [ ] **Step 7: Commit**

```bash
git add src/actions/admin/salvar-personalizacao.ts src/components/admin/SalvarPersonalizacaoForm.tsx "src/app/[slug]/admin/personalizacao/page.tsx" "src/app/[slug]/admin/configuracoes/personalizacao/page.tsx"
git commit -m "fix: salvar-personalizacao usa padrao useFormState/erro em vez de throw (achado D)"
```

---

### Task 10: Verificação final

**Files:** nenhum arquivo novo — verificação de todo o plano.

- [ ] **Step 1: Typecheck completo**

Run: `npx tsc --noEmit`
Expected: sem erro.

- [ ] **Step 2: Build de produção**

Run: `rm -rf .next && npm run build`
Expected: build conclui sem erro. Usar `rm -rf .next` antes é obrigatório — cache de build stale já mascarou um erro real de ESLint numa sessão anterior desta mesma auditoria.

- [ ] **Step 3: Suite de testes completa**

Run: `npx vitest run`
Expected: todos os testes passam; nenhuma regressão nos testes existentes (mesma contagem de falhas pré-existentes de sempre — `email.test.ts`, por falta de `RESEND_API_KEY` local — 176 passando, 2 falhando é o baseline conhecido).

- [ ] **Step 4: Aplicar a migration de VinculoRede em staging e produção**

A Task 4 só aplicou a migration localmente. Antes de considerar o plano completo, rode o mesmo SQL (`DROP INDEX IF EXISTS` + `CREATE UNIQUE INDEX IF NOT EXISTS ... WHERE "deletedAt" IS NULL` do Step 2 da Task 4) diretamente contra o banco de staging e o de produção (mesma técnica usada pra aplicar a migration de `Pessoa` nessas duas bases numa sessão anterior — conexão direta via `DIRECT_URL` de cada ambiente), e marque como aplicada em cada um (`npx prisma migrate resolve --applied 20260717000000_vinculo_rede_soft_delete_partial_unique`, ou o equivalente manual no banco se o CLI não tiver acesso direto ao ambiente).

- [ ] **Step 5: Checklist de verificação manual consolidado**

- [ ] Achado 5: link de cadastro de mobilizador soft-deletado não atribui `indicadoPorId` em novos cadastros.
- [ ] Achado 6: magic link de mobilizador soft-deletado não autentica (redireciona pra `/login?erro=link_invalido`).
- [ ] Achado 7: índice parcial de `VinculoRede` existe em produção com `WHERE deletedAt IS NULL`; fluxo normal de cadastro + confirmação de presença não duplica vínculo.
- [ ] Achado 8: pessoa soft-deletada com `userId` ainda válido não consegue fazer upload de foto própria.
- [ ] Achado 9: `gerarLinkCadastro` retorna erro pra mobilizador soft-deletado.
- [ ] Achado A: "Cadastrar usuário" com Nome vazio mostra erro no modal, não crash.
- [ ] Achado B: cadastro de admin com WhatsApp duplicado mostra "Este WhatsApp já está cadastrado.", não crash.
- [ ] Achado C: leitura de código confirma `submeterCadastro` trata P2002 no `create()`.
- [ ] Achado D: as duas telas de Personalização salvam normalmente, erro (se houver) aparece inline.
- [ ] Achado E: `error.tsx` presente nos 3 segmentos (`admin`, `mobilizador`, `cadastro`), testado com throw real ou temporário em cada um.

Sem commit nesta task — é só verificação. Se algum passo falhar, volte pra task correspondente, corrija, e repita a verificação a partir daí.
