// The models vIDE can set up for autocomplete with one click, and the pinned
// llama.cpp build it runs them with. Sizes are the exact GGUF byte counts on
// Hugging Face (checked 2026-10-19), so a download can be verified and a file
// already on disk recognised by size. Shared with the renderer (listed in
// tsconfig.web.json), so it must stay free of Node/Electron imports.

export type ManagedModelId = 'qwen-1.5b' | 'qwen-3b' | 'mellum-4b'

export interface CatalogModel {
  id: ManagedModelId
  label: string
  url: string
  fileName: string
  bytes: number
  ramBytes: number
}

// Measured: the 1.5B model's llama-server RSS is ~1.9 GB once loaded with the
// args in server.ts, i.e. the GGUF plus about this much.
export const RAM_OVERHEAD_BYTES = 300 * 1024 ** 2

function model(id: ManagedModelId, label: string, repo: string, fileName: string, bytes: number): CatalogModel {
  return {
    id,
    label,
    url: `https://huggingface.co/${repo}/resolve/main/${fileName}`,
    fileName,
    bytes,
    ramBytes: bytes + RAM_OVERHEAD_BYTES,
  }
}

export const MODEL_CATALOG: Record<ManagedModelId, CatalogModel> = {
  'qwen-1.5b': model('qwen-1.5b', 'Qwen2.5-Coder 1.5B', 'ggml-org/Qwen2.5-Coder-1.5B-Q8_0-GGUF', 'qwen2.5-coder-1.5b-q8_0.gguf', 1646573056),
  'qwen-3b': model('qwen-3b', 'Qwen2.5-Coder 3B', 'ggml-org/Qwen2.5-Coder-3B-Q8_0-GGUF', 'qwen2.5-coder-3b-q8_0.gguf', 3285476160),
  'mellum-4b': model('mellum-4b', 'Mellum 4B (JetBrains)', 'JetBrains/Mellum-4b-base-gguf', 'mellum-4b-base.Q8_0.gguf', 4274519360),
}

// Pinned so the server flags in server.ts are known to work (b11707 takes
// `-fa on|off|auto`, older builds a bare `-fa`; `-cram` is recent).
export const LLAMA_TAG = 'b11707'

const LLAMA_ASSETS: Partial<Record<string, { name: string; bytes: number }>> = {
  darwin: { name: `llama-${LLAMA_TAG}-bin-macos-arm64.tar.gz`, bytes: 12249245 },
  linux: { name: `llama-${LLAMA_TAG}-bin-ubuntu-x64.tar.gz`, bytes: 17914097 },
}

export function llamaAsset(platform: string): { url: string; bytes: number } | null {
  const asset = LLAMA_ASSETS[platform]
  if (!asset) return null
  return {
    url: `https://github.com/ggml-org/llama.cpp/releases/download/${LLAMA_TAG}/${asset.name}`,
    bytes: asset.bytes,
  }
}

// The 3B model is noticeably better but needs ~3.4 GB; below 16 GB that
// crowds out everything else (and a Bridge model), so the 1.5B is the pick.
// Mellum is offered, never recommended.
export function recommendedModelId(totalBytes: number): ManagedModelId {
  return totalBytes >= 16 * 1024 ** 3 ? 'qwen-3b' : 'qwen-1.5b'
}

export function fits(ramBytes: number, mem: { totalBytes: number; usedBytes: number }): boolean {
  return ramBytes <= mem.totalBytes - mem.usedBytes
}
