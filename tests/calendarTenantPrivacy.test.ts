import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const calendar = readFileSync(new URL('../src/presentation/pages/CalendarPage.vue', import.meta.url),'utf8')

describe('Calendário: não exibir eventos de outra conta',()=>{
 it('mantém RLS como barreira principal e filtra por identidade verificada',()=>{
  expect(calendar).toContain("await supabase.auth.getUser()")
  expect(calendar).toContain(".eq('user_id',user.id)")
  expect(calendar).toContain("await supabase.auth.getSession()")
  expect(calendar).toContain("current.session?.user.id!==user.id")
 })
 it('invalida respostas antigas durante mudança de mês e saída da tela',()=>{
  expect(calendar).toContain("const version = ++loadVersion")
  expect(calendar).toContain("if(version!==loadVersion)return")
  expect(calendar).toContain("onUnmounted(()=>{loadVersion++;")
  expect(calendar).toContain("events.value = []")
 })
 it('confirma propriedade dos eventos antes de salvar ou excluir',()=>{
  expect(calendar).toContain(".eq('id',editing.value).eq('user_id',user.id)")
  expect(calendar).toContain("insert({...record,user_id:user.id})")
 })
})
