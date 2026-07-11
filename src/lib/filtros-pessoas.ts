import { estaNoIntervaloAniversario, calcularIdade } from './aniversario'

export type FiltrosPessoasParams = {
  genero?: string
  regiaoId?: string
  profissaoId?: string
  segmentoId?: string
  aniversario?: 'dia' | 'semana' | 'mes'
  idadeMin?: string
  idadeMax?: string
}

export type WherePessoas = {
  gabineteId: string
  deletedAt: null
  id?: { in: string[] }
  genero?: string
  regiaoId?: string
  profissaoId?: string
  segmentos?: { some: { segmentoId: string } }
  nascimento?: { not: null }
}

export function buildWherePessoas(
  gabineteId: string,
  params: FiltrosPessoasParams,
  idsRede?: string[]
): WherePessoas {
  const where: WherePessoas = {
    gabineteId,
    deletedAt: null,
  }
  if (idsRede) where.id = { in: idsRede }
  if (params.genero) where.genero = params.genero
  if (params.regiaoId) where.regiaoId = params.regiaoId
  if (params.profissaoId) where.profissaoId = params.profissaoId
  if (params.segmentoId) where.segmentos = { some: { segmentoId: params.segmentoId } }
  if (params.aniversario || params.idadeMin || params.idadeMax) {
    where.nascimento = { not: null }
  }
  return where
}

export function aplicarFiltrosPosConsulta<T extends { nascimento: Date | null }>(
  pessoas: T[],
  params: FiltrosPessoasParams,
  hoje: Date
): T[] {
  const temFiltroDeData = Boolean(params.aniversario || params.idadeMin || params.idadeMax)
  return pessoas.filter((p) => {
    if (!p.nascimento) return !temFiltroDeData
    if (params.aniversario && !estaNoIntervaloAniversario(p.nascimento, params.aniversario, hoje)) return false
    const idade = calcularIdade(p.nascimento, hoje)
    if (params.idadeMin && idade < Number(params.idadeMin)) return false
    if (params.idadeMax && idade > Number(params.idadeMax)) return false
    return true
  })
}
