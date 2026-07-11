import { prisma } from './prisma'

// Idempotente — mesmo padrão de criarAreaColocacao (findFirst + create,
// sem transação/lock). Uma corrida rara poderia criar duas áreas
// "Emprego"; risco aceito, mesmo já assumido em criarAreaColocacao.
export async function garantirAreaEmprego(gabineteId: string): Promise<string> {
  const existente = await prisma.areaDemanda.findFirst({
    where: { gabineteId, nome: 'Emprego' },
    select: { id: true },
  })
  if (existente) return existente.id

  const criada = await prisma.areaDemanda.create({
    data: { gabineteId, nome: 'Emprego' },
    select: { id: true },
  })
  return criada.id
}
