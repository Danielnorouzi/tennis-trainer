// Camera-setup and tracking-quality checks, computed from live landmarks and tiny thumbnails.
// Anything that cannot be verified automatically is returned as a "manual" item rather than
// pretending it passed.

import { QUALITY } from "./config";
import type { FeatureFrame } from "./features";

export type CheckStatus = "pass" | "warn" | "fail" | "manual" | "pending";

export interface SetupCheck {
  id: "person" | "full_body" | "feet" | "arms" | "distance" | "lighting" | "stable" | "single_person" | "confidence" | "space";
  label: string;
  status: CheckStatus;
  message: string;
}

export interface QualityInput {
  /** recent feature frames (most recent last), ~1–2 s */
  recent: FeatureFrame[];
  /** mean frame luminance 0–255, or null if not measured */
  luma: number | null;
  /** mean absolute thumbnail change outside the player box, or null if not measured */
  backgroundMotion: number | null;
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : NaN);

export function evaluateSetup({ recent, luma, backgroundMotion }: QualityInput): SetupCheck[] {
  const checks: SetupCheck[] = [];
  const seen = recent.filter((f) => f.vis.core > 0.3);
  const personRatio = recent.length ? seen.length / recent.length : 0;

  if (!recent.length || personRatio < 0.5) {
    checks.push({ id: "person", label: "Player detected", status: "fail", message: "No person detected. Step into the frame so your whole body is visible." });
    checks.push({ id: "lighting", label: "Lighting", ...lightingStatus(luma) });
    checks.push(manualSpace());
    return checks;
  }
  checks.push({ id: "person", label: "Player detected", status: "pass", message: "Player detected." });

  const overall = avg(seen.map((f) => f.vis.overall));
  const inFrame = avg(seen.map((f) => f.vis.inFrame));
  const feet = avg(seen.map((f) => f.vis.feet));
  const arms = avg(seen.map((f) => f.vis.arms));
  const height = avg(seen.map((f) => f.bodyHeightFrac));
  const top = avg(seen.map((f) => f.bbox.y0));
  const bottom = avg(seen.map((f) => f.bbox.y1));
  const left = avg(seen.map((f) => f.bbox.x0));
  const right = avg(seen.map((f) => f.bbox.x1));

  checks.push(
    inFrame > 0.9
      ? { id: "full_body", label: "Whole body in frame", status: "pass", message: "Your whole body is in the frame." }
      : {
          id: "full_body",
          label: "Whole body in frame",
          status: inFrame > 0.7 ? "warn" : "fail",
          message:
            top < 0.03 ? "Your head is at the edge of the frame. Tilt the camera down or move it back."
            : left < 0.03 || right > 0.97 ? "Part of your body is outside the side of the frame. Re-centre yourself."
            : "Some joints are outside the frame. Move the camera back slightly.",
        },
  );
  checks.push(
    feet >= QUALITY.minFeetVisibility && bottom < 0.98
      ? { id: "feet", label: "Feet visible", status: "pass", message: "Feet are visible for footwork analysis." }
      : { id: "feet", label: "Feet visible", status: "fail", message: "Move your camera back slightly. Your feet are outside the frame." },
  );
  checks.push(
    arms >= QUALITY.minArmsVisibility
      ? { id: "arms", label: "Arms visible", status: "pass", message: "Both arms are tracked." }
      : { id: "arms", label: "Arms visible", status: "warn", message: "An arm is hidden. Turn slightly so both arms are visible to the camera." },
  );
  checks.push(
    height < QUALITY.minBodyHeight
      ? { id: "distance", label: "Distance", status: "warn", message: "You're quite far away. Move closer so you fill at least a third of the frame." }
      : height > QUALITY.maxBodyHeight
        ? { id: "distance", label: "Distance", status: "warn", message: "You're very close. Step back so a full swing stays in frame." }
        : { id: "distance", label: "Distance", status: "pass", message: "Good distance from the camera." },
  );
  checks.push({ id: "lighting", label: "Lighting", ...lightingStatus(luma) });
  checks.push(
    backgroundMotion === null
      ? { id: "stable", label: "Camera stable", status: "manual", message: "Make sure the phone is propped or on a tripod." }
      : backgroundMotion > QUALITY.maxBackgroundMotion
        ? { id: "stable", label: "Camera stable", status: "warn", message: "The camera seems to be moving. Prop it against something steady." }
        : { id: "stable", label: "Camera stable", status: "pass", message: "Camera looks steady." },
  );
  const multi = avg(recent.map((f) => (f.people > 1 ? 1 : 0)));
  checks.push(
    multi > 0.3
      ? { id: "single_person", label: "One player", status: "warn", message: "More than one person is visible. Tracking may switch between people." }
      : { id: "single_person", label: "One player", status: "pass", message: "Only one player in view." },
  );
  checks.push(
    overall >= QUALITY.minOverallVisibility
      ? { id: "confidence", label: "Tracking confidence", status: "pass", message: `Tracking confidence ${Math.round(overall * 100)}%.` }
      : { id: "confidence", label: "Tracking confidence", status: "warn", message: `Tracking confidence is low (${Math.round(overall * 100)}%). Improve lighting or contrast with the background.` },
  );
  checks.push(manualSpace());
  return checks;
}

function lightingStatus(luma: number | null): Pick<SetupCheck, "status" | "message"> {
  if (luma === null) return { status: "pending", message: "Measuring light…" };
  if (luma < QUALITY.minLuma * 0.6) return { status: "fail", message: "Lighting is too low for reliable tracking." };
  if (luma < QUALITY.minLuma) return { status: "warn", message: "It's a bit dark. More light will improve tracking." };
  if (luma > 235) return { status: "warn", message: "The image is very bright. Avoid facing directly into the sun." };
  return { status: "pass", message: "Lighting looks good." };
}

function manualSpace(): SetupCheck {
  return { id: "space", label: "Room to swing", status: "manual", message: "Check you have space for a full swing — nothing within racket reach." };
}

/** Overall readiness: ready when no check fails and at most one warns. */
export function readiness(checks: SetupCheck[]): { ready: boolean; headline: string } {
  const fail = checks.find((c) => c.status === "fail");
  if (fail) return { ready: false, headline: fail.message };
  const warns = checks.filter((c) => c.status === "warn");
  if (warns.length > 1) return { ready: false, headline: warns[0].message };
  if (warns.length === 1) return { ready: true, headline: `Almost there — ${warns[0].message.charAt(0).toLowerCase()}${warns[0].message.slice(1)}` };
  return { ready: true, headline: "You're ready to begin." };
}

/** Lightweight live tracking-quality summary for the HUD (0..1 + label). */
export function trackingQuality(recent: FeatureFrame[]): { score: number; label: "good" | "fair" | "poor" | "none" } {
  if (!recent.length) return { score: 0, label: "none" };
  const valid = recent.filter((f) => f.valid);
  if (!valid.length) return { score: 0, label: "none" };
  const score = (valid.length / recent.length) * avg(valid.map((f) => f.vis.overall));
  return { score, label: score > 0.75 ? "good" : score > 0.5 ? "fair" : "poor" };
}
