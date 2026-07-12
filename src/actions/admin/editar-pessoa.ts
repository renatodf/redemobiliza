'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getGabineteBySlug } from '@/lib/gabinete'
import { normalizeWhatsApp } from '@/lib/whatsapp'
import { parseDataBrasileira } from '@/lib/data-brasileira'
import { coletarSubRedeIds } from '@/lib/rede'

export async function editarPessoa(
  _prev: { ok: boolean; erro?: string } | null,
  formData: FormData
): Promise<{ ok: boolean; erro?: string }> {
  const slug = formData.get('slug') as string
  const pessoaId = formData.get('pessoaId') as string
  const nome = (formData.get('nome') as string).trim()
  const whatsappRaw = (formData.get('whatsapp') as string | null) ?? ''
  const email = (formData.get('email') as string | null)?.trim() || null
  const nascimentoRaw = (formData.get('nascimento') as string | null)?.trim() || ''
  const regiaoId = (formData.get('regiaoId') as string | null) || null
  const profissaoId = (formData.get('profissaoId') as string | null) || null
  const genero = (formData.get('genero') as string | null) || null
  const origem = (formData.get('origem') as string | null)?.trim() || null
  const cpf = (formData.get('cpf') as string | null)?.trim() || null
  const telefoneFixo = (formData.get('telefoneFixo') as string | null)?.trim() || null
  const orientacaoSexual = (formData.get('orientacaoSexual') as string | null)?.trim() || null
  const religiao = (formData.get('religiao') as string | null)?.trim() || null
  const escolaridade = (formData.get('escolaridade') as string | null)?.trim() || null
  const bairro = (formData.get('bairro') as string | null)?.trim() || null
  const logradouro = (formData.get('logradouro') as string | null)?.trim() || null
  const numero = (formData.get('numero') as string | null)?.trim() || null
  const complemento = (formData.get('complemento') as string | null)?.trim() || null
  const cep = (formData.get('cep') as string | null)?.trim() || null

  if (!nome) return { ok: false, erro: 'Nome é obrigatório' }
  if (!whatsappRaw) return { ok: false, erro: 'WhatsApp é obrigatório' }

  let nascimento: Date | null = null
  if (nascimentoRaw) {
    nascimento = parseDataBrasileira(nascimentoRaw)
    if (!nascimento) return { ok: false, erro: 'Data de nascimento inválida — use o formato DD/MM/AAAA' }
  }

  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Não autenticado')

  const gabinete = await getGabineteBySlug(slug)
  if (!gabinete) throw new Error('Gabinete não encontrado')

  const role = user.app_metadata?.role as string | undefined
  const usuarioGabinete = await prisma.usuarioGabinete.findUnique({
    where: { userId_gabineteId: { userId: user.id, gabineteId: gabinete.id } },
    select: { papel: true },
  })

  const isAdmin = usuarioGabinete?.papel === 'admin' || role === 'super-admin'
  const isMobilizador = usuarioGabinete?.papel === 'mobilizador'

  if (!isAdmin && !isMobilizador) throw new Error('Sem permissão')

  if (isMobilizador && !isAdmin) {
    // Verificar que a pessoa está na sub-rede do mobilizador (toda a árvore de
    // indicações, não só indicados diretos) ou é o próprio mobilizador
    const mobilizadorPessoa = await prisma.pessoa.findFirst({
      where: { userId: user.id, gabineteId: gabinete.id, isMobilizador: true },
      select: { id: true },
    })
    if (!mobilizadorPessoa) throw new Error('Mobilizador não encontrado')

    const isPropriaPessoa = mobilizadorPessoa.id === pessoaId

    if (!isPropriaPessoa) {
      const idsRede = await coletarSubRedeIds(mobilizadorPessoa.id, gabinete.id)
      if (!idsRede.includes(pessoaId)) throw new Error('Pessoa fora da sua rede')
    }
  }

  const whatsapp = normalizeWhatsApp(whatsappRaw)
  if (!whatsapp) return { ok: false, erro: 'Número de WhatsApp inválido' }

  await prisma.pessoa.updateMany({
    where: { id: pessoaId, gabineteId: gabinete.id },
    data: {
      nome,
      whatsapp,
      email,
      nascimento,
      genero,
      origem,
      regiaoId,
      profissaoId,
      cpf,
      telefoneFixo,
      orientacaoSexual,
      religiao,
      escolaridade,
      bairro,
      logradouro,
      numero,
      complemento,
      cep,
    },
  })

  revalidatePath(`/${slug}/admin/pessoas/${pessoaId}`)
  revalidatePath(`/${slug}/mobilizador/rede`)
  return { ok: true }
}
