# Design — Banco de Talentos

**Data:** 2026-06-28
**Status:** substituído em 11/07/2026 — ver `docs/superpowers/specs/2026-07-11-central-de-filtros-aba-banco-de-talentos-design.md`

> ⚠️ **Este spec está obsoleto.** Só a Fase 1 (modelos `AreaColocacao`/`BancoTalentos`/`BancoTalentosArea`, gestão de áreas em Configurações, e o dialog de cadastro na ficha da pessoa) foi construída a partir daqui — confirmado no HANDOFF do projeto. O restante (dashboard dedicado, model `Encaminhamento` separado, "gestor padrão" fixo, notificação automática por e-mail, 9 filtros, indicadores de aniversário) foi **substituído** por um desenho mais simples, decidido em 11/07/2026 após revisão comparativa explícita com o usuário: a listagem/exportação vira uma aba da Central de Filtros (sem dashboard, sem model de auditoria separado, responsável escolhido a cada exportação em vez de configurado uma vez). Mantido aqui só como histórico — não é mais a fonte de verdade pra esse módulo.

---

## Visão Geral

Módulo de gestão de currículos integrado ao cadastro de pessoas. Permite registrar candidatos a emprego, organizá-los por área de interesse, prioridade e perfil, e encaminhá-los para oportunidades disponibilizadas por empresários ou parceiros do gabinete. Integrado ao módulo de Demandas para acompanhamento pós-encaminhamento.

---

## Schema Prisma

Quatro models novos. Todos ajustados para o padrão multi-tenant do projeto (campo `gabineteId` direto em cada model).

```prisma
model BancoTalentos {
  id           String   @id @default(cuid())
  gabineteId   String
  pessoaId     String   @unique
  curriculoUrl String?
  prioridade   Int      @default(3)
  isPcd        Boolean  @default(false)
  observacao   String?
  colocado     Boolean  @default(false)
  criadoEm     DateTime @default(now())
  atualizadoEm DateTime @updatedAt

  gabinete        Gabinete            @relation(fields: [gabineteId], references: [id])
  pessoa          Pessoa              @relation(fields: [pessoaId], references: [id])
  areas           BancoTalentosArea[]
  encaminhamentos Encaminhamento[]

  @@index([gabineteId])
}

model AreaColocacao {
  id         String @id @default(cuid())
  gabineteId String
  nome       String
  status     String @default("ativa")

  gabinete Gabinete            @relation(fields: [gabineteId], references: [id])
  talentos BancoTalentosArea[]

  @@unique([gabineteId, nome])
  @@index([gabineteId])
}

model BancoTalentosArea {
  bancoTalentosId String
  areaColocacaoId String

  bancoTalentos BancoTalentos @relation(fields: [bancoTalentosId], references: [id])
  area          AreaColocacao @relation(fields: [areaColocacaoId], references: [id])

  @@id([bancoTalentosId, areaColocacaoId])
}

model Encaminhamento {
  id               String   @id @default(cuid())
  gabineteId       String
  bancoTalentosId  String
  demandaId        String?
  encaminhadoEm    DateTime @default(now())
  encaminhadoPorId String

  gabinete       Gabinete      @relation(fields: [gabineteId], references: [id])
  bancoTalentos  BancoTalentos @relation(fields: [bancoTalentosId], references: [id])
  encaminhadoPor Pessoa        @relation("EncaminhamentoPor", fields: [encaminhadoPorId], references: [id])

  @@index([gabineteId])
  @@index([bancoTalentosId])
}
```

**Alterações em models existentes:**

```prisma
// Gabinete — adicionar relações
areasColocacao  AreaColocacao[]
bancoTalentos   BancoTalentos[]
encaminhamentos Encaminhamento[]

// Pessoa — adicionar relações
bancoTalentos   BancoTalentos?
encaminhamentos Encaminhamento[] @relation("EncaminhamentoPor")
```

