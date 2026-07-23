# Nome clicável abre a ficha da pessoa — Design

## Contexto

Em várias listagens do sistema, o nome de uma pessoa aparece como texto puro, sem nenhum jeito de ir direto pra ficha dela — o usuário precisa sair da tela, ir em Usuários, e buscar manualmente. Duas telas já resolvem isso (`UsuariosTable.tsx` e `RedesTable.tsx`), mas o padrão não se repete no resto do sistema.

Levantamento completo feito antes deste spec (grep em todas as tabelas que renderizam `pessoa.nome`, `solicitante.nome` ou `responsavel.nome`):

| Tela | Componente | Estado hoje |
|---|---|---|
| Usuários | `UsuariosTable.tsx` | ✅ já é link pra ficha — fora de escopo, nada muda |
| Redes | `RedesTable.tsx` | Nome é link, mas pro drill-down `?rede=id` — **decisão do usuário: continua assim**, fora de escopo |
| Central de Filtros → Cadastros | `CadastrosBusca.tsx` | Nome seleciona pra edição inline no mesmo painel — **decisão do usuário: continua assim**, fora de escopo |
| Central de Filtros → Pessoas | `PessoasFiltro.tsx` | Texto puro — **entra no escopo** |
| Central de Filtros → Demandas | `DemandasFiltro.tsx` | Solicitante e Responsável em texto puro — **entra no escopo** |
| Central de Filtros → Banco de Talentos | `BancoTalentosFiltro.tsx` | Texto puro — **entra no escopo** |
| Demandas (listagem principal, admin) | `admin/demandas/page.tsx` | Solicitante e Responsável em texto puro — **entra no escopo** |
| Demandas (listagem principal, mobilizador) | `mobilizador/demandas/page.tsx` | Solicitante em texto puro — **entra no escopo** |
| Dashboard → Ranking de mobilizadores | `DashboardConteudo.tsx` | Texto puro, e o dado (`rankingMobilizadores`) nem carrega o `id` da pessoa hoje — **entra no escopo** |

## Objetivo

Nas 6 telas marcadas "entra no escopo" acima, o nome da pessoa vira um link que abre a ficha dela (`/[slug]/admin/pessoas/[id]` pro admin, `/[slug]/mobilizador/pessoas/[id]` pro mobilizador — rota que já existe hoje nos dois papéis), preservando o resto da linha/tabela como está.

## Regra de segurança (mobilizador)

A ficha `/[slug]/mobilizador/pessoas/[id]` já é protegida hoje: só abre se a pessoa estiver na sub-rede completa do mobilizador logado (senão, 404 — checagem já existente em `mobilizador/pessoas/[pessoaId]/page.tsx`, não mexida por este spec).

Na maioria das telas em escopo, a pessoa listada já está garantidamente dentro do que o mobilizador pode ver (a query que popula a tela já é escopada pela sub-rede — mesmo padrão de `coletarSubRedeIds` usado em toda a Central de Filtros). A única exceção é o **Solicitante** nas duas telas de Demandas (Central de Filtros → aba Demandas, e a listagem principal `/mobilizador/demandas`): o solicitante de uma demanda pode ser qualquer pessoa do gabinete, não só da sub-rede de quem está vendo. **Decisão do usuário**: nesse caso específico, se o solicitante não estiver na sub-rede do mobilizador, o nome fica em texto puro (sem virar link) — nunca gera um link que dá 404.

Isso exige que as duas páginas de Demandas do lado mobilizador (`mobilizador/filtros/demandas/page.tsx` e `mobilizador/demandas/page.tsx`) calculem `coletarSubRedeIds(pessoa.id, gabinete.id)` (função já existente em `src/lib/rede.ts`, já usada em outras telas do mobilizador) e passem esse conjunto de ids adiante pro componente de listagem decidir, linha a linha, se o nome do solicitante vira link.

Do lado admin, não há essa restrição — admin vê o gabinete inteiro, todo nome sempre vira link.

## Mudanças por arquivo

### `PessoasFiltro.tsx` (compartilhado admin/mobilizador)
Novo prop `baseHrefPessoa: string` (`/[slug]/admin/pessoas` ou `/[slug]/mobilizador/pessoas`, passado por cada `page.tsx` chamador). `{p.nome}` na célula da tabela vira `<Link href={`${baseHrefPessoa}/${p.id}`}>`. Sempre linkável (a listagem já é escopada pela sub-rede quando é o mobilizador vendo).

