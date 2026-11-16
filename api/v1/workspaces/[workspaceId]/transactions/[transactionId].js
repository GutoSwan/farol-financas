/**
 * Rota de item específica para o filesystem router da Vercel.
 * Reutiliza todas as validações, JWT e restrições da ponte QA.
 * Sem esta função a rota de quatro segmentos retorna 404 na borda.
 */
import proxy from '../../../[...path].js'

export default proxy
