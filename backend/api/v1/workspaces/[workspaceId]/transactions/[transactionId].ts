/**
 * Vercel Function para um lançamento específico.
 * PATCH e DELETE continuam sujeitos à autenticação Supabase, verificação
 * de espaço/papel, If-Match, flags da Preview e RLS dentro do Fastify.
 * Sem este entrypoint, a Vercel retorna 404 antes de chegar ao Fastify.
 */
export { default } from '../../../../../src/native-handler.js'
