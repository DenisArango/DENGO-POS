// Images uploaded for the website (hero, offers, logo) are stored as data
// URLs like every other image in DENGO, but resized and re-encoded first:
// a phone photo is 3–6 MB, the site needs ~150 KB.

import sharp from 'sharp'

export async function compressDataUrl(value: string | null | undefined, maxWidth = 1600): Promise<string | null | undefined> {
  if (value === undefined || value === null || value === '') return value === '' ? null : value
  const m = value.match(/^data:image\/([a-z0-9.+-]+);base64,(.+)$/i)
  if (!m) return value // an https URL or something already processed: keep
  if (/svg/i.test(m[1]!)) return value // vector logos stay as they are
  try {
    const input = Buffer.from(m[2]!, 'base64')
    const meta = await sharp(input).metadata()
    const out = await sharp(input)
      .rotate()
      .resize({ width: Math.min(maxWidth, meta.width ?? maxWidth), withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer()
    // Keep the original if re-encoding didn't help (already tiny/optimised).
    return out.length < input.length ? `data:image/webp;base64,${out.toString('base64')}` : value
  } catch {
    throw Object.assign(new Error('La imagen no se pudo leer. Usa JPG, PNG o WebP.'), { statusCode: 400 })
  }
}
