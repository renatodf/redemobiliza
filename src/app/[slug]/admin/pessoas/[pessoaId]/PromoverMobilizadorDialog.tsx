'use client'

import { useFormState } from 'react-dom'
import { promoverMobilizador } from '@/actions/admin/promover-mobilizador'
import { corTextoContraste } from '@/lib/cor-contraste'

interface Props {
  slug: string
  pessoaId: string
  nomeAbreviado: string
  corPrimaria: string
}

export default function PromoverMobilizadorDialog({ slug, pessoaId, nomeAbreviado, corPrimaria }: Props) {
  const [state, action, pending] = useFormState(promoverMobilizador, {})
  const corTexto = corTextoContraste(corPrimaria)

  return (
    <>
      <button
        type="button"
        style={{ backgroundColor: corPrimaria, color: corTexto }}
        className="text-[11px] px-2.5 py-1 rounded-md hover:opacity-90 font-medium"
        onClick={() => (document.getElementById('dialog-promover') as HTMLDialogElement)?.showModal()}
      >
        + Mobilizador
      </button>

      <dialog id="dialog-promover" className="rounded-lg shadow-xl p-6 w-full max-w-sm backdrop:bg-black/40">
        <h2 className="text-base font-semibold mb-4">Promover {nomeAbreviado} a Mobilizador</h2>
        <form action={action} className="space-y-4">
          <input type="hidden" name="slug" value={slug} />
          <input type="hidden" name="pessoaId" value={pessoaId} />
          <div>
            <label className="block text-sm font-medium text-gray-700">Senha</label>
            <input
              name="senha"
              type="password"
              required
              minLength={6}
              className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Confirmar senha</label>
            <input
              name="confirmarSenha"
              type="password"
              required
              minLength={6}
              className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
            />
          </div>
          {state.erro && (
            <p className="text-sm text-red-600">{state.erro}</p>
          )}
          {state.erro === undefined && Object.keys(state).length === 0 ? null : !state.erro ? (
            <p className="text-sm text-green-600">Mobilizador criado com sucesso!</p>
          ) : null}
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              className="text-sm text-gray-600 hover:underline"
              onClick={() => (document.getElementById('dialog-promover') as HTMLDialogElement)?.close()}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={pending}
              style={{ backgroundColor: corPrimaria, color: corTexto }}
              className="px-4 py-2 rounded-md text-sm font-medium disabled:opacity-50"
            >
              {pending ? 'Salvando...' : 'Confirmar'}
            </button>
          </div>
        </form>
      </dialog>
    </>
  )
}
