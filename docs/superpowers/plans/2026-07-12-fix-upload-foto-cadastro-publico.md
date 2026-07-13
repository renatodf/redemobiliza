# Fix Upload de Foto no Cadastro Público — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrar `submeterCadastro` para receber `FormData` nativo (em vez de um objeto comum contendo um `File`), eliminando a causa raiz do bug que impede o cadastro público de completar quando uma foto (vazia ou real) é enviada.

**Architecture:** Troca só o transporte — `submeterCadastro(input: SubmeterCadastroInput)` vira `submeterCadastro(formData: FormData)`, lendo cada campo via `formData.get()`/`getAll()` em vez de desestruturar um objeto. `CadastroForm.tsx` reaproveita o `FormData` que `new FormData(e.currentTarget)` já constrói a partir do form nativo, só adicionando os campos que não vêm de nenhum input (`slug`, `whatsapp`, `segmentoSlugs`, `mobilizadorToken`, `sucessoUrl`). Nenhuma regra de validação ou nome de campo muda.

**Tech Stack:** Next.js 14.2.35 (App Router, Server Actions), TypeScript strict.

## Global Constraints

- Nenhuma mudança de validação, nome de campo ou comportamento além da troca de transporte — spec seção "Escopo da mudança".
- Sem teste automatizado novo — server actions neste projeto são verificadas manualmente (decisão explícita do usuário).
- Remove o guard client-side de `3310c45` (`...(fotoEscolhida && fotoEscolhida.size > 0 ? { foto: fotoEscolhida } : {})`) — não é mais necessário com `FormData` nativo.
- `submeterCadastro`/`SubmeterCadastroInput` só são usados em `CadastroForm.tsx` (confirmado por busca) — sem outros call sites a atualizar.

---

### Task 1: Migrar `submeterCadastro` e `CadastroForm.tsx` pra `FormData` nativo

**Files:**
- Modify: `src/actions/public/submeter-cadastro.ts`
- Modify: `src/app/[slug]/cadastro/[segmentoSlug]/CadastroForm.tsx`

**Interfaces:**
- Produces: `submeterCadastro(formData: FormData): Promise<{ erro: string } | never>` (assinatura pública da action, sem outros consumidores).

- [ ] **Step 1: Reescrever `submeter-cadastro.ts` inteiro**

