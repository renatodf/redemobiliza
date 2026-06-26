# Cadastro Público + Rede de Mobilização — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar o formulário público de cadastro em 3 passos, o callback de autenticação do mobilizador, as ações de tornar/revogar mobilizador no painel admin, e o painel do mobilizador com link pessoal e lista de convidados.

**Architecture:** Formulário público é um Client Component multi-passo que chama Server Actions; o callback `/auth/callback` é um Route Handler que troca código, valida email e cria `UsuarioGabinete`; o painel do mobilizador é Server Component com guard de papel no layout.

**Tech Stack:** Next.js 14 App Router, TypeScript strict, Prisma, Supabase Auth, Tailwind CSS, `qrcode` npm.

## Global Constraints

- Node.js ≥ 20, Next.js 14 App Router, TypeScript strict mode
- `Pessoa.userId String?` existe no schema (Plan 1) — campo que liga a Pessoa ao usuário Supabase do mobilizador
- `Pessoa.whatsapp String` — NOT nullable; todo cadastro público requer WhatsApp
- `Gabinete.imagemBannerUrl String?` — não `bannerUrl` (Plan 3 tem bug com este nome — corrigir ao implementar)
- `Segmento.tipo` valores: `interesse | grupo | evento | campanha` — formulário público exibe apenas segmentos `tipo='interesse'` no multi-select do Passo 3
- `tokenMobilizador` NUNCA retornado como campo direto em JSON — apenas embutido em URL string
- `origem` da Pessoa: `qrcode | link | indicacao | manual | instagram | facebook | whatsapp | importacao | null`
- Server Actions para mutações; `React.cache` para deduplicar DB calls
- Validar `gabinete.ativo` em toda rota pública antes de processar cadastro

---

## Mapa de Arquivos

| Arquivo | Responsabilidade |
|---|---|
| `src/app/auth/callback/route.ts` | Route Handler — fluxo de auth do mobilizador |
| `src/app/[slug]/cadastro/page.tsx` | Page pública — lê branding e params, renderiza form |
| `src/app/[slug]/cadastro/CadastroForm.tsx` | Client Component — máquina de estados multi-passo |
| `src/app/[slug]/cadastro/sucesso/page.tsx` | Page de sucesso pós-cadastro |
| `src/actions/publico/verificar-whatsapp.ts` | Server Action — verifica duplicidade de WhatsApp |
| `src/actions/publico/submeter-cadastro.ts` | Server Action — cria Pessoa + vínculos + redirect |
| `src/actions/admin/tornar-mobilizador.ts` | Server Action — promove pessoa a mobilizador |
| `src/actions/admin/revogar-mobilizador.ts` | Server Action — revoga mobilizador (transação) |
| `src/app/[slug]/mobilizador/layout.tsx` | Layout — guard papel='mobilizador' |
| `src/app/[slug]/mobilizador/page.tsx` | Painel do mobilizador |
| Modify: `src/app/[slug]/admin/pessoas/[pessoaId]/page.tsx` | Adicionar seção de mobilizador |

---

### Task 1: Route Handler `/auth/callback` (Fluxo do Mobilizador)

**Files:**
- Create: `src/app/auth/callback/route.ts`

**Interfaces:**
- Consome: `prisma` de `src/lib/prisma.ts`
- Consome: `supabaseAdmin` de `src/lib/supabase-admin.ts`
- URL de entrada: `/auth/callback?gabineteId=X&token=TOKEN_MOBILIZADOR&code=AUTH_CODE`
  - `code` é adicionado pelo Supabase ao redirecionar para o `redirectTo`
  - `gabineteId` e `token` vêm dos parâmetros que foram passados no `redirectTo` do `signInWithOtp`

Nota: `/auth/confirm` (Plan 2) lida com admins. `/auth/callback` (esta task) lida com mobilizadores.

- [ ] **Passo 1: Criar o Route Handler**

```typescript
// src/app/auth/callback/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const gabineteId = searchParams.get('gabineteId')
  const token = searchParams.get('token')

  const cookieStore = cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options)
          })
        },
      },
    }
  )

  if (!code || !gabineteId || !token) {
    return NextResponse.redirect(
      `${origin}/login?erro=link_invalido`,
    )
  }

  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
  if (exchangeError) {
    return NextResponse.redirect(`${origin}/login?erro=link_invalido`)
  }

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    return NextResponse.redirect(`${origin}/login?erro=link_invalido`)
  }

  // Buscar Pessoa pelo token de mobilizador
  const pessoa = await prisma.pessoa.findFirst({
    where: {
      gabineteId,
      tokenMobilizador: token,
      isMobilizador: true,
    },
    select: { id: true, email: true },
  })

  if (!pessoa) {
    await supabase.auth.signOut()
    return NextResponse.redirect(`${origin}/login?erro=link_invalido`)
  }

  // Validar email — case-insensitive
  const emailSessao = session.user.email?.toLowerCase() ?? ''
  const emailPessoa = pessoa.email?.toLowerCase() ?? ''
  if (!emailSessao || !emailPessoa || emailSessao !== emailPessoa) {
    await supabase.auth.signOut()
    return NextResponse.redirect(`${origin}/login?erro=link_invalido`)
  }

  // Criar ou atualizar UsuarioGabinete para o mobilizador
  await prisma.usuarioGabinete.upsert({
    where: { userId_gabineteId: { userId: session.user.id, gabineteId } },
    create: { userId: session.user.id, gabineteId, papel: 'mobilizador' },
    update: {},
  })

  // Vincular Pessoa.userId ao usuário Supabase (permite lookup no painel)
  await prisma.pessoa.update({
    where: { id: pessoa.id },
    data: { userId: session.user.id },
  })

  // Buscar slug do gabinete para redirect
  const gabinete = await prisma.gabinete.findUnique({
    where: { id: gabineteId },
    select: { slug: true },
  })

  if (!gabinete) {
    await supabase.auth.signOut()
    return NextResponse.redirect(`${origin}/login?erro=link_invalido`)
  }

  return NextResponse.redirect(`${origin}/${gabinete.slug}/mobilizador`)
}
```

