# Mapa de pessoas por região no Dashboard — design

> Spec gerada em 2026-07-13, a partir de brainstorming com companion visual (protótipos
> iterados em `.superpowers/brainstorm/`, aprovados pelo usuário) sobre adicionar um mapa do
> Distrito Federal ao dashboard "Dados Gerais", com balões por região mostrando quantidade de
> pessoas, e tornar as fatias dos gráficos de pizza existentes clicáveis.

## Contexto e motivação

O dashboard "Dados Gerais" (`src/app/[slug]/admin/dashboard/DashboardConteudo.tsx`, compartilhado
com o mobilizador) já mostra "Pessoas por região" como uma lista simples, com cada item linkando
pra Central de Filtros filtrada por aquela região. O usuário quer uma visualização mais visual —
um mapa do Distrito Federal com um balão por Região Administrativa, tamanho proporcional à
quantidade de pessoas, clicável. Também quer que as fatias dos 5 gráficos de pizza existentes
(Sexo, Faixa etária, Escolaridade, Religião, Demandas do mês) fiquem clicáveis diretamente no
círculo colorido, não só na legenda ao lado (que já é clicável hoje).

## Escopo

1. Novo componente de mapa do DF, com balões por região, ao lado da lista "Pessoas por região"
   já existente (lista **não é substituída**).
2. Mapa arrastável (pan) e com zoom (scroll do mouse + botões +/−), dentro de uma caixa
   retangular de altura fixa (~340px), largura ocupando todo o espaço disponível à direita da
   lista.
3. Os 5 gráficos de pizza existentes passam a ficar **abaixo** da seção mapa+lista (mudança de
   ordem, não de conteúdo).
4. `GraficoPizza.tsx` (componente compartilhado admin/mobilizador) ganha fatias clicáveis no
   próprio círculo, além da legenda que já é clicável.
5. Sem mudança de schema, sem consulta nova ao banco — reaproveita os dados já computados hoje
   pra lista de região e pras 5 pizzas.

## Fora de escopo

- Mapa interativo real (Google Maps/Leaflet/tiles geográficos) — decisão explícita do usuário,
  mapa é uma ilustração estática (SVG) com pan/zoom via CSS transform, sem serviço externo.
- Coordenadas geograficamente precisas das RAs — o contorno do DF e a posição de cada RA no SVG
  são aproximações visuais, não uma projeção cartográfica real.
- Suporte a estados fora do DF — a tabela de referência cobre só as Regiões Administrativas do
  Distrito Federal; gabinetes de outros estados simplesmente não terão balões no mapa (região
  sem match, ver abaixo), mas continuam vendo a lista normalmente.
- Mudança na Central de Filtros ou nas rotas de exportação — só o dashboard é afetado.

## Componentes

### `src/lib/regioes-df-mapa.ts` (novo)

Tabela fixa das Regiões Administrativas oficiais do Distrito Federal, cada uma com uma posição
aproximada `{ x: number; y: number }` em percentual, relativa ao viewBox do SVG do mapa (mesmo
sistema de coordenadas do protótipo aprovado: `viewBox="0 0 100 85"`, path do contorno
`M20,9 L70,7 L86,24 L80,54 L58,79 L28,77 L11,53 L14,24 Z`).

Exporta uma função pura `encontrarPosicaoRegiao(nome: string): { x: number; y: number } | null`
que casa o nome recebido contra a tabela, normalizando (lowercase, sem acento) antes de comparar —
sem match, retorna `null`.

### `src/components/MapaRegioesDF.tsx` (novo, client component)

Recebe a mesma lista que já alimenta "Pessoas por região" hoje
(`{ id, nome, contagem, href }[]`). Para cada região, chama `encontrarPosicaoRegiao(nome)`; sem
match, a região é ignorada no mapa (continua na lista ao lado, sem mudança).

- Renderiza o SVG do contorno do DF + um balão por região com match, usando `<a href>` quando
  `href` existir (mesmo padrão de link condicional já usado em `GraficoPizza`).
- Tamanho do balão: escala proporcional à `contagem`, calculada por uma função pura exportada
  do mesmo arquivo (`calcularTamanhoBalao(contagem: number, min: number, max: number): number`),
  clampada entre 17px e 34px (mesmo intervalo visual validado no protótipo).