```ts
// src/actions/public/submeter-cadastro.ts
'use server'

import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { getGabineteBySlug } from '@/lib/gabinete'
import { normalizeWhatsApp } from '@/lib/whatsapp'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { parseDataBrasileira } from '@/lib/data-brasileira'

const TIPOS_FOTO_PERMITIDOS = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
} as const

export async function submeterCadastro(formData: FormData): Promise<{ erro: string } | never> {
  const slug = formData.get('slug') as string
  const segmentoSlugs = formData.getAll('segmentoSlugs') as string[]
  const whatsappRaw = formData.get('whatsapp') as string
  const nome = (formData.get('nome') as string | null) ?? ''
  const email = formData.get('email') as string | null
  const regiaoId = formData.get('regiaoId') as string | null
  const profissaoId = formData.get('profissaoId') as string | null
  const genero = formData.get('genero') as string | null
  const nascimentoRaw = formData.get('nascimento') as string | null
  const mobilizadorToken = (formData.get('mobilizadorToken') as string | null) || undefined
  const sucessoUrl = formData.get('sucessoUrl') as string
  const foto = formData.get('foto') as File | null

  const gabinete = await getGabineteBySlug(slug)
  if (!gabinete || !gabinete.ativo) return { erro: 'Gabinete não encontrado' }

  let tipoFoto: string | undefined
  if (foto && foto.size > 0) {
    tipoFoto = TIPOS_FOTO_PERMITIDOS[foto.type.toLowerCase() as keyof typeof TIPOS_FOTO_PERMITIDOS]
    if (!tipoFoto) return { erro: 'Tipo de imagem não permitido — use JPEG, PNG, WebP ou GIF' }
    if (foto.size > 5 * 1024 * 1024) return { erro: 'Imagem muito grande — máximo 5MB' }
  }

  // Segmento é opcional — o link fixo do mobilizador (sem segmento, só ?m=token)
  // não passa nenhum segmentoSlug. Só é erro se slugs foram informados e nenhum
  // bateu (dado inválido/obsoleto); lista vazia de propósito não é erro.
  const segmentos = segmentoSlugs.length > 0
    ? await prisma.segmento.findMany({
        where: { gabineteId: gabinete.id, slug: { in: segmentoSlugs }, status: 'ativo' },
        select: { id: true },
      })
    : []
  if (segmentoSlugs.length > 0 && segmentos.length === 0) return { erro: 'Segmento não encontrado' }

  const whatsapp = normalizeWhatsApp(whatsappRaw)
  if (!whatsapp) return { erro: 'Número de WhatsApp inválido' }

  let nascimento: Date | null = null
  if (nascimentoRaw?.trim()) {
    nascimento = parseDataBrasileira(nascimentoRaw.trim())
    if (!nascimento) return { erro: 'Data de nascimento inválida — use o formato DD/MM/AAAA' }
  }

  const pessoaExistente = await prisma.pessoa.findUnique({
    where: { gabineteId_whatsapp: { gabineteId: gabinete.id, whatsapp } },
    select: { id: true },
  })

  // Nome só é obrigatório para cadastro novo — a etapa de confirmação (pessoa
  // já cadastrada, só registrando presença) envia nome vazio de propósito,
  // já que não pede esse dado de novo.
  if (!pessoaExistente && !nome.trim()) return { erro: 'Nome é obrigatório' }

  let mobilizadorId: string | null = null
  if (mobilizadorToken) {
    const mob = await prisma.pessoa.findFirst({
      where: { gabineteId: gabinete.id, tokenMobilizador: mobilizadorToken, isMobilizador: true },
      select: { id: true },
    })
    mobilizadorId = mob?.id ?? null
  }

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
        nascimento,
        genero: genero || null,
        regiaoId: regiaoId || null,
        profissaoId: profissaoId || null,
        gabineteId: gabinete.id,
        isColaborador: false,
      },
    })
    pessoaId = criada.id
  }

  if (foto && foto.size > 0 && tipoFoto) {
    const path = `${gabinete.id}/pessoas/${pessoaId}/foto.${tipoFoto}`
    const buffer = Buffer.from(await foto.arrayBuffer())
    const { error } = await getSupabaseAdmin().storage
      .from('gabinete-assets')
      .upload(path, buffer, { upsert: true, contentType: foto.type })

    if (!error) {
      const { data: { publicUrl } } = getSupabaseAdmin().storage.from('gabinete-assets').getPublicUrl(path)
      await prisma.pessoa.update({
        where: { id: pessoaId },
        data: { fotoUrl: `${publicUrl}?v=${Date.now()}` },
      })
    } else {
      console.error('[submeterCadastro] storage error:', error)
    }
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

  redirect(caminhoRelativoSeguro(sucessoUrl, `/${slug}`))
}

// sucessoUrl vem de uma Server Action chamada por Client Component — um
// atacante pode invocar submeterCadastro diretamente (bypassando a UI) com
// qualquer valor. Checar a string crua (ex: startsWith('/')) não é suficiente:
// navegadores normalizam barra invertida e caracteres de controle antes de
// resolver a URL (ex: "/\evil.com" e "/\t/evil.com" viram "//evil.com" —
// origem diferente), então usamos o próprio parser de URL (mesma
// implementação WHATWG que o navegador usa) contra uma origem fixa. Só a
// checagem de origem não basta: um valor como "http://localhost.invalid//evil.com"
// bate com a origem fixa mas resolve num pathname que começa com "//"
// (quirk do parser: segmento vazio após a autoridade vira parte do path) —
// "//evil.com" sozinho já é uma URL relativa a protocolo (protocol-relative),
// então também rejeitamos qualquer pathname resolvido que comece com "//".
function caminhoRelativoSeguro(valor: string, fallback: string): string {
  const origemFixa = 'http://localhost.invalid'
  try {
    const resolvida = new URL(valor, origemFixa)
    if (resolvida.origin !== origemFixa) return fallback
    if (resolvida.pathname.startsWith('//')) return fallback
    return resolvida.pathname + resolvida.search + resolvida.hash
  } catch {
    return fallback
  }
}
```

