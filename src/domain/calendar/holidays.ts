/** Datas locais sem envio de geolocalização ou dados pessoais. */
export interface Holiday { date: string; name: string; level: 'Nacional' | 'Estadual' }
const dateAt = (d: Date): string => [d.getUTCFullYear(),String(d.getUTCMonth()+1).padStart(2,'0'),String(d.getUTCDate()).padStart(2,'0')].join('-')
const plusDays = (date: Date, days: number): string => dateAt(new Date(date.getTime()+days*86400000))
/** Algoritmo gregoriano de Meeus/Jones/Butcher para a Páscoa. */
function easter(year: number): Date {
 const a=year%19,b=Math.floor(year/100),c=year%100,d=Math.floor(b/4),e=b%4
 const f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3)
 const h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4
 const l=(32+2*e+2*i-h-k+7)%7,m=Math.floor((a+11*h+22*l)/451)
 const month=Math.floor((h+l-7*m+114)/31),day=((h+l-7*m+114)%31)+1
 return new Date(Date.UTC(year,month-1,day))
}
export function getHolidays(year: number, region: 'BR' | 'SP'): Holiday[] {
 const fixed: [string,string][] = [
 ['01-01','Confraternização Universal'],['04-21','Tiradentes'],['05-01','Dia do Trabalho'],
 ['09-07','Independência do Brasil'],['10-12','Nossa Senhora Aparecida'],['11-02','Finados'],
 ['11-15','Proclamação da República'],['11-20','Consciência Negra'],['12-25','Natal'],
 ]
 const items: Holiday[] = fixed.map(([day,name])=>({date:year+'-'+day,name,level:'Nacional'}))
 // Datas religiosas móveis, incluindo Sexta-feira Santa, podem depender de lei municipal.
 // Exibir somente as datas nacionais e estaduais de vigência geral confirmadas.
 if(region==='SP') items.push({date:year+'-07-09',name:'Revolução Constitucionalista',level:'Estadual'})
 return items.sort((a,b)=>a.date.localeCompare(b.date))
}
