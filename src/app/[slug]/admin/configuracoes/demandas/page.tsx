import { notFound } from 'next/navigation'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { prisma } from '@/lib/prisma'
import { getGabineteBySlug } from '@/lib/gabinete'
import { corTextoContraste } from '@/lib/cor-contraste'
import { salvarConfiguracao } from '@/actions/admin/salvar-configuracao'
import { criarAreaDemanda } from '@/actions/admin/criar-area-demanda'
import { excluirAreaDemanda } from '@/actions/admin/excluir-area-demanda'
import { editarAreaDemanda } from '@/actions/admin/editar-area-demanda'
import { restaurarPessoa } from '@/actions/admin/restaurar-pessoa'

export default async function DemandasConfigPage({ params }: { params: { slug: string } }) {
  const gabinete = await getGabineteBySlug(params.slug)
  if (!gabinete) notFound()
  const corTexto = corTextoContraste(gabinete.corPrimaria)

  const cookieStore = cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } }
  )
  const { data: { session } } = await supabase.auth.getSession()
  const isSuperAdmin = session?.user?.app_metadata?.role === 'super-admin'

  const [config, areas, pessoasExcluidas] = await Promise.all([
    prisma.configuracaoSistema.findUnique({ where: { gabineteId: gabinete.id } }),
    prisma.areaDemanda.findMany({
      where: { gabineteId: gabinete.id },
      orderBy: { nome: 'asc' },
      select: { id: true, nome: true, _count: { select: { demandas: true } } },
    }),
    isSuperAdmin
      ? prisma.pessoa.findMany({
          where: { gabineteId: gabinete.id, deletedAt: { not: null } },
          orderBy: { deletedAt: 'desc' },
          select: { id: true, nome: true, whatsapp: true, deletedAt: true },
        })
      : Promise.resolve([]),
  ])

  const prazoAtual = config?.prazoDemandasHoras ?? 72
  const alertaAtual = config?.alertaExpiracaoHoras ?? 12

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow-sm p-6 space-y-4">
        <h2 className="text-base font-semibold">Prazos</h2>
        <form action={salvarConfiguracao} className="space-y-4">
          <input type="hidden" name="slug" value={params.slug} />
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Prazo padrão de desfecho (horas)
            </label>
            <input
              name="prazoDemandasHoras"
              type="number"
              min={1}
              required
              defaultValue={prazoAtual}
              className="mt-1 block w-40 border border-gray-300 rounded-md px-3 py-2 text-sm"
            />
            <p className="mt-1 text-xs text-gray-500">Horas a partir da abertura da demanda. Padrão: 72h</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Alerta de expiração (horas antes)
            </label>
            <input
              name="alertaExpiracaoHoras"
              type="number"
              min={1}
              required
              defaultValue={alertaAtual}
              className="mt-1 block w-40 border border-gray-300 rounded-md px-3 py-2 text-sm"
            />
            <p className="mt-1 text-xs text-gray-500">Envia alerta por e-mail X horas antes de expirar. Padrão: 12h</p>
          </div>
          <button
            type="submit"
            style={{ backgroundColor: gabinete.corPrimaria, color: corTexto }}
            className="px-4 py-2 rounded-md text-sm font-medium"
          >
            Salvar
          </button>
        </form>
      </div>

      <div className="bg-white rounded-lg shadow-sm p-6 space-y-4">
        <h2 className="text-base font-semibold">Áreas da Demanda</h2>
        <form action={criarAreaDemanda} className="flex gap-2">
          <input type="hidden" name="slug" value={params.slug} />
          <input
            name="nome"
            required
            placeholder="Nome da nova área"
            className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm"
          />
          <button
            type="submit"
            style={{ backgroundColor: gabinete.corPrimaria, color: corTexto }}
            className="px-4 py-2 rounded-md text-sm font-medium"
          >
            Criar
          </button>
        </form>
        <ul className="divide-y divide-gray-200 border border-gray-200 rounded-md">
          {areas.map((a) => (
            <li key={a.id} className="px-4 py-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-900">
                  {a.nome}
                  <span className="ml-2 text-xs text-gray-400">({a._count.demandas} demandas)</span>
                </span>
                {a._count.demandas === 0 && (
                  <form action={excluirAreaDemanda}>
                    <input type="hidden" name="slug" value={params.slug} />
                    <input type="hidden" name="areaId" value={a.id} />
                    <button type="submit" className="text-red-600 text-xs hover:underline">Excluir</button>
                  </form>
                )}
              </div>
              <details className="mt-1">
                <summary className="cursor-pointer text-blue-600 text-xs hover:underline">Renomear</summary>
                <form action={editarAreaDemanda} className="mt-2 flex gap-2">
                  <input type="hidden" name="slug" value={params.slug} />
                  <input type="hidden" name="areaId" value={a.id} />
                  <input name="nome" defaultValue={a.nome} required className="border border-gray-300 rounded-md px-2 py-1 text-sm" />
                  <button
                    type="submit"
                    style={{ backgroundColor: gabinete.corPrimaria, color: corTexto }}
                    className="px-3 py-1 rounded-md text-xs"
                  >
                    Salvar
                  </button>
                </form>
              </details>
            </li>
          ))}
          {areas.length === 0 && (
            <li className="px-4 py-3 text-sm text-gray-500">Nenhuma área cadastrada</li>
          )}
        </ul>
      </div>

      {isSuperAdmin && pessoasExcluidas.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm p-6 space-y-4">
          <h2 className="text-base font-semibold text-red-700">Cadastros excluídos</h2>
          <ul className="divide-y divide-gray-200 border border-gray-200 rounded-md">
            {pessoasExcluidas.map((p) => (
              <li key={p.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-gray-900">{p.nome}</p>
                  <p className="text-xs text-gray-500">
                    {p.whatsapp} · excluído em {p.deletedAt!.toLocaleDateString('pt-BR')}
                  </p>
                </div>
                <form action={restaurarPessoa}>
                  <input type="hidden" name="slug" value={params.slug} />
                  <input type="hidden" name="pessoaId" value={p.id} />
                  <button type="submit" className="text-blue-600 text-xs hover:underline">
                    Restaurar
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
