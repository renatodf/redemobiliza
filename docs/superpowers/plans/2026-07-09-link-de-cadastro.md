# Link de Cadastro Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar a tela "Link de Cadastro" pro mobilizador (link pessoal por segmento, numa tela própria) e pro admin (link composto com múltiplos segmentos + rede de qualquer mobilizador do sistema, ou Rede Raiz), com download de QR code em PNG opaco e PNG transparente, mantendo o layout/tema já usado nas telas existentes.

**Architecture:** Generaliza a action pública de cadastro (`submeterCadastro`) e o formulário (`CadastroForm`) pra aceitar múltiplos segmentos em vez de um só — usados tanto pelo link pessoal do mobilizador (inalterado, 1 segmento) quanto por uma rota pública nova (`/cadastro/link`) que aceita vários segmentos via query string. O admin gera esse link através de uma tela nova que reaproveita o mesmo mecanismo de token de mobilizador já existente (não cria conceito de token novo). "Rede Raiz" já existe no banco como `VinculoRede.indicadoPorId = null` — só ganha um filtro na UI.

**Tech Stack:** Next.js 14 (App Router, Server Components/Actions), Prisma, Tailwind CSS 3.4, lib `qrcode` (já é dependência do projeto).

## Global Constraints

- O link pessoal do mobilizador continua exatamente como hoje:
  `/{slug}/cadastro/{segmentoSlug}?m={tokenMobilizador}` — mecanismo, formato de URL e
  comportamento de `submeterCadastro` para esse fluxo não mudam de forma observável.
- QR code: só PNG (opaco e transparente). Sem JPG — a lib `qrcode` já usada no projeto
  não suporta JPG real no servidor (`type: 'image/jpeg'` cai silenciosamente em PNG);
  adicionar JPG exigiria duas dependências novas, fora de escopo. PNG transparente usa
  `color: { light: '#ffffff00' }` (hex de 8 dígitos, alpha zerado).
- "Rede Raiz" = `VinculoRede.indicadoPorId: null`. Não é um campo novo no schema.
- O link novo do admin (`/{slug}/cadastro/link?segmentos=slug1,slug2&m=token`) é uma
  rota estática, fora da dinâmica `[segmentoSlug]` — "link" fica reservado como slug de
  segmento (efeito colateral aceito, documentado no spec).
- Sem testes automatizados de Server Components/Actions neste projeto — verificação é
  por `tsc`/`lint`/`build` + checagem manual no navegador.

---

## File Structure

**Modificar:**
- `src/actions/public/submeter-cadastro.ts` — `segmentoSlug: string` vira
  `segmentoSlugs: string[]`, ganha `sucessoUrl: string` (redirect não é mais hardcoded).
- `src/app/[slug]/cadastro/[segmentoSlug]/CadastroForm.tsx` — mesmas duas mudanças de
  props, repassadas pra `submeterCadastro`.
- `src/app/[slug]/cadastro/[segmentoSlug]/page.tsx` — passa `segmentoSlugs={[slug]}` e
  `sucessoUrl` pro form.
- `src/components/admin/Sidebar.tsx` — item "Link de Cadastro" do admin ganha `href`
  (sai de `emBreve`); mobilizador ganha terceiro item "Link de Cadastro".
- `src/app/[slug]/mobilizador/page.tsx` — remove os cards de link/QR por segmento
  (migram pra tela nova).
- `src/app/[slug]/admin/pessoas/page.tsx` — `?rede=raiz` filtra
  `indicadoPorId: null`; novo link "Ver Rede Raiz".

**Criar:**
- `src/app/[slug]/cadastro/link/page.tsx` — rota pública nova, múltiplos segmentos via
  query string.
- `src/app/[slug]/cadastro/link/sucesso/page.tsx` — página de sucesso genérica.
- `src/actions/admin/gerar-link-cadastro.ts` — server action que monta o link +
  QR codes a partir dos segmentos/rede escolhidos pelo admin.
- `src/app/[slug]/admin/link-cadastro/page.tsx` — página admin (busca segmentos e
  mobilizadores, renderiza o formulário).
- `src/app/[slug]/admin/link-cadastro/GerarLinkForm.tsx` — formulário client
  (checkboxes de segmento + select de rede + resultado com link/QR/downloads).
- `src/app/[slug]/mobilizador/link-cadastro/page.tsx` — tela do mobilizador (cards de
  link/QR por segmento, migrados de `mobilizador/page.tsx`, com os dois downloads PNG).

---

### Task 1: Generalizar a action pública de cadastro

**Files:**
- Modify: `src/actions/public/submeter-cadastro.ts`

**Interfaces:**
- Produces: `submeterCadastro(input: { slug, segmentoSlugs: string[], whatsapp, nome, email?, regiaoId?, profissaoId?, genero?, mobilizadorToken?, sucessoUrl: string }): Promise<{ erro: string } | never>` — usado pela Task 2 (form existente) e pela Task 3 (form novo).

- [ ] **Step 1: Substituir o conteúdo do arquivo**

