# ASCII luminance map of an image + a few stats, so a screenshot can be checked without viewing it.
import sys
from PIL import Image
im = Image.open(sys.argv[1]).convert('RGB')
cols = int(sys.argv[2]) if len(sys.argv) > 2 else 70
box = None
if len(sys.argv) > 3:
    x0, y0, x1, y1 = [float(v) for v in sys.argv[3].split(',')]
    W, H = im.size; box = (int(x0 * W), int(y0 * H), int(x1 * W), int(y1 * H)); im = im.crop(box)
W, H = im.size
rows = max(1, int(cols * H / W * 0.5))
sm = im.resize((cols, rows), Image.BILINEAR)
ramp = ' .:-=+*#%@'
for y in range(rows):
    line = ''
    for x in range(cols):
        r, g, b = sm.getpixel((x, y)); l = (0.299 * r + 0.587 * g + 0.114 * b) / 255
        ch = ramp[min(9, int(l * 10))]
        if r > g + 40 and r > b + 40: ch = 'R'
        elif b > r + 35 and b > g + 10: ch = 'B'
        elif r > 150 and g > 100 and b < 80: ch = 'A'
        line += ch
    print(line)
