# Lupa do Topbar → item "Filtros" no menu lateral Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remover o ícone de lupa fixo do `Topbar.tsx` e criar um item "Filtros" no menu lateral (`Sidebar.tsx`), levando para a mesma página que a lupa levava (`/[slug]/admin/filtros` ou `/[slug]/mobilizador/filtros`), tanto para admin quanto para mobilizador.

**Architecture:** Mudança de UI pura em três arquivos client/server já existentes. Sem novo componente, sem Server Action, sem schema, sem rota nova. `Topbar` perde a prop `filtrosHref`; `Sidebar` ganha um novo tipo de ícone e um novo item de menu, reaproveitando o mesmo desenho SVG que hoje está na lupa do Topbar (redesenhado no padrão visual dos outros ícones do menu).

**Tech Stack:** Next.js 14 (App Router) + React 18 + TypeScript 5 + Tailwind 3.4.

## Global Constraints

- A prop `filtrosHref` que `DashboardConteudo.tsx` recebe (para montar links de filtro com querystring) é diferente da prop `filtrosHref` do `Topbar` e **não é tocada** por este plano.
- Nenhuma mudança nas rotas `/admin/filtros` e `/mobilizador/filtros` em si, nem no sino de notificação ou no bloco de perfil do `Topbar`.
- Nenhuma mudança de schema, Server Action ou rota nova.

Spec completo: `docs/superpowers/specs/2026-07-23-lupa-para-menu-filtros-design.md`.

---

### Task 1: Remover a lupa do Topbar

**Files:**
- Modify: `src/components/admin/Topbar.tsx`
- Modify: `src/app/[slug]/admin/layout.tsx`
- Modify: `src/app/[slug]/mobilizador/layout.tsx`

**Interfaces:**
- Produces: `Topbar` deixa de aceitar a prop `filtrosHref` — nenhum outro arquivo além dos dois layouts acima passa essa prop hoje (confirmado por grep no código atual).

Estes três arquivos precisam mudar juntos: se só o `Topbar.tsx` for alterado, os dois `layout.tsx` continuariam passando uma prop `filtrosHref` que o componente não aceita mais, quebrando o build (`tsc`/Next não aceitam prop extra em componente tipado). Por isso é uma única task.

- [x] **Step 1: Remover a lupa e a prop `filtrosHref` de `Topbar.tsx`**

Arquivo atual (`src/components/admin/Topbar.tsx`):

```tsx
import Link from 'next/link'
import Avatar from './Avatar'
import LiveClock from './LiveClock'

export default function Topbar({
  usuarioNome,
  usuarioFotoUrl,
  perfilHref,
  filtrosHref,
}: {
  usuarioNome: string
  usuarioFotoUrl: string | null
  perfilHref?: string
  filtrosHref?: string
}) {
  const perfilBloco = (
    <div className="flex items-center gap-2">
      <Avatar fotoUrl={usuarioFotoUrl} nome={usuarioNome} size={28} />
      <span className="text-sm hidden sm:inline text-[#494949]">{usuarioNome}</span>
    </div>
  )

  const lupa = (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden className="shrink-0">
      <circle cx="8.5" cy="8.5" r="6" stroke="#979797" strokeWidth="1.8" />
      <path d="M13.3 13.3 18 18" stroke="#979797" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )

  return (
    <header className="bg-white border-b border-[#D9D9D9] px-4 md:px-6 py-3 flex items-center justify-between gap-3">
      <div className="flex items-center gap-3 min-w-0">
        <label htmlFor="sidebar-toggle" aria-label="Abrir menu" className="md:hidden text-xl cursor-pointer shrink-0 text-[#686868]">
          ☰
        </label>
        <div className="hidden sm:block">
          <LiveClock />
        </div>
      </div>
      <div className="flex items-center gap-4">
        {filtrosHref ? (
          <Link href={filtrosHref} aria-label="Abrir filtros" className="shrink-0 hover:opacity-70">
            {lupa}
          </Link>
        ) : (
          lupa
        )}
        <span className="relative shrink-0" aria-hidden>
          <svg width="20" height="21" viewBox="0 0 20 21" fill="none">
            <path
              d="M10 2.5a5.5 5.5 0 0 0-5.5 5.5v3.2c0 .6-.24 1.18-.66 1.6L2.7 14a1 1 0 0 0 .7 1.7h13.2a1 1 0 0 0 .7-1.7l-1.14-1.2a2.27 2.27 0 0 1-.66-1.6V8A5.5 5.5 0 0 0 10 2.5Z"
              stroke="#979797"
              strokeWidth="1.6"
              strokeLinejoin="round"
            />
            <path d="M7.8 18a2.3 2.3 0 0 0 4.4 0" stroke="#979797" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
          <span className="absolute -top-1 -right-1 bg-red-600 text-white text-[9px] rounded-full w-4 h-4 flex items-center justify-center">
            0
          </span>
        </span>
        {perfilHref ? (
          <Link href={perfilHref} className="hover:opacity-80">
            {perfilBloco}
          </Link>
        ) : (
          perfilBloco
        )}
      </div>
    </header>
  )
}
```

