'use server'

import { supabaseAdmin } from '@/lib/supabase/admin'

interface ReenviarResult {
  link?: string
  erro?: string
}

export async function reenviarConvite(
  gabineteId: string,
  email: string
): Promise<ReenviarResult> {
  const { data: users, error: listError } =
    await supabaseAdmin.auth.admin.listUsers()

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
      await supabaseAdmin.auth.admin.updateUserById(usuario.id, {
        app_metadata: { gabineteId, papel: 'admin' },
      })
    if (updateError) {
      return {
        erro: 'Não foi possível atualizar os dados do usuário. Tente novamente.',
      }
    }
  }

  const { data: linkData, error: linkError } =
    await supabaseAdmin.auth.admin.generateLink({
      type: 'magiclink',
      email,
      options: {
        redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/confirm`,
      },
    })

  if (linkError || !linkData.properties?.action_link) {
    return { erro: 'Não foi possível gerar o link. Tente novamente.' }
  }

  return { link: linkData.properties.action_link }
}
