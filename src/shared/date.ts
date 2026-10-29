export function currentYearMonth(date=new Date()){return date.getFullYear()+'-'+String(date.getMonth()+1).padStart(2,'0')}
export function formatYearMonth(month:string){const [year,m]=month.split('-').map(Number);return new Date(year,m-1,1).toLocaleDateString('pt-BR',{month:'long',year:'numeric'})}
