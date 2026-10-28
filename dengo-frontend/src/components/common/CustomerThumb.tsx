// Small round photo for customer search results — the photo when the
// customer has one, otherwise their initials, so every row lines up.
export function CustomerThumb({ src, name, size = 36 }: { src?: string | null; name?: string; size?: number }) {
  const initials = (name ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0]!.toUpperCase())
    .join('') || '?'
  const style = { width: size, height: size }
  if (src) {
    return <img src={src} alt="" style={style} className="rounded-full object-cover flex-shrink-0 border border-gray-100" />
  }
  return (
    <div style={{ ...style, fontSize: Math.round(size * 0.36) }}
      className="rounded-full bg-primary-50 text-primary-600 font-semibold flex-shrink-0 flex items-center justify-center">
      {initials}
    </div>
  )
}
