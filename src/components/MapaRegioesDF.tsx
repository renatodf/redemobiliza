'use client'

import { useRef, useState } from 'react'
import { encontrarPosicaoRegiao, calcularTamanhoBalao } from '@/lib/regioes-df-mapa'

const CONTORNO_DF = 'M20,9 L70,7 L86,24 L80,54 L58,79 L28,77 L11,53 L14,24 Z'

export type RegiaoMapa = { id: string; nome: string; contagem: number; href?: string }

export default function MapaRegioesDF({ regioes }: { regioes: RegiaoMapa[] }) {
  const boxRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  const [tx, setTx] = useState(0)
  const [ty, setTy] = useState(0)
  const arrastando = useRef(false)
  const inicioArraste = useRef({ x: 0, y: 0, tx: 0, ty: 0 })

  const contagens = regioes.map((r) => r.contagem)
  const min = contagens.length > 0 ? Math.min(...contagens) : 0
  const max = contagens.length > 0 ? Math.max(...contagens) : 0

  const pinos = regioes
    .map((r) => {
      const posicao = encontrarPosicaoRegiao(r.nome)
      if (!posicao) return null
      return { ...r, ...posicao, tamanho: calcularTamanhoBalao(r.contagem, min, max) }
    })
    .filter((p): p is NonNullable<typeof p> => p !== null)

  function handleMouseDown(e: React.MouseEvent) {
    arrastando.current = true
    inicioArraste.current = { x: e.clientX, y: e.clientY, tx, ty }
    if (boxRef.current) boxRef.current.style.cursor = 'grabbing'
  }

  function handleMouseMove(e: React.MouseEvent) {
    if (!arrastando.current) return
    setTx(inicioArraste.current.tx + (e.clientX - inicioArraste.current.x))
    setTy(inicioArraste.current.ty + (e.clientY - inicioArraste.current.y))
  }

  function pararArraste() {
    arrastando.current = false
    if (boxRef.current) boxRef.current.style.cursor = 'grab'
  }

  function handleWheel(e: React.WheelEvent) {
    e.preventDefault()
    const fator = e.deltaY < 0 ? 1.1 : 1 / 1.1
    setScale((s) => Math.min(4, Math.max(0.5, s * fator)))
  }

  function zoom(fator: number) {
    setScale((s) => Math.min(4, Math.max(0.5, s * fator)))
  }

  function resetar() {
    setScale(1)
    setTx(0)
    setTy(0)
  }

  return (
    <div>
      <div
        ref={boxRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={pararArraste}
        onMouseLeave={pararArraste}
        onWheel={handleWheel}
        className="relative w-full rounded-xl border border-gray-200 bg-gray-50 overflow-hidden cursor-grab"
        style={{ height: 340 }}
      >
        <div
          className="absolute inset-0"
          style={{ transformOrigin: '0 0', transform: `translate(${tx}px, ${ty}px) scale(${scale})` }}
        >
          <svg viewBox="0 0 100 85" className="absolute inset-0 w-full h-full" aria-hidden>
            <path d={CONTORNO_DF} fill="#dbe6f0" stroke="#9fb3c8" strokeWidth={1} />
          </svg>
          {pinos.map((p) => {
            const conteudo = (
              <div className="flex items-center gap-1.5">
                <div
                  className="shrink-0 shadow-sm"
                  style={{
                    width: p.tamanho,
                    height: p.tamanho,
                    borderRadius: '50% 50% 50% 0',
                    backgroundColor: '#2563eb',
                    transform: 'rotate(-45deg)',
                  }}
                />
                <div className="bg-white rounded-md px-2 py-0.5 shadow-sm whitespace-nowrap">
                  <span className="text-xs font-semibold text-blue-700">{p.nome}</span>
                  <span className="text-xs text-blue-700 ml-1">{p.contagem}</span>
                </div>
              </div>
            )
            return (
              <div key={p.id} className="absolute" style={{ left: `${p.x}%`, top: `${p.y}%` }}>
                {p.href ? <a href={p.href}>{conteudo}</a> : conteudo}
              </div>
            )
          })}
        </div>

        <div className="absolute right-2 bottom-2 flex flex-col gap-1 z-10">
          <button
            type="button"
            onClick={() => zoom(1.2)}
            className="w-7 h-7 rounded-md border border-gray-300 bg-white font-bold"
            aria-label="Aumentar zoom"
          >
            +
          </button>
          <button
            type="button"
            onClick={() => zoom(1 / 1.2)}
            className="w-7 h-7 rounded-md border border-gray-300 bg-white font-bold"
            aria-label="Diminuir zoom"
          >
            −
          </button>
          <button
            type="button"
            onClick={resetar}
            className="w-7 h-7 rounded-md border border-gray-300 bg-white text-sm"
            aria-label="Ver mapa inteiro"
            title="Ver mapa inteiro"
          >
            ⤢
          </button>
        </div>
      </div>
      <p className="text-xs text-gray-500 mt-2">
        Arraste para mover, use a roda do mouse ou os botões +/− para zoom.
      </p>
    </div>
  )
}