Substituir por:

```tsx
import Link from 'next/link'
import Avatar from './Avatar'
import LiveClock from './LiveClock'

export default function Topbar({
  usuarioNome,
  usuarioFotoUrl,
  perfilHref,
}: {
  usuarioNome: string
  usuarioFotoUrl: string | null
  perfilHref?: string
}) {
  const perfilBloco = (
    <div className="flex items-center gap-2">
      <Avatar fotoUrl={usuarioFotoUrl} nome={usuarioNome} size={28} />
      <span className="text-sm hidden sm:inline text-[#494949]">{usuarioNome}</span>
    </div>
  )

  return (
    <header className="bg-white border-b border-[#D9D9D9] px-4 md:px-6 py-3 flex items-center justify-between gap-3">
      <div className="flex items-center gap-3 min-w-0">
        <label htmlFor="sidebar-toggle" aria-label="Abrir menu" className="md:hidden text-xl cursor-pointer shrink-0 text-[#686868]">
          ☰
        </label>
        <div className="hidden sm:block">
          <LiveClock />
        </div>
      </div>
      <div className="flex items-center gap-4">
        <span className="relative shrink-0" aria-hidden>
          <svg width="20" height="21" viewBox="0 0 20 21" fill="none">
            <path
              d="M10 2.5a5.5 5.5 0 0 0-5.5 5.5v3.2c0 .6-.24 1.18-.66 1.6L2.7 14a1 1 0 0 0 .7 1.7h13.2a1 1 0 0 0 .7-1.7l-1.14-1.2a2.27 2.27 0 0 1-.66-1.6V8A5.5 5.5 0 0 0 10 2.5Z"
              stroke="#979797"
              strokeWidth="1.6"
              strokeLinejoin="round"
            />
            <path d="M7.8 18a2.3 2.3 0 0 0 4.4 0" stroke="#979797" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
          <span className="absolute -top-1 -right-1 bg-red-600 text-white text-[9px] rounded-full w-4 h-4 flex items-center justify-center">
            0
          </span>
        </span>
        {perfilHref ? (
          <Link href={perfilHref} className="hover:opacity-80">
            {perfilBloco}
          </Link>
        ) : (
          perfilBloco
        )}
      </div>
    </header>
  )
}
```

- [x] **Step 2: Remover `filtrosHref` da chamada em `src/app/[slug]/admin/layout.tsx`**

Localizar (por volta da linha 104-108):

```tsx
          <Topbar
            usuarioNome={usuarioNome}
            usuarioFotoUrl={usuarioFotoUrl}
            filtrosHref={`/${params.slug}/admin/filtros`}
          />
```

Substituir por:

```tsx
          <Topbar
            usuarioNome={usuarioNome}
            usuarioFotoUrl={usuarioFotoUrl}
          />
```

- [x] **Step 3: Remover `filtrosHref` da chamada em `src/app/[slug]/mobilizador/layout.tsx`**

Localizar (por volta da linha 62-67):

```tsx
          <Topbar
            usuarioNome={usuarioNome}
            usuarioFotoUrl={usuarioFotoUrl}
            perfilHref={`/${params.slug}/mobilizador/perfil`}
            filtrosHref={`/${params.slug}/mobilizador/filtros`}
          />
```

Substituir por:

```tsx
          <Topbar
            usuarioNome={usuarioNome}
            usuarioFotoUrl={usuarioFotoUrl}
            perfilHref={`/${params.slug}/mobilizador/perfil`}
          />
```

- [x] **Step 4: Checar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros novos relacionados a `Topbar.tsx`, `admin/layout.tsx` ou `mobilizador/layout.tsx`.

**Confirmado (23/07):** limpo.

- [x] **Step 5: Commit**

```bash
git add src/components/admin/Topbar.tsx "src/app/[slug]/admin/layout.tsx" "src/app/[slug]/mobilizador/layout.tsx"
git commit -m "$(cat <<'EOF'
refactor: remove a lupa fixa do Topbar

O acesso à Central de Filtros passa a ser só pelo item "Filtros"
do menu lateral (próxima task) — elimina o caminho duplicado.
EOF
)"
```

