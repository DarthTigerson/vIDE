// Pure helper shared by the main process (electron/llama.ts) and the renderer
// (src/stores/llamaStore.ts): both keep only the tail of a llama-server's
// output, so a server left running for days doesn't grow either copy forever.
export const LLAMA_LOG_CAP = 200_000

export function appendCapped(log: string, chunk: string, cap = LLAMA_LOG_CAP): string {
  const next = log + chunk
  return next.length > cap ? next.slice(next.length - cap) : next
}
