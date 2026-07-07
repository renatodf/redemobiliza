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

function IconeEditar() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M11.3 2.3a1.5 1.5 0 0 1 2.1 2.1L5.5 12.3l-2.8.7.7-2.8 7.9-7.9Z"
        stroke="#979797"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function IconeExcluir() {
  return (
    <svg width="14" height="16" viewBox="0 0 14 16" fill="none" aria-hidden>
      <path d="M1 4h12M5 4V2.5A1.5 1.5 0 0 1 6.5 1h1A1.5 1.5 0 0 1 9 2.5V4" stroke="#979797" strokeWidth="1.4" />
      <path d="M2.5 4 3 14.5A1.2 1.2 0 0 0 4.2 15.7h5.6A1.2 1.2 0 0 0 11 14.5L11.5 4" stroke="#979797" strokeWidth="1.4" />
    </svg>
  )
}

export default function UsuariosTable({
  slug,
  usuarios,
  corPrimaria,
}: {
  slug: string
  usuarios: UsuarioRow[]
  corPrimaria: string
}) {
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
          <th className="text-left px-4 py-3 font-medium text-[#686868]">Email</th>
          <th className="text-left px-4 py-3 font-medium text-[#686868]">Tipo de Conta</th>
          <th className="text-left px-4 py-3 font-medium text-[#686868]">Segmentos</th>
          <th className="text-right px-4 py-3 font-medium text-[#686868]">Ações</th>
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
            <td className="px-4 py-3 text-[#757575]">{u.email ?? '—'}</td>
            <td className="px-4 py-3 text-[#757575]">{u.tipoConta}</td>
            <td className="px-4 py-3">
              <SegmentPills segmentos={u.segmentos} corPrimaria={corPrimaria} />
            </td>
            <td className="px-4 py-3">
              <div className="flex items-center justify-end gap-3">
                <Link href={`/${slug}/admin/pessoas/${u.id}?editar=1`} aria-label={`Editar ${u.nome}`}>
                  <IconeEditar />
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
                    <IconeExcluir />
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
