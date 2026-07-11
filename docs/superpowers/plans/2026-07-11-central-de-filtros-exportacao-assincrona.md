# Central de Filtros — Exportação Assíncrona + Limpar Filtro — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar botão "Limpar filtro" à aba Pessoas, e fazer exportações com 500+ pessoas gerarem o arquivo em segundo plano, subirem pro storage com link assinado (48h), e serem entregues por e-mail em vez de bloquear o download.

**Architecture:** A rota de exportação (`/api/[slug]/filtros/pessoas/exportar`) passa a checar o total de pessoas filtradas antes de gerar o arquivo. Abaixo do limite, comportamento inalterado (download síncrono). No limite ou acima, responde imediatamente com uma página HTML de confirmação e dispara — sem aguardar (`fire-and-forget`, seguro porque o processo Node do Docker é persistente, não serverless) — a geração do arquivo, upload pro Supabase Storage e envio de e-mail com link assinado temporário.

**Tech Stack:** Next.js 14 Route Handler, Supabase Storage (`createSignedUrl`), Resend (via `enviarEmail` já existente).

## Global Constraints

- O limite que decide síncrono vs. assíncrono é **500 pessoas**, definido como constante única (`LIMITE_EXPORT_SINCRONO`) reaproveitada tanto pela UI (aviso) quanto pela rota (decisão real) — nunca hardcoded em mais de um lugar.
- Link de download do e-mail é **assinado** (`createSignedUrl`, bucket `gabinete-assets`), válido por **48 horas** — nunca um link público permanente, por causa do volume de dado pessoal exportado de uma vez.
- **Lição da sessão anterior**: `tsc --noEmit` e `vitest` NÃO pegam erros de ESLint (`next build` os pega, e o build Docker falha se houver erro de lint). Todo task desta plano precisa rodar `npm run build` completo antes do commit, não só `tsc --noEmit`.
- Seguir o padrão já estabelecido em `src/lib/email.ts` (templates retornam string HTML, sempre passando texto do usuário por `escapeHtml`) e em `src/actions/admin/upload-foto-pessoa.ts`/`salvar-banco-talentos.ts` (upload via `getSupabaseAdmin().storage`).
- Nenhuma mudança de comportamento abaixo do limite — download síncrono continua idêntico ao que já está em produção.

---

### Task 1: Constante do limite + botão "Limpar filtro" + aviso na UI

**Files:**
- Modify: `src/lib/filtros-pessoas.ts`
- Modify: `src/app/[slug]/admin/filtros/PessoasFiltro.tsx`

**Interfaces:**
- Produces: `LIMITE_EXPORT_SINCRONO: number` (exportado de `src/lib/filtros-pessoas.ts`), reaproveitado pela Task 4 (rota)

- [ ] **Step 1: Adicionar a constante em `src/lib/filtros-pessoas.ts`**

Adicione no topo do arquivo, logo após os imports:

```typescript
// Acima disso, a exportação não bloqueia a resposta HTTP esperando o
// arquivo inteiro ser gerado — vira um fluxo assíncrono por e-mail (ver
// rota de exportação). Constante única, reaproveitada pela UI (aviso) e
// pela rota (decisão real), pra nunca ficar dessincronizado.
export const LIMITE_EXPORT_SINCRONO = 500
```

- [ ] **Step 2: Adicionar botão "Limpar filtro" em `PessoasFiltro.tsx`**

No `<form>`, logo depois do `<button type="submit">Filtrar</button>` (mantendo o botão como está), adicione:

```tsx
          <a
            href={baseHref}
            className="text-sm text-gray-500 underline px-2 py-1.5 hover:text-gray-700"
          >
            Limpar filtro
          </a>
```

- [ ] **Step 3: Importar a constante e adicionar o aviso de exportação grande**

No topo do arquivo, adicione o import:

```typescript
import { LIMITE_EXPORT_SINCRONO } from '@/lib/filtros-pessoas'
```

Troque este bloco:

