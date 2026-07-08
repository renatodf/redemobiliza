'use client'

import { useEffect, useState } from 'react'

export default function LiveClock() {
  const [agora, setAgora] = useState<Date | null>(null)

  useEffect(() => {
    setAgora(new Date())
    const id = setInterval(() => setAgora(new Date()), 30_000)
    return () => clearInterval(id)
  }, [])

  if (!agora) return <span className="text-sm text-[#858585]">&nbsp;</span>

  const data = agora.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
  const hora = agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

  return (
    <span className="text-sm text-[#858585] flex items-center gap-2">
      <svg width="17" height="16" viewBox="0 0 17 16" fill="none" aria-hidden className="shrink-0">
        <rect x="1" y="2.5" width="15" height="12.5" rx="1.5" stroke="#979797" strokeWidth="1.4" />
        <path d="M1 6h15M5 1v3M12 1v3" stroke="#979797" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
      {data} | {hora}
    </span>
  )
}
