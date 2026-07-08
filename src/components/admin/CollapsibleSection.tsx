'use client'

import { useState } from 'react'

export default function CollapsibleSection({
  title,
  actions,
  children,
}: {
  title: string
  actions?: React.ReactNode
  children: React.ReactNode
}) {
  const [aberto, setAberto] = useState(true)

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2 border-b border-gray-100 pb-2">
        <button
          type="button"
          onClick={() => setAberto((v) => !v)}
          className="flex items-center gap-2 text-lg font-semibold text-gray-900"
        >
          <span className="text-sm">{aberto ? '▲' : '▼'}</span>
          {title}
        </button>
        {actions}
      </div>
      {aberto && children}
    </section>
  )
}
