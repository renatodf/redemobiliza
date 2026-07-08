'use client'

import { useState } from 'react'

export default function VerMaisList({
  itens,
  porPagina = 5,
}: {
  itens: React.ReactNode[]
  porPagina?: number
}) {
  const [quantidadeVisivel, setQuantidadeVisivel] = useState(porPagina)
  const visiveis = itens.slice(0, quantidadeVisivel)
  const temMais = quantidadeVisivel < itens.length

  return (
    <div className="space-y-3">
      {visiveis}
      {itens.length > porPagina && (
        <div className="text-center pt-2">
          {temMais ? (
            <button
              type="button"
              onClick={() => setQuantidadeVisivel((n) => n + porPagina)}
              className="text-sm text-blue-600 hover:underline"
            >
              VER MAIS
            </button>
          ) : null}
          <p className="text-xs text-gray-400 mt-1">
            visualizando {visiveis.length} de {itens.length}
          </p>
        </div>
      )}
    </div>
  )
}
