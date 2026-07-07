'use client'

import { useEffect, useState } from 'react'

export default function LiveClock() {
  const [agora, setAgora] = useState<Date | null>(null)

  useEffect(() => {
    setAgora(new Date())
    const id = setInterval(() => setAgora(new Date()), 30_000)
    return () => clearInterval(id)
  }, [])

  if (!agora) return <span className="text-sm text-[color-mix(in_srgb,var(--cor-texto)_70%,transparent)]">&nbsp;</span>

  const data = agora.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
  const hora = agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

  return (
    <span className="text-sm text-[color-mix(in_srgb,var(--cor-texto)_70%,transparent)] flex items-center gap-2">
      <span>📅</span>
      {data} | {hora}
    </span>
  )
}
