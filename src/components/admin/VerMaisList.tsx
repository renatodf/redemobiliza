'use client'

import { useState } from 'react'

export default function VerMaisList<T>({
  itens,
  porPagina = 5,
  renderItem,
}: {
  itens: T[]
  porPagina?: number
  renderItem: (item: T, index: number) => React.ReactNode
}) {
  const [quantidadeVisivel, setQuantidadeVisivel] = useState(porPagina)
  const visiveis = itens.slice(0, quantidadeVisivel)
  const temMais = quantidadeVisivel < itens.length

  return (
    <div className="space-y-3">
      {visiveis.map((item, i) => renderItem(item, i))}
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
