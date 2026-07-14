'use client'

import { useRef, useState } from 'react'
import {
  encontrarPosicaoRegiao,
  calcularTamanhoBalao,
  VIEWBOX_LARGURA,
  VIEWBOX_ALTURA,
} from '@/lib/regioes-df-mapa'

// Contorno real do Distrito Federal, simplificado a partir do perímetro oficial do
// IBGE (municípios do Brasil, código 5300108 — Brasília/DF) e projetado no viewBox
// VIEWBOX_LARGURA x VIEWBOX_ALTURA preservando a proporção real (~1.72:1).
const CONTORNO_DF =
  'M89.15,5.07 L90.13,4.88 L93.25,8.19 L98.62,9.09 L99.22,9.95 L97.45,13.69 L97.62,19.15 L99.58,20.61 L98.81,23.23 L99.46,25.86 L95.33,33.98 L94.1,34.61 L93.63,39.27 L92.73,40.26 L94.73,44.81 L93.43,46.04 L93.09,51.33 L93.82,52.94 L95.96,53.37 L98.88,56.61 L99.92,56.55 L99.94,58.07 L0.81,58.18 L3.67,47.09 L2.81,45.31 L1.06,45.41 L1.52,40.25 L0.07,35.51 L1.96,32.36 L4.61,31.5 L8.19,25.96 L8.13,23.02 L7.05,21.93 L4.73,21.82 L4.54,19.94 L5.53,14.66 L6.96,12.92 L8.86,12.84 L8.84,0.0 L88.85,0.02 L89.15,5.07 Z'

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
          <svg
            viewBox={`0 0 ${VIEWBOX_LARGURA} ${VIEWBOX_ALTURA}`}
            preserveAspectRatio="none"
            className="absolute inset-0 w-full h-full"
            aria-hidden
          >
            <path d={CONTORNO_DF} fill="#dbe6f0" stroke="#9fb3c8" strokeWidth={0.3} />
          </svg>
          {pinos.map((p) => {
            const conteudo = (
              <div
                title={p.nome}
                className="shrink-0 shadow-sm flex items-center justify-center"
                style={{
                  width: p.tamanho,
                  height: p.tamanho,
                  borderRadius: '50% 50% 50% 0',
                  backgroundColor: '#2563eb',
                  transform: 'rotate(-45deg)',
                }}
              >
                <span
                  className="font-semibold text-white leading-none"
                  style={{ transform: 'rotate(45deg)', fontSize: Math.max(7, p.tamanho * 0.38) }}
                >
                  {p.contagem}
                </span>
              </div>
            )
            return (
              <div
                key={p.id}
                className="absolute"
                style={{
                  left: `${(p.x / VIEWBOX_LARGURA) * 100}%`,
                  top: `${(p.y / VIEWBOX_ALTURA) * 100}%`,
                }}
              >
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
