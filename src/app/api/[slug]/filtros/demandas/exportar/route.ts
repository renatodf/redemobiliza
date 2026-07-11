// src/app/api/[slug]/filtros/demandas/exportar/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { assertAdminAccess } from '@/lib/assert-admin-access'
import { assertMobilizadorAccess } from '@/lib/assert-mobilizador-access'
import { buildWhereDemandas, type FiltrosDemandasParams } from '@/lib/filtros-demandas'
import { gerarPdfDemandas, gerarExcelDemandas, type DemandaExportavel } from '@/lib/exportar-demandas'

export async function GET(request: NextRequest, { params }: { params: { slug: string } }) {
  let gabineteId: string
  let responsavelId: string | undefined

  try {
    const { gabinete } = await assertAdminAccess(params.slug)
    gabineteId = gabinete.id
  } catch {
    try {
      const { gabinete, pessoa } = await assertMobilizadorAccess(params.slug)
      gabineteId = gabinete.id
      responsavelId = pessoa.id
    } catch {
      return new NextResponse('Não autorizado', { status: 403 })
    }
  }

  const sp = request.nextUrl.searchParams
  const filtros: FiltrosDemandasParams = {
    areaId: sp.get('areaId') ?? undefined,
    status: (sp.get('status') as 'atendida' | 'nao_atendida' | 'pendente' | null) ?? undefined,
    regiaoId: sp.get('regiaoId') ?? undefined,
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
