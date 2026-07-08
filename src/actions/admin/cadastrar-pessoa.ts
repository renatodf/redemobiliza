'use server'

import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { assertAdminAccess } from '@/lib/assert-admin-access'
import { normalizeWhatsApp } from '@/lib/whatsapp'
import { getSupabaseAdmin } from '@/lib/supabase/admin'

const TIPOS_FOTO_PERMITIDOS = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
} as const

export async function cadastrarPessoa(formData: FormData) {
  const slug = formData.get('slug') as string
  const nome = (formData.get('nome') as string).trim()
  const whatsappRaw = (formData.get('whatsapp') as string | null) ?? ''
  const email = (formData.get('email') as string | null)?.trim() || null
  const regiaoId = (formData.get('regiaoId') as string | null) || null
  const profissaoId = (formData.get('profissaoId') as string | null) || null
  const genero = (formData.get('genero') as string | null) || null
  const foto = formData.get('foto') as File | null

  if (!nome) throw new Error('Nome é obrigatório')
  if (!whatsappRaw) throw new Error('WhatsApp é obrigatório')

  const { gabinete } = await assertAdminAccess(slug)

  const whatsapp = normalizeWhatsApp(whatsappRaw)
  if (!whatsapp) throw new Error('Número de WhatsApp inválido')

  let tipoFoto: string | undefined
  if (foto && foto.size > 0) {
    tipoFoto = TIPOS_FOTO_PERMITIDOS[foto.type.toLowerCase() as keyof typeof TIPOS_FOTO_PERMITIDOS]
    if (!tipoFoto) throw new Error('Tipo de imagem não permitido — use JPEG, PNG, WebP ou GIF')
    if (foto.size > 5 * 1024 * 1024) throw new Error('Imagem muito grande — máximo 5MB')
  }

  const pessoa = await prisma.pessoa.create({
    data: {
      nome,
      whatsapp,
      email,
      genero,
      gabineteId: gabinete.id,
      regiaoId,
      profissaoId,
      isColaborador: false,
    },
  })

  if (foto && foto.size > 0 && tipoFoto) {
    const path = `${gabinete.id}/pessoas/${pessoa.id}/foto.${tipoFoto}`
    const buffer = Buffer.from(await foto.arrayBuffer())
    const { error } = await getSupabaseAdmin().storage
      .from('gabinete-assets')
      .upload(path, buffer, { upsert: true, contentType: foto.type })

    if (!error) {
      const { data: { publicUrl } } = getSupabaseAdmin().storage.from('gabinete-assets').getPublicUrl(path)
      await prisma.pessoa.update({
        where: { id: pessoa.id },
        data: { fotoUrl: `${publicUrl}?v=${Date.now()}` },
      })
    } else {
      console.error('[cadastrarPessoa] storage error:', error)
    }
  }

  redirect(`/${slug}/admin/pessoas/${pessoa.id}`)
}
