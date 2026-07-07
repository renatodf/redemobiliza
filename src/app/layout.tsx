import type { Metadata } from 'next'
import { Ubuntu_Condensed } from 'next/font/google'
import './globals.css'

const ubuntuCondensed = Ubuntu_Condensed({ subsets: ['latin'], weight: '400' })

export const metadata: Metadata = {
  title: 'Rede Mobiliza',
  description: 'Plataforma de mobilização territorial',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="pt-BR">
      <body className={ubuntuCondensed.className}>{children}</body>
    </html>
  )
}
