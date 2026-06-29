import { notFound } from 'next/navigation'
import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { getGabineteBySlug } from '@/lib/gabinete'
import { cadastrarPessoa } from '@/actions/admin/cadastrar-pessoa'
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
  return `/${slug}/admin/pessoas?rede=${pessoaId}&path=${newPath}`
}

export default async function PessoasPage({
  params,
  searchParams,
}: {
  params: { slug: string }
  searchParams: { q?: string; sort?: string; order?: string; rede?: string; path?: string }
}) {
  const gabinete = await getGabineteBySlug(params.slug)
  if (!gabinete) notFound()

  const q = searchParams.q?.trim() ?? ''
  const { sort, order, rede, path } = searchParams
  const orderBy = buildOrderBy(sort, order)
  const pathIds = path ? path.split(',').filter(Boolean) : []

  const searchFilter = q
    ? {
        OR: [
          { nome: { contains: q, mode: 'insensitive' as const } },
          { whatsapp: { contains: q } },
          { email: { contains: q, mode: 'insensitive' as const } },
        ],
      }
    : {}

  // Busca pessoas (cascata ou todas)
  let pessoasRaw: Awaited<ReturnType<typeof prisma.pessoa.findMany<{ select: typeof pessoaSelect }>>> = []

  if (rede) {
    const vinculos = await prisma.vinculoRede.findMany({
      where: { indicadoPorId: rede, gabineteId: gabinete.id, deletedAt: null },
      select: { pessoaId: true },
    })
    const ids = vinculos.map((v) => v.pessoaId)
    if (ids.length > 0) {
      pessoasRaw = await prisma.pessoa.findMany({
        where: { id: { in: ids }, gabineteId: gabinete.id, deletedAt: null, ...searchFilter },
        orderBy,
        take: 50,
        select: pessoaSelect,
      })
    }
  } else {
    pessoasRaw = await prisma.pessoa.findMany({
      where: { gabineteId: gabinete.id, deletedAt: null, ...searchFilter },
      orderBy,
      take: 50,
      select: pessoaSelect,
    })
  }

  const pessoas = pessoasRaw.map((p) => ({
    ...p,
    totalRedes: p._count.redesComoIndicador,
    totalCadastros: p.redesComoIndicador.reduce(
      (acc, v) => acc + v.pessoa._count.redesComoIndicador,
      0
    ),
  }))

  // Breadcrumb
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

  // Formulário de cadastro
  const [regioes, profissoes] = await Promise.all([
    prisma.regiao.findMany({
      where: { gabineteId: gabinete.id, ativa: true },
      orderBy: { nome: 'asc' },
      select: { id: true, nome: true },
    }),
    prisma.profissao.findMany({
      where: { gabineteId: gabinete.id, ativa: true },
      orderBy: { nome: 'asc' },
      select: { id: true, nome: true },
    }),
  ])

  return (
    <div className="max-w-5xl mx-auto py-8 px-4 space-y-6">
      <h1 className="text-2xl font-bold">Pessoas</h1>

      {/* Breadcrumb */}
      {breadcrumb.length > 0 && (
        <nav className="text-sm text-gray-500 flex items-center gap-1 flex-wrap">
          <Link href={`/${params.slug}/admin/pessoas`} className="hover:text-gray-900">
            Pessoas
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
                    href={`/${params.slug}/admin/pessoas?rede=${item.id}&path=${crumbPath}`}
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

      <form method="GET" className="flex gap-2">
        {rede && <input type="hidden" name="rede" value={rede} />}
        {path && <input type="hidden" name="path" value={path} />}
        <input
          name="q"
          defaultValue={q}
          placeholder="Buscar por nome, WhatsApp ou e-mail..."
          className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm"
        />
        <button type="submit" className="bg-gray-600 text-white px-4 py-2 rounded-md text-sm font-medium">
          Buscar
        </button>
      </form>

      {!rede && (
        <details className="bg-white rounded-lg shadow-sm">
          <summary className="px-4 py-3 text-sm font-medium cursor-pointer">
            + Cadastrar pessoa manualmente
          </summary>
          <form action={cadastrarPessoa} className="px-4 pb-4 space-y-3">
            <input type="hidden" name="slug" value={params.slug} />
            <div>
              <label className="block text-sm font-medium text-gray-700">Nome *</label>
              <input
                name="nome"
                required
                className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700">WhatsApp *</label>
                <input
                  name="whatsapp"
                  required
                  placeholder="(61) 9 9999-9999"
                  className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">E-mail</label>
                <input
                  name="email"
                  type="email"
                  className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700">Região</label>
                <select
                  name="regiaoId"
                  className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                >
                  <option value="">Selecionar...</option>
                  {regioes.map((r) => (
                    <option key={r.id} value={r.id}>{r.nome}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Profissão</label>
                <select
                  name="profissaoId"
                  className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                >
                  <option value="">Selecionar...</option>
                  {profissoes.map((p) => (
                    <option key={p.id} value={p.id}>{p.nome}</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Gênero</label>
              <select
                name="genero"
                className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              >
                <option value="">Prefiro não informar</option>
                <option value="masculino">Masculino</option>
                <option value="feminino">Feminino</option>
                <option value="outro">Outro</option>
              </select>
            </div>
            <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium">
              Cadastrar
            </button>
          </form>
        </details>
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
                      href={`/${params.slug}/admin/pessoas/${p.id}`}
                      className="text-blue-600 hover:underline font-medium"
                    >
                      {p.nome}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{p.whatsapp}</td>
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
                  Nenhuma pessoa encontrada
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
