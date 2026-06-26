# REDE MOBILIZA Fase 1 — Plano 2: Autenticação + Super-Admin

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar autenticação completa e o painel do super-admin — login de admin e super-admin, callback de onboarding de admin, CRUD de gabinetes, convite de admins, reenvio de convite e modo suporte com log — entregando um sistema onde o super-admin cria gabinetes, convida admins e acessa qualquer gabinete em modo suporte; e o admin aceita o convite e entra no painel.

**Architecture:** Dois fluxos de login distintos: super-admin usa email/senha em `/super-admin/login`, verificado por `app_metadata.role`; admins usam email/senha ou Google OAuth em `/login`, verificados por `UsuarioGabinete`. Server Actions (via `<form action={}>`) para todas as mutações. `gabineteId` sempre extraído do banco via sessão — nunca de URL params. Cookie `suporteSessao` com payload JSON para modo suporte.

**Tech Stack:** Next.js 14 App Router, Server Actions, `@supabase/ssr`, Supabase Admin SDK (`supabaseAdmin`), Prisma, Tailwind CSS, Vitest

**Pré-requisito:** Plano 1 concluído — `src/lib/prisma.ts`, `src/lib/supabase/server.ts`, `src/lib/supabase/admin.ts`, `src/middleware.ts` e schema migrado disponíveis.

## Global Constraints

- `app_metadata` obrigatório para `role` e `gabineteId` — nunca `user_metadata` (sobrescritível pelo usuário)
- `gabineteId` nunca de parâmetros de URL em rotas autenticadas — sempre do banco via sessão
- `tokenMobilizador` nunca retornado como campo JSON isolado em respostas de API
- Cookie `suporteSessao`: `httpOnly=true, secure=true, sameSite:'strict', path:'/'`
- Todo handler que lê `suporteSessao` DEVE verificar `app_metadata.role === 'super-admin'` primeiro
- Sequência obrigatória: `inviteUserByEmail` → `updateUserById` → só então `generateLink` (e somente se `app_metadata.gabineteId` confirmado)
- `/auth/confirm`: abortar se `app_metadata.gabineteId` ausente — exibir erro de race condition
- Google OAuth disponível apenas para admins de gabinete — não para super-admin nem mobilizadores

---

## Mapa de Arquivos

```
src/
├── middleware.ts                                    ← MODIFY
├── actions/
│   ├── auth/
│   │   ├── login-admin.ts
│   │   └── login-super-admin.ts
│   └── super-admin/
│       ├── criar-gabinete.ts
│       ├── editar-gabinete.ts
│       ├── toggle-gabinete.ts
│       ├── convidar-admin.ts
│       └── reenviar-convite.ts
├── lib/
│   ├── modo-suporte.ts
│   └── __tests__/
│       └── modo-suporte.test.ts
└── app/
    ├── login/
    │   └── page.tsx                                 ← MODIFY
    ├── auth/
    │   └── confirm/
    │       └── route.ts
    └── super-admin/
        ├── login/
        │   └── page.tsx
        ├── layout.tsx
        ├── page.tsx
        └── gabinetes/
            ├── novo/
            │   └── page.tsx
            └── [id]/
                ├── page.tsx
                └── editar/
                    └── page.tsx
```

---

### Task 1: Middleware update + super-admin login

**Files:**
- Modify: `src/middleware.ts`
- Create: `src/actions/auth/login-super-admin.ts`
- Create: `src/app/super-admin/login/page.tsx`

**Interfaces:**
- Consumes: `createServerClient` de `@supabase/ssr`, `cookies()` de `next/headers`
- Produces:
  - `/super-admin/login` é rota pública (sem sessão → não redireciona)
  - Unauthenticated em `/super-admin/*` → redireciona para `/super-admin/login` (não mais para `/login`)
  - `loginSuperAdmin(formData)` — Server Action que autentica, verifica role e redireciona

- [ ] **Step 1: Atualizar src/middleware.ts**

Substituir o bloco do super-admin:

```typescript
import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: { session },
  } = await supabase.auth.getSession()

  const { pathname } = request.nextUrl

  // Rotas públicas — sem autenticação necessária
  const isPublicAuth = [
    '/login',
    '/super-admin/login',
    '/auth/confirm',
    '/auth/callback',
  ].some((p) => pathname.startsWith(p))
  const isPublicCadastro = /^\/g\/[^/]+\/cadastro/.test(pathname)

  if (isPublicAuth || isPublicCadastro) return supabaseResponse

  // Super-admin: exige session + role = super-admin em app_metadata
  if (pathname.startsWith('/super-admin')) {
    if (!session) {
      return NextResponse.redirect(new URL('/super-admin/login', request.url))
    }
    if (session.user.app_metadata?.role !== 'super-admin') {
      return new NextResponse('Acesso negado', { status: 403 })
    }
    return supabaseResponse
  }

  // Rotas de gabinete (admin e mobilizador) — papel verificado nas routes
  if (/^\/g\/[^/]+\/(admin|mobilizador)/.test(pathname)) {
    if (!session) {
      return NextResponse.redirect(new URL('/login', request.url))
    }
    return supabaseResponse
  }

  // Qualquer outra rota exige autenticação
  if (!session) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
```

- [ ] **Step 2: Criar src/actions/auth/login-super-admin.ts**

```typescript
'use server'

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

export async function loginSuperAdmin(formData: FormData) {
  const email = formData.get('email') as string
  const password = formData.get('password') as string

  const cookieStore = cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) =>
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          ),
      },
    }
  )

  const {
    data: { session },
    error,
  } = await supabase.auth.signInWithPassword({ email, password })

  if (error || !session) {
    redirect('/super-admin/login?erro=credenciais_invalidas')
  }

  if (session.user.app_metadata?.role !== 'super-admin') {
    await supabase.auth.signOut()
    redirect('/super-admin/login?erro=nao_autorizado')
  }

  redirect('/super-admin/')
}
```

- [ ] **Step 3: Criar src/app/super-admin/login/page.tsx**

