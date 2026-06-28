import { notFound } from 'next/navigation'
import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { getGabineteBySlug } from '@/lib/gabinete'
import { atualizarObservacaoDemanda as atualizarObservacaoDemandaAction } from '@/actions/admin/atualizar-observacao-demanda'
import { alterarPrazoDemanda as alterarPrazoDemandaAction } from '@/actions/admin/alterar-prazo-demanda'
import { marcarDesfechoDemanda as marcarDesfechoDemandaAction } from '@/actions/admin/marcar-desfecho-demanda'
import { reatribuirResponsavel as reatribuirResponsavelAction } from '@/actions/admin/reatribuir-responsavel'

// Wrappers para actions que retornam valores, convertendo para void para compatibilidade com form action
async function atualizarObservacaoDemanda(formData: FormData) {
  'use server'
  await atualizarObservacaoDemandaAction(formData)
}

async function alterarPrazoDemanda(formData: FormData) {
  'use server'
  await alterarPrazoDemandaAction(formData)
}

async function marcarDesfechoDemanda(formData: FormData) {
  'use server'
  await marcarDesfechoDemandaAction(formData)
}

async function reatribuirResponsavel(formData: FormData) {
  'use server'
  await reatribuirResponsavelAction(formData)
}

const STATUS_CONFIG = {
  aberta: { label: 'Em aberto', cor: 'bg-yellow-100 text-yellow-800' },
  expirada: { label: 'Expirada', cor: 'bg-orange-100 text-orange-800' },
  atendida: { label: 'Atendida', cor: 'bg-green-100 text-green-800' },
  nao_atendida: { label: 'Não atendida', cor: 'bg-red-100 text-red-800' },
} as const

