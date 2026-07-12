# Cadastro Completo da Pessoa + Criação de Demanda — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer o formulário de editar pessoa (e todo lugar que o reaproveita) cobrir o modelo `Pessoa` inteiro, adicionar nascimento ao cadastro público, e permitir completar o cadastro do solicitante no mesmo passo em que uma demanda é criada — com uma nova aba de busca/edição de cadastro na Central de Filtros.

**Architecture:** Extrai os campos de `EditarPessoaForm` num componente sem `<form>` próprio (`CamposPessoa`), reaproveitado tanto pelo form de edição avulsa quanto embutido no form único de Nova Demanda. Uma nova server action (`criarDemandaComCadastro`) salva pessoa + demanda numa única `$transaction`. Uma nova aba na Central de Filtros reaproveita o `EditarPessoaForm` já existente, sem action nova.

**Tech Stack:** Next.js 14 (App Router, Server Actions), Prisma 7 (`adapter-pg`), TypeScript strict, Vitest, Tailwind.

## Global Constraints

- Nascimento é digitado/exibido sempre como texto `DD/MM/AAAA` (sem `<input type="date">`, sem máscara de digitação ao vivo) — spec seção 2.
- Sem tratamento novo de erro de WhatsApp duplicado além do que `editarPessoa` já faz hoje — spec, "Fora de escopo".
- A aba "Cadastros" não tem exportação nem cadastro de pessoa nova — só busca + edição de quem já existe.
- A tela de demanda já existente (`/admin/demandas/[id]`) não é alterada por este plano.
- Este projeto não tem testes automatizados para server actions (só para funções puras em `src/lib/__tests__/`) — actions são verificadas manualmente + `tsc --noEmit`, seguindo o padrão já estabelecido no restante do código.

---

### Task 1: Parsing de data brasileira (DD/MM/AAAA)

**Files:**
- Create: `src/lib/data-brasileira.ts`
- Test: `src/lib/__tests__/data-brasileira.test.ts`

**Interfaces:**
- Produces: `parseDataBrasileira(input: string): Date | null`, `formatarDataBrasileira(data: Date | null | undefined): string` — usadas por Tasks 3, 4, 5, 6, 7 e 8.

- [ ] **Step 1: Escrever o teste (vai falhar — módulo não existe ainda)**

```ts
// src/lib/__tests__/data-brasileira.test.ts
import { describe, it, expect } from 'vitest'
import { parseDataBrasileira, formatarDataBrasileira } from '../data-brasileira'

describe('parseDataBrasileira', () => {
  it('parseia data válida com zero à esquerda', () => {
    expect(parseDataBrasileira('05/03/1990')).toEqual(new Date(1990, 2, 5))
  })

  it('parseia data válida sem zero à esquerda', () => {
    expect(parseDataBrasileira('5/3/1990')).toEqual(new Date(1990, 2, 5))
  })

  it('rejeita dia inválido (32)', () => {
    expect(parseDataBrasileira('32/01/2000')).toBeNull()
  })

  it('rejeita 31 de fevereiro (overflow de mês)', () => {
    expect(parseDataBrasileira('31/02/2000')).toBeNull()
  })

  it('rejeita mês inválido (13)', () => {
    expect(parseDataBrasileira('10/13/2000')).toBeNull()
  })

  it('rejeita formato ISO (errado para este parser)', () => {
    expect(parseDataBrasileira('2000-01-10')).toBeNull()
  })

  it('rejeita string vazia', () => {
    expect(parseDataBrasileira('')).toBeNull()
  })

  it('rejeita texto qualquer', () => {
    expect(parseDataBrasileira('não é uma data')).toBeNull()
  })
})

describe('formatarDataBrasileira', () => {
  it('formata Date para DD/MM/AAAA com zero à esquerda', () => {
    expect(formatarDataBrasileira(new Date(1990, 2, 5))).toBe('05/03/1990')
  })

  it('retorna string vazia para null', () => {
    expect(formatarDataBrasileira(null)).toBe('')
  })

  it('retorna string vazia para undefined', () => {
    expect(formatarDataBrasileira(undefined)).toBe('')
  })

  it('roundtrip: formatar depois parsear retorna a mesma data', () => {
    const original = new Date(1985, 10, 23)
    expect(parseDataBrasileira(formatarDataBrasileira(original))).toEqual(original)
  })
})
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx vitest run src/lib/__tests__/data-brasileira.test.ts`
Expected: FAIL — `Cannot find module '../data-brasileira'`

- [ ] **Step 3: Implementar**

```ts
// src/lib/data-brasileira.ts
export function parseDataBrasileira(input: string): Date | null {
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(input.trim())
  if (!match) return null

  const dia = Number(match[1])
  const mes = Number(match[2])
  const ano = Number(match[3])

  const data = new Date(ano, mes - 1, dia)
  if (data.getFullYear() !== ano || data.getMonth() !== mes - 1 || data.getDate() !== dia) {
    return null
  }
  return data
}

export function formatarDataBrasileira(data: Date | null | undefined): string {
  if (!data) return ''
  const dia = String(data.getDate()).padStart(2, '0')
  const mes = String(data.getMonth() + 1).padStart(2, '0')
  const ano = data.getFullYear()
  return `${dia}/${mes}/${ano}`
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npx vitest run src/lib/__tests__/data-brasileira.test.ts`
Expected: PASS — 12 testes

- [ ] **Step 5: Commit**

```bash
git add src/lib/data-brasileira.ts src/lib/__tests__/data-brasileira.test.ts
git commit -m "feat: parsing de data DD/MM/AAAA (data-brasileira)"
```

---

### Task 2: Componente `CamposPessoa` (extração) + expansão do `EditarPessoaForm`

**Files:**
- Create: `src/app/[slug]/admin/pessoas/[pessoaId]/CamposPessoa.tsx`
- Modify: `src/app/[slug]/admin/pessoas/[pessoaId]/EditarPessoaForm.tsx`

**Interfaces:**
- Consumes: `formatarDataBrasileira` de Task 1.
- Produces: `export type PessoaCampos` e `export default function CamposPessoa(props: { pessoa: PessoaCampos; regioes: Regiao[]; profissoes: Profissao[] })` — usado por Tasks 3 (via `EditarPessoaForm`), 6 e 7 (via `EditarPessoaForm`).

Esta task só mexe em UI — os campos novos (`nascimento`, `origem`, `bairro`, `logradouro`,
`numero`, `complemento`, `cep`) aparecem no formulário mas `editarPessoa` ainda não os
processa (isso é a Task 3). É esperado que, ao testar manualmente após esta task, editar
esses campos e salvar não tenha efeito ainda — só a Task 3 fecha esse ciclo.

- [ ] **Step 1: Criar `CamposPessoa.tsx` com todos os campos (existentes + novos)**

