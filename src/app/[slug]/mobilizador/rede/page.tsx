import { notFound } from 'next/navigation'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { prisma } from '@/lib/prisma'
import { getGabineteBySlug } from '@/lib/gabinete'
import SortableHeader from '@/components/SortableHeader'

const pessoaSelect = {
  id: true,
  nome: true,
  whatsapp: true,
  isColaborador: true,
  isMobilizador: true,
  regiao: { select: { nome: true } },
  _count: { select: { redesComoIndicador: { where: { deletedAt: null } } } },
  redesComoIndicador: {
    where: { deletedAt: null },
    select: {
      pessoa: {
        select: {
          _count: { select: { redesComoIndicador: { where: { deletedAt: null } } } },
        },
      },
    },
  },
} as const

function buildOrderBy(sort?: string, order?: string) {
  if (sort === 'nome') {
    return { nome: (order === 'desc' ? 'desc' : 'asc') as 'asc' | 'desc' }
  }
  return { criadoEm: 'desc' as const }
}

function buildRedeUrl(slug: string, pessoaId: string, currentPathIds: string[]): string {
  const newPath = [...currentPathIds, pessoaId].join(',')
  return `/${slug}/mobilizador/rede?rede=${pessoaId}&path=${newPath}`
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
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) notFound()

  const mobilizadorPessoa = await prisma.pessoa.findFirst({
    where: { userId: user.id, gabineteId: gabinete.id, isMobilizador: true },
    select: { id: true, nome: true },
  })
  if (!mobilizadorPessoa) notFound()

  const { sort, order, rede, path } = searchParams

  // Verifica se ?rede pertence à sub-árvore do mobilizador logado
  if (rede && rede !== mobilizadorPessoa.id) {
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
      if (parentId === mobilizadorPessoa.id) { authorized = true; break }
      currentId = parentId
    }
    if (!authorized) notFound()
  }

  const orderBy = buildOrderBy(sort, order)
  const pathIds = path ? path.split(',').filter(Boolean) : []

  // ID do mobilizador atual para a rede raiz
  const indicadorId = rede ?? mobilizadorPessoa.id

  const vinculos = await prisma.vinculoRede.findMany({
    where: { indicadoPorId: indicadorId, gabineteId: gabinete.id, deletedAt: null },
    select: { pessoaId: true },
  })
  const ids = vinculos.map((v) => v.pessoaId)

  const pessoasRaw =
    ids.length > 0
      ? await prisma.pessoa.findMany({
          where: { id: { in: ids }, gabineteId: gabinete.id, deletedAt: null },
          orderBy,
          take: 50,
          select: pessoaSelect,
        })
      : []

  const pessoas = pessoasRaw.map((p) => ({
    ...p,
    totalRedes: p._count.redesComoIndicador,
    totalCadastros: p.redesComoIndicador.reduce(
      (acc, v) => acc + v.pessoa._count.redesComoIndicador,
      0
    ),
  }))

  // Breadcrumb — a raiz é sempre "Minha Rede"
  const breadcrumbPessoas =
    pathIds.length > 0
      ? await prisma.pessoa.findMany({
          where: { id: { in: pathIds }, gabineteId: gabinete.id, deletedAt: null },
          select: { id: true, nome: true },
        })
      : []

  const breadcrumb = pathIds
    .map((id) => breadcrumbPessoas.find((p) => p.id === id))
    .filter(Boolean) as { id: string; nome: string }[]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Minha Rede</h1>
        <Link href={`/${params.slug}/mobilizador`} className="text-sm text-gray-500 hover:underline">
          ← Voltar
        </Link>
      </div>

      {/* Breadcrumb */}
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
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3">
                <SortableHeader label="Nome" field="nome" />
              </th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">WhatsApp</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Região</th>
              <th className="text-center px-4 py-3 font-medium text-gray-600">Redes</th>
              <th className="text-center px-4 py-3 font-medium text-gray-600">Cadastros nas redes</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Colaborador</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Mobilizador</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {pessoas.map((p) => {
              const redeUrl = buildRedeUrl(params.slug, p.id, pathIds)
              return (
                <tr key={p.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <Link
                      href={`/${params.slug}/mobilizador/pessoas/${p.id}`}
                      className="text-blue-600 hover:underline font-medium"
                    >
                      {p.nome}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{p.whatsapp ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{p.regiao?.nome ?? '—'}</td>
                  <td className="px-4 py-3 text-center">
                    {p.totalRedes === 0 ? (
                      <span className="text-gray-400">—</span>
                    ) : (
                      <Link href={redeUrl} className="text-blue-600 hover:underline font-medium">
                        {p.totalRedes}
                      </Link>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {p.totalCadastros === 0 ? (
                      <span className="text-gray-400">—</span>
                    ) : (
                      <Link href={redeUrl} className="text-blue-600 hover:underline font-medium">
                        {p.totalCadastros}
                      </Link>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {p.isColaborador && (
                      <span className="inline-block bg-green-100 text-green-800 text-xs px-2 py-0.5 rounded-full">
                        Colaborador
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {p.isMobilizador && (
                      <Link
                        href={redeUrl}
                        className="inline-block bg-purple-100 text-purple-800 text-xs px-2 py-0.5 rounded-full hover:bg-purple-200"
                      >
                        Mobilizador
                      </Link>
                    )}
                  </td>
                </tr>
              )
            })}
            {pessoas.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-gray-500">
                  Nenhuma pessoa nesta rede
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
