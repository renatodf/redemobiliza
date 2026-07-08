'use client'

import { useState, useTransition } from 'react'
import { tornarMobilizador } from '@/actions/admin/tornar-mobilizador'
import { revogarMobilizador } from '@/actions/admin/revogar-mobilizador'
import { corTextoContraste } from '@/lib/cor-contraste'

type Props = {
  slug: string
  pessoaId: string
  temEmail: boolean
  isMobilizador: boolean
  tokenMobilizador: string | null
  appUrl: string
  corPrimaria: string
}

export default function MobilizadorSection({
  slug,
  pessoaId,
  temEmail,
  isMobilizador,
  tokenMobilizador,
  appUrl,
  corPrimaria,
}: Props) {
  const corTexto = corTextoContraste(corPrimaria)
  const [erro, setErro] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleTornar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setErro(null)
    const fd = new FormData(e.currentTarget)
    startTransition(async () => {
      const res = await tornarMobilizador(fd)
      if (res.erro) setErro(res.erro)
    })
  }

  function handleRevogar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setErro(null)
    const fd = new FormData(e.currentTarget)
    startTransition(async () => {
      const res = await revogarMobilizador(fd)
      if (res.erro) setErro(res.erro)
    })
  }

  return (
    <section className="bg-white rounded-lg p-6 shadow-sm space-y-4">
      <h2 className="text-lg font-semibold">Mobilizador</h2>

      {erro && (
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-700 border border-red-200">
          {erro}
        </div>
      )}

      {isMobilizador ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="inline-block bg-purple-100 text-purple-800 text-xs px-2 py-1 rounded-full font-medium">
              Mobilizador ativo
            </span>
          </div>
          {tokenMobilizador && (
            <div>
              <p className="text-xs text-gray-500 mb-1">Link base do mobilizador</p>
              <p className="text-xs text-gray-600 break-all font-mono bg-gray-50 p-2 rounded">
                {appUrl}/{slug}/cadastro/[segmento]?m={tokenMobilizador}
              </p>
            </div>
          )}
          <form onSubmit={handleRevogar}>
            <input type="hidden" name="slug" value={slug} />
            <input type="hidden" name="pessoaId" value={pessoaId} />
            <button
              type="submit"
              disabled={isPending}
              className="text-sm text-red-600 hover:underline disabled:opacity-50"
            >
              {isPending ? 'Revogando...' : 'Revogar status de mobilizador'}
            </button>
          </form>
        </div>
      ) : (
        <div className="space-y-2">
          {!temEmail ? (
            <p className="text-sm text-gray-500">
              Cadastre um e-mail para esta pessoa antes de torná-la mobilizador.
            </p>
          ) : (
            <form onSubmit={handleTornar}>
              <input type="hidden" name="slug" value={slug} />
              <input type="hidden" name="pessoaId" value={pessoaId} />
              <button
                type="submit"
                disabled={isPending}
                style={{ backgroundColor: corPrimaria, color: corTexto }}
                className="px-4 py-2 rounded-md text-sm font-medium hover:opacity-90 disabled:opacity-50"
              >
                {isPending ? 'Enviando convite...' : 'Tornar mobilizador'}
              </button>
              <p className="mt-1 text-xs text-gray-500">
                Um e-mail com link de acesso será enviado para a pessoa.
              </p>
            </form>
          )}
        </div>
      )}
    </section>
  )
}
