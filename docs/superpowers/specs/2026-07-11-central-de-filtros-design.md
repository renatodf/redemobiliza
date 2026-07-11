# Design — Central de Filtros e Exportação

**Data:** 2026-07-11
**Status:** aprovado

---

## Visão Geral

Tela de filtros acessível pelo ícone de lupa do Topbar (hoje decorativo, ao lado do sino), disponível tanto para admin quanto para mobilizador. Reúne, em um único lugar, a capacidade de filtrar e exportar os três tipos de dado mais importantes do sistema: **Pessoas**, **Demandas** e **Banco de Talentos**. Substitui a página dedicada de listagem/dashboard do Banco de Talentos que estava prevista no spec de 28/06/2026 — a aba "Banco de Talentos" desta tela assume esse papel.

Cada aba tem seu próprio conjunto de filtros combináveis (E lógico) e sua própria exportação — não é uma busca única cruzando as três tabelas.

---

## Escopo de acesso

| Aba | Admin | Mobilizador |
|---|---|---|
| Pessoas | Todo o gabinete | Somente a própria rede (toda a sub-árvore de indicações, não só indicados diretos) |
| Demandas | Todo o gabinete | Somente demandas em que ele é responsável (mesmo critério já usado em `/mobilizador/demandas`) |
| Banco de Talentos | Todo o gabinete | **Sem acesso** — aba não aparece |

O ícone da lupa aparece nos dois layouts (o componente `Topbar` já é compartilhado). A rota muda conforme o papel:
- Admin: `/[slug]/admin/filtros`
- Mobilizador: `/[slug]/mobilizador/filtros`

---

## Decisão técnica: coleta da rede completa do mobilizador

A tela atual do mobilizador (`/mobilizador/page.tsx`) só resolve **um nível** de indicados por vez (`indicadoPorId: pessoa.id`), com navegação em cascata clique-a-clique para descer na árvore. A aba Pessoas deste filtro precisa considerar **toda a sub-árvore de uma vez** (ex: "aniversariantes do dia" tem que incluir indicados de indicados, não só diretos).

Como Prisma não suporta consulta recursiva nativamente, isso exige uma **CTE recursiva em SQL bruto** (`prisma.$queryRaw`) que, a partir do `pessoaId` do mobilizador logado, percorre `VinculoRede.indicadoPorId` recursivamente e retorna todos os `pessoaId` descendentes. Essa função (`coletarSubRedeIds(pessoaId, gabineteId)`) fica em `src/lib/rede.ts` e é reaproveitada tanto pela aba Pessoas quanto — se precisar no futuro — por outras telas que hoje fazem esse cálculo nível a nível.

---

## Aba Pessoas

**Filtros (combináveis):**

| Filtro | Campo | Observação |
|---|---|---|
| Aniversário | `Pessoa.nascimento` | Aniversariantes do dia (hoje) / da semana / do mês (compara mês/dia, ignora ano) |
| Sexo | `Pessoa.genero` | |
| Região | `Pessoa.regiaoId` | |
| Idade | `Pessoa.nascimento` | Faixa min/max, calculada a partir da data de nascimento |
| Profissão | `Pessoa.profissaoId` | |
| Segmento | `PessoaSegmento` | Multi-select |

Pessoas sem `nascimento` preenchido são excluídas automaticamente de qualquer filtro de aniversário/idade (não aparecem como falso positivo).

**Exportação:** botão "Exportar" pergunta o formato — **PDF** ou **Excel (.xlsx)**. Gera um arquivo com as pessoas que batem no filtro (nome, WhatsApp, e-mail, região, profissão, segmentos, data de nascimento).

---

## Aba Demandas

**Filtros (combináveis):**

| Filtro | Campo | Observação |
|---|---|---|
| Área | `Demanda.areaId` | |
| Status | `Demanda.status` | Atendida (`atendida`) / Não atendida (`nao_atendida`) / Pendente (`aberta` OU `expirada` — mesmo agrupamento visual já usado em `statusDemandaPill`) |
| Região | `Demanda.solicitante.regiaoId` | Região da pessoa solicitante |

**Exportação:** mesmo padrão da aba Pessoas — pergunta PDF ou Excel, gera arquivo com título, área, status, solicitante, responsável, prazo.

---

## Aba Banco de Talentos (admin)

**Filtros (combináveis):**

| Filtro | Campo |
|---|---|
| Área de interesse | `BancoTalentosArea` (multi-select) |
| Prioridade | `BancoTalentos.prioridade` (1/2/3) |
| PcD | `BancoTalentos.isPcd` |
| Região | `Pessoa.regiaoId` |

