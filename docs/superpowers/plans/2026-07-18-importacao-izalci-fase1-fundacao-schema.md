# Importação Izalci — Fase 1: Fundação de Schema — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar ao schema Prisma os 3 itens de "fundação" que as fases seguintes da importação Izalci vão precisar — hierarquia cidade→bairro em `Regiao`, campos eleitorais em `Pessoa`, e um modelo novo `TelefoneExtra` — sem tocar em nenhuma UI e sem importar nenhum dado real ainda.

**Architecture:** Uma única migration Prisma cobrindo os 3 itens de schema (Task 1), seguida da política RLS da tabela nova `TelefoneExtra` em `scripts/setup-supabase.sql` (Task 2) — separado porque é uma categoria de erro que já aconteceu neste projeto (RLS habilitado sem política, achado mais grave da auditoria de terceira ordem, HANDOFF.md seção 23) e merece seu próprio passo de verificação explícito.

**Tech Stack:** Prisma 7.8 (`adapter-pg`) sobre Postgres/Supabase, TypeScript 5 strict.

## Global Constraints

- Migration é SQL manual em `prisma/migrations/<timestamp>_<nome>/migration.sql`, nunca gerada por `prisma migrate dev` — mesmo padrão já usado nas migrations mais recentes deste projeto (ver `prisma/migrations/20260718000000_area_demanda_unique_nome/migration.sql` como referência).
- Nomenclatura de migration: `YYYYMMDDHHMMSS_descricao_snake_case`, timestamp estritamente maior que a última migration existente (`20260719000002_regiao_case_insensitive_unique`). Este plano usa `20260719000003_izalci_fase1_fundacao_schema`.
- FK opcional (relação com `?` no Prisma) sempre gera `ON DELETE SET NULL ON UPDATE CASCADE` (ver `Pessoa_regiaoId_fkey`/`VinculoRede_indicadoPorId_fkey` no schema atual). FK obrigatória sempre gera `ON DELETE RESTRICT ON UPDATE CASCADE` (ver qualquer `_gabineteId_fkey` existente).
- Sem `@@index` explícito em colunas de FK a menos que um modelo vizinho já tenha esse índice — `Regiao`/`ObservacaoPessoa` (os dois modelos mais parecidos com o que esta fase mexe) não têm índice em nenhuma FK, então `TelefoneExtra`/`Regiao.regiaoPaiId` também não ganham.
- Toda migration deste plano é aplicada primeiro em staging (`.env.staging`, projeto Supabase `rede-mobiliza-staging`), verificada, e só depois em produção. `.env.local` e `.env.production` apontam para o **mesmo** banco Supabase real de produção — não existe banco de sandbox separado do de produção; usar `.env.local` (já presente no ambiente local) para os passos "produção" abaixo.
- Aplicação de SQL contra o banco: script Node inline usando o pacote `pg` (já é dependência do projeto), lendo `DIRECT_URL` do ambiente — mesmo padrão de `scripts/verificar-rls.mjs`. Depois de aplicar o SQL da migration, registrar como aplicada com `npx prisma migrate resolve --applied <nome_da_migration>` (isso só marca como aplicada, não executa SQL — a ordem importa).
- Sem teste automatizado novo: não há lógica pura nesta fase (só schema/migration/RLS), decisão já registrada no spec.
- Import de `Prisma`/tipos gerados sempre de `@/generated/prisma/client` (output customizado do generator, ver `prisma/schema.prisma:3`).

## Fora de escopo (confirmado no spec)

Nenhuma task deste plano cria o gabinete IZALCI nem toca em UI — decisão explícita do spec (`docs/superpowers/specs/2026-07-18-importacao-izalci-fase1-fundacao-schema-design.md`, seção "Criação do gabinete IZALCI"). A criação do gabinete é uma ação manual do usuário pela tela de super-admin já existente, feita quando quiser, sem depender deste plano.

---

### Task 1: Schema — `regiaoPaiId`, campos eleitorais, `TelefoneExtra`

**Files:**
- Modify: `prisma/schema.prisma` (models `Regiao`, `Pessoa`; novo model `TelefoneExtra`)
- Create: `prisma/migrations/20260719000003_izalci_fase1_fundacao_schema/migration.sql`

**Interfaces:**
- Consumes: nada de outras tasks.
- Produces: coluna `Regiao.regiaoPaiId` (String?, FK autorreferente); colunas `Pessoa.zonaEleitoral`/`Pessoa.secaoEleitoral` (String?); model `TelefoneExtra { id, gabineteId, pessoaId, numero, tipo, criadoEm, deletedAt }` com FKs para `Gabinete`/`Pessoa`, e relação `Pessoa.telefonesExtras TelefoneExtra[]`. A Task 2 depende do nome exato da tabela (`TelefoneExtra`) e da coluna `gabineteId`.

