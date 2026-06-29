import { notFound } from 'next/navigation'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { prisma } from '@/lib/prisma'
import { getGabineteBySlug } from '@/lib/gabinete'

export default async function MobilizadorPessoaPage({
  params,
}: {
  params: { slug: string; pessoaId: string }
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
    select: { id: true },
  })
  if (!mobilizadorPessoa) notFound()

  // Verifica se pessoaId pertence à sub-árvore do mobilizador logado
  if (params.pessoaId !== mobilizadorPessoa.id) {
    let currentId: string | null = params.pessoaId
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

  const pessoa = await prisma.pessoa.findFirst({
    where: { id: params.pessoaId, gabineteId: gabinete.id, deletedAt: null },
    include: {
      regiao: { select: { nome: true } },
      profissao: { select: { nome: true } },
      observacoes: {
        where: { deletedAt: null },
        orderBy: { criadoEm: 'desc' },
        select: { id: true, texto: true, autorNome: true, criadoEm: true },
      },
    },
  })
  if (!pessoa) notFound()

  const demandas = await prisma.demanda.findMany({
    where: { solicitanteId: pessoa.id, gabineteId: gabinete.id, deletedAt: null },
    orderBy: { criadoEm: 'desc' },
    select: {
      id: true,
      titulo: true,
      status: true,
      prazoDesfecho: true,
      area: { select: { nome: true } },
    },
  })

  const statusLabel: Record<string, string> = {
    aberta: 'Em aberto',
    expirada: 'Expirada',
    atendida: 'Atendida',
    nao_atendida: 'Não atendida',
  }
  const statusCor: Record<string, string> = {
    aberta: 'text-yellow-600',
    expirada: 'text-orange-600',
    atendida: 'text-green-600',
    nao_atendida: 'text-red-600',
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">{pessoa.nome}</h1>
        <Link href={`/${params.slug}/mobilizador/rede`} className="text-sm text-gray-500 hover:underline">
          ← Voltar
        </Link>
      </div>

      {/* Dados cadastrais */}
      <div className="bg-white rounded-lg p-6 shadow-sm space-y-3">
        <h2 className="text-base font-semibold text-gray-800">Dados cadastrais</h2>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-gray-500">WhatsApp</p>
            <p className="font-medium">{pessoa.whatsapp}</p>
          </div>
          {pessoa.email && (
            <div>
              <p className="text-gray-500">E-mail</p>
              <p className="font-medium">{pessoa.email}</p>
            </div>
          )}
          {pessoa.regiao && (
            <div>
              <p className="text-gray-500">Região</p>
              <p className="font-medium">{pessoa.regiao.nome}</p>
            </div>
          )}
          {pessoa.profissao && (
            <div>
              <p className="text-gray-500">Profissão</p>
              <p className="font-medium">{pessoa.profissao.nome}</p>
            </div>
          )}
          {pessoa.genero && (
            <div>
              <p className="text-gray-500">Gênero</p>
              <p className="font-medium capitalize">{pessoa.genero}</p>
            </div>
          )}
          {pessoa.nascimento && (
            <div>
              <p className="text-gray-500">Nascimento</p>
              <p className="font-medium">
                {new Date(pessoa.nascimento).toLocaleDateString('pt-BR')}
              </p>
            </div>
          )}
        </div>
        <div className="flex gap-2 pt-1">
          {pessoa.isColaborador && (
            <span className="inline-block bg-green-100 text-green-800 text-xs px-2 py-0.5 rounded-full">
              Colaborador
            </span>
          )}
          {pessoa.isMobilizador && (
            <span className="inline-block bg-purple-100 text-purple-800 text-xs px-2 py-0.5 rounded-full">
              Mobilizador
            </span>
          )}
        </div>
      </div>

      {/* Observações */}
      <div className="bg-white rounded-lg p-6 shadow-sm space-y-3">
        <h2 className="text-base font-semibold text-gray-800">
          Observações ({pessoa.observacoes.length})
        </h2>
        {pessoa.observacoes.length === 0 ? (
          <p className="text-sm text-gray-500">Nenhuma observação registrada.</p>
        ) : (
          <ul className="divide-y divide-gray-100 space-y-0">
            {pessoa.observacoes.map((obs) => (
              <li key={obs.id} className="py-3">
                <p className="text-sm text-gray-800">{obs.texto}</p>
                <p className="text-xs text-gray-400 mt-1">
                  {obs.autorNome} · {new Date(obs.criadoEm).toLocaleDateString('pt-BR')}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Demandas */}
      <div className="bg-white rounded-lg p-6 shadow-sm space-y-3">
        <h2 className="text-base font-semibold text-gray-800">
          Demandas ({demandas.length})
        </h2>
        {demandas.length === 0 ? (
          <p className="text-sm text-gray-500">Nenhuma demanda registrada.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {demandas.map((d) => (
              <li key={d.id} className="py-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{d.titulo}</p>
                    <p className="text-xs text-gray-500">
                      {d.area.nome} · Prazo:{' '}
                      {new Date(d.prazoDesfecho).toLocaleDateString('pt-BR')}
                    </p>
                  </div>
                  <span className={`text-xs font-medium ${statusCor[d.status] ?? 'text-gray-600'}`}>
                    {statusLabel[d.status] ?? d.status}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
