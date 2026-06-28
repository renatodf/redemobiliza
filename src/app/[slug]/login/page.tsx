import { redirect } from 'next/navigation'

export default function SlugLoginPage({ params }: { params: { slug: string } }) {
  redirect(`/login`)
}