- [ ] **Step 2: Atualizar `handleSubmeterDados` e `handleConfirmar` em `CadastroForm.tsx`**

Trocar (linhas 142-176 do arquivo atual):

```tsx
  function handleSubmeterDados(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setErro(null)
    const fd = new FormData(e.currentTarget)
    // BUG CONHECIDO (pré-existente, não introduzido aqui — ver pendências do
    // HANDOFF.md): qualquer File embutido num objeto comum passado pra uma
    // Server Action chamada manualmente (fora do padrão nativo
    // <form action={fn}>) quebra a serialização do Next ("Only plain
    // objects... Classes or null prototypes are not supported") — mesmo com
    // um arquivo de verdade selecionado, não só o File vazio que um
    // <input type="file"> sem seleção produz. Esse guard só resolve o caso
    // mais comum (cadastro sem foto). Upload de foto real no cadastro público
    // continua quebrado até submeterCadastro ser migrado pra receber um
    // FormData nativo, como uploadFotoPessoa já faz.
    const fotoEscolhida = fd.get('foto') as File | null
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
        nascimento: fd.get('nascimento') as string,
        mobilizadorToken,
        sucessoUrl,
        ...(fotoEscolhida && fotoEscolhida.size > 0 ? { foto: fotoEscolhida } : {}),
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
```

por:

```tsx
  function handleSubmeterDados(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setErro(null)
    // fd já vem do form nativo com nome/email/regiaoId/profissaoId/genero/
    // nascimento/foto (mesmos `name` de sempre) — só falta acrescentar o que
    // não é input nenhum (slug, whatsapp vem do state da etapa anterior,
    // segmentoSlugs, mobilizadorToken, sucessoUrl) e mandar o FormData
    // inteiro direto. FormData é um built-in que o Next reconhece nativamente
    // na serialização de Server Actions — diferente de um File solto dentro
    // de um objeto comum, que quebrava antes (ver HANDOFF.md, pendência 10).
    const fd = new FormData(e.currentTarget)
    fd.set('slug', slug)
    fd.set('whatsapp', whatsapp)
    for (const seg of segmentoSlugs) fd.append('segmentoSlugs', seg)
    if (mobilizadorToken) fd.set('mobilizadorToken', mobilizadorToken)
    fd.set('sucessoUrl', sucessoUrl)
    startTransition(async () => {
      const resultado = await submeterCadastro(fd)
      if (resultado && 'erro' in resultado) {
        setErro(resultado.erro)
      }
    })
  }

  function handleConfirmar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setErro(null)
    const fd = new FormData()
    fd.set('slug', slug)
    fd.set('whatsapp', whatsapp)
    fd.set('nome', '')
    for (const seg of segmentoSlugs) fd.append('segmentoSlugs', seg)
    if (mobilizadorToken) fd.set('mobilizadorToken', mobilizadorToken)
    fd.set('sucessoUrl', sucessoUrl)
    startTransition(async () => {
      const resultado = await submeterCadastro(fd)
      if (resultado && 'erro' in resultado) {
        setErro(resultado.erro)
      }
    })
  }
```

- [ ] **Step 3: Rodar o typecheck**

Run: `npx tsc --noEmit`
Expected: sem erros novos (as 5 falhas pré-existentes e não relacionadas em
`exportar-demandas.test.ts`/`exportar-pessoas.test.ts` continuam lá, não são
problema desta task).

- [ ] **Step 4: Verificação manual — cadastro sem foto**

`npm run dev -- -p 3100` (ou porta livre). Descobrir um slug de segmento ativo
real via:

```bash
npx tsx -e "
import { PrismaClient } from './src/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })
const prisma = new PrismaClient({ adapter: new PrismaPg(process.env.DATABASE_URL!) } as never)
;(prisma as any).segmento.findMany({ where: { status: 'ativo' }, select: { slug: true } }).then((s: any) => console.log(JSON.stringify(s))).finally(() => (prisma as any).\$disconnect())
"
```

