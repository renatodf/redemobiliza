# Visualizar Dados Gerais a partir de um filtro — design

> Spec gerada em 2026-07-14, a partir de brainstorming em texto.

## Contexto e motivação

O Dashboard "Dados Gerais" (`DashboardConteudo.tsx`, compartilhado entre admin e mobilizador)
já aceita, via parâmetros de URL, boa parte dos mesmos filtros que a Central de Filtros — aba
Pessoas (`buildWherePessoas` é a mesma função usada nos dois lugares). O que falta é a parte de
navegação: hoje não existe um caminho de volta de "estou vendo uma lista filtrada" para "quero
ver o resumo agregado (pizzas, mapa, contagens) desse mesmo recorte".

O pedido: sempre que um filtro de Pessoas estiver ativo — seja pela Central de Filtros, seja
entrando na rede de um mobilizador específico na tela de Usuários — um botão "Visualizar Dados
Gerais" leva para o Dashboard já filtrado pelo mesmo recorte. E no Dashboard, quando algum
filtro estiver ativo, um "Limpar filtro" permite voltar à visão geral sem filtro.

Investigação prévia encontrou duas lacunas que este spec também fecha (a segunda, parcialmente):
- `profissaoId` existe na Central de Filtros mas nunca foi passado para o Dashboard — só faltava
  uma linha, mesmo padrão dos outros campos.
- `idadeMin`/`idadeMax`/`aniversario` são aceitos pelo Dashboard mas não têm efeito real nos
  números agregados (contagens/pizzas usam `prisma.count`/`groupBy`, que não expressam "calculado
  a partir da data de nascimento"; esse cálculo só acontece hoje via `aplicarFiltrosPosConsulta`,
  aplicado em cima da lista de pessoas da Central de Filtros, nunca chamado pelo Dashboard).
  **Decisão do usuário:** fica de fora desta rodada — corrigir isso exigiria reestruturar as
  consultas agregadas do Dashboard (buscar registros brutos e agregar em código, em vez de usar
  `groupBy` do Prisma), esforço maior que não faz parte deste pedido.

## Escopo

1. **Botão "Visualizar Dados Gerais"** em dois pontos, ambos admin e mobilizador:
   - Central de Filtros → aba Pessoas (`PessoasFiltro.tsx`, componente compartilhado por
     `/admin/filtros` e `/mobilizador/filtros`).
   - Tela de Usuários → visão de rede de um mobilizador específico (`/admin/pessoas?rede=...`,
     só existe no admin — mobilizador não tem essa tela).
2. **Botão "Limpar filtro"** no Dashboard (`DashboardConteudo.tsx`), visível quando qualquer
   filtro reconhecido estiver ativo.
3. **Badges individuais** por filtro ativo, no Dashboard — cada um removível separadamente, mais
   um "Limpar tudo".
4. **Novo parâmetro `redeDeId`** no Dashboard e na Central de Filtros — filtra pela sub-rede
   completa (recursiva) de um mobilizador específico, reaproveitando `coletarSubRedeIds` (já
   existe, já é usado para escopar o Dashboard do próprio mobilizador).
5. **Fix pequeno**: `profissaoId` passa a ser aplicado de verdade pelo Dashboard (hoje só existe
   na Central de Filtros).
6. Quando `redeDeId` estiver ativo, mostrar o nome do mobilizador de forma visível (não só um
   parâmetro invisível na URL) — no badge da lista de filtros ativos (item 3) e no próprio botão
   de origem, na tela de Usuários.

## Fora de escopo

- Idade/aniversário nos números agregados do Dashboard (decisão do usuário, ver acima).
- Botão "Visualizar Dados Gerais" nas abas Demandas, Banco de Talentos e Cadastros da Central de
  Filtros — só a aba Pessoas, porque é a única que o Dashboard sabe interpretar hoje.
- Uma forma de escolher `redeDeId` diretamente de dentro da Central de Filtros (ex: um campo
  novo tipo "Região" para escolher um mobilizador). O parâmetro é sempre originado da tela de
  Usuários; a Central de Filtros só precisa entender e mostrar esse filtro quando ele já vier na
  URL — não precisa de UI própria para criá-lo.
