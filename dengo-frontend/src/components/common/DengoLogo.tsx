// DENGO brand mark — same geometry and colours as docs/brand/logo_horizontal_oscuro.svg.
// The symbol is inline SVG so it stays sharp at any size; the wordmark is real text
// (Inter is already loaded), so it prints and scales without an image request.

export function DengoSymbol({ className = 'h-8 w-8' }: { className?: string }) {
  return (
    <svg viewBox="3 3 124 139" className={className} aria-hidden>
      <path d="M65 15 115 44v57l-50 29-50-29V44Z" fill="none" stroke="#1E4D68" strokeWidth={12} strokeLinejoin="round" strokeLinecap="round" />
      <line x1={15} y1={101} x2={115} y2={44} stroke="#1E4D68" strokeWidth={8} strokeLinecap="round" />
      <path d="M28 107 65 42l37 65" fill="none" stroke="#E07A5F" strokeWidth={12} strokeLinejoin="round" />
    </svg>
  )
}

interface Props {
  /** Height of the symbol; the wordmark scales with the font size class. */
  symbolClass?: string
  textClass?: string
  className?: string
}

export default function DengoLogo({ symbolClass = 'h-8 w-8', textClass = 'text-[19px]', className = '' }: Props) {
  return (
    <span className={`group/logo inline-flex items-center gap-2.5 ${className}`} aria-label="DENGO">
      <DengoSymbol className={`${symbolClass} flex-shrink-0 transition-transform duration-500 motion-safe:group-hover/logo:-rotate-6 motion-safe:group-hover/logo:scale-110`} />
      <span className={`font-bold tracking-[0.05em] text-[#1E4D68] leading-none ${textClass}`} aria-hidden>DENGO</span>
    </span>
  )
}
