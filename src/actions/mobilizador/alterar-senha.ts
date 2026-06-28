'use server'

import { createSupabaseServerClient } from '@/lib/supabase/server'

export type AlterarSenhaState = { erro?: string; sucesso?: boolean }

export async function alterarSenha(
  _prevState: AlterarSenhaState,
  formData: FormData
): Promise<AlterarSenhaState> {
  const senhaAtual = formData.get('senhaAtual') as string
  const novaSenha = formData.get('novaSenha') as string
  const confirmarSenha = formData.get('confirmarSenha') as string

  if (novaSenha !== confirmarSenha) return { erro: 'As senhas não conferem.' }
  if (novaSenha.length < 6) return { erro: 'A nova senha deve ter pelo menos 6 caracteres.' }

  const supabase = createSupabaseServerClient()

  // Buscar e-mail do usuário atual
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return { erro: 'Usuário não encontrado.' }

  // Re-autenticar para verificar senha atual
  const { error: loginError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: senhaAtual,
  })
  if (loginError) return { erro: 'Senha atual incorreta.' }

  // Atualizar para nova senha
  const { error: updateError } = await supabase.auth.updateUser({ password: novaSenha })
  if (updateError) return { erro: 'Erro ao atualizar senha: ' + updateError.message }

  return { sucesso: true }
}
