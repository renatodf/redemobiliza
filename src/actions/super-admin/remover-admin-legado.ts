'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { createSupabaseServerClient } from '@/lib/supabase/server'

async function assertSuperAdmin() {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.app_metadata?.role !== 'super-admin') {
    redirect('/super-admin/login')
  }
}

// Remove o acesso de admin de um usuário sem Pessoa vinculada (convidado por
// e-mail antes do botão +Admin existir na ficha) — só mexe em
// UsuarioGabinete, não existe ficha/Pessoa pra atualizar.
export async function removerAdminLegado(gabineteId: string, userId: string) {
  await assertSuperAdmin()

  await prisma.usuarioGabinete.deleteMany({
    where: { userId, gabineteId, papel: 'admin' },
  })

  revalidatePath(`/super-admin/gabinetes/${gabineteId}`)
}
