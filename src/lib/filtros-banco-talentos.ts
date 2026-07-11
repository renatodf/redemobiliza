export type FiltrosBancoTalentosParams = {
  areaIds?: string[]
  prioridade?: string
  isPcd?: 'sim' | 'nao'
  regiaoId?: string
}

export type WhereBancoTalentos = {
  colocado: false
  curriculoUrl: { not: null }
  pessoa: { gabineteId: string; regiaoId?: string }
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
    pessoa: { gabineteId },
  }
  if (params.regiaoId) where.pessoa.regiaoId = params.regiaoId
  if (params.prioridade) where.prioridade = Number(params.prioridade)
  if (params.isPcd === 'sim') where.isPcd = true
  else if (params.isPcd === 'nao') where.isPcd = false
  if (params.areaIds && params.areaIds.length > 0) {
    where.areas = { some: { areaColocacaoId: { in: params.areaIds } } }
  }
  return where
}