- Mudar o destino dos cliques que já existem hoje (fatia de pizza, pin do mapa, item da lista de
  região no Dashboard) — eles continuam levando para a Central de Filtros, sem mudança de
  comportamento. Como já preservam todos os parâmetros da URL atual, um `redeDeId` ativo
  atravessa esse clique de graça, sem nenhuma mudança de código nesses componentes.
- Incluir o próprio mobilizador (não só a sub-rede dele) na contagem de `redeDeId` — mantém o
  mesmo comportamento de `coletarSubRedeIds` já usado no Dashboard do mobilizador (exclui a
  própria pessoa).

## O que conta como "filtro ativo"

Um filtro é considerado ativo quando um destes parâmetros está presente na URL:
`regiaoId`, `genero`, `profissaoId`, `segmentoId`, `escolaridade`, `religiao`, `redeDeId`.

`periodo` (Hoje/7 dias/30 dias) **não** entra nessa lista — é um eixo independente do Dashboard,
não uma "condição de filtro" no sentido deste spec. "Limpar filtro" nunca mexe em `periodo`.

`aniversario`/`idadeMin`/`idadeMax` também não entram (fora de escopo, ver acima) — mesmo que
estejam na URL, não contam como filtro ativo para efeito do botão/badges desta feature (evita
prometer um filtro que não é aplicado de verdade nos números).

## Modelo de dados

Nenhuma mudança de schema. Todo o trabalho é em cima de parâmetros de URL e das funções
`buildWherePessoas`/`coletarSubRedeIds` já existentes.

## Componentes

### `src/lib/filtros-ativos.ts` (novo)

Funções puras, reaproveitadas pelos três lugares que precisam saber "quais filtros estão
ativos" (Central de Filtros, tela de Usuários, Dashboard):

```ts
export type FiltroAtivo = { chave: string; label: string }

const CAMPOS_FILTRO_PESSOAS = ['regiaoId', 'genero', 'profissaoId', 'segmentoId', 'escolaridade', 'religiao', 'redeDeId'] as const

export function temFiltroAtivo(searchParams: Record<string, string | undefined>): boolean {
  return CAMPOS_FILTRO_PESSOAS.some((campo) => Boolean(searchParams[campo]))
}

export function construirHrefSemFiltros(
  baseHref: string,
  searchParams: Record<string, string | undefined>,
  manter: string[] = []
): string {
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(searchParams)) {
    if (v && manter.includes(k)) qs.set(k, v)
  }
  const query = qs.toString()
  return query ? `${baseHref}?${query}` : baseHref
}
```

`temFiltroAtivo` decide se o botão "Visualizar Dados Gerais" (na Central de Filtros / tela de
Usuários) e o "Limpar filtro" (no Dashboard) aparecem. `construirHrefSemFiltros` monta o link do
"Limpar filtro", que deve preservar `periodo` mas remover todo o resto (`manter: ['periodo']`).

A lista de badges individuais (Bloco 3) é montada onde os nomes já estão disponíveis (região,
segmento, mobilizador da rede, etc. — ver componente do Dashboard abaixo), não dentro deste lib,
que só lida com chaves/valores brutos de URL, não com os nomes legíveis.

### `src/lib/rede.ts` (modificado)

Nenhuma mudança na função `coletarSubRedeIds` em si. Só passa a ser importada em mais dois
lugares (Central de Filtros e Dashboard do admin) além do Dashboard/Filtros do mobilizador, que
já a usa.

### `src/app/[slug]/admin/filtros/VisualizarDadosGeraisButton.tsx` (novo, compartilhado
admin/mobilizador)

Componente pequeno, client-safe mas sem necessidade de `'use client'` (é só um link condicional):

