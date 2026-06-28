'use client'

import { useFormState, useFormStatus } from 'react-dom'
import { alterarSenha, type AlterarSenhaState } from '@/actions/mobilizador/alterar-senha'

const initialState: AlterarSenhaState = {}

function BotaoSalvar() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium disabled:opacity-50"
    >
      {pending ? 'Salvando...' : 'Salvar'}
    </button>
  )
}

export default function AlterarSenhaDialog() {
  const [state, formAction] = useFormState(alterarSenha, initialState)

  return (
    <>
      <button
        type="button"
        className="text-sm text-gray-600 hover:underline"
        onClick={() => (document.getElementById('dialog-senha') as HTMLDialogElement)?.showModal()}
      >
        Alterar Senha
      </button>

      <dialog
        id="dialog-senha"
        className="rounded-lg shadow-xl p-6 w-full max-w-sm backdrop:bg-black/40"
      >
        <h2 className="text-base font-semibold mb-4">Alterar Senha</h2>
        <form action={formAction} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Senha atual</label>
            <input
              name="senhaAtual"
              type="password"
              required
              className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Nova senha</label>
            <input
              name="novaSenha"
              type="password"
              required
              minLength={6}
              className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Confirmar nova senha</label>
            <input
              name="confirmarSenha"
              type="password"
              required
              minLength={6}
              className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
            />
          </div>
          {state.erro && <p className="text-sm text-red-600">{state.erro}</p>}
          {state.sucesso && <p className="text-sm text-green-600">Senha alterada com sucesso!</p>}
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              className="text-sm text-gray-600 hover:underline"
              onClick={() =>
                (document.getElementById('dialog-senha') as HTMLDialogElement)?.close()
              }
            >
              Cancelar
            </button>
            <BotaoSalvar />
          </div>
        </form>
      </dialog>
    </>
  )
}
