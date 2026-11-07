import { spawnSync } from 'node:child_process'
const result=spawnSync('npm',['audit','--json'],{encoding:'utf8',maxBuffer:12*1024*1024})
try {
 const audit=JSON.parse(result.stdout||'{}')
 console.log('FAROL_AUDIT_BEGIN')
 for (const [name,v] of Object.entries(audit.vulnerabilities??{})) {
  console.log(JSON.stringify({name,severity:v.severity,range:v.range,isDirect:v.isDirect,
    via:v.via?.map(x=>typeof x==='string'?x:{name:x.name,title:x.title,range:x.range,url:x.url}),
    fixAvailable:v.fixAvailable}))
 }
 console.log('FAROL_AUDIT_END')
} catch {
 console.log('FAROL_AUDIT_UNAVAILABLE',result.error?.message??String(result.status))
}
