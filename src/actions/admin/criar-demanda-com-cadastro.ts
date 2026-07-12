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
    where: { id: solicitanteId, gabineteId: gabinete.id, deletedAt: null },
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
      where: { id: solicitanteId, gabineteId: gabinete.id, deletedAt: null },
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
