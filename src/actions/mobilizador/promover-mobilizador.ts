'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { assertMobilizadorAccess } from '@/lib/assert-mobilizador-access'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { criarOuReaproveitarUsuarioMobilizador } from '@/lib/supabase/criar-usuario-mobilizador'
import { enviarEmail, escapeHtml } from '@/lib/email'

export async function promoverMobilizadorPorMobilizador(
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
    const { gabinete, pessoa: mobilizador } = await assertMobilizadorAccess(slug)

    // Verificar que pessoaId está na rede direta do mobilizador
    const vinculo = await prisma.vinculoRede.findFirst({
      where: {
        gabineteId: gabinete.id,
        pessoaId,
        indicadoPorId: mobilizador.id,
        deletedAt: null,
      },
    })
    if (!vinculo) return { erro: 'Esta pessoa não faz parte da sua rede.' }

    const pessoa = await prisma.pessoa.findFirst({
      where: { id: pessoaId, gabineteId: gabinete.id, deletedAt: null },
      select: { id: true, nome: true, email: true, isMobilizador: true },
    })
    if (!pessoa) return { erro: 'Pessoa não encontrada.' }
    if (!pessoa.email) return { erro: 'Pessoa não tem e-mail cadastrado.' }
    if (pessoa.isMobilizador) return { erro: 'Pessoa já é mobilizadora.' }

    const resultado = await criarOuReaproveitarUsuarioMobilizador(getSupabaseAdmin(), pessoa.email, senha)
    if ('erro' in resultado) return { erro: resultado.erro }
    const { userId } = resultado

    const tokenMobilizador = crypto.randomUUID().replace(/-/g, '')

    try {
      await prisma.$transaction([
        prisma.pessoa.update({
          where: { id: pessoaId },
          data: { isMobilizador: true, userId, tokenMobilizador },
        }),
        prisma.usuarioGabinete.create({
          data: { userId, gabineteId: gabinete.id, papel: 'mobilizador' },
        }),
      ])
    } catch (txError) {
      // Cleanup orphaned Supabase user
      await getSupabaseAdmin().auth.admin.deleteUser(userId)
      throw txError
    }

    await enviarEmail({
      para: pessoa.email,
      assunto: 'Você agora tem acesso ao painel de mobilizador',
      html: `<p>Olá, ${escapeHtml(pessoa.nome)}!</p><p>Seu acesso foi criado. Entre em <strong>/login</strong> com seu e-mail e a senha definida.</p>`,
    })

    revalidatePath(`/${slug}/mobilizador/rede`)
    return {}
  } catch (e) {
    return { erro: e instanceof Error ? e.message : 'Erro desconhecido.' }
  }
}
