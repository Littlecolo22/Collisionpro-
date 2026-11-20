# Draws the R&R Auto Express launcher icon at every density.
from PIL import Image, ImageDraw, ImageFont
import os
BASE = os.path.dirname(os.path.abspath(__file__))
FONT = '/usr/share/fonts/truetype/freefont/FreeSansBold.ttf'
SIZES = {'mdpi': 48, 'hdpi': 72, 'xhdpi': 96, 'xxhdpi': 144, 'xxxhdpi': 192}

def draw(n):
    S = 1024
    im = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle([40, 40, S - 40, S - 40], radius=210, fill=(15, 27, 45, 255))
    # red speed stripe
    d.polygon([(130, 690), (900, 690), (860, 760), (90, 760)], fill=(214, 40, 40, 255))
    f = ImageFont.truetype(FONT, 330)
    t = 'R&R'
    w = d.textlength(t, font=f)
    d.text(((S - w) / 2, 250), t, font=f, fill=(255, 255, 255, 255))
    f2 = ImageFont.truetype(FONT, 92)
    t2 = 'AUTO EXPRESS'
    w2 = d.textlength(t2, font=f2)
    d.text(((S - w2) / 2, 790), t2, font=f2, fill=(200, 210, 225, 255))
    return im.resize((n, n), Image.LANCZOS)

for k, n in SIZES.items():
    p = os.path.join(BASE, 'res', 'mipmap-' + k)
    os.makedirs(p, exist_ok=True)
    draw(n).save(os.path.join(p, 'ic_launcher.png'))
draw(512).save(os.path.join(BASE, 'icon_512.png'))
print('icons ok')