**ConfiguracaoSistema — campo novo:**
```prisma
gestorEncaminhamentoId String?  // responsável padrão das demandas de encaminhamento
```

**Storage:** currículo salvo em `${gabinete.id}/pessoas/${pessoaId}/curriculo.ext` no bucket `gabinete-assets`. Um arquivo por pessoa — substituído a cada atualização.

---

## Estrutura de Páginas e Rotas

```
src/app/[slug]/admin/
└── banco-de-talentos/
    ├── page.tsx              # Dashboard + listagem com filtros e seleção
    └── configuracoes/
        └── page.tsx          # Gerenciar áreas de colocação + gestor padrão

src/app/api/[slug]/
└── banco-talentos/
    └── exportar/
        └── route.ts          # GET — gera e retorna ZIP de currículos
```

A ficha da pessoa (`/admin/pessoas/[pessoaId]`) ganha um botão que abre um Dialog — sem nova rota.

---

## Componentes

| Componente | Localização | Descrição |
|---|---|---|
| `BancoTalentosDialog` | ficha da pessoa | Modal de cadastro/atualização. Campos: currículo (upload), áreas (multi-select), prioridade, PcD, observação, colocado. Campos de admin ocultos para não-admins. |
| `BancoTalentosDashboard` | página principal | Cards: total, PcD, por prioridade (1/2/3), gráfico gênero |
| `BancoTalentosFiltros` | página principal | Painel colapsável: área, prioridade, PcD, colocado, gênero, cidade, período de cadastro, encaminhados para entrevista, tem currículo anexado |
| `BancoTalentosListagem` | página principal | Tabela paginada (20/página), ordem alfabética padrão, abertura em últimos 30 dias, seleção múltipla para exportação |
| `ExportarCurriculosDialog` | página principal | Modal pós-seleção: contagem, pergunta sobre abertura de demanda, botão exportar |
| `GerenciarAreasColocacao` | página de configurações | CRUD de áreas (criar, editar nome, desativar) |

---

## Server Actions

| Action | Arquivo | Descrição |
|---|---|---|
| `incluirBancoTalentos` | `incluir-banco-talentos.ts` | Cria BancoTalentos + sobe currículo no Storage se enviado |
| `atualizarBancoTalentos` | `atualizar-banco-talentos.ts` | Atualiza campos + substitui currículo no Storage se enviado novo arquivo |
| `criarAreaColocacao` | `criar-area-colocacao.ts` | Adiciona área ao gabinete |
| `desativarAreaColocacao` | `desativar-area-colocacao.ts` | Marca status = "inativa" |
| `registrarEncaminhamento` | `registrar-encaminhamento.ts` | Cria Encaminhamento + Demanda por pessoa + notifica gestor via Resend |
| `marcarColocado` | `marcar-colocado.ts` | Atualiza colocado = true no BancoTalentos |

---

## API Route — Exportação ZIP

`GET /api/[slug]/banco-talentos/exportar?ids=id1,id2,...`

1. Valida sessão e papel `admin`
2. Valida que todos os IDs pertencem ao gabinete do slug
3. Busca `curriculoUrl` de cada BancoTalentos
4. Baixa cada arquivo do Supabase Storage
5. Monta ZIP com `jszip`:
   - Nome do ZIP: `curriculos_DD_MM_YYYY.zip`
   - Nome de cada arquivo interno: `Nome_Sobrenome.ext` (extensão preservada do original)
6. Retorna como `application/zip` com header `Content-Disposition: attachment`

---

## Fluxos Principais

### Fluxo 1 — Inclusão no Banco de Talentos
1. Admin abre ficha da pessoa
2. Botão "Incluir [Nome] no Banco de Talentos" aparece (ou "Atualizar" se já cadastrada)
3. Dialog abre com os campos
4. Ao salvar: currículo é enviado ao Storage, registro criado/atualizado no banco
5. Se upload falhar: erro exibido no modal, nenhum dado salvo

