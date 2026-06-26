import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { editarGabinete } from '@/actions/super-admin/editar-gabinete'

interface Props {
  params: { id: string }
  searchParams: { erro?: string }
}

const erros: Record<string, string> = {
  nome_obrigatorio: 'O nome do gabinete é obrigatório.',
  slug_duplicado: 'Já existe um gabinete com este nome. Escolha um nome diferente.',
}

export default async function EditarGabinetePage({ params, searchParams }: Props) {
  const gabinete = await prisma.gabinete.findUnique({
    where: { id: params.id },
    select: { id: true, nome: true, corPrimaria: true, corSecundaria: true },
  })

  if (!gabinete) notFound()

  const erro = searchParams.erro ? erros[searchParams.erro] : null
  const action = editarGabinete.bind(null, gabinete.id)

  return (
    <div className="max-w-lg space-y-6">
      <h1 className="text-xl font-bold text-gray-900">Editar Gabinete</h1>

      {erro && (
        <div className="rounded-md bg-red-50 border border-red-200 p-3">
          <p className="text-sm text-red-700">{erro}</p>
        </div>
      )}

      <form action={action} className="space-y-4">
        <div>
          <label htmlFor="nome" className="block text-sm font-medium text-gray-700 mb-1">
            Nome do gabinete
          </label>
          <input
            id="nome"
            name="nome"
            type="text"
            required
            defaultValue={gabinete.nome}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="corPrimaria" className="block text-sm font-medium text-gray-700 mb-1">
              Cor primária
            </label>
            <input
              id="corPrimaria"
              name="corPrimaria"
              type="color"
              defaultValue={gabinete.corPrimaria}
              className="h-10 w-full rounded-md border border-gray-300 cursor-pointer"
            />
          </div>
          <div>
            <label htmlFor="corSecundaria" className="block text-sm font-medium text-gray-700 mb-1">
              Cor secundária
            </label>
            <input
              id="corSecundaria"
              name="corSecundaria"
              type="color"
              defaultValue={gabinete.corSecundaria}
              className="h-10 w-full rounded-md border border-gray-300 cursor-pointer"
            />
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Salvar alterações
          </button>
          <a
            href={`/super-admin/gabinetes/${gabinete.id}`}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancelar
          </a>
        </div>
      </form>
    </div>
  )
}
