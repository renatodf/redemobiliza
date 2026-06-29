'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { Suspense } from 'react'

type Props = {
  label: string
  field: string
}

function SortableHeaderInner({ label, field }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const currentSort = searchParams.get('sort')
  const currentOrder = searchParams.get('order')

  const isActive = currentSort === field
  const isAsc = isActive && currentOrder === 'asc'

  function handleClick() {
    const params = new URLSearchParams(searchParams.toString())
    params.delete('sort')
    params.delete('order')

    if (!isActive) {
      // padrão → asc
      params.set('sort', field)
      params.set('order', 'asc')
    } else if (isAsc) {
      // asc → desc
      params.set('sort', field)
      params.set('order', 'desc')
    }
    // desc → padrão (params já limpos acima)

    router.push(`${pathname}?${params.toString()}`)
  }

  const icon = !isActive ? '↕' : isAsc ? '↑' : '↓'

  return (
    <button
      onClick={handleClick}
      className="flex items-center gap-1 font-medium text-gray-600 hover:text-gray-900"
    >
      {label} <span className="text-gray-400 text-xs">{icon}</span>
    </button>
  )
}

export default function SortableHeader(props: Props) {
  return (
    <Suspense fallback={<span className="font-medium text-gray-600">{props.label}</span>}>
      <SortableHeaderInner {...props} />
    </Suspense>
  )
}
