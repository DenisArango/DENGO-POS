// Shared by ProductModal.tsx (product photos) and Stores.tsx (branch logo +
// quotation letterhead) — every one of these images used to go straight into
// the database as raw base64, often 2-5MB for a real phone photo. Parsing/
// serializing that much text on every save was blocking the backend's
// single event-loop thread for hundreds of ms to seconds (showing up to
// cashiers as general app-wide lag and "error en el servidor" on whatever
// else happened to be in flight at the same time). Downscaling to a sane
// size and re-encoding as JPEG here means what reaches the server is a few
// hundred KB, not several MB.
const MAX_IMAGE_DIMENSION = 1280
const IMAGE_JPEG_QUALITY = 0.82

export function compressImageDataUrl(
  dataUrl: string,
  maxDimension: number = MAX_IMAGE_DIMENSION,
  quality: number = IMAGE_JPEG_QUALITY,
  // Logos/letterheads are flat-color graphics and text, not photos — JPEG's
  // chroma subsampling blurs their edges and muddies colors (the "washed
  // out" look on a printed logo). PNG is lossless and costs nothing extra
  // for something this small, so logos/letterheads should request it.
  format: 'jpeg' | 'png' = 'jpeg',
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, maxDimension / Math.max(img.width, img.height))
      const w = Math.round(img.width * scale)
      const h = Math.round(img.height * scale)
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      if (!ctx) { resolve(dataUrl); return } // canvas unsupported — fall back to the original rather than lose the image
      if (format === 'jpeg') {
        // White background first — JPEG has no alpha channel, so a
        // transparent PNG would otherwise come out with black where it used
        // to be see-through.
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, w, h)
      }
      ctx.drawImage(img, 0, 0, w, h)
      resolve(format === 'png' ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', quality))
    }
    img.onerror = () => reject(new Error('No se pudo procesar la imagen'))
    img.src = dataUrl
  })
}

// Reads a File/Blob (ej. from an <input type="file"> or a dropped file) and
// resolves with its compressed data: URL — the common case everywhere this
// is used.
export function readAndCompressImageFile(
  file: Blob,
  maxDimension?: number,
  quality?: number,
  format?: 'jpeg' | 'png',
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      compressImageDataUrl(reader.result as string, maxDimension, quality, format).then(resolve).catch(reject)
    }
    reader.onerror = () => reject(new Error('Error al leer la imagen'))
    reader.readAsDataURL(file)
  })
}
