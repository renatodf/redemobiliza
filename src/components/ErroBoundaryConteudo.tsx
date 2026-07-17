'use client'

interface ErroBoundaryConteudoProps {
  error: Error & { digest?: string }
  reset: () => void
}

export default function ErroBoundaryConteudo({ error, reset }: ErroBoundaryConteudoProps) {
  return (
    <div className="min-h-[50vh] flex flex-col items-center justify-center gap-4 px-4 text-center">
      <h2 className="text-lg font-semibold text-gray-900">Algo deu errado</h2>
      <p className="text-sm text-gray-600 max-w-md">
        Ocorreu um erro inesperado. Tente novamente ou volte mais tarde.
      </p>
      {error.digest && (
        <p className="text-xs text-gray-400">Código: {error.digest}</p>
      )}
      <button
        type="button"
        onClick={reset}
        className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700"
      >
        Tentar novamente
      </button>
    </div>
  )
}
