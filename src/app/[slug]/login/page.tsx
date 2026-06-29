import { redirect } from 'next/navigation'

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export default function SlugLoginPage(_props: { params: { slug: string } }) {
  redirect(`/login`)
}