- [ ] **Passo 2: Testar o callback**

```bash
# Este fluxo é testado end-to-end na Task 3 (após implementar tornar-mobilizador)
# Para verificar a rota existe e responde:
npm run dev
# Acessar /auth/callback sem parâmetros → deve redirecionar para /login?erro=link_invalido
curl -I "http://localhost:3000/auth/callback"
```

Saída esperada: redirect 307 para `/login?erro=link_invalido`.

- [ ] **Passo 3: Commit**

```bash
git add src/app/auth/callback/route.ts
git commit -m "feat: route handler /auth/callback para mobilizadores"
```

---

### Task 2: Formulário Público de Cadastro (Multi-Passo)

**Files:**
- Create: `src/app/[slug]/cadastro/page.tsx`
- Create: `src/app/[slug]/cadastro/CadastroForm.tsx`
- Create: `src/app/[slug]/cadastro/sucesso/page.tsx`
- Create: `src/actions/publico/verificar-whatsapp.ts`
- Create: `src/actions/publico/submeter-cadastro.ts`

**Interfaces:**
- `verificarWhatsApp(formData): Promise<{ existe: boolean; nome?: string; pessoaId?: string; whatsappNormalizado?: string; erro?: string }>`
- `submeterCadastro(formData): Promise<never>` — sempre redireciona (redirect)
- Consome: `normalizeWhatsApp` de `src/lib/whatsapp.ts` (Task 6 do Plano 3)
- Formulário público é acessível sem autenticação — não usa `createServerClient` autenticado

**Regras de origem:**
- `?utm_source=qrcode` → `origem = 'qrcode'`
- `?utm_source=instagram` → `origem = 'instagram'`
- `?utm_source=facebook` → `origem = 'facebook'`
- `?utm_source=whatsapp` → `origem = 'whatsapp'`
- `?mobilizador=TOKEN` presente (sem utm_source) → `origem = 'indicacao'`
- nenhum parâmetro → `origem = 'link'`

- [ ] **Passo 1: Criar Server Action `verificar-whatsapp`**

```typescript
// src/actions/publico/verificar-whatsapp.ts
'use server'

import { prisma } from '@/lib/prisma'
import { normalizeWhatsApp } from '@/lib/whatsapp'

export async function verificarWhatsApp(formData: FormData): Promise<{
  existe: boolean
  nome?: string
  pessoaId?: string
  whatsappNormalizado?: string
  erro?: string
}> {
  const slug = formData.get('slug') as string
  const whatsappRaw = (formData.get('whatsapp') as string).trim()

  const whatsappNormalizado = normalizeWhatsApp(whatsappRaw)
  if (!whatsappNormalizado) {
    return { existe: false, erro: 'Número de WhatsApp inválido. Digite com DDD (ex: 61 9 9999-9999).' }
  }

  const gabinete = await prisma.gabinete.findUnique({
    where: { slug },
    select: { id: true, ativo: true },
  })

  if (!gabinete || !gabinete.ativo) {
    return { existe: false, erro: 'Este cadastro não está disponível no momento.' }
  }

  const pessoa = await prisma.pessoa.findUnique({
    where: { gabineteId_whatsapp: { gabineteId: gabinete.id, whatsapp: whatsappNormalizado } },
    select: { id: true, nome: true },
  })

  if (pessoa) {
    return { existe: true, nome: pessoa.nome, pessoaId: pessoa.id, whatsappNormalizado }
  }

  return { existe: false, whatsappNormalizado }
}
```

- [ ] **Passo 2: Criar Server Action `submeter-cadastro`**

