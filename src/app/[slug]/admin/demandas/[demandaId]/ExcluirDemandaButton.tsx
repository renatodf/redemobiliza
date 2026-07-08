'use client'

import { excluirDemanda } from '@/actions/admin/excluir-demanda'

export default function ExcluirDemandaButton({
  slug,
  demandaId,
}: {
  slug: string
  demandaId: string
}) {
  return (
    <form
      action={excluirDemanda}
      onSubmit={(e) => {
        if (!confirm('Excluir esta demanda? A ação pode ser revertida pelo super-admin.')) {
          e.preventDefault()
        }
      }}
    >
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="demandaId" value={demandaId} />
      <button type="submit" aria-label="Excluir demanda" title="Excluir demanda" className="text-lg leading-none hover:opacity-70">
        🗑️
      </button>
    </form>
  )
}
