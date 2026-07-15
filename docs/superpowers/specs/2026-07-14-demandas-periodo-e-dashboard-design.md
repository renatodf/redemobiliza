# Central de Filtros — aba Demandas: filtro de período + "Visualizar Dados Gerais" — design

> Spec gerada em 2026-07-14, a partir de brainstorming em texto. Extensão direta da feature
> "Visualizar Dados Gerais a partir de um filtro" (`2026-07-14-visualizar-dados-gerais-design.md`),
> que só cobriu a aba Pessoas.

## Contexto e motivação

A aba Demandas da Central de Filtros (`DemandasFiltro.tsx`, compartilhada admin/mobilizador)
filtra por área, status e região do solicitante, mas não tem filtro de período — e não tem botão
"Visualizar Dados Gerais" (fora de escopo do spec anterior, que só cobriu a aba Pessoas).

O pedido: poder responder perguntas como "quem são as pessoas que tiveram demandas atendidas na
área da Saúde, na região do Guará, em janeiro de 2025" — e ver os dados agregados (região, sexo,
faixa etária, escolaridade, religião etc.) **dessas pessoas especificamente**, não do gabinete
inteiro.

Isso é conceitualmente diferente do botão que já existe na aba Pessoas: lá, o filtro já é sobre
pessoas (região da pessoa, sexo da pessoa etc.) e o Dashboard só precisa aplicar o mesmo `where`.
Aqui, o filtro é sobre **demandas** (área, status, período de criação) e o que queremos ver no
Dashboard é a população de **solicitantes** dessas demandas — uma tradução de "filtro de Demanda"
para "população de Pessoa".

## Escopo

1. **Filtro de período** na aba Demandas (`DemandasFiltro.tsx`): dois campos novos, "Data início" /
   "Data fim" (`<input type="date">`), filtrando pela **data de criação** da demanda (`criadoEm`) —
   não pela data em que foi marcada como atendida (essa data não existe como campo consultável na
   `Demanda` hoje, só no histórico de movimentações; decisão do usuário: fora de escopo, ver
   "Fora de escopo" abaixo). Mesmo padrão de UI e parsing de data já usado em `/admin/demandas`.
2. **Botão "Visualizar Dados Gerais"** na aba Demandas, admin e mobilizador — ao contrário do
   equivalente na aba Pessoas, este **aparece sempre** (não precisa de filtro ativo), porque
   mesmo sem nenhum filtro ele tem um significado válido: "todo mundo que já solicitou alguma
   demanda".
3. **Dashboard entende um novo parâmetro-flag `filtroDemandas=1`** (+ `areaId`, `status`,
   `dataInicio`, `dataFim` — `regiaoId` já é entendido, sem mudança): quando presente, a
   população do Dashboard passa a ser "pessoas que têm pelo menos uma demanda batendo essa
   combinação de área/status/período/região", via filtro relacional do Prisma
   (`demandasSolicitadas: { some: {...} }`), reaproveitando `buildWhereDemandas` sem duplicar
   lógica de status/área/data.
4. **Badges no Dashboard** para essa origem: uma badge-base ("Demandas: Todos os solicitantes" ou
   "Demandas: Solicitantes filtrados", dependendo se há sub-filtro) + badges individuais para
   Área/Status/Período, todas removíveis, entrando também no "Limpar tudo".
5. **Rota de exportação de Demandas** (`/api/[slug]/filtros/demandas/exportar`) passa a aplicar o
   novo filtro de período também (hoje ignoraria `dataInicio`/`dataFim` silenciosamente se não for
   corrigida).

## Fora de escopo

- Filtrar por data em que a demanda foi **atendida/resolvida** (só por data de **criação**) —
  exigiria consultar `MovimentacaoDemanda` (histórico), sem precedente no código hoje; decisão do
  usuário: fica pra uma rodada futura se for realmente necessário.
