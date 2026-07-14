export type FatiaPizza = {
  chave: string
  label: string
  valor: number
  cor: string
  href?: string
}

const RAIO = 48
const CENTRO = 50

function pontoNoCirculo(anguloGraus: number) {
  const rad = (anguloGraus * Math.PI) / 180
  return {
    x: CENTRO + RAIO * Math.sin(rad),
    y: CENTRO - RAIO * Math.cos(rad),
  }
}

export function GraficoPizza({ titulo, fatias }: { titulo: string; fatias: FatiaPizza[] }) {
  const total = fatias.reduce((acc, f) => acc + f.valor, 0)
  let acumulado = 0
  const arcos = fatias.map((f) => {
    const inicio = total > 0 ? (acumulado / total) * 360 : 0
    acumulado += f.valor
    const fim = total > 0 ? (acumulado / total) * 360 : 0
    return { ...f, inicio, fim }
  })

  return (
    <section className="bg-white rounded-xl shadow-sm p-5">
      <h2 className="text-base font-semibold text-gray-800 mb-3">{titulo}</h2>
      {total === 0 ? (
        <p className="text-sm text-gray-500">Nenhum dado disponível.</p>
      ) : (
        <div className="flex items-center gap-5">
          <svg viewBox="0 0 100 100" className="w-28 h-28 shrink-0">
            {arcos.map((a) => {
              // Fatia única cobrindo 100% — um arco com início/fim idênticos é
              // degenerado (SVG não desenha), então usamos um círculo completo.
              const circuloCompleto = a.fim - a.inicio >= 359.99
              const forma = circuloCompleto ? (
                <circle cx={CENTRO} cy={CENTRO} r={RAIO} fill={a.cor} />
              ) : (
                (() => {
                  const p1 = pontoNoCirculo(a.inicio)
                  const p2 = pontoNoCirculo(a.fim)
                  const largeArc = a.fim - a.inicio > 180 ? 1 : 0
                  const path = `M${CENTRO},${CENTRO} L${p1.x},${p1.y} A${RAIO},${RAIO} 0 ${largeArc} 1 ${p2.x},${p2.y} Z`
                  return <path d={path} fill={a.cor} />
                })()
              )
              return a.href ? (
                <a key={a.chave} href={a.href} className="cursor-pointer">
                  {forma}
                </a>
              ) : (
                <g key={a.chave}>{forma}</g>
              )
            })}
          </svg>
          <ul className="flex-1 space-y-1.5 text-sm">
            {fatias.map((f) => {
              const conteudo = (
                <span className="flex items-center justify-between gap-2 w-full">
                  <span className="flex items-center gap-2 text-gray-700">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: f.cor }} aria-hidden />
                    {f.label}
                  </span>
                  <span className="font-medium text-gray-900">{f.valor}</span>
                </span>
              )
              return (
                <li key={f.chave}>
                  {f.href ? (
                    <a href={f.href} className="flex hover:underline">
                      {conteudo}
                    </a>
                  ) : (
                    <div className="flex">{conteudo}</div>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </section>
  )
}