```tsx
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm text-gray-600">{totalFiltrado.toLocaleString('pt-BR')} pessoa(s) encontrada(s)</p>
        <div className="flex gap-2">
```

por:

```tsx
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <p className="text-sm text-gray-600">{totalFiltrado.toLocaleString('pt-BR')} pessoa(s) encontrada(s)</p>
          {totalFiltrado >= LIMITE_EXPORT_SINCRONO && (
            <p className="text-xs text-amber-600 mt-0.5">
              Esse filtro tem muitos resultados — o arquivo será enviado por e-mail.
            </p>
          )}
        </div>
        <div className="flex gap-2">
```

(o `</div>` de fechamento do bloco de botões de exportação já existe mais abaixo no arquivo — não precisa adicionar nada lá, só essa abertura extra de `<div>` em volta do parágrafo de contagem)

- [ ] **Step 4: Verificar TypeScript e build completo**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: sem erros

Run: `npm run build`
Expected: build completo sem erros (inclui checagem de ESLint — não pule esse passo, só `tsc` não é suficiente)

- [ ] **Step 5: Verificação manual**

Suba o servidor de dev, acesse `/[slug]/admin/filtros`, confirme que "Limpar filtro" aparece ao lado de "Filtrar" e que clicar nele volta pra tela sem nenhum filtro aplicado. Não dá pra testar o aviso de 500+ sem um gabinete com esse volume de dado — só confirme visualmente que a condição está bem formada (sem quebrar o layout quando `totalFiltrado` é pequeno).

- [ ] **Step 6: Commit**

```bash
git add src/lib/filtros-pessoas.ts "src/app/[slug]/admin/filtros/PessoasFiltro.tsx"
git commit -m "feat: botão Limpar filtro + aviso de exportação grande na aba Pessoas"
```

---

### Task 2: Template de e-mail de exportação pronta

**Files:**
- Modify: `src/lib/email.ts`

**Interfaces:**
- Produces: `templateExportacaoPronta({ nomeDestinatario, urlDownload, expiraEm }): string`

- [ ] **Step 1: Adicionar o template ao final de `src/lib/email.ts`**

```typescript
export function templateExportacaoPronta({
  nomeDestinatario,
  urlDownload,
  expiraEm,
}: {
  nomeDestinatario: string
  urlDownload: string
  expiraEm: Date
}): string {
  return `
    <p>Olá, ${escapeHtml(nomeDestinatario)}!</p>
    <p>Sua exportação de dados está pronta. Clique no link abaixo para baixar o arquivo:</p>
    <p><a href="${escapeHtml(urlDownload)}">Baixar arquivo →</a></p>
    <p>Esse link expira em ${expiraEm.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}.</p>
  `
}
```

- [ ] **Step 2: Verificar TypeScript e build completo**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: sem erros

Run: `npm run build`
Expected: sem erros

- [ ] **Step 3: Commit**

```bash
git add src/lib/email.ts
git commit -m "feat: template de e-mail de exportação pronta"
```

---

### Task 3: Upload da exportação + link assinado

**Files:**
- Create: `src/lib/upload-exportacao.ts`

**Interfaces:**
- Consumes: `getSupabaseAdmin` de `@/lib/supabase/admin` (já existe)
- Produces: `uploadExportacaoESaerAssinada(gabineteId: string, exportId: string, extensao: string, contentType: string, buffer: Buffer): Promise<string>` (retorna a URL assinada)

**Não tem teste automatizado** — depende de Supabase Storage real (I/O externo). Mesmo padrão já usado no projeto pra código de upload (`upload-foto-pessoa.ts`, `salvar-banco-talentos.ts` também não têm teste).

- [ ] **Step 1: Criar o arquivo**

