'use client'

import { useFormState } from 'react-dom'
import { criarProfissao } from '@/actions/admin/criar-profissao'

export default function CriarProfissaoForm({
  slug,
  corPrimaria,
  corTexto,
}: {
  slug: string
  corPrimaria: string
  corTexto: string
}) {
  const [state, formAction] = useFormState(criarProfissao, {})

  return (
    <div>
      <form action={formAction} className="flex gap-2">
        <input type="hidden" name="slug" value={slug} />
        <input
          name="nome"
          required
          placeholder="Nome da nova profissão"
          className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm"
        />
        <button
          type="submit"
          style={{ backgroundColor: corPrimaria, color: corTexto }}
          className="px-4 py-2 rounded-md text-sm font-medium"
        >
          Adicionar
        </button>
      </form>
      {state.erro && <p className="mt-1 text-sm text-red-600">{state.erro}</p>}
    </div>
  )
}
