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
 * Cria um usuário no Supabase Auth para promoção a mobilizador ou administrador. Se o e-mail já
 * estiver cadastrado, diagnostica a causa mais comum (uma promoção anterior
 * que criou o usuário mas falhou antes de vincular ao Pessoa/UsuarioGabinete)
 * e retorna um erro específico e acionável — mas nunca reaproveita a conta
 * automaticamente: redefinir a senha de uma conta existente sem confirmação
 * do dono do e-mail seria uma forma de sequestro de conta (um admin poderia
 * apontar o e-mail de qualquer Pessoa para o de outra pessoa real e assumir
 * a senha dela). A limpeza de contas órfãs exige ação humana explícita.
 */
export async function criarOuReaproveitarUsuarioAcesso(
  supabaseAdmin: SupabaseClient,
  email: string,
  senha: string
): Promise<{ userId: string } | { erro: string }> {
  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true,
  })
  if (!error && data.user) return { userId: data.user.id }

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

  // Corrida rara: duas promoções quase simultâneas do mesmo e-mail — a
  // primeira pode ainda não ter commitado o vínculo Pessoa/UsuarioGabinete
  // no instante em que a segunda chega aqui, gerando um falso positivo de
  // "conta órfã" (achado 2.1 da auditoria de terceira ordem). Um segundo
  // re-check, depois de uma pequena espera, cobre essa janela sem custo
  // perceptível no caminho comum (conta realmente órfã).
  await new Promise((resolve) => setTimeout(resolve, 500))
  const vinculoExistenteRecheck = await prisma.pessoa.findFirst({
    where: { userId: usuarioExistente.id },
    select: { id: true },
  })
  if (vinculoExistenteRecheck) {
    return { erro: 'Já existe uma conta com este e-mail vinculada a outra pessoa. Verifique com o suporte.' }
  }

  return {
    erro:
      `Este e-mail já tem uma conta de acesso, mas sem vínculo com nenhuma pessoa cadastrada — ` +
      `provavelmente sobrou de uma promoção anterior que não terminou. Por segurança, essa conta não é ` +
      `reaproveitada automaticamente. Peça a um super-admin para excluir a conta órfã (ID ${usuarioExistente.id}) ` +
      `no Supabase Auth e tente promover novamente.`,
  }
}