```tsx
// src/app/[slug]/admin/pessoas/[pessoaId]/CamposPessoa.tsx
import { formatarDataBrasileira } from '@/lib/data-brasileira'

type Regiao = { id: string; nome: string }
type Profissao = { id: string; nome: string }

export type PessoaCampos = {
  nome: string
  whatsapp: string
  email: string | null
  nascimento: Date | null
  genero: string | null
  origem: string | null
  regiaoId: string | null
  profissaoId: string | null
  cpf: string | null
  telefoneFixo: string | null
  orientacaoSexual: string | null
  religiao: string | null
  escolaridade: string | null
  bairro: string | null
  logradouro: string | null
  numero: string | null
  complemento: string | null
  cep: string | null
}

export default function CamposPessoa({
  pessoa,
  regioes,
  profissoes,
}: {
  pessoa: PessoaCampos
  regioes: Regiao[]
  profissoes: Profissao[]
}) {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700">Nome *</label>
        <input
          name="nome"
          required
          defaultValue={pessoa.nome}
          className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700">WhatsApp *</label>
          <input
            name="whatsapp"
            required
            defaultValue={pessoa.whatsapp}
            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">E-mail</label>
          <input
            name="email"
            type="email"
            defaultValue={pessoa.email ?? ''}
            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700">Data de nascimento</label>
          <input
            name="nascimento"
            placeholder="DD/MM/AAAA"
            defaultValue={formatarDataBrasileira(pessoa.nascimento)}
            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Gênero</label>
          <select
            name="genero"
            defaultValue={pessoa.genero ?? ''}
            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
          >
            <option value="">Não informado</option>
            <option value="masculino">Masculino</option>
            <option value="feminino">Feminino</option>
            <option value="outro">Outro</option>
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700">Região</label>
          <select
            name="regiaoId"
            defaultValue={pessoa.regiaoId ?? ''}
            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
          >
            <option value="">Selecionar...</option>
            {regioes.map((r) => (
              <option key={r.id} value={r.id}>{r.nome}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Profissão</label>
          <select
            name="profissaoId"
            defaultValue={pessoa.profissaoId ?? ''}
            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
          >
            <option value="">Selecionar...</option>
            {profissoes.map((p) => (
              <option key={p.id} value={p.id}>{p.nome}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700">Orientação Sexual</label>
          <input
            name="orientacaoSexual"
            defaultValue={pessoa.orientacaoSexual ?? ''}
            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Origem do cadastro</label>
          <input
            name="origem"
            defaultValue={pessoa.origem ?? ''}
            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700">CPF</label>
          <input
            name="cpf"
            defaultValue={pessoa.cpf ?? ''}
            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Telefone Fixo</label>
          <input
            name="telefoneFixo"
            defaultValue={pessoa.telefoneFixo ?? ''}
            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700">Religião</label>
          <input
            name="religiao"
            defaultValue={pessoa.religiao ?? ''}
            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Escolaridade</label>
          <input
            name="escolaridade"
            defaultValue={pessoa.escolaridade ?? ''}
            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700">Logradouro</label>
          <input
            name="logradouro"
            defaultValue={pessoa.logradouro ?? ''}
            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Número</label>
          <input
            name="numero"
            defaultValue={pessoa.numero ?? ''}
            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700">Complemento</label>
          <input
            name="complemento"
            defaultValue={pessoa.complemento ?? ''}
            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Bairro</label>
          <input
            name="bairro"
            defaultValue={pessoa.bairro ?? ''}
            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
          />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700">CEP</label>
        <input
          name="cep"
          defaultValue={pessoa.cep ?? ''}
          className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
        />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Reescrever `EditarPessoaForm.tsx` para usar `CamposPessoa`**

```tsx
// src/app/[slug]/admin/pessoas/[pessoaId]/EditarPessoaForm.tsx
'use client'

import { useFormState, useFormStatus } from 'react-dom'
import { useEffect, useState } from 'react'
import { editarPessoa } from '@/actions/admin/editar-pessoa'
import { corTextoContraste } from '@/lib/cor-contraste'
import CamposPessoa, { type PessoaCampos } from './CamposPessoa'

type Regiao = { id: string; nome: string }
type Profissao = { id: string; nome: string }

interface Props {
  slug: string
  pessoaId: string
  pessoa: PessoaCampos
  regioes: Regiao[]
  profissoes: Profissao[]
  corPrimaria: string
}

function SubmitButton({ ok, corPrimaria }: { ok: boolean | null; corPrimaria: string }) {
  const { pending } = useFormStatus()
  return (
    <div className="flex items-center gap-3">
      <button
        type="submit"
        disabled={pending}
        style={{ backgroundColor: corPrimaria, color: corTextoContraste(corPrimaria) }}
        className="px-4 py-2 rounded-md text-sm font-medium disabled:opacity-60"
      >
        {pending ? 'Salvando…' : 'Salvar alterações'}
      </button>
      {ok === true && (
        <span className="text-sm text-green-600 font-medium">✓ Salvo!</span>
      )}
      {ok === false && (
        <span className="text-sm text-red-600 font-medium">Erro ao salvar</span>
      )}
    </div>
  )
}

export default function EditarPessoaForm({ slug, pessoaId, pessoa, regioes, profissoes, corPrimaria }: Props) {
  const [state, action] = useFormState(editarPessoa, null)
  const [showFeedback, setShowFeedback] = useState(false)

  useEffect(() => {
    if (state === null) return
    setShowFeedback(true)
    const t = setTimeout(() => setShowFeedback(false), 3000)
    return () => clearTimeout(t)
  }, [state])

  const ok = showFeedback ? (state?.ok ?? null) : null

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="pessoaId" value={pessoaId} />
      <CamposPessoa pessoa={pessoa} regioes={regioes} profissoes={profissoes} />
      {state?.erro && (
        <p className="text-sm text-red-600">{state.erro}</p>
      )}
      <SubmitButton ok={ok} corPrimaria={corPrimaria} />
    </form>
  )
}
```

- [ ] **Step 3: Rodar o typecheck (vai falhar — as duas páginas que usam `EditarPessoaForm` ainda passam o objeto `pessoa` antigo, sem os campos novos que `PessoaCampos` agora exige)**

Run: `npx tsc --noEmit`
Expected: FAIL — erros em `admin/pessoas/[pessoaId]/page.tsx` e `mobilizador/perfil/page.tsx` (`Property 'nascimento' is missing...`, etc.) — corrigido na Task 3.

- [ ] **Step 4: Commit**

```bash
git add src/app/\[slug\]/admin/pessoas/\[pessoaId\]/CamposPessoa.tsx src/app/\[slug\]/admin/pessoas/\[pessoaId\]/EditarPessoaForm.tsx
git commit -m "feat: extrai CamposPessoa e adiciona nascimento/origem/endereço ao form de editar pessoa"
```

---

### Task 3: `editarPessoa` processa os campos novos + páginas que o consomem

**Files:**
- Modify: `src/actions/admin/editar-pessoa.ts`
- Modify: `src/app/[slug]/admin/pessoas/[pessoaId]/page.tsx:317-336`
- Modify: `src/app/[slug]/mobilizador/perfil/page.tsx:26-77`

**Interfaces:**
- Consumes: `parseDataBrasileira` de Task 1; `PessoaCampos` de Task 2.

- [ ] **Step 1: Reescrever `editar-pessoa.ts` para ler e persistir os campos novos**

```ts
// src/actions/admin/editar-pessoa.ts
'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getGabineteBySlug } from '@/lib/gabinete'
import { normalizeWhatsApp } from '@/lib/whatsapp'
import { parseDataBrasileira } from '@/lib/data-brasileira'

