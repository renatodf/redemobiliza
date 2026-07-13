// src/app/api/[slug]/filtros/banco-talentos/exportar/route.ts
import JSZip from 'jszip'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { assertAdminAccess } from '@/lib/assert-admin-access'
import { enviarEmail, templateDemandaAtribuida } from '@/lib/email'
import { getAppUrl } from '@/lib/app-url'
import { garantirAreaEmprego } from '@/lib/garantir-area-emprego'

export async function POST(request: NextRequest, { params }: { params: { slug: string } }) {
  let gabineteId: string
  let userId: string

  try {
    const { session, gabinete } = await assertAdminAccess(params.slug)
    gabineteId = gabinete.id
    userId = session.user.id
  } catch {
    return new NextResponse('Não autorizado', { status: 403 })
  }

  const formData = await request.formData()
  const pessoaIds = formData.getAll('pessoaId').map(String)
  const abrirDemanda = formData.get('abrirDemanda') === 'sim'
  const responsavelId = formData.get('responsavelId') as string | null

  if (pessoaIds.length === 0) {
    return new NextResponse('Nenhum candidato selecionado', { status: 400 })
  }

  // Revalida contra o gabinete e reaplica os mesmos invariantes fixos da
  // listagem (colocado: false, curriculoUrl não nulo) — sem isso, um
  // pessoaId selecionado antes de alguém ser marcado "colocado", ou sem
  // nenhum registro em BancoTalentos, ainda entraria no ZIP e geraria
  // Demanda de encaminhamento indevida. IDs que não passam somem
  // silenciosamente da lista, nunca causam erro nem vazam dado.
  const pessoas = await prisma.pessoa.findMany({
    where: {
      id: { in: pessoaIds },
      gabineteId,
      bancoTalentos: { colocado: false, curriculoUrl: { not: null } },
    },
    select: {
      id: true,
      nome: true,
      bancoTalentos: { select: { curriculoUrl: true } },
    },
  })

  if (abrirDemanda) {
    if (!responsavelId) return new NextResponse('Responsável obrigatório', { status: 400 })

    const responsavel = await prisma.pessoa.findFirst({
      where: { id: responsavelId, gabineteId, isMobilizador: true, isColaborador: true },
      select: { id: true, nome: true, email: true },
    })
    if (!responsavel) return new NextResponse('Responsável inválido', { status: 400 })

    const autorPessoa = await prisma.pessoa.findFirst({
      where: { userId, gabineteId },
      select: { id: true },
    })
    if (!autorPessoa) return new NextResponse('Não foi possível identificar o autor', { status: 400 })

    const areaEmpregoId = await garantirAreaEmprego(gabineteId)
    const config = await prisma.configuracaoSistema.findUnique({ where: { gabineteId } })
    const horasPrazo = config?.prazoDemandasHoras ?? 72
    const prazoDesfecho = new Date(Date.now() + horasPrazo * 60 * 60 * 1000)
    const appUrl = getAppUrl()

    // $transaction em lote: ou todas as Demandas são criadas, ou nenhuma —
    // sem isso, uma falha no meio do loop (ex. pessoa deletada entre a busca
    // e o create) deixava Demandas parciais já criadas sem rollback.
    const demandasCriadas = await prisma.$transaction(
      pessoas.map((p) => prisma.demanda.create({
        data: {
          gabineteId,
          titulo: `Acompanhamento de encaminhamento — ${p.nome}`,
          descricao: 'Encaminhamento gerado a partir do Banco de Talentos.',
          solicitanteId: p.id,
          responsavelId,
          areaId: areaEmpregoId,
          prazoDesfecho,
          criadoPorId: autorPessoa.id,
          historico: {
            create: { tipo: 'criacao', descricao: 'Demanda criada', autorId: autorPessoa.id },
          },
        },
        select: { id: true, titulo: true },
      }))
    )

    // E-mails são enviados depois do commit, fora da transação (I/O externo
    // não deve prender o lock do banco) — falha aqui não desfaz as Demandas.
    if (responsavel.email) {
      for (let i = 0; i < demandasCriadas.length; i++) {
        const demanda = demandasCriadas[i]
        const p = pessoas[i]
        try {
          await enviarEmail({
            para: responsavel.email,
            assunto: `Nova demanda atribuída: ${demanda.titulo}`,
            html: templateDemandaAtribuida({
              nomeResponsavel: responsavel.nome,
              tituloDemanda: demanda.titulo,
              nomeSolicitante: p.nome,
              prazo: prazoDesfecho,
              urlDemanda: `${appUrl}/${params.slug}/mobilizador/demandas/${demanda.id}`,
            }),
          })
        } catch {
          // falha no email não bloqueia a criação da demanda
        }
      }
    }
  }

  // curriculoUrl só é gravado por salvar-banco-talentos.ts, sempre via
  // getSupabaseAdmin().storage.getPublicUrl() — nunca texto livre. Mesmo
  // assim, restringimos o fetch ao domínio do próprio Storage (defesa em
  // profundidade contra SSRF, caso um futuro caminho de escrita quebre essa
  // garantia) e recusamos redirect, pra um 302 não poder escapar do check.
  const origemStorage = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).origin
  const zip = new JSZip()
  for (const p of pessoas) {
    const url = p.bancoTalentos?.curriculoUrl
    if (!url) continue
    let origemUrl: string
    try {
      origemUrl = new URL(url).origin
    } catch {
      continue
    }
    if (origemUrl !== origemStorage) continue
    const resposta = await fetch(url, { redirect: 'error' }).catch(() => null)
    if (!resposta || !resposta.ok) continue
    const buffer = Buffer.from(await resposta.arrayBuffer())
    const extensao = url.split('.').pop()?.split('?')[0] ?? 'pdf'
    // Sanitiza (evita path traversal via "/" no nome) e sufixa com parte do
    // id (evita colisão silenciosa no zip entre duas pessoas de mesmo nome —
    // extratores costumam sobrescrever entradas duplicadas sem avisar).
    const nomeSanitizado = p.nome.replace(/[^\w.-]+/g, '_')
    const nomeArquivo = `${nomeSanitizado}_${p.id.slice(-6)}.${extensao}`
    zip.file(nomeArquivo, buffer)
  }

  const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' })
  const hoje = new Date()
  const dataFormatada = `${String(hoje.getDate()).padStart(2, '0')}_${String(hoje.getMonth() + 1).padStart(2, '0')}_${hoje.getFullYear()}`

  return new NextResponse(new Uint8Array(zipBuffer), {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="curriculos_${dataFormatada}.zip"`,
    },
  })
}
