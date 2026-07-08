'use client'

import { excluirDemanda } from '@/actions/admin/excluir-demanda'
import { IconeExcluir } from '@/components/admin/TableIcons'

export default function ExcluirDemandaButton({
  slug,
  demandaId,
  titulo,
}: {
  slug: string
  demandaId: string
  titulo: string
}) {
  return (
    <form
      action={excluirDemanda}
      onSubmit={(e) => {
        if (!confirm(`Excluir a demanda "${titulo}"? A ação pode ser revertida pelo super-admin.`)) {
          e.preventDefault()
        }
      }}
    >
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="demandaId" value={demandaId} />
      <button type="submit" aria-label={`Excluir ${titulo}`}>
        <IconeExcluir />
      </button>
    </form>
  )
}
