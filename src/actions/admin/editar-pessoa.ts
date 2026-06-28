'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getGabineteBySlug } from '@/lib/gabinete'
import { normalizeWhatsApp } from '@/lib/whatsapp'

export async function editarPessoa(formData: FormData) {
  const slug = formData.get('slug') as string
  const pessoaId = formData.get('pessoaId') as string
  const nome = (formData.get('nome') as string).trim()
  const whatsappRaw = (formData.get('whatsapp') as string | null) ?? ''
  const email = (formData.get('email') as string | null)?.trim() || null
  const regiaoId = (formData.get('regiaoId') as string | null) || null
  const profissaoId = (formData.get('profissaoId') as string | null) || null
  const genero = (formData.get('genero') as string | null) || null

  if (!nome) throw new Error('Nome é obrigatório')
  if (!whatsappRaw) throw new Error('WhatsApp é obrigatório')

  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Não autenticado')

  const gabinete = await getGabineteBySlug(slug)
  if (!gabinete) throw new Error('Gabinete não encontrado')

  const role = user.app_metadata?.role as string | undefined
  const usuarioGabinete = await prisma.usuarioGabinete.findUnique({
    where: { userId_gabineteId: { userId: user.id, gabineteId: gabinete.id } },
    select: { papel: true },
  })

  const isAdmin = usuarioGabinete?.papel === 'admin' || role === 'super-admin'
  const isMobilizador = usuarioGabinete?.papel === 'mobilizador'

  if (!isAdmin && !isMobilizador) throw new Error('Sem permissão')

  if (isMobilizador && !isAdmin) {
    // Verificar que a pessoa está na rede direta do mobilizador
    const mobilizadorPessoa = await prisma.pessoa.findFirst({
      where: { userId: user.id, gabineteId: gabinete.id, isMobilizador: true },
      select: { id: true },
    })
    if (!mobilizadorPessoa) throw new Error('Mobilizador não encontrado')

    const vinculo = await prisma.vinculoRede.findFirst({
      where: { gabineteId: gabinete.id, pessoaId, indicadoPorId: mobilizadorPessoa.id, deletedAt: null },
    })
    if (!vinculo) throw new Error('Pessoa fora da sua rede')
  }

  const whatsapp = normalizeWhatsApp(whatsappRaw)
  if (!whatsapp) throw new Error('Número de WhatsApp inválido')

  await prisma.pessoa.updateMany({
    where: { id: pessoaId, gabineteId: gabinete.id },
    data: { nome, whatsapp, email, genero, regiaoId, profissaoId },
  })

  revalidatePath(`/${slug}/admin/pessoas/${pessoaId}`)
}
