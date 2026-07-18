# Importação Izalci — Fase 1: Fundação de schema — Spec

## Contexto

Primeira das 5 fases descritas em `docs/superpowers/specs/2026-07-18-importacao-izalci-mongodb-design.md` (spec-mãe da importação da base MongoDB do senador Izalci Lucas). Esta spec detalha só a Fase 1 — "Fundação de schema" — antes de qualquer ETL de dado real começar.

## Objetivo

Abrir espaço no schema do Rede Mobiliza para os campos/estruturas que as fases seguintes vão precisar, sem tocar em UI e sem importar nenhum dado ainda.

## Escopo

### 1. `Regiao.regiaoPaiId` — hierarquia cidade → bairro

Campo opcional autorreferente, mesmo padrão de `VinculoRede.indicadoPorId`:

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
  criadoEm    DateTime @default(now())

  gabinete  Gabinete @relation(fields: [gabineteId], references: [id])
  pessoas   Pessoa[]
  regiaoPai Regiao?  @relation("RegiaoHierarquia", fields: [regiaoPaiId], references: [id])
  filhas    Regiao[] @relation("RegiaoHierarquia")
}
```

Sem `onDelete` explícito, sem checagem de ciclo no schema — a Fase 2 é quem constrói a árvore real a partir das tags `City`/`Neighborhood` do Mongo. A Fase 1 só cria a coluna e a relação.

### 2. `zonaEleitoral`/`secaoEleitoral` em `Pessoa`

```prisma
model Pessoa {
  // ...campos existentes
  zonaEleitoral  String?
  secaoEleitoral String?
}
```

Sem validação de formato, sem índice — armazenamento puro. **Sem UI nesta fase**: nenhuma tela (CamposPessoa.tsx, CadastroForm.tsx) muda. A funcionalidade de exibir esses campos só na edição (não no cadastro público) fica para uma fase/tarefa futura — decisão explícita para manter a Fase 1 estritamente "schema".

### 3. Novo modelo `TelefoneExtra`

Telefones adicionais de uma pessoa, além do `whatsapp` principal e do `telefoneFixo` já existentes. Segue o padrão de `ObservacaoPessoa` (dado pertencente a uma `Pessoa`, com `gabineteId` direto para RLS simples — não uma tabela-join pura como `PessoaSegmento`):

```prisma
model TelefoneExtra {
  id         String    @id @default(cuid())
  gabineteId String
  pessoaId   String
  numero     String
  tipo       String?   // "cellphone" | "landline"
  criadoEm   DateTime  @default(now())
  deletedAt  DateTime?

  gabinete Gabinete @relation(fields: [gabineteId], references: [id])
  pessoa   Pessoa   @relation(fields: [pessoaId], references: [id])
}
```

```prisma
// em Pessoa:
telefonesExtras TelefoneExtra[]
```

- `deletedAt` incluído desde já para seguir o padrão de soft-delete do projeto, mesmo sem UI que o use ainda nesta fase.
- Sem `@@unique`/índice de unicidade: uma pessoa pode ter dois números duplicados por engano sem travar nada. A estratégia de deduplicação de telefone é decisão da Fase 3 (já listada como item em aberto no spec-mãe).
- Sem UI de "adicionar telefone" — confirmado fora de escopo (spec-mãe: "próximo sprint, fora deste projeto").

### 4. Criação do gabinete IZALCI

**Fora do escopo de código.** O `criarGabinete` atual semeia catálogos genéricos (Regiao/Profissao/AreaDemanda/AreaColocacao) que serão substituídos pelos reais na Fase 2 — decisão explícita de não modificar essa action agora. O gabinete IZALCI é criado manualmente pela tela de super-admin já existente, com os catálogos genéricos de sempre; eles ficam como estado transitório até a Fase 2 rodar.

## Migration e RLS

- Uma única migration Prisma cobrindo os 3 itens de schema acima.
- `scripts/setup-supabase.sql` ganha a policy RLS de `TelefoneExtra` (mesmo padrão de `ObservacaoPessoa` — `gabineteId` resolvido via `public.uid_gabinete()`).
- Depois de aplicar em staging, rodar `scripts/verificar-rls.mjs` para confirmar que a tabela nova tem RLS habilitado **e** pelo menos uma política — evita repetir o achado mais grave da auditoria de terceira ordem (HANDOFF.md, seção 23: tabelas com RLS habilitado e zero políticas).

## Testes

Sem testes automatizados novos — não há lógica pura para testar nesta fase (só schema/migration/RLS).

## Fora de escopo (confirmado)

- Qualquer UI (CamposPessoa.tsx, CadastroForm.tsx, tela de telefones).
- Importação de qualquer dado real do Mongo (fases 2-5).
- Constraint de unicidade em `TelefoneExtra.numero`.
- Modificar `criarGabinete`/seed de catálogos genéricos.