export async function editarPessoa(
  _prev: { ok: boolean; erro?: string } | null,
  formData: FormData
): Promise<{ ok: boolean; erro?: string }> {
  const slug = formData.get('slug') as string
  const pessoaId = formData.get('pessoaId') as string
  const nome = (formData.get('nome') as string).trim()
  const whatsappRaw = (formData.get('whatsapp') as string | null) ?? ''
  const email = (formData.get('email') as string | null)?.trim() || null
  const nascimentoRaw = (formData.get('nascimento') as string | null)?.trim() || ''
  const regiaoId = (formData.get('regiaoId') as string | null) || null
  const profissaoId = (formData.get('profissaoId') as string | null) || null
  const genero = (formData.get('genero') as string | null) || null
  const origem = (formData.get('origem') as string | null)?.trim() || null
  const cpf = (formData.get('cpf') as string | null)?.trim() || null
  const telefoneFixo = (formData.get('telefoneFixo') as string | null)?.trim() || null
  const orientacaoSexual = (formData.get('orientacaoSexual') as string | null)?.trim() || null
  const religiao = (formData.get('religiao') as string | null)?.trim() || null
  const escolaridade = (formData.get('escolaridade') as string | null)?.trim() || null
  const bairro = (formData.get('bairro') as string | null)?.trim() || null
  const logradouro = (formData.get('logradouro') as string | null)?.trim() || null
  const numero = (formData.get('numero') as string | null)?.trim() || null
  const complemento = (formData.get('complemento') as string | null)?.trim() || null
  const cep = (formData.get('cep') as string | null)?.trim() || null

  if (!nome) return { ok: false, erro: 'Nome é obrigatório' }
  if (!whatsappRaw) return { ok: false, erro: 'WhatsApp é obrigatório' }

  let nascimento: Date | null = null
  if (nascimentoRaw) {
    nascimento = parseDataBrasileira(nascimentoRaw)
    if (!nascimento) return { ok: false, erro: 'Data de nascimento inválida — use o formato DD/MM/AAAA' }
  }

  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Não autenticado')

  const gabinete = await getGabineteBySlug(slug)
  if (!gabinete) throw new Error('Gabinete não encontrado')

  const role = user.app_metadata?.role as string | undefined
  const usuarioGabinete = await prisma.usuarioGabinete.findUnique({
    where: { userId_gabineteId: { userId: user.id, gabineteId: gabinete.id } },
    select: { papel: true },
  })

  const isAdmin = usuarioGabinete?.papel === 'admin' || role === 'super-admin'
  const isMobilizador = usuarioGabinete?.papel === 'mobilizador'

  if (!isAdmin && !isMobilizador) throw new Error('Sem permissão')

  if (isMobilizador && !isAdmin) {
    // Verificar que a pessoa está na rede direta do mobilizador ou é o próprio mobilizador
    const mobilizadorPessoa = await prisma.pessoa.findFirst({
      where: { userId: user.id, gabineteId: gabinete.id, isMobilizador: true },
      select: { id: true },
    })
    if (!mobilizadorPessoa) throw new Error('Mobilizador não encontrado')

    const isPropriaPessoa = mobilizadorPessoa.id === pessoaId

    if (!isPropriaPessoa) {
      const vinculo = await prisma.vinculoRede.findFirst({
        where: { gabineteId: gabinete.id, pessoaId, indicadoPorId: mobilizadorPessoa.id, deletedAt: null },
      })
      if (!vinculo) throw new Error('Pessoa fora da sua rede')
    }
  }

  const whatsapp = normalizeWhatsApp(whatsappRaw)
  if (!whatsapp) return { ok: false, erro: 'Número de WhatsApp inválido' }

  await prisma.pessoa.updateMany({
    where: { id: pessoaId, gabineteId: gabinete.id },
    data: {
      nome,
      whatsapp,
      email,
      nascimento,
      genero,
      origem,
      regiaoId,
      profissaoId,
      cpf,
      telefoneFixo,
      orientacaoSexual,
      religiao,
      escolaridade,
      bairro,
      logradouro,
      numero,
      complemento,
      cep,
    },
  })

  revalidatePath(`/${slug}/admin/pessoas/${pessoaId}`)
  revalidatePath(`/${slug}/mobilizador/rede`)
  return { ok: true }
}
```

- [ ] **Step 2: Atualizar o objeto `pessoa` passado ao `EditarPessoaForm` na ficha do admin**

Em `src/app/[slug]/admin/pessoas/[pessoaId]/page.tsx:320-332`, trocar:

```tsx
              pessoa={{
                nome: pessoa.nome,
                whatsapp: pessoa.whatsapp,
                email: pessoa.email,
                regiaoId: pessoa.regiaoId,
                profissaoId: pessoa.profissaoId,
                genero: pessoa.genero,
                cpf: pessoa.cpf,
                telefoneFixo: pessoa.telefoneFixo,
                orientacaoSexual: pessoa.orientacaoSexual,
                religiao: pessoa.religiao,
                escolaridade: pessoa.escolaridade,
              }}
```

por:

```tsx
              pessoa={{
                nome: pessoa.nome,
                whatsapp: pessoa.whatsapp,
                email: pessoa.email,
                nascimento: pessoa.nascimento,
                genero: pessoa.genero,
                origem: pessoa.origem,
                regiaoId: pessoa.regiaoId,
                profissaoId: pessoa.profissaoId,
                cpf: pessoa.cpf,
                telefoneFixo: pessoa.telefoneFixo,
                orientacaoSexual: pessoa.orientacaoSexual,
                religiao: pessoa.religiao,
                escolaridade: pessoa.escolaridade,
                bairro: pessoa.bairro,
                logradouro: pessoa.logradouro,
                numero: pessoa.numero,
                complemento: pessoa.complemento,
                cep: pessoa.cep,
              }}
```

(`pessoa` nessa página já vem de um `include` sem `select` nos campos escalares — `nascimento`/`origem`/`bairro`/`logradouro`/`numero`/`complemento`/`cep` já estão disponíveis no objeto, não precisa mudar a query.)

- [ ] **Step 3: Atualizar `select` e o objeto `pessoa` no perfil do mobilizador**

Em `src/app/[slug]/mobilizador/perfil/page.tsx:26-77`, trocar o bloco inteiro (query + render do form) por:

```tsx
  const pessoa = await prisma.pessoa.findFirst({
    where: { userId: session.user.id, gabineteId: gabinete.id, isMobilizador: true },
    select: {
      id: true,
      nome: true,
      whatsapp: true,
      email: true,
      nascimento: true,
      genero: true,
      origem: true,
      regiaoId: true,
      profissaoId: true,
      cpf: true,
      telefoneFixo: true,
      orientacaoSexual: true,
      religiao: true,
      escolaridade: true,
      bairro: true,
      logradouro: true,
      numero: true,
      complemento: true,
      cep: true,
    },
  })
  if (!pessoa) notFound()

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
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-gray-900">Meu Perfil</h1>
      <section className="bg-white rounded-lg p-6 shadow-sm space-y-4">
        <EditarPessoaForm
          slug={params.slug}
          pessoaId={pessoa.id}
          pessoa={{
            nome: pessoa.nome,
            whatsapp: pessoa.whatsapp,
            email: pessoa.email,
            nascimento: pessoa.nascimento,
            genero: pessoa.genero,
            origem: pessoa.origem,
            regiaoId: pessoa.regiaoId,
            profissaoId: pessoa.profissaoId,
            cpf: pessoa.cpf,
            telefoneFixo: pessoa.telefoneFixo,
            orientacaoSexual: pessoa.orientacaoSexual,
            religiao: pessoa.religiao,
            escolaridade: pessoa.escolaridade,
            bairro: pessoa.bairro,
            logradouro: pessoa.logradouro,
            numero: pessoa.numero,
            complemento: pessoa.complemento,
            cep: pessoa.cep,
          }}
          regioes={regioes}
          profissoes={profissoes}
          corPrimaria={gabinete.corPrimaria}
        />
        <div className="pt-2">
          <AlterarSenhaDialog />
        </div>
      </section>
    </div>
  )
}
```

- [ ] **Step 4: Rodar o typecheck e confirmar que passa**

Run: `npx tsc --noEmit`
Expected: sem erros

- [ ] **Step 5: Verificação manual**

Rodar `npm run dev`, entrar em `/[slug]/admin/pessoas/[pessoaId]?editar=1` de uma pessoa
existente, preencher nascimento (`15/06/1990`), origem, e os 5 campos de endereço,
salvar, recarregar a página e confirmar que os valores persistiram (inclusive o
`defaultValue` do nascimento voltando formatado `15/06/1990`). Repetir em
`/[slug]/mobilizador/perfil` logado como mobilizador. Testar também um nascimento
inválido (`31/02/2000`) e confirmar a mensagem de erro sem persistir nada.

- [ ] **Step 6: Commit**

```bash
git add src/actions/admin/editar-pessoa.ts "src/app/[slug]/admin/pessoas/[pessoaId]/page.tsx" "src/app/[slug]/mobilizador/perfil/page.tsx"
git commit -m "feat: editarPessoa persiste nascimento/origem/endereço"
```

---

### Task 4: Campo de nascimento no cadastro público

**Files:**
- Modify: `src/actions/public/submeter-cadastro.ts`
- Modify: `src/app/[slug]/cadastro/[segmentoSlug]/CadastroForm.tsx`

**Interfaces:**
- Consumes: `parseDataBrasileira` de Task 1.

- [ ] **Step 1: Adicionar `nascimento` ao tipo de input e ao parsing/persistência em `submeter-cadastro.ts`**

Trocar o tipo (linhas 16-28):

```ts
type SubmeterCadastroInput = {
  slug: string
  segmentoSlugs: string[]
  whatsapp: string
  nome: string
  email?: string
  regiaoId?: string
  profissaoId?: string
  genero?: string
  nascimento?: string
  mobilizadorToken?: string
  sucessoUrl: string
  foto?: File | null
}
```

Trocar a desestruturação (linhas 31-43):

```ts
  const {
    slug,
    segmentoSlugs,
    whatsapp: whatsappRaw,
    nome,
    email,
    regiaoId,
    profissaoId,
    genero,
    nascimento: nascimentoRaw,
    mobilizadorToken,
    sucessoUrl,
    foto,
  } = input