```ts
'use server'

import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { getGabineteBySlug } from '@/lib/gabinete'
import { normalizeWhatsApp } from '@/lib/whatsapp'

type SubmeterCadastroInput = {
  slug: string
  segmentoSlugs: string[]
  whatsapp: string
  nome: string
  email?: string
  regiaoId?: string
  profissaoId?: string
  genero?: string
  mobilizadorToken?: string
  sucessoUrl: string
}

export async function submeterCadastro(input: SubmeterCadastroInput): Promise<{ erro: string } | never> {
  const {
    slug,
    segmentoSlugs,
    whatsapp: whatsappRaw,
    nome,
    email,
    regiaoId,
    profissaoId,
    genero,
    mobilizadorToken,
    sucessoUrl,
  } = input

  const gabinete = await getGabineteBySlug(slug)
  if (!gabinete || !gabinete.ativo) return { erro: 'Gabinete não encontrado' }

  const segmentos = await prisma.segmento.findMany({
    where: { gabineteId: gabinete.id, slug: { in: segmentoSlugs }, status: 'ativo' },
    select: { id: true },
  })
  if (segmentos.length === 0) return { erro: 'Segmento não encontrado' }

  const whatsapp = normalizeWhatsApp(whatsappRaw)
  if (!whatsapp) return { erro: 'Número de WhatsApp inválido' }

  if (!nome.trim()) return { erro: 'Nome é obrigatório' }

  let mobilizadorId: string | null = null
  if (mobilizadorToken) {
    const mob = await prisma.pessoa.findFirst({
      where: { gabineteId: gabinete.id, tokenMobilizador: mobilizadorToken, isMobilizador: true },
      select: { id: true },
    })
    mobilizadorId = mob?.id ?? null
  }

  const pessoaExistente = await prisma.pessoa.findUnique({
    where: { gabineteId_whatsapp: { gabineteId: gabinete.id, whatsapp } },
    select: { id: true },
  })

  let pessoaId: string

  if (pessoaExistente) {
    // Pessoa já existe — apenas registra a participação, NÃO altera dados do perfil
    // sem autenticação do titular
    pessoaId = pessoaExistente.id
  } else {
    const criada = await prisma.pessoa.create({
      data: {
        nome: nome.trim(),
        whatsapp,
        email: email?.trim() || null,
        genero: genero || null,
        regiaoId: regiaoId || null,
        profissaoId: profissaoId || null,
        gabineteId: gabinete.id,
        isColaborador: false,
      },
    })
    pessoaId = criada.id
  }

  for (const segmento of segmentos) {
    await prisma.pessoaSegmento.upsert({
      where: { pessoaId_segmentoId: { pessoaId, segmentoId: segmento.id } },
      create: { pessoaId, segmentoId: segmento.id },
      update: {},
    })
  }

  // Cria vínculo de rede apenas se ainda não existir (NULL != NULL no SQL)
  const vinculoExistente = await prisma.vinculoRede.findFirst({
    where: { gabineteId: gabinete.id, pessoaId, indicadoPorId: mobilizadorId },
  })
  if (!vinculoExistente) {
    await prisma.vinculoRede.create({
      data: {
        gabineteId: gabinete.id,
        pessoaId,
        indicadoPorId: mobilizadorId,
        nivel: mobilizadorId ? 2 : 1,
      },
    })
  }

  redirect(sucessoUrl)
}
```

- [ ] **Step 2: Checar tipos**

Run: `npx tsc --noEmit`
Expected: erros apontando pro form/página que ainda chamam a assinatura antiga (`CadastroForm.tsx`, `[segmentoSlug]/page.tsx`) — esperado, corrigido na Task 2. Confirme que não há erro dentro do próprio `submeter-cadastro.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/actions/public/submeter-cadastro.ts
git commit -m "feat: submeterCadastro aceita múltiplos segmentos e URL de sucesso configurável"
```

---

### Task 2: Generalizar o formulário público e atualizar a página existente

**Files:**
- Modify: `src/app/[slug]/cadastro/[segmentoSlug]/CadastroForm.tsx`
- Modify: `src/app/[slug]/cadastro/[segmentoSlug]/page.tsx`

**Interfaces:**
- Consumes: `submeterCadastro` da Task 1.
- Produces: `CadastroForm({ slug, segmentoSlugs: string[], mobilizadorToken?, sucessoUrl: string, regioes, profissoes })` — usado por esta task (rota existente, 1 item no array) e pela Task 3 (rota nova, N itens).

- [ ] **Step 1: Substituir o conteúdo de `CadastroForm.tsx`**

```tsx
'use client'

import { useState, useTransition } from 'react'
import { verificarWhatsApp } from '@/actions/public/verificar-whatsapp'
import { submeterCadastro } from '@/actions/public/submeter-cadastro'

type Regiao = { id: string; nome: string }
type Profissao = { id: string; nome: string }

type Props = {
  slug: string
  segmentoSlugs: string[]
  mobilizadorToken?: string
  sucessoUrl: string
  regioes: Regiao[]
  profissoes: Profissao[]
}

type Passo = 'whatsapp' | 'dados' | 'confirmacao'

export default function CadastroForm({
  slug,
  segmentoSlugs,
  mobilizadorToken,
  sucessoUrl,
  regioes,
  profissoes,
}: Props) {
  const [passo, setPasso] = useState<Passo>('whatsapp')
  const [whatsapp, setWhatsapp] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleVerificarWhatsApp(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setErro(null)
    startTransition(async () => {
      const resultado = await verificarWhatsApp(slug, whatsapp)
      if (resultado.erro) {
        setErro(resultado.erro)
        return
      }
      setPasso(resultado.existe ? 'confirmacao' : 'dados')
    })
  }

  function handleSubmeterDados(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setErro(null)
    const fd = new FormData(e.currentTarget)
    startTransition(async () => {
      const resultado = await submeterCadastro({
        slug,
        segmentoSlugs,
        whatsapp,
        nome: fd.get('nome') as string,
        email: fd.get('email') as string,
        regiaoId: fd.get('regiaoId') as string,
        profissaoId: fd.get('profissaoId') as string,
        genero: fd.get('genero') as string,
        mobilizadorToken,
        sucessoUrl,
      })
      if (resultado && 'erro' in resultado) {
        setErro(resultado.erro)
      }
    })
  }

  function handleConfirmar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setErro(null)
    startTransition(async () => {
      const resultado = await submeterCadastro({
        slug,
        segmentoSlugs,
        whatsapp,
        nome: '',
        mobilizadorToken,
        sucessoUrl,
      })
      if (resultado && 'erro' in resultado) {
        setErro(resultado.erro)
      }
    })
  }

  return (
    <div>
      {erro && (
        <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700 border border-red-200">
          {erro}
        </div>
      )}

      {passo === 'whatsapp' && (
        <form onSubmit={handleVerificarWhatsApp} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">
              WhatsApp *
            </label>
            <input
              type="tel"
              value={whatsapp}
              onChange={(e) => setWhatsapp(e.target.value)}
              required
              placeholder="(61) 9 9999-9999"
              className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button
            type="submit"
            disabled={isPending}
            className="w-full bg-blue-600 text-white py-2 px-4 rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {isPending ? 'Verificando...' : 'Continuar'}
          </button>
        </form>
      )}

      {passo === 'dados' && (
        <form onSubmit={handleSubmeterDados} className="space-y-4">
          <p className="text-sm text-gray-600">
            Preencha seus dados para concluir o cadastro.
          </p>
          <div>
            <label className="block text-sm font-medium text-gray-700">Nome completo *</label>
            <input
              name="nome"
              required
              className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">E-mail</label>
            <input
              name="email"
              type="email"
              className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Gênero</label>
            <select
              name="genero"
              className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
            >
              <option value="">Prefiro não informar</option>
              <option value="masculino">Masculino</option>
              <option value="feminino">Feminino</option>
              <option value="outro">Outro</option>
            </select>
          </div>
          {regioes.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700">Região</label>
              <select
                name="regiaoId"
                className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              >
                <option value="">Selecionar...</option>
                {regioes.map((r) => (
                  <option key={r.id} value={r.id}>{r.nome}</option>
                ))}
              </select>
            </div>
          )}
          {profissoes.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700">Profissão</label>
              <select
                name="profissaoId"
                className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              >
                <option value="">Selecionar...</option>
                {profissoes.map((p) => (
                  <option key={p.id} value={p.id}>{p.nome}</option>
                ))}
              </select>
            </div>
          )}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setPasso('whatsapp')}
              className="flex-1 border border-gray-300 text-gray-700 py-2 px-4 rounded-md text-sm font-medium hover:bg-gray-50"
            >
              Voltar
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {isPending ? 'Enviando...' : 'Confirmar cadastro'}
            </button>
          </div>
        </form>
      )}

      {passo === 'confirmacao' && (
        <form onSubmit={handleConfirmar} className="space-y-4">
          <p className="text-sm text-gray-700">
            Este número já está cadastrado. Clique em confirmar para registrar sua participação neste evento.
          </p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setPasso('whatsapp')}
              className="flex-1 border border-gray-300 text-gray-700 py-2 px-4 rounded-md text-sm font-medium hover:bg-gray-50"
            >
              Não sou eu
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {isPending ? 'Confirmando...' : 'Confirmar'}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Atualizar `page.tsx` pra passar as novas props**

Em `src/app/[slug]/cadastro/[segmentoSlug]/page.tsx`, trocar:

```tsx
        <CadastroForm
          slug={params.slug}
          segmentoSlug={params.segmentoSlug}
          mobilizadorToken={searchParams.m}
          regioes={regioes}
          profissoes={profissoes}
        />
