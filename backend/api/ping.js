// Function nativa isolada: sem Fastify, Prisma, Supabase ou dependências.
// Exclusiva de Preview na branch diagnostic/vercel-native-function.
export function GET() {
  return Response.json({ diagnostic: 'vercel-native-function', status: 'ok' })
}
