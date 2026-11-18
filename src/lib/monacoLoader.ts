import { loader } from '@monaco-editor/react'

// The Monaco that actually runs is not the bundled npm package: with no
// `loader.config({ monaco })`, @monaco-editor/react fetches the AMD build from
// jsDelivr, and its default URL is pinned to whatever monaco-editor version the
// loader release shipped with. Pin it to the installed monaco-editor instead so
// the runtime matches the types we compile against (a test checks they agree).
export const MONACO_VERSION = '0.57.0'
export const MONACO_VS_PATH = `https://cdn.jsdelivr.net/npm/monaco-editor@${MONACO_VERSION}/min/vs`

loader.config({ paths: { vs: MONACO_VS_PATH } })
