import { describe, expect, it } from 'vitest'
import { safeAuthRedirect } from '../src/domain/auth/authRedirect'

const allowed='https://farol-financas-git-feat-v029-admin-standalone-preview-farol13.vercel.app'
const passwordSafetyPreview='https://farol-financas-git-feat-password-safety-free-20261117-farol13.vercel.app'
const ownerViewerDevPreview='https://farol-financas-git-qa-owner-viewer-dev-isolation-d00a3f-farol13.vercel.app'
describe('URL canônica de recuperação de senha',()=>{
  it('sempre retorna o domínio estável da Preview quando em QA Dev-only',()=>{
    expect(safeAuthRedirect('/redefinir-senha',
      'https://farol-financas-random.vercel.app',allowed,true)).toBe(allowed+'/redefinir-senha')
    expect(safeAuthRedirect('/confirmar-email',
      'https://farol-financas-random.vercel.app',allowed,true)).toBe(allowed+'/confirmar-email')
  })
  it('permite somente a URL estável da nova Preview de verificação de senhas',()=>{
    expect(safeAuthRedirect('/redefinir-senha',
      'https://farol-financas-random.vercel.app',passwordSafetyPreview,true))
      .toBe(passwordSafetyPreview+'/redefinir-senha')
    expect(()=>safeAuthRedirect('/redefinir-senha',passwordSafetyPreview,
      'https://farol-financas-cl5b7gfpn-farol13.vercel.app',true)).toThrow()
  })
  it('usa o alias aprovado da Preview Owner/Viewer em vez do deployment efêmero',()=>{
    expect(safeAuthRedirect('/redefinir-senha',
      'https://farol-financas-lxt294prl-farol13.vercel.app',ownerViewerDevPreview,true))
      .toBe(ownerViewerDevPreview+'/redefinir-senha')
    expect(safeAuthRedirect('/confirmar-email',
      'https://farol-financas-lxt294prl-farol13.vercel.app',ownerViewerDevPreview,true))
      .toBe(ownerViewerDevPreview+'/confirmar-email')
    expect(()=>safeAuthRedirect('/redefinir-senha',
      'https://farol-financas-lxt294prl-farol13.vercel.app','',true)).toThrow()
  })
  it('não aceita redirecionar Dev para produção, HTTP ou domínios falsificados',()=>{
    for(const candidate of [
      'https://farol-financas.vercel.app',
      'https://farol-financas-git-feat-v029-admin-standalone-preview-farol13.vercel.app.evil.test',
      'http://farol-financas-git-feat-v029-admin-standalone-preview-farol13.vercel.app',
      allowed+'/algum-caminho',
      'https://user:password@farol-financas-git-feat-v029-admin-standalone-preview-farol13.vercel.app',
      ownerViewerDevPreview+'.evil.test',
    ])expect(()=>safeAuthRedirect('/redefinir-senha',allowed,candidate,true)).toThrow()
  })
  it('mantém links próprios em outras instalações sem QA Dev-only',()=>{
    const prod='https://farol-financas.vercel.app'
    expect(safeAuthRedirect('/redefinir-senha',prod,'',false)).toBe(prod+'/redefinir-senha')
  })
})
