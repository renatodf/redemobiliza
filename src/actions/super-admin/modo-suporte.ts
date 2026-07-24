'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import { caminhoRelativoSeguro } from '@/lib/caminho-relativo-seguro'

function gerarSessaoId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export async function entrarModoSuporte(gabineteId: string, redirectPath?: string) {
  const supabase = createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user || user.app_metadata?.role !== 'super-admin') {
    redirect('/super-admin/login')
  }

  const sessaoId = gerarSessaoId()

  await prisma.logSuporte.create({
    data: {
      gabineteId,
      superAdminUserId: user.id,
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

  const destinoPadrao = `/${gabinete?.slug ?? ''}/admin/`
  // redirectPath é passado como argumento pré-vinculado (.bind) a partir de
  // dado já resolvido no servidor (gabinete.slug + pessoa.id), nunca de input
  // direto de usuário — mas sanitiza mesmo assim, mesma defesa em profundidade
  // já usada em submeterCadastro (Server Actions podem ser invocadas
  // diretamente, fora do fluxo normal da UI).
  redirect(redirectPath ? caminhoRelativoSeguro(redirectPath, destinoPadrao) : destinoPadrao)
}

export async function sairModoSuporte(gabineteId: string, sessaoId: string) {
  const supabase = createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user || user.app_metadata?.role !== 'super-admin') {
    redirect('/super-admin/login')
  }

  await prisma.logSuporte.create({
    data: {
      gabineteId,
      superAdminUserId: user.id,
      acao: 'acesso_fim',
      sessaoId,
      saidoEm: new Date(),
    },
  })

  cookies().delete('suporteSessao')

  redirect('/super-admin/')
}
