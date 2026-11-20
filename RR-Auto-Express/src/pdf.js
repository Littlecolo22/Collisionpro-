// Professional estimate / supplement / invoice PDF using pdf-lib (runs inside the Worker).
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { num, r2 } from './util.js';
import { loadFileBytes } from './files.js';

const money = (n) => '$' + num(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const hrs = (n) => (num(n) ? num(n).toFixed(1) : '');
const OPS = { replace: 'Repl', repair: 'Rpr', 'r&i': 'R&I', refinish: 'Rfn', blend: 'Blnd', sublet: 'Subl', misc: 'Misc', 'o/h': 'O/H', align: 'Algn', add_labor: 'Add L', add_cost: 'Add $' };
// Standard PDF fonts only cover WinAnsi; strip anything else so drawing never throws
const clean = (s) => String(s ?? '').replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"').replace(/[\u2013\u2014]/g, '-').replace(/[^\x20-\x7E\xA0-\xFF]/g, '');

export async function buildEstimatePdf(env, b, { kind = 'estimate', supplement = null, settings = {}, photos = 6, invoice = null } = {}) {
  const doc = await PDFDocument.create();
  const F = await doc.embedFont(StandardFonts.Helvetica);
  const FB = await doc.embedFont(StandardFonts.HelveticaBold);
  const W = 612, H = 792, M = 36;
  const ink = rgb(0.1, 0.12, 0.16), mute = rgb(0.42, 0.45, 0.5), brand = rgb(0.86, 0.2, 0.15), line = rgb(0.85, 0.87, 0.9), band = rgb(0.95, 0.96, 0.97);
  let page, y;
  const shop = clean(settings.shop_name || b.location?.name || 'Collision Center');
  const title = kind === 'invoice' ? `INVOICE ${invoice?.number || ''}` : kind === 'supplement' ? `SUPPLEMENT S${supplement}` : 'REPAIR ESTIMATE';
  const veh = b.vehicle || {};
  const vehName = clean([veh.year, veh.make, veh.model, veh.trim].filter(Boolean).join(' '));
  let pageNo = 0;

  const txt = (s, x, yy, { size = 9, font = F, color = ink, maxW = null, align = 'left' } = {}) => {
    let t = clean(s);
    if (maxW) while (t.length > 1 && font.widthOfTextAtSize(t, size) > maxW) t = t.slice(0, -2) + '.';
    let xx = x;
    if (align === 'right') xx = x - font.widthOfTextAtSize(t, size);
    if (align === 'center') xx = x - font.widthOfTextAtSize(t, size) / 2;
    page.drawText(t, { x: xx, y: yy, size, font, color });
  };
  const wrap = (s, size, maxW, font = F) => {
    const words = clean(s).split(/\s+/); const out = []; let cur = '';
    for (const w of words) { const t = cur ? cur + ' ' + w : w; if (font.widthOfTextAtSize(t, size) > maxW && cur) { out.push(cur); cur = w; } else cur = t; }
    if (cur) out.push(cur); return out;
  };
  const header = () => {
    page = doc.addPage([W, H]); pageNo++;
    page.drawRectangle({ x: 0, y: H - 6, width: W, height: 6, color: brand });
    txt(shop, M, H - 40, { size: 16, font: FB });
    txt([b.location?.address, b.location?.phone, b.location?.email].filter(Boolean).join('  |  '), M, H - 55, { size: 8, color: mute, maxW: 330 });
    txt(title, W - M, H - 38, { size: 13, font: FB, color: brand, align: 'right' });
    txt(`RO ${b.job.number}   |   ${new Date().toLocaleDateString('en-US')}`, W - M, H - 53, { size: 8.5, color: mute, align: 'right' });
    page.drawLine({ start: { x: M, y: H - 66 }, end: { x: W - M, y: H - 66 }, thickness: 0.8, color: line });
    y = H - 82;
  };
  const footer = () => {
    for (const [i, p] of doc.getPages().entries()) {
      p.drawText(clean(`${shop}  |  ${b.job.number}  |  Page ${i + 1} of ${doc.getPageCount()}`), { x: M, y: 20, size: 7.5, font: F, color: mute });
    }
  };
  const need = (h) => { if (y - h < 50) { header(); return true; } return false; };

  header();
  // Customer / vehicle / claim blocks
  const col = (x, label, rows) => {
    txt(label, x, y, { size: 7.5, font: FB, color: mute });
    rows.filter((r) => r && r[1]).forEach((r, i) => { txt(r[0], x, y - 13 - i * 11, { size: 7.5, color: mute }); txt(r[1], x + 44, y - 13 - i * 11, { size: 8.5, maxW: 128 }); });
  };
  col(M, 'CUSTOMER', [['Name', b.customer?.name], ['Phone', b.customer?.phone], ['Email', b.customer?.email], ['Address', b.customer?.address]]);
  col(M + 184, 'VEHICLE', [['Vehicle', vehName], ['VIN', veh.vin], ['Color', [veh.color, veh.paint_code].filter(Boolean).join(' / ')], ['Mileage', veh.odometer ? num(veh.odometer).toLocaleString('en-US') : ''], ['Plate', veh.plate]]);
  col(M + 368, b.insurer ? 'INSURANCE' : 'PAYMENT', b.insurer ? [['Company', b.insurer.name], ['Claim', b.job.claim_no], ['Policy', b.job.policy_no], ['Adjuster', b.job.adjuster], ['Loss date', b.job.loss_date]] : [['Pay type', 'Customer pay'], ['Estimator', b.estimator?.name]]);
  y -= 78;

  // Photos strip
  const pics = b.files.filter((f) => f.category === 'photo' && /jpeg|png/.test(f.content_type) && !['signature', 'vin', 'odometer'].includes(f.kind)).slice(0, photos);
  if (pics.length) {
    const pw = (W - 2 * M - 10 * 2) / 3, ph = pw * 0.62;
    let drawn = 0;
    for (const f of pics) {
      try {
        const row = await env.DB.prepare('SELECT * FROM files WHERE id=?').bind(f.id).first();
        const bytes = await loadFileBytes(env, row);
        const img = /png/.test(f.content_type) ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
        if (drawn % 3 === 0) { need(ph + 18); if (drawn === 0) { txt('DAMAGE PHOTOS', M, y, { size: 7.5, font: FB, color: mute }); y -= 8; } y -= ph; }
        const x = M + (drawn % 3) * (pw + 10);
        const s = Math.min(pw / img.width, ph / img.height);
        page.drawRectangle({ x, y, width: pw, height: ph, color: band });
        page.drawImage(img, { x: x + (pw - img.width * s) / 2, y: y + (ph - img.height * s) / 2, width: img.width * s, height: img.height * s });
        drawn++;
        if (drawn % 3 === 0) y -= 8;
      } catch { /* skip unreadable image */ }
    }
    if (drawn % 3 !== 0) y -= 8;
    y -= 10;
  }

  // Line items grouped by area
  const lines = supplement !== null ? b.lines.filter((l) => num(l.supplement_no) === supplement) : b.lines;
  const cols = [[M, 'Line', 'left'], [M + 26, 'Oper', 'left'], [M + 58, 'Description', 'left'], [M + 300, 'Part', 'left'], [M + 362, 'Qty', 'right'], [M + 410, 'Price', 'right'], [M + 446, 'Labor', 'right'], [M + 480, 'Tear', 'right'], [M + 512, 'Paint', 'right'], [W - M, '', 'right']];
  const tableHead = () => {
    page.drawRectangle({ x: M, y: y - 4, width: W - 2 * M, height: 15, color: ink });
    for (const [x, h, a] of cols) txt(h, a === 'right' ? x : x + 2, y, { size: 7.5, font: FB, color: rgb(1, 1, 1), align: a });
    y -= 17;
  };
  need(40); tableHead();
  const t0 = (supplement !== null ? b.totals_supp : b.totals) || {};
  const groups = {};
  for (const l of lines) (groups[l.area || 'General'] ||= []).push(l);
  for (const [area, ls] of Object.entries(groups)) {
    if (need(30)) tableHead();
    txt(area.toUpperCase(), M + 2, y, { size: 8, font: FB, color: brand });
    y -= 12;
    for (const l of ls) {
      const lc = (t0.line_calc || {})[l.id] || {};
      const flags = [l.supplement_no && supplement === null ? `[S${l.supplement_no}]` : '', l.not_included ? '(not incl.)' : '', l.incl ? '(Incl.)' : '', num(l.labor_overlap) || num(l.refinish_overlap) ? `(overlap -${hrs(num(l.labor_overlap) + num(l.refinish_overlap))})` : '', num(l.betterment_pct) ? `(betterment ${num(l.betterment_pct)}%)` : '', l.paint_stage === '3stage' ? '(3-stage)' : l.paint_stage === '2tone' ? '(2-tone)' : '', l.part_no ? `#${l.part_no}` : ''].filter(Boolean).join(' ');
      const desc = wrap((l.judgment ? '* ' : '') + l.description + (flags ? '  ' + flags : ''), 8.5, 236);
      const hgt = Math.max(1, desc.length) * 10 + 3;
      if (need(hgt + 4)) tableHead();
      txt(String(l.line_no), M + 2, y, { size: 8.5, color: mute });
      txt(OPS[l.operation] || l.operation, M + 26, y, { size: 8.5, font: FB });
      desc.forEach((d, i) => txt(d, M + 58, y - i * 10, { size: 8.5 }));
      txt(l.part_type ? (l.part_type === 'aftermarket' ? 'A/M' : l.part_type === 'recycled' ? 'LKQ' : l.part_type === 'reconditioned' ? 'Recon' : l.part_type) : '', M + 300, y, { size: 8 });
      txt(l.operation === 'replace' ? String(num(l.qty, 1)) : '', M + 362, y, { size: 8.5, align: 'right' });
      txt(l.incl ? 'Incl.' : lc.sublet ? money(lc.sublet) : lc.misc ? money(lc.misc) : lc.net ? money(lc.net) : '', M + 410, y, { size: 8.5, align: 'right' });
      txt(l.incl ? '' : hrs(lc.labor_h ?? l.labor_hours), M + 446, y, { size: 8.5, align: 'right' });
      txt(hrs(l.teardown_hours), M + 480, y, { size: 8.5, align: 'right' });
      txt(l.incl ? '' : hrs(lc.refinish_h ?? l.refinish_hours), M + 512, y, { size: 8.5, align: 'right' });
      txt(l.labor_type && l.labor_type !== 'body' && num(l.labor_hours) ? l.labor_type.slice(0, 5) : '', W - M, y, { size: 7, color: mute, align: 'right' });
      y -= hgt;
      page.drawLine({ start: { x: M, y: y + 4 }, end: { x: W - M, y: y + 4 }, thickness: 0.3, color: line });
    }
    y -= 4;
  }
  if (!lines.length) { txt('No line items yet.', M + 2, y, { color: mute }); y -= 14; }

  // Totals (whole estimate, or this supplement's lines only)
  const t = supplement !== null ? b.totals_supp : b.totals;
  const rows = [
    [`Body labor (${hrs(t.hours.body) || '0.0'} h)`, t.labor_by_type.body],
    t.hours.frame ? [`Frame labor (${hrs(t.hours.frame)} h)`, t.labor_by_type.frame] : null,
    t.hours.structural ? [`Structural labor (${hrs(t.hours.structural)} h)`, t.labor_by_type.structural] : null,
    t.hours.mech ? [`Mechanical labor (${hrs(t.hours.mech)} h)`, t.labor_by_type.mech] : null,
    t.hours.glass ? [`Glass labor (${hrs(t.hours.glass)} h)`, t.labor_by_type.glass] : null,
    [`Teardown / R&I labor (${hrs(t.teardown_hours) || '0.0'} h)`, t.teardown],
    [`Refinish labor (${hrs(t.refinish_hours) || '0.0'} h)`, t.refinish],
    ['Parts', t.parts], t.parts_markup ? ['  incl. parts markup', t.parts_markup] : null, t.parts_discount ? ['  incl. parts discount', -t.parts_discount] : null,
    [t.rules?.pm?.mode === 'pct_rfn_labor' ? `Paint & materials (${num(t.rules.pm.pct)}% of refinish labor)` : `Paint & materials (${hrs(t.pm_hours ?? t.refinish_hours) || '0.0'} h x ${money(t.rules?.pm?.rate ?? t.rates.paint_mat)})`, t.paint_materials],
    t.sublet ? ['Sublet', t.sublet] : null, t.misc ? ['Miscellaneous', t.misc] : null,
    ...(t.tax_by_cat && Object.keys(t.tax_by_cat).length ? Object.entries(t.tax_by_cat).map(([k, v]) => [`Tax: ${k.replace('labor_', 'labor ').replace('paint_mat', 'paint & materials')} (${(num(t.rules.tax[k]) * 100).toFixed(2)}%)`, v]) : [['Tax', t.tax]]),
  ].filter(Boolean);
  const boxH = rows.length * 13 + 70;
  need(boxH + 70);
  const bx = W - M - 240;
  // Notes on the left
  const notes = [];
  if (lines.some((l) => l.source === 'ai' || l.source === '3d' || l.source === 'catalog' || (l.notes || '').includes('Sample'))) notes.push('Labor times and part prices marked as sample come from a demonstration guide and must be verified against a licensed estimating database before repairs.');
  if (b.adas_suggested?.length) notes.push('Safety system calibration may be required: ' + b.adas_suggested.map((a) => a.system).join(', ') + '.');
  if (lines.some((l) => l.judgment)) notes.push('* = judgment time: labor set by the estimator, not taken from the labor guide.');
  if (b.job.notes) notes.push(b.job.notes);
  if (settings.disclaimer) notes.push(settings.disclaimer);
  let ny = y;
  txt('NOTES', M, ny, { size: 7.5, font: FB, color: mute }); ny -= 12;
  for (const n of notes) for (const ln of wrap(n, 8, 250)) { txt(ln, M, ny, { size: 8, color: mute }); ny -= 10; }
  page.drawRectangle({ x: bx, y: y - boxH + 10, width: 240, height: boxH, color: band });
  let ty = y;
  for (const [k, v] of rows) { txt(k, bx + 10, ty, { size: 8.5, maxW: 160 }); txt(money(v), W - M - 10, ty, { size: 8.5, align: 'right' }); ty -= 13; }
  page.drawLine({ start: { x: bx + 10, y: ty + 6 }, end: { x: W - M - 10, y: ty + 6 }, thickness: 0.8, color: ink });
  ty -= 6;
  txt(supplement !== null ? `SUPPLEMENT S${supplement} TOTAL` : 'GRAND TOTAL', bx + 10, ty, { size: 10.5, font: FB }); txt(money(t.total), W - M - 10, ty, { size: 10.5, font: FB, align: 'right' }); ty -= 15;
  if (supplement === null && b.job.pay_type === 'insurance') {
    const cp = kind === 'invoice' && invoice ? num(invoice.customer_portion) : t.customer_pays, ip = kind === 'invoice' && invoice ? num(invoice.insurer_portion) : t.insurer_pays;
    txt(t.betterment ? 'Customer pays (deductible + betterment)' : 'Deductible (customer pays)', bx + 10, ty, { size: 8.5 }); txt(money(cp), W - M - 10, ty, { size: 8.5, align: 'right' }); ty -= 12;
    txt('Insurance pays', bx + 10, ty, { size: 8.5 }); txt(money(ip), W - M - 10, ty, { size: 8.5, align: 'right' }); ty -= 12;
  }
  if (kind === 'invoice') {
    txt('Paid to date', bx + 10, ty, { size: 8.5 }); txt(money(b.paid), W - M - 10, ty, { size: 8.5, align: 'right' }); ty -= 12;
    txt('Balance due', bx + 10, ty, { size: 9, font: FB }); txt(money(r2(num(invoice?.total, t.total) - b.paid)), W - M - 10, ty, { size: 9, font: FB, align: 'right' }); ty -= 12;
  }
  y = Math.min(ty, ny) - 24;

  // Signature
  need(70);
  const sig = b.approvals?.find((a) => a.signature_file_id);
  txt(kind === 'invoice' ? 'I acknowledge receipt of my vehicle and that the repairs above were completed.' : 'I authorize the repairs listed above and agree to pay any amount not covered by insurance.', M, y, { size: 8, color: mute });
  y -= 34;
  if (sig && kind !== 'invoice') {
    try {
      const row = await env.DB.prepare('SELECT * FROM files WHERE id=?').bind(sig.signature_file_id).first();
      const img = await doc.embedPng(await loadFileBytes(env, row));
      const s = Math.min(160 / img.width, 34 / img.height);
      page.drawImage(img, { x: M, y: y + 2, width: img.width * s, height: img.height * s });
      txt(`Signed online by ${sig.signer_name} on ${String(sig.signed_at).slice(0, 16)} UTC`, M + 330, y + 6, { size: 7.5, color: mute });
    } catch { /* ignore */ }
  }
  page.drawLine({ start: { x: M, y }, end: { x: M + 260, y }, thickness: 0.6, color: ink });
  page.drawLine({ start: { x: M + 300, y }, end: { x: M + 420, y }, thickness: 0.6, color: ink });
  txt('Customer signature', M, y - 10, { size: 7.5, color: mute });
  txt('Date', M + 300, y - 10, { size: 7.5, color: mute });
  if (settings.estimate_footer) { y -= 28; for (const ln of wrap(settings.estimate_footer, 7.5, W - 2 * M)) { need(12); txt(ln, M, y, { size: 7.5, color: mute }); y -= 9; } }
  footer();
  doc.setTitle(`${title} ${b.job.number}`);
  doc.setAuthor(shop);
  doc.setCreator('CollisionPro');
  return await doc.save();
}