---

### Task 2: Adicionar item "Filtros" no menu lateral

**Files:**
- Modify: `src/components/admin/Sidebar.tsx`

**Interfaces:**
- Consumes: nada de outra task — mudança isolada neste arquivo.
- Produces: nada consumido por outro arquivo — `Sidebar` já é importado e usado sem mudança de assinatura de props.

Não há lógica pura nova para TDD nesta task (é um item de menu declarativo + um `case` de SVG, seguindo exatamente o padrão dos itens/ícones já existentes no mesmo arquivo). A verificação é por tipo + manual (Step 4).

- [x] **Step 1: Adicionar `'filtros'` ao tipo `IconeTipo`**

Em `src/components/admin/Sidebar.tsx`, localizar:

```tsx
type IconeTipo =
  | 'dados-gerais'
  | 'usuarios'
  | 'demandas'
  | 'tarefas'
  | 'banco-talentos'
  | 'link-cadastro'
  | 'importar-exportar'
  | 'configuracoes'
  | 'inicio'
```

Substituir por:

```tsx
type IconeTipo =
  | 'dados-gerais'
  | 'filtros'
  | 'usuarios'
  | 'demandas'
  | 'tarefas'
  | 'banco-talentos'
  | 'link-cadastro'
  | 'importar-exportar'
  | 'configuracoes'
  | 'inicio'
```

- [x] **Step 2: Adicionar o item "Filtros" em `buildItensAdmin`, logo após "Dados Gerais"**

Localizar:

```tsx
function buildItensAdmin(slug: string): ItemMenu[] {
  return [
    { label: 'Dados Gerais', href: `/${slug}/admin/dashboard`, icone: 'dados-gerais' },
    { label: 'Usuários', href: `/${slug}/admin/pessoas`, icone: 'usuarios' },
```

Substituir por:

```tsx
function buildItensAdmin(slug: string): ItemMenu[] {
  return [
    { label: 'Dados Gerais', href: `/${slug}/admin/dashboard`, icone: 'dados-gerais' },
    { label: 'Filtros', href: `/${slug}/admin/filtros`, icone: 'filtros' },
    { label: 'Usuários', href: `/${slug}/admin/pessoas`, icone: 'usuarios' },
```

(o resto de `buildItensAdmin` — Demandas, Tarefas, Banco de Talentos, Link de Cadastro, Importar/Exportar, Configurações — não muda.)

- [x] **Step 3: Adicionar o item "Filtros" em `buildItensMobilizador`, logo após "Dados Gerais"**

Localizar:

```tsx
function buildItensMobilizador(slug: string): ItemMenu[] {
  return [
    { label: 'Dados Gerais', href: `/${slug}/mobilizador/dashboard`, icone: 'dados-gerais' },
    { label: 'Início', href: `/${slug}/mobilizador/rede`, icone: 'inicio' },
```

Substituir por:

```tsx
function buildItensMobilizador(slug: string): ItemMenu[] {
  return [
    { label: 'Dados Gerais', href: `/${slug}/mobilizador/dashboard`, icone: 'dados-gerais' },
    { label: 'Filtros', href: `/${slug}/mobilizador/filtros`, icone: 'filtros' },
    { label: 'Início', href: `/${slug}/mobilizador/rede`, icone: 'inicio' },
```

(o resto de `buildItensMobilizador` — Demandas, Link de Cadastro — não muda.)

- [x] **Step 4: Adicionar o `case 'filtros'` em `IconeMenu`**

Localizar o primeiro `case` da função `IconeMenu` (logo após a linha do `switch (tipo) {`):

```tsx
  switch (tipo) {
    case 'dados-gerais':
      return (
        <svg {...props}>
          <path d="M2 15V9.5M6.5 15V5M11 15V7M15.5 15V2.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      )
    case 'usuarios':
```

Substituir por (adicionando o novo `case` entre `'dados-gerais'` e `'usuarios'`, mesmo geometria da lupa que existia em `Topbar.tsx`, escalada para o `viewBox="0 0 17 17"` padrão dos outros ícones deste menu):

```tsx
  switch (tipo) {
    case 'dados-gerais':
      return (
        <svg {...props}>
          <path d="M2 15V9.5M6.5 15V5M11 15V7M15.5 15V2.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      )
    case 'filtros':
      return (
        <svg {...props}>
          <circle cx="7.2" cy="7.2" r="5.1" stroke="currentColor" strokeWidth="1.5" />
          <path d="M11.3 11.3 15.3 15.3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      )
    case 'usuarios':
```

(os demais `case`s — `demandas`, `tarefas`, `banco-talentos`, `link-cadastro`, `importar-exportar`, `configuracoes`, `inicio` — não mudam.)

