'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { assertAdminAccess } from '@/lib/assert-admin-access'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

export async function alterarPrazoDemanda(formData: FormData): Promise<{ erro?: string }> {
  const slug = formData.get('slug') as string
  const demandaId = formData.get('demandaId') as string
  const novoPrazo = formData.get('novoPrazo') as string
  const justificativa = (formData.get('justificativa') as string).trim()

  if (!novoPrazo) return { erro: 'Informe o novo prazo' }
  if (!justificativa) return { erro: 'Justificativa é obrigatória' }

  const { gabinete } = await assertAdminAccess(slug)

  const cookieStore = cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } }
  )
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { erro: 'Não autenticado' }

  const pessoa = await prisma.pessoa.findFirst({
    where: { userId: session.user.id, gabineteId: gabinete.id },
    select: { id: true },
  })
  if (!pessoa) return { erro: 'Usuário não encontrado' }

  const demanda = await prisma.demanda.findFirst({
    where: { id: demandaId, gabineteId: gabinete.id },
    select: { prazoDesfecho: true, status: true },
  })
  if (!demanda) return { erro: 'Demanda não encontrada' }

  const prazoAnterior = demanda.prazoDesfecho.toISOString()
  // novoPrazo vem de <input type="date"> como "YYYY-MM-DD" — new Date()
  // direto interpreta isso como UTC meia-noite, o que pode exibir um dia a
  // menos em timezone de Brasília (UTC-3) dependendo de onde é renderizado
  // (achado 1.9 da auditoria de terceira ordem). Fixar meio-dia UTC evita
  // que qualquer conversão de timezone razoável (até UTC-12/+14) cruze pra
  // o dia anterior ou seguinte.
  const prazoNovo = new Date(`${novoPrazo}T12:00:00Z`)

  await prisma.demanda.update({
    where: { id: demandaId, gabineteId: gabinete.id },
    data: { prazoDesfecho: prazoNovo, prazoAlterado: true },
  })

  await prisma.movimentacaoDemanda.create({
    data: {
      demandaId,
      tipo: 'prazo_alterado',
      descricao: `Prazo alterado de ${new Date(prazoAnterior).toLocaleDateString('pt-BR')} para ${prazoNovo.toLocaleDateString('pt-BR')}. Justificativa: ${justificativa}`,
      autorId: pessoa.id,
    },
  })

  revalidatePath(`/${slug}/admin/demandas/${demandaId}`)
  return {}
}