- Pan (arrastar com o mouse) e zoom (scroll do mouse + botões +/− + botão "ver mapa inteiro") via
  `transform: translate(...) scale(...)` num wrapper interno, exatamente como testado e aprovado
  no protótipo (`mousedown`/`mousemove`/`mouseup` na caixa, `wheel` com `preventDefault`, zoom
  clampado entre 0.5x e 4x). Sem biblioteca nova — a interação inteira é CSS transform + listeners
  nativos.
- Container: altura fixa 340px, largura 100% do espaço disponível, `overflow: hidden`,
  `border-radius` e borda consistentes com o resto do dashboard.

### `src/components/GraficoPizza.tsx` (modificado)

Hoje o círculo é um único `<div>` com `background: conic-gradient(...)` — sem sub-elemento por
fatia, portanto sem como atribuir `href`/`onClick` a uma fatia específica.

Passa a renderizar um `<svg>` com um `<path>` de arco por fatia (mesmo cálculo de ângulo
acumulado — `inicio`/`fim` em graus — já usado hoje pra montar os stops do gradiente, convertido
pra coordenadas de arco SVG). Cada `<path>` vira um `<a href>` quando `f.href` existir (mesmo
padrão condicional já usado na legenda), preservando cor e proporção idênticas ao gradiente
atual. A legenda ao lado continua exatamente como está (já clicável).

Como este componente é compartilhado entre `admin/dashboard` e `mobilizador/dashboard`, a mudança
vale pros dois automaticamente — nenhuma das duas páginas precisa ser tocada além do reposicionamento
descrito abaixo.

### `src/app/[slug]/admin/dashboard/DashboardConteudo.tsx` (modificado)

- Seção "Pessoas por região" ganha o `MapaRegioesDF` ao lado da lista existente (lista à
  esquerda, mapa à direita, `flex` — mesma proporção validada no protótipo, lista com largura
  máxima menor, mapa ocupando o resto).
- As 5 chamadas a `<GraficoPizza />` (linhas 222-226 hoje) são movidas pra uma seção **abaixo**
  da seção mapa+lista — reordenação de JSX, sem mudança de props ou de dado.

## Dados e fluxo

Nenhuma query nova. O array que já popula a lista de região (`regioesComHref`, já com
`nome`/`contagem`/`href` computados em `DashboardConteudo.tsx`) é passado também pro
`MapaRegioesDF`. O casamento com a tabela fixa de RAs acontece no client, em render — não requer
nenhuma mudança no fetch de dados nem no `buildWherePessoas`/agregação existente.

## Tratamento de erro / casos de borda

- **Região sem match na tabela do DF**: balão não aparece no mapa; item continua normal na
  lista ao lado. Sem aviso, sem log — comportamento silencioso, já decidido com o usuário.
- **Nenhuma região com match** (gabinete fora do DF, ou sem nenhuma Região cadastrada): mapa
  renderiza só o contorno do DF vazio, sem quebrar layout. Lista ao lado continua funcionando
  normalmente (pode até estar vazia também, se não houver região cadastrada).
- **Zoom nos limites** (0.5x/4x): botões +/− e scroll simplesmente não passam do limite —
  sem erro, sem feedback visual adicional (mesmo comportamento do protótipo aprovado).

## Testes

- `src/lib/__tests__/regioes-df-mapa.test.ts` (novo, TDD): `encontrarPosicaoRegiao` — nome exato,
  nome com acentuação diferente, nome com caixa diferente, nome sem match nenhum (retorna
  `null`), nome vazio.
- `calcularTamanhoBalao`: contagem zero, contagem igual ao mínimo do conjunto, contagem igual ao
  máximo, contagem única (min==max, evitar divisão por zero), resultado sempre dentro de
  [17, 34].
- `GraficoPizza`: sem teste automatizado novo (componente sem cobertura hoje, mesmo padrão já
  aceito no projeto pra componentes visuais) — verificação manual descrita abaixo cobre a
  mudança.
- Verificação manual (mesmo padrão de todas as features anteriores — gabinete real, dado real):
  - Mapa exibe balão nas regiões com Região cadastrada que bate com uma RA do DF; balões
    ausentes pras que não batem.
  - Clicar num balão abre a Central de Filtros com o filtro de região certo (mesmo destino que
    clicar na lista).
  - Arrastar e usar zoom (scroll e botões) funcionam dentro da caixa, sem vazar clique pro
    balão errado.
  - Clicar numa fatia colorida de cada uma das 5 pizzas (admin e mobilizador) abre o filtro
    certo, idêntico ao que a legenda já abre hoje.
  - Ordem visual: mapa+lista aparece antes dos 5 gráficos de pizza, no admin e no mobilizador.
