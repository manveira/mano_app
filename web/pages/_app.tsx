import '../styles/globals.css'
import type { AppProps } from 'next/app'
import { useRouter } from 'next/router'
import Header from '../components/Header'

// Páginas donde NO se muestra el header (son full-screen por diseño)
const NO_HEADER_PAGES = ['/', '/signup', '/signin', '/profile']

export default function MyApp({ Component, pageProps }: AppProps) {
  const router = useRouter()
  const showHeader = !NO_HEADER_PAGES.includes(router.pathname)

  return (
    <>
      {showHeader && <Header />}
      <Component {...pageProps} />
    </>
  )
}
