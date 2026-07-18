'use server'

import { redirect } from 'next/navigation'
import { Prisma } from '@/generated/prisma/client'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import { toSlug } from '@/lib/slug'

async function assertSuperAdmin() {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.app_metadata?.role !== 'super-admin') {
    redirect('/super-admin/login')
  }
}

export async function editarGabinete(id: string, formData: FormData) {
  await assertSuperAdmin()
  const nome = (formData.get('nome') as string).trim()
  const corPrimaria = formData.get('corPrimaria') as string
  const corSecundaria = formData.get('corSecundaria') as string
  const slug = toSlug(nome)

  if (!nome || !slug) {
    redirect(`/super-admin/gabinetes/${id}/editar?erro=nome_obrigatorio`)
  }

  const duplicado = await prisma.gabinete.findFirst({
    where: { slug, id: { not: id } },
  })
  if (duplicado) {
    redirect(`/super-admin/gabinetes/${id}/editar?erro=slug_duplicado`)
  }

  try {
    await prisma.gabinete.update({
      where: { id },
      data: { nome, slug, corPrimaria, corSecundaria },
    })
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      redirect(`/super-admin/gabinetes/${id}/editar?erro=slug_duplicado`)
    }
    throw e
  }

  redirect(`/super-admin/gabinetes/${id}`)
}