### Fluxo 2 — Exportação com encaminhamento
1. Admin acessa página principal do Banco de Talentos
2. Aplica filtros (área + prioridade + PcD + cidade + etc.)
3. Lista filtrada aparece com caixas de seleção
4. Admin seleciona os candidatos desejados
5. Clica em "Exportar currículos selecionados"
6. `ExportarCurriculosDialog` abre: "Deseja abrir demanda de acompanhamento?"
   - **Não** → download do ZIP iniciado diretamente
   - **Sim** → `registrarEncaminhamento` executa:
     - Cria um `Encaminhamento` por pessoa
     - Cria uma `Demanda` por pessoa ("Acompanhamento de encaminhamento — [Nome]", responsável = gestor configurado)
     - Notifica gestor por e-mail via Resend
     - Download do ZIP iniciado em seguida
7. Se gestor padrão não configurado: bloqueia com mensagem direcionando para configurações do módulo

### Fluxo 3 — Acompanhamento pós-encaminhamento
1. Gestor recebe e-mail de notificação da demanda
2. Entra em contato com o candidato
3. Registra resultado:
   - Conseguiu emprego → `marcarColocado` → pessoa sai dos filtros padrão (colocado = false)
   - Não conseguiu → encerra a demanda normalmente, pessoa permanece no banco

---

## Permissões e Visibilidade

| Campo / Funcionalidade | Admin | Equipe/Mobilizador |
|---|---|---|
| Prioridade | Visível e editável | Oculto |
| Observação interna | Visível e editável | Oculto |
| Campo "Colocado no mercado" | Visível e editável | Oculto |
| Dashboard completo (todos os indicadores) | Sim | Indicadores limitados |
| Incluir/Atualizar no Banco de Talentos | Sim | Não (fase futura) |
| Exportar e encaminhar | Sim | Não |

---

## Dados do Dashboard

| Indicador | Admin vê | Equipe vê |
|---|---|---|
| Total de cadastros no banco | Todos do gabinete | — |
| Aniversariantes do dia | Todos os cadastros do sistema | Seus cadastrados |
| Gráfico Masculino/Feminino/Outro/Não informado | Todos | — |
| Cadastros por prioridade (1, 2, 3) | Todos | — |
| Cadastros de PcD | Todos | — |

---

## Listagem e Filtros

**Padrão de abertura:** últimos 30 dias de cadastro, ordem alfabética, 20 por página.

**Filtros disponíveis:**

| Filtro | Tipo |
|---|---|
| Área desejada | Multi-select das áreas ativas |
| Prioridade | 1 / 2 / 3 |
| PcD | Sim / Não |
| Colocado no mercado | Sim / Não |
| Gênero | Masculino / Feminino / Outro / Não informado |
| Cidade | Texto livre ou seleção das cidades cadastradas |
| Período de cadastro | Data inicial → Data final |
| Encaminhados para entrevista | Sim / Não (derivado da existência de Encaminhamento) |
| Tem currículo anexado | Sim / Não |

---

## Configurações do Módulo

Página `/admin/banco-de-talentos/configuracoes`:

1. **Gestor padrão de encaminhamento** — seleção de pessoa do gabinete que receberá as demandas geradas automaticamente. Obrigatório para usar o fluxo de encaminhamento.
2. **Áreas de colocação** — lista gerenciada (criar, editar, desativar). Desativar não remove de registros existentes. Seed inicial com as áreas do briefing.

---

## Dependências

- `jszip` — geração do arquivo ZIP na API Route
- `Resend` — já integrado, reutilizado para notificação do gestor
- Supabase Storage bucket `gabinete-assets` — já existente, reutilizado para currículos

---

## Fora do Escopo (Fase Futura)

- Disparo automático de WhatsApp para aniversariantes
- Disparo automático de WhatsApp para encaminhados (verificar resultado)
- Envio do ZIP por e-mail para o empresário parceiro
- Novos perfis de acesso com permissão de cadastro no Banco de Talentos
