'use client'

import { softDeletePessoa } from '@/actions/admin/soft-delete-pessoa'

export default function ExcluirPessoaButton({ slug, pessoaId }: { slug: string; pessoaId: string }) {
  return (
    <form
      action={softDeletePessoa}
      onSubmit={(e) => {
        if (!confirm('Excluir este cadastro? A ação pode ser revertida pelo super-admin.')) {
          e.preventDefault()
        }
      }}
    >
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="pessoaId" value={pessoaId} />
      <button type="submit" className="text-sm text-red-600 hover:underline">
        Excluir cadastro
      </button>
    </form>
  )
}
