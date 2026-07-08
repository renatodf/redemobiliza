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
      className="rounded-full bg-[#D8D8D8] flex items-center justify-center shrink-0 overflow-hidden"
      aria-label={nome}
    >
      <svg viewBox="0 0 24 24" fill="none" style={{ width: size * 0.55, height: size * 0.55 }} aria-hidden>
        <circle cx="12" cy="8.5" r="4" stroke="#FFFFFF" strokeWidth="2.4" />
        <path d="M3.5 21c0-4.7 3.8-8.5 8.5-8.5s8.5 3.8 8.5 8.5" stroke="#FFFFFF" strokeWidth="2.4" strokeLinecap="round" fill="none" />
      </svg>
    </div>
  )
}
