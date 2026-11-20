// Owner screens' backend: invoices list/detail, payments, deductible, estimate approval.
// (Messages/SMS gateway, portal, schedule, parts, reports, insurers, paint and compliance extensions are added below as they are built.)
import { json, bad, notFound, r2, num, nowIso, today } from './util.js';
import { updateRow, insertRow } from './core.js';

const INV_SELECT = `SELECT i.*, j.number AS ro, j.status AS job_status, j.pay_type, j.customer_id, cu.name AS customer_name, cu.phone AS customer_phone,
  v.year, v.make, v.model, ins.name AS insurer_name,
  (SELECT COALESCE(SUM(amount),0) FROM payments p WHERE p.invoice_id=i.id) AS paid,
  (SELECT COALESCE(SUM(amount),0) FROM payments p WHERE p.invoice_id=i.id AND p.payer='insurer') AS paid_ins,
  (SELECT COALESCE(SUM(amount),0) FROM payments p WHERE p.invoice_id=i.id AND p.payer<>'insurer') AS paid_cust
  FROM invoices i JOIN jobs j ON j.id=i.job_id LEFT JOIN customers cu ON cu.id=j.customer_id LEFT JOIN vehicles v ON v.id=j.vehicle_id LEFT JOIN insurers ins ON ins.id=j.insurer_id`;
function withBalances(i) {
  i.paid = r2(i.paid); i.balance = r2(num(i.total) - num(i.paid));
  i.customer_balance = r2(num(i.customer_portion) - num(i.paid_cust));
  i.insurer_balance = r2(num(i.insurer_portion) - num(i.paid_ins));
  i.overdue = i.status !== 'paid' && i.status !== 'void' && i.due_date && i.due_date < today() && i.balance > 0.005;
  return i;
}
export async function invoiceStatus(c, invId) {
  const inv = await c.db.prepare('SELECT * FROM invoices WHERE id=?').bind(invId).first();
  if (!inv || inv.status === 'void') return inv?.status;
  const paid = (await c.db.prepare('SELECT COALESCE(SUM(amount),0) AS s FROM payments WHERE invoice_id=?').bind(inv.id).first()).s;
  const st = paid >= num(inv.total) - 0.005 && num(inv.total) > 0 ? 'paid' : paid > 0.005 ? 'partial' : 'open';
  await c.db.prepare('UPDATE invoices SET status=? WHERE id=?').bind(st, inv.id).run();
  return st;
}
export const APPROVED = ['approved', 'scheduled', 'in_production', 'completed', 'delivered', 'closed'];

export function registerOwner(R) {
  R.get('/api/invoices', async (c) => {
    c.need('accounting.read');
    const lf = c.locFilter('i');
    const rows = (await c.db.prepare(`${INV_SELECT} WHERE 1=1${lf.sql} ORDER BY i.id DESC LIMIT 500`).bind(...lf.args).all()).results.map(withBalances);
    // Jobs ready to invoice: approved estimates with no live invoice; and estimates still waiting for approval
    const lj = c.locFilter('j');
    const ready = (await c.db.prepare(`SELECT j.id, j.number, j.status, j.pay_type, cu.name AS customer_name, v.year, v.make, v.model,
      (SELECT COUNT(*) FROM estimate_lines e WHERE e.job_id=j.id) AS line_count
      FROM jobs j LEFT JOIN customers cu ON cu.id=j.customer_id LEFT JOIN vehicles v ON v.id=j.vehicle_id
      WHERE j.status NOT IN ('lost','total_loss') AND NOT EXISTS (SELECT 1 FROM invoices i WHERE i.job_id=j.id AND i.status<>'void')${lj.sql}
      ORDER BY j.id DESC LIMIT 100`).bind(...lj.args).all()).results;
    const sum = (f) => r2(rows.filter((i) => i.status !== 'void').reduce((a, i) => a + num(i[f]), 0));
    return json({ invoices: rows, ready, totals: { billed: sum('total'), paid: sum('paid'), balance: sum('balance'), overdue: rows.filter((i) => i.overdue).length } });
  });
  R.get('/api/invoices/:id', async (c) => {
    c.need('accounting.read');
    const inv = await c.db.prepare(`${INV_SELECT} WHERE i.id=?`).bind(c.id()).first();
    if (!inv) throw notFound();
    await c.job(inv.job_id);
    const payments = (await c.db.prepare('SELECT * FROM payments WHERE invoice_id=? ORDER BY received_at, id').bind(inv.id).all()).results;
    return json({ invoice: withBalances(inv), payments });
  });
  // Owner approves the estimate (customer said yes by phone / in person)
  R.post('/api/jobs/:id/approve', async (c) => {
    c.need('accounting.write');
    const job = await c.job(c.id());
    if (job.status !== 'estimate') return json({ ok: true, status: job.status });
    await c.db.prepare("UPDATE jobs SET status='approved', approved_at=?, approved_by=?, updated=? WHERE id=?").bind(nowIso(), c.user.name, nowIso(), job.id).run();
    await c.event(job.id, 'approval', `Estimate approved by ${c.user.name}`);
    await c.audit('approve', 'estimate', job.id, job.id, '');
    return json({ ok: true, status: 'approved' });
  });
  // Change the deductible on an invoice: moves money between the customer and insurer portions
  R.put('/api/invoices/:id/deductible', async (c) => {
    c.need('accounting.write');
    const inv = await c.db.prepare('SELECT * FROM invoices WHERE id=?').bind(c.id()).first();
    if (!inv) throw notFound();
    const job = await c.job(inv.job_id);
    if (inv.status === 'void') throw bad('This invoice is void');
    const ded = r2(Math.max(0, num(c.body.deductible)));
    if (ded > num(inv.total)) throw bad('The deductible can\'t be more than the invoice total');
    const extra = Math.max(0, num(inv.customer_portion) - num(inv.deductible)); // betterment / customer-pay items
    const cust = r2(Math.min(num(inv.total), ded + (job.pay_type === 'insurance' ? extra : 0)));
    const custPortion = job.pay_type === 'insurance' ? cust : num(inv.total);
    await c.db.prepare('UPDATE invoices SET deductible=?, customer_portion=?, insurer_portion=? WHERE id=?').bind(ded, custPortion, r2(num(inv.total) - custPortion), inv.id).run();
    await c.db.prepare('UPDATE jobs SET deductible=?, updated=? WHERE id=?').bind(ded, nowIso(), job.id).run();
    await c.event(job.id, 'invoice', `${inv.number} deductible set to $${ded}`);
    await c.audit('update', 'invoice', inv.id, job.id, { deductible: ded });
    return json({ ok: true });
  });
  R.del('/api/payments/:id', async (c) => {
    c.need('accounting.write');
    const p = await c.db.prepare('SELECT * FROM payments WHERE id=?').bind(c.id()).first();
    if (!p) throw notFound();
    await c.job(p.job_id);
    await c.db.prepare('DELETE FROM payments WHERE id=?').bind(p.id).run();
    if (p.invoice_id) await invoiceStatus(c, p.invoice_id);
    await c.event(p.job_id, 'payment', `Removed ${p.kind || 'payment'} of $${p.amount}`);
    await c.audit('delete', 'payment', p.id, p.job_id, p);
    return json({ ok: true });
  });
}
