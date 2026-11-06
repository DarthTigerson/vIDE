const IMAGE_PREVIEW_PREFIX = 'image-preview://'
const MARKDOWN_PREVIEW_PREFIX = 'markdown-preview://'
const SVG_VIEWER_PREFIX = 'svg-viewer://'

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

// The rendered half of an SVG, the same way markdown-preview:// is for .md:
// the source stays the file's normal editor tab.
export function isSvgViewerTab(path: string): boolean {
  return path.startsWith(SVG_VIEWER_PREFIX)
}

export function buildSvgViewerPath(filePath: string): string {
  return SVG_VIEWER_PREFIX + filePath
}

export function parseSvgViewerPath(tabPath: string): string {
  return tabPath.slice(SVG_VIEWER_PREFIX.length)
}
