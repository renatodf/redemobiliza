import { prisma } from '@/lib/prisma'

const PROFISSOES_COMUNS = [
  'Servidor Público',
  'Aposentado(a)',
  'Comerciante',
  'Autônomo(a)',
  'Professor(a)',
  'Estudante',
  'Profissional de Saúde',
  'Advogado(a)',
  'Engenheiro(a)',
  'Agricultor(a)',
  'Trabalhador(a) da Construção Civil',
  'Doméstico(a)',
  'Motorista / Transporte',
  'Empresário(a)',
  'Profissional de Segurança',
  'Comunicador(a) / Jornalista',
  'Outros',
]

export async function seedProfissoes(gabineteId: string): Promise<void> {
  await prisma.profissao.createMany({
    data: PROFISSOES_COMUNS.map((nome) => ({ nome, gabineteId, ativa: true })),
    skipDuplicates: true,
  })
}
