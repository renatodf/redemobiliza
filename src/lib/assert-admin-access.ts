import 'server-only'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getGabineteBySlug } from '@/lib/gabinete'
import { prisma } from '@/lib/prisma'

export async function assertAdminAccess(slug: string) {
  const supabase = createSupabaseServerClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Não autenticado')

  const gabinete = await getGabineteBySlug(slug)
  if (!gabinete) throw new Error('Gabinete não encontrado')

  const role = session.user.app_metadata?.role as string | undefined

  if (role !== 'super-admin') {
    const usuarioGabinete = await prisma.usuarioGabinete.findUnique({
      where: { userId_gabineteId: { userId: session.user.id, gabineteId: gabinete.id } },
      select: { papel: true },
    })
    if (!usuarioGabinete || usuarioGabinete.papel !== 'admin') {
      throw new Error('Não autorizado')
    }
  }

  return { session, gabinete }
}
