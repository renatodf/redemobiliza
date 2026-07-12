// src/app/[slug]/mobilizador/filtros/cadastros/page.tsx
import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { assertMobilizadorAccess } from '@/lib/assert-mobilizador-access'
import { coletarSubRedeIds } from '@/lib/rede'
import FiltrosTabs from '../../../admin/filtros/FiltrosTabs'
import CadastrosBusca from '../../../admin/filtros/CadastrosBusca'

export default async function MobilizadorFiltrosCadastrosPage({
  params,
  searchParams,
}: {
  params: { slug: string }
  searchParams: { q?: string; pessoaId?: string }
}) {
  const resultado = await assertMobilizadorAccess(params.slug).catch(() => null)
  if (!resultado) notFound()
  const { gabinete, pessoa } = resultado

  const idsRede = await coletarSubRedeIds(pessoa.id, gabinete.id)

  const q = searchParams.q?.trim() ?? ''
  const pessoaIdBusca = searchParams.pessoaId ?? ''

  const [resultados, pessoaSelecionada, regioes, profissoes] = await Promise.all([
    q
      ? prisma.pessoa.findMany({
          where: {
            gabineteId: gabinete.id,
            deletedAt: null,
            id: { in: idsRede },
            OR: [
              { nome: { contains: q, mode: 'insensitive' } },
              { whatsapp: { contains: q } },
            ],
          },
          take: 10,
          select: { id: true, nome: true, whatsapp: true, regiao: { select: { nome: true } } },
        })
      : Promise.resolve([]),
    pessoaIdBusca && idsRede.includes(pessoaIdBusca)
      ? prisma.pessoa.findFirst({
          where: { id: pessoaIdBusca, gabineteId: gabinete.id, deletedAt: null },
          select: {
            id: true,
            nome: true,
            whatsapp: true,
            email: true,
            nascimento: true,
            genero: true,
            origem: true,
            regiaoId: true,
            profissaoId: true,
            cpf: true,
            telefoneFixo: true,
            orientacaoSexual: true,
            religiao: true,
            escolaridade: true,
            bairro: true,
            logradouro: true,
            numero: true,
            complemento: true,
            cep: true,
          },
        })
      : Promise.resolve(null),
    prisma.regiao.findMany({ where: { gabineteId: gabinete.id, ativa: true }, orderBy: { nome: 'asc' }, select: { id: true, nome: true } }),
    prisma.profissao.findMany({ where: { gabineteId: gabinete.id, ativa: true }, orderBy: { nome: 'asc' }, select: { id: true, nome: true } }),
  ])

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
        abaAtiva="cadastros"
        corPrimaria={gabinete.corPrimaria}
      />
      <CadastrosBusca
        slug={params.slug}
        baseHref={`/${params.slug}/mobilizador/filtros/cadastros`}
        q={q}
        resultados={resultados}
        pessoaSelecionada={pessoaSelecionada}
        regioes={regioes}
        profissoes={profissoes}
        corPrimaria={gabinete.corPrimaria}
      />
    </div>
  )
}
