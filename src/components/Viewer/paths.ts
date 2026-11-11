const IMAGE_PREVIEW_PREFIX = 'image-preview://'
const MARKDOWN_PREVIEW_PREFIX = 'markdown-preview://'
const SVG_VIEWER_PREFIX = 'svg-viewer://'
const PDF_VIEWER_PREFIX = 'pdf-viewer://'

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

// PDFs only ever open here: there is no source tab to pair it with.
export function isPdfViewerTab(path: string): boolean {
  return path.startsWith(PDF_VIEWER_PREFIX)
}

export function buildPdfViewerPath(filePath: string): string {
  return PDF_VIEWER_PREFIX + filePath
}

export function parsePdfViewerPath(tabPath: string): string {
  return tabPath.slice(PDF_VIEWER_PREFIX.length)
}
