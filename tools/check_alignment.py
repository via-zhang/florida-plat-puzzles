"""Step 0b: confirm the 11 m JPG lines up with the 20 m COG.

At a dozen textured spots, the 11 m window is resampled to 20 m and
phase-correlated against the COG. Prints the offset in COG pixels.

    python tools/check_alignment.py
"""
import numpy as np
import rasterio
from rasterio.enums import Resampling
from rasterio.windows import from_bounds

from common import COG, TILED

N = 256  # window size in COG pixels (5.12 km)


def gray(a):
    return a.astype(np.float32).mean(axis=0)


def phase_corr(a, b):
    a = (a - a.mean()) * np.hanning(N)[:, None] * np.hanning(N)[None, :]
    b = (b - b.mean()) * np.hanning(N)[:, None] * np.hanning(N)[None, :]
    r = np.fft.fft2(a) * np.conj(np.fft.fft2(b))
    r = np.fft.ifft2(r / (np.abs(r) + 1e-9)).real
    y, x = np.unravel_index(np.argmax(r), r.shape)
    if y > N // 2: y -= N
    if x > N // 2: x -= N
    return x, y, r.max()


def main():
    cog, jpg = rasterio.open(COG), rasterio.open(TILED)
    f = 64
    m = cog.read_masks(1, out_shape=(cog.height // f, cog.width // f)) > 0
    rng = np.random.default_rng(1)
    ys, xs = np.nonzero(m)
    shifts = []
    tries = 0
    while len(shifts) < 12 and tries < 200:
        tries += 1
        i = rng.integers(len(ys))
        col, row = xs[i] * f, ys[i] * f
        if col + N > cog.width or row + N > cog.height:
            continue
        win = rasterio.windows.Window(col, row, N, N)
        if (cog.read_masks(1, window=win) > 0).mean() < 0.95:
            continue
        a = gray(cog.read(window=win))
        b = gray(jpg.read(window=from_bounds(*cog.window_bounds(win), jpg.transform),
                          out_shape=(3, N, N), resampling=Resampling.average))
        dx, dy, peak = phase_corr(a, b)
        lon_lat = cog.xy(row + N // 2, col + N // 2)
        print(f"at UTM {lon_lat[0]:9.0f},{lon_lat[1]:9.0f}: shift dx={dx:+d} dy={dy:+d} px (peak {peak:.2f})")
        shifts.append((dx, dy))
    s = np.array(shifts)
    print(f"median shift: dx={np.median(s[:,0]):+.1f} dy={np.median(s[:,1]):+.1f} COG px; "
          f"max |shift| = {np.abs(s).max()} px")


if __name__ == "__main__":
    main()