```typescript
// src/actions/publico/submeter-cadastro.ts
'use server'

import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { normalizeWhatsApp } from '@/lib/whatsapp'

export async function submeterCadastro(formData: FormData): Promise<never> {
  const slug = formData.get('slug') as string
  const whatsappNormalizado = formData.get('whatsappNormalizado') as string
  const isExistente = formData.get('isExistente') === 'true'
  const pessoaExistenteId = formData.get('pessoaExistenteId') as string | null
  const nome = (formData.get('nome') as string | null)?.trim() ?? ''
  const regiaoId = (formData.get('regiaoId') as string | null) || null
  const nascimentoStr = (formData.get('nascimento') as string | null) || null
  const genero = (formData.get('genero') as string | null) || null
  const profissaoId = (formData.get('profissaoId') as string | null) || null
  const email = (formData.get('email') as string | null)?.trim().toLowerCase() || null
  const interesseIds = formData.getAll('interesseId') as string[]
  const segmentoSlug = (formData.get('segmentoSlug') as string | null) || null
  const mobilizadorToken = (formData.get('mobilizadorToken') as string | null) || null
  const origemUtm = (formData.get('origemUtm') as string | null) || null

  const gabinete = await prisma.gabinete.findUnique({
    where: { slug },
    select: { id: true, ativo: true },
  })

  if (!gabinete || !gabinete.ativo) {
    redirect(`/${slug}/cadastro?erro=indisponivel`)
  }

  // Calcular origem
  const origem: string = (() => {
    if (origemUtm && ['qrcode', 'instagram', 'facebook', 'whatsapp', 'link'].includes(origemUtm)) {
      return origemUtm
    }
    if (mobilizadorToken) return 'indicacao'
    return 'link'
  })()

  let pessoaId: string

  if (isExistente && pessoaExistenteId) {
    // Pessoa já existe — só vincular
    pessoaId = pessoaExistenteId
  } else {
    // Criar nova pessoa
    if (!nome) redirect(`/${slug}/cadastro?erro=dados_invalidos`)
    if (!whatsappNormalizado) redirect(`/${slug}/cadastro?erro=dados_invalidos`)

    const whatsapp = normalizeWhatsApp(whatsappNormalizado) ?? whatsappNormalizado
    const nascimento = nascimentoStr ? new Date(nascimentoStr) : null

    const novaPessoa = await prisma.pessoa.create({
      data: {
        nome,
        whatsapp,
        email,
        regiaoId,
        profissaoId,
        nascimento,
        genero,
        origem,
        gabineteId: gabinete.id,
        isEquipe: false,
        isMobilizador: false,
      },
    })
    pessoaId = novaPessoa.id
  }

  let segmentoVinculado = false

  // Vincular ao segmento do link (se presente)
  if (segmentoSlug) {
    const segmento = await prisma.segmento.findFirst({
      where: { gabineteId: gabinete.id, slug: segmentoSlug, status: 'ativo' },
      select: { id: true },
    })
    if (segmento) {
      await prisma.pessoaSegmento.upsert({
        where: { pessoaId_segmentoId: { pessoaId, segmentoId: segmento.id } },
        create: { pessoaId, segmentoId: segmento.id },
        update: {},
      })
      segmentoVinculado = true
    }
  }

  // Vincular interesses selecionados (Passo 3)
  for (const interesseId of interesseIds) {
    // Validar que o segmento pertence ao gabinete e está ativo
    const segmento = await prisma.segmento.findFirst({
      where: { id: interesseId, gabineteId: gabinete.id, status: 'ativo', tipo: 'interesse' },
      select: { id: true },
    })
    if (segmento) {
      await prisma.pessoaSegmento.upsert({
        where: { pessoaId_segmentoId: { pessoaId, segmentoId: segmento.id } },
        create: { pessoaId, segmentoId: segmento.id },
        update: {},
      })
    }
  }

  // Vincular ao mobilizador (se token válido)
  if (mobilizadorToken) {
    const mobilizador = await prisma.pessoa.findFirst({
      where: {
        gabineteId: gabinete.id,
        tokenMobilizador: mobilizadorToken,
        isMobilizador: true,
      },
      select: { id: true },
    })

    if (mobilizador && mobilizador.id !== pessoaId) {
      // Calcular nivel: MIN(nivel do mobilizador na rede) + 1
      const vinculoMobilizador = await prisma.vinculoRede.findFirst({
        where: { pessoaId: mobilizador.id, gabineteId: gabinete.id },
        orderBy: { nivel: 'asc' },
        select: { nivel: true },
      })
      const nivel = (vinculoMobilizador?.nivel ?? 0) + 1

      // Idempotência — não criar duplicata
      const existeVinculo = await prisma.vinculoRede.findFirst({
        where: { gabineteId: gabinete.id, pessoaId, indicadoPorId: mobilizador.id },
        select: { id: true },
      })
      if (!existeVinculo) {
        await prisma.vinculoRede.create({
          data: {
            gabineteId: gabinete.id,
            pessoaId,
            indicadoPorId: mobilizador.id,
            nivel,
          },
        })
      }
    }
  }

  const aviso = segmentoSlug && !segmentoVinculado ? '?aviso=segmento_inativo' : ''
  redirect(`/${slug}/cadastro/sucesso${aviso}`)
}
```

- [ ] **Passo 3: Criar Client Component `CadastroForm`**

