export const DEV_IDS = new Set(['67605433e30de14b89780451', '6063a6ccc3e599000464eaa7'])

export function resolverMongoIdIndicador(createdById: string | null, mongoIdsCanonicos: Set<string>): string | null {
  if (!createdById) return null
  if (DEV_IDS.has(createdById)) return null
  if (!mongoIdsCanonicos.has(createdById)) return null
  return createdById
}

export function calcularNiveis(indicadorPorMongoId: Map<string, string | null>): Map<string, number> {
  const niveis = new Map<string, number>()
  let restantes = new Set(indicadorPorMongoId.keys())

  let mudou = true
  while (mudou && restantes.size > 0) {
    mudou = false
    for (const mongoId of Array.from(restantes)) {
      const indicador = indicadorPorMongoId.get(mongoId) ?? null
      if (indicador === null) {
        niveis.set(mongoId, 0)
        restantes.delete(mongoId)
        mudou = true
      } else if (niveis.has(indicador)) {
        niveis.set(mongoId, (niveis.get(indicador) as number) + 1)
        restantes.delete(mongoId)
        mudou = true
      }
    }
  }

  // Sobra só acontece se o indicador referenciado não está nas chaves do
  // mapa de entrada — não deveria ocorrer dado como a Task 2 constrói o
  // grafo (todo indicador não-nulo é sempre um mongoId canônico, que por
  // sua vez está entre as chaves), mas nível 0 é o fallback seguro caso
  // aconteça, em vez de deixar a pessoa sem nível nenhum.
  for (const mongoId of Array.from(restantes)) {
    niveis.set(mongoId, 0)
  }

  return niveis
}
