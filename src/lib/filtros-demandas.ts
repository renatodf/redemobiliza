export type FiltrosDemandasParams = {
  areaId?: string
  status?: 'atendida' | 'nao_atendida' | 'pendente'
  regiaoId?: string
}

export type WhereDemandas = {
  gabineteId: string
  deletedAt: null
  responsavelId?: string
  areaId?: string
  status?: string | { in: string[] }
  solicitante?: { regiaoId: string }
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
  return where
}
