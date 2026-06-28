import { notFound, redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { getGabineteBySlug } from '@/lib/gabinete'
import { criarDemanda } from '@/actions/admin/criar-demanda'
import { cadastrarSolicitante } from '@/actions/admin/cadastrar-solicitante'

export default async function NovaDemandaPage({
  params,
  searchParams,
}: {
  params: { slug: string }
  searchParams: { q?: string; solicitanteId?: string; cadastrar?: string }
}) {
  const gabinete = await getGabineteBySlug(params.slug)
  if (!gabinete) notFound()

  const [areas, colaboradores, config] = await Promise.all([
    prisma.areaDemanda.findMany({
      where: { gabineteId: gabinete.id },
      orderBy: { nome: 'asc' },
      select: { id: true, nome: true },
    }),
    prisma.pessoa.findMany({
      where: { gabineteId: gabinete.id, isMobilizador: true, isColaborador: true },
      orderBy: { nome: 'asc' },
      select: { id: true, nome: true },
    }),
    prisma.configuracaoSistema.findUnique({ where: { gabineteId: gabinete.id } }),
  ])

  const horasPrazo = config?.prazoDemandasHoras ?? 72
  const prazoSugerido = new Date(Date.now() + horasPrazo * 60 * 60 * 1000)
  const prazoISO = prazoSugerido.toISOString().slice(0, 16)

  // Busca de solicitante
  const q = searchParams.q?.trim() ?? ''
  const solicitanteId = searchParams.solicitanteId ?? ''

  const resultadosBusca = q
    ? await prisma.pessoa.findMany({
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
    : []

  const solicitante = solicitanteId
    ? await prisma.pessoa.findFirst({
        where: { id: solicitanteId, gabineteId: gabinete.id, deletedAt: null },
        select: { id: true, nome: true, whatsapp: true, bairro: true, logradouro: true, numero: true, complemento: true, cep: true, regiao: { select: { nome: true } } },
      })
    : null

  async function handleCriar(formData: FormData) {
    'use server'
    const result = await criarDemanda(formData)
    if (result.demandaId) {
      redirect(`/${params.slug}/admin/demandas/${result.demandaId}`)
    }
  }

  return (
    <div className="max-w-2xl mx-auto py-8 px-4 space-y-6">
      <h1 className="text-2xl font-bold">Nova Demanda</h1>

      {/* Busca de solicitante */}
      <div className="bg-white rounded-lg shadow-sm p-6 space-y-4">
        <h2 className="text-base font-semibold">Solicitante</h2>

        {solicitante ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-900">{solicitante.nome}</p>
                <p className="text-xs text-gray-500">{solicitante.whatsapp} · {solicitante.regiao?.nome ?? 'Sem região'}</p>
              </div>
              <a href={`/${params.slug}/admin/demandas/nova`} className="text-xs text-blue-600 hover:underline">
                Trocar
              </a>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <form method="GET" className="flex gap-2">
              <input
                name="q"
                defaultValue={q}
                placeholder="Buscar por nome ou WhatsApp..."
                className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm"
              />
              <button type="submit" className="bg-gray-600 text-white px-4 py-2 rounded-md text-sm">
                Buscar
              </button>
            </form>

            {resultadosBusca.length > 0 && (
              <ul className="divide-y divide-gray-100 border border-gray-200 rounded-md">
                {resultadosBusca.map((p) => (
                  <li key={p.id}>
                    <a
                      href={`/${params.slug}/admin/demandas/nova?solicitanteId=${p.id}`}
                      className="flex items-center justify-between px-4 py-3 hover:bg-gray-50"
                    >
                      <div>
                        <p className="text-sm font-medium text-gray-900">{p.nome}</p>
                        <p className="text-xs text-gray-500">{p.whatsapp}</p>
                      </div>
                      <span className="text-xs text-blue-600">Selecionar →</span>
                    </a>
                  </li>
                ))}
              </ul>
            )}

            {q && resultadosBusca.length === 0 && (
              <div className="space-y-3">
                <p className="text-sm text-gray-500">
                  Nenhuma pessoa encontrada para &ldquo;{q}&rdquo;.
                </p>
                {searchParams.cadastrar !== '1' ? (
                  <a
                    href={`/${params.slug}/admin/demandas/nova?q=${encodeURIComponent(q)}&cadastrar=1`}
                    className="inline-block text-sm text-blue-600 hover:underline"
                  >
                    + Cadastrar &ldquo;{q}&rdquo; como novo solicitante
                  </a>
                ) : (
                  <div className="border border-blue-200 rounded-lg p-4 bg-blue-50 space-y-3">
                    <p className="text-sm font-medium text-blue-800">Cadastrar novo solicitante</p>
                    <form action={cadastrarSolicitante} className="space-y-3">
                      <input type="hidden" name="slug" value={params.slug} />
                      <div>
                        <label className="block text-xs font-medium text-gray-700">Nome *</label>
                        <input
                          name="nome"
                          required
                          defaultValue={q}
                          className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700">WhatsApp *</label>
                        <input
                          name="whatsapp"
                          required
                          placeholder="(61) 9 9999-9999"
                          className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700">E-mail</label>
                        <input
                          name="email"
                          type="email"
                          className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                        />
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="submit"
                          className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700"
                        >
                          Cadastrar e selecionar
                        </button>
                        <a
                          href={`/${params.slug}/admin/demandas/nova?q=${encodeURIComponent(q)}`}
                          className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
                        >
                          Cancelar
                        </a>
                      </div>
                    </form>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Formulário principal — só aparece quando solicitante selecionado */}
      {solicitante && (
        <form action={handleCriar} className="space-y-6">
          <input type="hidden" name="slug" value={params.slug} />
          <input type="hidden" name="solicitanteId" value={solicitante.id} />

          <div className="bg-white rounded-lg shadow-sm p-6 space-y-4">
            <h2 className="text-base font-semibold">Dados da Demanda</h2>

            <div>
              <label className="block text-sm font-medium text-gray-700">Título *</label>
              <input
                name="titulo"
                required
                className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Descrição *</label>
              <textarea
                name="descricao"
                required
                rows={4}
                className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Área *</label>
                <select
                  name="areaId"
                  required
                  className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                >
                  <option value="">Selecionar...</option>
                  {areas.map((a) => (
                    <option key={a.id} value={a.id}>{a.nome}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Responsável *</label>
                <select
                  name="responsavelId"
                  required
                  className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                >
                  <option value="">Selecionar...</option>
                  {colaboradores.map((c) => (
                    <option key={c.id} value={c.id}>{c.nome}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">
                Prazo de desfecho (sugestão: {horasPrazo}h)
              </label>
              <input
                name="prazoDesfecho"
                type="datetime-local"
                defaultValue={prazoISO}
                className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              />
            </div>
          </div>

          <button
            type="submit"
            className="w-full bg-blue-600 text-white py-2.5 rounded-md text-sm font-medium hover:bg-blue-700"
          >
            Abrir Demanda
          </button>
        </form>
      )}
    </div>
  )
}
