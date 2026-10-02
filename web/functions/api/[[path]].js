// Forward every /api/* request (login + WebSocket) to the single game Durable Object.
export async function onRequest({ request, env }) {
  return env.GAME.get(env.GAME.idFromName('main')).fetch(request);
}
