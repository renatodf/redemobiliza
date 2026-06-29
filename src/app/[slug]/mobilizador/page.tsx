import { notFound } from 'next/navigation'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import QRCode from 'qrcode'
import { prisma } from '@/lib/prisma'
import { getGabineteBySlug } from '@/lib/gabinete'
import { getAppUrl } from '@/lib/app-url'
import { editarPessoa } from '@/actions/admin/editar-pessoa'
import AlterarSenhaDialog from './AlterarSenhaDialog'

export default async function MobilizadorPage({
  params,
}: {
  params: { slug: string }
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
    where: { userId: session.user.id, gabineteId: gabinete.id, isMobilizador: true },
    select: {
      id: true,
      nome: true,
      whatsapp: true,
      email: true,
      genero: true,
      regiaoId: true,
      profissaoId: true,
      tokenMobilizador: true,
    },
  })
  if (!pessoa || !pessoa.tokenMobilizador) notFound()

  const [regioes, profissoes] = await Promise.all([
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
  ])

  const segmentos = await prisma.segmento.findMany({
    where: { gabineteId: gabinete.id, status: 'ativo' },
    orderBy: { nome: 'asc' },
    select: { id: true, nome: true, slug: true },
  })

  const appUrl = getAppUrl()

  // Gerar links e QR codes por segmento
  const linksSegmentos = await Promise.all(
    segmentos.map(async (seg) => {
      const link = `${appUrl}/${params.slug}/cadastro/${seg.slug}?m=${pessoa.tokenMobilizador}`
      const qrDataUrl = await QRCode.toDataURL(link, { width: 200, margin: 2 })
      return { ...seg, link, qrDataUrl }
    })
  )

  const totalConvidados = await prisma.vinculoRede.count({
    where: { gabineteId: gabinete.id, indicadoPorId: pessoa.id, deletedAt: null },
  })

  const minhasDemandas = await prisma.demanda.findMany({
    where: { gabineteId: gabinete.id, responsavelId: pessoa.id },
    orderBy: { prazoDesfecho: 'asc' },
    select: {
      id: true,
      titulo: true,
      status: true,
      prazoDesfecho: true,
      area: { select: { nome: true } },
    },
  })

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Olá, {pessoa.nome}!</h1>
        <p className="text-sm text-gray-600 mt-1">
          Compartilhe seu link personalizado para convidar pessoas.
        </p>
      </div>

      {linksSegmentos.length === 0 ? (
        <p className="text-sm text-gray-500">Nenhum segmento ativo no momento.</p>
      ) : (
        <div className="space-y-6">
          {linksSegmentos.map((seg) => (
            <div key={seg.id} className="bg-white rounded-lg p-6 shadow-sm space-y-4">
              <h2 className="text-base font-semibold text-gray-800">{seg.nome}</h2>
              <div>
                <p className="text-xs text-gray-500 mb-1">Seu link personalizado</p>
                <p className="text-sm text-blue-600 break-all">{seg.link}</p>
                <a
                  href={seg.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block mt-1 text-xs text-blue-600 underline"
                >
                  Abrir link
                </a>
              </div>
              <div className="flex flex-col items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={seg.qrDataUrl} alt={`QR Code — ${seg.nome}`} className="w-48 h-48" />
                <a
                  href={seg.qrDataUrl}
                  download={`qr-${params.slug}-${seg.slug}.png`}
                  className="text-xs text-blue-600 underline"
                >
                  Baixar QR Code
                </a>
              </div>
            </div>
          ))}
        </div>
      )}

      <section className="bg-white rounded-lg p-6 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-800">
            Minha rede ({totalConvidados})
          </h2>
          {totalConvidados > 0 && (
            <Link
              href={`/${params.slug}/mobilizador/rede`}
              className="text-sm text-blue-600 hover:underline"
            >
              Ver rede →
            </Link>
          )}
        </div>
        {totalConvidados === 0 && (
          <p className="text-sm text-gray-500">Nenhuma pessoa convidada ainda.</p>
        )}
      </section>

      <section className="bg-white rounded-lg p-6 shadow-sm space-y-4">
        <h2 className="text-base font-semibold text-gray-800">
          Minhas Demandas ({minhasDemandas.length})
        </h2>
        {minhasDemandas.length === 0 ? (
          <p className="text-sm text-gray-500">Nenhuma demanda atribuída.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {minhasDemandas.map((d) => {
              const statusCor = { aberta: 'text-yellow-600', expirada: 'text-orange-600', atendida: 'text-green-600', nao_atendida: 'text-red-600' }[d.status] ?? 'text-gray-600'
              const statusLabel = { aberta: 'Em aberto', expirada: 'Expirada', atendida: 'Atendida', nao_atendida: 'Não atendida' }[d.status] ?? d.status
              return (
                <li key={d.id} className="py-3">
                  <a href={`/${params.slug}/mobilizador/demandas/${d.id}`} className="flex items-center justify-between hover:bg-gray-50 -mx-2 px-2 py-1 rounded">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{d.titulo}</p>
                      <p className="text-xs text-gray-500">{d.area.nome} · Prazo: {d.prazoDesfecho.toLocaleDateString('pt-BR')}</p>
                    </div>
                    <span className={`text-xs font-medium ${statusCor}`}>{statusLabel}</span>
                  </a>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section className="bg-white rounded-lg p-6 shadow-sm space-y-4">
        <h2 className="text-base font-semibold text-gray-800">Meu Perfil</h2>
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
          <div className="flex items-center justify-between">
            <button
              type="submit"
              className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium"
            >
              Salvar alterações
            </button>
            <AlterarSenhaDialog />
          </div>
        </form>
      </section>
    </div>
  )
}
