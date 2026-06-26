import { prisma } from '@/lib/prisma'

const REGIOES_DF = [
  'Asa Norte',
  'Asa Sul',
  'Lago Norte',
  'Lago Sul',
  'Cruzeiro',
  'Sudoeste/Octogonal',
  'Noroeste',
  'Guará',
  'Taguatinga',
  'Ceilândia',
  'Samambaia',
  'Recanto das Emas',
  'Riacho Fundo',
  'Riacho Fundo II',
  'Candangolândia',
  'Núcleo Bandeirante',
  'Park Way',
  'Águas Claras',
  'Vicente Pires',
  'Sobradinho',
  'Sobradinho II',
  'Planaltina',
  'Paranoá',
  'São Sebastião',
  'Santa Maria',
  'Gama',
  'Brazlândia',
  'Estrutural',
  'SIA',
  'SCIA/Estrutural',
  'Fercal',
  'Varjão',
  'Jardim Botânico',
  'Itapoã',
  'Arniqueira',
]

export async function seedRegioes(gabineteId: string): Promise<void> {
  await prisma.regiao.createMany({
    data: REGIOES_DF.map((nome) => ({ nome, gabineteId, ativa: true })),
    skipDuplicates: true,
  })
}
