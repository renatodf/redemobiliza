// src/app/[slug]/mobilizador/filtros/demandas/page.tsx
import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { assertMobilizadorAccess } from '@/lib/assert-mobilizador-access'
import { buildWhereDemandas, type FiltrosDemandasParams } from '@/lib/filtros-demandas'
import { coletarSubRedeIds } from '@/lib/rede'
import FiltrosTabs from '../../../admin/filtros/FiltrosTabs'
import DemandasFiltro from '../../../admin/filtros/DemandasFiltro'

const TAMANHO_PAGINA = 20

export default async function MobilizadorFiltrosDemandasPage({
  params,
  searchParams,
}: {
  params: { slug: string }
  searchParams: Record<string, string | undefined>
}) {
  const resultado = await assertMobilizadorAccess(params.slug).catch(() => null)
  if (!resultado) notFound()
  const { gabinete, pessoa } = resultado

  const filtros: FiltrosDemandasParams = {
    areaId: searchParams.areaId,
    status: searchParams.status as 'atendida' | 'nao_atendida' | 'pendente' | undefined,
    regiaoId: searchParams.regiaoId,
    dataInicio: searchParams.dataInicio,
    dataFim: searchParams.dataFim,
  }

  const where = buildWhereDemandas(gabinete.id, filtros, pessoa.id)
  const paginaBruta = Number(searchParams.page ?? 1)
  const pagina = Number.isFinite(paginaBruta) ? Math.max(1, Math.floor(paginaBruta)) : 1
  const skip = (pagina - 1) * TAMANHO_PAGINA
  const take = TAMANHO_PAGINA

  const [demandasPagina, totalFiltrado, areas, regioes, subRedeIds] = await Promise.all([
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
    coletarSubRedeIds(pessoa.id, gabinete.id),
  ])

  // coletarSubRedeIds exclui o próprio pessoa.id do resultado — inclui aqui
  // pra que uma demanda cujo solicitante é o próprio mobilizador também vire link.
  const idsRedeSolicitante = new Set([pessoa.id, ...subRedeIds])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Filtros</h1>
        <p className="text-sm text-gray-600 mt-1">Filtre e exporte os dados da sua rede.</p>
      </div>
      <FiltrosTabs
        abas={[
          { chave: 'pessoas', label: 'Pessoas', href: `/${params.slug}/mobilizador/filtros` },
          { chave: 'demandas', label: 'Demandas', href: `/${params.slug}/mobilizador/filtros/demandas` },
          { chave: 'cadastros', label: 'Cadastros', href: `/${params.slug}/mobilizador/filtros/cadastros` },
        ]}
        abaAtiva="demandas"
        corPrimaria={gabinete.corPrimaria}
      />
      <DemandasFiltro
        baseHref={`/${params.slug}/mobilizador/filtros/demandas`}
        baseHrefPessoa={`/${params.slug}/mobilizador/pessoas`}
        dashboardHref={`/${params.slug}/mobilizador/dashboard`}
        exportarHref={`/api/${params.slug}/filtros/demandas/exportar`}
        searchParams={searchParams}
        demandas={demandasPagina}
        totalFiltrado={totalFiltrado}
        paginaAtual={pagina}
        tamanhoPagina={TAMANHO_PAGINA}
        areas={areas}
        regioes={regioes}
        corPrimaria={gabinete.corPrimaria}
        idsRedeSolicitante={idsRedeSolicitante}
      />
    </div>
  )
}
