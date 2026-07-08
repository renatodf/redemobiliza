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
import ExcluirObservacaoButton from './ExcluirObservacaoButton'
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
import { corTextoContraste } from '@/lib/cor-contraste'
import BancoTalentosDialog from './BancoTalentosDialog'
import { IconeEditar } from '@/components/admin/TableIcons'

export default async function FichaPessoaPage({
  params,
  searchParams,
}: {
  params: { slug: string; pessoaId: string }
  searchParams: { editar?: string }
}) {
  const gabinete = await getGabineteBySlug(params.slug)
  if (!gabinete) notFound()
  const corTextoSecundaria = corTextoContraste(gabinete.corSecundaria)

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
      bancoTalentos: { include: { areas: { select: { areaColocacaoId: true } } } },
    },
  })
  if (!pessoa) notFound()

  const [regioes, profissoes, demandas, totalRede, areasColocacao] = await Promise.all([
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
      select: { id: true, titulo: true, status: true, criadoEm: true },
    }),
    pessoa.isMobilizador
      ? prisma.vinculoRede.count({ where: { indicadoPorId: pessoa.id, deletedAt: null } })
      : Promise.resolve(0),
    prisma.areaColocacao.findMany({
      where: { gabineteId: gabinete.id, status: 'ativa' },
      orderBy: { nome: 'asc' },
      select: { id: true, nome: true },
    }),
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
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-[13px] text-[rgba(113,113,113,0.65)]">Início / Usuários</p>
        <Link
          href={`/${params.slug}/admin/pessoas`}
          className="text-sm text-black/40 hover:text-black/70 flex items-center gap-1.5"
        >
          <svg width="8" height="10" viewBox="0 0 8 10" fill="none" aria-hidden>
            <path d="M7 1 2 5l5 4" stroke="#979797" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Voltar
        </Link>
      </div>

      <div className="flex items-start justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <FotoPerfilAvatar
            fotoUrl={pessoa.fotoUrl}
            pessoaId={pessoa.id}
            slug={params.slug}
            canEdit={isAdmin || pessoa.userId === session.user.id}
          />
          <div>
            <p className="text-xs text-[#686868]">Nome</p>
            <p className="text-2xl font-bold text-gray-900">{pessoa.nome}</p>
            <p className="text-xs text-[#686868] mt-2">Email</p>
            <p className="text-sm text-[#757575]">{pessoa.email ?? '—'}</p>
          </div>
        </div>
        <div className="text-right space-y-2">
          <div className="flex items-center gap-3 justify-end">
            {isAdmin && (
              <label htmlFor="editar-dados-toggle" aria-label="Editar dados" className="cursor-pointer">
                <IconeEditar />
              </label>
            )}
            {isAdmin && <ExcluirPessoaButton slug={params.slug} pessoaId={params.pessoaId} iconOnly />}
          </div>
          <p className="text-xs text-[#686868]">
            Último Acesso<br />
            <span className="text-[#757575]">{ultimoAcesso ?? '—'}</span>
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
        {isAdmin && (
          <BancoTalentosDialog
            slug={params.slug}
            pessoaId={pessoa.id}
            primeiroNome={pessoa.nome.split(' ')[0]}
            jaCadastrado={!!pessoa.bancoTalentos}
            areasDisponiveis={areasColocacao}
            corPrimaria={gabinete.corPrimaria}
            bancoTalentos={
              pessoa.bancoTalentos
                ? {
                    curriculoUrl: pessoa.bancoTalentos.curriculoUrl,
                    prioridade: pessoa.bancoTalentos.prioridade,
                    isPcd: pessoa.bancoTalentos.isPcd,
                    observacao: pessoa.bancoTalentos.observacao,
                    colocado: pessoa.bancoTalentos.colocado,
                    areaIds: pessoa.bancoTalentos.areas.map((a) => a.areaColocacaoId),
                  }
                : null
            }
          />
        )}
      </div>

      <section className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
          <div>
            <p className="text-xs text-[#686868]">Data de Nascimento</p>
            <p className="text-[#757575]">{pessoa.nascimento ? pessoa.nascimento.toLocaleDateString('pt-BR') : '—'}</p>
          </div>
          <div>
            <p className="text-xs text-[#686868]">CPF</p>
            <p className="text-[#757575]">{pessoa.cpf ?? '—'}</p>
          </div>
          <div>
            <p className="text-xs text-[#686868]">WhatsApp</p>
            <p className="text-[#757575]">{pessoa.whatsapp}</p>
          </div>
          <div>
            <p className="text-xs text-[#686868]">Telefone Fixo</p>
            <p className="text-[#757575]">{pessoa.telefoneFixo ?? '—'}</p>
          </div>
          <div className="col-span-2">
            <p className="text-xs text-[#686868]">Endereço</p>
            <p className="text-[#757575]">{[pessoa.logradouro, pessoa.numero, pessoa.complemento].filter(Boolean).join(', ') || '—'}</p>
          </div>
          <div>
            <p className="text-xs text-[#686868]">CEP</p>
            <p className="text-[#757575]">{pessoa.cep ?? '—'}</p>
          </div>
          <div>
            <p className="text-xs text-[#686868]">Cidade</p>
            <p className="text-[#757575]">{pessoa.regiao?.nome ?? '—'}</p>
          </div>
          <div>
            <p className="text-xs text-[#686868]">Bairro</p>
            <p className="text-[#757575]">{pessoa.bairro ?? '—'}</p>
          </div>
          <div>
            <p className="text-xs text-[#686868]">Sexo</p>
            <p className="text-[#757575] capitalize">{pessoa.genero ?? '—'}</p>
          </div>
          <div>
            <p className="text-xs text-[#686868]">Orientação Sexual</p>
            <p className="text-[#757575]">{pessoa.orientacaoSexual ?? '—'}</p>
          </div>
          <div>
            <p className="text-xs text-[#686868]">Religião</p>
            <p className="text-[#757575]">{pessoa.religiao ?? '—'}</p>
          </div>
          <div>
            <p className="text-xs text-[#686868]">Escolaridade</p>
            <p className="text-[#757575]">{pessoa.escolaridade ?? '—'}</p>
          </div>
          <div>
            <p className="text-xs text-[#686868]">Tipo de Conta</p>
            <p className="text-[#757575]">{tipoConta}</p>
          </div>
          <div>
            <p className="text-xs text-[#686868]">Profissão</p>
            <p className="text-[#757575]">{pessoa.profissao?.nome ?? '—'}</p>
          </div>
        </div>

        <div className="border-t border-gray-100 pt-3">
          <input
            type="checkbox"
            id="editar-dados-toggle"
            className="peer hidden"
            defaultChecked={searchParams.editar === '1'}
          />
          <label
            htmlFor="editar-dados-toggle"
            className="text-sm text-blue-600 hover:underline cursor-pointer inline-block peer-checked:hidden"
          >
            Editar dados
          </label>
          <label
            htmlFor="editar-dados-toggle"
            className="text-sm text-gray-500 hover:underline cursor-pointer hidden peer-checked:inline-block"
          >
            Fechar edição
          </label>
          <div className="mt-3 hidden peer-checked:block">
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
                cpf: pessoa.cpf,
                telefoneFixo: pessoa.telefoneFixo,
                orientacaoSexual: pessoa.orientacaoSexual,
                religiao: pessoa.religiao,
                escolaridade: pessoa.escolaridade,
              }}
              regioes={regioes}
              profissoes={profissoes}
              corPrimaria={gabinete.corPrimaria}
            />
          </div>
        </div>
      </section>

      {(redeInfo || pessoa.isMobilizador) && (
        <section className="bg-gray-50 rounded-lg p-4 grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
          <div className="flex items-center gap-2">
            {redeInfo && <Avatar fotoUrl={redeInfo.fotoUrl} nome={redeInfo.nome} size={28} />}
            <div>
              <p className="text-xs text-[#686868]">Cadastrado na Rede</p>
              <p className="text-[#757575]">{redeInfo?.nome ?? '—'}</p>
            </div>
          </div>
          <div>
            <p className="text-xs text-[#686868]">Criador da Rede</p>
            <p className="text-[#757575]">{redeInfo?.nome ?? '—'}</p>
          </div>
          <div>
            <p className="text-xs text-[#686868]">Cadastrados na Rede</p>
            {totalRede > 0 ? (
              <Link
                href={`/${params.slug}/admin/pessoas?rede=${pessoa.id}`}
                className="text-lg font-semibold hover:underline"
                style={{ color: gabinete.corPrimaria }}
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
        <SegmentPills segmentos={segmentosPessoa} maxVisiveis={10} corPrimaria={gabinete.corPrimaria} />
      </section>

      <CollapsibleSection
        title="Demandas do Usuário"
        actions={
          <Link
            href={`/${params.slug}/admin/demandas/nova?solicitanteId=${pessoa.id}`}
            style={{ backgroundColor: gabinete.corSecundaria, color: corTextoSecundaria }}
            className="text-xs px-3 py-1.5 rounded-md hover:opacity-90 font-medium"
          >
            + CRIAR NOVA DEMANDA
          </Link>
        }
      >
        {demandas.length === 0 ? (
          <p className="text-sm text-gray-500">Nenhuma demanda registrada.</p>
        ) : (
          <VerMaisList
            porPagina={5}
            itens={demandas.map((d) => {
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
            })}
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
            <button
              type="submit"
              style={{ backgroundColor: gabinete.corSecundaria, color: corTextoSecundaria }}
              className="px-4 py-2 rounded-md text-sm font-medium"
            >
              + CRIAR NOVA OBSERVAÇÃO
            </button>
          </div>
        </form>

        <div className="mt-4">
          {pessoa.observacoes.length === 0 ? (
            <p className="text-sm text-gray-500">Nenhuma observação ainda.</p>
          ) : (
            <VerMaisList
              porPagina={5}
              itens={pessoa.observacoes.map((obs) => {
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
                        <div className="flex items-center gap-2">
                          <label htmlFor={`editar-obs-${obs.id}`} className="cursor-pointer" aria-label="Editar observação">
                            <IconeEditar />
                          </label>
                          <ExcluirObservacaoButton slug={params.slug} pessoaId={pessoa.id} observacaoId={obs.id} />
                        </div>
                      )}
                    </div>
                    <p className="text-sm text-gray-800 whitespace-pre-wrap">{obs.texto}</p>
                    {podeEditar && (
                      <>
                        <input type="checkbox" id={`editar-obs-${obs.id}`} className="peer hidden" />
                        <form action={editarObservacao} className="space-y-1 hidden peer-checked:block">
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
                      </>
                    )}
                  </div>
                )
              })}
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