```typescript
// src/app/[slug]/cadastro/CadastroForm.tsx
'use client'

import { useState, useTransition } from 'react'
import { verificarWhatsApp } from '@/actions/publico/verificar-whatsapp'
import { submeterCadastro } from '@/actions/publico/submeter-cadastro'

type Passo = 'whatsapp' | 'dados' | 'complementos' | 'ja-existe'

type Regiao = { id: string; nome: string }
type Profissao = { id: string; nome: string }
type SegmentoInteresse = { id: string; nome: string }

type Props = {
  slug: string
  regioes: Regiao[]
  profissoes: Profissao[]
  segmentosInteresse: SegmentoInteresse[]
  segmentoSlug: string
  mobilizadorToken: string
  origemUtm: string
}

export function CadastroForm({
  slug,
  regioes,
  profissoes,
  segmentosInteresse,
  segmentoSlug,
  mobilizadorToken,
  origemUtm,
}: Props) {
  const [passo, setPasso] = useState<Passo>('whatsapp')
  const [erro, setErro] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  // Dados coletados progressivamente
  const [whatsappNormalizado, setWhatsappNormalizado] = useState('')
  const [pessoaExistente, setPessoaExistente] = useState<{ nome: string; pessoaId: string } | null>(null)
  const [dadosPasso2, setDadosPasso2] = useState({ nome: '', regiaoId: '' })

  function handleStep1(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setErro(null)
    const formData = new FormData(e.currentTarget)
    startTransition(async () => {
      const resultado = await verificarWhatsApp(formData)
      if (resultado.erro) {
        setErro(resultado.erro)
        return
      }
      setWhatsappNormalizado(resultado.whatsappNormalizado ?? '')
      if (resultado.existe) {
        setPessoaExistente({ nome: resultado.nome!, pessoaId: resultado.pessoaId! })
        setPasso('ja-existe')
      } else {
        setPasso('dados')
      }
    })
  }

  function handleStep2(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setErro(null)
    const formData = new FormData(e.currentTarget)
    const nome = formData.get('nome') as string
    const regiaoId = formData.get('regiaoId') as string
    if (!nome.trim()) { setErro('Nome é obrigatório.'); return }
    setDadosPasso2({ nome: nome.trim(), regiaoId })
    setPasso('complementos')
  }

  // Passo 1 — WhatsApp
  if (passo === 'whatsapp') {
    return (
      <form onSubmit={handleStep1} className="space-y-4">
        <input type="hidden" name="slug" value={slug} />
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Seu número de WhatsApp *
          </label>
          <input
            name="whatsapp"
            type="tel"
            required
            placeholder="(61) 9 9999-9999"
            className="block w-full border border-gray-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
            autoFocus
          />
        </div>
        {erro && <p className="text-red-600 text-sm">{erro}</p>}
        <button
          type="submit"
          disabled={isPending}
          className="w-full bg-blue-600 text-white py-3 rounded-lg font-medium text-base disabled:opacity-60"
        >
          {isPending ? 'Verificando...' : 'Continuar'}
        </button>
      </form>
    )
  }

  // Passo ja-existe — confirmar participação
  if (passo === 'ja-existe' && pessoaExistente) {
    return (
      <div className="space-y-4">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-blue-800 font-medium">
            Olá, {pessoaExistente.nome}! 👋
          </p>
          <p className="text-blue-700 text-sm mt-1">
            Você já está cadastrado. Deseja confirmar sua participação?
          </p>
        </div>
        <form action={submeterCadastro} className="space-y-3">
          <input type="hidden" name="slug" value={slug} />
          <input type="hidden" name="isExistente" value="true" />
          <input type="hidden" name="pessoaExistenteId" value={pessoaExistente.pessoaId} />
          <input type="hidden" name="whatsappNormalizado" value={whatsappNormalizado} />
          <input type="hidden" name="segmentoSlug" value={segmentoSlug} />
          <input type="hidden" name="mobilizadorToken" value={mobilizadorToken} />
          <input type="hidden" name="origemUtm" value={origemUtm} />
          <button
            type="submit"
            className="w-full bg-blue-600 text-white py-3 rounded-lg font-medium text-base"
          >
            Confirmar participação
          </button>
        </form>
        <button
          onClick={() => setPasso('whatsapp')}
          className="w-full text-gray-500 text-sm underline"
        >
          Usar outro número
        </button>
      </div>
    )
  }

  // Passo 2 — Dados obrigatórios
  if (passo === 'dados') {
    return (
      <form onSubmit={handleStep2} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Nome completo *
          </label>
          <input
            name="nome"
            type="text"
            required
            autoComplete="name"
            className="block w-full border border-gray-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
            autoFocus
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Região administrativa *
          </label>
          <select
            name="regiaoId"
            required
            className="block w-full border border-gray-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Selecionar região...</option>
            {regioes.map((r) => (
              <option key={r.id} value={r.id}>{r.nome}</option>
            ))}
          </select>
        </div>
        {erro && <p className="text-red-600 text-sm">{erro}</p>}
        <button
          type="submit"
          className="w-full bg-blue-600 text-white py-3 rounded-lg font-medium text-base"
        >
          Continuar
        </button>
      </form>
    )
  }

  // Passo 3 — Dados complementares + submissão final
  return (
    <form action={submeterCadastro} className="space-y-4">
      {/* Dados coletados nos passos anteriores */}
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="isExistente" value="false" />
      <input type="hidden" name="whatsappNormalizado" value={whatsappNormalizado} />
      <input type="hidden" name="nome" value={dadosPasso2.nome} />
      <input type="hidden" name="regiaoId" value={dadosPasso2.regiaoId} />
      {/* Parâmetros de URL */}
      <input type="hidden" name="segmentoSlug" value={segmentoSlug} />
      <input type="hidden" name="mobilizadorToken" value={mobilizadorToken} />
      <input type="hidden" name="origemUtm" value={origemUtm} />

      {/* Nascimento */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Data de nascimento
        </label>
        <input
          name="nascimento"
          type="date"
          className="block w-full border border-gray-300 rounded-lg px-4 py-3 text-base"
        />
      </div>

      {/* Gênero — botões de seleção */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Gênero</label>
        <div className="grid grid-cols-2 gap-2">
          {[
            { value: 'masculino', label: 'Masculino' },
            { value: 'feminino', label: 'Feminino' },
            { value: 'outro', label: 'Outro' },
            { value: 'prefiro_nao_informar', label: 'Prefiro não informar' },
          ].map(({ value, label }) => (
            <label
              key={value}
              className="flex items-center gap-2 border border-gray-300 rounded-lg px-3 py-2 cursor-pointer has-[:checked]:border-blue-500 has-[:checked]:bg-blue-50"
            >
              <input type="radio" name="genero" value={value} className="sr-only" />
              <span className="text-sm">{label}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Profissão */}
      {profissoes.length > 0 && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Profissão</label>
          <select
            name="profissaoId"
            className="block w-full border border-gray-300 rounded-lg px-4 py-3 text-base"
          >
            <option value="">Selecionar...</option>
            {profissoes.map((p) => (
              <option key={p.id} value={p.id}>{p.nome}</option>
            ))}
          </select>
        </div>
      )}

      {/* Interesses */}
      {segmentosInteresse.length > 0 && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Áreas de interesse
          </label>
          <div className="space-y-2">
            {segmentosInteresse.map((s) => (
              <label
                key={s.id}
                className="flex items-center gap-3 border border-gray-300 rounded-lg px-3 py-2 cursor-pointer has-[:checked]:border-blue-500 has-[:checked]:bg-blue-50"
              >
                <input
                  type="checkbox"
                  name="interesseId"
                  value={s.id}
                  className="h-4 w-4 text-blue-600 border-gray-300 rounded"
                />
                <span className="text-sm">{s.nome}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* E-mail */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">E-mail</label>
        <input
          name="email"
          type="email"
          autoComplete="email"
          className="block w-full border border-gray-300 rounded-lg px-4 py-3 text-base"
          placeholder="seu@email.com"
        />
      </div>

      <button
        type="submit"
        className="w-full bg-blue-600 text-white py-3 rounded-lg font-medium text-base"
      >
        Finalizar cadastro
      </button>
    </form>
  )
}
```

- [ ] **Passo 4: Criar Server Component page pública de cadastro**

