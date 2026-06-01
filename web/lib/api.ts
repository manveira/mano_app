export async function apiFetch(path:string, opts:any={}){
  const base = process.env.NEXT_PUBLIC_API_URL || ''
  const url = base + path
  const headers:any = opts.headers || {}
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
  if (token) headers['Authorization'] = 'Bearer ' + token
  const res = await fetch(url, { ...opts, headers })
  if (!res.ok) throw new Error('api error')
  return res.json()
}
