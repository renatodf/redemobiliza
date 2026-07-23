import Link from 'next/link'
import Avatar from './Avatar'
import LiveClock from './LiveClock'

export default function Topbar({
  usuarioNome,
  usuarioFotoUrl,
  perfilHref,
}: {
  usuarioNome: string
  usuarioFotoUrl: string | null
  perfilHref?: string
}) {
  const perfilBloco = (
    <div className="flex items-center gap-2">
      <Avatar fotoUrl={usuarioFotoUrl} nome={usuarioNome} size={28} />
      <span className="text-sm hidden sm:inline text-[#494949]">{usuarioNome}</span>
    </div>
  )

  return (
    <header className="bg-white border-b border-[#D9D9D9] px-4 md:px-6 py-3 flex items-center justify-between gap-3">
      <div className="flex items-center gap-3 min-w-0">
        <label htmlFor="sidebar-toggle" aria-label="Abrir menu" className="md:hidden text-xl cursor-pointer shrink-0 text-[#686868]">
          ☰
        </label>
        <div className="hidden sm:block">
          <LiveClock />
        </div>
      </div>
      <div className="flex items-center gap-4">
        <span className="relative shrink-0" aria-hidden>
          <svg width="20" height="21" viewBox="0 0 20 21" fill="none">
            <path
              d="M10 2.5a5.5 5.5 0 0 0-5.5 5.5v3.2c0 .6-.24 1.18-.66 1.6L2.7 14a1 1 0 0 0 .7 1.7h13.2a1 1 0 0 0 .7-1.7l-1.14-1.2a2.27 2.27 0 0 1-.66-1.6V8A5.5 5.5 0 0 0 10 2.5Z"
              stroke="#979797"
              strokeWidth="1.6"
              strokeLinejoin="round"
            />
            <path d="M7.8 18a2.3 2.3 0 0 0 4.4 0" stroke="#979797" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
          <span className="absolute -top-1 -right-1 bg-red-600 text-white text-[9px] rounded-full w-4 h-4 flex items-center justify-center">
            0
          </span>
        </span>
        {perfilHref ? (
          <Link href={perfilHref} className="hover:opacity-80">
            {perfilBloco}
          </Link>
        ) : (
          perfilBloco
        )}
      </div>
    </header>
  )
}
