# Lupa do Topbar → item "Filtros" no menu lateral — Design

## Contexto

Hoje o único caminho para a Central de Filtros (`/[slug]/admin/filtros` e `/[slug]/mobilizador/filtros`) é o ícone de lupa fixo no canto superior direito (`Topbar.tsx`, prop `filtrosHref`). O menu lateral (`Sidebar.tsx`) não tem nenhum item "Filtros" — a Central de Filtros fica "escondida" fora do fluxo normal de navegação por menu.

## Objetivo

Mover o acesso à Central de Filtros para dentro do menu lateral, como um item normal de navegação ("Filtros"), e remover a lupa do Topbar — eliminando o caminho duplicado.

## Mudanças

### `src/components/admin/Topbar.tsx`

- Remove a prop `filtrosHref` e o SVG da lupa (const `lupa` e o bloco condicional `{filtrosHref ? <Link>... : lupa}`).
- Topbar passa a ter só: botão de abrir menu (mobile) + relógio, à esquerda; sino de notificação + bloco de perfil, à direita. Nada muda no sino nem no perfil.

### `src/components/admin/Sidebar.tsx`

- Novo tipo de ícone `'filtros'` em `IconeTipo`.
- Novo item `{ label: 'Filtros', href: '/${slug}/admin/filtros', icone: 'filtros' }` em `buildItensAdmin`, inserido logo depois de `'Dados Gerais'` (posição 2 de 8).
- Novo item `{ label: 'Filtros', href: '/${slug}/mobilizador/filtros', icone: 'filtros' }` em `buildItensMobilizador`, logo depois de `'Dados Gerais'` (posição 2 de 4).
- Novo `case 'filtros'` em `IconeMenu`: reaproveita o mesmo desenho de lupa (círculo + traço) que hoje existe em `Topbar.tsx`, redesenhado no padrão dos outros ícones do menu (`viewBox="0 0 17 17"`, `stroke="currentColor"`, `strokeWidth="1.4"`–`1.6`, sem cor fixa) para herdar a cor ativa/inativa do item de menu como os demais ícones já fazem.

### `src/app/[slug]/admin/layout.tsx` e `src/app/[slug]/mobilizador/layout.tsx`

- Param de passar `filtrosHref` para `<Topbar>` (prop removida do componente).

## Fora de escopo

- A prop `filtrosHref` que `DashboardConteudo.tsx` recebe e usa para montar links de filtro com querystring (`construirHref(filtrosHref, ...)`) é uma prop **diferente e não relacionada** — continua existindo, não é tocada por esta mudança.
- Nenhuma mudança na página `/admin/filtros` ou `/mobilizador/filtros` em si (rotas, abas, filtros).
- Nenhuma mudança no sino de notificação nem no bloco de perfil do Topbar.

## Verificação

- `npx tsc --noEmit` limpo.
- Manual (Playwright, gabinete real): lupa não aparece mais no Topbar; item "Filtros" aparece no menu logo após "Dados Gerais" (admin e mobilizador); clicar nele leva à mesma página que a lupa levava antes; ícone reflete estado ativo/inativo como os outros itens do menu; sem erros no console.
