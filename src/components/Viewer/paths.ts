const IMAGE_PREVIEW_PREFIX = 'image-preview://'
const SVG_VIEWER_PREFIX = 'svg-viewer://'
const EXTENSION_OFF_PREFIX = 'extension-off://'
const MARKDOWN_PREVIEW_PREFIX = 'markdown-preview://'

export function isImagePreviewTab(path: string): boolean {
  return path.startsWith(IMAGE_PREVIEW_PREFIX)
}

export function buildImagePreviewPath(filePath: string): string {
  return IMAGE_PREVIEW_PREFIX + filePath
}

export function parseImagePreviewPath(tabPath: string): string {
  return tabPath.slice(IMAGE_PREVIEW_PREFIX.length)
}

export function isMarkdownPreviewTab(path: string): boolean {
  return path.startsWith(MARKDOWN_PREVIEW_PREFIX)
}

export function buildMarkdownPreviewPath(filePath: string): string {
  return MARKDOWN_PREVIEW_PREFIX + filePath
}

export function parseMarkdownPreviewPath(tabPath: string): string {
  return tabPath.slice(MARKDOWN_PREVIEW_PREFIX.length)
}

export function isSvgViewerTab(path: string): boolean {
  return path.startsWith(SVG_VIEWER_PREFIX)
}

export function buildSvgViewerPath(filePath: string): string {
  return SVG_VIEWER_PREFIX + filePath
}

export function parseSvgViewerPath(tabPath: string): string {
  return tabPath.slice(SVG_VIEWER_PREFIX.length)
}

// The notice tab shown instead of a viewer when its extension is turned off.
// The extension id has no '/', so everything after the first one is the file.
export function isExtensionOffTab(path: string): boolean {
  return path.startsWith(EXTENSION_OFF_PREFIX)
}

export function buildExtensionOffPath(extensionId: string, filePath: string): string {
  return `${EXTENSION_OFF_PREFIX}${extensionId}/${filePath}`
}

export function parseExtensionOffPath(tabPath: string): { extensionId: string; filePath: string } {
  const rest = tabPath.slice(EXTENSION_OFF_PREFIX.length)
  const slash = rest.indexOf('/')
  return { extensionId: rest.slice(0, slash), filePath: rest.slice(slash + 1) }
}
