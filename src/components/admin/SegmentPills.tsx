'use client'

import { useState } from 'react'

export default function SegmentPills({
  segmentos,
  maxVisiveis = 3,
}: {
  segmentos: { id: string; nome: string }[]
  maxVisiveis?: number
}) {
  const [expandido, setExpandido] = useState(false)

  if (segmentos.length === 0) {
    return <span className="text-gray-400 text-xs">—</span>
  }

  const visiveis = expandido ? segmentos : segmentos.slice(0, maxVisiveis)
  const restantes = segmentos.length - maxVisiveis

  return (
    <div className="flex flex-wrap gap-1 items-center">
      {visiveis.map((s) => (
        <span key={s.id} className="bg-black text-white text-xs px-2 py-0.5 rounded-full whitespace-nowrap">
          {s.nome}
        </span>
      ))}
      {!expandido && restantes > 0 && (
        <button
          type="button"
          onClick={() => setExpandido(true)}
          className="text-xs text-gray-500 hover:text-gray-800 px-1"
        >
          +{restantes}
        </button>
      )}
    </div>
  )
}