- [ ] **Step 1: Editar `model Regiao` no schema**

Em `prisma/schema.prisma`, trocar:

```prisma
model Regiao {
  id         String   @id @default(cuid())
  gabineteId String
  nome       String
  uf         String?
  latitude   Float?
  longitude  Float?
  ativa      Boolean  @default(true)
  criadoEm  DateTime @default(now())

  gabinete Gabinete @relation(fields: [gabineteId], references: [id])
  pessoas  Pessoa[]

  // Unicidade de (gabineteId, nome) entre regiões com ativa=true é
  // garantida por índice único parcial case-insensitive (lower(nome)) na
  // migration 20260718000003_regiao_partial_unique (atualizada para
  // lower(nome) em 20260719000002_regiao_case_insensitive_unique) — não
  // por @@unique, que bloquearia reativar uma região desativada. Mesma
  // técnica já aplicada em Pessoa/VinculoRede/Segmento/Profissao.
}
```

por:

```prisma
model Regiao {
  id          String   @id @default(cuid())
  gabineteId  String
  nome        String
  uf          String?
  latitude    Float?
  longitude   Float?
  ativa       Boolean  @default(true)
  regiaoPaiId String?
  criadoEm   DateTime @default(now())

  gabinete  Gabinete @relation(fields: [gabineteId], references: [id])
  pessoas   Pessoa[]
  regiaoPai Regiao?  @relation("RegiaoHierarquia", fields: [regiaoPaiId], references: [id])
  filhas    Regiao[] @relation("RegiaoHierarquia")

  // Unicidade de (gabineteId, nome) entre regiões com ativa=true é
  // garantida por índice único parcial case-insensitive (lower(nome)) na
  // migration 20260718000003_regiao_partial_unique (atualizada para
  // lower(nome) em 20260719000002_regiao_case_insensitive_unique) — não
  // por @@unique, que bloquearia reativar uma região desativada. Mesma
  // técnica já aplicada em Pessoa/VinculoRede/Segmento/Profissao.
  //
  // regiaoPaiId (hierarquia cidade -> bairro, Fase 1 da importação Izalci,
  // docs/superpowers/specs/2026-07-18-importacao-izalci-fase1-fundacao-schema-design.md):
  // uma pessoa é sempre vinculada ao nível mais granular (bairro); filtrar
  // pela região-mãe (cidade) deve incluir os filhos — lógica de consulta
  // fica para a Fase 2, que constrói a árvore real a partir das tags do Mongo.
}
```

- [ ] **Step 2: Editar `model Pessoa` no schema — campos eleitorais**

Em `prisma/schema.prisma`, dentro de `model Pessoa`, trocar:

```prisma
  isColaborador    Boolean   @default(false)
  isMobilizador    Boolean   @default(false)
  tokenMobilizador String?
  userId           String?
```

por:

```prisma
  isColaborador    Boolean   @default(false)
  isMobilizador    Boolean   @default(false)
  tokenMobilizador String?
  userId           String?
  zonaEleitoral    String?
  secaoEleitoral   String?
```

- [ ] **Step 3: Editar `model Pessoa` no schema — relação com `TelefoneExtra`**

Ainda em `model Pessoa`, trocar:

```prisma
  observacoes            ObservacaoPessoa[]
  demandasSolicitadas    Demanda[]              @relation("DemandaSolicitante")
```

por:

```prisma
  observacoes            ObservacaoPessoa[]
  telefonesExtras        TelefoneExtra[]
  demandasSolicitadas    Demanda[]              @relation("DemandaSolicitante")
```

- [ ] **Step 4: Adicionar o novo `model TelefoneExtra`**

Em `prisma/schema.prisma`, logo depois do fechamento de `model ObservacaoPessoa` (antes de `model AreaDemanda`), inserir:

```prisma
model TelefoneExtra {
  id         String    @id @default(cuid())
  gabineteId String
  pessoaId   String
  numero     String
  tipo       String?
  criadoEm   DateTime  @default(now())
  deletedAt  DateTime?

  gabinete Gabinete @relation(fields: [gabineteId], references: [id])
  pessoa   Pessoa   @relation(fields: [pessoaId], references: [id])

  // Telefones adicionais de uma pessoa, além de whatsapp (principal) e
  // telefoneFixo. Fase 1 da importação Izalci
  // (docs/superpowers/specs/2026-07-18-importacao-izalci-fase1-fundacao-schema-design.md):
  // schema só, sem UI de "adicionar telefone" (fora deste projeto) e sem
  // constraint de unicidade em `numero` (decisão de deduplicação fica para
  // a Fase 3). gabineteId direto (não só via pessoaId) segue o padrão de
  // ObservacaoPessoa, para manter a política RLS simples.
}
```