```typescript
// src/lib/upload-exportacao.ts
import { getSupabaseAdmin } from './supabase/admin'

const VALIDADE_SEGUNDOS = 48 * 60 * 60

// Link assinado (não público) porque uma exportação de Pessoas pode
// conter dado sensível de centenas de pessoas de uma vez (telefone,
// endereço, PcD) — diferente de uma foto de perfil individual, o risco
// de um link permanente vazando é maior aqui.
export async function uploadExportacaoESaerAssinada(
  gabineteId: string,
  exportId: string,
  extensao: string,
  contentType: string,
  buffer: Buffer
): Promise<string> {
  const path = `${gabineteId}/exports/${exportId}.${extensao}`
  const { error } = await getSupabaseAdmin()
    .storage.from('gabinete-assets')
    .upload(path, buffer, { contentType })
  if (error) throw new Error(`Falha ao subir arquivo de exportação: ${error.message}`)

  const { data, error: erroAssinatura } = await getSupabaseAdmin()
    .storage.from('gabinete-assets')
    .createSignedUrl(path, VALIDADE_SEGUNDOS)
  if (erroAssinatura || !data) {
    throw new Error(`Falha ao gerar link assinado: ${erroAssinatura?.message ?? 'sem dados retornados'}`)
  }
  return data.signedUrl
}
```

- [ ] **Step 2: Verificar TypeScript e build completo**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: sem erros

Run: `npm run build`
Expected: sem erros

- [ ] **Step 3: Commit**

```bash
git add src/lib/upload-exportacao.ts
git commit -m "feat: upload de exportação pro storage com link assinado (48h)"
```

---

### Task 4: Rota de exportação — branch síncrono/assíncrono

**Files:**
- Modify: `src/app/api/[slug]/filtros/pessoas/exportar/route.ts`

**Interfaces:**
- Consumes: `LIMITE_EXPORT_SINCRONO` (Task 1), `templateExportacaoPronta` (Task 2), `uploadExportacaoESaerAssinada` (Task 3)

- [ ] **Step 1: Substituir o arquivo inteiro**

```typescript
// src/app/api/[slug]/filtros/pessoas/exportar/route.ts
import { randomUUID } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { assertAdminAccess } from '@/lib/assert-admin-access'
import { assertMobilizadorAccess } from '@/lib/assert-mobilizador-access'
import { coletarSubRedeIds } from '@/lib/rede'
import {
  buildWherePessoas,
  aplicarFiltrosPosConsulta,
  LIMITE_EXPORT_SINCRONO,
  type FiltrosPessoasParams,
} from '@/lib/filtros-pessoas'
import { gerarPdfPessoas, gerarExcelPessoas, type PessoaExportavel } from '@/lib/exportar-pessoas'
import { uploadExportacaoESaerAssinada } from '@/lib/upload-exportacao'
import { enviarEmail, templateExportacaoPronta } from '@/lib/email'

function paginaConfirmacao(): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="utf-8"><title>Exportação iniciada</title></head>
<body style="font-family: sans-serif; max-width: 480px; margin: 80px auto; text-align: center; color: #333;">
  <h1 style="font-size: 20px;">Exportação iniciada</h1>
  <p>Sua exportação foi iniciada. Você vai receber um e-mail com o link de download em alguns minutos.</p>
</body>
</html>`
}

// Roda em segundo plano, sem bloquear a resposta HTTP — seguro aqui porque
// o processo Node do Docker é persistente (não serverless), então a tarefa
// continua depois da resposta ser enviada.
async function gerarESalvarExportacao(
  pessoas: PessoaExportavel[],
  formato: 'pdf' | 'excel',
  gabineteId: string,
  destinatario: { nome: string; email: string }
): Promise<void> {
  const buffer = formato === 'excel' ? await gerarExcelPessoas(pessoas) : await gerarPdfPessoas(pessoas)
  const extensao = formato === 'excel' ? 'xlsx' : 'pdf'
  const contentType =
    formato === 'excel'
      ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      : 'application/pdf'
  const url = await uploadExportacaoESaerAssinada(gabineteId, randomUUID(), extensao, contentType, buffer)
  const expiraEm = new Date(Date.now() + 48 * 60 * 60 * 1000)
  await enviarEmail({
    para: destinatario.email,
    assunto: 'Sua exportação está pronta',
    html: templateExportacaoPronta({ nomeDestinatario: destinatario.nome, urlDownload: url, expiraEm }),
  })
}