- Alterar o significado de `regiaoId` — continua exatamente como já funciona hoje (filtro direto
  na região da própria pessoa via `wherePessoas.regiaoId`), tanto vindo da aba Pessoas quanto da
  aba Demandas.
- Combinar a origem "solicitantes de demandas filtradas" com a origem "rede de um mobilizador"
  (`redeDeId`) ou com os filtros da aba Pessoas (`genero`, `segmentoId` etc.) ao mesmo tempo — as
  três origens de população (Pessoas, rede, Demandas) são mutuamente exclusivas na prática, porque
  cada uma só é criada por um botão de navegação específico, nunca combinada manualmente pela UI.
- Mudar o destino dos cliques que já existem hoje no Dashboard (fatia de pizza, pin do mapa, item
  de região, barra de "Demandas do mês") — continuam levando pra Central de Filtros / listagem de
  Demandas exatamente como já funcionam.

## O que conta como "filtro ativo" (aba Demandas)

Diferente da aba Pessoas, aqui **não existe** o conceito de "botão só aparece se algo estiver
filtrado" — o botão "Visualizar Dados Gerais" na aba Demandas aparece sempre. O que os campos
abaixo controlam é **o que aparece nas badges do Dashboard**, não a visibilidade do botão:
`areaId`, `status`, `dataInicio`, `dataFim` (mais `regiaoId`, que já usa o mecanismo existente da
aba Pessoas).

## Modelo de dados

Nenhuma mudança de schema. `Pessoa.demandasSolicitadas` (relação `DemandaSolicitante`, já existe)
é o que torna esse filtro relacional possível sem nova tabela/coluna.

## Componentes

### `src/lib/filtros-demandas.ts` (modificado)

- `FiltrosDemandasParams` ganha `dataInicio?: string` e `dataFim?: string` (strings `YYYY-MM-DD`,
  mesmo formato de `<input type="date">`).
- `WhereDemandas` ganha `criadoEm?: { gte?: Date; lte?: Date }`.
- `buildWhereDemandas` ganha, ao final (mesmo padrão de parsing já usado em
  `/admin/demandas/page.tsx`):
  ```ts
  if (params.dataInicio || params.dataFim) {
    where.criadoEm = {}
    if (params.dataInicio) where.criadoEm.gte = new Date(`${params.dataInicio}T00:00:00`)
    if (params.dataFim) where.criadoEm.lte = new Date(`${params.dataFim}T23:59:59.999`)
  }
  ```

### `src/lib/filtros-pessoas.ts` (modificado)

- Importa `type { WhereDemandas }` de `./filtros-demandas` (import de tipo, sem dependência
  circular — `filtros-demandas.ts` não importa nada de `filtros-pessoas.ts`).
- `WherePessoas` ganha `demandasSolicitadas?: { some: WhereDemandas }`.
- `buildWherePessoas` ganha um 4º parâmetro opcional, `filtroDemandas?: WhereDemandas`:
  ```ts
  export function buildWherePessoas(
    gabineteId: string,
    params: FiltrosPessoasParams,
    idsRede?: string[],
    filtroDemandas?: WhereDemandas
  ): WherePessoas {
    // ...corpo existente...
    if (filtroDemandas) where.demandasSolicitadas = { some: filtroDemandas }
    return where
  }
  ```
  `idsRede` e `filtroDemandas` nunca vêm preenchidos ao mesmo tempo na prática (origens mutuamente
  exclusivas, ver "Fora de escopo"), mas nada impede tecnicamente os dois juntos se algum dia for
  necessário — o Prisma simplesmente aplica os dois `where` como AND.

### `src/lib/filtros-ativos.ts` (modificado)

Novo export, ao lado de `CAMPOS_FILTRO_PESSOAS` (sem alterar esse — ele continua exatamente com os
mesmos 7 campos, já teve teste aprovado):
```ts
export const CAMPOS_FILTRO_DEMANDAS = ['areaId', 'status', 'regiaoId', 'dataInicio', 'dataFim'] as const
```
Usado (a) pelo botão da aba Demandas pra saber quais campos copiar da URL atual, e (b) pelo
Dashboard pra saber quais campos limpar junto com `filtroDemandas` no "Limpar tudo"/badge-base.
Sem uma função `temFiltroAtivo`-equivalente pra Demandas — não é necessária, já que o botão não é
condicional.

