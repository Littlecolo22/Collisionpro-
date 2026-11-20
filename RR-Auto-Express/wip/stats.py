import sys
from PIL import Image
import numpy as np
for f in sys.argv[1:]:
    a = np.asarray(Image.open(f).convert('RGB')).astype(float); l = a.mean(2); H, W = l.shape
    med = np.median(l[:, :W // 8], axis=1, keepdims=True)
    mask = np.abs(l - med) > 14
    ys, xs = np.where(mask)
    if not len(xs): print(f, 'no car'); continue
    x0, x1 = np.percentile(xs, [1, 99]).astype(int); y0, y1 = np.percentile(ys, [1, 99]).astype(int)
    car = a[y0:y1, x0:x1][mask[y0:y1, x0:x1]]; cl = car.mean(1)
    print(f, f'car box x{x0}-{x1} y{y0}-{y1} of {W}x{H}', 'lum p5/25/50/75/95', np.percentile(cl, [5, 25, 50, 75, 95]).round().tolist(), 'clip%', round((car >= 250).all(1).mean() * 100, 2), 'bg top', round(l[5:30, 5:W // 6].mean()), 'bg horizon', round(l[int(y1 * 0.8), 5:W // 8].mean()))
    below = [round(l[min(H - 1, y1 + k), (x0 + x1) // 2 - 40:(x0 + x1) // 2 + 40].mean()) for k in (4, 15, 35, 70)]
    side = round(l[min(H - 1, y1 + 15), 5:40].mean())
    print('   floor under car', below, 'floor far side', side)
