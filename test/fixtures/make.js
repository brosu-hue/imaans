/* Builds the documents the end-to-end test signs. */
const { PDFDocument, StandardFonts, rgb, degrees } = require('pdf-lib');
const fs = require('fs');
const path = require('path');
const OUT = __dirname;

async function agreement() {
  const d = await PDFDocument.create();
  const f = await d.embedFont(StandardFonts.Helvetica);
  const b = await d.embedFont(StandardFonts.HelveticaBold);
  const p = d.addPage([595, 842]);
  const T = (s, x, y, sz, fo) => p.drawText(s, { x, y, size: sz || 11, font: fo || f, color: rgb(.05,.05,.05) });
  const L = (x, y, w, th) => p.drawLine({ start:{x,y}, end:{x:x+w,y}, thickness: th||1, color: rgb(.1,.1,.1) });

  T('SUPPLY AGREEMENT', 150, 780, 20, b);
  T('Between Colour Match Coatings (Pty) Ltd and the Customer named below.', 60, 752, 10);
  T('1.  The Supplier shall deliver the goods listed in Annexure A within five', 60, 725);
  T('     working days of receipt of payment in full.', 60, 710);
  T('2.  Risk passes to the Customer on collection from the warehouse.', 60, 690);

  // A bordered table. Its rules must NOT be offered as places to sign.
  const tx = 60, ty = 600, tw = 475, rh = 22;
  for (let i = 0; i < 4; i++) L(tx, ty + i*rh, tw, 0.8);
  p.drawLine({ start:{x:tx,y:ty}, end:{x:tx,y:ty+3*rh}, thickness:.8, color: rgb(.1,.1,.1) });
  p.drawLine({ start:{x:tx+tw,y:ty}, end:{x:tx+tw,y:ty+3*rh}, thickness:.8, color: rgb(.1,.1,.1) });
  T('Item', tx+6, ty+2*rh+7, 10, b);  T('Qty', tx+300, ty+2*rh+7, 10, b);
  T('DIYE Basecoat 5L', tx+6, ty+rh+7, 10);   T('12', tx+300, ty+rh+7, 10);
  T('AutoPlus Thinners 5L', tx+6, ty+7, 10);  T('6', tx+300, ty+7, 10);

  L(60, 470, 230); T('Signature of Customer', 60, 455, 9);
  L(330, 470, 205); T('Date', 330, 455, 9);

  T('Signed for and on behalf of the Supplier:', 60, 400, 11, b);
  L(60, 360, 230); T('Signature', 60, 345, 9);
  L(330, 360, 205); T('Date', 330, 345, 9);

  T('Witness: ', 60, 290, 11);  L(120, 287, 180);
  T('Witness: ', 330, 290, 11); L(390, 287, 145);

  const p2 = d.addPage([595, 842]);
  p2.drawText('ANNEXURE A', { x:200, y:780, size:18, font:b });
  p2.drawText('Prices are quoted excluding VAT and are valid for 30 days.', { x:60, y:740, size:11, font:f });
  p2.drawLine({ start:{x:60,y:300}, end:{x:290,y:300}, thickness:1, color: rgb(.1,.1,.1) });
  p2.drawText('Authorised Signatory', { x:60, y:285, size:9, font:f });

  fs.writeFileSync(path.join(OUT, 'agreement.pdf'), await d.save());
}

async function rotated() {
  // Landscape content on a page a viewer must turn 90 degrees to show upright.
  const d = await PDFDocument.create();
  const f = await d.embedFont(StandardFonts.Helvetica);
  const b = await d.embedFont(StandardFonts.HelveticaBold);
  const p = d.addPage([595, 842]);
  p.setRotation(degrees(90));
  const T = (s,x,y,sz,fo) => p.drawText(s, { x, y, size: sz||11, font: fo||f, color: rgb(.05,.05,.05), rotate: degrees(90) });
  const L = (x,y,h) => p.drawLine({ start:{x,y}, end:{x,y:y+h}, thickness:1, color: rgb(.1,.1,.1) });
  T('DELIVERY NOTE (rotated page)', 120, 60, 18, b);
  T('Received in good order by:', 180, 60, 11);
  L(240, 60, 230);  T('Signature', 260, 60, 9);
  L(240, 330, 180); T('Date', 260, 330, 9);
  fs.writeFileSync(path.join(OUT, 'rotated.pdf'), await d.save());
}

(async () => { await agreement(); await rotated(); console.log('fixtures written to', OUT); })();
