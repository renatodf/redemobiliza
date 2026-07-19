# Banco de Talentos — Combo Box de Área e Busca por Nome — Spec

## Contexto

Melhorias na tela `/[slug]/admin/filtros/banco-talentos` (componente `src/app/[slug]/admin/filtros/BancoTalentosFiltro.tsx`), pedidas pelo usuário depois da importação Izalci trazer 531 currículos reais pro Banco de Talentos.

## Problema 1: lista de botões de área ocupa muito espaço

Hoje, `BancoTalentosFiltro.tsx:82-101` mostra **todas** as `AreaColocacao` do gabinete como botões cinza clicáveis lado a lado, sempre visíveis. Com mais áreas cadastradas, essa lista fica grande e difícil de escanear.

## Solução: combo box digitável + filtro, multi-seleção

Substituir a lista de botões sempre-visível por um campo de texto (`<input>`) com um dropdown que filtra as opções conforme o usuário digita. Clicar numa opção do dropdown adiciona ela à seleção. As áreas já selecionadas continuam aparecendo como botões cinza clicáveis logo abaixo do campo — igual ao comportamento visual de hoje — só que agora só mostram as **selecionadas**, não todas. Clicar num botão cinza já selecionado remove ele da seleção (mesmo `toggleAreaFiltro` que já existe, reaproveitado sem mudança de assinatura).

Novo componente: `src/components/admin/ComboBoxMultiplo.tsx` — sem dependência de biblioteca externa (o projeto não usa nenhuma lib de combobox hoje; todos os componentes de UI são feitos à mão com Tailwind, mesmo padrão de `Pagination`, `GraficoPizza`, etc.).

```typescript
type OpcaoComboBox = { id: string; label: string }

export function ComboBoxMultiplo({
  opcoes,
  selecionados,
  onToggle,
  placeholder,
}: {
  opcoes: OpcaoComboBox[]
  selecionados: Set<string>
  onToggle: (id: string) => void
  placeholder: string
}) {
  // input de texto controla um estado local `busca`; lista de opções
  // filtradas por `label.toLowerCase().includes(busca.toLowerCase())`,
  // excluindo as já selecionadas; dropdown fecha ao clicar fora
  // (useRef + listener de click no document) ou ao selecionar uma opção;
  // input limpa depois de cada seleção.
}
```

`BancoTalentosFiltro.tsx` passa a usar esse componente no lugar do bloco de botões (linhas 82-101), mantendo `areasFiltro` (o `Set<string>` que já existe) como fonte de verdade — o combo box só adiciona à seleção, os botões cinza abaixo dele (reaproveitando o JSX de botão que já existe hoje) continuam removendo.

## Problema 2: não dá pra buscar uma pessoa específica pelo nome

Hoje não existe nenhum campo de busca textual na tela — pra achar o currículo de alguém, é preciso rolar a lista inteira.

## Solução: campo de busca por nome, mesmo padrão dos outros filtros

Novo campo `<input type="text" name="nome">` no formulário de filtro já existente (`BancoTalentosFiltro.tsx:80-138`), ao lado de Prioridade/PcD/Região. Submetido via GET junto com os outros campos — mesmo mecanismo, sem JavaScript novo pra isso (o filtro já é feito recarregando a página com query params).

Servidor: `buildWhereBancoTalentos` (`src/lib/filtros-banco-talentos.ts`) ganha um parâmetro opcional `nome?: string`, que filtra `pessoa.nome` com `contains` case-insensitive (`{ contains: nome, mode: 'insensitive' }`), mesmo padrão de busca textual já usado em outras telas do projeto.

```typescript
export type FiltrosBancoTalentosParams = {
  areaIds?: string[]
  prioridade?: string
  isPcd?: 'sim' | 'nao'
  regiaoId?: string
  nome?: string  // novo
}
```

A listagem (`talentos`, já buscada em `src/app/[slug]/admin/filtros/banco-talentos/page.tsx`) não muda de formato — mesmas colunas, mesma paginação — só o `where` fica mais restrito.

## Fora de escopo

- Busca por nome em outras telas (Pessoas, Demandas) — só Banco de Talentos, por enquanto.
- Qualquer mudança no `ComboBoxMultiplo` pra ser genérico/reutilizável em outros filtros do sistema (ex: Região, Segmento) — construído especificamente pra essa tela; generalizar fica pra quando/se outra tela precisar do mesmo padrão.
