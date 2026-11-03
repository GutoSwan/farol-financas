// Function Node.js nativa isolada, sem Fastify, Prisma ou Supabase.
// Apenas no ambiente Preview desta branch de diagnóstico.
export default function handler(request, response) {
  response.status(200).json({ diagnostic: 'vercel-native-function', status: 'ok' })
}
