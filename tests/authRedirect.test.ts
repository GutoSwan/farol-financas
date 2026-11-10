import { describe, expect, it } from 'vitest'
import { safeAuthRedirect } from '../src/domain/auth/authRedirect'

const allowed='https://farol-financas-git-security-v027-auth-only-admin-8d8d01-farol13.vercel.app'
describe('URL canônica de recuperação de senha',()=>{
  it('sempre retorna o domínio estável da Preview quando em QA Dev-only',()=>{
    expect(safeAuthRedirect('/redefinir-senha',
      'https://farol-financas-random.vercel.app',allowed,true)).toBe(allowed+'/redefinir-senha')
    expect(safeAuthRedirect('/entrar',
      'https://farol-financas-random.vercel.app',allowed,true)).toBe(allowed+'/entrar')
  })
  it('não aceita redirecionar Dev para produção, HTTP ou domínios falsificados',()=>{
    for(const candidate of [
      'https://farol-financas.vercel.app',
      'https://farol-financas-git-security-v027-auth-only-admin-8d8d01-farol13.vercel.app.evil.test',
      'http://farol-financas-git-security-v027-auth-only-admin-8d8d01-farol13.vercel.app',
      allowed+'/algum-caminho',
      'https://user:password@farol-financas-git-security-v027-auth-only-admin-8d8d01-farol13.vercel.app',
    ])expect(()=>safeAuthRedirect('/redefinir-senha',allowed,candidate,true)).toThrow()
  })
  it('mantém links próprios em outras instalações sem QA Dev-only',()=>{
    const prod='https://farol-financas.vercel.app'
    expect(safeAuthRedirect('/redefinir-senha',prod,'',false)).toBe(prod+'/redefinir-senha')
  })
})
