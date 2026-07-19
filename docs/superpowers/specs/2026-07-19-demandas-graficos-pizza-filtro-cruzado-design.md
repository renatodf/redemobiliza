# Demandas — Gráficos de Pizza com Filtro Cruzado — Spec

## Contexto

Tela `/[slug]/admin/demandas` (`src/app/[slug]/admin/demandas/page.tsx`) hoje mostra dois blocos de contagem com **escopos diferentes**: um gráfico de barras (`GraficoDemandas`) contando só o **mês calendário atual**, e uma grade de 5 cards contando **todo o histórico**. Nenhum dos dois bate com o padrão da tabela abaixo, que mostra **últimos 30 dias** quando não tem filtro nenhum ativo. Usuário pediu pra unificar tudo num único critério e trocar a visualização por gráficos de pizza clicáveis.

## Solução: dois `GraficoPizza`, filtro multi-seleção cruzado, todo o histórico

Remove o `GraficoDemandas` (barras) e a grade de 5 cards. No lugar, dois `GraficoPizza` (componente já existente em `src/components/GraficoPizza.tsx`, reaproveitado sem alteração — já usado no Dashboard, já suporta `href` por fatia):

- **Status**: Em aberto / Atendida / Não atendida / Expirada — cores de `CORES_STATUS_DEMANDA` (`src/lib/cores-graficos.ts`, já existe, não mudar).
- **Área**: uma fatia por `AreaDemanda` do gabinete — cores de `PALETA_CATEGORICA` (`src/lib/cores-graficos.ts`), por índice, ciclando se houver mais de 8 áreas (aceito como limitação conhecida — Izalci tem 7 áreas hoje, dentro da paleta).

Ambos os gráficos mostram **todo o histórico**, sem filtro de período (decisão do usuário: se pesar no sistema no futuro, adiciona um filtro de período específico depois — fora de escopo agora).

### Multi-seleção acumulativa por dimensão, com toggle

Clicar numa fatia **adiciona** aquele valor à seleção daquela dimensão (não substitui). Clicar de novo na mesma fatia **remove** (toggle). Isso é feito só com navegação por link (`href`), sem JavaScript de estado no cliente — mesmo padrão já usado em todo o resto do projeto pra filtro (recarrega a página com query params novos).

**Query params novos** (substituem os antigos `status`/`areaId`, que eram de valor único): `statusIds` e `areaIds`, ambos listas separadas por vírgula — mesma convenção já usada em `BancoTalentosFiltro.tsx` (`areaIds`).

```typescript
function comToggle(lista: string[], valor: string): string[] {
  return lista.includes(valor) ? lista.filter((v) => v !== valor) : [...lista, valor]
}
```

Cada fatia do gráfico de status tem `href` calculado com `statusIds` alternado (toggle) e `areaIds` preservado como está. Cada fatia do gráfico de área, o inverso.

### Filtro cruzado (faceted): cada gráfico ignora o próprio filtro, respeita o do outro

- O gráfico de **status** é recalculado com um `where` que aplica o filtro de `areaIds` (se houver), mas **não** aplica o filtro de `statusIds` — assim ele sempre mostra a distribuição completa de status dentro da área já selecionada, permitindo trocar/adicionar outro status.
- O gráfico de **área**, o inverso: aplica `statusIds` (se houver), não aplica `areaIds`.
- A **tabela** abaixo aplica os dois filtros juntos (status IN `statusIds` E área IN `areaIds`, quando presentes).

```typescript
const whereBase = { gabineteId: gabinete.id, deletedAt: null }
const whereParaStatus = { ...whereBase, ...(areaIds.length ? { areaId: { in: areaIds } } : {}) }
const whereParaArea = { ...whereBase, ...(statusIds.length ? { status: { in: statusIds } } : {}) }
const whereTabela = {
  ...whereBase,
  ...(statusIds.length ? { status: { in: statusIds } } : {}),
  ...(areaIds.length ? { areaId: { in: areaIds } } : {}),
}
```

### Botão "Limpar filtro"

Link simples pra `/[slug]/admin/demandas` sem nenhum query param — zera `statusIds` e `areaIds` de uma vez (e, como efeito colateral aceito, qualquer outro filtro que porventura estivesse na URL).

### Tabela também passa a mostrar todo o histórico por padrão

Remove o default de "últimos 30 dias" (`dataInicioPadrao`, linhas 62-65 e 75-82 de `page.tsx` atual) — sem filtro nenhum, mostra tudo, batendo com os dois gráficos. `dataInicio`/`dataFim` continuam existindo como filtro opcional (usado pelo link "Demandas do mês" do Dashboard), só deixam de ser aplicados por padrão.

### Ajuste no Dashboard (efeito colateral necessário)

`src/app/[slug]/admin/dashboard/DashboardConteudo.tsx:122` gera `href` pro pizza "Demandas do mês" usando o parâmetro antigo `status=` (valor único). Precisa virar `statusIds=` pra continuar funcionando com a página de Demandas atualizada — é uma troca de nome de parâmetro numa única linha, sem mudar o resto do comportamento daquele gráfico (continua mostrando só o mês atual, com `dataInicio`/`dataFim`, que não muda).

## Fora de escopo

- Filtro de período nos dois novos gráficos de pizza (área/status) — decisão explícita do usuário, revisitar só se performance for um problema real.
- Reaproveitar `agruparTopEOutros` pro gráfico de área — quebraria o clique-pra-filtrar (uma fatia "Outros" reúne múltiplas áreas, não dá pra filtrar por uma coisa só). Não aplicado aqui; se o número de áreas crescer muito no futuro, revisitar.
- Reativar o formulário de filtros comentado (`page.tsx:170-227`, responsável/região/prazo alterado/data) — continua oculto, não faz parte deste pedido.
