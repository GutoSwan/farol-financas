<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { supabase } from '../../infrastructure/auth/supabase'
import { getHolidays } from '../../domain/calendar/holidays'
import type { Holiday, CalendarRegion } from '../../domain/calendar/holidays'

type EventRow = { id:string; user_id:string; title:string; description:string; starts_at:string; ends_at:string; all_day:boolean; reminder_minutes:number|null }
const now = new Date()
const month = ref(new Date(now.getFullYear(),now.getMonth(),1))
const selectedDay = ref(localDate(now))
const region = ref<CalendarRegion>('BR')
const events = ref<EventRow[]>([])
const busy = ref(false)
const error = ref('')
const message = ref('')
const editing = ref<string|null>(null)
const editorOpen = ref(false)
const title = ref('')
const description = ref('')
const start = ref('')
const end = ref('')
const allDay = ref(false)
const reminder = ref(-1)
let timer: ReturnType<typeof setInterval>|undefined
const notified = new Set<string>()

function localDate(d:Date):string {
 return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')
}
function localInput(d:Date):string {
 return localDate(d)+'T'+String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0')
}
function dayFromIso(iso:string):string { return localDate(new Date(iso)) }
function displayTime(iso:string):string { return new Intl.DateTimeFormat('pt-BR',{hour:'2-digit',minute:'2-digit'}).format(new Date(iso)) }
const monthLabel=computed(()=>new Intl.DateTimeFormat('pt-BR',{month:'long',year:'numeric'}).format(month.value))
const holidays=computed(()=>getHolidays(month.value.getFullYear(),region.value))
const days=computed(()=>{
 const y=month.value.getFullYear(),m=month.value.getMonth()
 const offset=new Date(y,m,1).getDay()
 const length=new Date(y,m+1,0).getDate()
 return [...Array(offset).fill(null),...Array.from({length},(_,i)=>localDate(new Date(y,m,i+1)))] as (string|null)[]
})
const dayEvents=computed(()=>events.value.filter(e=>dayFromIso(e.starts_at)===selectedDay.value).sort((a,b)=>a.starts_at.localeCompare(b.starts_at)))
const dayHolidays=computed(()=>holidays.value.filter(h=>h.date===selectedDay.value))
function holidayOn(day:string):Holiday|undefined {return holidays.value.find(h=>h.date===day)}
function countOn(day:string):number { return events.value.filter(e=>dayFromIso(e.starts_at)===day).length }
async function load():Promise<void> {
 if(!supabase){error.value='Supabase não configurado.';return}
 busy.value=true;error.value=''
 const startIso=new Date(month.value.getFullYear(),month.value.getMonth()-1,1).toISOString()
 const endIso=new Date(month.value.getFullYear(),month.value.getMonth()+2,1).toISOString()
 try{
  const {data,error:queryError}=await supabase.from('calendar_events').select('id,user_id,title,description,starts_at,ends_at,all_day,reminder_minutes')
   .gte('starts_at',startIso).lt('starts_at',endIso).order('starts_at')
  if(queryError)throw queryError
  events.value=(data??[]) as EventRow[]
 }catch(cause){events.value=[];error.value=cause instanceof Error?cause.message:'Não foi possível carregar eventos.'}
 finally{busy.value=false}
}
function changeMonth(delta:number):void {
 month.value=new Date(month.value.getFullYear(),month.value.getMonth()+delta,1)
 selectedDay.value=localDate(new Date(month.value.getFullYear(),month.value.getMonth(),1))
}
function today():void {month.value=new Date(new Date().getFullYear(),new Date().getMonth(),1);selectedDay.value=localDate(new Date())}
function openNew():void {
 editing.value=null;title.value='';description.value='';allDay.value=false;reminder.value=-1
 const day=selectedDay.value,startDate=new Date(day+'T09:00:00'),endDate=new Date(startDate.getTime()+3600000)
 start.value=localInput(startDate);end.value=localInput(endDate)
 error.value='';message.value='';editorOpen.value=true
}
function openEdit(event:EventRow):void {
 editing.value=event.id;title.value=event.title;description.value=event.description
 start.value=localInput(new Date(event.starts_at));end.value=localInput(new Date(event.ends_at))
 allDay.value=event.all_day;reminder.value=event.reminder_minutes??-1;editorOpen.value=true;error.value=''
}
async function save():Promise<void> {
 if(!supabase)return
 if(!title.value.trim()||!start.value||!end.value){error.value='Preencha título, início e fim.';return}
 const startDate=new Date(start.value),endDate=new Date(end.value)
 if(!Number.isFinite(startDate.getTime())||!Number.isFinite(endDate.getTime())||endDate<=startDate){error.value='O término deve ser posterior ao início.';return}
 busy.value=true;error.value='';message.value=''
 try{
  const {data:{user},error:userError}=await supabase.auth.getUser()
  if(userError||!user)throw new Error('Entre novamente na sua conta.')
  const record={title:title.value.trim(),description:description.value.trim(),starts_at:startDate.toISOString(),
   ends_at:endDate.toISOString(),all_day:allDay.value,reminder_minutes:reminder.value<0?null:reminder.value}
  const result=editing.value
    ?await supabase.from('calendar_events').update(record).eq('id',editing.value).eq('user_id',user.id).select('id')
    :await supabase.from('calendar_events').insert({...record,user_id:user.id}).select('id')
  if(result.error)throw result.error
  if(!result.data?.length)throw new Error('Evento não foi salvo. Verifique as permissões.')
  editorOpen.value=false;message.value='Evento salvo.'
  month.value=new Date(startDate.getFullYear(),startDate.getMonth(),1);selectedDay.value=localDate(startDate)
  await load()
 }catch(cause){error.value=cause instanceof Error?cause.message:'Falha ao salvar o evento.'}
 finally{busy.value=false}
}
async function remove():Promise<void> {
 if(!supabase||!editing.value||!window.confirm('Excluir este evento?'))return
 busy.value=true;error.value=''
 try{
  const {data:{user}}=await supabase.auth.getUser()
  if(!user)throw new Error('Sessão inválida.')
  const result=await supabase.from('calendar_events').delete().eq('id',editing.value).eq('user_id',user.id).select('id')
  if(result.error)throw result.error
  if(!result.data?.length)throw new Error('Evento não encontrado ou sem permissão.')
  editorOpen.value=false;message.value='Evento excluído.';await load()
 }catch(cause){error.value=cause instanceof Error?cause.message:'Falha ao excluir.'}
 finally{busy.value=false}
}
async function enableNotifications():Promise<void> {
 if(!('Notification' in window)){message.value='Notificações não são suportadas neste navegador.';return}
 const permission=await Notification.requestPermission()
 message.value=permission==='granted'?'Notificações autorizadas enquanto o Farol estiver aberto.':'As notificações não foram autorizadas.'
}
async function notifyDue():Promise<void> {
 if(!('Notification' in window)||Notification.permission!=='granted')return
 const current=Date.now()
 for(const event of events.value){
  if(event.reminder_minutes===null)continue
  const trigger=new Date(event.starts_at).getTime()-event.reminder_minutes*60000
  const key=event.id+':'+event.starts_at
  if(trigger<=current&&current-trigger<60000&&!notified.has(key)){
   notified.add(key)
   try{
    if('serviceWorker' in navigator){
     const registration=await navigator.serviceWorker.getRegistration()
     if(registration){await registration.showNotification('Lembrete do Farol',{body:'Você tem um evento agendado.',tag:key});continue}
    }
    new Notification('Lembrete do Farol',{body:'Você tem um evento agendado.',tag:key})
   }catch{/* Navegador pode bloquear notificação; não vazar o conteúdo em logs. */}
  }
 }
}
watch(month,()=>{void load()})
onMounted(()=>{
 try{
  const saved = localStorage.getItem('farol:calendar:region')
  region.value = saved === 'SP' || saved === 'SOROCABA' ? saved : 'BR'
 }catch{/* localStorage indisponível */}
 void load()
 timer=setInterval(()=>{void notifyDue()},30000)
})
onUnmounted(()=>{if(timer)clearInterval(timer)})
function setRegion(value:CalendarRegion):void {
 if(value!=='BR' && value!=='SP' && value!=='SOROCABA')return
 region.value=value
 try{localStorage.setItem('farol:calendar:region',value)}catch{/* preferências não persistidas */}
}
</script>