```

por:

```tsx
        <CadastroForm
          slug={params.slug}
          segmentoSlugs={[params.segmentoSlug]}
          mobilizadorToken={searchParams.m}
          sucessoUrl={`/${params.slug}/cadastro/${params.segmentoSlug}/sucesso`}
          regioes={regioes}
          profissoes={profissoes}
        />
```

- [ ] **Step 3: Checar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add "src/app/[slug]/cadastro/[segmentoSlug]/CadastroForm.tsx" "src/app/[slug]/cadastro/[segmentoSlug]/page.tsx"
git commit -m "feat: CadastroForm aceita múltiplos segmentos e URL de sucesso"
```

---

### Task 3: Rota pública nova — cadastro com múltiplos segmentos

**Files:**
- Create: `src/app/[slug]/cadastro/link/page.tsx`
- Create: `src/app/[slug]/cadastro/link/sucesso/page.tsx`

**Interfaces:**
- Consumes: `CadastroForm` da Task 2 (props `segmentoSlugs`, `sucessoUrl`).
- Produces: rota pública `/{slug}/cadastro/link?segmentos=slug1,slug2&m=token`, consumida pela Task 4/5 (link gerado pelo admin aponta pra cá).

- [ ] **Step 1: Criar `src/app/[slug]/cadastro/link/page.tsx`**

```tsx
import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { getGabineteBySlug } from '@/lib/gabinete'
import CadastroForm from '../[segmentoSlug]/CadastroForm'

export default async function CadastroLinkPage({
  params,
  searchParams,
}: {
  params: { slug: string }
  searchParams: { segmentos?: string; m?: string }
}) {
  const gabinete = await getGabineteBySlug(params.slug)
  if (!gabinete || !gabinete.ativo) notFound()

  const segmentoSlugs = (searchParams.segmentos ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  if (segmentoSlugs.length === 0) notFound()

  const segmentosValidos = await prisma.segmento.findMany({
    where: { gabineteId: gabinete.id, slug: { in: segmentoSlugs }, status: 'ativo' },
    select: { slug: true },
  })
  if (segmentosValidos.length === 0) notFound()

  const [regioes, profissoes] = await Promise.all([
    prisma.regiao.findMany({
      where: { gabineteId: gabinete.id, ativa: true },
      orderBy: { nome: 'asc' },
      select: { id: true, nome: true },
    }),
    prisma.profissao.findMany({
      where: { gabineteId: gabinete.id, ativa: true },
      orderBy: { nome: 'asc' },
      select: { id: true, nome: true },
    }),
  ])

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center py-12 px-4">
      <div className="w-full max-w-md bg-white rounded-xl shadow-sm p-8 space-y-6">
        {gabinete.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={gabinete.logoUrl}
            alt={gabinete.nomeSistema}
            className="h-12 object-contain mx-auto"
          />
        )}
        <div className="text-center">
          <h1 className="text-xl font-bold text-gray-900">Cadastro</h1>
        </div>

        <CadastroForm
          slug={params.slug}
          segmentoSlugs={segmentosValidos.map((s) => s.slug)}
          mobilizadorToken={searchParams.m}
          sucessoUrl={`/${params.slug}/cadastro/link/sucesso`}
          regioes={regioes}
          profissoes={profissoes}
        />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Criar `src/app/[slug]/cadastro/link/sucesso/page.tsx`**

```tsx
import { notFound } from 'next/navigation'
import { getGabineteBySlug } from '@/lib/gabinete'

