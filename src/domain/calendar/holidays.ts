export type CalendarRegion = 'BR' | 'SP' | 'SOROCABA'
export interface Holiday { date: string; name: string; level: 'Nacional' | 'Estadual' | 'Municipal' }
/** Feriados nacionais e estaduais; os municipais de Sorocaba são divulgados
 * somente para 2026, conforme Decreto Municipal 30.713/2025 (Jornal 3.848).
 * Não extrapolar feriados móveis nem pontos facultativos a outros anos. */
export function getHolidays(year: number, region: CalendarRegion): Holiday[] {
 const fixed: [string,string][] = [
  ['01-01','Confraternização Universal'],['04-21','Tiradentes'],['05-01','Dia do Trabalho'],
  ['09-07','Independência do Brasil'],['10-12','Nossa Senhora Aparecida'],['11-02','Finados'],
  ['11-15','Proclamação da República'],['11-20','Consciência Negra'],['12-25','Natal'],
 ]
 const holidays: Holiday[] = fixed.map(([date,name])=>({date:year+'-'+date,name,level:'Nacional'}))
 if(region==='SP' || region==='SOROCABA') {
  holidays.push({date:year+'-07-09',name:'Revolução Constitucionalista',level:'Estadual'})
 }
 if(region==='SOROCABA' && year===2026) {
  holidays.push(
   {date:'2026-06-04',name:'Corpus Christi',level:'Municipal'},
   {date:'2026-08-15',name:'Aniversário de Sorocaba',level:'Municipal'},
  )
 }
 return holidays.sort((a,b)=>a.date.localeCompare(b.date))
}
