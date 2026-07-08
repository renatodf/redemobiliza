'use client'

import { softDeletePessoa } from '@/actions/admin/soft-delete-pessoa'
import { IconeExcluir } from '@/components/admin/TableIcons'

export default function ExcluirPessoaButton({
  slug,
  pessoaId,
  iconOnly = false,
}: {
  slug: string
  pessoaId: string
  iconOnly?: boolean
}) {
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
      <button
        type="submit"
        className={iconOnly ? '' : 'text-sm text-red-600 hover:underline'}
        aria-label="Excluir cadastro"
      >
        {iconOnly ? <IconeExcluir /> : 'Excluir cadastro'}
      </button>
    </form>
  )
}