```typescript
// src/app/[slug]/cadastro/page.tsx
import { prisma } from '@/lib/prisma'
import { notFound } from 'next/navigation'
import { CadastroForm } from './CadastroForm'

export default async function CadastroPublicoPage({
  params,
  searchParams,
}: {
  params: { slug: string }
  searchParams: {
    segmento?: string
    mobilizador?: string
    utm_source?: string
  }
}) {
  const gabinete = await prisma.gabinete.findUnique({
    where: { slug: params.slug },
    select: {
      id: true,
      slug: true,
      ativo: true,
      nomeSistema: true,
      corPrimaria: true,
      corSecundaria: true,
      logoUrl: true,
      imagemBannerUrl: true,
    },
  })

  if (!gabinete) notFound()

  if (!gabinete.ativo) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center">
          <h1 className="text-xl font-semibold text-gray-700">
            Cadastros indisponíveis
          </h1>
          <p className="text-gray-500 mt-2">
            Este gabinete não está aceitando cadastros no momento.
          </p>
        </div>
      </div>
    )
  }

  const segmentoSlug = searchParams.segmento ?? ''
  const mobilizadorToken = searchParams.mobilizador ?? ''
  const origemUtm = searchParams.utm_source ?? ''

  // Dados para o formulário
  const regioes = await prisma.regiao.findMany({
    where: { gabineteId: gabinete.id, ativa: true },
    orderBy: { nome: 'asc' },
    select: { id: true, nome: true },
  })

  const profissoes = await prisma.profissao.findMany({
    where: { gabineteId: gabinete.id, ativa: true },
    orderBy: { nome: 'asc' },
    select: { id: true, nome: true },
  })

  const segmentosInteresse = await prisma.segmento.findMany({
    where: { gabineteId: gabinete.id, status: 'ativo', tipo: 'interesse' },
    orderBy: { nome: 'asc' },
    select: { id: true, nome: true },
  })

  const nomeSistema = gabinete.nomeSistema ?? 'Rede Mobiliza'
  const corPrimaria = gabinete.corPrimaria ?? '#1D4ED8'

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Banner */}
      {gabinete.imagemBannerUrl && (
        <div
          className="h-32 bg-cover bg-center"
          style={{ backgroundImage: `url(${gabinete.imagemBannerUrl})` }}
        />
      )}
      {!gabinete.imagemBannerUrl && (
        <div className="h-16" style={{ backgroundColor: corPrimaria }} />
      )}

      {/* Card do formulário */}
      <div className="max-w-sm mx-auto px-4 -mt-6">
        <div className="bg-white rounded-2xl shadow-lg p-6">
          {/* Header com logo e nome */}
          <div className="flex items-center gap-3 mb-6">
            {gabinete.logoUrl && (
              <img
                src={gabinete.logoUrl}
                alt={nomeSistema}
                className="h-10 w-10 object-contain rounded"
              />
            )}
            <h1 className="text-lg font-bold text-gray-900">{nomeSistema}</h1>
          </div>

          <h2 className="text-base font-semibold text-gray-800 mb-4">
            Faça seu cadastro
          </h2>

          <CadastroForm
            slug={params.slug}
            regioes={regioes}
            profissoes={profissoes}
            segmentosInteresse={segmentosInteresse}
            segmentoSlug={segmentoSlug}
            mobilizadorToken={mobilizadorToken}
            origemUtm={origemUtm}
          />
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Passo 5: Criar page de sucesso**

```typescript
// src/app/[slug]/cadastro/sucesso/page.tsx
export default function CadastroSucessoPage({
  params,
  searchParams,
}: {
  params: { slug: string }
  searchParams: { aviso?: string }
}) {
  const avisoSegmento = searchParams.aviso === 'segmento_inativo'

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-sm w-full bg-white rounded-2xl shadow-lg p-6 text-center space-y-4">
        <div className="text-4xl">✅</div>
        <h1 className="text-xl font-bold text-gray-900">Cadastro realizado!</h1>
        <p className="text-gray-600">
          Obrigado por se cadastrar. Suas informações foram registradas com sucesso.
        </p>
        {avisoSegmento && (
          <p className="text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-sm">
            Este grupo não está mais disponível, mas seu cadastro foi realizado com sucesso.
          </p>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Passo 6: Testar o formulário público**

```bash
# Criar ao menos um gabinete via super-admin antes de testar
# http://localhost:3000/[slug]/cadastro

# Cenário 1 — novo cadastro:
# 1. Passo 1: digitar WhatsApp válido "(61) 9 9999-9999" → Continuar
# 2. Passo 2: preencher Nome + Região → Continuar
# 3. Passo 3: selecionar gênero e interesses → Finalizar cadastro
# → deve redirecionar para /[slug]/cadastro/sucesso

# Cenário 2 — WhatsApp já existe:
# 1. Passo 1: mesmo WhatsApp → deve mostrar "Olá [nome]" + Confirmar participação
# → deve redirecionar para /[slug]/cadastro/sucesso

# Cenário 3 — com segmento:
# http://localhost:3000/[slug]/cadastro?segmento=slug-do-segmento
# Cadastrar → verificar no banco se PessoaSegmento foi criado

# Cenário 4 — WhatsApp inválido ("123"):
# → deve mostrar mensagem de erro, não avançar

# Cenário 5 — gabinete inativo:
# Desativar gabinete no super-admin → acessar a rota
# → deve mostrar mensagem "Cadastros indisponíveis"
```

- [ ] **Passo 7: Commit**

```bash
git add src/app/[slug]/cadastro/ \
        src/actions/publico/verificar-whatsapp.ts \
        src/actions/publico/submeter-cadastro.ts
git commit -m "feat: formulário público de cadastro multi-passo"
```

---

### Task 3: Tornar Mobilizador + Revogar Mobilizador

**Files:**
- Create: `src/actions/admin/tornar-mobilizador.ts`
- Create: `src/actions/admin/revogar-mobilizador.ts`
- Modify: `src/app/[slug]/admin/pessoas/[pessoaId]/page.tsx` (adicionar seção de mobilizador)

**Interfaces:**
- Consome: `getGabineteBySlug` de `src/lib/gabinete.ts`
- Consome: `supabaseAdmin` de `src/lib/supabase-admin.ts`
- Consome: `prisma` de `src/lib/prisma.ts`
- `tornarMobilizador` requer `pessoa.email != null` e não ser admin do mesmo gabinete
- `revogarMobilizador` usa `prisma.$transaction([])` com 3-4 operações

- [ ] **Passo 1: Criar Server Action `tornar-mobilizador`**

```typescript
// src/actions/admin/tornar-mobilizador.ts
'use server'

import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { createId } from '@paralleldrive/cuid2'
import { prisma } from '@/lib/prisma'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getGabineteBySlug } from '@/lib/gabinete'

export async function tornarMobilizador(formData: FormData) {
  const slug = formData.get('slug') as string
  const pessoaId = formData.get('pessoaId') as string

  const cookieStore = cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } }
  )
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Não autenticado')

  const gabinete = await getGabineteBySlug(slug)
  if (!gabinete) throw new Error('Gabinete não encontrado')

  const pessoa = await prisma.pessoa.findFirst({
    where: { id: pessoaId, gabineteId: gabinete.id },
    select: { id: true, nome: true, email: true, isMobilizador: true },
  })
  if (!pessoa) throw new Error('Pessoa não encontrada')

  if (!pessoa.email) {
    throw new Error('Informe o e-mail da pessoa antes de tornar mobilizador')
  }

  if (pessoa.isMobilizador) {
    throw new Error('Esta pessoa já é mobilizadora')
  }

  // Verificar se e-mail pertence a um admin deste gabinete
  const usuariosPorEmail = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id::text as id FROM auth.users
    WHERE LOWER(email) = LOWER(${pessoa.email})
    LIMIT 1
  `
  if (usuariosPorEmail.length > 0) {
    const existingUserId = usuariosPorEmail[0].id
    const isAdmin = await prisma.usuarioGabinete.findFirst({
      where: { userId: existingUserId, gabineteId: gabinete.id, papel: 'admin' },
      select: { id: true },
    })
    if (isAdmin) {
      throw new Error(
        'Um administrador do gabinete não pode ser promovido a mobilizador por este fluxo'
      )
    }
  }

  // Gerar token único
  const tokenMobilizador = createId()

  // Atualizar Pessoa
  await prisma.pessoa.update({
    where: { id: pessoaId },
    data: { isMobilizador: true, tokenMobilizador },
  })

  // Enviar magic link
  const redirectTo = `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback?gabineteId=${gabinete.id}&token=${tokenMobilizador}`
  const { error } = await supabaseAdmin.auth.signInWithOtp({
    email: pessoa.email,
    options: { redirectTo },
  })

  if (error) {
    // Reverter isMobilizador em caso de erro no envio
    await prisma.pessoa.update({
      where: { id: pessoaId },
      data: { isMobilizador: false, tokenMobilizador: null },
    })
    throw new Error(`Erro ao enviar magic link: ${error.message}`)
  }

  revalidatePath(`/${slug}/admin/pessoas/${pessoaId}`)
}
```

Nota: `createId` requer `@paralleldrive/cuid2` — pacote já instalado se o Plano 1 usou cuid para IDs. Alternativamente, use `crypto.randomUUID()` (disponível nativo no Node.js 19+):

```typescript
// Alternativa sem dependência extra:
const tokenMobilizador = crypto.randomUUID().replace(/-/g, '')
```

- [ ] **Passo 2: Criar Server Action `revogar-mobilizador`**

```typescript
// src/actions/admin/revogar-mobilizador.ts
'use server'

import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { prisma } from '@/lib/prisma'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getGabineteBySlug } from '@/lib/gabinete'

export async function revogarMobilizador(formData: FormData) {
  const slug = formData.get('slug') as string
  const pessoaId = formData.get('pessoaId') as string

  const cookieStore = cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } }
  )
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Não autenticado')

  const gabinete = await getGabineteBySlug(slug)
  if (!gabinete) throw new Error('Gabinete não encontrado')

  const pessoa = await prisma.pessoa.findFirst({
    where: { id: pessoaId, gabineteId: gabinete.id, isMobilizador: true },
    select: { id: true, nome: true, userId: true },
  })
  if (!pessoa) throw new Error('Mobilizador não encontrado')

  const userId = pessoa.userId ?? null

  // Montar transação — operações sempre presentes
  const transacaoBase = [
    prisma.pessoa.update({
      where: { id: pessoaId },
      data: { isMobilizador: false, tokenMobilizador: null, userId: null },
    }),
    prisma.linkComposto.deleteMany({
      where: { mobilizadorId: pessoaId, gabineteId: gabinete.id },
    }),
  ]

  // Incluir deleção de UsuarioGabinete apenas se userId for não-nulo
  // NUNCA passar userId: undefined ao deleteMany — apagaria todos os registros do gabinete
  if (userId) {
    await prisma.$transaction([
      ...transacaoBase,
      prisma.usuarioGabinete.deleteMany({
        where: { userId, gabineteId: gabinete.id },
      }),
    ])
  } else {
    await prisma.$transaction(transacaoBase)
  }

  // Invalidar sessão do mobilizador (melhor esforço)
  if (userId) {
    try {
      await supabaseAdmin.auth.admin.signOut(userId)
    } catch {
      // Falha silenciosa — middleware barará o acesso; JWT expira em ≤1h
    }
  }

  revalidatePath(`/${slug}/admin/pessoas/${pessoaId}`)
}
```

- [ ] **Passo 3: Adicionar seção de mobilizador na ficha de pessoa**

Abrir `src/app/[slug]/admin/pessoas/[pessoaId]/page.tsx` (criado no Plano 3). Adicionar os imports das novas actions e uma seção de mobilizador após o toggle de equipe.

Adicionar imports no topo:
```typescript
import { tornarMobilizador } from '@/actions/admin/tornar-mobilizador'
import { revogarMobilizador } from '@/actions/admin/revogar-mobilizador'
```

Adicionar seção após o bloco de "Toggle equipe" (após o primeiro `</div>` da seção de equipe):

```typescript
{/* Seção de Mobilizador */}
<div className="bg-white rounded-lg p-4 shadow-sm space-y-2">
  <h3 className="text-sm font-semibold text-gray-700">Mobilizador</h3>
  {pessoa.isMobilizador ? (
    <div className="space-y-2">
      <p className="text-sm text-green-700">
        Esta pessoa é mobilizadora ativa.
      </p>
      <p className="text-xs text-gray-500">
        Link pessoal:{' '}
        <span className="font-mono">
          {`${process.env.NEXT_PUBLIC_APP_URL}/${params.slug}/cadastro?mobilizador=***`}
        </span>
      </p>
      <form action={revogarMobilizador}>
        <input type="hidden" name="slug" value={params.slug} />
        <input type="hidden" name="pessoaId" value={pessoa.id} />
        <button
          type="submit"
          className="text-sm text-red-600 hover:underline"
        >
          Revogar acesso de mobilizador
        </button>
      </form>
    </div>
  ) : (
    <form action={tornarMobilizador}>
      <input type="hidden" name="slug" value={params.slug} />
      <input type="hidden" name="pessoaId" value={pessoa.id} />
      <button
        type="submit"
        className="text-sm text-blue-700 hover:underline"
      >
        Tornar mobilizador
      </button>
      {!pessoa.email && (
        <p className="text-xs text-amber-700 mt-1">
          ⚠ Informe o e-mail da pessoa antes de tornar mobilizador.
        </p>
      )}
    </form>
  )}