export default async function CadastroLinkSucessoPage({
  params,
}: {
  params: { slug: string }
}) {
  const gabinete = await getGabineteBySlug(params.slug)
  if (!gabinete) notFound()

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center py-12 px-4">
      <div className="w-full max-w-md bg-white rounded-xl shadow-sm p-8 text-center space-y-4">
        {gabinete.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={gabinete.logoUrl}
            alt={gabinete.nomeSistema}
            className="h-12 object-contain mx-auto"
          />
        )}
        <div className="text-4xl">✓</div>
        <h1 className="text-xl font-bold text-gray-900">Cadastro realizado!</h1>
        <p className="text-sm text-gray-600">
          Obrigado pelo seu cadastro. Suas informações foram registradas com sucesso.
        </p>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Checar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add "src/app/[slug]/cadastro/link/page.tsx" "src/app/[slug]/cadastro/link/sucesso/page.tsx"
git commit -m "feat: rota pública de cadastro com múltiplos segmentos (/cadastro/link)"
```

---

### Task 4: Action de geração de link (admin)

**Files:**
- Create: `src/actions/admin/gerar-link-cadastro.ts`

**Interfaces:**
- Consumes: `assertAdminAccess`, `prisma`, `getAppUrl`, `QRCode.toDataURL` (lib `qrcode`, já é dependência).
- Produces: `GerarLinkCadastroState = { erro?: string; link?: string; qrPngDataUrl?: string; qrTransparenteDataUrl?: string }` e `gerarLinkCadastro(_prevState: GerarLinkCadastroState, formData: FormData): Promise<GerarLinkCadastroState>` — usado via `useFormState` pela Task 5.

- [ ] **Step 1: Criar a action**

```ts
'use server'

import QRCode from 'qrcode'
import { prisma } from '@/lib/prisma'
import { assertAdminAccess } from '@/lib/assert-admin-access'
import { getAppUrl } from '@/lib/app-url'

export type GerarLinkCadastroState = {
  erro?: string
  link?: string
  qrPngDataUrl?: string
  qrTransparenteDataUrl?: string
}

export async function gerarLinkCadastro(
  _prevState: GerarLinkCadastroState,
  formData: FormData
): Promise<GerarLinkCadastroState> {
  const slug = formData.get('slug') as string
  const segmentoIds = formData.getAll('segmentoIds') as string[]
  const mobilizadorPessoaId = (formData.get('mobilizadorPessoaId') as string) || null

  if (segmentoIds.length === 0) return { erro: 'Selecione ao menos um segmento.' }

  const { gabinete } = await assertAdminAccess(slug)

  const segmentos = await prisma.segmento.findMany({
    where: { id: { in: segmentoIds }, gabineteId: gabinete.id, status: 'ativo' },
    select: { slug: true },
  })
  if (segmentos.length === 0) return { erro: 'Nenhum segmento válido selecionado.' }

  let token: string | null = null
  if (mobilizadorPessoaId) {
    const mobilizador = await prisma.pessoa.findFirst({
      where: { id: mobilizadorPessoaId, gabineteId: gabinete.id, isMobilizador: true },
      select: { tokenMobilizador: true },
    })
    if (!mobilizador?.tokenMobilizador) return { erro: 'Mobilizador inválido.' }
    token = mobilizador.tokenMobilizador
  }

  const appUrl = getAppUrl()
  const segmentosParam = segmentos.map((s) => s.slug).join(',')
  const link = `${appUrl}/${slug}/cadastro/link?segmentos=${encodeURIComponent(segmentosParam)}${token ? `&m=${token}` : ''}`

  const [qrPngDataUrl, qrTransparenteDataUrl] = await Promise.all([
    QRCode.toDataURL(link, { width: 300, margin: 2 }),
    QRCode.toDataURL(link, { width: 300, margin: 2, color: { light: '#ffffff00' } }),
  ])

  return { link, qrPngDataUrl, qrTransparenteDataUrl }
}
```

- [ ] **Step 2: Checar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/actions/admin/gerar-link-cadastro.ts
git commit -m "feat: action de geração de link de cadastro (admin) com múltiplos segmentos e rede"
```

---

### Task 5: Tela do admin — Link de Cadastro

**Files:**
- Create: `src/app/[slug]/admin/link-cadastro/page.tsx`
- Create: `src/app/[slug]/admin/link-cadastro/GerarLinkForm.tsx`

**Interfaces:**
- Consumes: `gerarLinkCadastro`/`GerarLinkCadastroState` da Task 4; `corTextoContraste` de `@/lib/cor-contraste`.
- Produces: rota `/{slug}/admin/link-cadastro`, consumida pela Task 7 (item de menu).

- [ ] **Step 1: Criar `src/app/[slug]/admin/link-cadastro/page.tsx`**

```tsx
import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { getGabineteBySlug } from '@/lib/gabinete'
import GerarLinkForm from './GerarLinkForm'

export default async function AdminLinkCadastroPage({
  params,
}: {
  params: { slug: string }
}) {
  const gabinete = await getGabineteBySlug(params.slug)
  if (!gabinete) notFound()

  const [segmentos, mobilizadores] = await Promise.all([
    prisma.segmento.findMany({
      where: { gabineteId: gabinete.id, status: 'ativo' },
      orderBy: { nome: 'asc' },
      select: { id: true, nome: true },
    }),
    prisma.pessoa.findMany({
      where: { gabineteId: gabinete.id, isMobilizador: true, deletedAt: null },
      orderBy: { nome: 'asc' },
      select: { id: true, nome: true },
    }),
  ])

  return (
    <div className="space-y-6">
      <p className="text-[13px] text-[rgba(113,113,113,0.65)]">Início / Link de Cadastro</p>
      <h1 className="text-2xl font-bold text-gray-900 -mt-3">Link de Cadastro</h1>
      <p className="text-sm text-gray-600">
        Escolha um ou mais segmentos e, se quiser, a rede de um mobilizador específico.
        Quem se cadastrar pelo link gerado entra direto nessa rede (ou na Rede Raiz, se
        nenhuma for escolhida) e já fica marcado nos segmentos selecionados.
      </p>

      <GerarLinkForm
        slug={params.slug}
        segmentos={segmentos}
        mobilizadores={mobilizadores}
        corPrimaria={gabinete.corPrimaria}
      />
    </div>
  )
}
```