- [x] **Step 5: Checar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros novos relacionados a `Sidebar.tsx`.

**Confirmado (23/07):** limpo (o worktree novo precisou de `npx prisma generate` primeiro — sem relação com esta mudança).

- [x] **Step 6: Verificação manual no navegador**

```bash
npm run dev
```

Logado como **admin** num gabinete de teste (ex. `amigos-do-izalci`):
1. A lupa não aparece mais no canto superior direito — só relógio, sino de notificação e perfil (se aplicável).
2. O item "Filtros" aparece no menu lateral, logo abaixo de "Dados Gerais" e acima de "Usuários".
3. Clicar em "Filtros" leva a `/[slug]/admin/filtros` — a mesma página que a lupa levava antes.
4. Com `/admin/filtros` ou `/admin/filtros/demandas` na URL, o item "Filtros" aparece destacado (estado ativo) no menu. Com `/admin/filtros/banco-talentos`, o item destacado é "Banco de Talentos" (não "Filtros") — o algoritmo de match por prefixo mais longo já existente no componente escolhe o href mais específico automaticamente, sem precisar de código novo para isso.
5. Ícone de "Filtros" segue o mesmo estilo visual (tamanho, cor ativa/inativa) dos outros ícones do menu.

Logado como **mobilizador** num gabinete de teste:
6. Mesmos pontos 1-5 acima, mas com `/[slug]/mobilizador/filtros`.

7. Sem erros no console do navegador em nenhum dos dois papéis.

**Confirmado (23/07), via Playwright contra produção real** (gabinete `amigos-do-izalci`, dev server do worktree em `localhost:3100`, login via `/auth/confirm?token_hash=...&type=magiclink` gerado com a service-role key, mesmo padrão de sessões anteriores):
- **Admin:** lupa ausente do Topbar (só relógio, sino, perfil); item "Filtros" aparece logo após "Dados Gerais"; clique leva a `/admin/filtros` (mesma página da lupa antiga); item fica destacado como ativo na própria página e em `/admin/filtros/demandas`, enquanto `/admin/filtros/banco-talentos` destaca corretamente "Banco de Talentos" (algoritmo de match por prefixo mais longo já existente, sem código novo); zero mensagens no console.
- **Mobilizador:** como não existe fluxo de login direto para testar mobilizador nesta sessão (login de mobilizador exige o par `code`+`token`+`gabineteId` de `/auth/callback`, que não é obtível via `admin.generateLink`), o controller trocou temporariamente o papel do próprio usuário de teste (`renato.df@gmail.com`) de `admin` para `mobilizador` no gabinete `amigos-do-izalci` (update direto e reversível em `UsuarioGabinete.papel` + `Pessoa.userId`), testou, e reverteu ambos os campos ao estado original imediatamente depois — confirmado via SELECT pós-reversão. Com isso: lupa ausente do Topbar; item "Filtros" aparece logo após "Dados Gerais" e antes de "Início"; clique leva a `/mobilizador/filtros`; zero mensagens no console.


- [x] **Step 7: Commit**

```bash
git add src/components/admin/Sidebar.tsx
git commit -m "$(cat <<'EOF'
feat: item Filtros no menu lateral (admin e mobilizador)

Reaproveita o mesmo desenho da lupa removida do Topbar, agora
como item de navegação normal, logo após Dados Gerais.
EOF
)"
```

---

## Self-Review

**Spec coverage:** O spec (`docs/superpowers/specs/2026-07-23-lupa-para-menu-filtros-design.md`) descreve três mudanças — remover a lupa/prop do `Topbar` (Task 1), adicionar o item "Filtros" ao `Sidebar` para admin e mobilizador logo após "Dados Gerais" com ícone reaproveitado (Task 2), e deixar `DashboardConteudo.tsx`/rotas de filtros intocadas (confirmado: nenhuma task toca esses arquivos). Os dois pontos de "Fora de escopo" do spec (prop `filtrosHref` do `DashboardConteudo`, sino/perfil do Topbar) não são tocados por nenhuma task.

**Placeholder scan:** Nenhum "TBD"/"implementar depois" — todo código é completo e literal, copiável direto.

**Type consistency:** `IconeTipo` ganha `'filtros'` no Step 1 da Task 2 antes de ser usado nos Steps 2-4 da mesma task. `ItemMenu` (`{ label, href?, emBreve?, icone: IconeTipo }`) não muda de forma — os novos itens usam exatamente esse shape. `Topbar` perde `filtrosHref` na Task 1 e nenhuma task subsequente tenta usá-la.
