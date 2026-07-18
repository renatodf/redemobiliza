'use client'

import { useFormState } from 'react-dom'
import { criarRegiao } from '@/actions/admin/criar-regiao'
import { ESTADOS_BR } from '@/lib/estados-br'

export default function CriarRegiaoForm({
  slug,
  corPrimaria,
  corTexto,
}: {
  slug: string
  corPrimaria: string
  corTexto: string
}) {
  const [state, formAction] = useFormState(criarRegiao, {})

  return (
    <div>
      <form action={formAction} className="flex gap-2">
        <input type="hidden" name="slug" value={slug} />
        <input
          name="nome"
          required
          placeholder="Nome da nova cidade"
          className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm"
        />
        <select name="uf" required defaultValue="" className="border border-gray-300 rounded-md px-3 py-2 text-sm">
          <option value="" disabled>UF...</option>
          {ESTADOS_BR.map((e) => (
            <option key={e.sigla} value={e.sigla}>{e.sigla}</option>
          ))}
        </select>
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