```typescript
import { loginSuperAdmin } from '@/actions/auth/login-super-admin'

interface Props {
  searchParams: { erro?: string }
}

export default function SuperAdminLoginPage({ searchParams }: Props) {
  const mensagens: Record<string, string> = {
    credenciais_invalidas: 'E-mail ou senha incorretos.',
    nao_autorizado: 'Acesso não autorizado.',
  }
  const erro = searchParams.erro ? mensagens[searchParams.erro] : null

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900">
      <div className="w-full max-w-sm space-y-6">
        <h1 className="text-xl font-semibold text-white text-center">
          Acesso Restrito
        </h1>

        {erro && (
          <p className="text-sm text-red-400 text-center">{erro}</p>
        )}

        <form action={loginSuperAdmin} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm text-gray-300 mb-1">
              E-mail
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              className="w-full rounded-md border border-gray-600 bg-gray-800 px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm text-gray-300 mb-1">
              Senha
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              className="w-full rounded-md border border-gray-600 bg-gray-800 px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <button
            type="submit"
            className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            Entrar
          </button>
        </form>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Verificar TypeScript**

```bash
npx tsc --noEmit
```

Esperado: sem erros.

- [ ] **Step 5: Testar manualmente**

```bash
npm run dev
```

- Acessar `http://localhost:3000/super-admin` → esperado: redireciona para `/super-admin/login`
- Acessar `http://localhost:3000/super-admin/login` → esperado: página de login exibida sem loop de redirect

- [ ] **Step 6: Commit**

```bash
git add src/middleware.ts src/actions/auth/login-super-admin.ts src/app/super-admin/login/page.tsx
git commit -m "feat: super-admin login + middleware atualizado"
```

---

### Task 2: Admin login (`/login`) — email/senha + Google OAuth

**Files:**
- Modify: `src/app/login/page.tsx`
- Create: `src/actions/auth/login-admin.ts`

**Interfaces:**
- Consumes: `prisma` de `src/lib/prisma.ts`, `createServerClient` de `@supabase/ssr`
- Produces:
  - `loginAdmin(formData)` — Server Action: autentica, verifica `UsuarioGabinete`, redireciona para `/g/[slug]/admin/`
  - Botão Google redireciona para OAuth via `?google=1` no form

- [ ] **Step 1: Criar src/actions/auth/login-admin.ts**

```typescript
'use server'

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'

export async function loginAdmin(formData: FormData) {
  const email = formData.get('email') as string
  const password = formData.get('password') as string

  const cookieStore = cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) =>
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          ),
      },
    }
  )

  const {
    data: { session },
    error,
  } = await supabase.auth.signInWithPassword({ email, password })

  if (error || !session) {
    redirect('/login?erro=credenciais_invalidas')
  }

  const usuarioGabinete = await prisma.usuarioGabinete.findFirst({
    where: { userId: session.user.id, papel: 'admin' },
    include: { gabinete: { select: { slug: true, ativo: true } } },
  })

  if (!usuarioGabinete) {
    await supabase.auth.signOut()
    redirect('/login?erro=nao_autorizado')
  }

  if (!usuarioGabinete.gabinete.ativo) {
    await supabase.auth.signOut()
    redirect('/login?erro=gabinete_inativo')
  }

  redirect(`/g/${usuarioGabinete.gabinete.slug}/admin/`)
}

export async function loginAdminGoogle() {
  const cookieStore = cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) =>
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          ),
      },
    }
  )

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/confirm`,
    },
  })

  if (error || !data.url) {
    redirect('/login?erro=oauth_falhou')
  }

  redirect(data.url)
}
```

- [ ] **Step 2: Atualizar src/app/login/page.tsx**

```typescript
import { loginAdmin, loginAdminGoogle } from '@/actions/auth/login-admin'

interface Props {
  searchParams: { erro?: string }
}

