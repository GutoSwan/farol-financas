import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { inspectOnlineLegacyReadiness } from '../src/infrastructure/api/legacyReadiness'
const { getUser,getSession }=vi.hoisted(()=>({getUser:vi.fn(),getSession:vi.fn()}))
vi.mock('../src/infrastructure/auth/supabase',()=>({
  supabase:{auth:{getUser,getSession}},
}))
vi.mock('../src/infrastructure/api/apiEndpoint',()=>({
  apiEndpoint:(path:string)=>'https://preview.example.test'+path,
}))
const userId='11111111-1111-4111-8111-111111111111'
const ws='33333333-3333-4333-8333-333333333333'
const dest={id:ws,name:'Casa',role:'OWNER' as const}
const empty={transactions:0,recurringBills:0,monthlyEntries:0,fixedExpenses:0,
  fixedPayments:0,budgetProjects:0,budgetItems:0,budgetQuotes:0,legacyMappings:0}
const report=(counts:typeof empty=empty)=>({
  data:{workspaceId:ws,exact:true,state:'empty',counts},
})
describe('Prévia remota de migração sem enviar registros locais',()=>{
  beforeEach(()=>{
    getUser.mockResolvedValue({data:{user:{id:userId}},error:null})
    getSession.mockResolvedValue({data:{session:{user:{id:userId},access_token:'signed-token'}},error:null})
  })
  afterEach(()=>{vi.unstubAllGlobals();vi.clearAllMocks()})
  it('usa GET com Bearer, sem corpo financeiro, sem cache e sem outras contas',async()=>{
    const fetch=vi.fn().mockResolvedValue({ok:true,status:200,json:async()=>report()})
    vi.stubGlobal('fetch',fetch)
    expect((await inspectOnlineLegacyReadiness(dest,userId)).state).toBe('empty')
    expect(fetch).toHaveBeenCalledTimes(1)
    const [url,options]=fetch.mock.calls[0]
    expect(url).toContain('/api/v1/workspaces/'+ws+'/legacy-readiness')
    expect(options).toMatchObject({method:'GET',cache:'no-store',credentials:'same-origin',redirect:'error'})
    expect(options.headers.Authorization).toBe('Bearer signed-token')
    expect(options.body).toBeUndefined()
  })
  it('recusa troca de identidade sem chamar API',async()=>{
    const fetch=vi.fn();vi.stubGlobal('fetch',fetch)
    getUser.mockResolvedValue({data:{user:{id:'22222222-2222-4222-8222-222222222222'}},error:null})
    await expect(inspectOnlineLegacyReadiness(dest,userId)).rejects.toThrow('conta mudou')
    expect(fetch).not.toHaveBeenCalled()
  })
  it('não oferece conferência a EDITOR/VIEWER',async()=>{
    const fetch=vi.fn();vi.stubGlobal('fetch',fetch)
    await expect(inspectOnlineLegacyReadiness({...dest,role:'EDITOR'},userId))
      .rejects.toThrow('proprietário')
    expect(fetch).not.toHaveBeenCalled()
  })
  it('rejeita contagens incompletas e status falso de vazio',async()=>{
    const fetch=vi.fn().mockResolvedValue({ok:true,status:200,json:async()=>({
      data:{workspaceId:ws,exact:true,state:'empty',counts:{...empty,monthlyEntries:1}},
    })})
    vi.stubGlobal('fetch',fetch)
    await expect(inspectOnlineLegacyReadiness(dest,userId)).rejects.toThrow('inconsistente')
    fetch.mockResolvedValue({ok:true,status:200,json:async()=>({
      data:{workspaceId:ws,exact:true,state:'empty',counts:{transactions:0}},
    })})
    await expect(inspectOnlineLegacyReadiness(dest,userId)).rejects.toThrow('incompletas')
  })
  it('erro 403 de 2FA não vira lista vazia',async()=>{
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:false,status:403}))
    await expect(inspectOnlineLegacyReadiness(dest,userId)).rejects.toThrow('Authenticator')
  })
  it('não aceita resposta apontando outro workspace',async()=>{
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,status:200,json:async()=>({
      data:{...report().data,workspaceId:'22222222-2222-4222-8222-222222222222'},
    })}))
    await expect(inspectOnlineLegacyReadiness(dest,userId)).rejects.toThrow('incompletas')
  })
})
