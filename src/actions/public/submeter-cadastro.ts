'use server'

import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { getGabineteBySlug } from '@/lib/gabinete'
import { normalizeWhatsApp } from '@/lib/whatsapp'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { parseDataBrasileira } from '@/lib/data-brasileira'

const TIPOS_FOTO_PERMITIDOS = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
} as const

export async function submeterCadastro(formData: FormData): Promise<{ erro: string } | never> {
  const slug = formData.get('slug') as string
  const segmentoSlugs = formData.getAll('segmentoSlugs') as string[]
  const whatsappRaw = formData.get('whatsapp') as string
  const nome = (formData.get('nome') as string | null) ?? ''
  const email = formData.get('email') as string | null
  const regiaoId = formData.get('regiaoId') as string | null
  const profissaoId = formData.get('profissaoId') as string | null
  const genero = formData.get('genero') as string | null
  const nascimentoRaw = formData.get('nascimento') as string | null
  const mobilizadorToken = (formData.get('mobilizadorToken') as string | null) || undefined
  const sucessoUrl = formData.get('sucessoUrl') as string
  const foto = formData.get('foto') as File | null

  const gabinete = await getGabineteBySlug(slug)
  if (!gabinete || !gabinete.ativo) return { erro: 'Gabinete não encontrado' }

  let tipoFoto: string | undefined
  if (foto && foto.size > 0) {
    tipoFoto = TIPOS_FOTO_PERMITIDOS[foto.type.toLowerCase() as keyof typeof TIPOS_FOTO_PERMITIDOS]
    if (!tipoFoto) return { erro: 'Tipo de imagem não permitido — use JPEG, PNG, WebP ou GIF' }
    if (foto.size > 5 * 1024 * 1024) return { erro: 'Imagem muito grande — máximo 5MB' }
  }

  // Segmento é opcional — o link fixo do mobilizador (sem segmento, só ?m=token)
  // não passa nenhum segmentoSlug. Só é erro se slugs foram informados e nenhum
  // bateu (dado inválido/obsoleto); lista vazia de propósito não é erro.
  const segmentos = segmentoSlugs.length > 0
    ? await prisma.segmento.findMany({
        where: { gabineteId: gabinete.id, slug: { in: segmentoSlugs }, status: 'ativo' },
        select: { id: true },
      })
    : []
  if (segmentoSlugs.length > 0 && segmentos.length === 0) return { erro: 'Segmento não encontrado' }

  const whatsapp = normalizeWhatsApp(whatsappRaw)
  if (!whatsapp) return { erro: 'Número de WhatsApp inválido' }

  let nascimento: Date | null = null
  if (nascimentoRaw?.trim()) {
    nascimento = parseDataBrasileira(nascimentoRaw.trim())
    if (!nascimento) return { erro: 'Data de nascimento inválida — use o formato DD/MM/AAAA' }
  }

  const pessoaExistente = await prisma.pessoa.findUnique({
    where: { gabineteId_whatsapp: { gabineteId: gabinete.id, whatsapp } },
    select: { id: true },
  })

  // Nome só é obrigatório para cadastro novo — a etapa de confirmação (pessoa
  // já cadastrada, só registrando presença) envia nome vazio de propósito,
  // já que não pede esse dado de novo.
  if (!pessoaExistente && !nome.trim()) return { erro: 'Nome é obrigatório' }

  let mobilizadorId: string | null = null
  if (mobilizadorToken) {
    const mob = await prisma.pessoa.findFirst({
      where: { gabineteId: gabinete.id, tokenMobilizador: mobilizadorToken, isMobilizador: true },
      select: { id: true },
    })
    mobilizadorId = mob?.id ?? null
  }

  let pessoaId: string

  if (pessoaExistente) {
    // Pessoa já existe — apenas registra a participação, NÃO altera dados do perfil
    // sem autenticação do titular
    pessoaId = pessoaExistente.id
  } else {
    const criada = await prisma.pessoa.create({
      data: {
        nome: nome.trim(),
        whatsapp,
        email: email?.trim() || null,
        nascimento,
        genero: genero || null,
        regiaoId: regiaoId || null,
        profissaoId: profissaoId || null,
        gabineteId: gabinete.id,
        isColaborador: false,
      },
    })
    pessoaId = criada.id
  }

  if (foto && foto.size > 0 && tipoFoto) {
    const path = `${gabinete.id}/pessoas/${pessoaId}/foto.${tipoFoto}`
    const buffer = Buffer.from(await foto.arrayBuffer())
    const { error } = await getSupabaseAdmin().storage
      .from('gabinete-assets')
      .upload(path, buffer, { upsert: true, contentType: foto.type })

    if (!error) {
      const { data: { publicUrl } } = getSupabaseAdmin().storage.from('gabinete-assets').getPublicUrl(path)
      await prisma.pessoa.update({
        where: { id: pessoaId },
        data: { fotoUrl: `${publicUrl}?v=${Date.now()}` },
      })
    } else {
      console.error('[submeterCadastro] storage error:', error)
    }
  }

  for (const segmento of segmentos) {
    await prisma.pessoaSegmento.upsert({
      where: { pessoaId_segmentoId: { pessoaId, segmentoId: segmento.id } },
      create: { pessoaId, segmentoId: segmento.id },
      update: {},
    })
  }

  // Cria vínculo de rede apenas se ainda não existir (NULL != NULL no SQL)
  const vinculoExistente = await prisma.vinculoRede.findFirst({
    where: { gabineteId: gabinete.id, pessoaId, indicadoPorId: mobilizadorId },
  })
  if (!vinculoExistente) {
    await prisma.vinculoRede.create({
      data: {
        gabineteId: gabinete.id,
        pessoaId,
        indicadoPorId: mobilizadorId,
        nivel: mobilizadorId ? 2 : 1,
      },
    })
  }

  redirect(caminhoRelativoSeguro(sucessoUrl, `/${slug}`))
}

// sucessoUrl vem de uma Server Action chamada por Client Component — um
// atacante pode invocar submeterCadastro diretamente (bypassando a UI) com
// qualquer valor. Checar a string crua (ex: startsWith('/')) não é suficiente:
// navegadores normalizam barra invertida e caracteres de controle antes de
// resolver a URL (ex: "/\evil.com" e "/\t/evil.com" viram "//evil.com" —
// origem diferente), então usamos o próprio parser de URL (mesma
// implementação WHATWG que o navegador usa) contra uma origem fixa. Só a
// checagem de origem não basta: um valor como "http://localhost.invalid//evil.com"
// bate com a origem fixa mas resolve num pathname que começa com "//"
// (quirk do parser: segmento vazio após a autoridade vira parte do path) —
// "//evil.com" sozinho já é uma URL relativa a protocolo (protocol-relative),
// então também rejeitamos qualquer pathname resolvido que comece com "//".
function caminhoRelativoSeguro(valor: string, fallback: string): string {
  const origemFixa = 'http://localhost.invalid'
  try {
    const resolvida = new URL(valor, origemFixa)
    if (resolvida.origin !== origemFixa) return fallback
    if (resolvida.pathname.startsWith('//')) return fallback
    return resolvida.pathname + resolvida.search + resolvida.hash
  } catch {
    return fallback
  }
}