export default async function DetalheDemandaPage({
  params,
}: {
  params: { slug: string; demandaId: string }
}) {
  const gabinete = await getGabineteBySlug(params.slug)
  if (!gabinete) notFound()

  const [demanda, colaboradores] = await Promise.all([
    prisma.demanda.findFirst({
      where: { id: params.demandaId, gabineteId: gabinete.id },
      include: {
        solicitante: { select: { nome: true, whatsapp: true, bairro: true, logradouro: true, numero: true, complemento: true, cep: true, regiao: { select: { nome: true } } } },
        responsavel: { select: { id: true, nome: true } },
        area: { select: { nome: true } },
        criadoPor: { select: { nome: true } },
        historico: { orderBy: { criadoEm: 'asc' }, include: { autor: { select: { nome: true } } } },
      },
    }),
    prisma.pessoa.findMany({
      where: { gabineteId: gabinete.id, isMobilizador: true, isColaborador: true },
      orderBy: { nome: 'asc' },
      select: { id: true, nome: true },
    }),
  ])

  if (!demanda) notFound()

  const cfg = STATUS_CONFIG[demanda.status as keyof typeof STATUS_CONFIG] ?? { label: demanda.status, cor: 'bg-gray-100 text-gray-800' }
  const podeEncerrar = demanda.status === 'aberta' || demanda.status === 'expirada'
  const prazoISO = demanda.prazoDesfecho.toISOString().slice(0, 16)

  const endereco = [demanda.solicitante.logradouro, demanda.solicitante.numero, demanda.solicitante.complemento, demanda.solicitante.bairro, demanda.solicitante.cep]
    .filter(Boolean).join(', ')

  return (
    <div className="max-w-3xl mx-auto py-8 px-4 space-y-6">
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Link href={`/${params.slug}/admin/demandas`} className="hover:underline">Demandas</Link>
        <span>/</span>
        <span className="text-gray-900 font-medium">{demanda.titulo}</span>
      </div>

      {/* Cabeçalho */}
      <div className="bg-white rounded-lg shadow-sm p-6 space-y-3">
        <div className="flex items-start justify-between gap-4">
          <h1 className="text-xl font-bold text-gray-900">{demanda.titulo}</h1>
          <span className={`shrink-0 inline-block text-xs px-2 py-1 rounded-full font-medium ${cfg.cor}`}>
            {cfg.label}
          </span>
        </div>
        <p className="text-sm text-gray-700 whitespace-pre-wrap">{demanda.descricao}</p>
        <div className="flex flex-wrap gap-4 text-xs text-gray-500 border-t border-gray-100 pt-3">
          <span>Área: <strong>{demanda.area.nome}</strong></span>
          <span>Criado em: <strong>{demanda.criadoEm.toLocaleDateString('pt-BR')}</strong> por {demanda.criadoPor.nome}</span>
          <span className={demanda.prazoAlterado ? 'text-orange-600 font-medium' : ''}>
            Prazo: <strong>{demanda.prazoDesfecho.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</strong>
            {demanda.prazoAlterado && ' ⚑ alterado'}
          </span>
        </div>
      </div>

      {/* Solicitante */}
      <div className="bg-white rounded-lg shadow-sm p-6 space-y-1">
        <h2 className="text-base font-semibold mb-2">Solicitante</h2>
        <p className="text-sm font-medium text-gray-900">{demanda.solicitante.nome}</p>
        <p className="text-sm text-gray-600">{demanda.solicitante.whatsapp}</p>
        {demanda.solicitante.regiao && <p className="text-sm text-gray-600">Região: {demanda.solicitante.regiao.nome}</p>}
        {endereco && <p className="text-sm text-gray-600">{endereco}</p>}
      </div>

      {/* Responsável */}
      <div className="bg-white rounded-lg shadow-sm p-6 space-y-3">
        <h2 className="text-base font-semibold">Responsável</h2>
        <p className="text-sm font-medium text-gray-900">{demanda.responsavel.nome}</p>
        <details className="text-sm">
          <summary className="cursor-pointer text-blue-600 hover:underline">Reatribuir responsável</summary>
          <form action={reatribuirResponsavel} className="mt-3 flex gap-2">
            <input type="hidden" name="slug" value={params.slug} />
            <input type="hidden" name="demandaId" value={demanda.id} />
            <select name="novoResponsavelId" required className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm">
              <option value="">Selecionar...</option>
              {colaboradores.filter((c) => c.id !== demanda.responsavel.id).map((c) => (
                <option key={c.id} value={c.id}>{c.nome}</option>
              ))}
            </select>
            <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm">
              Confirmar
            </button>
          </form>
        </details>
      </div>

      {/* Observação */}
      <div className="bg-white rounded-lg shadow-sm p-6 space-y-3">
        <h2 className="text-base font-semibold">Observação</h2>
        {demanda.observacao && (
          <p className="text-sm text-gray-700 whitespace-pre-wrap bg-gray-50 rounded p-3">{demanda.observacao}</p>
        )}
        <form action={atualizarObservacaoDemanda} className="space-y-2">
          <input type="hidden" name="slug" value={params.slug} />
          <input type="hidden" name="demandaId" value={demanda.id} />
          <textarea
            name="observacao"
            rows={3}
            defaultValue={demanda.observacao ?? ''}
            placeholder="Adicionar ou atualizar observação..."
            className="block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
          />
          <button type="submit" className="bg-gray-700 text-white px-4 py-2 rounded-md text-sm font-medium">
            Salvar observação
          </button>
        </form>
      </div>

      {/* Alterar prazo */}
      {podeEncerrar && (
        <div className="bg-white rounded-lg shadow-sm p-6 space-y-3">
          <h2 className="text-base font-semibold">Alterar prazo</h2>
          <form action={alterarPrazoDemanda} className="space-y-3">
            <input type="hidden" name="slug" value={params.slug} />
            <input type="hidden" name="demandaId" value={demanda.id} />
            <input
              name="novoPrazo"
              type="datetime-local"
              defaultValue={prazoISO}
              required
              className="border border-gray-300 rounded-md px-3 py-2 text-sm"
            />
            <textarea
              name="justificativa"
              required
              rows={2}
              placeholder="Justificativa obrigatória..."
              className="block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
            />
            <button type="submit" className="bg-orange-600 text-white px-4 py-2 rounded-md text-sm font-medium">
              Alterar prazo
            </button>
          </form>
        </div>
      )}

      {/* Desfecho */}
      {podeEncerrar && (
        <div className="bg-white rounded-lg shadow-sm p-6 space-y-3">
          <h2 className="text-base font-semibold">Desfecho</h2>
          <div className="flex gap-3">
            <form action={marcarDesfechoDemanda}>
              <input type="hidden" name="slug" value={params.slug} />
              <input type="hidden" name="demandaId" value={demanda.id} />
              <input type="hidden" name="desfecho" value="atendida" />
              <button type="submit" className="bg-green-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-green-700">
                ✓ Marcar como Atendida
              </button>
            </form>
            <form action={marcarDesfechoDemanda}>
              <input type="hidden" name="slug" value={params.slug} />
              <input type="hidden" name="demandaId" value={demanda.id} />
              <input type="hidden" name="desfecho" value="nao_atendida" />
              <button type="submit" className="bg-red-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-red-700">
                ✗ Marcar como Não Atendida
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Linha do tempo */}
      <div className="bg-white rounded-lg shadow-sm p-6 space-y-4">
        <h2 className="text-base font-semibold">Histórico</h2>
        <ol className="relative border-l border-gray-200 space-y-4 ml-3">
          {demanda.historico.map((mov) => (
            <li key={mov.id} className="ml-4">
              <div className="absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full border-2 border-white bg-gray-400" />
              <p className="text-xs text-gray-400">
                {mov.criadoEm.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                {' · '}{mov.autor?.nome ?? 'Sistema'}
              </p>
              <p className="text-sm text-gray-700 mt-0.5">{mov.descricao}</p>
            </li>
          ))}
        </ol>
      </div>
    </div>
  )
}
