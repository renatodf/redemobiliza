import { redirect } from 'next/navigation'

export default function MobilizadorPage({ params }: { params: { slug: string } }) {
  redirect(`/${params.slug}/mobilizador/dashboard`)
}