**Exportação — fluxo próprio (não é PDF/Excel):**

1. Admin clica "Exportar".
2. Pergunta: **"Abrir demanda de encaminhamento para o mercado de trabalho para cada um dos cadastros filtrados?"**
   - **Não** → gera e baixa direto um **ZIP** com os currículos (`curriculoUrl`) de todos os cadastros filtrados que têm currículo anexado. Cadastros sem currículo são ignorados silenciosamente na montagem do ZIP, mas contam no total exibido antes do download (ex: "18 de 23 cadastros têm currículo — os outros 5 não entrarão no ZIP").
   - **Sim** → aparece um seletor de **responsável** (mobilizador/colaborador — mesma validação já usada em `criarDemanda`: precisa ser `isMobilizador && isColaborador`). Ao confirmar:
     a. Garante que existe uma `AreaDemanda` chamada "Emprego" para o gabinete (cria automaticamente se ainda não existir, `findFirst` + `create` idempotente — mesmo padrão já usado em `criarAreaColocacao`).
     b. Cria uma `Demanda` por pessoa filtrada (título `"Acompanhamento de encaminhamento — [Nome]"`, `solicitanteId` = a própria pessoa do Banco de Talentos, `responsavelId` = quem foi escolhido, `areaId` = "Emprego", `prazoDesfecho` = `ConfiguracaoSistema.prazoDemandasHoras` a partir de agora — mesmo default usado em `criarDemanda`).
     c. Gera e baixa o ZIP dos currículos.

Envio automático de e-mail (para gestor ou parceiro externo) fica **fora do escopo** desta fase — a ideia precisa amadurecer antes de entrar no projeto.

---

## Estrutura de Páginas e Rotas

```
src/app/[slug]/admin/filtros/
├── page.tsx                     # shell com abas: Pessoas / Demandas / Banco de Talentos
├── PessoasFiltro.tsx
├── DemandasFiltro.tsx
└── BancoTalentosFiltro.tsx

src/app/[slug]/mobilizador/filtros/
├── page.tsx                     # shell com abas: Pessoas / Demandas (sem Banco de Talentos)
├── PessoasFiltro.tsx             # mesmo componente da versão admin, com prop de escopo
└── DemandasFiltro.tsx            # idem

src/app/api/[slug]/filtros/
├── pessoas/exportar/route.ts     # POST — gera PDF ou Excel
├── demandas/exportar/route.ts    # POST — gera PDF ou Excel
└── banco-talentos/exportar/route.ts  # POST — gera ZIP (+ cria demandas se solicitado)
```

`PessoasFiltro`/`DemandasFiltro` são componentes compartilhados entre admin e mobilizador — recebem os dados já escopados (o `page.tsx` de cada papel decide o que consultar; o componente só filtra/exibe/exporta o que recebeu).

---

## Server Actions e helpers novos

| Nome | Arquivo | Descrição |
|---|---|---|
| `coletarSubRedeIds` | `src/lib/rede.ts` | CTE recursiva — retorna todos os `pessoaId` da sub-árvore de um mobilizador |
| `exportarPessoas` (route handler) | `src/app/api/[slug]/filtros/pessoas/exportar/route.ts` | Aplica filtros + escopo (admin/mobilizador), gera PDF ou Excel |
| `exportarDemandas` (route handler) | `.../demandas/exportar/route.ts` | Idem para Demandas |
| `exportarBancoTalentos` (route handler) | `.../banco-talentos/exportar/route.ts` | Aplica filtros, opcionalmente cria as Demandas de "Emprego", monta e retorna o ZIP |
| `garantirAreaEmprego` | `src/actions/admin/garantir-area-emprego.ts` | `findFirst`+`create` idempotente da `AreaDemanda` "Emprego" |

---

## Dependências novas

- `exceljs` — geração de `.xlsx` nas exportações de Pessoas e Demandas
- `pdfkit` — geração de PDF nas exportações de Pessoas e Demandas
- `jszip` — geração do ZIP de currículos (já previsto no spec original do Banco de Talentos, nunca instalado)

---

## Fora do Escopo

- Disparo automático de e-mail (para gestor interno ou parceiro externo) com o ZIP anexado — ideia ainda em maturação, tratada em fase futura.
- Filtro único cruzando as três tabelas em uma lista só (abordagem B descartada durante o brainstorm).
- Configuração de responsável padrão por área — o admin escolhe o responsável manualmente a cada exportação do Banco de Talentos.