export async function GET(request: NextRequest, { params }: { params: { slug: string } }) {
  let gabineteId: string
  let idsRede: string[] | undefined
  let userId: string

  try {
    const { session, gabinete } = await assertAdminAccess(params.slug)
    gabineteId = gabinete.id
    userId = session.user.id
  } catch {
    try {
      const { session, gabinete, pessoa } = await assertMobilizadorAccess(params.slug)
      gabineteId = gabinete.id
      idsRede = await coletarSubRedeIds(pessoa.id, gabinete.id)
      userId = session.user.id
    } catch {
      return new NextResponse('Não autorizado', { status: 403 })
    }
  }

  const sp = request.nextUrl.searchParams
  const filtros: FiltrosPessoasParams = {
    genero: sp.get('genero') ?? undefined,
    regiaoId: sp.get('regiaoId') ?? undefined,
    profissaoId: sp.get('profissaoId') ?? undefined,
    segmentoId: sp.get('segmentoId') ?? undefined,
    aniversario: (sp.get('aniversario') as 'dia' | 'semana' | 'mes' | null) ?? undefined,
    idadeMin: sp.get('idadeMin') ?? undefined,
    idadeMax: sp.get('idadeMax') ?? undefined,
  }
  const formato: 'pdf' | 'excel' = sp.get('formato') === 'excel' ? 'excel' : 'pdf'

  const where = buildWherePessoas(gabineteId, filtros, idsRede)
  const candidatas = await prisma.pessoa.findMany({
    where,
    orderBy: { nome: 'asc' },
    select: {
      nome: true,
      whatsapp: true,
      email: true,
      nascimento: true,
      regiao: { select: { nome: true } },
      profissao: { select: { nome: true } },
      segmentos: { select: { segmento: { select: { nome: true } } } },
    },
  })
  const pessoas = aplicarFiltrosPosConsulta(candidatas, filtros, new Date())

  if (pessoas.length >= LIMITE_EXPORT_SINCRONO) {
    const solicitante = await prisma.pessoa.findFirst({
      where: { userId, gabineteId },
      select: { nome: true, email: true },
    })
    if (solicitante?.email) {
      gerarESalvarExportacao(pessoas, formato, gabineteId, {
        nome: solicitante.nome,
        email: solicitante.email,
      }).catch((err) => {
        console.error('[exportar-pessoas] falha na exportação assíncrona:', err)
      })
    } else {
      console.error('[exportar-pessoas] solicitante sem e-mail cadastrado — exportação assíncrona não enviada')
    }
    return new NextResponse(paginaConfirmacao(), {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  }

  if (formato === 'excel') {
    const buffer = await gerarExcelPessoas(pessoas)
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="pessoas_filtradas.xlsx"',
      },
    })
  }

  const buffer = await gerarPdfPessoas(pessoas)
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename="pessoas_filtradas.pdf"',
    },
  })
}
```

- [ ] **Step 2: Verificar TypeScript e build completo**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: sem erros

Run: `npm run build`
Expected: build completo sem erros — **este é o passo mais importante desta task**, já que a sessão anterior teve um deploy quebrado por pular exatamente essa checagem.

- [ ] **Step 3: Rodar a suíte de testes inteira**

Run: `npx vitest run`
Expected: mesmas 2 falhas pré-existentes em `email.test.ts` (RESEND_API_KEY ausente), nenhuma nova falha

- [ ] **Step 4: Verificação manual**

Com menos de 500 pessoas no filtro (qualquer gabinete de teste real já serve), confirme que exportar PDF/Excel continua baixando na hora, exatamente como antes — essa é a checagem mais importante, já que é o caminho que já está em produção e não pode regredir. Não dá pra testar o caminho de 500+ sem um gabinete desse tamanho — documente isso no relatório sem bloquear a task por causa disso.

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/[slug]/filtros/pessoas/exportar/route.ts"
git commit -m "feat: exportação de 500+ pessoas passa a ser assíncrona, com link assinado por e-mail"
```