export default function LoginPage({ searchParams }: Props) {
  const mensagens: Record<string, string> = {
    credenciais_invalidas: 'E-mail ou senha incorretos.',
    nao_autorizado:
      'Seu e-mail não está autorizado. Entre em contato com o administrador.',
    gabinete_inativo:
      'Este gabinete foi desativado. Entre em contato com o suporte.',
    oauth_falhou: 'Erro ao iniciar login com Google. Tente novamente.',
    invite_invalid:
      'Convite inválido — solicite ao administrador do sistema o reenvio do convite.',
    gabinete_not_found:
      'Gabinete não encontrado. Entre em contato com o suporte.',
  }
  const erro = searchParams.erro ? mensagens[searchParams.erro] : null

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm space-y-6">
        <h1 className="text-2xl font-bold text-gray-900 text-center">
          Rede Mobiliza
        </h1>

        {erro && (
          <div className="rounded-md bg-red-50 border border-red-200 p-3">
            <p className="text-sm text-red-700">{erro}</p>
          </div>
        )}

        <form action={loginAdmin} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
              E-mail
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
              Senha
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <button
            type="submit"
            className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Entrar
          </button>
        </form>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-gray-300" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-gray-50 px-2 text-gray-400">ou</span>
          </div>
        </div>

        <form action={loginAdminGoogle}>
          <button
            type="submit"
            className="w-full rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 flex items-center justify-center gap-2"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24">
              <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                fill="#4285F4"
              />
              <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
              />
              <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                fill="#FBBC05"
              />
              <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                fill="#EA4335"
              />
            </svg>
            Entrar com Google
          </button>
        </form>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Verificar TypeScript**

```bash
npx tsc --noEmit
```

Esperado: sem erros.

- [ ] **Step 4: Commit**

```bash
git add src/actions/auth/login-admin.ts src/app/login/page.tsx
git commit -m "feat: login admin — email/senha + Google OAuth"
```

---

### Task 3: Callback `/auth/confirm`

**Files:**
- Create: `src/app/auth/confirm/route.ts`

**Interfaces:**
- Consumes: `createSupabaseServerClient` de `src/lib/supabase/server.ts`, `prisma` de `src/lib/prisma.ts`
- Produces: Route Handler GET — troca token ou code, cria `UsuarioGabinete` (upsert), redireciona para `/g/[slug]/admin/`

**Casos tratados:**
- `?token_hash=...&type=...` — invite/magiclink (Supabase Admin `inviteUserByEmail` ou `generateLink`)
- `?code=...` — Google OAuth
- `app_metadata.gabineteId` ausente — race condition ou tentativa não autorizada
- Gabinete inexistente ou inativo — abortar

- [ ] **Step 1: Criar src/app/auth/confirm/route.ts**

```typescript
import { type EmailOtpType } from '@supabase/supabase-js'
import { type NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl
  const code = searchParams.get('code')
  const token_hash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null

  const supabase = createSupabaseServerClient()

  // Troca token ou code por sessão
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (error) {
      return NextResponse.redirect(
        new URL('/login?erro=invite_invalid', origin)
      )
    }
  } else if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash, type })
    if (error) {
      return NextResponse.redirect(
        new URL('/login?erro=invite_invalid', origin)
      )
    }
  } else {
    return NextResponse.redirect(new URL('/login?erro=invite_invalid', origin))
  }

  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    return NextResponse.redirect(new URL('/login?erro=invite_invalid', origin))
  }

  // Verificar app_metadata.gabineteId — race condition ou acesso não autorizado
  const gabineteId = session.user.app_metadata?.gabineteId as string | undefined

  if (!gabineteId) {
    await supabase.auth.signOut()
    return NextResponse.redirect(
      new URL('/login?erro=invite_invalid', origin)
    )
  }

  // Verificar que o gabinete existe
  const gabinete = await prisma.gabinete.findUnique({
    where: { id: gabineteId },
    select: { id: true, slug: true, ativo: true },
  })

  if (!gabinete) {
    await supabase.auth.signOut()
    return NextResponse.redirect(
      new URL('/login?erro=gabinete_not_found', origin)
    )
  }

  // Upsert UsuarioGabinete — idempotente (double-click / retry seguro)
  await prisma.usuarioGabinete.upsert({
    where: {
      userId_gabineteId: { userId: session.user.id, gabineteId },
    },
    create: { userId: session.user.id, gabineteId, papel: 'admin' },
    update: {},
  })

  return NextResponse.redirect(
    new URL(`/g/${gabinete.slug}/admin/`, origin)
  )
}
```

- [ ] **Step 2: Verificar TypeScript**

```bash
npx tsc --noEmit
```

Esperado: sem erros.

- [ ] **Step 3: Testar manualmente**

Para testar o callback sem um invite real:
1. No Supabase Auth dashboard, crie um usuário de teste com e-mail
2. Via Supabase SQL Editor, insira um `Gabinete` e defina `app_metadata.gabineteId` no usuário via SQL:
   ```sql
   UPDATE auth.users
   SET raw_app_meta_data = raw_app_meta_data || '{"gabineteId": "<id_do_gabinete>"}'
   WHERE email = 'teste@exemplo.com';
   ```
3. Dispare `supabase.auth.admin.generateLink({ type: 'magiclink', email: 'teste@exemplo.com', options: { redirectTo: 'http://localhost:3000/auth/confirm' } })` via Supabase JS console
4. Acesse o link — esperado: `UsuarioGabinete` criado, redirect para `/g/[slug]/admin/`

- [ ] **Step 4: Commit**

```bash
git add src/app/auth/confirm/route.ts
git commit -m "feat: callback /auth/confirm — invite e Google OAuth"
```

---

### Task 4: Super-admin — layout + listagem de gabinetes

**Files:**
- Create: `src/app/super-admin/layout.tsx`
- Create: `src/app/super-admin/page.tsx`

**Interfaces:**
- Consumes: `createSupabaseServerClient` de `src/lib/supabase/server.ts`, `prisma`
- Produces: layout com guard de role; página com tabela de gabinetes + stats

- [ ] **Step 1: Criar src/app/super-admin/layout.tsx**

```typescript
import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export default async function SuperAdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = createSupabaseServerClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  // Defesa em profundidade — middleware já verifica, mas duplicar garante
  if (!session || session.user.app_metadata?.role !== 'super-admin') {
    redirect('/super-admin/login')
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <span className="font-semibold text-gray-900">Rede Mobiliza — Super Admin</span>
        <form action="/api/auth/logout" method="POST">
          <button type="submit" className="text-sm text-gray-500 hover:text-gray-700">
            Sair
          </button>
        </form>
      </header>
      <main className="max-w-6xl mx-auto px-6 py-8">{children}</main>
    </div>
  )
}
```

**Nota:** o botão "Sair" do layout usa `/api/auth/logout` — adicionar este Route Handler logo abaixo.

- [ ] **Step 2: Criar src/app/api/auth/logout/route.ts**

```typescript
import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export async function POST() {
  const supabase = createSupabaseServerClient()
  await supabase.auth.signOut()
  return NextResponse.redirect(new URL('/login', process.env.NEXT_PUBLIC_APP_URL!))
}
```

- [ ] **Step 3: Criar src/app/super-admin/page.tsx**

```typescript
import Link from 'next/link'
import { prisma } from '@/lib/prisma'

export default async function SuperAdminPage() {
  const gabinetes = await prisma.gabinete.findMany({
    orderBy: { criadoEm: 'desc' },
    select: {
      id: true,
      nome: true,
      slug: true,
      ativo: true,
      criadoEm: true,
      _count: {
        select: {
          pessoas: true,
          segmentos: true,
          vinculos: { where: { nivel: 0 } }, // mobilizadores raiz
        },
      },
    },
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Gabinetes</h1>
        <Link
          href="/super-admin/gabinetes/novo"
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Novo gabinete
        </Link>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Nome</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Slug</th>
              <th className="px-4 py-3 text-right font-medium text-gray-600">Pessoas</th>
              <th className="px-4 py-3 text-right font-medium text-gray-600">Segmentos</th>
              <th className="px-4 py-3 text-center font-medium text-gray-600">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {gabinetes.map((g) => (
              <tr key={g.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-900">{g.nome}</td>
                <td className="px-4 py-3 text-gray-500 font-mono text-xs">{g.slug}</td>
                <td className="px-4 py-3 text-right text-gray-600">{g._count.pessoas}</td>
                <td className="px-4 py-3 text-right text-gray-600">{g._count.segmentos}</td>
                <td className="px-4 py-3 text-center">
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                      g.ativo
                        ? 'bg-green-100 text-green-700'
                        : 'bg-gray-100 text-gray-500'
                    }`}
                  >
                    {g.ativo ? 'Ativo' : 'Inativo'}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <Link
                    href={`/super-admin/gabinetes/${g.id}`}
                    className="text-blue-600 hover:underline text-xs"
                  >
                    Gerenciar
                  </Link>
                </td>
              </tr>
            ))}
            {gabinetes.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                  Nenhum gabinete cadastrado ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Verificar TypeScript**

```bash
npx tsc --noEmit
```

Esperado: sem erros.

- [ ] **Step 5: Testar manualmente**

1. Faça login como super-admin em `/super-admin/login`
2. Esperado: redireciona para `/super-admin/` com tabela de gabinetes (vazia inicialmente)

- [ ] **Step 6: Commit**

```bash
git add src/app/super-admin/layout.tsx src/app/super-admin/page.tsx src/app/api/auth/logout/route.ts
git commit -m "feat: super-admin layout + listagem de gabinetes"
```

---

### Task 5: Criar + editar gabinete + toggle ativo

**Files:**
- Create: `src/actions/super-admin/criar-gabinete.ts`
- Create: `src/actions/super-admin/editar-gabinete.ts`
- Create: `src/actions/super-admin/toggle-gabinete.ts`
- Create: `src/app/super-admin/gabinetes/novo/page.tsx`
- Create: `src/app/super-admin/gabinetes/[id]/editar/page.tsx`

**Interfaces:**
- Consumes: `prisma`, `toSlug` de `src/lib/slug.ts`
- Produces:
  - `criarGabinete(formData)` — cria `Gabinete`, redireciona para o detalhe
  - `editarGabinete(id, formData)` — atualiza campos, redireciona para o detalhe
  - `toggleGabinete(id, ativo)` — inverte `ativo`, redireciona para listagem

- [ ] **Step 1: Criar src/actions/super-admin/criar-gabinete.ts**

```typescript
'use server'

import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { toSlug } from '@/lib/slug'

export async function criarGabinete(formData: FormData) {
  const nome = (formData.get('nome') as string).trim()
  const corPrimaria = (formData.get('corPrimaria') as string) || '#1D4ED8'
  const corSecundaria = (formData.get('corSecundaria') as string) || '#3B82F6'
  const slug = toSlug(nome)

  if (!nome || !slug) {
    redirect('/super-admin/gabinetes/novo?erro=nome_obrigatorio')
  }

  const existe = await prisma.gabinete.findUnique({ where: { slug } })
  if (existe) {
    redirect('/super-admin/gabinetes/novo?erro=slug_duplicado')
  }

  const gabinete = await prisma.gabinete.create({
    data: { nome, slug, corPrimaria, corSecundaria },
  })

  redirect(`/super-admin/gabinetes/${gabinete.id}`)
}
```

- [ ] **Step 2: Criar src/actions/super-admin/editar-gabinete.ts**

```typescript
'use server'

import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { toSlug } from '@/lib/slug'

export async function editarGabinete(id: string, formData: FormData) {
  const nome = (formData.get('nome') as string).trim()
  const corPrimaria = formData.get('corPrimaria') as string
  const corSecundaria = formData.get('corSecundaria') as string
  const slug = toSlug(nome)

  if (!nome || !slug) {
    redirect(`/super-admin/gabinetes/${id}/editar?erro=nome_obrigatorio`)
  }

  // Verificar duplicidade de slug (excluindo o próprio gabinete)
  const duplicado = await prisma.gabinete.findFirst({
    where: { slug, id: { not: id } },
  })
  if (duplicado) {
    redirect(`/super-admin/gabinetes/${id}/editar?erro=slug_duplicado`)
  }

  await prisma.gabinete.update({
    where: { id },
    data: { nome, slug, corPrimaria, corSecundaria },
  })

  redirect(`/super-admin/gabinetes/${id}`)
}
```

- [ ] **Step 3: Criar src/actions/super-admin/toggle-gabinete.ts**

```typescript
'use server'

import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'

export async function toggleGabinete(id: string, ativoAtual: boolean) {
  await prisma.gabinete.update({
    where: { id },
    data: { ativo: !ativoAtual },
  })

  redirect('/super-admin/')
}
```

- [ ] **Step 4: Criar src/app/super-admin/gabinetes/novo/page.tsx**

```typescript
import { criarGabinete } from '@/actions/super-admin/criar-gabinete'

interface Props {
  searchParams: { erro?: string }
}

const erros: Record<string, string> = {
  nome_obrigatorio: 'O nome do gabinete é obrigatório.',
  slug_duplicado: 'Já existe um gabinete com este nome (slug duplicado). Escolha um nome diferente.',
}

export default function NovoGabinetePage({ searchParams }: Props) {
  const erro = searchParams.erro ? erros[searchParams.erro] : null

  return (
    <div className="max-w-lg space-y-6">
      <h1 className="text-xl font-bold text-gray-900">Novo Gabinete</h1>

      {erro && (
        <div className="rounded-md bg-red-50 border border-red-200 p-3">
          <p className="text-sm text-red-700">{erro}</p>
        </div>
      )}

      <form action={criarGabinete} className="space-y-4">
        <div>
          <label htmlFor="nome" className="block text-sm font-medium text-gray-700 mb-1">
            Nome do gabinete
          </label>
          <input
            id="nome"
            name="nome"
            type="text"
            required
            placeholder="ex: Gabinete João Silva"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <p className="mt-1 text-xs text-gray-400">
            O slug é gerado automaticamente a partir do nome.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="corPrimaria" className="block text-sm font-medium text-gray-700 mb-1">
              Cor primária
            </label>
            <input
              id="corPrimaria"
              name="corPrimaria"
              type="color"
              defaultValue="#1D4ED8"
              className="h-10 w-full rounded-md border border-gray-300 cursor-pointer"
            />
          </div>
          <div>
            <label htmlFor="corSecundaria" className="block text-sm font-medium text-gray-700 mb-1">
              Cor secundária
            </label>
            <input
              id="corSecundaria"
              name="corSecundaria"
              type="color"
              defaultValue="#3B82F6"
              className="h-10 w-full rounded-md border border-gray-300 cursor-pointer"
            />
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Criar gabinete
          </button>
          <a
            href="/super-admin/"
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancelar
          </a>
        </div>
      </form>
    </div>
  )
}
```

- [ ] **Step 5: Criar src/app/super-admin/gabinetes/[id]/editar/page.tsx**

```typescript
import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { editarGabinete } from '@/actions/super-admin/editar-gabinete'

interface Props {
  params: { id: string }
  searchParams: { erro?: string }
}

const erros: Record<string, string> = {
  nome_obrigatorio: 'O nome do gabinete é obrigatório.',
  slug_duplicado: 'Já existe um gabinete com este nome. Escolha um nome diferente.',
}

export default async function EditarGabinetePage({ params, searchParams }: Props) {
  const gabinete = await prisma.gabinete.findUnique({
    where: { id: params.id },
    select: { id: true, nome: true, corPrimaria: true, corSecundaria: true },
  })

  if (!gabinete) notFound()

  const erro = searchParams.erro ? erros[searchParams.erro] : null
  const action = editarGabinete.bind(null, gabinete.id)

  return (
    <div className="max-w-lg space-y-6">
      <h1 className="text-xl font-bold text-gray-900">Editar Gabinete</h1>

      {erro && (
        <div className="rounded-md bg-red-50 border border-red-200 p-3">
          <p className="text-sm text-red-700">{erro}</p>
        </div>
      )}

      <form action={action} className="space-y-4">
        <div>
          <label htmlFor="nome" className="block text-sm font-medium text-gray-700 mb-1">
            Nome do gabinete
          </label>
          <input
            id="nome"
            name="nome"
            type="text"
            required
            defaultValue={gabinete.nome}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="corPrimaria" className="block text-sm font-medium text-gray-700 mb-1">
              Cor primária
            </label>
            <input
              id="corPrimaria"
              name="corPrimaria"
              type="color"
              defaultValue={gabinete.corPrimaria}
              className="h-10 w-full rounded-md border border-gray-300 cursor-pointer"
            />
          </div>
          <div>
            <label htmlFor="corSecundaria" className="block text-sm font-medium text-gray-700 mb-1">
              Cor secundária
            </label>
            <input
              id="corSecundaria"
              name="corSecundaria"
              type="color"
              defaultValue={gabinete.corSecundaria}
              className="h-10 w-full rounded-md border border-gray-300 cursor-pointer"
            />
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Salvar alterações
          </button>
          <a
            href={`/super-admin/gabinetes/${gabinete.id}`}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancelar
          </a>
        </div>
      </form>
    </div>
  )
}
```

- [ ] **Step 6: Verificar TypeScript**

```bash
npx tsc --noEmit
```

Esperado: sem erros.

- [ ] **Step 7: Commit**

```bash
git add src/actions/super-admin/criar-gabinete.ts src/actions/super-admin/editar-gabinete.ts src/actions/super-admin/toggle-gabinete.ts src/app/super-admin/gabinetes/
git commit -m "feat: super-admin criar/editar/toggle gabinete"
```

---

### Task 6: Convidar admin + reenviar convite

**Files:**
- Create: `src/actions/super-admin/convidar-admin.ts`
- Create: `src/actions/super-admin/reenviar-convite.ts`
- Create: `src/app/super-admin/gabinetes/[id]/page.tsx`

**Interfaces:**
- Consumes: `supabaseAdmin` de `src/lib/supabase/admin.ts`, `prisma`
- Produces:
  - `convidarAdmin(gabineteId, formData)` — `inviteUserByEmail` → `updateUserById`
  - `reenviarConvite(gabineteId, email)` — verifica `app_metadata.gabineteId`, garante `updateUserById` antes de `generateLink`, retorna link para o super-admin enviar
  - Página de detalhe do gabinete com lista de admins + formulário de convite

- [ ] **Step 1: Criar src/actions/super-admin/convidar-admin.ts**

```typescript
'use server'

import { redirect } from 'next/navigation'
import { supabaseAdmin } from '@/lib/supabase/admin'

export async function convidarAdmin(gabineteId: string, formData: FormData) {
  const email = (formData.get('email') as string).trim().toLowerCase()

  if (!email) {
    redirect(`/super-admin/gabinetes/${gabineteId}?erro=email_obrigatorio`)
  }

  // Passo 1: criar usuário e enviar e-mail de convite
  const { data: invite, error: inviteError } =
    await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/confirm`,
    })

  if (inviteError) {
    if (inviteError.message.includes('already registered')) {
      // Usuário já existe — orientar a usar reenviar convite
      redirect(
        `/super-admin/gabinetes/${gabineteId}?erro=usuario_ja_existe&email=${encodeURIComponent(email)}`
      )
    }
    redirect(`/super-admin/gabinetes/${gabineteId}?erro=convite_falhou`)
  }

  const userId = invite.user.id

  // Passo 2: gravar gabineteId em app_metadata via service role key
  const { error: updateError } =
    await supabaseAdmin.auth.admin.updateUserById(userId, {
      app_metadata: { gabineteId, papel: 'admin' },
    })

  if (updateError) {
    // updateUserById falhou — convite foi enviado mas metadata não foi gravado.
    // Admin precisará usar "reenviar convite" após resolver o erro.
    redirect(`/super-admin/gabinetes/${gabineteId}?erro=metadata_falhou&userId=${userId}`)
  }

  redirect(
    `/super-admin/gabinetes/${gabineteId}?sucesso=convite_enviado`
  )
}
```

- [ ] **Step 2: Criar src/actions/super-admin/reenviar-convite.ts**

```typescript
'use server'

