import { notFound } from 'next/navigation'
import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { convidarAdmin } from '@/actions/super-admin/convidar-admin'
import { reenviarConvite } from '@/actions/super-admin/reenviar-convite'
import { toggleGabinete } from '@/actions/super-admin/toggle-gabinete'
import { entrarModoSuporte } from '@/actions/super-admin/modo-suporte'

interface Props {
  params: { id: string }
  searchParams: {
    sucesso?: string
    erro?: string
    email?: string
  }
}

const mensagensSucesso: Record<string, string> = {
  convite_enviado: 'Convite enviado com sucesso!',
  admin_vinculado: 'Super Admin vinculado como administrador deste gabinete.',
}

const mensagensErro: Record<string, string> = {
  email_obrigatorio: 'Informe o e-mail do admin.',
  usuario_ja_existe:
    'Este e-mail já está cadastrado. Use "Reenviar convite" abaixo.',
  convite_falhou: 'Erro ao enviar convite. Tente novamente.',
  metadata_falhou:
    'Convite enviado, mas houve erro ao gravar permissões. Use "Reenviar convite" para corrigir.',
}

export default async function GabineteDetalhePage({ params, searchParams }: Props) {
  const gabinete = await prisma.gabinete.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      nome: true,
      slug: true,
      ativo: true,
      corPrimaria: true,
      corSecundaria: true,
      criadoEm: true,
      _count: { select: { pessoas: true, segmentos: true } },
    },
  })

  if (!gabinete) notFound()

  const admins = await prisma.usuarioGabinete.findMany({
    where: { gabineteId: gabinete.id, papel: 'admin' },
    select: { id: true, userId: true, criadoEm: true },
    orderBy: { criadoEm: 'asc' },
  })

  const sucesso = searchParams.sucesso ? mensagensSucesso[searchParams.sucesso] : null
  const erro = searchParams.erro ? mensagensErro[searchParams.erro] : null
  const emailReenvio = searchParams.email

  const convidarAction = convidarAdmin.bind(null, gabinete.id)
  const toggleAction = toggleGabinete.bind(null, gabinete.id)
  const entrarAction = entrarModoSuporte.bind(null, gabinete.id)

  return (
    <div className="space-y-8 max-w-2xl">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{gabinete.nome}</h1>
          <p className="text-sm text-gray-500 font-mono mt-1">/{gabinete.slug}/</p>
        </div>
        <div className="flex gap-2">
          <Link
            href={`/super-admin/gabinetes/${gabinete.id}/editar`}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
          >
            Editar
          </Link>
          <form action={toggleAction}>
            <button
              type="submit"
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                gabinete.ativo
                  ? 'bg-red-50 text-red-600 hover:bg-red-100'
                  : 'bg-green-50 text-green-600 hover:bg-green-100'
              }`}
            >
              {gabinete.ativo ? 'Desativar' : 'Ativar'}
            </button>
          </form>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Pessoas', value: gabinete._count.pessoas },
          { label: 'Segmentos', value: gabinete._count.segmentos },
          { label: 'Admins', value: admins.length },
        ].map(({ label, value }) => (
          <div key={label} className="bg-white rounded-lg border border-gray-200 p-4 text-center">
            <p className="text-2xl font-bold text-gray-900">{value}</p>
            <p className="text-sm text-gray-500 mt-1">{label}</p>
          </div>
        ))}
      </div>

      <div className="space-y-3">
        <h2 className="text-base font-semibold text-gray-900">Administradores</h2>
        {admins.length === 0 ? (
          <p className="text-sm text-gray-400">Nenhum admin cadastrado ainda.</p>
        ) : (
          <ul className="space-y-2">
            {admins.map((a) => (
              <li
                key={a.id}
                className="rounded-md border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700"
              >
                <span className="font-mono text-xs text-gray-500">{a.userId}</span>
                <span className="ml-3 text-gray-400 text-xs">
                  desde {new Date(a.criadoEm).toLocaleDateString('pt-BR')}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-3">
        <h2 className="text-base font-semibold text-gray-900">Convidar novo admin</h2>

        {sucesso && (
          <div className="rounded-md bg-green-50 border border-green-200 p-3">
            <p className="text-sm text-green-700">{sucesso}</p>
          </div>
        )}
        {erro && (
          <div className="rounded-md bg-red-50 border border-red-200 p-3">
            <p className="text-sm text-red-700">{erro}</p>
          </div>
        )}

        <form action={convidarAction} className="flex gap-2">
          <input
            name="email"
            type="email"
            required
            placeholder="email@exemplo.com"
            defaultValue={emailReenvio ?? ''}
            className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="submit"
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Enviar convite
          </button>
        </form>

        {emailReenvio && (
          <ReenviarConviteSection gabineteId={gabinete.id} email={emailReenvio} />
        )}
      </div>

      <div className="space-y-3">
        <h2 className="text-base font-semibold text-gray-900">Modo suporte</h2>
        <p className="text-sm text-gray-500">
          Acessa o painel de <strong>{gabinete.nome}</strong> como suporte. Todas as
          ações serão registradas no log.
        </p>
        <form action={entrarAction}>
          <button
            type="submit"
            className="rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700"
          >
            Entrar em modo suporte
          </button>
        </form>
      </div>
    </div>
  )
}

async function ReenviarConviteSection({
  gabineteId,
  email,
}: {
  gabineteId: string
  email: string
}) {
  const resultado = await reenviarConvite(gabineteId, email)

  if (resultado.erro) {
    return (
      <div className="rounded-md bg-amber-50 border border-amber-200 p-3">
        <p className="text-sm text-amber-700">Reenvio: {resultado.erro}</p>
      </div>
    )
  }

  return (
    <div className="rounded-md bg-blue-50 border border-blue-200 p-3 space-y-2">
      <p className="text-sm font-medium text-blue-800">Link gerado — envie manualmente ao admin:</p>
      <p className="text-xs font-mono text-blue-700 break-all select-all bg-white rounded p-2 border border-blue-200">
        {resultado.link}
      </p>
      <p className="text-xs text-blue-600">
        Este link é de uso único. O Supabase não enviará e-mail automaticamente.
      </p>
    </div>
  )
}
