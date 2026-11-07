export interface Holiday { date: string; name: string; level: 'Nacional' | 'Estadual' }
/** Feriados de aplicação federal em todo o Brasil e feriado estadual de São Paulo.
 * Feriados municipais e pontos facultativos exigem fonte regional validada. */
export function getHolidays(year: number, region: 'BR' | 'SP'): Holiday[] {
 const fixed: [string,string][] = [
  ['01-01','Confraternização Universal'],['04-21','Tiradentes'],['05-01','Dia do Trabalho'],
  ['09-07','Independência do Brasil'],['10-12','Nossa Senhora Aparecida'],['11-02','Finados'],
  ['11-15','Proclamação da República'],['11-20','Consciência Negra'],['12-25','Natal'],
 ]
 const holidays: Holiday[] = fixed.map(([date,name])=>({date:year+'-'+date,name,level:'Nacional'}))
 if(region==='SP') holidays.push({date:year+'-07-09',name:'Revolução Constitucionalista',level:'Estadual'})
 return holidays.sort((a,b)=>a.date.localeCompare(b.date))
}
