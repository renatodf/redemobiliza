import { notFound } from 'next/navigation'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { prisma } from '@/lib/prisma'
import { getGabineteBySlug } from '@/lib/gabinete'
import { salvarConfiguracao } from '@/actions/admin/salvar-configuracao'
import { criarAreaDemanda } from '@/actions/admin/criar-area-demanda'
import { excluirAreaDemanda } from '@/actions/admin/excluir-area-demanda'
import { editarAreaDemanda } from '@/actions/admin/editar-area-demanda'
import { criarProfissao } from '@/actions/admin/criar-profissao'
import { desativarProfissao } from '@/actions/admin/desativar-profissao'
import { criarRegiao } from '@/actions/admin/criar-regiao'
import { desativarRegiao } from '@/actions/admin/desativar-regiao'
import { criarSegmento } from '@/actions/admin/criar-segmento'
import { inativarSegmento } from '@/actions/admin/inativar-segmento'
import { salvarPersonalizacao } from '@/actions/admin/salvar-personalizacao'
import { uploadLogo } from '@/actions/admin/upload-logo'
import { uploadBanner } from '@/actions/admin/upload-banner'
import { restaurarPessoa } from '@/actions/admin/restaurar-pessoa'

export default async function ConfiguracoesPage({ params }: { params: { slug: string } }) {
  const gabinete = await getGabineteBySlug(params.slug)
  if (!gabinete) notFound()

  const cookieStore = cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } }
  )
  const { data: { session } } = await supabase.auth.getSession()
  const isSuperAdmin = session?.user?.app_metadata?.role === 'super-admin'

  const [config, areas, profissoes, regioes, segmentos, pessoasExcluidas] = await Promise.all([
    prisma.configuracaoSistema.findUnique({ where: { gabineteId: gabinete.id } }),
    prisma.areaDemanda.findMany({
      where: { gabineteId: gabinete.id },
      orderBy: { nome: 'asc' },
      select: { id: true, nome: true, _count: { select: { demandas: true } } },
    }),
    prisma.profissao.findMany({
      where: { gabineteId: gabinete.id, ativa: true },
      orderBy: { nome: 'asc' },
      select: { id: true, nome: true },
    }),
    prisma.regiao.findMany({
      where: { gabineteId: gabinete.id, ativa: true },
      orderBy: { nome: 'asc' },
      select: { id: true, nome: true },
    }),
    prisma.segmento.findMany({
      where: { gabineteId: gabinete.id, status: 'ativo' },
      orderBy: { nome: 'asc' },
      select: { id: true, nome: true },
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
    <div className="max-w-2xl mx-auto py-8 px-4 space-y-6">
      <h1 className="text-2xl font-bold">Configurações</h1>

      {/* Demandas */}
      <div className="bg-white rounded-lg shadow-sm p-6 space-y-4">
        <h2 className="text-base font-semibold">Demandas</h2>
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
          <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium">
            Salvar
          </button>
        </form>
      </div>

      {/* Áreas da Demanda */}
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
          <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium">
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
                  <button type="submit" className="bg-blue-600 text-white px-3 py-1 rounded-md text-xs">Salvar</button>
                </form>
              </details>
            </li>
          ))}
          {areas.length === 0 && (
            <li className="px-4 py-3 text-sm text-gray-500">Nenhuma área cadastrada</li>
          )}
        </ul>
      </div>

      {/* Profissões */}
      <div className="bg-white rounded-lg shadow-sm p-6 space-y-4">
        <h2 className="text-base font-semibold">Profissões</h2>
        <form action={criarProfissao} className="flex gap-2">
          <input type="hidden" name="slug" value={params.slug} />
          <input
            name="nome"
            required
            placeholder="Nome da nova profissão"
            className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm"
          />
          <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium">
            Adicionar
          </button>
        </form>
        <ul className="divide-y divide-gray-200 border border-gray-200 rounded-md">
          {profissoes.map((p) => (
            <li key={p.id} className="flex items-center justify-between px-4 py-3">
              <span className="text-sm">{p.nome}</span>
              <form action={desativarProfissao}>
                <input type="hidden" name="slug" value={params.slug} />
                <input type="hidden" name="profissaoId" value={p.id} />
                <button type="submit" className="text-red-600 text-xs hover:underline">Desativar</button>
              </form>
            </li>
          ))}
          {profissoes.length === 0 && (
            <li className="px-4 py-3 text-sm text-gray-500">Nenhuma profissão ativa</li>
          )}
        </ul>
      </div>

      {/* Cidades */}
      <div className="bg-white rounded-lg shadow-sm p-6 space-y-4">
        <h2 className="text-base font-semibold">Cidades</h2>
        <form action={criarRegiao} className="flex gap-2">
          <input type="hidden" name="slug" value={params.slug} />
          <input
            name="nome"
            required
            placeholder="Nome da nova cidade"
            className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm"
          />
          <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium">
            Adicionar
          </button>
        </form>
        <ul className="divide-y divide-gray-200 border border-gray-200 rounded-md">
          {regioes.map((r) => (
            <li key={r.id} className="flex items-center justify-between px-4 py-3">
              <span className="text-sm">{r.nome}</span>
              <form action={desativarRegiao}>
                <input type="hidden" name="slug" value={params.slug} />
                <input type="hidden" name="regiaoId" value={r.id} />
                <button type="submit" className="text-red-600 text-xs hover:underline">Desativar</button>
              </form>
            </li>
          ))}
          {regioes.length === 0 && (
            <li className="px-4 py-3 text-sm text-gray-500">Nenhuma cidade cadastrada</li>
          )}
        </ul>
      </div>

      {/* Segmentos */}
      <div className="bg-white rounded-lg shadow-sm p-6 space-y-4">
        <h2 className="text-base font-semibold">Segmentos</h2>
        <form action={criarSegmento} className="flex gap-2">
          <input type="hidden" name="slug" value={params.slug} />
          <input
            name="nome"
            required
            placeholder="Nome do novo segmento"
            className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm"
          />
          <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium">
            Criar
          </button>
        </form>
        <ul className="divide-y divide-gray-200 border border-gray-200 rounded-md">
          {segmentos.map((s) => (
            <li key={s.id} className="flex items-center justify-between px-4 py-3">
              <Link
                href={`/${params.slug}/admin/segmentos/${s.id}`}
                className="text-sm text-blue-600 hover:underline"
              >
                {s.nome}
              </Link>
              <form action={inativarSegmento}>
                <input type="hidden" name="slug" value={params.slug} />
                <input type="hidden" name="segmentoId" value={s.id} />
                <button type="submit" className="text-red-600 text-xs hover:underline">Inativar</button>
              </form>
            </li>
          ))}
          {segmentos.length === 0 && (
            <li className="px-4 py-3 text-sm text-gray-500">Nenhum segmento ativo</li>
          )}
        </ul>
      </div>

      {/* Personalização do Layout */}
      <div className="bg-white rounded-lg shadow-sm p-6 space-y-6">
        <h2 className="text-base font-semibold">Personalização do Layout</h2>

        <form action={salvarPersonalizacao} className="space-y-4">
          <input type="hidden" name="slug" value={params.slug} />
          <div>
            <label className="block text-sm font-medium text-gray-700">Nome do sistema</label>
            <input
              name="nomeSistema"
              defaultValue={gabinete.nomeSistema ?? ''}
              className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              placeholder="Ex: Mobiliza Fulano"
            />
          </div>
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700">Cor primária</label>
              <input
                name="corPrimaria"
                type="color"
                defaultValue={gabinete.corPrimaria ?? '#3B82F6'}
                className="mt-1 h-10 w-full border border-gray-300 rounded-md"
              />
            </div>
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700">Cor secundária</label>
              <input
                name="corSecundaria"
                type="color"
                defaultValue={gabinete.corSecundaria ?? '#1E40AF'}
                className="mt-1 h-10 w-full border border-gray-300 rounded-md"
              />
            </div>
          </div>
          <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700">
            Salvar
          </button>
        </form>

        <div className="border-t border-gray-100 pt-6 space-y-3">
          <h3 className="text-sm font-semibold text-gray-700">Logo</h3>
          {gabinete.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={gabinete.logoUrl} alt="Logo atual" className="h-16 object-contain" />
          )}
          <form action={uploadLogo} encType="multipart/form-data">
            <input type="hidden" name="slug" value={params.slug} />
            <input name="logo" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="block text-sm" />
            <button type="submit" className="mt-2 bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700">
              Enviar logo
            </button>
          </form>
        </div>

        <div className="border-t border-gray-100 pt-6 space-y-3">
          <h3 className="text-sm font-semibold text-gray-700">Banner</h3>
          {gabinete.imagemBannerUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={gabinete.imagemBannerUrl} alt="Banner atual" className="w-full h-32 object-cover rounded" />
          )}
          <form action={uploadBanner} encType="multipart/form-data">
            <input type="hidden" name="slug" value={params.slug} />
            <input name="banner" type="file" accept="image/png,image/jpeg,image/webp" className="block text-sm" />
            <button type="submit" className="mt-2 bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700">
              Enviar banner
            </button>
          </form>
        </div>
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
