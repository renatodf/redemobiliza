'use server'

import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { getGabineteBySlug } from '@/lib/gabinete'
import { normalizeWhatsApp } from '@/lib/whatsapp'

type SubmeterCadastroInput = {
  slug: string
  segmentoSlug: string
  whatsapp: string
  nome: string
  email?: string
  regiaoId?: string
  profissaoId?: string
  genero?: string
  mobilizadorToken?: string
}

export async function submeterCadastro(input: SubmeterCadastroInput): Promise<{ erro: string } | never> {
  const {
    slug,
    segmentoSlug,
    whatsapp: whatsappRaw,
    nome,
    email,
    regiaoId,
    profissaoId,
    genero,
    mobilizadorToken,
  } = input

  const gabinete = await getGabineteBySlug(slug)
  if (!gabinete || !gabinete.ativo) return { erro: 'Gabinete não encontrado' }

  const segmento = await prisma.segmento.findFirst({
    where: { gabineteId: gabinete.id, slug: segmentoSlug, status: 'ativo' },
    select: { id: true },
  })
  if (!segmento) return { erro: 'Segmento não encontrado' }

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
    pessoaId = pessoaExistente.id
    await prisma.pessoa.update({
      where: { id: pessoaId },
      data: {
        nome: nome.trim(),
        ...(email?.trim() ? { email: email.trim() } : {}),
        ...(genero ? { genero } : {}),
        ...(regiaoId ? { regiaoId } : {}),
        ...(profissaoId ? { profissaoId } : {}),
      },
    })
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
        isEquipe: false,
      },
    })
    pessoaId = criada.id
  }

  await prisma.pessoaSegmento.upsert({
    where: { pessoaId_segmentoId: { pessoaId, segmentoId: segmento.id } },
    create: { pessoaId, segmentoId: segmento.id },
    update: {},
  })

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

  redirect(`/${slug}/cadastro/${segmentoSlug}/sucesso`)
}
