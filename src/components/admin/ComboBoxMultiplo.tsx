'use client'

import { useRef, useState, useEffect } from 'react'
import { filtrarOpcoesComboBox, type OpcaoComboBox } from '@/lib/filtrar-opcoes-combobox'

export function ComboBoxMultiplo({
  opcoes,
  selecionados,
  onToggle,
  placeholder,
}: {
  opcoes: OpcaoComboBox[]
  selecionados: Set<string>
  onToggle: (id: string) => void
  placeholder: string
}) {
  const [busca, setBusca] = useState('')
  const [aberto, setAberto] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function aoClicarFora(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setAberto(false)
      }
    }
    document.addEventListener('mousedown', aoClicarFora)
    return () => document.removeEventListener('mousedown', aoClicarFora)
  }, [])

  const opcoesFiltradas = filtrarOpcoesComboBox(opcoes, busca, selecionados)

  function selecionar(id: string) {
    onToggle(id)
    setBusca('')
  }

  return (
    <div ref={containerRef} className="relative">
      <input
        type="text"
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        onFocus={() => setAberto(true)}
        placeholder={placeholder}
        className="border border-gray-300 rounded-md px-2 py-1.5 text-sm w-full"
      />
      {aberto && opcoesFiltradas.length > 0 && (
        <ul className="absolute z-10 mt-1 w-full max-h-48 overflow-auto bg-white border border-gray-200 rounded-md shadow-lg text-sm">
          {opcoesFiltradas.map((o) => (
            <li key={o.id}>
              <button
                type="button"
                onClick={() => selecionar(o.id)}
                className="w-full text-left px-3 py-1.5 hover:bg-gray-100"
              >
                {o.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
