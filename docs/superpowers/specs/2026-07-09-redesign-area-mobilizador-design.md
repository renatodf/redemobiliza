# Redesign da área do mobilizador

## Contexto

A área `/mobilizador` já usa o mesmo shell visual do admin (Sidebar + Topbar,
mesmos componentes: `src/components/admin/Sidebar.tsx`, `.../Topbar.tsx`), mas
o conteúdo é estruturado de forma bem diferente e menos madura:

- `/mobilizador` (home) empilha: cards de link/QR code por segmento, um resumo
  de "Minha rede (N)" com link "Ver rede →", uma lista simples de "Minhas
  Demandas", e uma seção "Meu Perfil" com formulário de edição + trocar senha.
- `/mobilizador/rede` é uma página separada com uma tabela simples (nome,
  WhatsApp, região, redes, cadastros, colaborador, mobilizador) e drill-down
  na sub-rede via `?rede=<id>&path=<ids>`.
- O admin, por sua vez, tem uma página de Usuários bem mais robusta
  (`src/app/[slug]/admin/pessoas/page.tsx`): `UsuariosTable` (avatar, nome,
  email, tipo de conta, segmentos, editar/excluir, seleção em massa),
  `UsuariosTabs`, busca, paginação, "+ Cadastrar usuário".

O pedido: a home do mobilizador deve ficar visualmente igual à listagem de
Usuários do admin, mas mostrando a rede do próprio mobilizador logado. Como
isso já mostra a rede, o card resumido "Minha rede" perde sentido como algo
separado. "Minhas Demandas" vira um item de menu ("Demandas"), e "Meu Perfil"
sai da home e vira uma página própria, acessada clicando na foto/nome no
canto superior direito da Topbar.

## Menu (Sidebar)

`buildItensMobilizador` em `Sidebar.tsx` passa a ter dois itens:
- **Início** (`/mobilizador`) — a listagem da rede (ver abaixo).
- **Demandas** (`/mobilizador/demandas`) — nova página.

"Minha Rede" deixa de existir como item de menu separado (a home já é a
listagem). A rota `/mobilizador/rede` é removida — todo esse conteúdo passa a
viver em `/mobilizador`.

## `/mobilizador` (home)

Mantém, no topo, os cards de link personalizado + QR code por segmento
(inalterado). Logo abaixo, a listagem da rede do mobilizador, reaproveitando
o componente `UsuariosTable` do admin — mas numa **variante somente-leitura**,
já que o `UsuariosTable` atual embute ações exclusivas de admin (editar
pessoa, excluir pessoa, excluir em massa, link para `/admin/pessoas/[id]`) que
um mobilizador não deve ter.

`UsuariosTable` ganha duas mudanças não-destrutivas (compatível com o uso
atual do admin):
- Prop `baseHref` (default `/${slug}/admin/pessoas`) — usada para montar o
  link do nome de cada linha. O mobilizador passa
  `/${slug}/mobilizador/pessoas` (rota que já existe).
- Prop `somenteLeitura` (default `false`) — quando `true`, oculta a coluna de
  checkbox, a barra de "Excluir Todos" e a coluna de Ações (editar/excluir)
  por linha. O admin continua chamando o componente sem essa prop, sem
  nenhuma mudança de comportamento.

A página de mobilizador NÃO usa `UsuariosTabs` (as abas "Todos os
Usuários"/"Redes de Usuários" não fazem sentido no escopo de uma única rede
pessoal) nem `CadastrarUsuarioModal` (mobilizador não cria cadastros
diretamente — convida via link/QR code).

A busca (`?q=`) e o drill-down na sub-rede (`?rede=<id>&path=<ids>`, com
breadcrumb "Rede de Fulano") continuam funcionando exatamente como hoje em
`/mobilizador/rede` — só que na URL `/mobilizador`. A query do Prisma
(`vinculoRede` por `indicadoPorId`) e a checagem de autorização da sub-árvore
(loop subindo por `indicadoPorId` até achar o mobilizador logado) migram de
`rede/page.tsx` para `page.tsx` sem mudança de lógica.

## `/mobilizador/demandas` (nova)

Listagem no mesmo estilo visual da listagem de demandas do admin (filtros de
status, tabela), mas com o `where` sempre fixado em
`responsavelId: <pessoa do mobilizador logado>` — sem filtro de responsável
selecionável (só existe um responsável possível: o próprio mobilizador). Cada
linha linka para `/mobilizador/demandas/[demandaId]`, página de detalhe que
**já existe** e não é alterada por este spec.

## `/mobilizador/perfil` (nova)

Mesmo conteúdo que hoje está na seção "Meu Perfil" de `/mobilizador`:
`EditarPessoaForm` (dados pessoais) + `AlterarSenhaDialog`. Só move de lugar —
sem redesenhar o formulário. A seção "Meu Perfil" é removida de `/mobilizador`.

## Topbar

`src/components/admin/Topbar.tsx` ganha uma prop opcional `perfilHref?:
string`. Quando presente, o bloco de avatar+nome no canto superior direito
vira um `<Link href={perfilHref}>`. Quando ausente (uso atual do admin), o
comportamento não muda — sem link.

`src/app/[slug]/mobilizador/layout.tsx` passa a chamar
`<Topbar ... perfilHref={`/${params.slug}/mobilizador/perfil`} />`.
`src/app/[slug]/admin/layout.tsx` não é alterado (não passa `perfilHref`, já
que não foi pedido perfil de admin nesta mudança).

## Fora de escopo

- Qualquer mudança na página de detalhe de demanda do mobilizador
  (`/mobilizador/demandas/[demandaId]`) — já existe, não é tocada.
- Qualquer mudança na página de detalhe de pessoa do mobilizador
  (`/mobilizador/pessoas/[pessoaId]`) — já existe, não é tocada.
- Redesenhar o formulário de perfil para parecer com a ficha do admin — só
  move o que já existe.
- Adicionar link de perfil na Topbar do admin.
