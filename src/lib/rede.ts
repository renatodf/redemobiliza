import { prisma } from './prisma'

// Retorna todos os pessoaId da sub-árvore de indicações de um mobilizador —
// indicados diretos E indicados de indicados, recursivamente. Prisma não
// suporta consulta recursiva nativamente, por isso usamos uma CTE em SQL
// bruto. A recursão percorre a estrutura de VinculoRede independente do
// deletedAt de Pessoa — quem consome o resultado (buildWherePessoas) já
// filtra pessoas soft-deletadas na consulta final.
//
// Proteção contra ciclo: a CTE acumula o `caminho` (array de ids) percorrido
// em cada ramificação e recusa descer para um nó já presente nesse caminho.
// Isso não é defesa contra dado corrompido hipotético — um ciclo em
// VinculoRede é alcançável pelo fluxo público normal: pessoa X se cadastra
// pelo link de Y, X depois vira mobilizador, e mais tarde Y se cadastra pelo
// link de X (reencontro de link em uso real), formando X→Y→X. Sem essa
// proteção a CTE recursiva com UNION ALL entraria em loop infinito e
// travaria a query — como o DATABASE_URL usa um pooler Supabase
// compartilhado entre tenants, isso poderia degradar o app para outros
// gabinetes, não só travar a tela deste mobilizador. O mesmo grafo já é
// percorrido com um `visited = new Set()` em
// src/app/[slug]/mobilizador/page.tsx (em sentido inverso, subindo); aqui é
// o equivalente para uma CTE recursiva em SQL.
export async function coletarSubRedeIds(pessoaId: string, gabineteId: string): Promise<string[]> {
  const resultado = await prisma.$queryRaw<Array<{ id: string }>>`
    WITH RECURSIVE sub_rede AS (
      SELECT id, ARRAY[id] AS caminho
      FROM "Pessoa"
      WHERE id = ${pessoaId} AND "gabineteId" = ${gabineteId}
      UNION ALL
      SELECT p.id, sr.caminho || p.id
      FROM "Pessoa" p
      INNER JOIN "VinculoRede" v ON v."pessoaId" = p.id
      INNER JOIN sub_rede sr ON v."indicadoPorId" = sr.id
      WHERE v."gabineteId" = ${gabineteId}
        AND v."deletedAt" IS NULL
        AND p."gabineteId" = ${gabineteId}
        AND NOT (p.id = ANY(sr.caminho))
    )
    SELECT id FROM sub_rede WHERE id != ${pessoaId}
  `
  return resultado.map((r) => r.id)
}

// Resolve o parâmetro `redeDeId` (vindo da URL) para a lista de ids de pessoa
// que ele representa: `undefined` quando nenhum filtro de rede está ativo,
// a Rede Raiz (pessoas sem indicador) quando `redeDeId === 'raiz'`, ou a
// sub-rede completa e recursiva de um mobilizador específico nos demais casos.
export async function resolverIdsRedeDe(
  redeDeId: string | undefined,
  gabineteId: string
): Promise<string[] | undefined> {
  if (!redeDeId) return undefined
  if (redeDeId === 'raiz') {
    const vinculos = await prisma.vinculoRede.findMany({
      where: { indicadoPorId: null, gabineteId, deletedAt: null },
      select: { pessoaId: true },
    })
    return vinculos.map((v) => v.pessoaId)
  }
  return coletarSubRedeIds(redeDeId, gabineteId)
}