```

Adicionar o import e o parsing, logo após a checagem de WhatsApp (depois da linha
`if (!whatsapp) return { erro: 'Número de WhatsApp inválido' }`):

```ts
  let nascimento: Date | null = null
  if (nascimentoRaw?.trim()) {
    nascimento = parseDataBrasileira(nascimentoRaw.trim())
    if (!nascimento) return { erro: 'Data de nascimento inválida — use o formato DD/MM/AAAA' }
  }
```

Adicionar o import no topo do arquivo:

```ts
import { parseDataBrasileira } from '@/lib/data-brasileira'
```

E incluir `nascimento` no `data` do `prisma.pessoa.create` (dentro do `else` que cria a
pessoa nova):

```ts
    const criada = await prisma.pessoa.create({
      data: {
        nome: nome.trim(),
        whatsapp,
        email: email?.trim() || null,
        nascimento,
        genero: genero || null,
        regiaoId: regiaoId || null,
        profissaoId: profissaoId || null,
        gabineteId: gabinete.id,
        isColaborador: false,
      },
    })
```

- [ ] **Step 2: Adicionar o campo no formulário público, logo após "Nome completo"**

Em `CadastroForm.tsx`, dentro do passo `dados`, logo depois do bloco do campo `nome`
(depois de `</div>` que fecha o input `name="nome"`, antes do bloco do campo `email`),
inserir:

```tsx
          <div>
            <label className="block text-sm font-medium text-gray-700">Data de nascimento</label>
            <input
              name="nascimento"
              placeholder="DD/MM/AAAA"
              className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
            />
          </div>
```

- [ ] **Step 3: Passar o campo pro `submeterCadastro` em `handleSubmeterDados`**

Trocar a chamada (linha ~147-159) por:

```tsx
      const resultado = await submeterCadastro({
        slug,
        segmentoSlugs,
        whatsapp,
        nome: fd.get('nome') as string,
        email: fd.get('email') as string,
        regiaoId: fd.get('regiaoId') as string,
        profissaoId: fd.get('profissaoId') as string,
        genero: fd.get('genero') as string,
        nascimento: fd.get('nascimento') as string,
        mobilizadorToken,
        sucessoUrl,
        foto: fd.get('foto') as File | null,
      })
```

- [ ] **Step 4: Rodar o typecheck**

Run: `npx tsc --noEmit`
Expected: sem erros

- [ ] **Step 5: Verificação manual**

Abrir a rota pública de cadastro (`/[slug]/cadastro/[segmentoSlug]`) num navegador com um
WhatsApp novo, preencher nome + nascimento (`10/05/1995`) + demais campos, confirmar
cadastro, e checar na ficha da pessoa no admin (`/[slug]/admin/pessoas/[pessoaId]`) que
o nascimento salvo bate. Testar também um nascimento inválido (`99/99/9999`) e confirmar
que a mensagem de erro aparece sem completar o cadastro.

- [ ] **Step 6: Commit**

```bash
git add src/actions/public/submeter-cadastro.ts "src/app/[slug]/cadastro/[segmentoSlug]/CadastroForm.tsx"
git commit -m "feat: campo de nascimento no cadastro público"
```

---

### Task 5: Nova server action `criarDemandaComCadastro`

**Files:**
- Create: `src/actions/admin/criar-demanda-com-cadastro.ts`

**Interfaces:**
- Consumes: `parseDataBrasileira` de Task 1; `assertAdminAccess` (`src/lib/assert-admin-access.ts`); `normalizeWhatsApp` (`src/lib/whatsapp.ts`); `enviarEmail`, `templateDemandaAtribuida` (`src/lib/email.ts`).
- Produces: `criarDemandaComCadastro(formData: FormData): Promise<void>` — usada por Task 6.

- [ ] **Step 1: Criar a action**

```ts
// src/actions/admin/criar-demanda-com-cadastro.ts
'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { assertAdminAccess } from '@/lib/assert-admin-access'
import { normalizeWhatsApp } from '@/lib/whatsapp'
import { parseDataBrasileira } from '@/lib/data-brasileira'
import { enviarEmail, templateDemandaAtribuida } from '@/lib/email'