- [ ] **Step 5: Adicionar a relação inversa em `model Gabinete`**

Em `prisma/schema.prisma`, dentro de `model Gabinete`, trocar:

```prisma
  configuracaoSistema  ConfiguracaoSistema?
  areasColocacao       AreaColocacao[]
}
```

por:

```prisma
  configuracaoSistema  ConfiguracaoSistema?
  areasColocacao       AreaColocacao[]
  telefonesExtras      TelefoneExtra[]
}
```

- [ ] **Step 6: Criar a migration**

Create `prisma/migrations/20260719000003_izalci_fase1_fundacao_schema/migration.sql`:

```sql
-- Fase 1 da importação Izalci
-- (docs/superpowers/specs/2026-07-18-importacao-izalci-fase1-fundacao-schema-design.md):
-- hierarquia cidade -> bairro em Regiao, campos eleitorais em Pessoa, e
-- nova tabela TelefoneExtra para telefones adicionais de uma pessoa.

-- Regiao: hierarquia cidade -> bairro (regiaoPaiId autorreferente, opcional)
ALTER TABLE "Regiao" ADD COLUMN "regiaoPaiId" TEXT;
ALTER TABLE "Regiao" ADD CONSTRAINT "Regiao_regiaoPaiId_fkey" FOREIGN KEY ("regiaoPaiId") REFERENCES "Regiao"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Pessoa: campos eleitorais (armazenamento puro, sem validação/índice)
ALTER TABLE "Pessoa" ADD COLUMN "zonaEleitoral" TEXT;
ALTER TABLE "Pessoa" ADD COLUMN "secaoEleitoral" TEXT;

-- TelefoneExtra: telefones adicionais além de whatsapp/telefoneFixo
CREATE TABLE "TelefoneExtra" (
    "id" TEXT NOT NULL,
    "gabineteId" TEXT NOT NULL,
    "pessoaId" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "tipo" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "TelefoneExtra_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "TelefoneExtra" ADD CONSTRAINT "TelefoneExtra_gabineteId_fkey" FOREIGN KEY ("gabineteId") REFERENCES "Gabinete"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TelefoneExtra" ADD CONSTRAINT "TelefoneExtra_pessoaId_fkey" FOREIGN KEY ("pessoaId") REFERENCES "Pessoa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
```

- [ ] **Step 7: Aplicar a migration em staging**

```bash
cd /Users/renato/Documents/meubd
set -a; source .env.staging; set +a
node -e "
import('pg').then(async ({Client}) => {
  const client = new Client({connectionString: process.env.DIRECT_URL})
  await client.connect()
  const fs = await import('fs')
  const sql = fs.readFileSync('prisma/migrations/20260719000003_izalci_fase1_fundacao_schema/migration.sql', 'utf8')
  await client.query(sql)
  console.log('aplicado em staging')
  await client.end()
})
"
set -a; source .env.staging; set +a
npx prisma migrate resolve --applied 20260719000003_izalci_fase1_fundacao_schema
```

Expected: `aplicado em staging`, seguido de `Migration ... marked as applied`.

- [ ] **Step 8: Aplicar a migration em produção**

```bash
cd /Users/renato/Documents/meubd
set -a; source .env.local; set +a
node -e "
import('pg').then(async ({Client}) => {
  const client = new Client({connectionString: process.env.DIRECT_URL})
  await client.connect()
  const fs = await import('fs')
  const sql = fs.readFileSync('prisma/migrations/20260719000003_izalci_fase1_fundacao_schema/migration.sql', 'utf8')
  await client.query(sql)
  console.log('aplicado em produção')
  await client.end()
})
"
set -a; source .env.local; set +a
npx prisma migrate resolve --applied 20260719000003_izalci_fase1_fundacao_schema
```

Expected: `aplicado em produção`, seguido de `Migration ... marked as applied`.

- [ ] **Step 9: Gerar o client Prisma e checar tipos**

```bash
npx prisma generate
npx tsc --noEmit
```

Expected: os dois comandos terminam sem erro. `tsc --noEmit` confirma que nada no restante do projeto quebrou com o client regenerado (nenhum código ainda usa os campos/tabela novos).

- [ ] **Step 10: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260719000003_izalci_fase1_fundacao_schema/
git commit -m "$(cat <<'EOF'
feat: fundação de schema da importação Izalci (Fase 1)

