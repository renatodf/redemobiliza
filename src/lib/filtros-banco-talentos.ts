export type FiltrosBancoTalentosParams = {
  areaIds?: string[]
  prioridade?: string
  isPcd?: 'sim' | 'nao'
  regiaoId?: string
  nome?: string
}

export type WhereBancoTalentos = {
  colocado: false
  curriculoUrl: { not: null }
  pessoa: { gabineteId: string; deletedAt: null; regiaoId?: string; nome?: { contains: string; mode: 'insensitive' } }
  prioridade?: number
  isPcd?: boolean
  areas?: { some: { areaColocacaoId: { in: string[] } } }
}

export function buildWhereBancoTalentos(
  gabineteId: string,
  params: FiltrosBancoTalentosParams
): WhereBancoTalentos {
  const where: WhereBancoTalentos = {
    colocado: false,
    curriculoUrl: { not: null },
    pessoa: { gabineteId, deletedAt: null },
  }
  if (params.regiaoId) where.pessoa.regiaoId = params.regiaoId
  if (params.nome && params.nome.trim()) where.pessoa.nome = { contains: params.nome.trim(), mode: 'insensitive' }
  if (params.prioridade) where.prioridade = Number(params.prioridade)
  if (params.isPcd === 'sim') where.isPcd = true
  else if (params.isPcd === 'nao') where.isPcd = false
  if (params.areaIds && params.areaIds.length > 0) {
    where.areas = { some: { areaColocacaoId: { in: params.areaIds } } }
  }
  return where
}
