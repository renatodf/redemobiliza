// src/app/[slug]/mobilizador/filtros/page.tsx
import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { assertMobilizadorAccess } from '@/lib/assert-mobilizador-access'
import { coletarSubRedeIds } from '@/lib/rede'
import { buildWherePessoas, aplicarFiltrosPosConsulta, type FiltrosPessoasParams } from '@/lib/filtros-pessoas'
import { paginar } from '@/lib/paginacao'
import FiltrosTabs from '../../admin/filtros/FiltrosTabs'
import PessoasFiltro from '../../admin/filtros/PessoasFiltro'

const TAMANHO_PAGINA = 20

export default async function MobilizadorFiltrosPage({
  params,
  searchParams,
}: {
  params: { slug: string }
  searchParams: Record<string, string | undefined>
}) {
  const resultado = await assertMobilizadorAccess(params.slug).catch(() => null)
  if (!resultado) notFound()
  const { gabinete, pessoa } = resultado

  const idsRede = await coletarSubRedeIds(pessoa.id, gabinete.id)

  const filtros: FiltrosPessoasParams = {
    genero: searchParams.genero,
    regiaoId: searchParams.regiaoId,
    profissaoId: searchParams.profissaoId,
    segmentoId: searchParams.segmentoId,
    aniversario: searchParams.aniversario as 'dia' | 'semana' | 'mes' | undefined,
    idadeMin: searchParams.idadeMin,
    idadeMax: searchParams.idadeMax,
    escolaridade: searchParams.escolaridade,
    religiao: searchParams.religiao,
  }

  const where = buildWherePessoas(gabinete.id, filtros, idsRede)
  const candidatas = await prisma.pessoa.findMany({
    where,
    orderBy: { nome: 'asc' },
    select: {
      id: true,
      nome: true,
      whatsapp: true,
      email: true,
      nascimento: true,
      regiao: { select: { nome: true } },
      profissao: { select: { nome: true } },
      segmentos: { select: { segmento: { select: { nome: true } } } },
    },
  })
  const filtradas = aplicarFiltrosPosConsulta(candidatas, filtros, new Date())

  const pagina = Number(searchParams.page ?? 1)
  const { skip, take } = paginar(filtradas.length, pagina, TAMANHO_PAGINA)
  const pessoasPagina = filtradas.slice(skip, skip + take)

  const [regioes, profissoes, segmentos, escolaridadesRaw, religioesRaw] = await Promise.all([
    prisma.regiao.findMany({ where: { gabineteId: gabinete.id, ativa: true }, orderBy: { nome: 'asc' } }),
    prisma.profissao.findMany({ where: { gabineteId: gabinete.id, ativa: true }, orderBy: { nome: 'asc' } }),
    prisma.segmento.findMany({ where: { gabineteId: gabinete.id, status: 'ativo' }, orderBy: { nome: 'asc' } }),
    prisma.pessoa.findMany({
      where: { gabineteId: gabinete.id, deletedAt: null, escolaridade: { not: null } },
      select: { escolaridade: true },
      distinct: ['escolaridade'],
      orderBy: { escolaridade: 'asc' },
    }),
    prisma.pessoa.findMany({
      where: { gabineteId: gabinete.id, deletedAt: null, religiao: { not: null } },
      select: { religiao: true },
      distinct: ['religiao'],
      orderBy: { religiao: 'asc' },
    }),
  ])
  const escolaridades = escolaridadesRaw.map((e) => e.escolaridade as string)
  const religioes = religioesRaw.map((r) => r.religiao as string)

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
        abaAtiva="pessoas"
        corPrimaria={gabinete.corPrimaria}
      />
      <PessoasFiltro
        baseHref={`/${params.slug}/mobilizador/filtros`}
        dashboardHref={`/${params.slug}/mobilizador/dashboard`}
        exportarHref={`/api/${params.slug}/filtros/pessoas/exportar`}
        searchParams={searchParams}
        pessoas={pessoasPagina}
        totalFiltrado={filtradas.length}
        paginaAtual={pagina}
        tamanhoPagina={TAMANHO_PAGINA}
        regioes={regioes}
        profissoes={profissoes}
        segmentos={segmentos}
        escolaridades={escolaridades}
        religioes={religioes}
        corPrimaria={gabinete.corPrimaria}
      />
    </div>
  )
}
