import { prisma } from '@/lib/prisma'

const AREAS_PADRAO = [
  'Saúde',
  'Educação',
  'Habitação',
  'Social',
  'Segurança',
  'Infraestrutura',
  'Empreendedorismo',
]

export async function seedAreasDemanda(gabineteId: string): Promise<void> {
  await prisma.areaDemanda.createMany({
    data: AREAS_PADRAO.map((nome) => ({ nome, gabineteId })),
    skipDuplicates: true,
  })
}