- [ ] **Step 2: Criar `src/app/[slug]/admin/link-cadastro/GerarLinkForm.tsx`**

```tsx
'use client'

import { useState } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import { gerarLinkCadastro, type GerarLinkCadastroState } from '@/actions/admin/gerar-link-cadastro'
import { corTextoContraste } from '@/lib/cor-contraste'

type Segmento = { id: string; nome: string }
type Mobilizador = { id: string; nome: string }

const initialState: GerarLinkCadastroState = {}

function BotaoGerar({ corPrimaria, corTexto }: { corPrimaria: string; corTexto: string }) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      style={{ backgroundColor: corPrimaria, color: corTexto }}
      className="px-6 py-2.5 rounded-md text-sm font-medium disabled:opacity-50"
    >
      {pending ? 'Gerando...' : 'Gerar Link'}
    </button>
  )
}

export default function GerarLinkForm({
  slug,
  segmentos,
  mobilizadores,
  corPrimaria,
}: {
  slug: string
  segmentos: Segmento[]
  mobilizadores: Mobilizador[]
  corPrimaria: string
}) {
  const corTexto = corTextoContraste(corPrimaria)
  const [state, action] = useFormState(gerarLinkCadastro, initialState)
  const [segmentosSelecionados, setSegmentosSelecionados] = useState<Set<string>>(new Set())
  const [copiado, setCopiado] = useState(false)

  function toggleSegmento(id: string) {
    setSegmentosSelecionados((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function copiarLink() {
    if (!state.link) return
    await navigator.clipboard.writeText(state.link)
    setCopiado(true)
    setTimeout(() => setCopiado(false), 2000)
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-6">
      <form action={action} className="space-y-5">
        <input type="hidden" name="slug" value={slug} />
        {Array.from(segmentosSelecionados).map((id) => (
          <input key={id} type="hidden" name="segmentoIds" value={id} />
        ))}

        <div>
          <p className="text-sm font-medium text-gray-700 mb-2">Segmentos para esse cadastro</p>
          <div className="flex flex-wrap gap-2">
            {segmentos.map((seg) => {
              const selecionado = segmentosSelecionados.has(seg.id)
              return (
                <button
                  key={seg.id}
                  type="button"
                  onClick={() => toggleSegmento(seg.id)}
                  style={selecionado ? { backgroundColor: corPrimaria, color: corTexto } : undefined}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium ${
                    selecionado ? '' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {seg.nome}
                </button>
              )
            })}
            {segmentos.length === 0 && (
              <p className="text-xs text-gray-500">Nenhum segmento ativo cadastrado.</p>
            )}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Rede (opcional)
          </label>
          <select
            name="mobilizadorPessoaId"
            defaultValue=""
            className="block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
          >
            <option value="">Rede Raiz (sem mobilizador)</option>
            {mobilizadores.map((m) => (
              <option key={m.id} value={m.id}>{m.nome}</option>
            ))}
          </select>
        </div>

        {state.erro && <p className="text-sm text-red-600">{state.erro}</p>}

        <BotaoGerar corPrimaria={corPrimaria} corTexto={corTexto} />
      </form>

      {state.link && (
        <div className="border-t border-gray-100 pt-5 space-y-4">
          <div>
            <p className="text-xs text-gray-500 mb-1">Link gerado</p>
            <div className="flex gap-2">
              <input
                readOnly
                value={state.link}
                className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm font-mono bg-gray-50"
                onFocus={(e) => e.currentTarget.select()}
              />
              <button
                type="button"
                onClick={copiarLink}
                style={{ backgroundColor: corPrimaria, color: corTexto }}
                className="px-4 py-2 rounded-md text-sm font-medium whitespace-nowrap"
              >
                {copiado ? 'Copiado!' : 'Copiar Link'}
              </button>
            </div>
          </div>

          {state.qrPngDataUrl && (
            <div className="flex flex-col items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={state.qrPngDataUrl} alt="QR Code do link gerado" className="w-48 h-48" />
              <div className="flex gap-4">
                <a href={state.qrPngDataUrl} download="qr-link-cadastro.png" className="text-xs text-blue-600 underline">
                  Baixar PNG
                </a>
                {state.qrTransparenteDataUrl && (
                  <a href={state.qrTransparenteDataUrl} download="qr-link-cadastro-transparente.png" className="text-xs text-blue-600 underline">
                    Baixar PNG transparente
                  </a>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Checar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add "src/app/[slug]/admin/link-cadastro/page.tsx" "src/app/[slug]/admin/link-cadastro/GerarLinkForm.tsx"
git commit -m "feat: tela do admin para gerar link de cadastro (segmentos + rede)"
```

---

### Task 6: Tela do mobilizador — Link de Cadastro (migra da home)

**Files:**
- Create: `src/app/[slug]/mobilizador/link-cadastro/page.tsx`
- Modify: `src/app/[slug]/mobilizador/page.tsx` (remove os cards de link/QR)

**Interfaces:**
- Produces: rota `/{slug}/mobilizador/link-cadastro`, consumida pela Task 7 (item de menu).

- [ ] **Step 1: Criar `src/app/[slug]/mobilizador/link-cadastro/page.tsx`**