Abrir `http://localhost:3100/<slug-do-gabinete>/cadastro/link?segmentos=<slug-do-segmento>`,
preencher WhatsApp com um número de teste que não exista ainda (ex.
`61999990100`), avançar, preencher nome (`TESTE FIX FORMDATA 1`), **sem
escolher foto**, confirmar. Esperado: redireciona pra `/sucesso` sem erro no
console do navegador.

- [ ] **Step 5: Verificação manual — cadastro com upload de foto real**

Repetir o fluxo com um WhatsApp novo (`61999990101`), preenchendo nome
(`TESTE FIX FORMDATA 2`) e **escolhendo um arquivo de imagem real** no campo
"Foto" (qualquer JPEG/PNG pequeno). Esperado: redireciona pra `/sucesso` sem
erro no console — **este é o caso que estava quebrado antes desta task**.
Confirmar depois, via query direta no banco ou pela ficha da pessoa no admin,
que `fotoUrl` foi preenchido.

Sobre a foto capturada pela webcam (`handleCapturarFoto`, linhas 106-127 de
`CadastroForm.tsx`): ela escreve o resultado em `inputFotoRef.current.files`
via `DataTransfer`, exatamente como o `handleFotoChange` do upload de arquivo
— ou seja, `fd.get('foto')` enxerga os dois casos de forma idêntica (mesmo
`File`, mesma origem). Ambientes de teste normalmente não têm câmera real
disponível pra exercitar isso ao vivo; confirmar por leitura de código que os
dois caminhos convergem no mesmo `input[name="foto"]` é suficiente — não é
necessário simular uma câmera real pra este fix.

- [ ] **Step 6: Verificação manual — etapa de confirmação de presença**

Repetir o fluxo de WhatsApp com um número que **já exista** no banco (reusar
um dos WhatsApp dos steps 4/5, já cadastrados). Esperado: cai direto na etapa
"Este número já está cadastrado", clicar "Confirmar", redireciona pra
`/sucesso` sem erro.

- [ ] **Step 7: Limpar os dados de teste criados no banco**

```bash
npx tsx -e "
import { PrismaClient } from './src/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })
const prisma = new PrismaClient({ adapter: new PrismaPg(process.env.DATABASE_URL!) } as never)
async function main() {
  const pessoas = await (prisma as any).pessoa.findMany({ where: { whatsapp: { in: ['5561999990100', '5561999990101'] } }, select: { id: true } })
  for (const p of pessoas) {
    await (prisma as any).pessoaSegmento.deleteMany({ where: { pessoaId: p.id } })
    await (prisma as any).vinculoRede.deleteMany({ where: { pessoaId: p.id } })
    await (prisma as any).pessoa.delete({ where: { id: p.id } })
  }
  console.log('removidos:', pessoas.length)
}
main().finally(() => (prisma as any).\$disconnect())
"
```

Parar o dev server local (`pkill -f "next dev -p 3100"` ou equivalente).

- [ ] **Step 8: Rodar a suíte de testes (excluindo worktrees antigos)**

Run: `npx vitest run --exclude '**/.worktrees/**' --exclude '**/.claude/worktrees/**'`
Expected: mesmo baseline de sempre (136 passed, 2 falhas pré-existentes em
`email.test.ts` por falta de `RESEND_API_KEY` local — sem regressão).

- [ ] **Step 9: Commit**

```bash
git add src/actions/public/submeter-cadastro.ts "src/app/[slug]/cadastro/[segmentoSlug]/CadastroForm.tsx"
git commit -m "fix: submeterCadastro recebe FormData nativo, corrige upload de foto real"
```

- [ ] **Step 10: Atualizar `HANDOFF.md`**

Marcar a pendência 10 como resolvida (riscada, `~~texto~~`), citando o commit
desta task, e remover a frase "upload de foto real continua quebrado" da
seção 15 (ou marcá-la como corrigida com o commit desta task).

```bash
git add HANDOFF.md
git commit -m "docs: marca pendência 10 (upload de foto no cadastro público) como resolvida"
```
