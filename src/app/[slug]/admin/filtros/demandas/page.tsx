// src/app/[slug]/admin/filtros/demandas/page.tsx
import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { getGabineteBySlug } from '@/lib/gabinete'
import { buildWhereDemandas, type FiltrosDemandasParams } from '@/lib/filtros-demandas'
import FiltrosTabs from '../FiltrosTabs'
import DemandasFiltro from '../DemandasFiltro'

const TAMANHO_PAGINA = 20

export default async function AdminFiltrosDemandasPage({
  params,
  searchParams,
}: {
  params: { slug: string }
  searchParams: Record<string, string | undefined>
}) {
  const gabinete = await getGabineteBySlug(params.slug)
  if (!gabinete) notFound()

  const filtros: FiltrosDemandasParams = {
    areaId: searchParams.areaId,
    status: searchParams.status as 'atendida' | 'nao_atendida' | 'pendente' | undefined,
    regiaoId: searchParams.regiaoId,
    dataInicio: searchParams.dataInicio,
    dataFim: searchParams.dataFim,
  }

  const where = buildWhereDemandas(gabinete.id, filtros)
  const paginaBruta = Number(searchParams.page ?? 1)
  const pagina = Number.isFinite(paginaBruta) ? Math.max(1, Math.floor(paginaBruta)) : 1
  const skip = (pagina - 1) * TAMANHO_PAGINA
  const take = TAMANHO_PAGINA

  const [demandasPagina, totalFiltrado, areas, regioes] = await Promise.all([
    prisma.demanda.findMany({
      where,
      orderBy: { criadoEm: 'desc' },
      skip,
      take,
      select: {
        id: true,
        titulo: true,
        status: true,
        prazoDesfecho: true,
        area: { select: { nome: true } },
        solicitante: { select: { id: true, nome: true } },
        responsavel: { select: { id: true, nome: true } },
      },
    }),
    prisma.demanda.count({ where }),
    prisma.areaDemanda.findMany({ where: { gabineteId: gabinete.id }, orderBy: { nome: 'asc' } }),
    prisma.regiao.findMany({ where: { gabineteId: gabinete.id, ativa: true }, orderBy: { nome: 'asc' } }),
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
          { chave: 'cadastros', label: 'Cadastros', href: `/${params.slug}/admin/filtros/cadastros` },
        ]}
        abaAtiva="demandas"
        corPrimaria={gabinete.corPrimaria}
      />
      <DemandasFiltro
        baseHref={`/${params.slug}/admin/filtros/demandas`}
        baseHrefPessoa={`/${params.slug}/admin/pessoas`}
        dashboardHref={`/${params.slug}/admin/dashboard`}
        exportarHref={`/api/${params.slug}/filtros/demandas/exportar`}
        searchParams={searchParams}
        demandas={demandasPagina}
        totalFiltrado={totalFiltrado}
        paginaAtual={pagina}
        tamanhoPagina={TAMANHO_PAGINA}
        areas={areas}
        regioes={regioes}
        corPrimaria={gabinete.corPrimaria}
      />
    </div>
  )
}
