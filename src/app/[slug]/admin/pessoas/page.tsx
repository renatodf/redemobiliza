import { notFound } from 'next/navigation'
import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { getGabineteBySlug } from '@/lib/gabinete'
import Pagination from '@/components/admin/Pagination'
import { paginar } from '@/lib/paginacao'
import { mapPapelParaTipoConta } from '@/lib/tipo-conta'
import { corTextoContraste } from '@/lib/cor-contraste'
import UsuariosTable, { type UsuarioRow } from './UsuariosTable'
import CadastrarUsuarioModal from './CadastrarUsuarioModal'

const PAGE_SIZE = 20

function buildOrderBy(sort?: string, order?: string) {
  if (sort === 'nome') {
    return { nome: (order === 'desc' ? 'desc' : 'asc') as 'asc' | 'desc' }
  }
  return { criadoEm: 'desc' as const }
}

export default async function PessoasPage({
  params,
  searchParams,
}: {
  params: { slug: string }
  searchParams: { q?: string; sort?: string; order?: string; rede?: string; path?: string; page?: string }
}) {
  const gabinete = await getGabineteBySlug(params.slug)
  if (!gabinete) notFound()
  const corTexto = corTextoContraste(gabinete.corPrimaria)

  const q = searchParams.q?.trim() ?? ''
  const { sort, order, rede, path } = searchParams
  const orderBy = buildOrderBy(sort, order)
  const pathIds = path ? path.split(',').filter(Boolean) : []
  const paginaSolicitada = Number(searchParams.page ?? '1') || 1

  const searchFilter = q
    ? {
        OR: [
          { nome: { contains: q, mode: 'insensitive' as const } },
          { whatsapp: { contains: q } },
          { email: { contains: q, mode: 'insensitive' as const } },
        ],
      }
    : {}

  let idsFiltro: string[] | null = null
  if (rede) {
    const vinculos = await prisma.vinculoRede.findMany({
      where: { indicadoPorId: rede, gabineteId: gabinete.id, deletedAt: null },
      select: { pessoaId: true },
    })
    idsFiltro = vinculos.map((v) => v.pessoaId)
  }

  const whereBase = {
    gabineteId: gabinete.id,
    deletedAt: null,
    ...searchFilter,
    ...(idsFiltro ? { id: { in: idsFiltro } } : {}),
  }

  const totalItens = idsFiltro && idsFiltro.length === 0 ? 0 : await prisma.pessoa.count({ where: whereBase })
  const { paginaAtual, skip, take } = paginar(totalItens, paginaSolicitada, PAGE_SIZE)

  const pessoasRaw =
    idsFiltro && idsFiltro.length === 0
      ? []
      : await prisma.pessoa.findMany({
          where: whereBase,
          orderBy,
          skip,
          take,
          select: {
            id: true,
            nome: true,
            email: true,
            fotoUrl: true,
            userId: true,
            segmentos: { select: { segmento: { select: { id: true, nome: true } } } },
          },
        })

  const userIds = pessoasRaw.map((p) => p.userId).filter((id): id is string => !!id)
  const papeis = userIds.length
    ? await prisma.usuarioGabinete.findMany({
        where: { userId: { in: userIds }, gabineteId: gabinete.id },
        select: { userId: true, papel: true },
      })
    : []
  const papelPorUserId = new Map(papeis.map((p) => [p.userId, p.papel]))

  const usuarios: UsuarioRow[] = pessoasRaw.map((p) => ({
    id: p.id,
    nome: p.nome,
    email: p.email,
    fotoUrl: p.fotoUrl,
    tipoConta: mapPapelParaTipoConta(p.userId ? papelPorUserId.get(p.userId) : null),
    segmentos: p.segmentos.map((s) => s.segmento),
  }))

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
        <h1 className="text-2xl font-bold text-gray-900">Usuários</h1>
        <CadastrarUsuarioModal
          slug={params.slug}
          regioes={regioes}
          profissoes={profissoes}
          corPrimaria={gabinete.corPrimaria}
        />
      </div>

      {breadcrumb.length > 0 && (
        <nav className="text-sm text-gray-500 flex items-center gap-1 flex-wrap">
          <Link href={`/${params.slug}/admin/pessoas`} className="hover:text-gray-900">
            Usuários
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
                  <Link href={`/${params.slug}/admin/pessoas?rede=${item.id}&path=${crumbPath}`} className="hover:text-gray-900">
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
        <button
          type="submit"
          style={{ backgroundColor: gabinete.corPrimaria, color: corTexto }}
          className="px-4 py-2 rounded-md text-sm font-medium"
        >
          Buscar
        </button>
      </form>

      <div className="bg-white rounded-lg overflow-x-auto">
        <UsuariosTable slug={params.slug} usuarios={usuarios} />
        <Pagination
          totalItens={totalItens}
          paginaAtual={paginaAtual}
          tamanhoPagina={PAGE_SIZE}
          baseUrl={`/${params.slug}/admin/pessoas`}
          searchParams={{ q, sort, order, rede, path }}
          corPrimaria={gabinete.corPrimaria}
        />
      </div>
    </div>
  )
}
