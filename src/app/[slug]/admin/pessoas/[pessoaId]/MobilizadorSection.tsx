type Props = {
  isMobilizador: boolean
  tokenMobilizador: string | null
  appUrl: string
  slug: string
}

export default function MobilizadorSection({ isMobilizador, tokenMobilizador, appUrl, slug }: Props) {
  if (!isMobilizador) return null

  return (
    <section className="bg-white rounded-lg p-6 shadow-sm space-y-4">
      <h2 className="text-lg font-semibold">Mobilizador</h2>
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <span className="inline-block bg-purple-100 text-purple-800 text-xs px-2 py-1 rounded-full font-medium">
            Mobilizador ativo
          </span>
        </div>
        {tokenMobilizador && (
          <div>
            <p className="text-xs text-gray-500 mb-1">Link base do mobilizador</p>
            <p className="text-xs text-gray-600 break-all font-mono bg-gray-50 p-2 rounded">
              {appUrl}/{slug}/cadastro/[segmento]?m={tokenMobilizador}
            </p>
          </div>
        )}
      </div>
    </section>
  )
}
