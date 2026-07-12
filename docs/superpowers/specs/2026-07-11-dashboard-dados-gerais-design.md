# Dashboard "Dados Gerais"

**Data:** 2026-07-11
**Status:** aprovado

---

## Contexto

Pendência registrada no HANDOFF desde a sessão anterior: "usuário mencionou (conversa, não spec) querer um dashboard como nova tela inicial do sistema, com o botão 'Usuários' ficando só com a listagem atual — não especificado nem planejado ainda."

Durante o brainstorm, descobriu-se que **grande parte disso já existe**:
- `/admin/dashboard` já é um dashboard completo (construído em 07/07/2026): cards de total/novas pessoas/mobilizadores/colaboradores, gráfico de barras de Demandas do mês (clicável), pessoas por segmento, ranking de mobilizadores, pessoas por origem, pessoas por região.
- O menu lateral do admin já tem "Dados Gerais" (→ `/admin/dashboard`) separado de "Usuários" (→ `/admin/pessoas`, só a listagem) — exatamente a separação que a pendência pedia.
- **Falta só**: (1) um bug real no dashboard atual, (2) ele não é a tela inicial após login, (3) o mobilizador não tem equivalente, e (4) o usuário trouxe um mockup (CSS de um design antigo) pedindo elementos visuais novos — mapa por região, gráficos de pizza com clique-para-filtrar.

### Bug encontrado (corrigir independente do resto)

`src/app/[slug]/admin/dashboard/page.tsx` — toda consulta de `Pessoa` (contagens, `groupBy`, `_count` em `Segmento`/`Regiao`) **não filtra `deletedAt: null`**, exceto a única consulta de `Demanda` (linha 155, que já filtra corretamente). Isso significa que pessoas com soft-delete estão sendo contadas em "Total pessoas", "Novas no período", "Mobilizadores", "Colaboradores", "Pessoas por segmento/região/origem" — em produção, agora, pra qualquer gabinete que já excluiu alguém.

## Escopo

1. Corrigir o bug de `deletedAt` acima.
2. `/admin` (redirect atual) e o fluxo de login passam a levar pra `/admin/dashboard` em vez de `/admin/pessoas`. Mesma coisa pro mobilizador: `/mobilizador/dashboard` (novo) vira a home.
3. Adicionar ao dashboard existente (sem substituir nada): cards de região, e 5 gráficos de pizza (Demandas/Sexo/Faixa etária/Escolaridade/Religião), todos com clique-para-filtrar.
4. Estender a aba Pessoas da Central de Filtros com 2 filtros novos: Escolaridade e Religião (necessários pro clique-para-filtrar dessas duas pizzas funcionar).
5. Criar `/mobilizador/dashboard`, mesma estrutura, escopado à sub-rede.

**Fora de escopo** (decisões explícitas do usuário durante o brainstorm):
- Mapa geográfico real com pin por pessoa/CPF — o usuário descreveu um sistema anterior que fazia isso, e quer retomar essa ideia **no futuro**, quando a captura de endereço via Demanda existir. Registrar como pendência futura, não construir agora. Os "cards de região" desta spec substituem essa necessidade por ora (mesmo dado — quantidade por região — sem posicionamento geográfico).
- Normalização de grafia em Religião/Escolaridade (texto livre continua texto livre).
- Barra de filtro própria no dashboard (usa parâmetros de URL compartilhados com a Central de Filtros, não uma UI de filtro duplicada).
- Redesenho do menu lateral/topo (o mockup trazido tinha itens como "Tags"/"Formulários"/"Fila"/busca/notificações que não existem como funcionalidades no sistema — mantém o shell atual como está).
- Fix do item "Banco de Talentos" no Sidebar (ainda marcado `emBreve: true` mesmo já estando implementado como aba da Central de Filtros) — pendência separada, não faz parte desta feature.

## Estrutura da página `/admin/dashboard` (nova ordem)

1. Seletor de período (já existe: hoje/7dias/30dias/personalizado) — mantém.
2. **Novo:** grade de cards por Região — um card por `Regiao` ativa do gabinete, nome + contagem de pessoas.
3. **Novo:** 5 gráficos de pizza lado a lado — Demandas, Sexo, Faixa etária, Escolaridade, Religião.
4. Os 4 cards de estatística existentes (Total pessoas, Novas no período, Mobilizadores, Colaboradores) — mantém, com o bug de `deletedAt` corrigido.
5. Gráfico de barras de Demandas do mês (já existe, `GraficoDemandas`) — mantém.
6. Pessoas por segmento, Ranking de mobilizadores, Pessoas por origem (já existem) — mantém.

## Componente `GraficoPizza` (novo, reaproveitável pros 5 casos)

```typescript
type FatiaPizza = {
  chave: string
  label: string
  valor: number
  cor: string
  href: string
}
```

Renderizado com CSS `conic-gradient` — sem biblioteca nova, mesmo espírito do `GraficoDemandas` atual (que já é feito à mão com `div`s, sem lib de gráfico). Cada fatia é um link (`<a href={fatia.href}>`). Legenda sempre visível ao lado — identidade nunca só por cor (orientação do skill de dataviz do projeto).

### Mapeamento de clique de cada gráfico

