'use server'

import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import { toSlug } from '@/lib/slug'
import { seedRegioes } from '@/lib/seed-regioes'
import { seedProfissoes } from '@/lib/seed-profissoes'
import { seedAreasDemanda } from '@/lib/seed-areas-demanda'

async function assertSuperAdmin() {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.app_metadata?.role !== 'super-admin') {
    redirect('/super-admin/login')
  }
}

export async function criarGabinete(formData: FormData) {
  await assertSuperAdmin()
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

  await Promise.all([
    seedRegioes(gabinete.id),
    seedProfissoes(gabinete.id),
    seedAreasDemanda(gabinete.id),
    prisma.configuracaoSistema.create({
      data: { gabineteId: gabinete.id, prazoDemandasHoras: 72, alertaExpiracaoHoras: 12 },
    }),
  ])

  redirect(`/super-admin/gabinetes/${gabinete.id}`)
}