export async function criarDemandaComCadastro(formData: FormData): Promise<void> {
  const slug = formData.get('slug') as string
  const solicitanteId = formData.get('solicitanteId') as string

  // Dados da pessoa (ficha completa)
  const nome = (formData.get('nome') as string).trim()
  const whatsappRaw = (formData.get('whatsapp') as string | null) ?? ''
  const email = (formData.get('email') as string | null)?.trim() || null
  const nascimentoRaw = (formData.get('nascimento') as string | null)?.trim() || ''
  const genero = (formData.get('genero') as string | null) || null
  const origem = (formData.get('origem') as string | null)?.trim() || null
  const regiaoId = (formData.get('regiaoId') as string | null) || null
  const profissaoId = (formData.get('profissaoId') as string | null) || null
  const cpf = (formData.get('cpf') as string | null)?.trim() || null
  const telefoneFixo = (formData.get('telefoneFixo') as string | null)?.trim() || null
  const orientacaoSexual = (formData.get('orientacaoSexual') as string | null)?.trim() || null
  const religiao = (formData.get('religiao') as string | null)?.trim() || null
  const escolaridade = (formData.get('escolaridade') as string | null)?.trim() || null
  const bairro = (formData.get('bairro') as string | null)?.trim() || null
  const logradouro = (formData.get('logradouro') as string | null)?.trim() || null
  const numero = (formData.get('numero') as string | null)?.trim() || null
  const complemento = (formData.get('complemento') as string | null)?.trim() || null
  const cep = (formData.get('cep') as string | null)?.trim() || null

  // Dados da demanda
  const titulo = (formData.get('titulo') as string).trim()
  const descricao = (formData.get('descricao') as string).trim()
  const responsavelId = formData.get('responsavelId') as string
  const areaId = formData.get('areaId') as string
  const prazoCustom = formData.get('prazoDesfecho') as string | null

  if (!solicitanteId || !nome || !whatsappRaw) {
    throw new Error('Preencha nome e WhatsApp do solicitante')
  }
  if (!titulo || !descricao || !responsavelId || !areaId) {
    throw new Error('Preencha todos os campos obrigatórios da demanda')
  }

  const whatsapp = normalizeWhatsApp(whatsappRaw)
  if (!whatsapp) throw new Error('Número de WhatsApp inválido')

  let nascimento: Date | null = null
  if (nascimentoRaw) {
    nascimento = parseDataBrasileira(nascimentoRaw)
    if (!nascimento) throw new Error('Data de nascimento inválida — use o formato DD/MM/AAAA')
  }

  const { session, gabinete } = await assertAdminAccess(slug)

  const config = await prisma.configuracaoSistema.findUnique({
    where: { gabineteId: gabinete.id },
  })
  const horasPrazo = config?.prazoDemandasHoras ?? 72
  const prazoDesfecho = prazoCustom
    ? new Date(prazoCustom)
    : new Date(Date.now() + horasPrazo * 60 * 60 * 1000)

  const autorPessoa = await prisma.pessoa.findFirst({
    where: { userId: session.user.id, gabineteId: gabinete.id },
    select: { id: true },
  })
  if (!autorPessoa) throw new Error('Não foi possível identificar o autor')

  const solicitanteCheck = await prisma.pessoa.findFirst({
    where: { id: solicitanteId, gabineteId: gabinete.id },
    select: { id: true },
  })
  if (!solicitanteCheck) throw new Error('Solicitante não encontrado')

  const responsavelCheck = await prisma.pessoa.findFirst({
    where: { id: responsavelId, gabineteId: gabinete.id, isMobilizador: true, isColaborador: true },
    select: { id: true },
  })
  if (!responsavelCheck) throw new Error('Responsável não encontrado')

  const areaCheck = await prisma.areaDemanda.findFirst({
    where: { id: areaId, gabineteId: gabinete.id },
    select: { id: true },
  })
  if (!areaCheck) throw new Error('Área não encontrada')

  const [, demanda] = await prisma.$transaction([
    prisma.pessoa.updateMany({
      where: { id: solicitanteId, gabineteId: gabinete.id },
      data: {
        nome,
        whatsapp,
        email,
        nascimento,
        genero,
        origem,
        regiaoId,
        profissaoId,
        cpf,
        telefoneFixo,
        orientacaoSexual,
        religiao,
        escolaridade,
        bairro,
        logradouro,
        numero,
        complemento,
        cep,
      },
    }),
    prisma.demanda.create({
      data: {
        gabineteId: gabinete.id,
        titulo,
        descricao,
        solicitanteId,
        responsavelId,
        areaId,
        prazoDesfecho,
        criadoPorId: autorPessoa.id,
        historico: {
          create: {
            tipo: 'criacao',
            descricao: 'Demanda criada',
            autorId: autorPessoa.id,
          },
        },
      },
    }),
  ])

  const responsavel = await prisma.pessoa.findUnique({
    where: { id: responsavelId },
    select: { email: true, nome: true },
  })
  if (responsavel?.email) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''
    const gabineteData = await prisma.gabinete.findUnique({ where: { id: gabinete.id }, select: { slug: true } })
    try {
      await enviarEmail({
        para: responsavel.email,
        assunto: `Nova demanda atribuída: ${titulo}`,
        html: templateDemandaAtribuida({
          nomeResponsavel: responsavel.nome,
          tituloDemanda: titulo,
          nomeSolicitante: nome,
          prazo: prazoDesfecho,
          urlDemanda: `${appUrl}/${gabineteData?.slug}/mobilizador/demandas/${demanda.id}`,
        }),
      })
    } catch {
      // falha no email não bloqueia a criação da demanda
    }
  }

  revalidatePath(`/${slug}/admin/demandas`)
  revalidatePath(`/${slug}/admin/pessoas/${solicitanteId}`)
  revalidatePath(`/${slug}/mobilizador/rede`)
  redirect(`/${slug}/admin/demandas/${demanda.id}`)
}
```

- [ ] **Step 2: Rodar o typecheck**

Run: `npx tsc --noEmit`
Expected: sem erros (esta action ainda não é chamada por nenhuma UI até a Task 6, então
não há verificação manual possível ainda — só type-check nesta task)

- [ ] **Step 3: Commit**

```bash
git add src/actions/admin/criar-demanda-com-cadastro.ts
git commit -m "feat: action criarDemandaComCadastro (pessoa + demanda numa transação)"
```

---

### Task 6: Nova Demanda — ficha completa + form único

**Files:**
- Modify: `src/app/[slug]/admin/demandas/nova/page.tsx`

**Interfaces:**
- Consumes: `criarDemandaComCadastro` de Task 5; `CamposPessoa`/`PessoaCampos` de Task 2.

- [ ] **Step 1: Reescrever a página inteira**

```tsx
// src/app/[slug]/admin/demandas/nova/page.tsx
import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { getGabineteBySlug } from '@/lib/gabinete'
import { corTextoContraste } from '@/lib/cor-contraste'
import { criarDemandaComCadastro } from '@/actions/admin/criar-demanda-com-cadastro'
import { cadastrarSolicitante } from '@/actions/admin/cadastrar-solicitante'
import CamposPessoa from '../../pessoas/[pessoaId]/CamposPessoa'

