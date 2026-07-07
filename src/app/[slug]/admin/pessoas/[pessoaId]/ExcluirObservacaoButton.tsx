'use client'

import { excluirObservacao } from '@/actions/admin/excluir-observacao'

export default function ExcluirObservacaoButton({
  slug,
  pessoaId,
  observacaoId,
}: {
  slug: string
  pessoaId: string
  observacaoId: string
}) {
  return (
    <form
      action={excluirObservacao}
      onSubmit={(e) => {
        if (!confirm('Tem certeza que quer excluir esta observação?')) {
          e.preventDefault()
        }
      }}
    >
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="pessoaId" value={pessoaId} />
      <input type="hidden" name="observacaoId" value={observacaoId} />
      <button type="submit" aria-label="Excluir observação">
        🗑️
      </button>
    </form>
  )
}
