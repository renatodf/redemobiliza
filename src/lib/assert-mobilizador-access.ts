import 'server-only'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getGabineteBySlug } from '@/lib/gabinete'
import { prisma } from '@/lib/prisma'

export async function assertMobilizadorAccess(slug: string) {
  const supabase = createSupabaseServerClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Não autenticado')

  const gabinete = await getGabineteBySlug(slug)
  if (!gabinete) throw new Error('Gabinete não encontrado')

  const usuarioGabinete = await prisma.usuarioGabinete.findUnique({
    where: { userId_gabineteId: { userId: session.user.id, gabineteId: gabinete.id } },
    select: { papel: true },
  })
  if (!usuarioGabinete || usuarioGabinete.papel !== 'mobilizador') {
    throw new Error('Não autorizado')
  }

  const pessoa = await prisma.pessoa.findFirst({
    where: { userId: session.user.id, gabineteId: gabinete.id, isMobilizador: true },
    select: { id: true, nome: true },
  })
  if (!pessoa) throw new Error('Mobilizador não encontrado')

  return { session, gabinete, pessoa }
}
