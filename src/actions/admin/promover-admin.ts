'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { assertAdminAccess } from '@/lib/assert-admin-access'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { criarOuReaproveitarUsuarioAcesso } from '@/lib/supabase/criar-usuario-acesso'
import { enviarEmail, escapeHtml } from '@/lib/email'

export async function promoverAdmin(
  _prevState: { erro?: string },
  formData: FormData
): Promise<{ erro?: string }> {
  const slug = formData.get('slug') as string
  const pessoaId = formData.get('pessoaId') as string
  const senha = formData.get('senha') as string
  const confirmarSenha = formData.get('confirmarSenha') as string

  if (senha !== confirmarSenha) return { erro: 'As senhas não conferem.' }
  if (senha.length < 6) return { erro: 'A senha deve ter pelo menos 6 caracteres.' }

  try {
    const { gabinete } = await assertAdminAccess(slug)

    const pessoa = await prisma.pessoa.findFirst({
      where: { id: pessoaId, gabineteId: gabinete.id, deletedAt: null },
      select: { id: true, nome: true, email: true, userId: true, isAdmin: true, isMobilizador: true },
    })
    if (!pessoa) return { erro: 'Pessoa não encontrada.' }
    if (!pessoa.email) return { erro: 'Pessoa não tem e-mail cadastrado. Adicione um e-mail antes de promover.' }
    if (pessoa.isAdmin) return { erro: 'Pessoa já é administradora.' }

    // Se a pessoa já tem conta (ex.: já foi mobilizadora), reaproveita a
    // conta existente redefinindo a senha — criar uma conta nova com o
    // mesmo e-mail falharia e cairia no caminho de "conta órfã" de
    // criarOuReaproveitarUsuarioAcesso, que não sabe que a conta já é desta
    // mesma pessoa.
    let userId: string
    if (pessoa.userId) {
      const { error: pwError } = await getSupabaseAdmin().auth.admin.updateUserById(pessoa.userId, { password: senha })
      if (pwError) return { erro: 'Erro ao atualizar senha: ' + pwError.message }
      userId = pessoa.userId
    } else {
      const resultado = await criarOuReaproveitarUsuarioAcesso(getSupabaseAdmin(), pessoa.email, senha)
      if ('erro' in resultado) return { erro: resultado.erro }
      userId = resultado.userId
    }

    try {
      await prisma.$transaction([
        ...(pessoa.isMobilizador
          ? [
              prisma.pessoa.update({
                where: { id: pessoaId },
                data: { isMobilizador: false, tokenMobilizador: null },
              }),
              prisma.usuarioGabinete.deleteMany({
                where: { userId, gabineteId: gabinete.id, papel: 'mobilizador' },
              }),
            ]
          : []),
        prisma.pessoa.update({
          where: { id: pessoaId },
          data: { isAdmin: true, userId },
        }),
        prisma.usuarioGabinete.create({
          data: { userId, gabineteId: gabinete.id, papel: 'admin' },
        }),
      ])
    } catch (txError) {
      if (!pessoa.userId) {
        await getSupabaseAdmin().auth.admin.deleteUser(userId)
      }
      throw txError
    }

    await enviarEmail({
      para: pessoa.email,
      assunto: 'Você agora tem acesso ao painel de administrador',
      html: `<p>Olá, ${escapeHtml(pessoa.nome)}!</p><p>Seu acesso foi criado. Entre em <strong>/login</strong> com seu e-mail e a senha definida.</p>`,
    })

    revalidatePath(`/${slug}/admin/pessoas/${pessoaId}`)
    return {}
  } catch (e) {
    return { erro: e instanceof Error ? e.message : 'Erro desconhecido.' }
  }
}
