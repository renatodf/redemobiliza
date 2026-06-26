import { redirect } from 'next/navigation'

export default function AdminPage({ params }: { params: { slug: string } }) {
  redirect(`/${params.slug}/admin/pessoas`)
}
