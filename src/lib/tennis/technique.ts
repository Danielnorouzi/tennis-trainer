// Technique library: concise, style-neutral guides. Each guide lists the visible movements the
// app can actually observe ("what the camera can see") separately from things it cannot.

export interface TechniqueGuide {
  id: string;
  title: string;
  summary: string;
  phases: { name: string; points: string[] }[];
  visible: string[];
  notVisible: string[];
  validVariations: string[];
  drillIds: string[];
}

export const TECHNIQUE: TechniqueGuide[] = [
  {
    id: "forehand",
    title: "Forehand",
    summary: "A rotational stroke: the legs and trunk turn the body, the arm follows. Modern forehands vary a lot — what matters is early preparation, balance and a repeatable rhythm.",
    phases: [
      { name: "Preparation", points: ["Unit turn: shoulders and hips turn together as soon as you read the ball", "Non-hitting hand helps the turn and tracks the ball"] },
      { name: "Loading", points: ["Weight sinks into the outside leg", "Racket set before the forward swing"] },
      { name: "Forward swing", points: ["Hips start rotating, shoulders follow, the arm comes last", "Contact in front of the body with comfortable spacing"] },
      { name: "Finish & recovery", points: ["Racket finishes across the body", "Balanced finish, then recover toward the middle"] },
    ],
    visible: ["Timing of the shoulder turn (estimated)", "Knee bend (best from the side)", "Balance at the finish", "Follow-through path", "Recovery time"],
    notVisible: ["Grip (unless the hand is clearly visible)", "Racket-face angle", "Ball spin or speed", "Exact contact point"],
    validVariations: ["Open, semi-open or neutral stance", "Straight-arm or bent-arm contact", "Windshield-wiper or over-the-shoulder finish"],
    drillIds: ["early-unit-turn", "rotate-then-accelerate", "balanced-finish-hold", "spacing-drop-feed"],
  },
  {
    id: "two-handed-backhand",
    title: "Two-handed backhand",
    summary: "The non-dominant arm drives much of the swing. A full shoulder turn and stable base make it one of the most reliable strokes.",
    phases: [
      { name: "Preparation", points: ["Turn with both hands on the racket", "Chin near the leading shoulder"] },
      { name: "Forward swing", points: ["Hips then shoulders rotate", "Non-dominant hand pushes through contact"] },
      { name: "Finish", points: ["High finish over the hitting-side shoulder", "Hold your balance"] },
    ],
    visible: ["Shoulder turn timing (estimated)", "Knee bend", "Finish position", "Balance"],
    notVisible: ["Grip details", "Racket-face angle", "Ball depth or spin"],
    validVariations: ["Closed or open stance", "Straight or bent arms at contact"],
    drillIds: ["two-hand-backhand-turn", "loaded-legs", "balanced-finish-hold"],
  },
  {
    id: "one-handed-backhand",
    title: "One-handed backhand",
    summary: "Relies on staying sideways through contact with an extended hitting arm and a counter-balancing back arm.",
    phases: [
      { name: "Preparation", points: ["Non-hitting hand supports the throat during the turn", "Shoulders turn well past side-on"] },
      { name: "Forward swing", points: ["Chest stays sideways through contact", "Hitting arm extends"] },
      { name: "Finish", points: ["Arms open like wings", "Balanced, upright posture"] },
    ],
    visible: ["Shoulder turn (estimated)", "Arm extension near the estimated contact", "Finish balance"],
    notVisible: ["Grip", "Racket-face angle"],
    validVariations: ["Topspin drive or slice", "Varying amounts of shoulder turn"],
    drillIds: ["one-hand-backhand-extension", "early-unit-turn"],
  },
  {
    id: "serve",
    title: "Serve",
    summary: "A chain from the legs to the racket: a consistent toss, a stable loading (trophy) position, an upward drive and a balanced landing.",
    phases: [
      { name: "Start & toss", points: ["Relaxed stance", "Tossing arm lifts straight up and stays up"] },
      { name: "Loading (trophy)", points: ["Knees bend", "Hitting elbow around shoulder height"] },
      { name: "Drive & contact", points: ["Legs push up", "Reach up to a high contact with a long arm"] },
      { name: "Landing", points: ["Land balanced inside the court", "Recover for the next ball"] },
    ],
    visible: ["Tossing-arm height and timing", "Knee bend before the drive", "Elbow height at loading", "Reach near the estimated contact", "Landing balance"],
    notVisible: ["Ball toss position (unless the ball is clearly tracked)", "Pronation / internal shoulder rotation", "Serve speed or spin"],
    validVariations: ["Platform or pinpoint stance", "Different trophy timings"],
    drillIds: ["serve-trophy-hold", "toss-consistency", "toss-arm-hold", "serve-leg-drive", "reach-up-contact", "landing-balance"],
  },
  {
    id: "volley",
    title: "Volley",
    summary: "Compact: racket in front, short backswing, step forward with the opposite foot, firm contact.",
    phases: [
      { name: "Ready", points: ["Racket in front at chest height", "Split step as the opponent hits"] },
      { name: "Contact", points: ["Short turn, minimal backswing", "Step in with the opposite foot"] },
      { name: "Recover", points: ["Racket back in front immediately"] },
    ],
    visible: ["Backswing length (wrist travel)", "Balance", "Recovery to ready"],
    notVisible: ["Racket-face angle", "Ball contact"],
    validVariations: ["Punch or drive volley", "Continental grip (not verified by the camera)"],
    drillIds: ["volley-short-backswing", "split-step-timing"],
  },
  {
    id: "footwork",
    title: "Footwork & recovery",
    summary: "Most shots are won or lost before the swing: a timely split step, efficient movement to the ball and quick recovery.",
    phases: [
      { name: "Split step", points: ["Small hop as the opponent makes contact", "Land balanced on the balls of the feet"] },
      { name: "Movement", points: ["Explosive first step", "Small adjustment steps before the shot"] },
      { name: "Recovery", points: ["Shuffle back toward the middle", "Split again for the next ball"] },
    ],
    visible: ["Split-step-like hops (approximate)", "Lateral movement bursts (front/rear view)", "Ready-position stance width", "Recovery time"],
    notVisible: ["Court position (no court calibration)", "Distance covered in metres"],
    validVariations: ["Crossover vs shuffle recovery depending on distance"],
    drillIds: ["split-step-timing", "recovery-shuffle", "lateral-ladder", "ready-position-reset"],
  },
];