### `src/components/admin/VisualizarDadosGeraisDemandasButton.tsx` (novo)

Mesmo estilo visual do botão já existente (`VisualizarDadosGeraisButton.tsx`), mas **sem** o gate
de `temFiltroAtivo` e forçando `filtroDemandas=1` sempre:
```tsx
import { CAMPOS_FILTRO_DEMANDAS } from '@/lib/filtros-ativos'

export default function VisualizarDadosGeraisDemandasButton({
  dashboardHref,
  searchParams,
  corPrimaria,
}: {
  dashboardHref: string
  searchParams: Record<string, string | undefined>
  corPrimaria: string
}) {
  const qs = new URLSearchParams()
  qs.set('filtroDemandas', '1')
  for (const campo of CAMPOS_FILTRO_DEMANDAS) {
    const valor = searchParams[campo]
    if (valor) qs.set(campo, valor)
  }
  return (
    <a
      href={`${dashboardHref}?${qs.toString()}`}
      style={{ backgroundColor: corPrimaria }}
      className="text-white text-[11px] px-2.5 py-1 rounded-md hover:opacity-90 font-medium"
    >
      Visualizar Dados Gerais
    </a>
  )
}
```

### `src/app/[slug]/admin/filtros/DemandasFiltro.tsx` (modificado)

- Novo prop `dashboardHref: string`.
- Renderiza `<VisualizarDadosGeraisDemandasButton dashboardHref={dashboardHref} searchParams={searchParams} corPrimaria={corPrimaria} />`
  no mesmo `<div className="flex gap-2">` que já tem "Exportar PDF"/"Exportar Excel", como
  primeiro item (mesma posição da versão da aba Pessoas).
- Dois novos campos no formulário de filtro (ao lado de Área/Status/Região, mesmo padrão visual):
  ```tsx
  <div>
    <label className="block text-xs font-medium text-gray-600">Data início</label>
    <input type="date" name="dataInicio" defaultValue={searchParams.dataInicio ?? ''} className="mt-1 border border-gray-300 rounded-md px-2 py-1.5 text-sm" />
  </div>
  <div>
    <label className="block text-xs font-medium text-gray-600">Data fim</label>
    <input type="date" name="dataFim" defaultValue={searchParams.dataFim ?? ''} className="mt-1 border border-gray-300 rounded-md px-2 py-1.5 text-sm" />
  </div>
  ```

### `src/app/[slug]/admin/filtros/demandas/page.tsx` e
`src/app/[slug]/mobilizador/filtros/demandas/page.tsx` (modificados)

- `filtros: FiltrosDemandasParams` ganha `dataInicio: searchParams.dataInicio` e
  `dataFim: searchParams.dataFim`.
- `<DemandasFiltro>` ganha `dashboardHref={`/${params.slug}/admin/dashboard`}` (ou
  `/mobilizador/dashboard`).

### `src/app/api/[slug]/filtros/demandas/exportar/route.ts` (modificado)

`filtros: FiltrosDemandasParams` ganha `dataInicio: sp.get('dataInicio') ?? undefined` e
`dataFim: sp.get('dataFim') ?? undefined` — sem isso, exportar com período ativo ignoraria o
filtro silenciosamente (traria demandas fora do período no PDF/Excel).

### `src/app/[slug]/admin/dashboard/page.tsx` e
`src/app/[slug]/mobilizador/dashboard/page.tsx` (modificados)