</div>
```

Nota: o link pessoal completo não exibe o token diretamente na ficha — usa `***` para indicar que existe. O mobilizador vê seu link no próprio painel.

- [ ] **Passo 4: Testar tornar/revogar mobilizador**

```bash
# Pré-requisito: pessoa cadastrada com e-mail válido acessível

# 1. Acessar /[slug]/admin/pessoas/[id]
# 2. Clicar "Tornar mobilizador"
# → deve enviar magic link para o e-mail da pessoa
# → pessoa.isMobilizador deve ser true no banco

# 3. Pessoa clica no magic link no e-mail
# → deve redirecionar para /[slug]/mobilizador
# → deve ter criado UsuarioGabinete com papel='mobilizador' no banco

# 4. Admin clica "Revogar acesso de mobilizador"
# → pessoa.isMobilizador deve ser false, tokenMobilizador null
# → UsuarioGabinete removido (se userId não nulo)
```

- [ ] **Passo 5: Commit**

```bash
git add src/actions/admin/tornar-mobilizador.ts \
        src/actions/admin/revogar-mobilizador.ts \
        src/app/[slug]/admin/pessoas/[pessoaId]/page.tsx
git commit -m "feat: tornar e revogar mobilizador com magic link"
```

---

### Task 4: Painel do Mobilizador

**Files:**
- Create: `src/app/[slug]/mobilizador/layout.tsx`
- Create: `src/app/[slug]/mobilizador/page.tsx`

**Interfaces:**
- Consome: `getGabineteBySlug` de `src/lib/gabinete.ts`
- Encontra `Pessoa` do mobilizador via: `WHERE userId = session.user.id AND gabineteId = gabinete.id AND isMobilizador = true`
- Convidados: `VinculoRede WHERE indicadoPorId = mobilizador.id AND gabineteId = gabinete.id`
- Campos dos convidados retornados: `id, nome, whatsapp, regiao.nome, segmentos[].segmento.nome` — SOMENTE estes
- `tokenMobilizador` NUNCA retornado — `linkPessoal` construído server-side

- [ ] **Passo 1: Criar layout do painel do mobilizador**

```typescript
// src/app/[slug]/mobilizador/layout.tsx
import 'server-only'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { prisma } from '@/lib/prisma'
import { getGabineteBySlug } from '@/lib/gabinete'

