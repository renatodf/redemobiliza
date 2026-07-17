'use server'

import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { assertAdminAccess } from '@/lib/assert-admin-access'
import { normalizeWhatsApp } from '@/lib/whatsapp'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { validarImagemUpload } from '@/lib/validar-imagem-upload'
import { Prisma } from '@/generated/prisma/client'

export async function cadastrarPessoa(
  _prevState: { erro?: string },
  formData: FormData
): Promise<{ erro?: string }> {
  const slug = formData.get('slug') as string
  const nome = (formData.get('nome') as string).trim()
  const whatsappRaw = (formData.get('whatsapp') as string | null) ?? ''
  const email = (formData.get('email') as string | null)?.trim() || null
  const regiaoId = (formData.get('regiaoId') as string | null) || null
  const profissaoId = (formData.get('profissaoId') as string | null) || null
  const genero = (formData.get('genero') as string | null) || null
  const foto = formData.get('foto') as File | null

  if (!nome) return { erro: 'Nome é obrigatório' }
  if (!whatsappRaw) return { erro: 'WhatsApp é obrigatório' }

  const whatsapp = normalizeWhatsApp(whatsappRaw)
  if (!whatsapp) return { erro: 'Número de WhatsApp inválido' }

  let fotoValidada: { ext: string; contentType: string } | undefined
  if (foto && foto.size > 0) {
    try {
      fotoValidada = validarImagemUpload(foto)
    } catch (e) {
      return { erro: e instanceof Error ? e.message : 'Erro ao validar imagem' }
    }
  }

  let pessoaId: string

  try {
    const { gabinete } = await assertAdminAccess(slug)

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
    pessoaId = pessoa.id

    if (foto && foto.size > 0 && fotoValidada) {
      const path = `${gabinete.id}/pessoas/${pessoa.id}/foto.${fotoValidada.ext}`
      const buffer = Buffer.from(await foto.arrayBuffer())
      const { error } = await getSupabaseAdmin().storage
        .from('gabinete-assets')
        .upload(path, buffer, { upsert: true, contentType: fotoValidada.contentType })

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
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return { erro: 'Este WhatsApp já está cadastrado.' }
    }
    return { erro: e instanceof Error ? e.message : 'Erro ao cadastrar pessoa' }
  }

  redirect(`/${slug}/admin/pessoas/${pessoaId}`)
}
