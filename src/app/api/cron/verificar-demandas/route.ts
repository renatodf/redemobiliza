import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { enviarEmail, templateAlertaExpiracao, templateDemandaExpirada } from '@/lib/email'

export async function POST(req: NextRequest) {
  const auth = req.headers.get('Authorization')
  const secret = process.env.CRON_SECRET
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ erro: 'Não autorizado' }, { status: 401 })
  }

  const agora = new Date()
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''
  let expiradas = 0
  let alertas = 0
  const falhas: string[] = []

  // 1. Marcar demandas expiradas
  const demandasExpiradas = await prisma.demanda.findMany({
    where: { status: 'aberta', deletedAt: null, prazoDesfecho: { lt: agora } },
    include: {
      gabinete: { select: { slug: true } },
      responsavel: { select: { nome: true, email: true } },
      solicitante: { select: { nome: true } },
      criadoPor: { select: { email: true, nome: true } },
    },
  })

  for (const demanda of demandasExpiradas) {
    try {
      await prisma.demanda.update({
        where: { id: demanda.id },
        data: { status: 'expirada' },
      })
      await prisma.movimentacaoDemanda.create({
        data: {
          demandaId: demanda.id,
          tipo: 'status_alterado',
          descricao: 'Demanda expirada automaticamente por ultrapassar o prazo',
          autorId: demanda.criadoPorId,
        },
      })

      const urlDemanda = `${appUrl}/${demanda.gabinete.slug}/admin/demandas/${demanda.id}`

      if (demanda.responsavel.email) {
        try {
          await enviarEmail({
            para: demanda.responsavel.email,
            assunto: `Demanda expirada: ${demanda.titulo}`,
            html: templateDemandaExpirada({
              nomeDestinatario: demanda.responsavel.nome,
              tituloDemanda: demanda.titulo,
              nomeSolicitante: demanda.solicitante.nome,
              urlDemanda,
            }),
          })
        } catch { /* não bloqueia */ }
      }

      if (demanda.criadoPor.email && demanda.criadoPor.email !== demanda.responsavel.email) {
        try {
          await enviarEmail({
            para: demanda.criadoPor.email,
            assunto: `Demanda expirada: ${demanda.titulo}`,
            html: templateDemandaExpirada({
              nomeDestinatario: demanda.criadoPor.nome,
              tituloDemanda: demanda.titulo,
              nomeSolicitante: demanda.solicitante.nome,
              urlDemanda,
            }),
          })
        } catch { /* não bloqueia */ }
      }

      expiradas++
    } catch (e) {
      console.error(`[cron/verificar-demandas] falha ao processar expiração da demanda ${demanda.id}:`, e)
      falhas.push(`expiracao:${demanda.id}`)
    }
  }

  // 2. Alertas de expiração próxima
  const configs = await prisma.configuracaoSistema.findMany({
    select: { gabineteId: true, alertaExpiracaoHoras: true },
  })

  for (const config of configs) {
    const limiteAlerta = new Date(agora.getTime() + config.alertaExpiracaoHoras * 60 * 60 * 1000)

    const demandasAlerta = await prisma.demanda.findMany({
      where: {
        gabineteId: config.gabineteId,
        status: 'aberta',
        deletedAt: null,
        alertaEnviadoEm: null,
        prazoDesfecho: { gte: agora, lte: limiteAlerta },
      },
      include: {
        gabinete: { select: { slug: true } },
        responsavel: { select: { nome: true, email: true } },
      },
    })

    for (const demanda of demandasAlerta) {
      if (!demanda.responsavel.email) continue
      try {
        await enviarEmail({
          para: demanda.responsavel.email,
          assunto: `Atenção: demanda próxima de expirar — ${demanda.titulo}`,
          html: templateAlertaExpiracao({
            nomeResponsavel: demanda.responsavel.nome,
            tituloDemanda: demanda.titulo,
            prazo: demanda.prazoDesfecho,
            urlDemanda: `${appUrl}/${demanda.gabinete.slug}/mobilizador/demandas/${demanda.id}`,
          }),
        })
        await prisma.demanda.update({
          where: { id: demanda.id },
          data: { alertaEnviadoEm: agora },
        })
        alertas++
      } catch (e) {
        console.error(`[cron/verificar-demandas] falha ao processar alerta da demanda ${demanda.id}:`, e)
        falhas.push(`alerta:${demanda.id}`)
      }
    }
  }

  return NextResponse.json({ expiradas, alertas, falhas })
}
