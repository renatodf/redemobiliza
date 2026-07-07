export default function Avatar({
  fotoUrl,
  nome,
  size = 40,
}: {
  fotoUrl: string | null
  nome: string
  size?: number
}) {
  const style = { width: size, height: size }
  if (fotoUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={fotoUrl} alt={nome} style={style} className="rounded-full object-cover shrink-0" />
  }
  return (
    <div
      style={style}
      className="rounded-full bg-gray-200 flex items-center justify-center text-gray-500 shrink-0"
      aria-label={nome}
    >
      <span style={{ fontSize: size * 0.5 }}>👤</span>
    </div>
  )
}
