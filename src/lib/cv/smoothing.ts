// Landmark smoothing with the One Euro filter (Casiez et al., CHI 2012).
// It adapts its cut-off to speed: heavy smoothing when a joint is still (removes jitter in the
// ready position), light smoothing when it moves fast (keeps the swing from lagging).

import type { Point2, Point3, PoseFrame } from "./landmarks";

function alpha(cutoffHz: number, dtSec: number): number {
  const tau = 1 / (2 * Math.PI * cutoffHz);
  return 1 / (1 + tau / dtSec);
}

export class OneEuro {
  private xPrev: number | null = null;
  private dxPrev = 0;
  private tPrev: number | null = null;

  constructor(
    private minCutoff = 1.2,
    private beta = 0.03,
    private dCutoff = 1.0,
  ) {}

  /** @param t timestamp in ms */
  filter(x: number, t: number): number {
    if (this.xPrev === null || this.tPrev === null || t <= this.tPrev) {
      this.xPrev = x;
      this.tPrev = t;
      return x;
    }
    const dt = (t - this.tPrev) / 1000;
    const dx = (x - this.xPrev) / dt;
    const aD = alpha(this.dCutoff, dt);
    const dxHat = aD * dx + (1 - aD) * this.dxPrev;
    const cutoff = this.minCutoff + this.beta * Math.abs(dxHat);
    const a = alpha(cutoff, dt);
    const xHat = a * x + (1 - a) * this.xPrev;
    this.xPrev = xHat;
    this.dxPrev = dxHat;
    this.tPrev = t;
    return xHat;
  }

  reset(): void {
    this.xPrev = null;
    this.tPrev = null;
    this.dxPrev = 0;
  }
}

export interface SmootherOptions {
  /** One Euro min cut-off (Hz) for normalised image coords. Lower = smoother at rest. */
  minCutoff?: number;
  /** One Euro speed coefficient. Higher = less lag during fast motion. */
  beta?: number;
  /** A gap longer than this (ms) resets the filters (person left the frame). */
  resetAfterMs?: number;
}

/**
 * Smooths every landmark of a pose stream. Image coordinates are in 0..1 so the defaults are
 * tuned for that range; world coordinates (metres) use the same filter with a scaled beta.
 */
export class PoseSmoother {
  private img: OneEuro[][] = [];
  private wld: OneEuro[][] = [];
  private vis: number[] = [];
  private lastT = -Infinity;
  private readonly opts: Required<SmootherOptions>;

  constructor(opts: SmootherOptions = {}) {
    this.opts = { minCutoff: 1.5, beta: 8, resetAfterMs: 500, ...opts };
  }

  reset(): void {
    this.img = [];
    this.wld = [];
    this.vis = [];
    this.lastT = -Infinity;
  }

  smooth(frame: PoseFrame): PoseFrame {
    if (frame.t - this.lastT > this.opts.resetAfterMs) this.reset();
    this.lastT = frame.t;
    const { minCutoff, beta } = this.opts;
    const image: Point2[] = frame.image.map((p, i) => {
      if (!this.img[i]) this.img[i] = [new OneEuro(minCutoff, beta), new OneEuro(minCutoff, beta)];
      // visibility: simple EMA so a single dropped frame doesn't flicker the overlay
      this.vis[i] = this.vis[i] === undefined ? p.v : 0.6 * this.vis[i] + 0.4 * p.v;
      return { x: this.img[i][0].filter(p.x, frame.t), y: this.img[i][1].filter(p.y, frame.t), v: this.vis[i] };
    });
    let world: Point3[] | null = null;
    if (frame.world) {
      world = frame.world.map((p, i) => {
        if (!this.wld[i]) {
          this.wld[i] = [0, 1, 2].map(() => new OneEuro(minCutoff, beta / 2));
        }
        return {
          x: this.wld[i][0].filter(p.x, frame.t),
          y: this.wld[i][1].filter(p.y, frame.t),
          z: this.wld[i][2].filter(p.z, frame.t),
          v: image[i]?.v ?? p.v,
        };
      });
    }
    return { ...frame, image, world };
  }
}
