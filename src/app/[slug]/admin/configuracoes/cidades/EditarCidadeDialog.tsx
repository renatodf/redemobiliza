'use client'

import { useState } from 'react'
import Modal from '@/components/admin/Modal'
import { editarRegiao } from '@/actions/admin/editar-regiao'
import { ESTADOS_BR } from '@/lib/estados-br'
import { corTextoContraste } from '@/lib/cor-contraste'

export default function EditarCidadeDialog({
  slug,
  regiaoId,
  nomeAtual,
  ufAtual,
  corPrimaria,
}: {
  slug: string
  regiaoId: string
  nomeAtual: string
  ufAtual: string | null
  corPrimaria: string
}) {
  const [open, setOpen] = useState(false)
  const corTexto = corTextoContraste(corPrimaria)

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="text-blue-600 text-xs hover:underline">
        Editar
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title="Editar cidade">
        <form action={editarRegiao} className="space-y-3">
          <input type="hidden" name="slug" value={slug} />
          <input type="hidden" name="regiaoId" value={regiaoId} />
          <div>
            <label className="block text-sm font-medium text-gray-700">Nome</label>
            <input
              name="nome"
              required
              defaultValue={nomeAtual}
              className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">UF</label>
            <select
              name="uf"
              required
              defaultValue={ufAtual ?? ''}
              className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
            >
              <option value="" disabled>Selecionar...</option>
              {ESTADOS_BR.map((e) => (
                <option key={e.sigla} value={e.sigla}>{e.nome}</option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            style={{ backgroundColor: corPrimaria, color: corTexto }}
            className="w-full px-4 py-2 rounded-md text-sm font-medium"
          >
            Salvar
          </button>
        </form>
      </Modal>
    </>
  )
}