```tsx
export default function VisualizarDadosGeraisButton({
  dashboardHref,
  searchParams,
  corPrimaria,
}: {
  dashboardHref: string
  searchParams: Record<string, string | undefined>
  corPrimaria: string
}) {
  if (!temFiltroAtivo(searchParams)) return null

  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(searchParams)) {
    if (v && k !== 'page' && k !== 'sort' && k !== 'order' && k !== 'path') qs.set(k, v)
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

Mesmo estilo visual dos botões "Exportar PDF"/"Exportar Excel" já existentes em
`PessoasFiltro.tsx` (`text-[11px] px-2.5 py-1`, fundo `corPrimaria`).

### `src/app/[slug]/admin/filtros/PessoasFiltro.tsx` (modificado)

- Novo prop `dashboardHref: string` (`/${slug}/admin/dashboard` ou `/${slug}/mobilizador/dashboard`,
  passado pela página pai).
- Renderiza `<VisualizarDadosGeraisButton dashboardHref={dashboardHref} searchParams={searchParams} corPrimaria={corPrimaria} />`
  ao lado dos botões de exportar (mesma linha, `flex gap-2`).
- Sem mudança de layout além dessa — o botão "Limpar filtro" que já existe ali (linha 133-138 do
  arquivo atual) continua exatamente como está (ele limpa o **formulário**, é um botão diferente
  do "Limpar filtro" do Dashboard, que limpa a **URL de destino**; nomes iguais, lugares e
  propósitos diferentes — ambos fazem sentido no contexto de cada tela).

### `src/app/[slug]/admin/filtros/page.tsx` e `src/app/[slug]/mobilizador/filtros/page.tsx`
(modificados)

- Passam `dashboardHref` para `PessoasFiltro` (`/${slug}/admin/dashboard` ou
  `/${slug}/mobilizador/dashboard`).
- **Admin**: `FiltrosPessoasParams` ganha `redeDeId: searchParams.redeDeId`. Se presente, resolve
  os ids via `coletarSubRedeIds` (tratando `redeDeId === 'raiz'` como o mesmo caso especial já
  usado na tela de Usuários — pessoas com `indicadoPorId: null`) e passa como 3º argumento de
  `buildWherePessoas`, substituindo o array vazio/ausente atual.
- **Mobilizador**: já passa `idsRede` (a própria sub-rede) como 3º argumento — `redeDeId` não se
  aplica aqui (mobilizador não escolhe a rede de outra pessoa), não precisa de mudança nesse
  arquivo além do `dashboardHref`.

### `src/app/[slug]/admin/pessoas/page.tsx` (modificado)

Quando `rede` (ou `rede=raiz`) estiver presente, mostra `VisualizarDadosGeraisButton` próximo ao
cabeçalho "Rede de Fulano" / "Rede Raiz" (linha ~146-153 do arquivo atual), com
`searchParams={{ redeDeId: rede === 'raiz' ? 'raiz' : rede }}` — **não** repassa `path`/`q`/`sort`
(que são específicos da navegação em cascata desta tela, sem equivalente no Dashboard).

### `src/app/[slug]/admin/dashboard/page.tsx` e
`src/app/[slug]/mobilizador/dashboard/page.tsx` (modificados)

- **Admin**: `filtrosPessoas` ganha `profissaoId: searchParams.profissaoId` (fix da lacuna) e
  `redeDeId`. Se `redeDeId` vier na URL, resolve via `coletarSubRedeIds`/caso `raiz`, igual à
  Central de Filtros, e passa como 3º argumento de `buildWherePessoas`.
- **Mobilizador**: sem `redeDeId` (não se aplica) — só ganha o fix de `profissaoId`, igual ao
  admin.

### `src/app/[slug]/admin/dashboard/DashboardConteudo.tsx` (modificado)

Nova seção logo abaixo do seletor de período (Hoje/7 dias/30 dias), visível só quando
`temFiltroAtivo(searchParams)`:

- Uma badge por filtro ativo reconhecido, com o **nome legível** (não o id cru) e um `×` que
  remove só aquele parâmetro específico da URL (recalcula a query sem essa chave, mantém as
  outras + `periodo`). Nomes vêm de props já recebidas ou novas, dependendo do campo:
  - `regiaoId` → nome já vem via `regioes` (prop existente).
  - `segmentoId` → precisa de um novo prop `segmentoAtivo?: { id: string; nome: string }`
    (nome vindo de uma query pontual no `page.tsx`, já que `segmentosComContagem` de hoje não
    inclui o id do segmento).
  - `profissaoId` → novo prop `profissaoAtiva?: { id: string; nome: string }`, mesma lógica.
  - `genero`/`escolaridade`/`religiao` → o próprio valor já é o label (ex: "feminino",
    "Ensino Médio").
  - `redeDeId` → novo prop `redeAtiva?: { id: string; nome: string } | 'raiz'`, resolvido no
    `page.tsx` (nome do mobilizador, ou "Rede Raiz").
- Um botão "Limpar tudo" (usa `construirHrefSemFiltros(dashboardHref, searchParams, ['periodo'])`).
- Layout: linha de chips com `flex flex-wrap gap-2`, cada chip um `<span>` com fundo cinza claro
  e um botão `×` interno (link, não precisa de client component — cada `×` é um `<a href>` para
  a URL recalculada sem aquele parâmetro).

## Tratamento de erro / casos de borda

- **`redeDeId` aponta para uma pessoa de outro gabinete ou inexistente**: `coletarSubRedeIds`
  já é seguro aqui — a CTE já filtra por `gabineteId`, então um id de outro tenant simplesmente
  não bate com nenhuma linha e retorna lista vazia (mesmo comportamento de proteção que a
  função já tem hoje, reaproveitado sem mudança).
- **`redeDeId=raiz` mas não há ninguém sem indicador**: lista vazia, Dashboard mostra os
  agregados zerados normalmente (mesmo comportamento de qualquer filtro sem resultado).
- **Filtro ativo mas nenhuma badge reconhece o campo** (não deveria acontecer, já que a lista de
  campos é a mesma usada por `temFiltroAtivo`): se algum dia surgir um novo campo em
  `CAMPOS_FILTRO_PESSOAS` sem badge correspondente, o botão "Visualizar Dados Gerais"/"Limpar
  filtro" ainda aparece (comportamento correto), só a badge individual daquele campo específico
  não aparece — degradação aceitável, não é um estado de erro.

## Testes

- `src/lib/__tests__/filtros-ativos.test.ts` (novo, TDD): `temFiltroAtivo` — nenhum filtro
  (false), um filtro reconhecido (true), só `periodo` (false), só `aniversario`/`idadeMin` (false,
  por decisão de escopo), `redeDeId` presente (true). `construirHrefSemFiltros` — sem filtro
  nenhum retorna `baseHref` sem `?`, com filtros mantém só o que está em `manter`, preserva
  `periodo` quando pedido.
- Sem teste automatizado dos componentes visuais (`VisualizarDadosGeraisButton`, badges no
  Dashboard) — mesmo padrão já aceito no projeto para componentes de UI.
- Verificação manual (gabinete real):
  - Aplicar um filtro de região na Central de Filtros → botão "Visualizar Dados Gerais" aparece,
    leva pro Dashboard com os mesmos números batendo com o que a lista mostrava.
  - Entrar na rede de um mobilizador na tela de Usuários → botão aparece, leva pro Dashboard
    mostrando só a sub-rede completa dele (inclusive indicados de indicados, não só o nível que
    estava sendo visto).
  - No Dashboard filtrado, clicar em "Limpar filtro" → volta pra visão geral, `periodo`
    preservado se estava em 7 dias/hoje.
  - No Dashboard filtrado por região + sexo, remover só a badge de sexo → região continua
    filtrando, sexo não.
  - No Dashboard filtrado, clicar numa fatia de pizza ou pin do mapa → cai na Central de Filtros
    com os dois filtros (o que já estava + o novo do clique) combinados.
  - Repetir o fluxo de Central de Filtros no mobilizador (`/mobilizador/filtros` →
    "Visualizar Dados Gerais" → `/mobilizador/dashboard`).
