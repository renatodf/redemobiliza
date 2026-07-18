// src/app/api/[slug]/filtros/demandas/exportar/route.ts
import { randomUUID } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { assertAdminAccess } from '@/lib/assert-admin-access'
import { assertMobilizadorAccess } from '@/lib/assert-mobilizador-access'
import { buildWhereDemandas, type FiltrosDemandasParams } from '@/lib/filtros-demandas'
import { LIMITE_EXPORT_SINCRONO } from '@/lib/filtros-pessoas'
import { gerarPdfDemandas, gerarExcelDemandas, type DemandaExportavel } from '@/lib/exportar-demandas'
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

// Mesmo racional de src/app/api/[slug]/filtros/pessoas/exportar/route.ts:
// roda em segundo plano sem bloquear a resposta HTTP — seguro porque o
// processo Node do Docker é persistente (não serverless).
async function gerarESalvarExportacao(
  demandas: DemandaExportavel[],
  formato: 'pdf' | 'excel',
  gabineteId: string,
  destinatario: { nome: string; email: string }
): Promise<void> {
  const buffer = formato === 'excel' ? await gerarExcelDemandas(demandas) : await gerarPdfDemandas(demandas)
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
  let responsavelId: string | undefined
  let solicitante: { nome: string; email: string } | undefined

  try {
    const { session, gabinete } = await assertAdminAccess(params.slug)
    gabineteId = gabinete.id
    if (session.user.email) {
      solicitante = {
        nome: (session.user.user_metadata?.full_name as string | undefined) ?? session.user.email,
        email: session.user.email,
      }
    }
  } catch {
    try {
      const { session, gabinete, pessoa } = await assertMobilizadorAccess(params.slug)
      gabineteId = gabinete.id
      responsavelId = pessoa.id
      if (session.user.email) {
        solicitante = {
          nome: (session.user.user_metadata?.full_name as string | undefined) ?? session.user.email,
          email: session.user.email,
        }
      }
    } catch {
      return new NextResponse('Não autorizado', { status: 403 })
    }
  }

  const sp = request.nextUrl.searchParams
  const filtros: FiltrosDemandasParams = {
    areaId: sp.get('areaId') ?? undefined,
    status: (sp.get('status') as 'atendida' | 'nao_atendida' | 'pendente' | null) ?? undefined,
    regiaoId: sp.get('regiaoId') ?? undefined,
    dataInicio: sp.get('dataInicio') ?? undefined,
    dataFim: sp.get('dataFim') ?? undefined,
  }
  const formato: 'pdf' | 'excel' = sp.get('formato') === 'excel' ? 'excel' : 'pdf'

  const where = buildWhereDemandas(gabineteId, filtros, responsavelId)
  const demandas: DemandaExportavel[] = await prisma.demanda.findMany({
    where,
    orderBy: { criadoEm: 'desc' },
    select: {
      titulo: true,
      status: true,
      prazoDesfecho: true,
      area: { select: { nome: true } },
      solicitante: { select: { nome: true } },
      responsavel: { select: { nome: true } },
    },
  })

  if (demandas.length >= LIMITE_EXPORT_SINCRONO) {
    if (solicitante) {
      gerarESalvarExportacao(demandas, formato, gabineteId, solicitante).catch((err) => {
        console.error('[exportar-demandas] falha na exportação assíncrona:', err)
      })
    } else {
      console.error('[exportar-demandas] sessão sem e-mail — exportação assíncrona não enviada')
    }
    return new NextResponse(paginaConfirmacao(), {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  }

  if (formato === 'excel') {
    const buffer = await gerarExcelDemandas(demandas)
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="demandas_filtradas.xlsx"',
      },
    })
  }

  const buffer = await gerarPdfDemandas(demandas)
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename="demandas_filtradas.pdf"',
    },
  })
}
