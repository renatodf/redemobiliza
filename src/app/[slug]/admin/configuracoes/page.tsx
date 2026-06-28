import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { getGabineteBySlug } from '@/lib/gabinete'
import { salvarConfiguracao } from '@/actions/admin/salvar-configuracao'

export default async function ConfiguracoesPage({ params }: { params: { slug: string } }) {
  const gabinete = await getGabineteBySlug(params.slug)
  if (!gabinete) notFound()

  const config = await prisma.configuracaoSistema.findUnique({
    where: { gabineteId: gabinete.id },
  })

  const prazoAtual = config?.prazoDemandasHoras ?? 72
  const alertaAtual = config?.alertaExpiracaoHoras ?? 12

  return (
    <div className="max-w-2xl mx-auto py-8 px-4 space-y-6">
      <h1 className="text-2xl font-bold">Configurações</h1>

      <div className="bg-white rounded-lg shadow-sm p-6">
        <h2 className="text-base font-semibold mb-4">Demandas</h2>
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
    </div>
  )
}
