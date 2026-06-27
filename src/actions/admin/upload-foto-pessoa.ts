'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getGabineteBySlug } from '@/lib/gabinete'

export async function uploadFotoPessoa(formData: FormData) {
  const slug = formData.get('slug') as string
  const pessoaId = formData.get('pessoaId') as string
  const file = formData.get('foto') as File | null

  if (!file || file.size === 0) return

  const supabase = createSupabaseServerClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Não autenticado')

  if (!file.type.startsWith('image/')) throw new Error('Arquivo inválido — envie uma imagem')
  if (file.size > 5 * 1024 * 1024) throw new Error('Imagem muito grande — máximo 5MB')

  const gabinete = await getGabineteBySlug(slug)
  if (!gabinete) throw new Error('Gabinete não encontrado')

  const pessoa = await prisma.pessoa.findFirst({
    where: { id: pessoaId, gabineteId: gabinete.id },
    select: { id: true, userId: true },
  })
  if (!pessoa) throw new Error('Pessoa não encontrada')

  const role = session.user.app_metadata?.role as string | undefined
  const usuarioGabinete = await prisma.usuarioGabinete.findUnique({
    where: { userId_gabineteId: { userId: session.user.id, gabineteId: gabinete.id } },
    select: { papel: true },
  })
  const isAdmin = usuarioGabinete?.papel === 'admin' || role === 'super-admin'
  const isPropriaPessoa = pessoa.userId === session.user.id

  if (!isAdmin && !isPropriaPessoa) throw new Error('Sem permissão')

  const ext = file.name.split('.').pop() ?? 'jpg'
  const path = `${gabinete.id}/pessoas/${pessoaId}/foto.${ext}`
  const buffer = Buffer.from(await file.arrayBuffer())

  const { error } = await getSupabaseAdmin().storage
    .from('gabinete-assets')
    .upload(path, buffer, { upsert: true, contentType: file.type })

  if (error) throw new Error(`Erro no upload: ${error.message}`)

  const { data: { publicUrl } } = getSupabaseAdmin().storage
    .from('gabinete-assets')
    .getPublicUrl(path)

  await prisma.pessoa.update({
    where: { id: pessoaId },
    data: { fotoUrl: publicUrl },
  })

  revalidatePath(`/${slug}/admin/pessoas/${pessoaId}`)
}
