import { prisma } from '@/lib/prisma'

const AREAS_PADRAO = [
  'Serviços Gerais',
  'Administrativo',
  'Saúde',
  'Educação',
  'Segurança',
  'Tecnologia',
  'Comércio',
  'Construção Civil',
  'Transporte',
  'Alimentação',
]

export async function seedAreasColocacao(gabineteId: string): Promise<void> {
  await prisma.areaColocacao.createMany({
    data: AREAS_PADRAO.map((nome) => ({ nome, gabineteId })),
    skipDuplicates: true,
  })
}