export default async function NovaDemandaPage({
  params,
  searchParams,
}: {
  params: { slug: string }
  searchParams: { q?: string; solicitanteId?: string; cadastrar?: string }
}) {
  const gabinete = await getGabineteBySlug(params.slug)
  if (!gabinete) notFound()
  const corTexto = corTextoContraste(gabinete.corPrimaria)

  const [areas, colaboradores, config, regioes, profissoes] = await Promise.all([
    prisma.areaDemanda.findMany({
      where: { gabineteId: gabinete.id },
      orderBy: { nome: 'asc' },
      select: { id: true, nome: true },
    }),
    prisma.pessoa.findMany({
      where: { gabineteId: gabinete.id, isMobilizador: true, isColaborador: true },
      orderBy: { nome: 'asc' },
      select: { id: true, nome: true },
    }),
    prisma.configuracaoSistema.findUnique({ where: { gabineteId: gabinete.id } }),
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

  const horasPrazo = config?.prazoDemandasHoras ?? 72
  const prazoSugerido = new Date(Date.now() + horasPrazo * 60 * 60 * 1000)
  const prazoISO = prazoSugerido.toISOString().slice(0, 16)

  // Busca de solicitante
  const q = searchParams.q?.trim() ?? ''
  const solicitanteId = searchParams.solicitanteId ?? ''

  const resultadosBusca = q
    ? await prisma.pessoa.findMany({
        where: {
          gabineteId: gabinete.id,
          deletedAt: null,
          OR: [
            { nome: { contains: q, mode: 'insensitive' } },
            { whatsapp: { contains: q } },
          ],
        },
        take: 10,
        select: { id: true, nome: true, whatsapp: true, regiao: { select: { nome: true } } },
      })
    : []

  const solicitante = solicitanteId
    ? await prisma.pessoa.findFirst({
        where: { id: solicitanteId, gabineteId: gabinete.id, deletedAt: null },
        select: {
          id: true,
          nome: true,
          whatsapp: true,
          email: true,
          nascimento: true,
          genero: true,
          origem: true,
          regiaoId: true,
          profissaoId: true,
          cpf: true,
          telefoneFixo: true,
          orientacaoSexual: true,
          religiao: true,
          escolaridade: true,
          bairro: true,
          logradouro: true,
          numero: true,
          complemento: true,
          cep: true,
        },
      })
    : null

  return (
    <div className="max-w-2xl mx-auto py-8 px-4 space-y-6">
      <h1 className="text-2xl font-bold">Nova Demanda</h1>

      {/* Busca de solicitante */}
      <div className="bg-white rounded-lg shadow-sm p-6 space-y-4">
        <h2 className="text-base font-semibold">Solicitante</h2>

        {solicitante ? (
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">
              Completando o cadastro de <span className="font-medium text-gray-900">{solicitante.nome}</span> abaixo.
            </p>
            <a href={`/${params.slug}/admin/demandas/nova`} className="text-xs text-blue-600 hover:underline">
              Trocar
            </a>
          </div>
        ) : (
          <div className="space-y-3">
            <form method="GET" className="flex gap-2">
              <input
                name="q"
                defaultValue={q}
                placeholder="Buscar por nome ou WhatsApp..."
                className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm"
              />
              <button
                type="submit"
                style={{ backgroundColor: gabinete.corPrimaria, color: corTexto }}
                className="px-4 py-2 rounded-md text-sm"
              >
                Buscar
              </button>
            </form>

            {resultadosBusca.length > 0 && (
              <ul className="divide-y divide-gray-100 border border-gray-200 rounded-md">
                {resultadosBusca.map((p) => (
                  <li key={p.id}>
                    <a
                      href={`/${params.slug}/admin/demandas/nova?solicitanteId=${p.id}`}
                      className="flex items-center justify-between px-4 py-3 hover:bg-gray-50"
                    >
                      <div>
                        <p className="text-sm font-medium text-gray-900">{p.nome}</p>
                        <p className="text-xs text-gray-500">{p.whatsapp}</p>
                      </div>
                      <span className="text-xs text-blue-600">Selecionar →</span>
                    </a>
                  </li>
                ))}
              </ul>
            )}

            {q && resultadosBusca.length === 0 && (
              <div className="space-y-3">
                <p className="text-sm text-gray-500">
                  Nenhuma pessoa encontrada para &ldquo;{q}&rdquo;.
                </p>
                {searchParams.cadastrar !== '1' ? (
                  <a
                    href={`/${params.slug}/admin/demandas/nova?q=${encodeURIComponent(q)}&cadastrar=1`}
                    className="inline-block text-sm text-blue-600 hover:underline"
                  >
                    + Cadastrar &ldquo;{q}&rdquo; como novo solicitante
                  </a>
                ) : (
                  <div className="border border-blue-200 rounded-lg p-4 bg-blue-50 space-y-3">
                    <p className="text-sm font-medium text-blue-800">Cadastrar novo solicitante</p>
                    <form action={cadastrarSolicitante} className="space-y-3">
                      <input type="hidden" name="slug" value={params.slug} />
                      <div>
                        <label className="block text-xs font-medium text-gray-700">Nome *</label>
                        <input
                          name="nome"
                          required
                          defaultValue={q}
                          className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700">WhatsApp *</label>
                        <input
                          name="whatsapp"
                          required
                          placeholder="(61) 9 9999-9999"
                          className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700">E-mail</label>
                        <input
                          name="email"
                          type="email"
                          className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                        />
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="submit"
                          style={{ backgroundColor: gabinete.corPrimaria, color: corTexto }}
                          className="px-4 py-2 rounded-md text-sm font-medium hover:opacity-90"
                        >
                          Cadastrar e selecionar
                        </button>
                        <a
                          href={`/${params.slug}/admin/demandas/nova?q=${encodeURIComponent(q)}`}
                          className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
                        >
                          Cancelar
                        </a>
                      </div>
                    </form>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Formulário único — ficha completa do solicitante + dados da demanda */}
      {solicitante && (
        <form action={criarDemandaComCadastro} className="space-y-6">
          <input type="hidden" name="slug" value={params.slug} />
          <input type="hidden" name="solicitanteId" value={solicitante.id} />

          <div className="bg-white rounded-lg shadow-sm p-6 space-y-4">
            <h2 className="text-base font-semibold">Cadastro do Solicitante</h2>
            <CamposPessoa pessoa={solicitante} regioes={regioes} profissoes={profissoes} />
          </div>

          <div className="bg-white rounded-lg shadow-sm p-6 space-y-4">
            <h2 className="text-base font-semibold">Dados da Demanda</h2>

            <div>
              <label className="block text-sm font-medium text-gray-700">Título *</label>
              <input
                name="titulo"
                required
                className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Descrição *</label>
              <textarea
                name="descricao"
                required
                rows={4}
                className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Área *</label>
                <select
                  name="areaId"
                  required
                  className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                >
                  <option value="">Selecionar...</option>
                  {areas.map((a) => (
                    <option key={a.id} value={a.id}>{a.nome}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Responsável *</label>
                <select
                  name="responsavelId"
                  required
                  className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                >
                  <option value="">Selecionar...</option>
                  {colaboradores.map((c) => (
                    <option key={c.id} value={c.id}>{c.nome}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">
                Prazo de desfecho (sugestão: {horasPrazo}h)
              </label>
              <input
                name="prazoDesfecho"
                type="datetime-local"
                defaultValue={prazoISO}
                className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              />
            </div>
          </div>

          <button
            type="submit"
            style={{ backgroundColor: gabinete.corPrimaria, color: corTexto }}
            className="w-full py-2.5 rounded-md text-sm font-medium hover:opacity-90"
          >
            Salvar
          </button>
        </form>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Rodar o typecheck**

Run: `npx tsc --noEmit`
Expected: sem erros

- [ ] **Step 3: Verificação manual**

`npm run dev`, ir em `/[slug]/admin/demandas/nova`, buscar uma pessoa existente que
tenha campos vazios (ex. sem nascimento/endereço), confirmar que a ficha completa
aparece pré-preenchida com o que já existe e vazia no resto. Preencher os campos que
faltam + os dados da demanda, clicar "Salvar", confirmar que:
1. Redireciona pra ficha da nova demanda.
2. A ficha da pessoa (`/admin/pessoas/[pessoaId]`) reflete os dados atualizados.
Testar também o caminho de erro: deixar "Responsável" vazio e confirmar que nada é
salvo (nem a demanda, nem a edição do cadastro) — checar que os dados da pessoa não
mudaram no banco antes do teste.

- [ ] **Step 4: Commit**

```bash
git add "src/app/[slug]/admin/demandas/nova/page.tsx"
git commit -m "feat: Nova Demanda combina ficha completa do solicitante + criação num só passo"
```

---

### Task 7: Central de Filtros — componente `CadastrosBusca` + rota do admin

**Files:**
- Create: `src/app/[slug]/admin/filtros/CadastrosBusca.tsx`
- Create: `src/app/[slug]/admin/filtros/cadastros/page.tsx`
- Modify: `src/app/[slug]/admin/filtros/page.tsx:81-89`
- Modify: `src/app/[slug]/admin/filtros/demandas/page.tsx:60-68`
- Modify: `src/app/[slug]/admin/filtros/banco-talentos/page.tsx:65-73`

**Interfaces:**
- Consumes: `EditarPessoaForm`/`PessoaCampos` de Tasks 2-3; `FiltrosTabs` (`src/app/[slug]/admin/filtros/FiltrosTabs.tsx`).
- Produces: `export default function CadastrosBusca(props)` — usado por Task 8 (rota do mobilizador).

- [ ] **Step 1: Criar o componente compartilhado de busca + edição**

```tsx
// src/app/[slug]/admin/filtros/CadastrosBusca.tsx
import EditarPessoaForm from '../pessoas/[pessoaId]/EditarPessoaForm'
import type { PessoaCampos } from '../pessoas/[pessoaId]/CamposPessoa'
import { corTextoContraste } from '@/lib/cor-contraste'

type Regiao = { id: string; nome: string }
type Profissao = { id: string; nome: string }
type ResultadoBusca = { id: string; nome: string; whatsapp: string; regiao: { nome: string } | null }

export default function CadastrosBusca({
  slug,
  baseHref,
  q,
  resultados,
  pessoaSelecionada,
  regioes,
  profissoes,
  corPrimaria,
}: {
  slug: string
  baseHref: string
  q: string
  resultados: ResultadoBusca[]
  pessoaSelecionada: (PessoaCampos & { id: string }) | null
  regioes: Regiao[]
  profissoes: Profissao[]
  corPrimaria: string
}) {
  return (
    <div className="bg-white rounded-lg shadow-sm p-6 space-y-4">
      {pessoaSelecionada ? (
        <>
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">{pessoaSelecionada.nome}</h2>
            <a href={baseHref} className="text-xs text-blue-600 hover:underline">
              Nova busca
            </a>
          </div>
          <EditarPessoaForm
            slug={slug}
            pessoaId={pessoaSelecionada.id}
            pessoa={pessoaSelecionada}
            regioes={regioes}
            profissoes={profissoes}
            corPrimaria={corPrimaria}
          />
        </>
      ) : (
        <div className="space-y-3">
          <form method="GET" className="flex gap-2">
            <input
              name="q"
              defaultValue={q}
              placeholder="Buscar por nome ou WhatsApp..."
              className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm"
            />
            <button
              type="submit"
              style={{ backgroundColor: corPrimaria, color: corTextoContraste(corPrimaria) }}
              className="px-4 py-2 rounded-md text-sm"
            >
              Buscar
            </button>
          </form>

          {resultados.length > 0 && (
            <ul className="divide-y divide-gray-100 border border-gray-200 rounded-md">
              {resultados.map((p) => (
                <li key={p.id}>
                  <a
                    href={`${baseHref}?pessoaId=${p.id}`}
                    className="flex items-center justify-between px-4 py-3 hover:bg-gray-50"
                  >
                    <div>
                      <p className="text-sm font-medium text-gray-900">{p.nome}</p>
                      <p className="text-xs text-gray-500">{p.whatsapp} · {p.regiao?.nome ?? 'Sem região'}</p>
                    </div>
                    <span className="text-xs text-blue-600">Editar →</span>
                  </a>
                </li>
              ))}
            </ul>
          )}

          {q && resultados.length === 0 && (
            <p className="text-sm text-gray-500">
              Nenhuma pessoa encontrada para &ldquo;{q}&rdquo;.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Criar a rota do admin**

```tsx
// src/app/[slug]/admin/filtros/cadastros/page.tsx
import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { getGabineteBySlug } from '@/lib/gabinete'
import FiltrosTabs from '../FiltrosTabs'
import CadastrosBusca from '../CadastrosBusca'

export default async function AdminFiltrosCadastrosPage({
  params,
  searchParams,
}: {
  params: { slug: string }
  searchParams: { q?: string; pessoaId?: string }
}) {
  const gabinete = await getGabineteBySlug(params.slug)
  if (!gabinete) notFound()

  const q = searchParams.q?.trim() ?? ''
  const pessoaId = searchParams.pessoaId ?? ''

  const [resultados, pessoaSelecionada, regioes, profissoes] = await Promise.all([
    q
      ? prisma.pessoa.findMany({
          where: {
            gabineteId: gabinete.id,
            deletedAt: null,
            OR: [
              { nome: { contains: q, mode: 'insensitive' } },
              { whatsapp: { contains: q } },
            ],
          },
          take: 10,
          select: { id: true, nome: true, whatsapp: true, regiao: { select: { nome: true } } },
        })
      : Promise.resolve([]),
    pessoaId
      ? prisma.pessoa.findFirst({
          where: { id: pessoaId, gabineteId: gabinete.id, deletedAt: null },
          select: {
            id: true,
            nome: true,
            whatsapp: true,
            email: true,
            nascimento: true,
            genero: true,
            origem: true,
            regiaoId: true,
            profissaoId: true,
            cpf: true,
            telefoneFixo: true,
            orientacaoSexual: true,
            religiao: true,
            escolaridade: true,
            bairro: true,
            logradouro: true,
            numero: true,
            complemento: true,
            cep: true,
          },
        })
      : Promise.resolve(null),
    prisma.regiao.findMany({ where: { gabineteId: gabinete.id, ativa: true }, orderBy: { nome: 'asc' }, select: { id: true, nome: true } }),
    prisma.profissao.findMany({ where: { gabineteId: gabinete.id, ativa: true }, orderBy: { nome: 'asc' }, select: { id: true, nome: true } }),
  ])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Filtros</h1>
        <p className="text-sm text-gray-600 mt-1">Filtre e exporte os dados do sistema.</p>
      </div>
      <FiltrosTabs
        abas={[
          { chave: 'pessoas', label: 'Pessoas', href: `/${params.slug}/admin/filtros` },
          { chave: 'demandas', label: 'Demandas', href: `/${params.slug}/admin/filtros/demandas` },
          { chave: 'banco-talentos', label: 'Banco de Talentos', href: `/${params.slug}/admin/filtros/banco-talentos` },
          { chave: 'cadastros', label: 'Cadastros', href: `/${params.slug}/admin/filtros/cadastros` },
        ]}
        abaAtiva="cadastros"
        corPrimaria={gabinete.corPrimaria}
      />
      <CadastrosBusca
        slug={params.slug}
        baseHref={`/${params.slug}/admin/filtros/cadastros`}
        q={q}
        resultados={resultados}
        pessoaSelecionada={pessoaSelecionada}
        regioes={regioes}
        profissoes={profissoes}
        corPrimaria={gabinete.corPrimaria}
      />
    </div>
  )
}
```

- [ ] **Step 3: Adicionar a aba "Cadastros" nas 3 páginas existentes do admin**

Em `src/app/[slug]/admin/filtros/page.tsx:81-89`, trocar:

```tsx
      <FiltrosTabs
        abas={[
          { chave: 'pessoas', label: 'Pessoas', href: `/${params.slug}/admin/filtros` },
          { chave: 'demandas', label: 'Demandas', href: `/${params.slug}/admin/filtros/demandas` },
          { chave: 'banco-talentos', label: 'Banco de Talentos', href: `/${params.slug}/admin/filtros/banco-talentos` },
        ]}
        abaAtiva="pessoas"
        corPrimaria={gabinete.corPrimaria}
      />
```

por:

```tsx
      <FiltrosTabs
        abas={[
          { chave: 'pessoas', label: 'Pessoas', href: `/${params.slug}/admin/filtros` },
          { chave: 'demandas', label: 'Demandas', href: `/${params.slug}/admin/filtros/demandas` },
          { chave: 'banco-talentos', label: 'Banco de Talentos', href: `/${params.slug}/admin/filtros/banco-talentos` },
          { chave: 'cadastros', label: 'Cadastros', href: `/${params.slug}/admin/filtros/cadastros` },
        ]}
        abaAtiva="pessoas"
        corPrimaria={gabinete.corPrimaria}
      />
```

Em `src/app/[slug]/admin/filtros/demandas/page.tsx:60-68`, mesmo array de abas (trocar
`abaAtiva="demandas"` mantido, só adicionar a entrada `cadastros` no array, igual acima).

Em `src/app/[slug]/admin/filtros/banco-talentos/page.tsx:65-73`, mesmo array de abas
(trocar `abaAtiva="banco-talentos"` mantido, só adicionar a entrada `cadastros`).

- [ ] **Step 4: Rodar o typecheck**

Run: `npx tsc --noEmit`
Expected: sem erros

- [ ] **Step 5: Verificação manual**

`npm run dev`, ir em `/[slug]/admin/filtros`, confirmar que a aba "Cadastros" aparece e
que as outras 3 abas continuam navegáveis (nenhuma regrediu). Entrar na aba Cadastros,
buscar uma pessoa, clicar, editar um campo (ex. CEP), salvar, confirmar "✓ Salvo!" e que
o dado persistiu (checar na ficha da pessoa).

- [ ] **Step 6: Commit**

```bash
git add "src/app/[slug]/admin/filtros/CadastrosBusca.tsx" "src/app/[slug]/admin/filtros/cadastros/page.tsx" "src/app/[slug]/admin/filtros/page.tsx" "src/app/[slug]/admin/filtros/demandas/page.tsx" "src/app/[slug]/admin/filtros/banco-talentos/page.tsx"
git commit -m "feat: aba Cadastros na Central de Filtros (admin)"
```

---

### Task 8: Central de Filtros — rota do mobilizador (escopo de sub-rede)

**Files:**
- Create: `src/app/[slug]/mobilizador/filtros/cadastros/page.tsx`
- Modify: `src/app/[slug]/mobilizador/filtros/page.tsx:85-92`
- Modify: `src/app/[slug]/mobilizador/filtros/demandas/page.tsx:61-68`

**Interfaces:**
- Consumes: `CadastrosBusca` de Task 7; `coletarSubRedeIds` (`src/lib/rede.ts`); `assertMobilizadorAccess` (`src/lib/assert-mobilizador-access.ts`).

- [ ] **Step 1: Criar a rota do mobilizador, com busca e edição restritas à sub-rede**

```tsx
// src/app/[slug]/mobilizador/filtros/cadastros/page.tsx
import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { assertMobilizadorAccess } from '@/lib/assert-mobilizador-access'
import { coletarSubRedeIds } from '@/lib/rede'
import FiltrosTabs from '../../../admin/filtros/FiltrosTabs'
import CadastrosBusca from '../../../admin/filtros/CadastrosBusca'

export default async function MobilizadorFiltrosCadastrosPage({
  params,
  searchParams,
}: {
  params: { slug: string }
  searchParams: { q?: string; pessoaId?: string }
}) {
  const resultado = await assertMobilizadorAccess(params.slug).catch(() => null)
  if (!resultado) notFound()
  const { gabinete, pessoa } = resultado

  const idsRede = await coletarSubRedeIds(pessoa.id, gabinete.id)

  const q = searchParams.q?.trim() ?? ''
  const pessoaIdBusca = searchParams.pessoaId ?? ''

  const [resultados, pessoaSelecionada, regioes, profissoes] = await Promise.all([
    q
      ? prisma.pessoa.findMany({
          where: {
            gabineteId: gabinete.id,
            deletedAt: null,
            id: { in: idsRede },
            OR: [
              { nome: { contains: q, mode: 'insensitive' } },
              { whatsapp: { contains: q } },
            ],
          },
          take: 10,
          select: { id: true, nome: true, whatsapp: true, regiao: { select: { nome: true } } },
        })
      : Promise.resolve([]),
    pessoaIdBusca && idsRede.includes(pessoaIdBusca)
      ? prisma.pessoa.findFirst({
          where: { id: pessoaIdBusca, gabineteId: gabinete.id, deletedAt: null },
          select: {
            id: true,
            nome: true,
            whatsapp: true,
            email: true,
            nascimento: true,
            genero: true,
            origem: true,
            regiaoId: true,
            profissaoId: true,
            cpf: true,
            telefoneFixo: true,
            orientacaoSexual: true,
            religiao: true,
            escolaridade: true,
            bairro: true,
            logradouro: true,
            numero: true,
            complemento: true,
            cep: true,
          },
        })
      : Promise.resolve(null),
    prisma.regiao.findMany({ where: { gabineteId: gabinete.id, ativa: true }, orderBy: { nome: 'asc' }, select: { id: true, nome: true } }),
    prisma.profissao.findMany({ where: { gabineteId: gabinete.id, ativa: true }, orderBy: { nome: 'asc' }, select: { id: true, nome: true } }),
  ])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Filtros</h1>
        <p className="text-sm text-gray-600 mt-1">Filtre e exporte os dados da sua rede.</p>
      </div>
      <FiltrosTabs
        abas={[
          { chave: 'pessoas', label: 'Pessoas', href: `/${params.slug}/mobilizador/filtros` },
          { chave: 'demandas', label: 'Demandas', href: `/${params.slug}/mobilizador/filtros/demandas` },
          { chave: 'cadastros', label: 'Cadastros', href: `/${params.slug}/mobilizador/filtros/cadastros` },
        ]}
        abaAtiva="cadastros"
        corPrimaria={gabinete.corPrimaria}
      />
      <CadastrosBusca
        slug={params.slug}
        baseHref={`/${params.slug}/mobilizador/filtros/cadastros`}
        q={q}
        resultados={resultados}
        pessoaSelecionada={pessoaSelecionada}
        regioes={regioes}
        profissoes={profissoes}
        corPrimaria={gabinete.corPrimaria}
      />
    </div>
  )
}
```

Nota de segurança: `idsRede.includes(pessoaIdBusca)` é checado **antes** de buscar a
pessoa selecionada — sem essa checagem, um mobilizador poderia passar `?pessoaId=` de
alguém fora da própria rede na URL e ver/editar o cadastro (IDOR). `editarPessoa`
(Task 3) já rejeita esse `pessoaId` no servidor via checagem de `VinculoRede` — esta
checagem aqui é defesa em profundidade na leitura, mesmo padrão já usado nas abas
Pessoas/Demandas do mobilizador.

- [ ] **Step 2: Adicionar a aba "Cadastros" nas 2 páginas existentes do mobilizador**

Em `src/app/[slug]/mobilizador/filtros/page.tsx:85-92`, trocar:

```tsx
      <FiltrosTabs
        abas={[
          { chave: 'pessoas', label: 'Pessoas', href: `/${params.slug}/mobilizador/filtros` },
          { chave: 'demandas', label: 'Demandas', href: `/${params.slug}/mobilizador/filtros/demandas` },
        ]}
        abaAtiva="pessoas"
        corPrimaria={gabinete.corPrimaria}
      />
```

por:

```tsx
      <FiltrosTabs
        abas={[
          { chave: 'pessoas', label: 'Pessoas', href: `/${params.slug}/mobilizador/filtros` },
          { chave: 'demandas', label: 'Demandas', href: `/${params.slug}/mobilizador/filtros/demandas` },
          { chave: 'cadastros', label: 'Cadastros', href: `/${params.slug}/mobilizador/filtros/cadastros` },
        ]}
        abaAtiva="pessoas"
        corPrimaria={gabinete.corPrimaria}
      />
```

Em `src/app/[slug]/mobilizador/filtros/demandas/page.tsx:61-68`, mesmo array de abas
(trocar `abaAtiva="demandas"` mantido, só adicionar a entrada `cadastros`).

- [ ] **Step 3: Rodar o typecheck**

Run: `npx tsc --noEmit`
Expected: sem erros

- [ ] **Step 4: Verificação manual**

Logado como mobilizador, ir em `/[slug]/mobilizador/filtros/cadastros`, confirmar que a
busca só retorna pessoas da própria rede (comparar com a listagem de `/mobilizador/rede`
do mesmo mobilizador). Tentar manipular a URL com `?pessoaId=` de uma pessoa **fora** da
rede (pegar um id real de outra sub-rede ou de outro gabinete de teste) e confirmar que
a página não mostra o form de edição (cai de volta pra busca vazia). Editar uma pessoa
válida da própria rede e confirmar que salva.

- [ ] **Step 5: Commit**

```bash
git add "src/app/[slug]/mobilizador/filtros/cadastros/page.tsx" "src/app/[slug]/mobilizador/filtros/page.tsx" "src/app/[slug]/mobilizador/filtros/demandas/page.tsx"
git commit -m "feat: aba Cadastros na Central de Filtros (mobilizador, escopo de sub-rede)"
```

---

### Task 9: Build final e verificação de regressão

**Files:** nenhum arquivo novo — só verificação.

- [ ] **Step 1: Rodar a suíte de testes completa**

Run: `npm run test`
Expected: todos os testes passam, incluindo os 12 novos de `data-brasileira.test.ts`
(mesmas 2 falhas pré-existentes de `email.test.ts` por falta de `RESEND_API_KEY` local —
não é regressão).

- [ ] **Step 2: Rodar o build de produção**

Run: `npm run build`
Expected: build limpo, sem erros de tipo nem de lint bloqueante.

- [ ] **Step 3: Checklist final de verificação manual (regressão)**

- `/admin/pessoas/[pessoaId]` — editar dados continua funcionando, campos antigos e
  novos persistem.
- `/mobilizador/perfil` — idem, para o próprio mobilizador.
- `/admin/demandas/nova` — fluxo completo (buscar → editar ficha → criar demanda)
  funciona; fluxo de cadastrar novo solicitante (mini-form) continua funcionando.
- `/[slug]/cadastro/[segmentoSlug]` — cadastro público completo, com e sem nascimento.
- `/admin/filtros`, `/admin/filtros/demandas`, `/admin/filtros/banco-talentos`,
  `/admin/filtros/cadastros` — as 4 abas navegam sem erro.
- `/mobilizador/filtros`, `/mobilizador/filtros/demandas`, `/mobilizador/filtros/cadastros`
  — as 3 abas navegam sem erro, escopo de sub-rede respeitado na aba nova.

- [ ] **Step 4: Commit final (se algo precisou de ajuste nesta verificação)**

```bash
git add -A
git commit -m "fix: ajustes pós-verificação do cadastro completo + demanda"
```

(Só necessário se a Step 3 encontrar algo a corrigir — caso contrário, não há nada pra
commitar aqui.)
