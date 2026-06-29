'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { assertAdminAccess } from '@/lib/assert-admin-access'
import { enviarEmail, templateDemandaAtribuida } from '@/lib/email'

export async function criarDemanda(formData: FormData): Promise<void> {
  const slug = formData.get('slug') as string
  const titulo = (formData.get('titulo') as string).trim()
  const descricao = (formData.get('descricao') as string).trim()
  const solicitanteId = formData.get('solicitanteId') as string
  const responsavelId = formData.get('responsavelId') as string
  const areaId = formData.get('areaId') as string
  const prazoCustom = formData.get('prazoDesfecho') as string | null

  if (!titulo || !descricao || !solicitanteId || !responsavelId || !areaId) {
    throw new Error('Preencha todos os campos obrigatórios')
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

  // Validar que solicitante pertence ao gabinete
  const solicitanteCheck = await prisma.pessoa.findFirst({
    where: { id: solicitanteId, gabineteId: gabinete.id },
    select: { id: true },
  })
  if (!solicitanteCheck) throw new Error('Solicitante não encontrado')

  // Validar que responsável pertence ao gabinete e é colaborador mobilizador
  const responsavelCheck = await prisma.pessoa.findFirst({
    where: { id: responsavelId, gabineteId: gabinete.id, isMobilizador: true, isColaborador: true },
    select: { id: true },
  })
  if (!responsavelCheck) throw new Error('Responsável não encontrado')

  // Validar que área pertence ao gabinete
  const areaCheck = await prisma.areaDemanda.findFirst({
    where: { id: areaId, gabineteId: gabinete.id },
    select: { id: true },
  })
  if (!areaCheck) throw new Error('Área não encontrada')

  const demanda = await prisma.demanda.create({
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
  })

  // Enviar notificação ao responsável
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
          nomeSolicitante: (await prisma.pessoa.findUnique({ where: { id: solicitanteId }, select: { nome: true } }))?.nome ?? '',
          prazo: prazoDesfecho,
          urlDemanda: `${appUrl}/${gabineteData?.slug}/mobilizador/demandas/${demanda.id}`,
        }),
      })
    } catch {
      // falha no email não bloqueia a criação da demanda
    }
  }

  revalidatePath(`/${slug}/admin/demandas`)
  redirect(`/${slug}/admin/demandas/${demanda.id}`)
}
