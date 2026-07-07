'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { assertAdminAccess } from '@/lib/assert-admin-access'
import { getSupabaseAdmin } from '@/lib/supabase/admin'

const TIPOS_PERMITIDOS: Record<string, string> = {
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'image/jpeg': 'jpg',
  'image/png': 'png',
}

export async function salvarBancoTalentos(
  _prevState: { erro?: string; ok?: boolean },
  formData: FormData
): Promise<{ erro?: string; ok?: boolean }> {
  const slug = formData.get('slug') as string
  const pessoaId = formData.get('pessoaId') as string
  const areaIds = formData.getAll('areaIds') as string[]
  const prioridade = Number(formData.get('prioridade') ?? 3)
  const isPcd = formData.get('isPcd') === 'on'
  const observacao = ((formData.get('observacao') as string | null) ?? '').trim() || null
  const colocado = formData.get('colocado') === 'on'
  const curriculo = formData.get('curriculo') as File | null

  if (areaIds.length === 0) return { erro: 'Selecione ao menos uma área.' }
  if (![1, 2, 3].includes(prioridade)) return { erro: 'Prioridade inválida.' }

  const { gabinete } = await assertAdminAccess(slug)

  const pessoa = await prisma.pessoa.findFirst({
    where: { id: pessoaId, gabineteId: gabinete.id, deletedAt: null },
    select: { id: true },
  })
  if (!pessoa) return { erro: 'Pessoa não encontrada.' }

  const areasValidas = await prisma.areaColocacao.findMany({
    where: { id: { in: areaIds }, gabineteId: gabinete.id },
    select: { id: true },
  })
  if (areasValidas.length !== areaIds.length) return { erro: 'Área inválida selecionada.' }

  let curriculoUrl: string | undefined
  if (curriculo && curriculo.size > 0) {
    const tipo = TIPOS_PERMITIDOS[curriculo.type.toLowerCase()]
    if (!tipo) return { erro: 'Formato de arquivo não permitido — use PDF, Word (doc/docx), JPG ou PNG.' }
    if (curriculo.size > 10 * 1024 * 1024) return { erro: 'Arquivo muito grande — máximo 10MB.' }

    const path = `${gabinete.id}/pessoas/${pessoaId}/curriculo.${tipo}`
    const buffer = Buffer.from(await curriculo.arrayBuffer())
    const { error } = await getSupabaseAdmin().storage
      .from('gabinete-assets')
      .upload(path, buffer, { upsert: true, contentType: curriculo.type })
    if (error) return { erro: `Erro no upload do currículo: ${error.message}` }

    const { data: { publicUrl } } = getSupabaseAdmin().storage.from('gabinete-assets').getPublicUrl(path)
    curriculoUrl = publicUrl
  }

  await prisma.$transaction(async (tx) => {
    const bancoTalentos = await tx.bancoTalentos.upsert({
      where: { pessoaId },
      create: {
        pessoaId,
        prioridade,
        isPcd,
        observacao,
        colocado,
        ...(curriculoUrl ? { curriculoUrl } : {}),
      },
      update: {
        prioridade,
        isPcd,
        observacao,
        colocado,
        ...(curriculoUrl ? { curriculoUrl } : {}),
      },
    })

    await tx.bancoTalentosArea.deleteMany({ where: { bancoTalentosId: bancoTalentos.id } })
    await tx.bancoTalentosArea.createMany({
      data: areaIds.map((areaColocacaoId) => ({ bancoTalentosId: bancoTalentos.id, areaColocacaoId })),
    })
  })

  revalidatePath(`/${slug}/admin/pessoas/${pessoaId}`)
  return { ok: true }
}
