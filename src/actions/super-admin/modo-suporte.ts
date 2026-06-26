'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'

function gerarSessaoId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export async function entrarModoSuporte(gabineteId: string) {
  const supabase = createSupabaseServerClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session || session.user.app_metadata?.role !== 'super-admin') {
    redirect('/super-admin/login')
  }

  const sessaoId = gerarSessaoId()

  await prisma.logSuporte.create({
    data: {
      gabineteId,
      superAdminUserId: session.user.id,
      acao: 'acesso_inicio',
      sessaoId,
    },
  })

  cookies().set('suporteSessao', JSON.stringify({ gabineteId, sessaoId }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
  })

  const gabinete = await prisma.gabinete.findUnique({
    where: { id: gabineteId },
    select: { slug: true },
  })

  redirect(`/g/${gabinete?.slug ?? ''}/admin/`)
}

export async function sairModoSuporte(gabineteId: string, sessaoId: string) {
  const supabase = createSupabaseServerClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session || session.user.app_metadata?.role !== 'super-admin') {
    redirect('/super-admin/login')
  }

  await prisma.logSuporte.create({
    data: {
      gabineteId,
      superAdminUserId: session.user.id,
      acao: 'acesso_fim',
      sessaoId,
      saidoEm: new Date(),
    },
  })

  cookies().delete('suporteSessao')

  redirect('/super-admin/')
}