### `DemandasFiltro.tsx` (compartilhado admin/mobilizador)
Novo prop `baseHrefPessoa: string` (mesma ideia). Novo prop opcional `idsRedeSolicitante?: Set<string>` — quando presente (só o lado mobilizador passa), um solicitante só vira link se `idsRedeSolicitante.has(solicitante.id)`; quando ausente (lado admin), sempre vira link. O tipo `DemandaLinha` ganha `solicitante: { id: string; nome: string }` e `responsavel: { id: string; nome: string }` (hoje só tem `nome`). Responsável sempre vira link (no lado mobilizador, responsável é sempre o próprio usuário logado, que está garantidamente dentro da própria sub-rede).

### `BancoTalentosFiltro.tsx` (só admin)
Novo prop `baseHrefPessoa: string` (fixo `/[slug]/admin/pessoas`, já que essa aba não existe no mobilizador). `{t.pessoa.nome}` vira link usando `t.pessoaId` (id já disponível no tipo `TalentoLinha`).

### `admin/demandas/page.tsx`
`solicitante`/`responsavel` no `select` do Prisma ganham `id: true`. Nomes na tabela viram links pra `/[slug]/admin/pessoas/[id]`, sempre.

### `mobilizador/demandas/page.tsx`
`solicitante` no `select` do Prisma ganha `id: true`. A página calcula `coletarSubRedeIds(pessoa.id, gabinete.id)` e usa pra decidir, linha a linha, se o nome do solicitante vira link pra `/[slug]/mobilizador/pessoas/[id]` ou fica texto puro.

### `admin/dashboard/page.tsx` e `mobilizador/dashboard/page.tsx`
O `.map()` que monta `rankingMobilizadores` a partir de `mobilizadoresAtivos` ganha `id: m.id` no objeto retornado (o `id` já é selecionado na query `mobilizadoresAtivos`, só não era repassado adiante).

### `DashboardConteudo.tsx`
Tipo `rankingMobilizadores` ganha `id: string`. Novo prop `pessoaHrefBase: string` (`/[slug]/admin/pessoas` ou `/[slug]/mobilizador/pessoas`, passado pelos dois `page.tsx` chamadores — mesmo padrão de `dashboardHref`/`filtrosHref`/`demandasHref`, que já são passados assim). O `{m.nome}` na tabela de ranking vira link. Sempre linkável nos dois papéis (a query de `mobilizadoresAtivos` já é escopada pela sub-rede quando é o mobilizador vendo).

## Estilo visual

Reaproveita o padrão já usado em `UsuariosTable.tsx`/`RedesTable.tsx`: `className="font-medium text-gray-900 hover:underline"` (ou a cor de texto que a célula já usa hoje, quando não for `text-gray-900`) — sem virar um link azul destoante no meio de uma tabela de dados. Mesma aba/mesma janela (`<Link>` padrão do Next, sem `target="_blank"`).

## Fora de escopo

- `UsuariosTable.tsx`, `RedesTable.tsx`, `CadastrosBusca.tsx` — comportamento atual mantido (ver tabela acima).
- Nenhuma mudança de schema, Server Action ou rota nova — as rotas de ficha (`/admin/pessoas/[id]`, `/mobilizador/pessoas/[id]`) já existem.
- Nenhuma mudança na lógica de autorização da ficha em si (`assertMobilizadorAccess`/checagem de sub-árvore em `mobilizador/pessoas/[pessoaId]/page.tsx`) — só decide, na origem, se o link aparece ou não.

## Verificação

- `npx tsc --noEmit` limpo.
- Manual (Playwright, gabinete real, admin e mobilizador):
  - Nas 6 telas em escopo, clicar no nome abre a ficha certa.
  - Nas 3 telas fora de escopo, comportamento atual (drill-down / seleção inline / já-linkado) continua idêntico.
  - Do lado mobilizador, aba Demandas e listagem de Demandas: solicitante dentro da sub-rede vira link e abre; solicitante fora da sub-rede aparece sem link (texto puro, sem gerar 404 ao clicar).
  - Sem erros no console.
