export const CAMPOS_FILTRO_PESSOAS = [
  'regiaoId',
  'genero',
  'profissaoId',
  'segmentoId',
  'escolaridade',
  'religiao',
  'redeDeId',
] as const

export function temFiltroAtivo(searchParams: Record<string, string | undefined>): boolean {
  return CAMPOS_FILTRO_PESSOAS.some((campo) => Boolean(searchParams[campo]))
}

export const CAMPOS_FILTRO_DEMANDAS = ['areaId', 'status', 'regiaoId', 'dataInicio', 'dataFim'] as const
