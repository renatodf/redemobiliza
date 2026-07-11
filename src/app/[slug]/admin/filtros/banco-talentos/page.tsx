// src/app/[slug]/admin/filtros/banco-talentos/page.tsx
import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { getGabineteBySlug } from '@/lib/gabinete'
import { buildWhereBancoTalentos, type FiltrosBancoTalentosParams } from '@/lib/filtros-banco-talentos'
import FiltrosTabs from '../FiltrosTabs'
import BancoTalentosFiltro from '../BancoTalentosFiltro'

const TAMANHO_PAGINA = 20

export default async function AdminFiltrosBancoTalentosPage({
  params,
  searchParams,
}: {
  params: { slug: string }
  searchParams: Record<string, string | undefined>
}) {
  const gabinete = await getGabineteBySlug(params.slug)
  if (!gabinete) notFound()

  const filtros: FiltrosBancoTalentosParams = {
    areaIds: searchParams.areaIds ? searchParams.areaIds.split(',').filter(Boolean) : undefined,
    prioridade: searchParams.prioridade,
    isPcd: searchParams.isPcd === 'sim' || searchParams.isPcd === 'nao' ? searchParams.isPcd : undefined,
    regiaoId: searchParams.regiaoId,
  }

  const where = buildWhereBancoTalentos(gabinete.id, filtros)
  const paginaBruta = Number(searchParams.page ?? 1)
  const pagina = Number.isFinite(paginaBruta) ? Math.max(1, Math.floor(paginaBruta)) : 1
  const skip = (pagina - 1) * TAMANHO_PAGINA
  const take = TAMANHO_PAGINA

  const [talentosPagina, totalFiltrado, areas, regioes, mobilizadores] = await Promise.all([
    prisma.bancoTalentos.findMany({
      where,
      orderBy: { pessoa: { nome: 'asc' } },
      skip,
      take,
      select: {
        pessoaId: true,
        prioridade: true,
        isPcd: true,
        curriculoUrl: true,
        pessoa: { select: { nome: true, regiao: { select: { nome: true } } } },
        areas: { select: { area: { select: { nome: true } } } },
      },
    }),
    prisma.bancoTalentos.count({ where }),
    prisma.areaColocacao.findMany({ where: { gabineteId: gabinete.id, status: 'ativa' }, orderBy: { nome: 'asc' } }),
    prisma.regiao.findMany({ where: { gabineteId: gabinete.id, ativa: true }, orderBy: { nome: 'asc' } }),
    prisma.pessoa.findMany({
      where: { gabineteId: gabinete.id, isMobilizador: true, isColaborador: true, deletedAt: null },
      orderBy: { nome: 'asc' },
      select: { id: true, nome: true },
    }),
  ])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Filtros</h1>
        <p className="text-sm text-gray-600 mt-1">Filtre e exporte os dados do sistema.</p>
      </div>
      <FiltrosTabs
        abas={[
          { chave: 'pessoas', label: 'Pessoas', href: `/${params.slug}/admin/filtros` },
          { chave: 'demandas', label: 'Demandas', href: `/${params.slug}/admin/filtros/demandas` },
          { chave: 'banco-talentos', label: 'Banco de Talentos', href: `/${params.slug}/admin/filtros/banco-talentos` },
        ]}
        abaAtiva="banco-talentos"
        corPrimaria={gabinete.corPrimaria}
      />
      <BancoTalentosFiltro
        baseHref={`/${params.slug}/admin/filtros/banco-talentos`}
        exportarHref={`/api/${params.slug}/filtros/banco-talentos/exportar`}
        searchParams={searchParams}
        talentos={talentosPagina}
        totalFiltrado={totalFiltrado}
        paginaAtual={pagina}
        tamanhoPagina={TAMANHO_PAGINA}
        areas={areas}
        regioes={regioes}
        mobilizadores={mobilizadores}
        corPrimaria={gabinete.corPrimaria}
      />
    </div>
  )
}
