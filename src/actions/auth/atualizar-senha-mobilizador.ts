'use server'

import { createSupabaseServerClient } from '@/lib/supabase/server'

export type AtualizarSenhaState = { erro: string | null; sucesso: boolean }

export async function atualizarSenhaMobilizador(
  _prevState: AtualizarSenhaState,
  formData: FormData
): Promise<AtualizarSenhaState> {
  const password = formData.get('password') as string
  const confirm = formData.get('confirm') as string

  if (!password || password.length < 6) {
    return { erro: 'A senha deve ter pelo menos 6 caracteres.', sucesso: false }
  }
  if (password !== confirm) {
    return { erro: 'As senhas não coincidem.', sucesso: false }
  }

  const supabase = createSupabaseServerClient()
  const { error } = await supabase.auth.updateUser({ password })

  if (error) {
    return { erro: 'Erro ao atualizar a senha. Tente novamente.', sucesso: false }
  }

  return { erro: null, sucesso: true }
}
