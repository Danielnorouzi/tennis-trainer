# Manual device testing checklist

Automated tests cover the analysis algorithms (synthetic pose traces), AI request/response
validation, failure handling, and the main UI flows (Playwright with Chromium's fake camera). They
**cannot** verify real-world tracking quality on real players and real cameras. Run this checklist on
physical devices before a release and record the results (device, browser, date, pass/fail, notes).

> Status at time of writing: **not yet performed on physical devices.** The camera flow was verified
> only with Chromium's fake camera device (test pattern), and the analysis pipeline only with
> synthetic stick-figure traces.

## Devices / browsers

- [ ] iPhone (iOS 18+), Safari — portrait and landscape
- [ ] iPhone, installed as a home-screen PWA
- [ ] iPad, Safari
- [ ] Android phone, Chrome
- [ ] macOS, Safari
- [ ] Windows/macOS, Chrome and Edge (built-in webcam and USB webcam)

## Permissions

- [ ] First visit to Live Coach asks for **camera only** (no microphone prompt)
- [ ] Denying the camera shows "Camera unavailable" with retry and "Upload a video instead"
- [ ] Turning on voice commands asks for the **microphone** separately
- [ ] Denying the microphone keeps the session running; a toast explains voice commands are off
- [ ] Revoking camera permission mid-session is handled without a crash

## Camera setup assistant

- [ ] Standing out of frame → "No person detected"
- [ ] Feet cut off → "Move your camera back slightly. Your feet are outside the frame."
- [ ] Dark room → lighting warning
- [ ] Handheld, moving phone → "camera seems to be moving"
- [ ] Second person walks through → "More than one person is visible"
- [ ] Good setup → "You're ready to begin."
- [ ] Front/rear camera switch works; front camera preview is mirrored by default

## Live session

- [ ] Countdown is audible and visible; recording indicator appears
- [ ] Skeleton tracks the body smoothly; preview stays smooth (no stutter while swinging)
- [ ] Stroke counter increases once per swing (shadow swings and real balls)
- [ ] Cues appear only between strokes, never more than one at a time, no rapid repeats
- [ ] Quiet mode: no speech; Training mode: short spoken cues
- [ ] Pause/resume works; switching apps on iOS pauses the session and resume works on return
- [ ] Drill mode: rep counter, manual +/- correction, "Set complete" announcement
- [ ] Focus mode: only cues for the chosen area
- [ ] Stop → "Analysing your session" → report opens; recording plays back

## Video upload

- [ ] iPhone photo library selection works
- [ ] MP4 (H.264), MOV, WebM accepted; a .txt is rejected with a clear message
- [ ] HEVC .mov on Chrome/Windows shows the "can't decode" message
- [ ] Progress bar advances; Cancel stops processing
- [ ] "Video is mirrored" option on a selfie clip identifies the hitting arm correctly

## Accuracy spot checks (with a coach or careful self-review)

- [ ] Phase markers (preparation, loading, contact ≈, follow-through) land on sensible frames for
      forehand, backhand, serve, at slow motion
- [ ] Classification in Automatic mode is right for clear forehands/backhands/serves; wrong labels
      can be corrected and findings update
- [ ] Knee-bend finding matches what you see from a side view; is reported as low confidence from a
      front view
- [ ] Late-preparation finding appears when you deliberately turn late and disappears when you turn early
- [ ] No finding is shown when the relevant body part is hidden

## AI

- [ ] With `OPENAI_API_KEY` set: report appears within ~1 minute; observations cite timestamps that
      jump to the right moment
- [ ] With frame sharing off in Settings, the report still works (measurements only)
- [ ] With an invalid key: "AI coaching unavailable" — on-device report still complete
- [ ] Chat references link to the right session/time; asking about something never recorded yields
      an honest "not enough data" answer
- [ ] Voice coach (if enabled): connects, answers briefly, disconnects cleanly

## Privacy & data

- [ ] "Never record" → no video saved; pose replay still available
- [ ] "Delete after AI report" → video removed after the report arrives
- [ ] Export JSON downloads; Delete all data clears everything
- [ ] Signed-in: second account cannot see the first account's sessions or recordings
- [ ] Account deletion removes rows and storage objects

## Accessibility

- [ ] VoiceOver / TalkBack can operate onboarding, Live Coach controls, the report and settings
- [ ] Keyboard-only navigation with visible focus on desktop
- [ ] Reduced motion: animations minimised; Reduce transparency: solid surfaces
- [ ] Light and dark mode legible everywhere, including over the camera feed
