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
