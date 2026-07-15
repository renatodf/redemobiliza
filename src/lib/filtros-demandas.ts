export type FiltrosDemandasParams = {
  areaId?: string
  status?: 'atendida' | 'nao_atendida' | 'pendente'
  regiaoId?: string
  dataInicio?: string
  dataFim?: string
}

export type WhereDemandas = {
  gabineteId: string
  deletedAt: null
  responsavelId?: string
  areaId?: string
  status?: string | { in: string[] }
  solicitante?: { regiaoId: string }
  criadoEm?: { gte?: Date; lte?: Date }
}

export function buildWhereDemandas(
  gabineteId: string,
  params: FiltrosDemandasParams,
  responsavelId?: string
): WhereDemandas {
  const where: WhereDemandas = {
    gabineteId,
    deletedAt: null,
  }
  if (responsavelId) where.responsavelId = responsavelId
  if (params.areaId) where.areaId = params.areaId
  if (params.status === 'atendida' || params.status === 'nao_atendida') {
    where.status = params.status
  } else if (params.status === 'pendente') {
    where.status = { in: ['aberta', 'expirada'] }
  }
  if (params.regiaoId) where.solicitante = { regiaoId: params.regiaoId }
  if (params.dataInicio || params.dataFim) {
    where.criadoEm = {}
    if (params.dataInicio) where.criadoEm.gte = new Date(`${params.dataInicio}T00:00:00`)
    if (params.dataFim) where.criadoEm.lte = new Date(`${params.dataFim}T23:59:59.999`)
  }
  return where
}