```tsx
import { notFound } from 'next/navigation'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import QRCode from 'qrcode'
import { prisma } from '@/lib/prisma'
import { getGabineteBySlug } from '@/lib/gabinete'
import { getAppUrl } from '@/lib/app-url'

export default async function MobilizadorLinkCadastroPage({
  params,
}: {
  params: { slug: string }
}) {
  const gabinete = await getGabineteBySlug(params.slug)
  if (!gabinete) notFound()

  const cookieStore = cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } }
  )
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) notFound()

  const pessoa = await prisma.pessoa.findFirst({
    where: { userId: session.user.id, gabineteId: gabinete.id, isMobilizador: true },
    select: { id: true, nome: true, tokenMobilizador: true },
  })
  if (!pessoa || !pessoa.tokenMobilizador) notFound()

  const segmentos = await prisma.segmento.findMany({
    where: { gabineteId: gabinete.id, status: 'ativo' },
    orderBy: { nome: 'asc' },
    select: { id: true, nome: true, slug: true },
  })

  const appUrl = getAppUrl()

  const linksSegmentos = await Promise.all(
    segmentos.map(async (seg) => {
      const link = `${appUrl}/${params.slug}/cadastro/${seg.slug}?m=${pessoa.tokenMobilizador}`
      const [qrPngDataUrl, qrTransparenteDataUrl] = await Promise.all([
        QRCode.toDataURL(link, { width: 300, margin: 2 }),
        QRCode.toDataURL(link, { width: 300, margin: 2, color: { light: '#ffffff00' } }),
      ])
      return { ...seg, link, qrPngDataUrl, qrTransparenteDataUrl }
    })
  )

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Link de Cadastro</h1>
        <p className="text-sm text-gray-600 mt-1">
          Copie o link abaixo e envie aos seus contatos. Todos que se cadastrarem por
          ele entram automaticamente na sua rede.
        </p>
      </div>

      {linksSegmentos.length === 0 ? (
        <p className="text-sm text-gray-500">Nenhum segmento ativo no momento.</p>
      ) : (
        <div className="space-y-6">
          {linksSegmentos.map((seg) => (
            <div key={seg.id} className="bg-white rounded-lg p-6 shadow-sm space-y-4">
              <h2 className="text-base font-semibold text-gray-800">{seg.nome}</h2>
              <div>
                <p className="text-xs text-gray-500 mb-1">Seu link personalizado</p>
                <p className="text-sm text-blue-600 break-all">{seg.link}</p>
                <a
                  href={seg.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block mt-1 text-xs text-blue-600 underline"
                >
                  Abrir link
                </a>
              </div>
              <div className="flex flex-col items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={seg.qrPngDataUrl} alt={`QR Code — ${seg.nome}`} className="w-48 h-48" />
                <div className="flex gap-4">
                  <a
                    href={seg.qrPngDataUrl}
                    download={`qr-${params.slug}-${seg.slug}.png`}
                    className="text-xs text-blue-600 underline"
                  >
                    Baixar PNG
                  </a>
                  <a
                    href={seg.qrTransparenteDataUrl}
                    download={`qr-${params.slug}-${seg.slug}-transparente.png`}
                    className="text-xs text-blue-600 underline"
                  >
                    Baixar PNG transparente
                  </a>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Substituir todo o conteúdo de `src/app/[slug]/mobilizador/page.tsx`**

Remove os imports `QRCode` e `getAppUrl`, a busca de `segmentos`/`linksSegmentos`/`appUrl`, e o bloco JSX que renderiza os cards de link/QR. O resto (verificação de sessão, rede, drill-down, `UsuariosTable`) fica igual.

```tsx
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { prisma } from '@/lib/prisma'
import { getGabineteBySlug } from '@/lib/gabinete'
import { mapPapelParaTipoConta } from '@/lib/tipo-conta'
import UsuariosTable, { type UsuarioRow } from '../admin/pessoas/UsuariosTable'

function buildOrderBy(sort?: string, order?: string) {
  if (sort === 'nome') {
    return { nome: (order === 'desc' ? 'desc' : 'asc') as 'asc' | 'desc' }
  }
  return { criadoEm: 'desc' as const }
}

export default async function MobilizadorPage({
  params,
  searchParams,
}: {
  params: { slug: string }
  searchParams: { sort?: string; order?: string; rede?: string; path?: string }
}) {
  const gabinete = await getGabineteBySlug(params.slug)
  if (!gabinete) notFound()

  const cookieStore = cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } }
  )
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) notFound()

  const pessoa = await prisma.pessoa.findFirst({
    where: { userId: session.user.id, gabineteId: gabinete.id, isMobilizador: true },
    select: { id: true, nome: true, tokenMobilizador: true },
  })
  if (!pessoa || !pessoa.tokenMobilizador) notFound()

  const { sort, order, rede, path } = searchParams

  // Verifica se ?rede pertence à sub-árvore do mobilizador logado
  if (rede && rede !== pessoa.id) {
    let currentId: string | null = rede
    let authorized = false
    const visited = new Set<string>()
    while (currentId && !visited.has(currentId)) {
      visited.add(currentId)
      const vinculo: { indicadoPorId: string | null } | null = await prisma.vinculoRede.findFirst({
        where: { pessoaId: currentId, gabineteId: gabinete.id, deletedAt: null },
        select: { indicadoPorId: true },
      })
      const parentId: string | null = vinculo?.indicadoPorId ?? null
      if (parentId === pessoa.id) { authorized = true; break }
      currentId = parentId
    }
    if (!authorized) notFound()
  }

  const orderBy = buildOrderBy(sort, order)
  const pathIds = path ? path.split(',').filter(Boolean) : []
  const indicadorId = rede ?? pessoa.id

  const vinculos = await prisma.vinculoRede.findMany({
    where: { indicadoPorId: indicadorId, gabineteId: gabinete.id, deletedAt: null },
    select: { pessoaId: true },
  })
  const ids = vinculos.map((v) => v.pessoaId)

  const pessoasRaw = ids.length > 0
    ? await prisma.pessoa.findMany({
        where: { id: { in: ids }, gabineteId: gabinete.id, deletedAt: null },
        orderBy,
        take: 50,
        select: {
          id: true,
          nome: true,
          email: true,
          fotoUrl: true,
          userId: true,
          segmentos: { select: { segmento: { select: { id: true, nome: true } } } },
        },
      })
    : []

  const userIds = pessoasRaw.map((p) => p.userId).filter((id): id is string => !!id)
  const papeis = userIds.length
    ? await prisma.usuarioGabinete.findMany({
        where: { userId: { in: userIds }, gabineteId: gabinete.id },
        select: { userId: true, papel: true },
      })
    : []
  const papelPorUserId = new Map(papeis.map((p) => [p.userId, p.papel]))

  const usuariosRede: UsuarioRow[] = pessoasRaw.map((p) => ({
    id: p.id,
    nome: p.nome,
    email: p.email,
    fotoUrl: p.fotoUrl,
    tipoConta: mapPapelParaTipoConta(p.userId ? papelPorUserId.get(p.userId) : null),
    segmentos: p.segmentos.map((s) => s.segmento),
  }))

  const breadcrumbPessoas = pathIds.length > 0
    ? await prisma.pessoa.findMany({
        where: { id: { in: pathIds }, gabineteId: gabinete.id, deletedAt: null },
        select: { id: true, nome: true },
      })
    : []
  const breadcrumb = pathIds
    .map((id) => breadcrumbPessoas.find((p) => p.id === id))
    .filter(Boolean) as { id: string; nome: string }[]

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Olá, {pessoa.nome}!</h1>
        <p className="text-sm text-gray-600 mt-1">
          Acompanhe aqui as pessoas cadastradas na sua rede.
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-gray-900">Minha Rede</h2>

        {breadcrumb.length > 0 && (
          <nav className="text-sm text-gray-500 flex items-center gap-1 flex-wrap">
            <Link href={`/${params.slug}/mobilizador`} className="hover:text-gray-900">
              Minha Rede
            </Link>
            {breadcrumb.map((item, i) => {
              const isLast = i === breadcrumb.length - 1
              const crumbPath = pathIds.slice(0, i + 1).join(',')
              return (
                <span key={item.id} className="flex items-center gap-1">
                  <span>›</span>
                  {isLast ? (
                    <span className="text-gray-900 font-medium">Rede de {item.nome}</span>
                  ) : (
                    <Link
                      href={`/${params.slug}/mobilizador?rede=${item.id}&path=${crumbPath}`}
                      className="hover:text-gray-900"
                    >
                      Rede de {item.nome}
                    </Link>
                  )}
                </span>
              )
            })}
          </nav>
        )}

        <div className="bg-white rounded-lg shadow-sm overflow-x-auto">
          <UsuariosTable
            slug={params.slug}
            usuarios={usuariosRede}
            corPrimaria={gabinete.corPrimaria}
            baseHref={`/${params.slug}/mobilizador/pessoas`}
            somenteLeitura
          />
        </div>
      </section>
    </div>
  )
}
```

- [ ] **Step 3: Checar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add "src/app/[slug]/mobilizador/link-cadastro/page.tsx" "src/app/[slug]/mobilizador/page.tsx"
git commit -m "feat: tela de Link de Cadastro do mobilizador; remove cards da home"
```

