'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getGabineteBySlug } from '@/lib/gabinete'

const ALLOWED_TYPES = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
} as const

export async function uploadFotoPessoa(formData: FormData) {
  const slug = formData.get('slug')
  const pessoaId = formData.get('pessoaId')
  const file = formData.get('foto') as File | null

  if (!file || file.size === 0) return
  if (!slug || !pessoaId) throw new Error('Parâmetros inválidos')

  const supabase = createSupabaseServerClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) throw new Error('Não autenticado')

  const safeType = file.type.toLowerCase() as keyof typeof ALLOWED_TYPES
  if (!(safeType in ALLOWED_TYPES)) throw new Error('Tipo de imagem não permitido — use JPEG, PNG, WebP ou GIF')
  if (file.size > 5 * 1024 * 1024) throw new Error('Imagem muito grande — máximo 5MB')

  const gabinete = await getGabineteBySlug(slug as string)
  if (!gabinete) throw new Error('Gabinete não encontrado')

  const pessoa = await prisma.pessoa.findFirst({
    where: { id: pessoaId as string, gabineteId: gabinete.id },
    select: { id: true, userId: true, fotoUrl: true },
  })
  if (!pessoa) throw new Error('Pessoa não encontrada')

  const role = user.app_metadata?.role as string | undefined
  const usuarioGabinete = await prisma.usuarioGabinete.findUnique({
    where: { userId_gabineteId: { userId: user.id, gabineteId: gabinete.id } },
    select: { papel: true },
  })
  const isAdmin = usuarioGabinete?.papel === 'admin' || role === 'super-admin'
  const isPropriaPessoa = pessoa.userId === user.id

  if (!isAdmin && !isPropriaPessoa) throw new Error('Sem permissão')

  if (pessoa.fotoUrl) {
    const oldUrl = pessoa.fotoUrl.split('gabinete-assets/')[1]?.split('?')[0]
    if (oldUrl) {
      await getSupabaseAdmin().storage.from('gabinete-assets').remove([oldUrl])
    }
  }

  const ext = ALLOWED_TYPES[safeType]
  const path = `${gabinete.id}/pessoas/${pessoaId}/foto.${ext}`
  const buffer = Buffer.from(await file.arrayBuffer())

  const { error } = await getSupabaseAdmin().storage
    .from('gabinete-assets')
    .upload(path, buffer, { upsert: true, contentType: safeType })

  if (error) {
    console.error('[uploadFotoPessoa] storage error:', error)
    throw new Error('Falha ao salvar imagem. Tente novamente.')
  }

  const { data: { publicUrl } } = getSupabaseAdmin().storage
    .from('gabinete-assets')
    .getPublicUrl(path)

  await prisma.pessoa.update({
    where: { id: pessoaId as string },
    data: { fotoUrl: `${publicUrl}?v=${Date.now()}` },
  })

  revalidatePath(`/${slug}/admin/pessoas/${pessoaId}`)
}
