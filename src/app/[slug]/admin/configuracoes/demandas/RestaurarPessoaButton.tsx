'use client'

import { useFormState } from 'react-dom'
import { restaurarPessoa } from '@/actions/admin/restaurar-pessoa'

interface RestaurarPessoaButtonProps {
  slug: string
  pessoaId: string
}

export default function RestaurarPessoaButton({ slug, pessoaId }: RestaurarPessoaButtonProps) {
  const [state, action] = useFormState(restaurarPessoa, {})

  return (
    <form action={action}>
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="pessoaId" value={pessoaId} />
      <button type="submit" className="text-blue-600 text-xs hover:underline">
        Restaurar
      </button>
      {state.erro && <p className="text-xs text-red-600 mt-1">{state.erro}</p>}
    </form>
  )
}