export default async function MobilizadorLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: { slug: string }
}) {
  const cookieStore = cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } }
  )

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect(`/${params.slug}/login`)

  const gabinete = await getGabineteBySlug(params.slug)
  if (!gabinete) redirect('/404')
  if (!gabinete.ativo) {
    redirect(`/${params.slug}/login?erro=gabinete_inativo`)
  }

  // Verificar que existe UsuarioGabinete com papel='mobilizador'
  const usuarioGabinete = await prisma.usuarioGabinete.findUnique({
    where: {
      userId_gabineteId: { userId: session.user.id, gabineteId: gabinete.id },
    },
    select: { papel: true },
  })

  if (!usuarioGabinete || usuarioGabinete.papel !== 'mobilizador') {
    redirect(`/${params.slug}/login?erro=sem_acesso`)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-4 py-3">
        <p className="text-sm font-medium text-gray-700">
          {gabinete.nomeSistema ?? 'Rede Mobiliza'}
        </p>
      </header>
      <main className="max-w-xl mx-auto px-4 py-6">{children}</main>
    </div>
  )
}
```

- [ ] **Passo 2: Criar page do painel do mobilizador**

```typescript
// src/app/[slug]/mobilizador/page.tsx
import 'server-only'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { prisma } from '@/lib/prisma'
import { getGabineteBySlug } from '@/lib/gabinete'
import { notFound, redirect } from 'next/navigation'
import QRCode from 'qrcode'

