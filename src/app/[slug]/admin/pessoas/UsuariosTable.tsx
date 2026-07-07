'use client'

import { useState } from 'react'
import Link from 'next/link'
import Avatar from '@/components/admin/Avatar'
import SegmentPills from '@/components/admin/SegmentPills'
import SortableHeader from '@/components/SortableHeader'
import { softDeletePessoa } from '@/actions/admin/soft-delete-pessoa'

export type UsuarioRow = {
  id: string
  nome: string
  email: string | null
  fotoUrl: string | null
  tipoConta: 'Administrador' | 'Mobilizador' | '—'
  segmentos: { id: string; nome: string }[]
}

export default function UsuariosTable({ slug, usuarios }: { slug: string; usuarios: UsuarioRow[] }) {
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set())

  function toggleTodos(marcar: boolean) {
    setSelecionados(marcar ? new Set(usuarios.map((u) => u.id)) : new Set())
  }

  function toggleUm(id: string) {
    setSelecionados((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <table className="w-full text-sm">
      <thead className="border-b border-gray-200">
        <tr>
          <th className="w-10 px-4 py-3">
            <input
              type="checkbox"
              checked={usuarios.length > 0 && selecionados.size === usuarios.length}
              onChange={(e) => toggleTodos(e.target.checked)}
              aria-label="Selecionar todos"
            />
          </th>
          <th className="w-12 px-2 py-3" />
          <th className="text-left px-2 py-3">
            <SortableHeader label="Nome" field="nome" />
          </th>
          <th className="text-left px-4 py-3 font-medium text-gray-600">Email</th>
          <th className="text-left px-4 py-3 font-medium text-gray-600">Tipo de Conta</th>
          <th className="text-left px-4 py-3 font-medium text-gray-600">Segmentos</th>
          <th className="text-right px-4 py-3 font-medium text-gray-600">Ações</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-100">
        {usuarios.map((u) => (
          <tr key={u.id} className="hover:bg-gray-50" style={{ height: 56 }}>
            <td className="px-4 py-3">
              <input
                type="checkbox"
                checked={selecionados.has(u.id)}
                onChange={() => toggleUm(u.id)}
                aria-label={`Selecionar ${u.nome}`}
              />
            </td>
            <td className="px-2 py-3">
              <Avatar fotoUrl={u.fotoUrl} nome={u.nome} size={36} />
            </td>
            <td className="px-2 py-3">
              <Link href={`/${slug}/admin/pessoas/${u.id}`} className="font-medium text-gray-900 hover:underline">
                {u.nome}
              </Link>
            </td>
            <td className="px-4 py-3 text-gray-600">{u.email ?? '—'}</td>
            <td className="px-4 py-3 text-gray-600">{u.tipoConta}</td>
            <td className="px-4 py-3">
              <SegmentPills segmentos={u.segmentos} />
            </td>
            <td className="px-4 py-3">
              <div className="flex items-center justify-end gap-3">
                <Link href={`/${slug}/admin/pessoas/${u.id}`} aria-label={`Editar ${u.nome}`}>
                  ✏️
                </Link>
                <form
                  action={softDeletePessoa}
                  onSubmit={(e) => {
                    if (!confirm(`Excluir o cadastro de ${u.nome}? A ação pode ser revertida pelo super-admin.`)) {
                      e.preventDefault()
                    }
                  }}
                >
                  <input type="hidden" name="slug" value={slug} />
                  <input type="hidden" name="pessoaId" value={u.id} />
                  <button type="submit" aria-label={`Excluir ${u.nome}`}>
                    🗑️
                  </button>
                </form>
              </div>
            </td>
          </tr>
        ))}
        {usuarios.length === 0 && (
          <tr>
            <td colSpan={7} className="px-4 py-6 text-center text-gray-500">
              Nenhum usuário encontrado
            </td>
          </tr>
        )}
      </tbody>
    </table>
  )
}
