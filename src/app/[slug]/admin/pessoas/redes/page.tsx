import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { getGabineteBySlug } from '@/lib/gabinete'
import Pagination from '@/components/admin/Pagination'
import { paginar } from '@/lib/paginacao'
import UsuariosTabs from '../UsuariosTabs'
import CadastrarUsuarioModal from '../CadastrarUsuarioModal'
import RedesTable, { type RedeRow } from './RedesTable'

const PAGE_SIZE = 20

export default async function RedesUsuariosPage({
  params,
  searchParams,
}: {
  params: { slug: string }
  searchParams: { page?: string }
}) {
  const gabinete = await getGabineteBySlug(params.slug)
  if (!gabinete) notFound()

  const paginaSolicitada = Number(searchParams.page ?? '1') || 1

  const whereBase = { gabineteId: gabinete.id, isMobilizador: true, deletedAt: null }

  const totalItens = await prisma.pessoa.count({ where: whereBase })
  const { paginaAtual, skip, take } = paginar(totalItens, paginaSolicitada, PAGE_SIZE)

  const mobilizadores = await prisma.pessoa.findMany({
    where: whereBase,
    orderBy: { nome: 'asc' },
    skip,
    take,
    select: { id: true, nome: true, email: true, fotoUrl: true, userId: true },
  })

  const userIds = mobilizadores.map((m) => m.userId).filter((id): id is string => !!id)
  const pessoaIds = mobilizadores.map((m) => m.id)

  const [vinculosMobilizador, contagens] = await Promise.all([
    userIds.length
      ? prisma.usuarioGabinete.findMany({
          where: { userId: { in: userIds }, gabineteId: gabinete.id, papel: 'mobilizador' },
          select: { userId: true, criadoEm: true },
        })
      : Promise.resolve([]),
    pessoaIds.length
      ? prisma.vinculoRede.groupBy({
          by: ['indicadoPorId'],
          where: { gabineteId: gabinete.id, deletedAt: null, indicadoPorId: { in: pessoaIds } },
          _count: { _all: true },
        })
      : Promise.resolve([]),
  ])

  const criadoEmPorUserId = new Map(vinculosMobilizador.map((v) => [v.userId, v.criadoEm]))
  const contagemPorPessoaId = new Map(contagens.map((c) => [c.indicadoPorId, c._count._all]))

  const redes: RedeRow[] = mobilizadores.map((m) => ({
    id: m.id,
    nome: m.nome,
    email: m.email,
    fotoUrl: m.fotoUrl,
    criadoEm: m.userId ? criadoEmPorUserId.get(m.userId) ?? null : null,
    cadastrados: contagemPorPessoaId.get(m.id) ?? 0,
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

  return (
    <div className="space-y-6">
      <p className="text-[13px] text-[rgba(113,113,113,0.65)]">Início / Usuários</p>
      <div className="flex items-center justify-between flex-wrap gap-3 -mt-3">
        <h1 className="text-2xl font-bold text-gray-900">Usuários</h1>
        <CadastrarUsuarioModal
          slug={params.slug}
          regioes={regioes}
          profissoes={profissoes}
          corPrimaria={gabinete.corPrimaria}
        />
      </div>

      <UsuariosTabs slug={params.slug} corPrimaria={gabinete.corPrimaria} />

      <div className="bg-white rounded-lg overflow-x-auto">
        <RedesTable slug={params.slug} redes={redes} />
        <Pagination
          totalItens={totalItens}
          paginaAtual={paginaAtual}
          tamanhoPagina={PAGE_SIZE}
          baseUrl={`/${params.slug}/admin/pessoas/redes`}
          searchParams={{}}
          corPrimaria={gabinete.corPrimaria}
        />
      </div>
    </div>
  )
}
