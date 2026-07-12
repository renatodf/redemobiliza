import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { getGabineteBySlug } from '@/lib/gabinete'
import FiltrosTabs from '../FiltrosTabs'
import CadastrosBusca from '../CadastrosBusca'

export default async function AdminFiltrosCadastrosPage({
  params,
  searchParams,
}: {
  params: { slug: string }
  searchParams: { q?: string; pessoaId?: string }
}) {
  const gabinete = await getGabineteBySlug(params.slug)
  if (!gabinete) notFound()

  const q = searchParams.q?.trim() ?? ''
  const pessoaId = searchParams.pessoaId ?? ''

  const [resultados, pessoaSelecionada, regioes, profissoes] = await Promise.all([
    q
      ? prisma.pessoa.findMany({
          where: {
            gabineteId: gabinete.id,
            deletedAt: null,
            OR: [
              { nome: { contains: q, mode: 'insensitive' } },
              { whatsapp: { contains: q } },
            ],
          },
          take: 10,
          select: { id: true, nome: true, whatsapp: true, regiao: { select: { nome: true } } },
        })
      : Promise.resolve([]),
    pessoaId
      ? prisma.pessoa.findFirst({
          where: { id: pessoaId, gabineteId: gabinete.id, deletedAt: null },
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
        <p className="text-sm text-gray-600 mt-1">Filtre e exporte os dados do sistema.</p>
      </div>
      <FiltrosTabs
        abas={[
          { chave: 'pessoas', label: 'Pessoas', href: `/${params.slug}/admin/filtros` },
          { chave: 'demandas', label: 'Demandas', href: `/${params.slug}/admin/filtros/demandas` },
          { chave: 'banco-talentos', label: 'Banco de Talentos', href: `/${params.slug}/admin/filtros/banco-talentos` },
          { chave: 'cadastros', label: 'Cadastros', href: `/${params.slug}/admin/filtros/cadastros` },
        ]}
        abaAtiva="cadastros"
        corPrimaria={gabinete.corPrimaria}
      />
      <CadastrosBusca
        slug={params.slug}
        baseHref={`/${params.slug}/admin/filtros/cadastros`}
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
