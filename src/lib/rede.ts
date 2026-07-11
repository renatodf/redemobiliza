import { prisma } from './prisma'

// Retorna todos os pessoaId da sub-árvore de indicações de um mobilizador —
// indicados diretos E indicados de indicados, recursivamente. Prisma não
// suporta consulta recursiva nativamente, por isso usamos uma CTE em SQL
// bruto. A recursão percorre a estrutura de VinculoRede independente do
// deletedAt de Pessoa — quem consome o resultado (buildWherePessoas) já
// filtra pessoas soft-deletadas na consulta final.
export async function coletarSubRedeIds(pessoaId: string, gabineteId: string): Promise<string[]> {
  const resultado = await prisma.$queryRaw<Array<{ id: string }>>`
    WITH RECURSIVE sub_rede AS (
      SELECT id FROM "Pessoa" WHERE id = ${pessoaId} AND "gabineteId" = ${gabineteId}
      UNION ALL
      SELECT p.id
      FROM "Pessoa" p
      INNER JOIN "VinculoRede" v ON v."pessoaId" = p.id
      INNER JOIN sub_rede sr ON v."indicadoPorId" = sr.id
      WHERE v."gabineteId" = ${gabineteId} AND v."deletedAt" IS NULL
    )
    SELECT id FROM sub_rede WHERE id != ${pessoaId}
  `
  return resultado.map((r) => r.id)
}
