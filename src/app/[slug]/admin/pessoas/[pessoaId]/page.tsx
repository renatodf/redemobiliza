import { notFound } from 'next/navigation'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { prisma } from '@/lib/prisma'
import { getGabineteBySlug } from '@/lib/gabinete'
import EditarPessoaForm from './EditarPessoaForm'
import { toggleColaborador } from '@/actions/admin/toggle-equipe'
import { criarObservacao } from '@/actions/admin/criar-observacao'
import { editarObservacao } from '@/actions/admin/editar-observacao'
import { excluirObservacao } from '@/actions/admin/excluir-observacao'
import MobilizadorSection from './MobilizadorSection'
import { getAppUrl } from '@/lib/app-url'
import FotoPerfilAvatar from './FotoPerfilAvatar'
import PromoverMobilizadorDialog from './PromoverMobilizadorDialog'
import ExcluirPessoaButton from './ExcluirPessoaButton'
import Avatar from '@/components/admin/Avatar'
import SegmentPills from '@/components/admin/SegmentPills'
import VerMaisList from '@/components/admin/VerMaisList'
import { mapPapelParaTipoConta } from '@/lib/tipo-conta'
import { statusDemandaPill, foiAtendidaPill } from '@/lib/status-demanda'
import CollapsibleSection from '@/components/admin/CollapsibleSection'

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
      observacoes: { where: { deletedAt: null }, orderBy: { criadoEm: 'desc' } },
      segmentos: { select: { segmento: { select: { id: true, nome: true } } } },
      redesComoIndicado: {
        where: { deletedAt: null },
        take: 1,
        select: { indicadoPor: { select: { id: true, nome: true, fotoUrl: true } } },
      },
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
      where: { solicitanteId: pessoa.id, gabineteId: gabinete.id, deletedAt: null },
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
      ? prisma.vinculoRede.count({ where: { indicadoPorId: pessoa.id, deletedAt: null } })
      : Promise.resolve(0),
  ])

  const role = session.user.app_metadata?.role as string | undefined
  const usuarioGabinete = await prisma.usuarioGabinete.findUnique({
    where: { userId_gabineteId: { userId: session.user.id, gabineteId: gabinete.id } },
    select: { papel: true },
  })
  const isAdmin = usuarioGabinete?.papel === 'admin' || role === 'super-admin'

  const papelUsuario = pessoa.userId
    ? (await prisma.usuarioGabinete.findUnique({
        where: { userId_gabineteId: { userId: pessoa.userId, gabineteId: gabinete.id } },
        select: { papel: true },
      }))?.papel ?? null
    : null
  const tipoConta = mapPapelParaTipoConta(papelUsuario)

  let ultimoAcesso: string | null = null
  if (pessoa.userId) {
    const { getSupabaseAdmin } = await import('@/lib/supabase/admin')
    const { data } = await getSupabaseAdmin().auth.admin.getUserById(pessoa.userId)
    if (data.user?.last_sign_in_at) {
      ultimoAcesso = new Date(data.user.last_sign_in_at).toLocaleDateString('pt-BR', {
        day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
      })
    }
  }

  const redeInfo = pessoa.redesComoIndicado[0]?.indicadoPor ?? null
  const segmentosPessoa = pessoa.segmentos.map((s) => s.segmento)

  return (
    <div className="max-w-2xl mx-auto py-8 px-4 space-y-8">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <FotoPerfilAvatar
            fotoUrl={pessoa.fotoUrl}
            pessoaId={pessoa.id}
            slug={params.slug}
            canEdit={isAdmin || pessoa.userId === session.user.id}
          />
          <div>
            <p className="text-xs text-gray-500">Nome</p>
            <p className="text-2xl font-bold text-gray-900">{pessoa.nome}</p>
            <p className="text-xs text-gray-500 mt-2">Email</p>
            <p className="text-sm text-gray-700">{pessoa.email ?? '—'}</p>
          </div>
        </div>
        <div className="text-right space-y-2">
          <div className="flex items-center gap-3 justify-end">
            {isAdmin && (
              <a href="#dados" aria-label="Editar dados">✏️</a>
            )}
            {isAdmin && <ExcluirPessoaButton slug={params.slug} pessoaId={params.pessoaId} iconOnly />}
          </div>
          <p className="text-xs text-gray-500">
            Último Acesso<br />
            <span className="text-gray-700">{ultimoAcesso ?? '—'}</span>
          </p>
        </div>
      </div>

      <div className="flex items-center gap-4 flex-wrap">
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
        {isAdmin && !pessoa.isMobilizador && (
          <PromoverMobilizadorDialog
            slug={params.slug}
            pessoaId={pessoa.id}
            nomeAbreviado={pessoa.nome.split(' ')[0]}
          />
        )}
      </div>

      <section id="dados" className="space-y-4">
        <div className="grid grid-cols-4 gap-4 text-sm">
          <div>
            <p className="text-xs text-gray-500">Data de Nascimento</p>
            <p>{pessoa.nascimento ? pessoa.nascimento.toLocaleDateString('pt-BR') : '—'}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">WhatsApp</p>
            <p>{pessoa.whatsapp}</p>
          </div>
          <div className="col-span-2">
            <p className="text-xs text-gray-500">Endereço</p>
            <p>{[pessoa.logradouro, pessoa.numero, pessoa.complemento].filter(Boolean).join(', ') || '—'}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">CEP</p>
            <p>{pessoa.cep ?? '—'}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Cidade</p>
            <p>{pessoa.regiao?.nome ?? '—'}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Bairro</p>
            <p>{pessoa.bairro ?? '—'}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Sexo</p>
            <p className="capitalize">{pessoa.genero ?? '—'}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Tipo de Conta</p>
            <p>{tipoConta}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Profissão</p>
            <p>{pessoa.profissao?.nome ?? '—'}</p>
          </div>
        </div>

        <details className="border-t border-gray-100 pt-3">
          <summary className="text-sm text-blue-600 hover:underline cursor-pointer">Editar dados</summary>
          <div className="mt-3">
            <EditarPessoaForm
              slug={params.slug}
              pessoaId={pessoa.id}
              pessoa={{
                nome: pessoa.nome,
                whatsapp: pessoa.whatsapp,
                email: pessoa.email,
                regiaoId: pessoa.regiaoId,
                profissaoId: pessoa.profissaoId,
                genero: pessoa.genero,
              }}
              regioes={regioes}
              profissoes={profissoes}
            />
          </div>
        </details>
      </section>

      {(redeInfo || pessoa.isMobilizador) && (
        <section className="bg-gray-50 rounded-lg p-4 grid grid-cols-3 gap-4 text-sm">
          <div className="flex items-center gap-2">
            {redeInfo && <Avatar fotoUrl={redeInfo.fotoUrl} nome={redeInfo.nome} size={28} />}
            <div>
              <p className="text-xs text-gray-500">Cadastrado na Rede</p>
              <p>{redeInfo?.nome ?? '—'}</p>
            </div>
          </div>
          <div>
            <p className="text-xs text-gray-500">Criador da Rede</p>
            <p>{redeInfo?.nome ?? '—'}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Cadastrados na Rede que Criou</p>
            {totalRede > 0 ? (
              <Link
                href={`/${params.slug}/admin/pessoas?rede=${pessoa.id}`}
                className="text-lg font-semibold text-blue-600 hover:underline"
              >
                {totalRede}
              </Link>
            ) : (
              <p className="text-lg font-semibold text-gray-400">0</p>
            )}
          </div>
        </section>
      )}

      <section className="space-y-2">
        <h2 className="text-lg font-semibold border-b border-gray-100 pb-2">Segmentos</h2>
        <SegmentPills segmentos={segmentosPessoa} maxVisiveis={10} />
      </section>

      <CollapsibleSection
        title="Demandas do Usuário"
        actions={
          <Link
            href={`/${params.slug}/admin/demandas/nova?solicitanteId=${pessoa.id}`}
            className="bg-[#1E3A5F] text-white text-xs px-3 py-1.5 rounded-md hover:opacity-90 font-medium"
          >
            + CRIAR NOVA DEMANDA
          </Link>
        }
      >
        {demandas.length === 0 ? (
          <p className="text-sm text-gray-500">Nenhuma demanda registrada.</p>
        ) : (
          <VerMaisList
            itens={demandas}
            porPagina={5}
            renderItem={(d) => {
              const status = statusDemandaPill(d.status)
              const atendida = foiAtendidaPill(d.status)
              return (
                <div key={d.id} className="flex items-center justify-between py-2 border-b border-gray-50 text-sm">
                  <Link href={`/${params.slug}/admin/demandas/${d.id}`} className="text-gray-900 hover:underline truncate flex-1">
                    {d.titulo}
                  </Link>
                  <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ml-3 ${status.corClasse}`}>
                    {status.label}
                  </span>
                  <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ml-3 ${atendida.corClasse}`}>
                    {atendida.label}
                  </span>
                  <span className="shrink-0 text-xs text-gray-400 ml-3">
                    {d.criadoEm.toLocaleDateString('pt-BR')}
                  </span>
                </div>
              )
            }}
          />
        )}
      </CollapsibleSection>

      <CollapsibleSection title="Observações Sobre o Usuário">
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
          <div className="flex justify-end">
            <button type="submit" className="bg-[#1E3A5F] text-white px-4 py-2 rounded-md text-sm font-medium">
              + CRIAR NOVA OBSERVAÇÃO
            </button>
          </div>
        </form>

        <div className="mt-4">
          {pessoa.observacoes.length === 0 ? (
            <p className="text-sm text-gray-500">Nenhuma observação ainda.</p>
          ) : (
            <VerMaisList
              itens={pessoa.observacoes}
              porPagina={5}
              renderItem={(obs) => {
                const podeEditar = isAdmin || obs.autorUserId === session.user.id
                return (
                  <div key={obs.id} className="border border-gray-200 rounded-md p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-500">
                        {obs.autorNome} —{' '}
                        {new Date(obs.criadoEm).toLocaleDateString('pt-BR', {
                          day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
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
              }}
            />
          )}
        </div>
      </CollapsibleSection>

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
