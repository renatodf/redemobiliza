'use client'

import { useState } from 'react'
import Link from 'next/link'
import Avatar from '@/components/admin/Avatar'
import SegmentPills from '@/components/admin/SegmentPills'
import SortableHeader from '@/components/SortableHeader'
import { IconeEditar, IconeExcluir } from '@/components/admin/TableIcons'
import { softDeletePessoa } from '@/actions/admin/soft-delete-pessoa'
import { excluirPessoasEmMassa } from '@/actions/admin/excluir-pessoas-em-massa'

export type UsuarioRow = {
  id: string
  nome: string
  email: string | null
  fotoUrl: string | null
  tipoConta: 'Administrador' | 'Mobilizador' | '—'
  segmentos: { id: string; nome: string }[]
}

export default function UsuariosTable({
  slug,
  usuarios,
  corPrimaria,
  baseHref = `/${slug}/admin/pessoas`,
  somenteLeitura = false,
}: {
  slug: string
  usuarios: UsuarioRow[]
  corPrimaria: string
  baseHref?: string
  somenteLeitura?: boolean
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

  const nomesSelecionados = usuarios.filter((u) => selecionados.has(u.id)).map((u) => u.nome)

  return (
    <div style={{ ['--cp' as string]: corPrimaria }}>
      {!somenteLeitura && selecionados.size > 0 && (
        <div className="flex items-center justify-end px-4 py-2 border-b border-gray-100">
          <form
            action={excluirPessoasEmMassa}
            onSubmit={(e) => {
              if (
                !confirm(
                  `Excluir ${selecionados.size} usuário(s) — ${nomesSelecionados.join(', ')}? A ação pode ser revertida pelo super-admin.`
                )
              ) {
                e.preventDefault()
              }
            }}
          >
            <input type="hidden" name="slug" value={slug} />
            {Array.from(selecionados).map((id) => (
              <input key={id} type="hidden" name="pessoaIds" value={id} />
            ))}
            <button type="submit" className="flex items-center gap-2 text-sm" style={{ color: corPrimaria }}>
              <IconeExcluir />
              Excluir Todos
            </button>
          </form>
        </div>
      )}
      <table className="w-full text-sm">
        <thead className="border-b border-gray-200">
          <tr>
            {!somenteLeitura && (
              <th className="w-10 px-4 py-3">
                <input
                  type="checkbox"
                  checked={usuarios.length > 0 && selecionados.size === usuarios.length}
                  onChange={(e) => toggleTodos(e.target.checked)}
                  aria-label="Selecionar todos"
                />
              </th>
            )}
            <th className="w-16 px-2 py-3" />
            <th className="text-left px-2 py-3">
              <SortableHeader label="Nome" field="nome" />
            </th>
            <th className="text-left px-4 py-3 font-medium text-[#686868]">Email</th>
            <th className="text-left px-4 py-3 font-medium text-[#686868]">Tipo de Conta</th>
            <th className="text-left px-4 py-3 font-medium text-[#686868]">Segmentos</th>
            {!somenteLeitura && <th className="text-right px-4 py-3 font-medium text-[#686868]">Ações</th>}
          </tr>
        </thead>
        <tbody>
        {usuarios.map((u) => (
          <tr
            key={u.id}
            className="border-2 border-transparent border-b-gray-100 hover:border-[var(--cp)] hover:shadow-[0_8px_19px_#E5E5E5] transition-colors"
            style={{ height: 72 }}
          >
            {!somenteLeitura && (
              <td className="px-4 py-3">
                <input
                  type="checkbox"
                  checked={selecionados.has(u.id)}
                  onChange={() => toggleUm(u.id)}
                  aria-label={`Selecionar ${u.nome}`}
                />
              </td>
            )}
            <td className="px-2 py-3">
              <Avatar fotoUrl={u.fotoUrl} nome={u.nome} size={57} />
            </td>
            <td className="px-2 py-3">
              <Link href={`${baseHref}/${u.id}`} className="font-medium text-gray-900 hover:underline">
                {u.nome}
              </Link>
            </td>
            <td className="px-4 py-3 text-[#757575]">{u.email ?? '—'}</td>
            <td className="px-4 py-3 text-[#757575]">{u.tipoConta}</td>
            <td className="px-4 py-3">
              <SegmentPills segmentos={u.segmentos} corPrimaria={corPrimaria} />
            </td>
            {!somenteLeitura && (
              <td className="px-4 py-3">
                <div className="flex items-center justify-end gap-3">
                  <Link href={`${baseHref}/${u.id}?editar=1`} aria-label={`Editar ${u.nome}`}>
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
            )}
          </tr>
        ))}
        {usuarios.length === 0 && (
          <tr>
            <td colSpan={somenteLeitura ? 5 : 7} className="px-4 py-6 text-center text-gray-500">
              Nenhum usuário encontrado
            </td>
          </tr>
        )}
      </tbody>
      </table>
    </div>
  )
}
