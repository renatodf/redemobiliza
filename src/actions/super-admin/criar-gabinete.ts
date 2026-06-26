'use server'

import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { toSlug } from '@/lib/slug'

export async function criarGabinete(formData: FormData) {
  const nome = (formData.get('nome') as string).trim()
  const corPrimaria = (formData.get('corPrimaria') as string) || '#1D4ED8'
  const corSecundaria = (formData.get('corSecundaria') as string) || '#3B82F6'
  const slug = toSlug(nome)

  if (!nome || !slug) {
    redirect('/super-admin/gabinetes/novo?erro=nome_obrigatorio')
  }

  const existe = await prisma.gabinete.findUnique({ where: { slug } })
  if (existe) {
    redirect('/super-admin/gabinetes/novo?erro=slug_duplicado')
  }

  const gabinete = await prisma.gabinete.create({
    data: { nome, slug, corPrimaria, corSecundaria },
  })

  redirect(`/super-admin/gabinetes/${gabinete.id}`)
}
