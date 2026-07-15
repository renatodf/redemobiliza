# Listagem de Demandas — ordenação alfabética + ocultar filtros — design

> Spec gerada em 2026-07-15, a partir de brainstorming em texto.

## Contexto e motivação

A tela `/admin/demandas` (listagem "Demandas" — diferente da aba Demandas da Central de
Filtros) já tem ordenação clicável (`SortableHeader`) em "Responsável" e "Prazo", mas não em
"Solicitante", "Área" e "Status". O pedido: estender a mesma ordenação alfabética pras 3 colunas
que faltam, e ocultar o formulário de filtros visível da tela (mantendo o código, não apagando —
decisão do usuário, pra poder reativar rápido se precisar no futuro).

## Escopo

1. **Ocultar (não remover) o formulário de filtros** — os 5 selects (Status, Área, Responsável,
   Região, Prazo alterado), os 2 campos de data e o botão "Filtrar" + link "Limpar filtros".
   Implementado como um comentário JSX (`{/* ... */}`) envolvendo o bloco inteiro, com uma nota
   de uma linha explicando o motivo e como reativar (remover o comentário). Nenhuma mudança na
   lógica de dados (`where`, `temFiltro`, período padrão de 30 dias) — ela continua ativa e
   respondendo aos mesmos parâmetros de URL, só não há mais um formulário nesta tela pra
   preenchê-los manualmente.
2. **Ordenação alfabética em 3 colunas novas**, reaproveitando `SortableHeader`
   (`src/components/SortableHeader.tsx`, sem nenhuma mudança nele):
   - **Solicitante** → `field="solicitante"`, ordena por `solicitante.nome`.
   - **Área** → `field="area"`, ordena por `area.nome`.
   - **Status** → `field="status"`, ordena pelo valor bruto do campo (`aberta`/`atendida`/
     `expirada`/`nao_atendida`) em ordem alfabética — mesma simplicidade de "Prazo" hoje, sem
     reordenar por gravidade/prioridade.
   - `buildOrderBy()` (em `src/app/[slug]/admin/demandas/page.tsx`) ganha 3 blocos `if` novos,
     seguindo exatamente o padrão já usado por `responsavel`/`prazoDesfecho`.

## Fora de escopo

- Qualquer mudança na aba Demandas da Central de Filtros (`/admin/filtros/demandas`,
  `DemandasFiltro.tsx`) — é uma tela diferente, com filtro próprio, não afetada por este pedido.
- Qualquer mudança nos links que já existem hoje vindos do Dashboard (fatia de pizza/barra de
  "Demandas do mês" → `/admin/demandas?status=X&dataInicio=...&dataFim=...`) — continuam
  funcionando exatamente como hoje, já que a lógica de `where`/`temFiltro` não muda.
- Um jeito visual de "limpar" um filtro vindo por URL nesta tela (efeito colateral aceito da
  remoção do formulário — quem chegar via Dashboard já filtrado precisaria voltar ou editar a URL
  manualmente pra ver tudo).
- Reordenar por "gravidade" de status (ex. pendente antes de atendida) — o pedido foi
  especificamente por ordem alfabética, mesmo padrão simples já usado nas outras colunas.

## Componentes

### `src/app/[slug]/admin/demandas/page.tsx` (modificado)

- `buildOrderBy(sort, order)` ganha:
  ```ts
  if (sort === 'solicitante') return { solicitante: { nome: direcao } }
  if (sort === 'area') return { area: { nome: direcao } }
  if (sort === 'status') return { status: direcao }
  ```
- No `<thead>` da tabela, as 3 colunas que hoje são `<th className="text-left px-4 py-3
  font-medium text-gray-600">Solicitante</th>` (mesma estrutura pra Área e Status) viram
  `<th className="text-left px-4 py-3"><SortableHeader label="Solicitante" field="solicitante"
  /></th>` (idem Área/Status), no mesmo padrão já usado por Responsável/Prazo.
- O bloco `{/* Filtros */}` inteiro (o `<form method="GET" ...>` com os selects, datas, botão
  Filtrar e link Limpar filtros) é envolvido num comentário JSX, com uma linha de nota logo no
  início explicando: filtros ocultados a pedido do usuário (15/07/2026), lógica de dados intacta,
  reativar removendo o comentário.
- Nenhuma outra parte do arquivo muda (cards de resumo, gráfico, tabela de dados, paginação,
  `where`/`temFiltro`/`buildOrderBy` de resto).

## Testes

- Sem teste automatizado — página depende de Prisma e é puramente visual nas partes alteradas
  (convenção já estabelecida no projeto).
- Verificação manual (gabinete real): clicar no cabeçalho "Solicitante" ordena a lista por nome
  do solicitante (asc → desc → padrão, mesmo ciclo de 3 estados já usado em Responsável); mesmo
  teste pra "Área" e "Status". Confirmar que o formulário de filtros não aparece mais na tela, mas
  que clicar numa fatia de "Demandas do mês" no Dashboard ainda chega em `/admin/demandas` com o
  recorte certo (contagem batendo).
