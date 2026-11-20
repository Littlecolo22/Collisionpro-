// "This phone" settings: saved on the device only (each phone can differ), shown in Settings and My account.
import { toast, esc } from './app.js';

const OPTS = [
  ['auto', 'Automatic', 'Light 3D on phones, full 3D on computers. Extras switch on only when the phone keeps up.'],
  ['lite', '3D lite', 'No floor reflection and lower sharpness. Smoothest on older phones.'],
  ['full', '3D full', 'Floor reflection and full sharpness. It still steps down if the phone falls behind.'],
  ['2d', '2D only', 'Never load 3D on this device. The parts tab uses the 2D diagram.'],
];
export function devicePrefs(box) {
  if (!box) return;
  let cur = 'auto'; try { cur = localStorage.getItem('cp_3dq') || 'auto'; } catch { /* storage blocked */ }
  box.innerHTML = `<h3>Parts view on this device</h3><p class="sm mut">How the 3D car on the Parts tab runs on this phone or computer. Saved on this device only.</p>
  <div class="qopts" role="radiogroup" aria-label="Parts view">${OPTS.map(([v, t, d]) => `<label class="qopt"><input type="radio" name="q3d" value="${v}" ${v === cur ? 'checked' : ''}><span><b>${esc(t)}</b><span class="sm mut">${esc(d)}</span></span></label>`).join('')}</div>`;
  box.querySelectorAll('input[name=q3d]').forEach((r) => r.onchange = async () => {
    try { localStorage.setItem('cp_3dq', r.value); if (r.value === '2d') localStorage.setItem('cp_view', '2d'); } catch { /* */ }
    if (r.value === '2d') { try { (await import('./car3d.js')).releaseShared3d(); } catch { /* */ } }
    toast('Saved. Applies next time you open the Parts tab.');
  });
}