Adiciona regiaoPaiId (hierarquia cidade->bairro) em Regiao,
zonaEleitoral/secaoEleitoral em Pessoa, e o modelo TelefoneExtra
para telefones adicionais — preparação de schema para as fases
seguintes da importação (docs/superpowers/specs/2026-07-18-importacao-izalci-fase1-fundacao-schema-design.md).
Sem UI, sem dado importado ainda.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: RLS para `TelefoneExtra`

**Files:**
- Modify: `scripts/setup-supabase.sql`

**Interfaces:**
- Consumes: tabela `TelefoneExtra` (colunas `gabineteId`, `id`) da Task 1 — precisa já existir em staging e produção antes desta task rodar.
- Produces: nada consumido por outra task deste plano; fecha a Fase 1.

- [ ] **Step 1: Adicionar a policy no script**

Em `scripts/setup-supabase.sql`, ao final do arquivo (depois do bloco `ALTER TABLE "BancoTalentosArea" ENABLE ROW LEVEL SECURITY;`), adicionar:

```sql

-- ------------------------------------------------------------
-- 6. Política RLS para TelefoneExtra (Fase 1 da importação Izalci,
-- docs/superpowers/specs/2026-07-18-importacao-izalci-fase1-fundacao-schema-design.md)
-- ------------------------------------------------------------

-- TelefoneExtra: escopo direto por gabineteId (mesmo padrão de ObservacaoPessoa)
CREATE POLICY "telefone_extra_all" ON "TelefoneExtra"
  FOR ALL TO authenticated
  USING ("gabineteId" = public.uid_gabinete())
  WITH CHECK ("gabineteId" = public.uid_gabinete());

ALTER TABLE "TelefoneExtra" ENABLE ROW LEVEL SECURITY;
```

- [ ] **Step 2: Aplicar em staging**

```bash
cd /Users/renato/Documents/meubd
cat > /tmp/telefone-extra-rls.sql <<'EOF'
CREATE POLICY "telefone_extra_all" ON "TelefoneExtra"
  FOR ALL TO authenticated
  USING ("gabineteId" = public.uid_gabinete())
  WITH CHECK ("gabineteId" = public.uid_gabinete());
ALTER TABLE "TelefoneExtra" ENABLE ROW LEVEL SECURITY;
EOF
set -a; source .env.staging; set +a
node -e "
import('pg').then(async ({Client}) => {
  const client = new Client({connectionString: process.env.DIRECT_URL})
  await client.connect()
  const fs = await import('fs')
  const sql = fs.readFileSync('/tmp/telefone-extra-rls.sql', 'utf8')
  await client.query(sql)
  console.log('RLS aplicado em staging')
  await client.end()
})
"
```

Expected: `RLS aplicado em staging`.

- [ ] **Step 3: Verificar RLS em staging**

```bash
cd /Users/renato/Documents/meubd
set -a; source .env.staging; set +a
node scripts/verificar-rls.mjs
```

Expected: `OK — N tabelas com RLS habilitado, todas com ao menos 1 política (...)`, onde `N` é uma unidade a mais que a última contagem registrada no HANDOFF.md (19 → 20), e nenhuma menção a `TelefoneExtra` na lista de divergência (o script só imprime tabela quando falta política).

- [ ] **Step 4: Aplicar em produção**

```bash
cd /Users/renato/Documents/meubd
set -a; source .env.local; set +a
node -e "
import('pg').then(async ({Client}) => {
  const client = new Client({connectionString: process.env.DIRECT_URL})
  await client.connect()
  const fs = await import('fs')
  const sql = fs.readFileSync('/tmp/telefone-extra-rls.sql', 'utf8')
  await client.query(sql)
  console.log('RLS aplicado em produção')
  await client.end()
})
"
```

Expected: `RLS aplicado em produção`.

- [ ] **Step 5: Verificar RLS em produção**

```bash
cd /Users/renato/Documents/meubd
set -a; source .env.local; set +a
node scripts/verificar-rls.mjs
```

Expected: mesma saída `OK — ...` do Step 3, agora contra o banco de produção.

- [ ] **Step 6: Commit**

```bash
git add scripts/setup-supabase.sql
git commit -m "$(cat <<'EOF'
feat: política RLS de TelefoneExtra (Fase 1 da importação Izalci)

Fecha a Fase 1: tabela TelefoneExtra (Task 1 deste plano) ganha
policy própria, aplicada e verificada em staging e produção via
scripts/verificar-rls.mjs — evita repetir o achado de RLS habilitado
sem política (auditoria de terceira ordem, HANDOFF.md seção 23).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```
