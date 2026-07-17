'use client'

import ErroBoundaryConteudo from '@/components/ErroBoundaryConteudo'

export default function CadastroError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return <ErroBoundaryConteudo error={error} reset={reset} />
}
