import { notFound } from 'next/navigation'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { prisma } from '@/lib/prisma'
import { getGabineteBySlug } from '@/lib/gabinete'
import { atualizarObservacaoDemandaMobilizador as atualizarObservacaoDemandaAction } from '@/actions/mobilizador/atualizar-observacao-demanda'
import { alterarPrazoDemandaMobilizador as alterarPrazoDemandaAction } from '@/actions/mobilizador/alterar-prazo-demanda'
import { marcarDesfechoDemandaMobilizador as marcarDesfechoAction } from '@/actions/mobilizador/marcar-desfecho-demanda'

// Wrappers para actions que retornam valores, convertendo para void para compatibilidade com form action
async function atualizarObservacaoDemandaMobilizador(formData: FormData) {
  'use server'
  await atualizarObservacaoDemandaAction(formData)
}

async function alterarPrazoDemandaMobilizador(formData: FormData) {
  'use server'
  await alterarPrazoDemandaAction(formData)
}

async function marcarDesfechoDemandaMobilizador(formData: FormData) {
  'use server'
  await marcarDesfechoAction(formData)
}

const STATUS_CONFIG = {
  aberta: { label: 'Em aberto', cor: 'bg-yellow-100 text-yellow-800' },
  expirada: { label: 'Expirada', cor: 'bg-orange-100 text-orange-800' },
  atendida: { label: 'Atendida', cor: 'bg-green-100 text-green-800' },
  nao_atendida: { label: 'Não atendida', cor: 'bg-red-100 text-red-800' },
} as const

export default async function DetalheDemandaMobilizadorPage({
  params,
}: {
  params: { slug: string; demandaId: string }
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

  const mobilizador = await prisma.pessoa.findFirst({
    where: { userId: session.user.id, gabineteId: gabinete.id, isMobilizador: true },
    select: { id: true },
  })
  if (!mobilizador) notFound()

  const demanda = await prisma.demanda.findFirst({
    where: { id: params.demandaId, gabineteId: gabinete.id, responsavelId: mobilizador.id },
    include: {
      solicitante: { select: { nome: true, whatsapp: true } },
      area: { select: { nome: true } },
      historico: { orderBy: { criadoEm: 'asc' }, include: { autor: { select: { nome: true } } } },
    },
  })
  if (!demanda) notFound()

  const cfg = STATUS_CONFIG[demanda.status as keyof typeof STATUS_CONFIG] ?? { label: demanda.status, cor: 'bg-gray-100 text-gray-800' }
  const podeEncerrar = demanda.status === 'aberta' || demanda.status === 'expirada'
  const prazoISO = demanda.prazoDesfecho.toISOString().slice(0, 16)

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Link href={`/${params.slug}/mobilizador/rede`} className="hover:underline">← Voltar</Link>
      </div>

      <div className="bg-white rounded-lg p-6 shadow-sm space-y-3">
        <div className="flex items-start justify-between gap-4">
          <h1 className="text-lg font-bold text-gray-900">{demanda.titulo}</h1>
          <span className={`shrink-0 text-xs px-2 py-1 rounded-full font-medium ${cfg.cor}`}>{cfg.label}</span>
        </div>
        <p className="text-sm text-gray-700 whitespace-pre-wrap">{demanda.descricao}</p>
        <div className="flex flex-wrap gap-3 text-xs text-gray-500 border-t border-gray-100 pt-3">
          <span>Área: <strong>{demanda.area.nome}</strong></span>
          <span>Solicitante: <strong>{demanda.solicitante.nome}</strong> · {demanda.solicitante.whatsapp}</span>
          <span className={demanda.prazoAlterado ? 'text-orange-600 font-medium' : ''}>
            Prazo: <strong>{demanda.prazoDesfecho.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</strong>
          </span>
        </div>
      </div>

      <div className="bg-white rounded-lg p-6 shadow-sm space-y-3">
        <h2 className="text-base font-semibold">Observação</h2>
        <form action={atualizarObservacaoDemandaMobilizador} className="space-y-2">
          <input type="hidden" name="slug" value={params.slug} />
          <input type="hidden" name="demandaId" value={demanda.id} />
          <textarea
            name="observacao"
            rows={3}
            defaultValue={demanda.observacao ?? ''}
            placeholder="Adicionar observação..."
            className="block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
          />
          <button type="submit" className="bg-gray-700 text-white px-4 py-2 rounded-md text-sm">
            Salvar
          </button>
        </form>
      </div>

      {podeEncerrar && (
        <>
          <div className="bg-white rounded-lg p-6 shadow-sm space-y-3">
            <h2 className="text-base font-semibold">Alterar prazo</h2>
            <form action={alterarPrazoDemandaMobilizador} className="space-y-3">
              <input type="hidden" name="slug" value={params.slug} />
              <input type="hidden" name="demandaId" value={demanda.id} />
              <input name="novoPrazo" type="datetime-local" defaultValue={prazoISO} required className="border border-gray-300 rounded-md px-3 py-2 text-sm" />
              <textarea name="justificativa" required rows={2} placeholder="Justificativa..." className="block w-full border border-gray-300 rounded-md px-3 py-2 text-sm" />
              <button type="submit" className="bg-orange-600 text-white px-4 py-2 rounded-md text-sm">Alterar prazo</button>
            </form>
          </div>

          <div className="bg-white rounded-lg p-6 shadow-sm space-y-3">
            <h2 className="text-base font-semibold">Encerrar demanda</h2>
            <div className="flex gap-3">
              <form action={marcarDesfechoDemandaMobilizador}>
                <input type="hidden" name="slug" value={params.slug} />
                <input type="hidden" name="demandaId" value={demanda.id} />
                <input type="hidden" name="desfecho" value="atendida" />
                <button type="submit" className="bg-green-600 text-white px-4 py-2 rounded-md text-sm font-medium">✓ Atendida</button>
              </form>
              <form action={marcarDesfechoDemandaMobilizador}>
                <input type="hidden" name="slug" value={params.slug} />
                <input type="hidden" name="demandaId" value={demanda.id} />
                <input type="hidden" name="desfecho" value="nao_atendida" />
                <button type="submit" className="bg-red-600 text-white px-4 py-2 rounded-md text-sm font-medium">✗ Não atendida</button>
              </form>
            </div>
          </div>
        </>
      )}

      <div className="bg-white rounded-lg p-6 shadow-sm space-y-4">
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
