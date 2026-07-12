// src/app/[slug]/mobilizador/rede/page.tsx
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { prisma } from '@/lib/prisma'
import { getGabineteBySlug } from '@/lib/gabinete'
import { mapPapelParaTipoConta } from '@/lib/tipo-conta'
import UsuariosTable, { type UsuarioRow } from '../../admin/pessoas/UsuariosTable'

function buildOrderBy(sort?: string, order?: string) {
  if (sort === 'nome') {
    return { nome: (order === 'desc' ? 'desc' : 'asc') as 'asc' | 'desc' }
  }
  return { criadoEm: 'desc' as const }
}

export default async function MobilizadorRedePage({
  params,
  searchParams,
}: {
  params: { slug: string }
  searchParams: { sort?: string; order?: string; rede?: string; path?: string }
}) {
  const gabinete = await getGabineteBySlug(params.slug)
  if (!gabinete) notFound()

  const cookieStore = cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } }
  )
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) notFound()

  const pessoa = await prisma.pessoa.findFirst({
    where: { userId: session.user.id, gabineteId: gabinete.id, isMobilizador: true },
    select: { id: true, nome: true, tokenMobilizador: true },
  })
  if (!pessoa || !pessoa.tokenMobilizador) notFound()

  const { sort, order, rede, path } = searchParams

  // Verifica se ?rede pertence à sub-árvore do mobilizador logado
  if (rede && rede !== pessoa.id) {
    let currentId: string | null = rede
    let authorized = false
    const visited = new Set<string>()
    while (currentId && !visited.has(currentId)) {
      visited.add(currentId)
      const vinculo: { indicadoPorId: string | null } | null = await prisma.vinculoRede.findFirst({
        where: { pessoaId: currentId, gabineteId: gabinete.id, deletedAt: null },
        select: { indicadoPorId: true },
      })
      const parentId: string | null = vinculo?.indicadoPorId ?? null
      if (parentId === pessoa.id) { authorized = true; break }
      currentId = parentId
    }
    if (!authorized) notFound()
  }

  const orderBy = buildOrderBy(sort, order)
  const pathIds = path ? path.split(',').filter(Boolean) : []
  const indicadorId = rede ?? pessoa.id

  const vinculos = await prisma.vinculoRede.findMany({
    where: { indicadoPorId: indicadorId, gabineteId: gabinete.id, deletedAt: null },
    select: { pessoaId: true },
  })
  const ids = vinculos.map((v) => v.pessoaId)

  const pessoasRaw = ids.length > 0
    ? await prisma.pessoa.findMany({
        where: { id: { in: ids }, gabineteId: gabinete.id, deletedAt: null },
        orderBy,
        take: 50,
        select: {
          id: true,
          nome: true,
          email: true,
          fotoUrl: true,
          userId: true,
          segmentos: { select: { segmento: { select: { id: true, nome: true } } } },
        },
      })
    : []

  const userIds = pessoasRaw.map((p) => p.userId).filter((id): id is string => !!id)
  const papeis = userIds.length
    ? await prisma.usuarioGabinete.findMany({
        where: { userId: { in: userIds }, gabineteId: gabinete.id },
        select: { userId: true, papel: true },
      })
    : []
  const papelPorUserId = new Map(papeis.map((p) => [p.userId, p.papel]))

  const usuariosRede: UsuarioRow[] = pessoasRaw.map((p) => ({
    id: p.id,
    nome: p.nome,
    email: p.email,
    fotoUrl: p.fotoUrl,
    tipoConta: mapPapelParaTipoConta(p.userId ? papelPorUserId.get(p.userId) : null),
    segmentos: p.segmentos.map((s) => s.segmento),
  }))

  const breadcrumbPessoas = pathIds.length > 0
    ? await prisma.pessoa.findMany({
        where: { id: { in: pathIds }, gabineteId: gabinete.id, deletedAt: null },
        select: { id: true, nome: true },
      })
    : []
  const breadcrumb = pathIds
    .map((id) => breadcrumbPessoas.find((p) => p.id === id))
    .filter(Boolean) as { id: string; nome: string }[]

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Olá, {pessoa.nome}!</h1>
        <p className="text-sm text-gray-600 mt-1">
          Acompanhe aqui as pessoas cadastradas na sua rede.
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-gray-900">Minha Rede</h2>

        {breadcrumb.length > 0 && (
          <nav className="text-sm text-gray-500 flex items-center gap-1 flex-wrap">
            <Link href={`/${params.slug}/mobilizador/rede`} className="hover:text-gray-900">
              Minha Rede
            </Link>
            {breadcrumb.map((item, i) => {
              const isLast = i === breadcrumb.length - 1
              const crumbPath = pathIds.slice(0, i + 1).join(',')
              return (
                <span key={item.id} className="flex items-center gap-1">
                  <span>›</span>
                  {isLast ? (
                    <span className="text-gray-900 font-medium">Rede de {item.nome}</span>
                  ) : (
                    <Link
                      href={`/${params.slug}/mobilizador/rede?rede=${item.id}&path=${crumbPath}`}
                      className="hover:text-gray-900"
                    >
                      Rede de {item.nome}
                    </Link>
                  )}
                </span>
              )
            })}
          </nav>
        )}

        <div className="bg-white rounded-lg shadow-sm overflow-x-auto">
          <UsuariosTable
            slug={params.slug}
            usuarios={usuariosRede}
            corPrimaria={gabinete.corPrimaria}
            baseHref={`/${params.slug}/mobilizador/pessoas`}
            somenteLeitura
          />
        </div>
      </section>
    </div>
  )
}