- Quando `searchParams.filtroDemandas === '1'`:
  ```ts
  const filtroDemandas = buildWhereDemandas(
    gabinete.id,
    {
      areaId: searchParams.areaId,
      status: searchParams.status as 'atendida' | 'nao_atendida' | 'pendente' | undefined,
      dataInicio: searchParams.dataInicio,
      dataFim: searchParams.dataFim,
    },
    /* responsavelId, só no mobilizador */ pessoa.id
  )
  const wherePessoas = buildWherePessoas(gabinete.id, filtrosPessoas, idsRede, filtroDemandas)
  ```
  (No admin, sem `responsavelId` — vê solicitantes de qualquer demanda do gabinete. No
  mobilizador, `responsavelId: pessoa.id` — só demandas em que ele é responsável, mesmo escopo já
  aplicado hoje na aba Demandas dele.)
- Resolve o nome da área ativa pra badge (mesmo padrão de `segmentoAtivo`/`profissaoAtiva` já
  existente):
  ```ts
  searchParams.areaId
    ? prisma.areaDemanda.findFirst({ where: { id: searchParams.areaId, gabineteId: gabinete.id }, select: { nome: true } })
    : Promise.resolve(null)
  ```
- Passa `areaAtiva` pro `<DashboardConteudo>`.
- `idsRede` e `filtroDemandas` nunca coexistem na prática (ver "Fora de escopo"), mas o código não
  precisa impedir explicitamente — só um dos dois normalmente vem preenchido por vez, dependendo
  de qual botão de navegação foi usado.

### `src/app/[slug]/admin/dashboard/DashboardConteudo.tsx` (modificado)

- Novo prop opcional `areaAtiva?: { nome: string } | null`.
- Tipo `FiltroExibivel` ganha um campo opcional pra suportar badge que limpa mais de um parâmetro
  de uma vez:
  ```ts
  type FiltroExibivel = { chave: string; label: string; camposLimpar?: string[] }
  ```
  E o href do `×` de cada badge passa a usar `f.camposLimpar ?? [f.chave]` em vez de `[f.chave]`
  diretamente.
- Novos blocos no array `filtrosAtivosExibiveis` (depois do bloco de `redeDeId` já existente):
  ```ts
  const STATUS_DEMANDA_LABEL: Record<string, string> = { pendente: 'Pendente', atendida: 'Atendida', nao_atendida: 'Não atendida' }
  const formatarDataISOParaBR = (iso: string) => iso.split('-').reverse().join('/')

  if (searchParams.filtroDemandas === '1') {
    const temSubFiltro = Boolean(searchParams.areaId || searchParams.status || searchParams.dataInicio || searchParams.dataFim)
    filtrosAtivosExibiveis.push({
      chave: 'filtroDemandas',
      label: temSubFiltro ? 'Demandas: Solicitantes filtrados' : 'Demandas: Todos os solicitantes',
      camposLimpar: ['filtroDemandas', 'areaId', 'status', 'dataInicio', 'dataFim'],
    })
  }
  if (searchParams.areaId) {
    filtrosAtivosExibiveis.push({ chave: 'areaId', label: `Área: ${areaAtiva?.nome ?? searchParams.areaId}` })
  }
  if (searchParams.status) {
    filtrosAtivosExibiveis.push({ chave: 'status', label: `Status: ${STATUS_DEMANDA_LABEL[searchParams.status] ?? searchParams.status}` })
  }
  if (searchParams.dataInicio || searchParams.dataFim) {
    const label = searchParams.dataInicio && searchParams.dataFim
      ? `Período: ${formatarDataISOParaBR(searchParams.dataInicio)} a ${formatarDataISOParaBR(searchParams.dataFim)}`
      : searchParams.dataInicio
        ? `Período: a partir de ${formatarDataISOParaBR(searchParams.dataInicio)}`
        : `Período: até ${formatarDataISOParaBR(searchParams.dataFim!)}`
    filtrosAtivosExibiveis.push({ chave: 'periodoDemanda', label, camposLimpar: ['dataInicio', 'dataFim'] })
  }
  ```
  Note que `camposLimpar` da badge-base **não inclui `regiaoId`** de propósito: região já tem sua
  própria badge/`×` independente (bloco já existente, reaproveitado sem mudança), então remover a
  badge-base de Demandas não deve mexer numa badge de outra origem.
