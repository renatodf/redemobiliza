'use server'

import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { getGabineteBySlug } from '@/lib/gabinete'
import { normalizeWhatsApp } from '@/lib/whatsapp'

type SubmeterCadastroInput = {
  slug: string
  segmentoSlugs: string[]
  whatsapp: string
  nome: string
  email?: string
  regiaoId?: string
  profissaoId?: string
  genero?: string
  mobilizadorToken?: string
  sucessoUrl: string
}

export async function submeterCadastro(input: SubmeterCadastroInput): Promise<{ erro: string } | never> {
  const {
    slug,
    segmentoSlugs,
    whatsapp: whatsappRaw,
    nome,
    email,
    regiaoId,
    profissaoId,
    genero,
    mobilizadorToken,
    sucessoUrl,
  } = input

  const gabinete = await getGabineteBySlug(slug)
  if (!gabinete || !gabinete.ativo) return { erro: 'Gabinete não encontrado' }

  const segmentos = await prisma.segmento.findMany({
    where: { gabineteId: gabinete.id, slug: { in: segmentoSlugs }, status: 'ativo' },
    select: { id: true },
  })
  if (segmentos.length === 0) return { erro: 'Segmento não encontrado' }

  const whatsapp = normalizeWhatsApp(whatsappRaw)
  if (!whatsapp) return { erro: 'Número de WhatsApp inválido' }

  if (!nome.trim()) return { erro: 'Nome é obrigatório' }

  let mobilizadorId: string | null = null
  if (mobilizadorToken) {
    const mob = await prisma.pessoa.findFirst({
      where: { gabineteId: gabinete.id, tokenMobilizador: mobilizadorToken, isMobilizador: true },
      select: { id: true },
    })
    mobilizadorId = mob?.id ?? null
  }

  const pessoaExistente = await prisma.pessoa.findUnique({
    where: { gabineteId_whatsapp: { gabineteId: gabinete.id, whatsapp } },
    select: { id: true },
  })

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
        genero: genero || null,
        regiaoId: regiaoId || null,
        profissaoId: profissaoId || null,
        gabineteId: gabinete.id,
        isColaborador: false,
      },
    })
    pessoaId = criada.id
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

  // sucessoUrl vem de uma Server Action chamada por Client Component — um
  // atacante pode invocar submeterCadastro diretamente (bypassando a UI) com
  // qualquer valor. Só redireciona se for um caminho relativo same-origin.
  const sucessoUrlSegura =
    sucessoUrl.startsWith('/') && !sucessoUrl.startsWith('//') && !sucessoUrl.includes('://')
      ? sucessoUrl
      : `/${slug}`

  redirect(sucessoUrlSegura)
}
