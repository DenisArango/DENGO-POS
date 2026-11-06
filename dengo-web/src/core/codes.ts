// QR and barcode for a coupon, drawn on the server as SVG (no JavaScript on
// the phone, works on any screen, prints crisp). The payload is
// "CUP-XXXXXXXX": the POS knows a scan that starts with CUP- is a coupon.
// The barcode (Code 128) is there for registers whose scanner reads only
// 1-D codes; 2-D scanners and phone cameras read the QR.

import bwipjs from 'bwip-js/node'

export function qrSvg(text: string, color = '#000000') {
  return bwipjs.toSVG({ bcid: 'qrcode', text, scale: 4, paddingwidth: 0, paddingheight: 0, barcolor: color.replace('#', '') })
}

export function barcodeSvg(text: string, color = '#000000') {
  return bwipjs.toSVG({ bcid: 'code128', text, scale: 2, height: 14, includetext: false, barcolor: color.replace('#', '') })
}
