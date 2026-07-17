'use client'

import { useFormState } from 'react-dom'
import { criarAreaColocacao } from '@/actions/admin/criar-area-colocacao'

export default function CriarAreaColocacaoForm({ slug }: { slug: string }) {
  const [state, formAction] = useFormState(criarAreaColocacao, {})

  return (
    <div>
      <form action={formAction} className="flex gap-2">
        <input type="hidden" name="slug" value={slug} />
        <input
          name="nome"
          required
          placeholder="Nome da nova área"
          className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm"
        />
        <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium">
          Criar
        </button>
      </form>
      {state.erro && <p className="mt-1 text-sm text-red-600">{state.erro}</p>}
    </div>
  )
}