- "Limpar tudo" passa a limpar também os campos de Demandas:
  ```tsx
  href={construirHref(dashboardHref, searchParams, {}, [...CAMPOS_FILTRO_PESSOAS, 'filtroDemandas', ...CAMPOS_FILTRO_DEMANDAS])}
  ```

## Tratamento de erro / casos de borda

- **`areaId`/`regiaoId` de outro gabinete ou inexistente**: `buildWhereDemandas`/consultas de nome
  já são seguras (sempre `gabineteId` no `where`) — resultado vazio ou nome não resolvido (mostra
  o id cru na badge, mesmo comportamento já aceito hoje pra `segmentoAtivo`/`profissaoAtiva`).
- **`filtroDemandas=1` sem nenhuma demanda no gabinete**: população vazia, Dashboard mostra os
  agregados zerados normalmente (mesmo comportamento de qualquer filtro sem resultado).
- **Interação com a seção "Demandas do mês" do Dashboard**: essa seção já é filtrada por
  `solicitante: wherePessoas` (mecanismo pré-existente, não criado por este spec) — então, quando
  `filtroDemandas=1` estiver ativo, a pizza "Demandas do mês" fica **duplamente** restrita: pelo
  mês corrente E por "o solicitante também aparece na população filtrada por Demandas". Efeito
  colateral esperado da arquitetura existente (população cascateia pra tudo), não um bug novo —
  vale um teste manual pra confirmar que os números fazem sentido, mas não precisa de tratamento
  especial.
- **`dataInicio` depois de `dataFim`** (intervalo invertido): comportamento igual ao que já existe
  em `/admin/demandas` hoje (nenhuma validação — Prisma simplesmente não encontra nada, já que
  `gte` > `lte` não bate com nenhuma linha). Não é regressão, é o padrão já aceito.

## Testes

- `src/lib/__tests__/filtros-demandas.test.ts` (estendido, TDD): novos casos pra `criadoEm` —
  só `dataInicio` (`gte` presente, `lte` ausente), só `dataFim` (`lte` presente, `gte` ausente),
  os dois juntos, nenhum dos dois (sem `criadoEm` no where).
- Sem teste automatizado para `buildWherePessoas` além do que já existe (função pura, mas o novo
  parâmetro é só "passa pra frente" — não tem lógica condicional nova que valha um caso de teste
  dedicado além de "com `filtroDemandas` populado, `where.demandasSolicitadas.some` bate com o
  valor passado").
- Sem teste automatizado dos componentes visuais (`VisualizarDadosGeraisDemandasButton`, badges no
  Dashboard, inputs de data) — mesmo padrão já aceito no projeto.
- Verificação manual (gabinete real):
  - Aba Demandas, admin: filtrar por status "Atendida" → botão aparece (já aparecia, sem filtro
    nenhum também) → clicar leva ao Dashboard com badge "Demandas: Solicitantes filtrados" +
    "Status: Atendida", números batendo com quem tem demanda atendida.
  - Combinar Área + Status + período (mês inteiro) → badges correspondentes, todas removíveis
    independentemente.
  - Sem nenhum filtro na aba Demandas → clicar no botão mesmo assim → Dashboard mostra badge
    "Demandas: Todos os solicitantes" e a população é "todo mundo que já fez alguma demanda".
  - Remover só a badge de Status → Área e Período continuam ativos.
  - "Limpar tudo" → volta à visão geral (sem nenhuma badge de Demandas nem de Pessoas).
  - Exportar PDF/Excel na aba Demandas com período ativo → conferir que as linhas exportadas
    realmente respeitam o intervalo de datas.
  - Repetir o fluxo no mobilizador (`/mobilizador/filtros/demandas` → botão →
    `/mobilizador/dashboard`), confirmando que só entram demandas em que ele é responsável.
