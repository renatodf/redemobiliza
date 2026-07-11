// src/app/api/[slug]/filtros/pessoas/exportar/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { assertAdminAccess } from '@/lib/assert-admin-access'
import { assertMobilizadorAccess } from '@/lib/assert-mobilizador-access'
import { coletarSubRedeIds } from '@/lib/rede'
import { buildWherePessoas, aplicarFiltrosPosConsulta, type FiltrosPessoasParams } from '@/lib/filtros-pessoas'
import { gerarPdfPessoas, gerarExcelPessoas } from '@/lib/exportar-pessoas'

export async function GET(request: NextRequest, { params }: { params: { slug: string } }) {
  let gabineteId: string
  let idsRede: string[] | undefined

  try {
    const { gabinete } = await assertAdminAccess(params.slug)
    gabineteId = gabinete.id
  } catch {
    try {
      const { gabinete, pessoa } = await assertMobilizadorAccess(params.slug)
      gabineteId = gabinete.id
      idsRede = await coletarSubRedeIds(pessoa.id, gabinete.id)
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
  const formato = sp.get('formato')

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
