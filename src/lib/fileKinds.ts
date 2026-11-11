// TIFF and HEIC are decoded by the OS in the main process, not by <img>.
const CONVERTED_IMAGE_EXTENSIONS = new Set(['tif', 'tiff', 'heic', 'heif'])

const RASTER_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'avif', 'ico', ...CONVERTED_IMAGE_EXTENSIONS,
])

const MARKDOWN_EXTENSIONS = new Set(['md', 'markdown'])

function extOf(name: string): string {
  const lower = name.toLowerCase()
  return lower.includes('.') ? lower.split('.').pop()! : ''
}

// Raster images the Image viewer handles (not SVG).
export function isRasterImageFile(name: string): boolean {
  return RASTER_EXTENSIONS.has(extOf(name))
}

export function isSvgFile(name: string): boolean {
  return extOf(name) === 'svg'
}

export function isImageFile(name: string): boolean {
  return isRasterImageFile(name) || isSvgFile(name)
}

// Formats <img> can't decode, so they go through readImagePngDataUrl.
export function needsImageConversion(name: string): boolean {
  return CONVERTED_IMAGE_EXTENSIONS.has(extOf(name))
}

export function isMarkdownFile(name: string): boolean {
  return MARKDOWN_EXTENSIONS.has(extOf(name))
}

export function isPdfFile(name: string): boolean {
  return extOf(name) === 'pdf'
}

export function imageMimeType(name: string): string {
  const ext = extOf(name)
  if (ext === 'svg') return 'image/svg+xml'
  if (ext === 'jpg') return 'image/jpeg'
  if (ext === 'ico') return 'image/x-icon'
  return `image/${ext}`
}
