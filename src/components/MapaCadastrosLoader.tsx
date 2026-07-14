'use client'

import dynamic from 'next/dynamic'

const MapaCadastros = dynamic(() => import('./MapaCadastros'), { ssr: false })

export default MapaCadastros
