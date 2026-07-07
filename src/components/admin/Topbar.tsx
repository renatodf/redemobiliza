import Avatar from './Avatar'
import LiveClock from './LiveClock'
import { corTextoContraste } from '@/lib/cor-contraste'

export default function Topbar({
  usuarioNome,
  usuarioFotoUrl,
  corPrimaria,
}: {
  usuarioNome: string
  usuarioFotoUrl: string | null
  corPrimaria: string
}) {
  const corTexto = corTextoContraste(corPrimaria)

  return (
    <header
      className="text-[var(--cor-texto)] px-6 py-3 flex items-center justify-between"
      style={{ backgroundColor: corPrimaria, ['--cor-texto' as string]: corTexto }}
    >
      <LiveClock />
      <div className="flex items-center gap-4">
        <span className="text-lg cursor-default" aria-hidden>🔍</span>
        <span className="text-lg cursor-default relative" aria-hidden>
          🔔
          <span className="absolute -top-1 -right-1 bg-red-600 text-white text-[9px] rounded-full w-4 h-4 flex items-center justify-center">
            0
          </span>
        </span>
        <div className="flex items-center gap-2">
          <Avatar fotoUrl={usuarioFotoUrl} nome={usuarioNome} size={28} />
          <span className="text-sm">{usuarioNome}</span>
        </div>
      </div>
    </header>
  )
}
