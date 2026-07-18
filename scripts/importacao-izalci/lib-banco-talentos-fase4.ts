import { normalizarNome } from './lib-pessoas-fase3'

export function montarObservacao(whoIndicate: string, observation: string): string | null {
  const partes = [whoIndicate.trim(), observation.trim()].filter((s) => s.length > 0)
  if (partes.length === 0) return null
  return partes.join('; ')
}

export function resolverAreaIdsUnicos(
  roleIds: string[],
  labelsDeCargo: Map<string, string>,
  areaIdPorNome: Map<string, string>
): string[] {
  const resolvidos = roleIds
    .map((id) => labelsDeCargo.get(id))
    .filter((label): label is string => !!label)
    .map((label) => areaIdPorNome.get(normalizarNome(label)))
    .filter((id): id is string => !!id)
  return Array.from(new Set(resolvidos))
}
