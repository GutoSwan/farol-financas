/**
 * Ponte server-side restrita a /api/v1/admin/access.
 * Não confia em papel vindo do cliente. A API Dev deve verificar JWT, AAL2
 * e papel atual; a Vercel injeta token OIDC entre serviços.
 */
const backend='https://farol-api-git-feat-v029-admin-standalone-preview-farol13.vercel.app'
export default async function handler(req,res){
  res.setHeader('Cache-Control','private, no-store')
  res.setHeader('Content-Type','application/json; charset=utf-8')
  res.setHeader('X-Content-Type-Options','nosniff')
  if(process.env.VERCEL_ENV!=='preview'){res.statusCode=404;return res.end(JSON.stringify({error:'Indisponível.'}))}
  if(req.method!=='GET'){res.setHeader('Allow','GET');res.statusCode=405;return res.end(JSON.stringify({error:'Método não permitido.'}))}
  const target=new URL(req.url||'','https://farol-admin.invalid')
  const allowed=target.pathname==='/api/v1/admin/access' && [...target.searchParams.keys()].every(k=>k==='...path')
  if(!allowed){res.statusCode=404;return res.end(JSON.stringify({error:'Rota não autorizada.'}))}
  const token=req.headers.authorization
  if(typeof token!=='string'||!/^Bearer [a-zA-Z0-9._-]{30,8000}$/.test(token)){res.statusCode=401;return res.end(JSON.stringify({error:'Sessão necessária.'}))}
  const oidc=req.headers['x-vercel-oidc-token']
  if(typeof oidc!=='string'||!/^[A-Za-z0-9._-]{50,8000}$/.test(oidc)){res.statusCode=503;return res.end(JSON.stringify({error:'Identidade da infraestrutura indisponível.'}))}
  try{
    const upstream=await fetch(backend+'/api/v1/admin/access',{method:'GET',cache:'no-store',redirect:'manual',signal:AbortSignal.timeout(12000),
      headers:{Authorization:token,'x-vercel-trusted-oidc-idp-token':oidc}})
    if(upstream.status>=300&&upstream.status<400)throw Error('redirect')
    if(!(upstream.headers.get('content-type')||'').includes('application/json'))throw Error('content')
    const body=await upstream.text()
    if(body.length>12000)throw Error('size')
    res.statusCode=upstream.status
    return res.end(body)
  }catch{
    res.statusCode=502
    return res.end(JSON.stringify({error:'API Dev indisponível.'}))
  }
}
