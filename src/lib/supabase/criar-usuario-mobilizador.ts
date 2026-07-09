import 'server-only'
import { SupabaseClient } from '@supabase/supabase-js'
import { prisma } from '@/lib/prisma'

async function buscarUsuarioPorEmail(supabaseAdmin: SupabaseClient, email: string) {
  const emailLower = email.toLowerCase()
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 })
    if (error || !data.users.length) return null
    const match = data.users.find((u) => u.email?.toLowerCase() === emailLower)
    if (match) return match
    if (data.users.length < 200) return null
  }
  return null
}

/**
 * Cria um usuário no Supabase Auth para promoção a mobilizador. Se o e-mail já
 * estiver cadastrado — caso comum de uma promoção anterior que criou o usuário
 * mas falhou antes de vincular ao Pessoa/UsuarioGabinete — localiza a conta
 * órfã e a reaproveita (redefinindo a senha) em vez de falhar. Só reaproveita
 * se a conta não estiver vinculada a nenhum Pessoa; caso contrário, é um
 * conflito real e retorna erro.
 */
export async function criarOuReaproveitarUsuarioMobilizador(
  supabaseAdmin: SupabaseClient,
  email: string,
  senha: string
): Promise<{ userId: string; criadoAgora: boolean } | { erro: string }> {
  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true,
  })
  if (!error && data.user) return { userId: data.user.id, criadoAgora: true }

  if (!error?.message.includes('already been registered')) {
    return { erro: 'Erro ao criar acesso: ' + (error?.message ?? 'desconhecido') }
  }

  const usuarioExistente = await buscarUsuarioPorEmail(supabaseAdmin, email)
  if (!usuarioExistente) {
    return { erro: 'Erro ao criar acesso: e-mail já cadastrado, mas não foi possível localizar a conta existente.' }
  }

  const vinculoExistente = await prisma.pessoa.findFirst({
    where: { userId: usuarioExistente.id },
    select: { id: true },
  })
  if (vinculoExistente) {
    return { erro: 'Já existe uma conta com este e-mail vinculada a outra pessoa. Verifique com o suporte.' }
  }

  const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(usuarioExistente.id, {
    password: senha,
    email_confirm: true,
  })
  if (updateError) return { erro: 'Erro ao reaproveitar acesso existente: ' + updateError.message }

  return { userId: usuarioExistente.id, criadoAgora: false }
}
