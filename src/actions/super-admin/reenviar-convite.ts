'use server'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getSupabaseAdmin, gerarLinkComRetry } from '@/lib/supabase/admin'
import { getAppUrl } from '@/lib/app-url'
import { prisma } from '@/lib/prisma'
import { enviarEmail, templateConviteAdmin } from '@/lib/email'

interface ReenviarResult {
  enviado?: boolean
  erro?: string
}

export async function reenviarConvite(
  gabineteId: string,
  email: string
): Promise<ReenviarResult> {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.app_metadata?.role !== 'super-admin') {
    return { erro: 'Não autorizado.' }
  }
  const { data: users, error: listError } =
    await getSupabaseAdmin().auth.admin.listUsers()

  if (listError) return { erro: 'Erro ao buscar usuário.' }

  const usuario = users.users.find(
    (u) => u.email?.toLowerCase() === email.toLowerCase()
  )

  if (!usuario) {
    return { erro: 'Usuário não encontrado. Use "Convidar admin" para criar o convite.' }
  }

  const metaGabineteId = usuario.app_metadata?.gabineteId
  if (!metaGabineteId || metaGabineteId !== gabineteId) {
    const { error: updateError } =
      await getSupabaseAdmin().auth.admin.updateUserById(usuario.id, {
        app_metadata: { gabineteId, papel: 'admin' },
      })
    if (updateError) {
      return {
        erro: 'Não foi possível atualizar os dados do usuário. Tente novamente.',
      }
    }
  }

  const { data: linkData, error: linkError } = await gerarLinkComRetry({
    type: 'magiclink',
    email,
    options: {
      redirectTo: `${getAppUrl()}/auth/confirm`,
    },
  })

  if (linkError || !linkData.properties?.hashed_token) {
    return { erro: 'Não foi possível gerar o link. Tente novamente.' }
  }

  const gabinete = await prisma.gabinete.findUnique({ where: { id: gabineteId }, select: { nome: true } })
  const urlConvite = `${getAppUrl()}/auth/confirm?token_hash=${linkData.properties.hashed_token}&type=magiclink`

  try {
    await enviarEmail({
      para: email,
      assunto: `Convite para administrar ${gabinete?.nome ?? 'o gabinete'}`,
      html: templateConviteAdmin({ nomeGabinete: gabinete?.nome ?? 'o gabinete', urlConvite }),
    })
  } catch {
    return { erro: 'Não foi possível enviar o e-mail. Tente novamente.' }
  }

  return { enviado: true }
}
