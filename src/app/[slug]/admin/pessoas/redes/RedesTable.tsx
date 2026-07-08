'use client'

import { useState } from 'react'
import Link from 'next/link'
import Avatar from '@/components/admin/Avatar'
import { IconeEditar, IconeExcluir } from '@/components/admin/TableIcons'
import RevogarMobilizadorButton from './RevogarMobilizadorButton'
import { revogarMobilizadoresEmMassa } from '@/actions/admin/revogar-mobilizadores-em-massa'

export type RedeRow = {
  id: string
  nome: string
  email: string | null
  fotoUrl: string | null
  criadoEm: Date | null
  cadastrados: number
}

export default function RedesTable({ slug, redes }: { slug: string; redes: RedeRow[] }) {
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set())

  function toggleTodos(marcar: boolean) {
    setSelecionados(marcar ? new Set(redes.map((r) => r.id)) : new Set())
  }

  function toggleUm(id: string) {
    setSelecionados((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const nomesSelecionados = redes.filter((r) => selecionados.has(r.id)).map((r) => r.nome)

  return (
    <div>
      {selecionados.size > 0 && (
        <div className="flex items-center justify-end px-4 py-2 border-b border-gray-100">
          <form
            action={revogarMobilizadoresEmMassa}
            onSubmit={(e) => {
              if (
                !confirm(
                  `Remover ${selecionados.size} pessoa(s) como mobilizador — ${nomesSelecionados.join(', ')}? As redes deixam de existir, mas os cadastros continuam no sistema.`
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
            <button type="submit" className="flex items-center gap-2 text-sm" style={{ color: '#244F99' }}>
              <IconeExcluir />
              Excluir Todos
            </button>
          </form>
        </div>
      )}
      <table className="w-full text-sm">
        <thead className="border-b border-gray-200">
          <tr>
            <th className="w-10 px-4 py-3">
              <input
                type="checkbox"
                checked={redes.length > 0 && selecionados.size === redes.length}
                onChange={(e) => toggleTodos(e.target.checked)}
                aria-label="Selecionar todas"
              />
            </th>
            <th className="w-16 px-2 py-3" />
            <th className="text-left px-2 py-3 font-medium text-[#686868]">Nome</th>
            <th className="text-left px-4 py-3 font-medium text-[#686868]">Criador</th>
            <th className="text-left px-4 py-3 font-medium text-[#686868]">Email</th>
            <th className="text-left px-4 py-3 font-medium text-[#686868]">Data da Criação</th>
            <th className="text-left px-4 py-3 font-medium text-[#686868]">Cadastrados</th>
            <th className="text-right px-4 py-3 font-medium text-[#686868]">Ações</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {redes.map((r) => (
            <tr
              key={r.id}
              className="border-2 border-transparent hover:border-[#244F99] hover:shadow-[0_8px_19px_#E5E5E5] transition-colors"
              style={{ height: 72 }}
            >
              <td className="px-4 py-3">
                <input
                  type="checkbox"
                  checked={selecionados.has(r.id)}
                  onChange={() => toggleUm(r.id)}
                  aria-label={`Selecionar ${r.nome}`}
                />
              </td>
              <td className="px-2 py-3">
                <Avatar fotoUrl={r.fotoUrl} nome={r.nome} size={57} />
              </td>
              <td className="px-2 py-3">
                <Link
                  href={`/${slug}/admin/pessoas?rede=${r.id}`}
                  className="font-medium text-gray-900 hover:underline"
                >
                  {r.nome}
                </Link>
              </td>
              <td className="px-4 py-3 text-[#757575]">{r.nome}</td>
              <td className="px-4 py-3 text-[#757575]">{r.email ?? '—'}</td>
              <td className="px-4 py-3 text-[#757575]">
                {r.criadoEm ? r.criadoEm.toLocaleDateString('pt-BR') : '—'}
              </td>
              <td className="px-4 py-3">
                {r.cadastrados > 0 ? (
                  <Link href={`/${slug}/admin/pessoas?rede=${r.id}`} className="text-[#244F99] hover:underline">
                    {r.cadastrados}
                  </Link>
                ) : (
                  <span className="text-[#757575]">0</span>
                )}
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center justify-end gap-3">
                  <Link href={`/${slug}/admin/pessoas/${r.id}?editar=1`} aria-label={`Editar ${r.nome}`}>
                    <IconeEditar />
                  </Link>
                  <RevogarMobilizadorButton slug={slug} pessoaId={r.id} nome={r.nome} />
                </div>
              </td>
            </tr>
          ))}
          {redes.length === 0 && (
            <tr>
              <td colSpan={8} className="px-4 py-6 text-center text-gray-500">
                Nenhuma rede encontrada — promova uma pessoa a mobilizador para criar a primeira rede.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
