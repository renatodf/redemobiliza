import { notFound } from 'next/navigation'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { prisma } from '@/lib/prisma'
import { getGabineteBySlug } from '@/lib/gabinete'
import { editarPessoa } from '@/actions/admin/editar-pessoa'
import { toggleColaborador } from '@/actions/admin/toggle-equipe'
import { criarObservacao } from '@/actions/admin/criar-observacao'
import { editarObservacao } from '@/actions/admin/editar-observacao'
import { excluirObservacao } from '@/actions/admin/excluir-observacao'
import MobilizadorSection from './MobilizadorSection'
import { getAppUrl } from '@/lib/app-url'
import FotoPerfilAvatar from './FotoPerfilAvatar'

export default async function FichaPessoaPage({
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
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) notFound()

  const pessoa = await prisma.pessoa.findFirst({
    where: { id: params.pessoaId, gabineteId: gabinete.id, deletedAt: null },
    include: {
      regiao: { select: { nome: true } },
      profissao: { select: { nome: true } },
      observacoes: { orderBy: { criadoEm: 'desc' } },
    },
  })
  if (!pessoa) notFound()

  const [regioes, profissoes, demandas, totalRede] = await Promise.all([
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
    prisma.demanda.findMany({
      where: { solicitanteId: pessoa.id, gabineteId: gabinete.id },
      orderBy: { criadoEm: 'desc' },
      include: {
        area: { select: { nome: true } },
        responsavel: { select: { nome: true } },
        historico: {
          orderBy: { criadoEm: 'asc' },
          include: { autor: { select: { nome: true } } },
        },
      },
    }),
    pessoa.isMobilizador
      ? prisma.vinculoRede.count({ where: { indicadoPorId: pessoa.id } })
      : Promise.resolve(0),
  ])

  const role = session.user.app_metadata?.role as string | undefined
  const usuarioGabinete = await prisma.usuarioGabinete.findUnique({
    where: { userId_gabineteId: { userId: session.user.id, gabineteId: gabinete.id } },
    select: { papel: true },
  })
  const isAdmin = usuarioGabinete?.papel === 'admin' || role === 'super-admin'

  return (
    <div className="max-w-2xl mx-auto py-8 px-4 space-y-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <FotoPerfilAvatar
            fotoUrl={pessoa.fotoUrl}
            pessoaId={pessoa.id}
            slug={params.slug}
            canEdit={isAdmin || pessoa.userId === session.user.id}
          />
          <h1 className="text-2xl font-bold">{pessoa.nome}</h1>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {pessoa.isColaborador && (
            <span className="bg-green-100 text-green-800 text-xs px-2 py-1 rounded-full">
              Colaborador
            </span>
          )}
          {pessoa.isMobilizador && (
            <span className="bg-purple-100 text-purple-800 text-xs px-2 py-1 rounded-full">
              {totalRede} na rede
            </span>
          )}
          <span className="bg-gray-100 text-gray-700 text-xs px-2 py-1 rounded-full">
            {demandas.length} demanda{demandas.length !== 1 ? 's' : ''}
          </span>
          <Link
            href={`/${params.slug}/admin/demandas/nova?solicitanteId=${pessoa.id}`}
            className="bg-blue-600 text-white text-xs px-3 py-1.5 rounded-md hover:bg-blue-700 font-medium"
          >
            + Nova Demanda
          </Link>
        </div>
      </div>

      <div className="bg-white rounded-lg p-4 shadow-sm">
        {pessoa.isColaborador ? (
          <form action={toggleColaborador}>
            <input type="hidden" name="slug" value={params.slug} />
            <input type="hidden" name="pessoaId" value={pessoa.id} />
            <input type="hidden" name="acao" value="desmarcar" />
            <button type="submit" className="text-sm text-red-600 hover:underline">
              Remover como colaborador
            </button>
          </form>
        ) : (
          <form action={toggleColaborador}>
            <input type="hidden" name="slug" value={params.slug} />
            <input type="hidden" name="pessoaId" value={pessoa.id} />
            <input type="hidden" name="acao" value="marcar" />
            <button type="submit" className="text-sm text-green-700 hover:underline">
              Marcar como colaborador
            </button>
          </form>
        )}
      </div>

      <section className="bg-white rounded-lg p-6 shadow-sm space-y-4">
        <h2 className="text-lg font-semibold">Dados</h2>
        <form action={editarPessoa} className="space-y-4">
          <input type="hidden" name="slug" value={params.slug} />
          <input type="hidden" name="pessoaId" value={pessoa.id} />
          <div>
            <label className="block text-sm font-medium text-gray-700">Nome *</label>
            <input
              name="nome"
              required
              defaultValue={pessoa.nome}
              className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700">WhatsApp *</label>
              <input
                name="whatsapp"
                required
                defaultValue={pessoa.whatsapp}
                className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">E-mail</label>
              <input
                name="email"
                type="email"
                defaultValue={pessoa.email ?? ''}
                className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700">Região</label>
              <select
                name="regiaoId"
                defaultValue={pessoa.regiaoId ?? ''}
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
                defaultValue={pessoa.profissaoId ?? ''}
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
              defaultValue={pessoa.genero ?? ''}
              className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
            >
              <option value="">Não informado</option>
              <option value="masculino">Masculino</option>
              <option value="feminino">Feminino</option>
              <option value="outro">Outro</option>
            </select>
          </div>
          <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium">
            Salvar alterações
          </button>
        </form>
      </section>

      <section className="bg-white rounded-lg p-6 shadow-sm space-y-4">
        <h2 className="text-lg font-semibold">Observações</h2>

        <form action={criarObservacao} className="space-y-2">
          <input type="hidden" name="slug" value={params.slug} />
          <input type="hidden" name="pessoaId" value={pessoa.id} />
          <textarea
            name="texto"
            required
            rows={3}
            placeholder="Adicionar observação..."
            className="block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
          />
          <button type="submit" className="bg-gray-700 text-white px-4 py-2 rounded-md text-sm font-medium">
            Adicionar observação
          </button>
        </form>

        <div className="space-y-3 mt-4">
          {pessoa.observacoes.map((obs) => {
            const podeEditar = isAdmin || obs.autorUserId === session.user.id
            return (
              <div key={obs.id} className="border border-gray-200 rounded-md p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">
                    {obs.autorNome} —{' '}
                    {new Date(obs.criadoEm).toLocaleDateString('pt-BR', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                    {obs.editadoEm && ' (editado)'}
                  </span>
                  {podeEditar && (
                    <form action={excluirObservacao}>
                      <input type="hidden" name="slug" value={params.slug} />
                      <input type="hidden" name="pessoaId" value={pessoa.id} />
                      <input type="hidden" name="observacaoId" value={obs.id} />
                      <button type="submit" className="text-red-600 text-xs hover:underline">
                        Excluir
                      </button>
                    </form>
                  )}
                </div>
                <p className="text-sm text-gray-800 whitespace-pre-wrap">{obs.texto}</p>
                {podeEditar && (
                  <form action={editarObservacao} className="space-y-1">
                    <input type="hidden" name="slug" value={params.slug} />
                    <input type="hidden" name="pessoaId" value={pessoa.id} />
                    <input type="hidden" name="observacaoId" value={obs.id} />
                    <textarea
                      name="texto"
                      required
                      rows={2}
                      defaultValue={obs.texto}
                      className="block w-full border border-gray-200 rounded px-2 py-1 text-sm"
                    />
                    <button type="submit" className="text-xs text-blue-600 hover:underline">
                      Salvar edição
                    </button>
                  </form>
                )}
              </div>
            )
          })}
          {pessoa.observacoes.length === 0 && (
            <p className="text-sm text-gray-500">Nenhuma observação ainda.</p>
          )}
        </div>
      </section>

      {/* Histórico de demandas */}
      <section className="bg-white rounded-lg p-6 shadow-sm space-y-4">
        <h2 className="text-lg font-semibold">
          Demandas ({demandas.length})
        </h2>
        {demandas.length === 0 ? (
          <p className="text-sm text-gray-500">Nenhuma demanda registrada.</p>
        ) : (
          <div className="space-y-3">
            {demandas.map((d) => {
              const statusCfg = {
                aberta:       { label: 'Em aberto',    cor: 'bg-yellow-100 text-yellow-800' },
                expirada:     { label: 'Expirada',     cor: 'bg-orange-100 text-orange-800' },
                atendida:     { label: 'Atendida',     cor: 'bg-green-100 text-green-800' },
                nao_atendida: { label: 'Não atendida', cor: 'bg-red-100 text-red-800' },
              }[d.status] ?? { label: d.status, cor: 'bg-gray-100 text-gray-700' }

              return (
                <details key={d.id} className="border border-gray-200 rounded-lg group">
                  <summary className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-gray-50 list-none">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${statusCfg.cor}`}>
                        {statusCfg.label}
                      </span>
                      <span className="text-sm font-medium text-gray-900 truncate">{d.titulo}</span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0 ml-3">
                      <span className="text-xs text-gray-400">
                        {d.criadoEm.toLocaleDateString('pt-BR')}
                      </span>
                      <Link
                        href={`/${params.slug}/admin/demandas/${d.id}`}
                        className="text-xs text-blue-600 hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        Abrir →
                      </Link>
                    </div>
                  </summary>

                  <div className="px-4 pb-4 pt-2 space-y-3 border-t border-gray-100">
                    <div className="flex flex-wrap gap-4 text-xs text-gray-500">
                      <span>Área: <strong className="text-gray-700">{d.area.nome}</strong></span>
                      <span>Responsável: <strong className="text-gray-700">{d.responsavel.nome}</strong></span>
                      <span>Prazo: <strong className={d.prazoAlterado ? 'text-orange-600' : 'text-gray-700'}>
                        {d.prazoDesfecho.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        {d.prazoAlterado && ' ⚑'}
                      </strong></span>
                    </div>

                    {d.historico.length > 0 && (
                      <ol className="relative border-l border-gray-200 space-y-3 ml-2">
                        {d.historico.map((mov) => (
                          <li key={mov.id} className="ml-4">
                            <div className="absolute -left-1.5 mt-1 h-3 w-3 rounded-full border-2 border-white bg-gray-300" />
                            <p className="text-xs text-gray-400">
                              {mov.criadoEm.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                              {' · '}{mov.autor?.nome ?? 'Sistema'}
                            </p>
                            <p className="text-sm text-gray-700 mt-0.5">{mov.descricao}</p>
                          </li>
                        ))}
                      </ol>
                    )}
                  </div>
                </details>
              )
            })}
          </div>
        )}
      </section>

      <MobilizadorSection
        slug={params.slug}
        pessoaId={pessoa.id}
        temEmail={!!pessoa.email}
        isMobilizador={pessoa.isMobilizador}
        tokenMobilizador={pessoa.tokenMobilizador ?? null}
        appUrl={getAppUrl()}
      />
    </div>
  )
}