import { supabaseAdmin } from '@/lib/supabase/admin'

interface ReenviarResult {
  link?: string
  erro?: string
}

export async function reenviarConvite(
  gabineteId: string,
  email: string
): Promise<ReenviarResult> {
  // Buscar usuário pelo e-mail
  const { data: users, error: listError } =
    await supabaseAdmin.auth.admin.listUsers()

  if (listError) return { erro: 'Erro ao buscar usuário.' }

  const usuario = users.users.find(
    (u) => u.email?.toLowerCase() === email.toLowerCase()
  )

  if (!usuario) {
    return { erro: 'Usuário não encontrado. Use "Convidar admin" para criar o convite.' }
  }

  // Garantir que app_metadata.gabineteId está gravado antes de gerar o link
  const metaGabineteId = usuario.app_metadata?.gabineteId
  if (!metaGabineteId || metaGabineteId !== gabineteId) {
    const { error: updateError } =
      await supabaseAdmin.auth.admin.updateUserById(usuario.id, {
        app_metadata: { gabineteId, papel: 'admin' },
      })
    if (updateError) {
      return {
        erro: 'Não foi possível atualizar os dados do usuário. Tente novamente.',
      }
    }
  }

  // Gerar novo link de autenticação (type: 'magiclink' — garantido para usuários existentes)
  const { data: linkData, error: linkError } =
    await supabaseAdmin.auth.admin.generateLink({
      type: 'magiclink',
      email,
      options: {
        redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/confirm`,
      },
    })

  if (linkError || !linkData.properties?.action_link) {
    return { erro: 'Não foi possível gerar o link. Tente novamente.' }
  }

  // generateLink NÃO envia e-mail automaticamente — link deve ser enviado manualmente
  return { link: linkData.properties.action_link }
}
```

- [ ] **Step 3: Criar src/app/super-admin/gabinetes/[id]/page.tsx**

```typescript
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { convidarAdmin } from '@/actions/super-admin/convidar-admin'
import { reenviarConvite } from '@/actions/super-admin/reenviar-convite'
import { toggleGabinete } from '@/actions/super-admin/toggle-gabinete'

interface Props {
  params: { id: string }
  searchParams: {
    sucesso?: string
    erro?: string
    email?: string
    reenvioLink?: string
  }
}

const mensagensSucesso: Record<string, string> = {
  convite_enviado: 'Convite enviado com sucesso!',
}

const mensagensErro: Record<string, string> = {
  email_obrigatorio: 'Informe o e-mail do admin.',
  usuario_ja_existe:
    'Este e-mail já está cadastrado. Use "Reenviar convite" abaixo.',
  convite_falhou: 'Erro ao enviar convite. Tente novamente.',
  metadata_falhou:
    'Convite enviado, mas houve erro ao gravar permissões. Use "Reenviar convite" para corrigir.',
}

export default async function GabineteDetalhePage({ params, searchParams }: Props) {
  const gabinete = await prisma.gabinete.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      nome: true,
      slug: true,
      ativo: true,
      corPrimaria: true,
      corSecundaria: true,
      criadoEm: true,
      _count: { select: { pessoas: true, segmentos: true } },
    },
  })

  if (!gabinete) notFound()

  const admins = await prisma.usuarioGabinete.findMany({
    where: { gabineteId: gabinete.id, papel: 'admin' },
    select: { id: true, userId: true, criadoEm: true },
    orderBy: { criadoEm: 'asc' },
  })

  const sucesso = searchParams.sucesso ? mensagensSucesso[searchParams.sucesso] : null
  const erro = searchParams.erro ? mensagensErro[searchParams.erro] : null
  const emailReenvio = searchParams.email

  // Bound actions
  const convidarAction = convidarAdmin.bind(null, gabinete.id)
  const toggleAction = toggleGabinete.bind(null, gabinete.id, gabinete.ativo)

  return (
    <div className="space-y-8 max-w-2xl">
      {/* Cabeçalho */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{gabinete.nome}</h1>
          <p className="text-sm text-gray-500 font-mono mt-1">/g/{gabinete.slug}/</p>
        </div>
        <div className="flex gap-2">
          <Link
            href={`/super-admin/gabinetes/${gabinete.id}/editar`}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
          >
            Editar
          </Link>
          <form action={toggleAction}>
            <button
              type="submit"
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                gabinete.ativo
                  ? 'bg-red-50 text-red-600 hover:bg-red-100'
                  : 'bg-green-50 text-green-600 hover:bg-green-100'
              }`}
            >
              {gabinete.ativo ? 'Desativar' : 'Ativar'}
            </button>
          </form>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Pessoas', value: gabinete._count.pessoas },
          { label: 'Segmentos', value: gabinete._count.segmentos },
          { label: 'Admins', value: admins.length },
        ].map(({ label, value }) => (
          <div key={label} className="bg-white rounded-lg border border-gray-200 p-4 text-center">
            <p className="text-2xl font-bold text-gray-900">{value}</p>
            <p className="text-sm text-gray-500 mt-1">{label}</p>
          </div>
        ))}
      </div>

      {/* Admins */}
      <div className="space-y-3">
        <h2 className="text-base font-semibold text-gray-900">Administradores</h2>
        {admins.length === 0 ? (
          <p className="text-sm text-gray-400">Nenhum admin cadastrado ainda.</p>
        ) : (
          <ul className="space-y-2">
            {admins.map((a) => (
              <li
                key={a.id}
                className="rounded-md border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700"
              >
                <span className="font-mono text-xs text-gray-500">{a.userId}</span>
                <span className="ml-3 text-gray-400 text-xs">
                  desde {new Date(a.criadoEm).toLocaleDateString('pt-BR')}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Convidar admin */}
      <div className="space-y-3">
        <h2 className="text-base font-semibold text-gray-900">Convidar novo admin</h2>

        {sucesso && (
          <div className="rounded-md bg-green-50 border border-green-200 p-3">
            <p className="text-sm text-green-700">{sucesso}</p>
          </div>
        )}
        {erro && (
          <div className="rounded-md bg-red-50 border border-red-200 p-3">
            <p className="text-sm text-red-700">{erro}</p>
          </div>
        )}

        <form action={convidarAction} className="flex gap-2">
          <input
            name="email"
            type="email"
            required
            placeholder="email@exemplo.com"
            defaultValue={emailReenvio ?? ''}
            className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="submit"
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Enviar convite
          </button>
        </form>

        {/* Reenviar convite — exibido quando emailReenvio está presente */}
        {emailReenvio && (
          <ReenviarConviteSection
            gabineteId={gabinete.id}
            email={emailReenvio}
          />
        )}
      </div>

      {/* Modo suporte — Task 7 */}
      <ModoSuporteSection gabineteId={gabinete.id} gabineteNome={gabinete.nome} />
    </div>
  )
}

// Client Components inline para interações com estado
// (implementados na Task 7 para modo suporte; aqui só a seção de reenvio)

async function ReenviarConviteSection({
  gabineteId,
  email,
}: {
  gabineteId: string
  email: string
}) {
  // Server Component que chama reenviarConvite — exibido apenas quando emailReenvio presente
  const resultado = await reenviarConvite(gabineteId, email)

  if (resultado.erro) {
    return (
      <div className="rounded-md bg-amber-50 border border-amber-200 p-3">
        <p className="text-sm text-amber-700">Reenvio: {resultado.erro}</p>
      </div>
    )
  }

  return (
    <div className="rounded-md bg-blue-50 border border-blue-200 p-3 space-y-2">
      <p className="text-sm font-medium text-blue-800">Link gerado — envie manualmente ao admin:</p>
      <p className="text-xs font-mono text-blue-700 break-all select-all bg-white rounded p-2 border border-blue-200">
        {resultado.link}
      </p>
      <p className="text-xs text-blue-600">
        Este link é de uso único. O Supabase não enviará e-mail automaticamente.
      </p>
    </div>
  )
}

function ModoSuporteSection({
  gabineteId,
  gabineteNome,
}: {
  gabineteId: string
  gabineteNome: string
}) {
  // Implementado na Task 7
  return (
    <div className="space-y-3">
      <h2 className="text-base font-semibold text-gray-900">Modo suporte</h2>
      <p className="text-sm text-gray-400">
        Em construção — implementado na Task 7.
      </p>
    </div>
  )
}
```

**Nota:** `ReenviarConviteSection` é um Server Component que chama `reenviarConvite` diretamente — funciona pois é renderizado server-side. O link é exibido na página (não enviado por e-mail automaticamente).

- [ ] **Step 4: Verificar TypeScript**

```bash
npx tsc --noEmit
```

Esperado: sem erros.

- [ ] **Step 5: Testar manualmente**

1. Criar um gabinete
2. Na página de detalhe, enviar convite com um e-mail real
3. Checar Supabase Auth → usuários para confirmar criação + `app_metadata.gabineteId` gravado
4. Verificar que o e-mail de convite foi enviado (checar inbox)

- [ ] **Step 6: Commit**

```bash
git add src/actions/super-admin/ src/app/super-admin/gabinetes/[id]/page.tsx
git commit -m "feat: convidar admin + reenviar convite com generateLink"
```

---

### Task 7: Modo suporte — helper (TDD) + entrar + sair

**Files:**
- Create: `src/lib/__tests__/modo-suporte.test.ts`
- Create: `src/lib/modo-suporte.ts`
- Modify: `src/app/super-admin/gabinetes/[id]/page.tsx` (substituir `ModoSuporteSection` placeholder)

**Interfaces:**
- Produces:
  - `readSuporteSessao(role, cookieValue)` — valida role, parseia cookie, lança em caso de malformação
  - `entrarModoSuporte(gabineteId)` — Server Action: cria `LogSuporte`, define cookie, redireciona
  - `sairModoSuporte()` — Server Action: atualiza `LogSuporte`, remove cookie, redireciona

- [ ] **Step 1: Escrever os testes antes da implementação**

Criar `src/lib/__tests__/modo-suporte.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { readSuporteSessao } from '../modo-suporte'

describe('readSuporteSessao', () => {
  it('lança se role não é super-admin', () => {
    expect(() =>
      readSuporteSessao('admin', JSON.stringify({ gabineteId: 'abc', sessaoId: '123' }))
    ).toThrow()
  })

  it('lança se role é undefined', () => {
    expect(() =>
      readSuporteSessao(undefined, JSON.stringify({ gabineteId: 'abc', sessaoId: '123' }))
    ).toThrow()
  })

  it('retorna null se cookie ausente', () => {
    expect(readSuporteSessao('super-admin', undefined)).toBeNull()
  })

  it('retorna null se cookie é string vazia', () => {
    expect(readSuporteSessao('super-admin', '')).toBeNull()
  })

  it('lança com mensagem específica se gabineteId ausente', () => {
    expect(() =>
      readSuporteSessao('super-admin', JSON.stringify({ sessaoId: '123' }))
    ).toThrow('cookie suporteSessao malformado')
  })

  it('lança com mensagem específica se sessaoId ausente', () => {
    expect(() =>
      readSuporteSessao('super-admin', JSON.stringify({ gabineteId: 'abc' }))
    ).toThrow('cookie suporteSessao malformado')
  })

  it('retorna { gabineteId, sessaoId } para cookie válido', () => {
    const result = readSuporteSessao(
      'super-admin',
      JSON.stringify({ gabineteId: 'abc', sessaoId: '123' })
    )
    expect(result).toEqual({ gabineteId: 'abc', sessaoId: '123' })
  })
})
```

- [ ] **Step 2: Executar os testes e confirmar que falham**

```bash
npm test
```

Esperado: FAIL — "Cannot find module '../modo-suporte'"

- [ ] **Step 3: Implementar src/lib/modo-suporte.ts**

```typescript
export type SuporteSessao = {
  gabineteId: string
  sessaoId: string
}

export function readSuporteSessao(
  role: string | undefined,
  cookieValue: string | undefined
): SuporteSessao | null {
  if (role !== 'super-admin') {
    throw new Error('readSuporteSessao: role inválido — acesso negado')
  }
  if (!cookieValue) return null

  const parsed = JSON.parse(cookieValue) as Record<string, unknown>
  const { gabineteId, sessaoId } = parsed

  if (!gabineteId || !sessaoId) {
    throw new Error('cookie suporteSessao malformado')
  }

  return {
    gabineteId: gabineteId as string,
    sessaoId: sessaoId as string,
  }
}
```

- [ ] **Step 4: Executar os testes e confirmar que passam**

```bash
npm test
```

Esperado: 7 testes PASS em `src/lib/__tests__/modo-suporte.test.ts`.

- [ ] **Step 5: Criar Server Actions de modo suporte**

Adicionar ao fim de `src/app/super-admin/gabinetes/[id]/page.tsx`, antes do export default, as Server Actions:

```typescript
'use server'
// (adicionar no topo do arquivo)
import { cookies } from 'next/headers'
import { createId } from '@paralleldrive/cuid2'
// (ou: import { createId } from 'cuid' — usar a mesma lib do schema Prisma)
```

Criar `src/actions/super-admin/modo-suporte.ts`:

```typescript
'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'

function gerarSessaoId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export async function entrarModoSuporte(gabineteId: string) {
  const supabase = createSupabaseServerClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session || session.user.app_metadata?.role !== 'super-admin') {
    redirect('/super-admin/login')
  }

  const sessaoId = gerarSessaoId()

  await prisma.logSuporte.create({
    data: {
      gabineteId,
      superAdminUserId: session.user.id,
      acao: 'acesso_inicio',
      sessaoId,
    },
  })

  cookies().set('suporteSessao', JSON.stringify({ gabineteId, sessaoId }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
  })

  redirect(`/g/${await getSlug(gabineteId)}/admin/`)
}

export async function sairModoSuporte(gabineteId: string, sessaoId: string) {
  const supabase = createSupabaseServerClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session || session.user.app_metadata?.role !== 'super-admin') {
    redirect('/super-admin/login')
  }

  // Registrar saída — busca o log de início desta sessão e atualiza saidoEm
  await prisma.logSuporte.create({
    data: {
      gabineteId,
      superAdminUserId: session.user.id,
      acao: 'acesso_fim',
      sessaoId,
      saidoEm: new Date(),
    },
  })

  cookies().delete('suporteSessao')

  redirect('/super-admin/')
}

async function getSlug(gabineteId: string): Promise<string> {
  const g = await prisma.gabinete.findUnique({
    where: { id: gabineteId },
    select: { slug: true },
  })
  return g?.slug ?? ''
}
```

- [ ] **Step 6: Substituir ModoSuporteSection placeholder na página de detalhe**

Em `src/app/super-admin/gabinetes/[id]/page.tsx`, substituir:

```typescript
function ModoSuporteSection({
  gabineteId,
  gabineteNome,
}: {
  gabineteId: string
  gabineteNome: string
}) {
  // Implementado na Task 7
  return (
    <div className="space-y-3">
      <h2 className="text-base font-semibold text-gray-900">Modo suporte</h2>
      <p className="text-sm text-gray-400">
        Em construção — implementado na Task 7.
      </p>
    </div>
  )
}
```

Por:

```typescript
import { entrarModoSuporte, sairModoSuporte } from '@/actions/super-admin/modo-suporte'

function ModoSuporteSection({
  gabineteId,
  gabineteNome,
}: {
  gabineteId: string
  gabineteNome: string
}) {
  const entrarAction = entrarModoSuporte.bind(null, gabineteId)

  return (
    <div className="space-y-3">
      <h2 className="text-base font-semibold text-gray-900">Modo suporte</h2>
      <p className="text-sm text-gray-500">
        Acessa o painel de <strong>{gabineteNome}</strong> como suporte. Todas as
        ações serão registradas no log.
      </p>
      <form action={entrarAction}>
        <button
          type="submit"
          className="rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700"
        >
          Entrar em modo suporte
        </button>
      </form>
    </div>
  )
}
```

Também adicionar no topo da página (import):
```typescript
import { entrarModoSuporte, sairModoSuporte } from '@/actions/super-admin/modo-suporte'
```

O botão "Sair do modo suporte" será implementado no painel admin do gabinete (Plano 3) — onde o super-admin em modo suporte verá o banner de suporte ativo.

- [ ] **Step 7: Verificar TypeScript e testes**

```bash
npx tsc --noEmit && npm test
```

Esperado: sem erros TypeScript, 7+ testes PASS.

- [ ] **Step 8: Testar manualmente**

1. Na página de detalhe de um gabinete, clicar em "Entrar em modo suporte"
2. Esperado: redireciona para `/g/[slug]/admin/`, cookie `suporteSessao` definido (verificar em DevTools → Application → Cookies)
3. Verificar que `LogSuporte` foi criado no Supabase com `acao="acesso_inicio"`

- [ ] **Step 9: Commit**

```bash
git add src/lib/modo-suporte.ts src/lib/__tests__/modo-suporte.test.ts src/actions/super-admin/modo-suporte.ts src/app/super-admin/gabinetes/[id]/page.tsx
git commit -m "feat: modo suporte — helper TDD + entrar + sair + log"
```

---

## Self-Review

### 1. Spec coverage

| Requisito do spec | Coberto |
|---|---|
| Super-admin login separado (email/senha, `/super-admin/login`) | ✅ Task 1 |
| Middleware: `/super-admin/login` público | ✅ Task 1 |
| Middleware: unauthenticated → `/super-admin/login` (não `/login`) | ✅ Task 1 |
| Admin login em `/login` — email/senha | ✅ Task 2 |
| Google OAuth para admins — redireciona para `/auth/confirm` | ✅ Task 2 |
| Erro "não autorizado" se sem `UsuarioGabinete` | ✅ Task 2 |
| Erro se gabinete inativo | ✅ Task 2 |
| `/auth/confirm` — troca token_hash (invite/magiclink) | ✅ Task 3 |
| `/auth/confirm` — troca code (Google OAuth) | ✅ Task 3 |
| Abortar se `app_metadata.gabineteId` ausente (race condition) | ✅ Task 3 |
| Upsert `UsuarioGabinete` com chave `[userId, gabineteId]` | ✅ Task 3 |
| Super-admin: listagem de gabinetes com stats | ✅ Task 4 |
| Criar gabinete (nome, slug, cores) | ✅ Task 5 |
| Slug gerado via `toSlug()` | ✅ Task 5 |
| Editar gabinete | ✅ Task 5 |
| Toggle ativo/inativo | ✅ Task 5 |
| `inviteUserByEmail` → `updateUserById` em sequência | ✅ Task 6 |
| Detectar "User already registered" e orientar reenvio | ✅ Task 6 |
| `generateLink` com `type: 'magiclink'` | ✅ Task 6 |
| Pré-condição: `updateUserById` antes de `generateLink` | ✅ Task 6 |
| `generateLink` não envia e-mail — link exibido para envio manual | ✅ Task 6 |
| Cookie `suporteSessao` com payload JSON `{ gabineteId, sessaoId }` | ✅ Task 7 |
| `httpOnly, secure, sameSite:'strict', path:'/'` | ✅ Task 7 |
| Verificar `role === 'super-admin'` antes de ler cookie | ✅ Task 7 (`readSuporteSessao`) |
| `LogSuporte` com `acao="acesso_inicio"` na entrada | ✅ Task 7 |
| `LogSuporte` com `acao="acesso_fim"` + `saidoEm` na saída | ✅ Task 7 |
| `readSuporteSessao` validar gabineteId e sessaoId | ✅ Task 7 (TDD) |
| `app_metadata` (nunca `user_metadata`) | ✅ Tasks 1, 6 |

**Fora do escopo — Plano 3+:**
- Banner "modo suporte ativo" no painel admin (Plano 3)
- Botão "Sair do modo suporte" no painel admin (Plano 3)
- Guard de gabinete ativo no painel admin/mobilizador (Plano 3/4)
- Upload de logo e imagem de banner (Plano 3 — Personalização)

### 2. Placeholder scan

`ModoSuporteSection` substituída na Task 7 — nenhum placeholder restante ao final do plano.

### 3. Type consistency

- `readSuporteSessao(role: string | undefined, cookieValue: string | undefined): SuporteSessao | null` — assinatura usada consistentemente em testes e em `modo-suporte.ts`
- `entrarModoSuporte(gabineteId: string)`, `sairModoSuporte(gabineteId: string, sessaoId: string)` — `.bind(null, ...)` correto para Server Actions com parâmetros pré-fixados
- `convidarAdmin(gabineteId: string, formData: FormData)` — `bind(null, gabinete.id)` correto
- `editarGabinete(id: string, formData: FormData)` — `bind(null, gabinete.id)` correto
- `toggleGabinete(id: string, ativoAtual: boolean)` — `bind(null, gabinete.id, gabinete.ativo)` correto
