'use client'

import { useEffect, useMemo } from 'react'
import { MapContainer, TileLayer, Marker, Tooltip, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { calcularTamanhoBalao } from '@/lib/mapa-pessoas'

export type RegiaoMapa = {
  id: string
  nome: string
  contagem: number
  href: string
  latitude: number | null
  longitude: number | null
}

const CENTRO_BRASIL: [number, number] = [-14.2, -51.9]
const ZOOM_FALLBACK = 4

// Só valores numéricos (tamanho, contagem) entram nesta string HTML — `nome` é
// texto livre digitado pelo admin e nunca deve ser interpolado em HTML bruto
// (o `html` do L.divIcon vira innerHTML de verdade). O nome aparece via
// <Tooltip>, que é conteúdo React normal (escapado automaticamente).
function criarIcone(tamanho: number, contagem: number): L.DivIcon {
  const fonte = Math.max(7, tamanho * 0.38)
  return L.divIcon({
    className: '',
    html: `<div style="width:${tamanho}px;height:${tamanho}px;border-radius:50% 50% 50% 0;background:#2563eb;transform:rotate(-45deg);display:flex;align-items:center;justify-content:center;box-shadow:0 1px 2px rgba(0,0,0,0.3)"><span style="transform:rotate(45deg);color:#fff;font-weight:600;font-size:${fonte}px;line-height:1">${contagem}</span></div>`,
    iconSize: [tamanho, tamanho],
    iconAnchor: [tamanho / 2, tamanho],
  })
}

function AjustarViewport({ pontos }: { pontos: [number, number][] }) {
  const map = useMap()
  useEffect(() => {
    if (pontos.length === 0) return
    map.fitBounds(L.latLngBounds(pontos), { padding: [30, 30], maxZoom: 12 })
  }, [map, pontos])
  return null
}

export default function MapaCadastros({ regioes }: { regioes: RegiaoMapa[] }) {
  const regioesKey = regioes.map((r) => `${r.id}:${r.latitude}:${r.longitude}:${r.contagem}`).join('|')

  const pinos = useMemo(
    () =>
      regioes.filter(
        (r): r is RegiaoMapa & { latitude: number; longitude: number } =>
          r.latitude != null && r.longitude != null && r.contagem > 0
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [regioesKey]
  )

  const contagens = pinos.map((p) => p.contagem)
  const min = contagens.length > 0 ? Math.min(...contagens) : 0
  const max = contagens.length > 0 ? Math.max(...contagens) : 0

  const pontos: [number, number][] = useMemo(
    () => pinos.map((p) => [p.latitude, p.longitude] as [number, number]),
    [pinos]
  )

  return (
    <div>
      <MapContainer
        center={CENTRO_BRASIL}
        zoom={ZOOM_FALLBACK}
        style={{ height: 340, width: '100%' }}
        className="rounded-xl border border-gray-200 overflow-hidden"
      >
        <TileLayer
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        />
        <AjustarViewport pontos={pontos} />
        {pinos.map((p) => (
          <Marker
            key={p.id}
            position={[p.latitude, p.longitude]}
            icon={criarIcone(calcularTamanhoBalao(p.contagem, min, max), p.contagem)}
            eventHandlers={{
              click: () => {
                window.location.href = p.href
              },
            }}
          >
            <Tooltip direction="top">{p.nome}</Tooltip>
          </Marker>
        ))}
      </MapContainer>
      <p className="text-xs text-gray-500 mt-2">
        Arraste para mover, use a roda do mouse ou pinça para zoom.
      </p>
    </div>
  )
}
