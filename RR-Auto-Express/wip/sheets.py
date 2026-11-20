# Builds the 12-view contact sheet and one five-view orthographic sheet per vehicle from render_cycles.py output.
# usage: python3 wip/sheets.py <render_dir>
import sys, os
from PIL import Image, ImageDraw, ImageFont
D = sys.argv[1]
try:
    F = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 26); FS = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 20)
except Exception:
    F = FS = ImageFont.load_default()
NAMES = {'camry': 'Sedan (2021+ Camry-style)', 'f150': 'Crew-cab pickup (13th-gen F-150-style)'}
VIEWS = ['front_three_quarter', 'rear_three_quarter', 'front', 'rear', 'left_side', 'right_side']

# contact sheet: 2 rows (vehicles) x 6 views
tw, th = 600, 400
sheet = Image.new('RGB', (tw * 6 + 70, th * 2 + 150), (40, 42, 46)); d = ImageDraw.Draw(sheet)
d.text((20, 14), 'R&R Auto Express - generated vehicles, Blender Cycles path-traced renders', fill=(235, 235, 235), font=F)
for r, car in enumerate(['f150', 'camry']):
    y = 60 + r * (th + 45)
    d.text((20, y), NAMES[car], fill=(220, 220, 220), font=FS)
    for c, v in enumerate(VIEWS):
        p = os.path.join(D, f'{car}_{v}.png')
        if not os.path.exists(p): continue
        im = Image.open(p).convert('RGB'); im.thumbnail((tw, th))
        x = 20 + c * (tw + 6); sheet.paste(im, (x, y + 28)); d.text((x + 8, y + 32), v.replace('_', ' '), fill=(255, 255, 255), font=FS)
sheet.save(os.path.join(D, 'contact_sheet_12_views.png'))

# five-view orthographic sheets: front | left | rear on top row, top view + right side below, crop to content
def crop(im):
    bg = im.getpixel((2, 2)); w, h = im.size; px = im.load()
    xs = [x for x in range(0, w, 2) for y in range(0, h, 6) if sum(abs(a - b) for a, b in zip(px[x, y], bg)) > 30]
    ys = [y for y in range(0, h, 2) for x in range(0, w, 6) if sum(abs(a - b) for a, b in zip(px[x, y], bg)) > 30]
    if not xs: return im
    return im.crop((max(0, min(xs) - 12), max(0, min(ys) - 12), min(w, max(xs) + 12), min(h, max(ys) + 12)))
for car in ['f150', 'camry']:
    ims = {}
    for v in ['front', 'rear', 'left', 'right', 'top']:
        p = os.path.join(D, f'{car}_ortho_{v}.png')
        if os.path.exists(p): ims[v] = Image.open(p).convert('RGB')
    if len(ims) < 5: continue
    # every panel was rendered with its own ortho scale; rescale them to one common metres-per-pixel using the
    # scale saved by the renderer
    scales = {}
    sf = os.path.join(D, f'{car}_ortho_scales.txt')
    if os.path.exists(sf):
        for line in open(sf):
            k, val = line.split(); scales[k] = float(val)
    W0 = ims['left'].size[0]
    ref = scales.get('left')
    for v in ims:
        if ref and v in scales and scales[v] != ref:
            k = scales[v] / ref; im = ims[v]; ims[v] = im.resize((int(im.size[0] * k), int(im.size[1] * k)), Image.LANCZOS)
    c = {v: crop(ims[v]) for v in ims}
    pad = 30
    rowA = [c['front'], c['left'], c['rear']]; rowB = [c['top'], c['right']]
    Wt = max(sum(i.size[0] for i in rowA), sum(i.size[0] for i in rowB)) + pad * 4
    Ht = max(i.size[1] for i in rowA) + max(i.size[1] for i in rowB) + pad * 3 + 70
    S = Image.new('RGB', (Wt, Ht), (250, 250, 250)); d = ImageDraw.Draw(S)
    d.text((pad, 16), f'{NAMES[car]} - five-view orthographic check (same scale)', fill=(20, 30, 60), font=F)
    x = pad; y = 70
    for im, lab in zip(rowA, ['front', 'left side', 'rear']):
        S.paste(im, (x, y)); d.text((x + 4, y + im.size[1] - 26), lab, fill=(20, 30, 60), font=FS); x += im.size[0] + pad
    y += max(i.size[1] for i in rowA) + pad; x = pad
    for im, lab in zip(rowB, ['top (nose right)', 'right side']):
        S.paste(im, (x, y)); d.text((x + 4, y + 4), lab, fill=(20, 30, 60), font=FS); x += im.size[0] + pad
    S.save(os.path.join(D, f'{car}_five_view_sheet.png'))
print('sheets done')
