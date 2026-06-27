import Link from 'next/link'
import { prisma } from '@/lib/prisma'

export default async function SuperAdminPage() {
  const gabinetes = await prisma.gabinete.findMany({
    orderBy: { criadoEm: 'desc' },
    select: {
      id: true,
      nome: true,
      slug: true,
      ativo: true,
      criadoEm: true,
      _count: {
        select: {
          pessoas: true,
          segmentos: true,
          vinculos: { where: { nivel: 0 } }, // mobilizadores raiz
        },
      },
    },
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Gabinetes</h1>
        <Link
          href="/super-admin/gabinetes/novo"
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Novo gabinete
        </Link>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Nome</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Slug</th>
              <th className="px-4 py-3 text-right font-medium text-gray-600">Pessoas</th>
              <th className="px-4 py-3 text-right font-medium text-gray-600">Segmentos</th>
              <th className="px-4 py-3 text-center font-medium text-gray-600">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {gabinetes.map((g) => (
              <tr key={g.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-900">{g.nome}</td>
                <td className="px-4 py-3 text-gray-500 font-mono text-xs">{g.slug}</td>
                <td className="px-4 py-3 text-right text-gray-600">{g._count.pessoas}</td>
                <td className="px-4 py-3 text-right text-gray-600">{g._count.segmentos}</td>
                <td className="px-4 py-3 text-center">
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                      g.ativo
                        ? 'bg-green-100 text-green-700'
                        : 'bg-gray-100 text-gray-500'
                    }`}
                  >
                    {g.ativo ? 'Ativo' : 'Inativo'}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <Link
                    href={`/super-admin/gabinetes/${g.id}`}
                    className="text-blue-600 hover:underline text-xs"
                  >
                    Gerenciar
                  </Link>
                </td>
              </tr>
            ))}
            {gabinetes.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                  Nenhum gabinete cadastrado ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
