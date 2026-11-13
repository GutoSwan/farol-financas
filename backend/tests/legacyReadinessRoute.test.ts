import { describe, expect, it } from 'vitest'
import { buildApp } from '../src/presentation/app.js'
import { WorkspaceService } from '../src/application/use-cases/WorkspaceService.js'
import type { WorkspaceRepository } from '../src/domain/repositories/WorkspaceRepository.js'
import type { LegacyReadinessInspector } from '../src/application/use-cases/LegacyReadinessInspector.js'
import { LegacyReadinessForbiddenError } from '../src/application/use-cases/LegacyReadinessInspector.js'

const alice='11111111-1111-4111-8111-111111111111'
const bob='22222222-2222-4222-8222-222222222222'
const ws='33333333-3333-4333-8333-333333333333'
const url='/api/v1/workspaces/'+ws+'/legacy-readiness'
const counts={transactions:0,recurringBills:0,monthlyEntries:0,fixedExpenses:0,
  fixedPayments:0,budgetProjects:0,budgetItems:0,budgetQuotes:0,legacyMappings:0}
function setup(options:{user?:string;aal?:'aal1'|'aal2';owner?:boolean;fail?:boolean}={}) {
  const requests:Array<[string,string]>=[]
  const repository:WorkspaceRepository={
    async listForUser(){return []},
    async createOwnedBy(){throw new Error('Não criar espaço na conferência.')},
    async hasMembership(userId,workspaceId,allowedRoles=[]){
      return options.owner!==false && userId===alice && workspaceId===ws && allowedRoles.includes('OWNER')
    },
  }
  const inspector:LegacyReadinessInspector={
    async inspect(user,workspace){
      requests.push([user,workspace])
      if(options.fail)throw new LegacyReadinessForbiddenError()
      return {workspaceId:ws,counts,state:'empty',exact:true}
    },
  }
  const app=buildApp({
    auth:{async verifyAccessToken(token){
      if(token!=='valid')throw new Error('invalid')
      return {userId:options.user??alice,assuranceLevel:options.aal??'aal2'}
    }},
    workspaceService:new WorkspaceService(repository),
    checkDatabase:async()=>true,
    allowWorkspaceWrites:false,
    allowLegacyConnectionWrites:false,
    legacyReadinessInspector:inspector,
  })
  return {app,requests}
}
describe('GET de prontidão exata para migração, sem escrita',()=>{
  it('não libera contagens sem JWT válido',async()=>{
    const {app,requests}=setup()
    try {
      const without=await app.inject({method:'GET',url})
      const invalid=await app.inject({method:'GET',url,headers:{authorization:'Bearer invalid'}})
      expect(without.statusCode).toBe(401)
      expect(invalid.statusCode).toBe(401)
      expect(requests).toHaveLength(0)
    }finally{await app.close()}
  })
  it('exige AAL2 e não consulta o repositório com apenas senha',async()=>{
    const {app,requests}=setup({aal:'aal1'})
    try {
      const r=await app.inject({method:'GET',url,headers:{authorization:'Bearer valid'}})
      expect(r.statusCode).toBe(403);expect(requests).toEqual([])
    }finally{await app.close()}
  })
  it('sem OWNER e com segunda conta retorna 404 e não vaza contagens',async()=>{
    for(const options of [{owner:false},{user:bob}]){
      const {app,requests}=setup(options)
      try {
        const r=await app.inject({method:'GET',url,headers:{authorization:'Bearer valid'}})
        expect(r.statusCode).toBe(404)
        expect(r.body).not.toContain('transactions')
        expect(requests).toEqual([])
      }finally{await app.close()}
    }
  })
  it('não aceita workspace inválido',async()=>{
    const {app,requests}=setup()
    try{
      const r=await app.inject({method:'GET',url:'/api/v1/workspaces/local/legacy-readiness',
        headers:{authorization:'Bearer valid'}})
      expect(r.statusCode).toBe(404)
      expect(requests).toEqual([])
    }finally{await app.close()}
  })
  it('permite leitura com escritas desativadas e retorna apenas contagens',async()=>{
    const {app,requests}=setup()
    try {
      const r=await app.inject({method:'GET',url,headers:{authorization:'Bearer valid'}})
      expect(r.statusCode).toBe(200)
      expect(r.headers['cache-control']).toContain('no-store')
      expect(r.json()).toEqual({data:{workspaceId:ws,counts,state:'empty',exact:true}})
      expect(requests).toEqual([[alice,ws]])
    }finally{await app.close()}
  })
  it('revalidação falha sem divulgar SQL nem dados da nuvem',async()=>{
    const {app}=setup({fail:true})
    try{
      const r=await app.inject({method:'GET',url,headers:{authorization:'Bearer valid'}})
      expect(r.statusCode).toBe(404)
      expect(r.body).not.toContain('workspaceId')
    }finally{await app.close()}
  })
})
