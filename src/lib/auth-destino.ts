import { prisma } from '@/lib/prisma'

export type DestinoAcesso =
  | { tipo: 'super-admin' }
  | { tipo: 'admin'; slug: string; nome: string }
  | { tipo: 'mobilizador'; slug: string; nome: string }

export async function listarDestinosAcesso(
  userId: string,
  isSuperAdminRole: boolean
): Promise<DestinoAcesso[]> {
  const destinos: DestinoAcesso[] = []
  if (isSuperAdminRole) destinos.push({ tipo: 'super-admin' })

  const vinculos = await prisma.usuarioGabinete.findMany({
    where: { userId, papel: { in: ['admin', 'mobilizador'] } },
    include: { gabinete: { select: { slug: true, nome: true, ativo: true } } },
  })

  for (const v of vinculos) {
    if (!v.gabinete.ativo) continue
    if (v.papel === 'admin') {
      destinos.push({ tipo: 'admin', slug: v.gabinete.slug, nome: v.gabinete.nome })
    } else if (v.papel === 'mobilizador') {
      destinos.push({ tipo: 'mobilizador', slug: v.gabinete.slug, nome: v.gabinete.nome })
    }
  }

  return destinos
}

export function caminhoDestino(destino: DestinoAcesso): string {
  if (destino.tipo === 'super-admin') return '/super-admin/'
  if (destino.tipo === 'admin') return `/${destino.slug}/admin/`
  return `/${destino.slug}/mobilizador/`
}
