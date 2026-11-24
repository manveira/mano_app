import { useEffect } from 'react'
import Router, { useRouter } from 'next/router'

/** Ruta histórica. Los enlaces de invitación (/signup?ref=CODIGO) entran por aquí y siguen al flujo nuevo. */
export default function SignUp() {
  const { query, isReady } = useRouter()
  useEffect(() => {
    if (!isReady) return
    const ref = typeof query.ref === 'string' && query.ref ? `?ref=${encodeURIComponent(query.ref)}` : ''
    Router.replace('/elegir-rol' + ref)
  }, [isReady, query.ref])
  return null
}