---

### Task 7: Menu — dois itens de "Link de Cadastro"

**Files:**
- Modify: `src/components/admin/Sidebar.tsx`

- [ ] **Step 1: Admin — tirar de `emBreve`, adicionar `href`**

Trocar:

```ts
    { label: 'Link de Cadastro', emBreve: true, icone: 'link-cadastro' },
```

por:

```ts
    { label: 'Link de Cadastro', href: `/${slug}/admin/link-cadastro`, icone: 'link-cadastro' },
```

(mantendo a posição atual na lista, entre "Banco de Talentos" e "Importar/Exportar").

- [ ] **Step 2: Mobilizador — terceiro item**

Trocar:

```ts
function buildItensMobilizador(slug: string): ItemMenu[] {
  return [
    { label: 'Início', href: `/${slug}/mobilizador`, icone: 'inicio' },
    { label: 'Demandas', href: `/${slug}/mobilizador/demandas`, icone: 'demandas' },
  ]
}
```

por:

```ts
function buildItensMobilizador(slug: string): ItemMenu[] {
  return [
    { label: 'Início', href: `/${slug}/mobilizador`, icone: 'inicio' },
    { label: 'Demandas', href: `/${slug}/mobilizador/demandas`, icone: 'demandas' },
    { label: 'Link de Cadastro', href: `/${slug}/mobilizador/link-cadastro`, icone: 'link-cadastro' },
  ]
}
```

- [ ] **Step 3: Checar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add src/components/admin/Sidebar.tsx
git commit -m "feat: ativar item de menu Link de Cadastro (admin e mobilizador)"
```

---

### Task 8: Filtro "Rede Raiz" na listagem de Usuários

**Files:**
- Modify: `src/app/[slug]/admin/pessoas/page.tsx`

- [ ] **Step 1: Tratar `rede=raiz` na busca do "dono" da rede (linha ~39)**

Trocar:

```tsx
  const donaDaRede = rede
    ? await prisma.pessoa.findFirst({
        where: { id: rede, gabineteId: gabinete.id },
        select: { nome: true },
      })
    : null
```

por:

```tsx
  const donaDaRede = rede === 'raiz'
    ? { nome: 'Rede Raiz' }
    : rede
      ? await prisma.pessoa.findFirst({
          where: { id: rede, gabineteId: gabinete.id },
          select: { nome: true },
        })
      : null
```

- [ ] **Step 2: Tratar `rede=raiz` no filtro de IDs (linha ~56)**

Trocar:

```tsx
  let idsFiltro: string[] | null = null
  if (rede) {
    const vinculos = await prisma.vinculoRede.findMany({
      where: { indicadoPorId: rede, gabineteId: gabinete.id, deletedAt: null },
      select: { pessoaId: true },
    })
    idsFiltro = vinculos.map((v) => v.pessoaId)
  }
```

por:

```tsx
  let idsFiltro: string[] | null = null
  if (rede === 'raiz') {
    const vinculos = await prisma.vinculoRede.findMany({
      where: { indicadoPorId: null, gabineteId: gabinete.id, deletedAt: null },
      select: { pessoaId: true },
    })
    idsFiltro = vinculos.map((v) => v.pessoaId)
  } else if (rede) {
    const vinculos = await prisma.vinculoRede.findMany({
      where: { indicadoPorId: rede, gabineteId: gabinete.id, deletedAt: null },
      select: { pessoaId: true },
    })
    idsFiltro = vinculos.map((v) => v.pessoaId)
  }
```

- [ ] **Step 3: Corrigir o texto do cabeçalho pra não ficar "Rede de Rede Raiz"**

Trocar:

```tsx
          {donaDaRede && (
            <span className="font-normal text-gray-500">
              {' '}<span className="mx-1 text-gray-500">-</span> Rede de {donaDaRede.nome}
            </span>
          )}
