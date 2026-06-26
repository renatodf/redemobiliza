'use client'

import { useFormState, useFormStatus } from 'react-dom'
import { atualizarSenhaMobilizador, type AtualizarSenhaState } from '@/actions/auth/atualizar-senha-mobilizador'

const initialState: AtualizarSenhaState = { erro: null, sucesso: false }

function BotaoSalvar() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
    >
      {pending ? 'Salvando...' : 'Atualizar senha'}
    </button>
  )
}

export function AtualizarSenhaForm() {
  const [state, action] = useFormState(atualizarSenhaMobilizador, initialState)

  if (state.sucesso) {
    return (
      <div className="rounded-md bg-green-50 border border-green-200 p-3">
        <p className="text-sm text-green-700">Senha atualizada com sucesso!</p>
      </div>
    )
  }

  return (
    <form action={action} className="space-y-4">
      {state.erro && (
        <div className="rounded-md bg-red-50 border border-red-200 p-3">
          <p className="text-sm text-red-700">{state.erro}</p>
        </div>
      )}

      <div>
        <label htmlFor="senha-nova" className="block text-sm font-medium text-gray-700 mb-1">
          Nova senha
        </label>
        <input
          id="senha-nova"
          name="password"
          type="password"
          required
          minLength={6}
          autoComplete="new-password"
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div>
        <label htmlFor="senha-confirmar" className="block text-sm font-medium text-gray-700 mb-1">
          Confirmar nova senha
        </label>
        <input
          id="senha-confirmar"
          name="confirm"
          type="password"
          required
          minLength={6}
          autoComplete="new-password"
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <BotaoSalvar />
    </form>
  )
}
