import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'

/**
 * Renders an off-screen DOM element (see QuotationPrint's `variant="export"`)
 * to a multi-page letter-size PDF Blob. Paginates by shifting the same full
 * page screenshot up by one page height per added page — the standard
 * html2canvas+jsPDF pattern; a table row can occasionally straddle a page
 * break, acceptable for a document this short-lived (an emailed/WhatsApped
 * quotation, not an archival record).
 */
export async function elementToPdfBlob(elementId: string): Promise<Blob> {
  const el = document.getElementById(elementId)
  if (!el) throw new Error('No se encontró el contenido a exportar')

  const canvas = await html2canvas(el, { scale: 2, backgroundColor: '#ffffff' })
  const imgData = canvas.toDataURL('image/jpeg', 0.92)

  const pdf = new jsPDF({ unit: 'pt', format: 'letter' })
  const pageWidth = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()
  const imgWidth = pageWidth
  const imgHeight = (canvas.height * imgWidth) / canvas.width

  let heightLeft = imgHeight
  let position = 0
  pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight)
  heightLeft -= pageHeight

  while (heightLeft > 0) {
    position = heightLeft - imgHeight
    pdf.addPage()
    pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight)
    heightLeft -= pageHeight
  }

  return pdf.output('blob')
}

/** Triggers a browser download of a blob under the given filename. */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
