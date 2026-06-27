'use server'

import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'

async function assertSuperAdmin() {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.app_metadata?.role !== 'super-admin') {
    redirect('/super-admin/login')
  }
}

export async function toggleGabinete(id: string) {
  await assertSuperAdmin()
  const gabinete = await prisma.gabinete.findUniqueOrThrow({
    where: { id },
    select: { ativo: true },
  })
  await prisma.gabinete.update({
    where: { id },
    data: { ativo: !gabinete.ativo },
  })

  redirect('/super-admin/')
}
