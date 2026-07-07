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
      className="text-[var(--cor-texto)] px-4 md:px-6 py-3 flex items-center justify-between gap-3"
      style={{ backgroundColor: corPrimaria, ['--cor-texto' as string]: corTexto }}
    >
      <div className="flex items-center gap-3 min-w-0">
        <label htmlFor="sidebar-toggle" aria-label="Abrir menu" className="md:hidden text-xl cursor-pointer shrink-0">
          ☰
        </label>
        <div className="hidden sm:block">
          <LiveClock />
        </div>
      </div>
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
          <span className="text-sm hidden sm:inline">{usuarioNome}</span>
        </div>
      </div>
    </header>
  )
}
