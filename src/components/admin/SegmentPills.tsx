'use client'

import { useState } from 'react'
import { corTextoContraste } from '@/lib/cor-contraste'

export default function SegmentPills({
  segmentos,
  maxVisiveis = 3,
  corPrimaria,
}: {
  segmentos: { id: string; nome: string }[]
  maxVisiveis?: number
  corPrimaria?: string
}) {
  const [expandido, setExpandido] = useState(false)

  if (segmentos.length === 0) {
    return <span className="text-gray-400 text-xs">—</span>
  }

  const visiveis = expandido ? segmentos : segmentos.slice(0, maxVisiveis)
  const restantes = segmentos.length - maxVisiveis
  const corTexto = corPrimaria ? corTextoContraste(corPrimaria) : '#ffffff'

  return (
    <div className="flex flex-wrap gap-1 items-center">
      {visiveis.map((s, i) => (
        <span
          key={s.id}
          style={i === 0 && corPrimaria ? { backgroundColor: corPrimaria, color: corTexto } : undefined}
          className={`text-[10px] uppercase tracking-wide px-2 py-1 rounded-sm whitespace-nowrap font-medium ${
            i === 0 ? (corPrimaria ? '' : 'bg-black text-white') : 'bg-[#757575] text-white'
          }`}
        >
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