```

por:

```tsx
          {donaDaRede && (
            <span className="font-normal text-gray-500">
              {' '}<span className="mx-1 text-gray-500">-</span> {rede === 'raiz' ? 'Rede Raiz' : `Rede de ${donaDaRede.nome}`}
            </span>
          )}
```

- [ ] **Step 4: Adicionar o link "Ver Rede Raiz" perto da busca**

Trocar:

```tsx
      <form method="GET" className="flex gap-2">
        {rede && <input type="hidden" name="rede" value={rede} />}
        {path && <input type="hidden" name="path" value={path} />}
        <input
          name="q"
          defaultValue={q}
          placeholder="Buscar por nome, WhatsApp ou e-mail..."
          className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm"
        />
        <button
          type="submit"
          style={{ backgroundColor: gabinete.corPrimaria, color: corTexto }}
          className="px-4 py-2 rounded-md text-sm font-medium"
        >
          Buscar
        </button>
      </form>
```

por:

```tsx
      <div className="flex gap-3 items-center">
        <form method="GET" className="flex gap-2 flex-1">
          {rede && <input type="hidden" name="rede" value={rede} />}
          {path && <input type="hidden" name="path" value={path} />}
          <input
            name="q"
            defaultValue={q}
            placeholder="Buscar por nome, WhatsApp ou e-mail..."
            className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm"
          />
          <button
            type="submit"
            style={{ backgroundColor: gabinete.corPrimaria, color: corTexto }}
            className="px-4 py-2 rounded-md text-sm font-medium"
          >
            Buscar
          </button>
        </form>
        <Link
          href={`/${params.slug}/admin/pessoas?rede=raiz`}
          className="text-sm text-gray-500 hover:text-gray-900 whitespace-nowrap"
        >
          Ver Rede Raiz
        </Link>
      </div>
```

- [ ] **Step 5: Checar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 6: Commit**

```bash
git add "src/app/[slug]/admin/pessoas/page.tsx"
git commit -m "feat: filtro Rede Raiz na listagem de Usuários"
```

---

### Task 9: Verificação end-to-end no navegador

**Files:** nenhum (só verificação).

- [ ] **Step 1: Build de produção**

Run: `npm run build`
Expected: build conclui sem erros de tipo/lint bloqueante.

- [ ] **Step 2: Confirmar servidor de dev no ar**

Se não houver servidor rodando na porta usada pra este worktree, subir com `npm run dev -- -p <porta>` em background e aguardar "Ready in".

- [ ] **Step 3: Link pessoal do mobilizador (regressão)**

Como mobilizador, abrir `/mobilizador/link-cadastro`. Confirmar que aparece um card por
segmento ativo, cada um com link (`/cadastro/{segmento}?m={token}`), QR code, e dois
botões de download (PNG e PNG transparente). Abrir o link num navegador anônimo/aba
nova e confirmar que o formulário de cadastro de sempre ainda funciona (WhatsApp →
dados → confirmação), redirecionando pra `/cadastro/{segmento}/sucesso` como antes.

- [ ] **Step 4: Menu do mobilizador**

Confirmar que o menu lateral mostra três itens: Início, Demandas, Link de Cadastro. E
que a home (`/mobilizador`) não mostra mais os cards de link/QR — só o "Olá, {nome}!" e
a listagem "Minha Rede".

- [ ] **Step 5: Tela do admin — gerar link**

Como admin, abrir `/admin/link-cadastro` (menu lateral, item "Link de Cadastro" — deve
ter deixado de mostrar "em breve"). Marcar 2 segmentos, escolher um mobilizador no
select "Rede", clicar "Gerar Link". Confirmar que aparece o link
(`/cadastro/link?segmentos=...&m=...`), botão "Copiar Link" (com feedback "Copiado!"),
QR code e os dois downloads.

- [ ] **Step 6: Testar o link gerado (com rede)**

Abrir o link gerado no Step 5 numa aba anônima. Completar o cadastro com um WhatsApp
novo. Confirmar redirecionamento pra `/cadastro/link/sucesso`. Depois, como admin,
confirmar que essa pessoa nova aparece marcada nos 2 segmentos escolhidos e está na
rede do mobilizador escolhido (via `/admin/pessoas?rede={mobilizadorId}` ou pela ficha
da pessoa).

- [ ] **Step 7: Testar o link gerado (sem rede — Rede Raiz)**

Voltar em `/admin/link-cadastro`, gerar um novo link sem escolher mobilizador (deixar
"Rede Raiz"). Completar o cadastro com outro WhatsApp novo. Confirmar que a pessoa
aparece no filtro `/admin/pessoas?rede=raiz` (via o link "Ver Rede Raiz" na listagem de
Usuários) e não aparece em nenhuma rede de mobilizador específico.

- [ ] **Step 8: Reportar resultado**

Reportar quais passos passaram, com observações. Se algum passo não puder ser testado
por falta de dados (ex: nenhum mobilizador cadastrado), reportar isso explicitamente.

---

## Self-Review Notes

- **Cobertura do spec:** tela do mobilizador com cards por segmento + downloads PNG
  (Task 6), tela do admin com múltiplos segmentos + rede + Rede Raiz (Tasks 4+5), rota
  pública nova pro link do admin (Task 3), generalização da action/form pra suportar
  isso sem quebrar o link pessoal (Tasks 1+2), itens de menu (Task 7), filtro Rede Raiz
  na listagem de Usuários (Task 8). Correção documentada: JPG trocado por PNG
  opaco+transparente (limitação real da lib `qrcode`, sem dependência nova).
- **Consistência de tipos:** `CadastroForm` (Task 2) e as duas páginas que a consomem
  (Task 2 e Task 3) usam a mesma assinatura `segmentoSlugs: string[]`/`sucessoUrl:
  string`. `GerarLinkCadastroState` (Task 4) tem os mesmos campos usados pelo
  `GerarLinkForm` (Task 5): `erro`, `link`, `qrPngDataUrl`, `qrTransparenteDataUrl`.
- **Placeholders:** nenhum "TBD"/"implementar depois" — todo código está completo em
  cada step.