<template>
 <div class="calendar-page">
  <div class="heading calendar-heading">
   <div><p class="eyebrow">SEUS COMPROMISSOS</p><h1>Calendário</h1><p>Eventos e lembretes pessoais, protegidos pela sua conta.</p></div>
   <button type="button" class="primary" @click="openNew"><span aria-hidden="true">＋</span> Novo evento</button>
  </div>
  <section class="panel calendar-panel">
   <div class="calendar-toolbar">
    <div class="calendar-month-controls">
     <button class="calendar-small" type="button" aria-label="Mês anterior" @click="changeMonth(-1)">‹</button>
     <h2>{{ monthLabel }}</h2>
     <button class="calendar-small" type="button" aria-label="Próximo mês" @click="changeMonth(1)">›</button>
     <button class="calendar-small" type="button" @click="today">Hoje</button>
    </div>
    <label class="calendar-region">Feriados de
     <select :value="region" @change="setRegion(($event.target as HTMLSelectElement).value as CalendarRegion)">
      <option value="BR">Brasil (nacionais)</option>
      <option value="SP">São Paulo (estado)</option>
      <option value="SOROCABA">Sorocaba (SP)</option>
     </select>
    </label>
   </div>
   <div class="calendar-weekdays"><span v-for="name in ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb']" :key="name">{{ name }}</span></div>
   <div class="calendar-grid">
    <div v-for="(day,index) in days" :key="day??'empty'+index" class="calendar-cell" :class="{ 'calendar-cell--empty':!day,'calendar-cell--selected':day===selectedDay,'calendar-cell--today':day===localDate(new Date()) }">
     <button v-if="day" type="button" :aria-label="'Selecionar '+day" @click="selectedDay=day">
      <span class="calendar-number">{{ Number(day.slice(-2)) }}</span>
      <span v-if="holidayOn(day)" class="calendar-holiday" :title="holidayOn(day)?.name">{{ holidayOn(day)?.name }}</span>
      <span v-if="countOn(day)" class="calendar-event-count">{{ countOn(day) }} evento(s)</span>
     </button>
    </div>
   </div>
   <p v-if="region==='SOROCABA' && month.getFullYear()===2026" class="calendar-footnote">Sorocaba: feriados municipais de 2026 confirmados pelo Decreto 30.713/2025, além dos feriados nacionais e estaduais. Pontos facultativos não são feriados.</p>
   <p v-else-if="region==='SOROCABA'" class="calendar-footnote">Feriados municipais de Sorocaba verificados somente para 2026. Para {{ month.getFullYear() }}, exibimos os nacionais e o estadual de SP até validar o calendário oficial.</p>
   <p v-else class="calendar-footnote">Feriados nacionais{{ region==='SP'?' e estadual de São Paulo':'' }}. Calendários municipais dependem de confirmação oficial; pontos facultativos não são exibidos como feriados.</p>
  </section>
  <section class="panel calendar-agenda">
   <div class="panel-title"><div><h2>{{ new Intl.DateTimeFormat('pt-BR',{dateStyle:'full'}).format(new Date(selectedDay+'T12:00:00')) }}</h2><p>Compromissos do dia selecionado</p></div><button type="button" class="calendar-small" @click="openNew">+ Adicionar</button></div>
   <p v-if="busy" role="status">Carregando...</p>
   <p v-if="error" class="error" role="alert">{{ error }}</p>
   <p v-if="message" class="success" role="status">{{ message }}</p>
   <article v-for="holiday in dayHolidays" :key="holiday.date+holiday.name" class="calendar-agenda-entry calendar-agenda-holiday"><strong>Feriado: {{ holiday.name }}</strong><span>{{ holiday.level }}</span></article>
   <article v-for="event in dayEvents" :key="event.id" class="calendar-agenda-entry">
    <div><strong>{{ event.title }}</strong><p>{{ event.all_day?'Dia inteiro':displayTime(event.starts_at)+' às '+displayTime(event.ends_at) }}</p><p v-if="event.description">{{ event.description }}</p></div>
    <button type="button" class="calendar-small" @click="openEdit(event)">Editar</button>
   </article>
   <p v-if="!dayEvents.length&&!dayHolidays.length" class="empty">Nenhum compromisso neste dia.</p>
   <div class="calendar-notice"><button type="button" class="secondary-action" @click="enableNotifications">Ativar notificações</button><p>Os lembretes desta versão funcionam enquanto o Farol estiver aberto. Avisos com aplicativo fechado e no iPhone precisarão de push ou notificações nativas.</p></div>
  </section>
  <div v-if="editorOpen" class="calendar-backdrop" @click.self="editorOpen=false">
   <section class="calendar-dialog" role="dialog" aria-modal="true" aria-label="Editar evento">
    <h2>{{ editing?'Editar evento':'Novo evento' }}</h2>
    <form class="form" @submit.prevent="save">
     <label>Título<input v-model="title" maxlength="160" required autocomplete="off" /></label>
     <label>Início<input v-model="start" type="datetime-local" required /></label>
     <label>Término<input v-model="end" type="datetime-local" required /></label>
     <label class="calendar-check"><input v-model="allDay" type="checkbox" /> Dia inteiro</label>
     <label>Lembrar<select v-model.number="reminder"><option :value="-1">Sem lembrete</option><option :value="0">No horário</option><option :value="5">5 minutos antes</option><option :value="15">15 minutos antes</option><option :value="30">30 minutos antes</option><option :value="60">1 hora antes</option><option :value="1440">1 dia antes</option></select></label>
     <label>Observações<textarea v-model="description" rows="3" maxlength="4000" /></label>
     <p v-if="error" class="error" role="alert">{{ error }}</p>
     <div class="calendar-form-actions">
      <button v-if="editing" class="calendar-delete" type="button" :disabled="busy" @click="remove">Excluir</button>
      <button type="button" class="secondary-action" @click="editorOpen=false">Cancelar</button>
      <button type="submit" class="primary" :disabled="busy">Salvar evento</button>
     </div>
    </form>
   </section>
  </div>
 </div>
</template>