export default async function MobilizadorPage({
  params,
}: {
  params: { slug: string }
}) {
  const cookieStore = cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } }
  )

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect(`/${params.slug}/login`)

  const gabinete = await getGabineteBySlug(params.slug)
  if (!gabinete) notFound()

  // Encontrar a Pessoa do mobilizador pelo userId
  const mobilizador = await prisma.pessoa.findFirst({
    where: {
      gabineteId: gabinete.id,
      userId: session.user.id,
      isMobilizador: true,
    },
    select: { id: true, nome: true, tokenMobilizador: true },
  })

  if (!mobilizador || !mobilizador.tokenMobilizador) {
    redirect(`/${params.slug}/login?erro=sem_acesso`)
  }

  // Construir link pessoal (token NUNCA retornado como campo isolado)
  const linkPessoal = `${process.env.NEXT_PUBLIC_APP_URL}/${params.slug}/cadastro?mobilizador=${mobilizador.tokenMobilizador}`

  // Gerar QR code server-side
  const qrDataUrl = await QRCode.toDataURL(linkPessoal, { width: 256, margin: 2 })

  // Listar convidados diretos — campos restritos conforme regras de privacidade
  const vinculos = await prisma.vinculoRede.findMany({
    where: { indicadoPorId: mobilizador.id, gabineteId: gabinete.id },
    orderBy: { criadoEm: 'desc' },
    select: {
      pessoa: {
        select: {
          id: true,
          nome: true,
          whatsapp: true,
          regiao: { select: { nome: true } },
          segmentos: {
            select: {
              segmento: { select: { nome: true } },
            },
          },
        },
      },
    },
  })

  const convidados = vinculos.map((v) => v.pessoa)

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Olá, {mobilizador.nome}!</h1>
        <p className="text-sm text-gray-500 mt-1">Seu painel de mobilização</p>
      </div>

      {/* Link pessoal + QR code */}
      <section className="bg-white rounded-xl shadow-sm p-5 space-y-4">
        <h2 className="text-base font-semibold text-gray-800">Seu link de cadastro</h2>
        <p className="text-xs text-blue-600 break-all font-mono bg-blue-50 rounded p-2">
          {linkPessoal}
        </p>
        <div className="flex flex-col items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qrDataUrl} alt="Seu QR Code pessoal" className="w-48 h-48" />
          <a
            href={qrDataUrl}
            download="meu-qr-code.png"
            className="text-sm text-blue-600 underline"
          >
            Baixar QR Code
          </a>
        </div>
      </section>

      {/* Contador e lista de convidados */}
      <section className="bg-white rounded-xl shadow-sm p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-800">Meus convidados</h2>
          <span className="text-sm bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full font-medium">
            {convidados.length} pessoa{convidados.length !== 1 ? 's' : ''}
          </span>
        </div>

        {convidados.length === 0 ? (
          <p className="text-sm text-gray-500">
            Nenhum convidado ainda. Compartilhe seu link para começar!
          </p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {convidados.map((c) => (
              <li key={c.id} className="py-3 space-y-0.5">
                <p className="text-sm font-medium text-gray-900">{c.nome}</p>
                <p className="text-xs text-gray-500">{c.whatsapp}</p>
                {c.regiao && (
                  <p className="text-xs text-gray-400">{c.regiao.nome}</p>
                )}
                {c.segmentos.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {c.segmentos.map((s) => (
                      <span
                        key={s.segmento.nome}
                        className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded"
                      >
                        {s.segmento.nome}
                      </span>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
```

- [ ] **Passo 3: Testar painel do mobilizador**

```bash
# Pré-requisito: pessoa promovida a mobilizador (Task 3) e magic link clicado

# 1. Acessar /[slug]/mobilizador com sessão do mobilizador
# → deve mostrar nome, link pessoal com QR code, lista de convidados

# 2. Acessar com sessão de admin → deve redirecionar para /[slug]/login?erro=sem_acesso

# 3. Acessar sem sessão → deve redirecionar para /[slug]/login

# 4. Fazer cadastro público usando o link do mobilizador
#    → pessoa deve aparecer na lista de convidados

# Verificar privacidade: no Prisma Studio, confirmar que
# a query de convidados NÃO retorna email, isEquipe, isMobilizador, origem, tokenMobilizador
```

- [ ] **Passo 4: Commit**

```bash
git add src/app/[slug]/mobilizador/layout.tsx \
        src/app/[slug]/mobilizador/page.tsx
git commit -m "feat: painel do mobilizador com link pessoal, QR code e lista de convidados"
```

---

## Auto-Review

**Cobertura da spec:**

| Requisito | Task |
|---|---|
| Formulário público multi-passo (WhatsApp → dados → complementos) | Task 2 |
| Verificação de duplicidade por WhatsApp normalizado | Task 2 (verificarWhatsApp) |
| Pessoa já existente — confirmar sem repetir dados | Task 2 (passo `ja-existe`) |
| Vincular segmento do link (`?segmento=slug`) | Task 2 (submeterCadastro) |
| Segmento inativo — prosseguir com aviso | Task 2 (aviso=segmento_inativo) |
| Vincular mobilizador (`?mobilizador=TOKEN`) | Task 2 (submeterCadastro) |
| Token inválido — ignorar silenciosamente | Task 2 (mobilizador lookup retorna null → skip) |
| Rastreamento de origem por UTM | Task 2 (cálculo de `origem`) |
| Seleção de interesses (segmentos tipo='interesse') | Task 2 (CadastroForm Passo 3) |
| Gênero como botões de seleção no formulário | Task 2 (Passo 3 com radio buttons) |
| Identidade visual do gabinete no form público | Task 2 (page.tsx lê imagemBannerUrl, logoUrl) |
| Callback mobilizador — trocar código por sessão | Task 1 |
| Callback mobilizador — validar email case-insensitive | Task 1 |
| Callback mobilizador — upsert UsuarioGabinete | Task 1 |
| Callback mobilizador — atualizar Pessoa.userId | Task 1 |
| Tornar mobilizador — validar email presente | Task 3 |
| Tornar mobilizador — não pode ser admin do gabinete | Task 3 (query auth.users) |
| Tornar mobilizador — enviar magic link | Task 3 |
| Revogar mobilizador — transação com 3-4 ops | Task 3 |
| Revogar mobilizador — signOut melhor esforço | Task 3 |
| Revogar mobilizador — deleteMany com userId null guard | Task 3 |
| Painel mobilizador — link pessoal server-side | Task 4 |
| Painel mobilizador — QR code pessoal | Task 4 |
| Painel mobilizador — lista de convidados com campos restritos | Task 4 |
| Painel mobilizador — guard papel='mobilizador' | Task 4 (layout) |
| tokenMobilizador nunca retornado como campo JSON isolado | Tasks 3 e 4 ✅ |

**Checagem de placeholder:** Nenhum "TBD", "TODO" ou "implementar depois" encontrado.

**Consistência de tipos:**
- `verificarWhatsApp` retorna `whatsappNormalizado` — usado em `CadastroForm` → `submeterCadastro` via campo oculto ✅
- `submeterCadastro` recebe `interesseId` via `getAll('interesseId')` — múltiplos checkboxes ✅
- `revogarMobilizador` verifica `userId !== null` antes de incluir no `$transaction` ✅
- `Pessoa.userId String?` usado em `mobilizador/page.tsx` para lookup ✅

**Pré-requisitos:**
- `NEXT_PUBLIC_APP_URL` no `.env.local` (definido no Plano 3 Task 5)
- `qrcode` npm instalado (instalado no Plano 3 Task 5)
- URL `/auth/callback` adicionada à allowlist no Supabase Dashboard
