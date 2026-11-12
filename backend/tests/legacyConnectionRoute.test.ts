import {describe,expect,it} from 'vitest'
import {buildApp} from '../src/presentation/app.js'
import {WorkspaceService} from '../src/application/use-cases/WorkspaceService.js'
import type {WorkspaceRepository} from '../src/domain/repositories/WorkspaceRepository.js'
import type {LegacyConnectionService} from '../src/application/use-cases/PrismaLegacyTransactionConnectionService.js'
const alice='11111111-1111-4111-8111-111111111111'
const space='33333333-3333-4333-8333-333333333333'
const path='/api/v1/workspaces/'+space+'/legacy-connect'
function setup(allowed:boolean,assurance:'aal1'|'aal2'='aal2',role:'OWNER'|'EDITOR'='OWNER') {
  const calls:string[]=[]
  const workspaceRepo:WorkspaceRepository={
    async listForUser(){return []},
    async createOwnedBy(){throw new Error('no')},
    async hasMembership(_user,id,roles=[]){return id===space && role==='OWNER' && roles.includes('OWNER')},
  }
  const connector:LegacyConnectionService={async connect(owner,target,body){
    calls.push(owner+':'+target)
    expect(body).toEqual({workspace:{id:'local-1',name:'Casa',createdAt:'2026-11-12'},transactions:[]})
    return {status:'completed',workspaceMapping:'created',created:0,reused:0,total:0}
  }}
  return {
    app:buildApp({
      auth:{async verifyAccessToken(token){
        if(token!=='valid')throw new Error('invalid')
        return {userId:alice,assuranceLevel:assurance}
      }},
      workspaceService:new WorkspaceService(workspaceRepo),
      allowWorkspaceWrites:true,
      allowLegacyConnectionWrites:allowed,
      legacyConnectionService:connector,
      checkDatabase:async()=>true,
    }),calls,
  }
}
const payload={workspace:{id:'local-1',name:'Casa',createdAt:'2026-11-12'},transactions:[]}
describe('Rota protegida de conexão de lançamentos',()=>{
  it('sem token não chama serviço',async()=>{
    const {app,calls}=setup(true)
    try{
      const r=await app.inject({method:'POST',url:path,payload})
      expect(r.statusCode).toBe(401);expect(calls).toEqual([])
    }finally{await app.close()}
  })
  it('com senha mas sem Authenticator não chama serviço',async()=>{
    const {app,calls}=setup(true,'aal1')
    try{
      const r=await app.inject({method:'POST',url:path,headers:{authorization:'Bearer valid'},payload})
      expect(r.statusCode).toBe(403);expect(calls).toEqual([])
    }finally{await app.close()}
  })
  it('sem flag exclusiva de importação bloqueia até mesmo OWNER AAL2',async()=>{
    const {app,calls}=setup(false)
    try{
      const r=await app.inject({method:'POST',url:path,headers:{authorization:'Bearer valid'},payload})
      expect(r.statusCode).toBe(403);expect(calls).toEqual([])
    }finally{await app.close()}
  })
  it('papel EDITOR não conecta e não revela detalhes',async()=>{
    const {app,calls}=setup(true,'aal2','EDITOR')
    try{
      const r=await app.inject({method:'POST',url:path,headers:{authorization:'Bearer valid'},payload})
      expect(r.statusCode).toBe(404);expect(calls).toEqual([])
    }finally{await app.close()}
  })
  it('autorização explícita fornece apenas identidade validada ao serviço',async()=>{
    const {app,calls}=setup(true)
    try{
      const r=await app.inject({method:'POST',url:path,headers:{authorization:'Bearer valid'},payload})
      expect(r.statusCode).toBe(200)
      expect(r.json().data).toMatchObject({created:0,reused:0,total:0})
      expect(calls).toEqual([alice+':'+space])
    }finally{await app.close()}
  })
})