| Gráfico | Destino ao clicar numa fatia |
|---|---|
| Demandas (4 status: atendida/não atendida/pendente/expirada) | `/admin/demandas?status=X&dataInicio=...&dataFim=...` (já existe — reaproveita exatamente o padrão do `GraficoDemandas` atual, que já é clicável. Decisão explícita: vai pra `/admin/demandas`, não pra `/admin/filtros/demandas`, porque essa segunda agrupa `pendente`+`expirada` num só valor — os 4 status aqui precisam ficar separados) |
| Sexo | `/admin/filtros?genero=X` (Central de Filtros, já suporta) |
| Faixa etária | `/admin/filtros?idadeMin=X&idadeMax=Y` (Central de Filtros, já suporta) |
| Escolaridade | `/admin/filtros?escolaridade=X` (**filtro novo**, ver seção própria abaixo) |
| Religião | `/admin/filtros?religiao=X` (**filtro novo**, ver seção própria abaixo) |
| Card de região | `/admin/filtros?regiaoId=X` (Central de Filtros, já suporta) |

### Cores

- **Demandas**: reaproveita as cores de status já reservadas no sistema (`statusDemandaPill`/`GraficoDemandas` — verde=atendida, vermelho=não atendida, amarelo=aberta, laranja=expirada). Cor de status é reservada, nunca reciclada pra outra dimensão.
- **Sexo/Faixa etária/Escolaridade/Religião**: paleta categórica fixa, validada com `scripts/validate_palette.js` do skill de dataviz do projeto antes de fechar os hex exatos (passo da fase de implementação, não fixado nesta spec).

## Faixas etárias (novo helper)

`src/lib/faixa-etaria.ts`:

```typescript
export function calcularFaixaEtaria(idade: number): string {
  if (idade < 25) return '16-24'
  if (idade < 35) return '25-34'
  if (idade < 45) return '35-44'
  if (idade < 60) return '45-59'
  return '60+'
}
```

Aplicado sobre `calcularIdade` (já existe em `src/lib/aniversario.ts`). Pessoas sem `nascimento` caem em "Não informado".

## Agrupamento de texto livre (Religião/Escolaridade)

Sem select de opções fixas — permanecem texto livre (decisão explícita, ver "Fora de escopo"). Pro gráfico: os 5 valores mais frequentes (`groupBy` + `orderBy count desc` + `take: 5`) viram fatias próprias; o resto soma numa fatia "Outros"; `null`/string vazia vira "Não informado" (não entra em "Outros"). Sem normalização de grafia — "Católica" e "católica" contam como valores distintos.

## Filtro do dashboard via URL (sem barra de filtro própria)

`/admin/dashboard` passa a aceitar os mesmos parâmetros de query que a Central de Filtros já usa: `regiaoId`, `genero`, `idadeMin`/`idadeMax`, `segmentoId`, `escolaridade`, `religiao`. Quando presentes, **todos** os cards/gráficos da tela — não só os novos, também os 4 cards de estatística e as seções já existentes (segmento/origem/ranking) — passam a refletir esse filtro. Isso implica estender `buildWherePessoas` (`src/lib/filtros-pessoas.ts`, já existe) para aceitar `escolaridade`/`religiao` como novos campos de `FiltrosPessoasParams`.

Não existe UI de filtro própria no dashboard — o mecanismo é: usuário filtra na Central de Filtros, clica num link que leva de volta ao dashboard com os mesmos parâmetros (ou navega manualmente), e a tela reflete o filtro. Ao remover os parâmetros da URL (ex: link "Limpar filtro" apontando pra `/admin/dashboard` sem query), volta a mostrar os dados gerais.

## Extensão da Central de Filtros (aba Pessoas)

Dois filtros novos em `PessoasFiltro.tsx` e `filtros-pessoas.ts`:
- `escolaridade` — `<select>` populado com os valores distintos já cadastrados no gabinete (`prisma.pessoa.findMany({ distinct: ['escolaridade'] })` ou equivalente), já que é texto livre, não um enum fixo.
- `religiao` — mesmo padrão.

Nenhuma mudança de comportamento nos filtros já existentes (aniversário, sexo, região, idade, profissão, segmento).

## Mobilizador — `/mobilizador/dashboard` (novo)

Mesma estrutura do admin, escopado à sub-rede via `coletarSubRedeIds` (já existe, mesmo usado na Central de Filtros do mobilizador). Demandas do mobilizador só as que ele é `responsavelId` (mesmo critério já usado em `/mobilizador/demandas` e na Central de Filtros).

Vira a nova tela inicial (redirect pós-login). "Início" (listagem da rede) ganha seu próprio item de menu, ao lado de "Dados Gerais" — mesma separação já existente no admin entre "Dados Gerais" e "Usuários".

## Testes

- `faixa-etaria.test.ts` (novo, TDD): cada faixa, casos de limite (24/25, 34/35, 44/45, 59/60), idade nula.
- `filtros-pessoas.test.ts` (já existe): novos casos de teste para os filtros `escolaridade`/`religiao` adicionados a `buildWherePessoas`.
- Sem teste automatizado para as páginas de dashboard em si (Server Components de orquestração — mesmo padrão já aceito no projeto pras páginas da Central de Filtros).

## Casos de borda

- Gabinete sem nenhuma pessoa: gráficos/cards mostram estado vazio, sem quebrar (mesmo tratamento de lista vazia já usado no dashboard atual pras seções existentes).
- Região com 0 pessoas: o card aparece mesmo assim, mostrando "0" — não some da grade.
- Todo mundo sem religião/escolaridade cadastrada: vira uma única fatia "Não informado", sem gerar uma fatia "Outros" vazia ao lado.
- Filtro via URL com um `regiaoId`/`segmentoId` de outro gabinete: mesmo raciocínio já usado nos filtros de Pessoas — como o `where` sempre combina `gabineteId`, um ID de outro tenant só resulta em zero resultados, nunca vazamento.
