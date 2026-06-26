'use server'

import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { toSlug } from '@/lib/slug'

export async function editarGabinete(id: string, formData: FormData) {
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

  await prisma.gabinete.update({
    where: { id },
    data: { nome, slug, corPrimaria, corSecundaria },
  })

  redirect(`/super-admin/gabinetes/${id}`)
}
