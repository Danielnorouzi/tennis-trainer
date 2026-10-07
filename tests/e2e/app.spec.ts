import { expect, test, type Page } from "@playwright/test";

// Each Playwright test gets a fresh browser context, so guest data (IndexedDB) is isolated per test —
// the same guarantee real guests get: their data never leaves their own browser profile.

async function skipOnboarding(page: Page) {
  await page.addInitScript(() => localStorage.setItem("rally.onboardingSkipped", "1"));
}

async function seed(page: Page, which: "seed-forehand" | "seed-late" | "seed-serve") {
  await page.goto("/dev/seed");
  const before = await page.getByTestId("seed-log").locator("li").count();
  await page.getByTestId(which).click();
  await expect(page.getByTestId("seed-log").locator("li")).toHaveCount(before + 1, { timeout: 30_000 });
  const text = await page.getByTestId("seed-log").locator("li").first().innerText();
  return /Created (\S+)/.exec(text)![1];
}

test("landing page presents the product and starts training", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Perfect your game.");
  await expect(page.getByText("Your personal tennis coach. Powered by AI.")).toBeVisible();
  await page.getByRole("link", { name: "See How It Works" }).click();
  await expect(page.getByRole("heading", { name: /Fast on your device/ })).toBeVisible();
});

test("new user onboarding saves a profile and lands on the dashboard", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/onboarding/);
  await page.getByLabel("Your first name (optional)").fill("Alex");
  await page.getByRole("button", { name: "Advanced" }).click();
  for (let i = 0; i < 3; i++) await page.getByRole("button", { name: /Continue/ }).click();
  await page.getByRole("button", { name: /Start training/ }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Alex");
  await page.goto("/profile");
  await expect(page.getByRole("radio", { name: "Advanced" })).toHaveAttribute("aria-checked", "true");
});

test("onboarding can be skipped", async ({ page }) => {
  await page.goto("/onboarding");
  await page.getByRole("button", { name: "Skip for now" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByText("Ready to improve your game?")).toBeVisible();
});

test("live camera permission flow reaches the setup assistant", async ({ page, context }) => {
  await context.grantPermissions(["camera"]);
  await skipOnboarding(page);
  await page.goto("/coach/live");
  await expect(page.getByRole("heading", { name: "What are we practising?" })).toBeVisible();
  await page.getByRole("button", { name: /Serve/ }).first().click();
  await page.getByRole("button", { name: "Set up camera" }).click();
  // The fake camera shows a test pattern (no person), so the assistant must say so — never "ready".
  await expect(page.getByText(/No person detected|Starting camera/).first()).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText(/No person detected/).first()).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText("Room to swing")).toBeVisible();
  await expect(page.getByRole("button", { name: /Start anyway/ })).toBeVisible();
});

test("camera denial is handled gracefully", async ({ browser }) => {
  // A context launched without the fake-UI flag and without permission → getUserMedia rejects.
  const context = await browser.newContext({ permissions: [] });
  const page = await context.newPage();
  await page.addInitScript(() => {
    localStorage.setItem("rally.onboardingSkipped", "1");
    navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException("denied", "NotAllowedError"));
  });
  await page.goto("/coach/live");
  await page.getByRole("button", { name: "Set up camera" }).click();
  await expect(page.getByText("Camera unavailable")).toBeVisible();
  await expect(page.getByText(/Camera access was blocked/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Upload a video instead" })).toBeVisible();
  await context.close();
});

test("a recorded session produces an evidence-based report with labelled test-mode AI", async ({ page }) => {
  await skipOnboarding(page);
  const id = await seed(page, "seed-late");
  await page.goto(`/sessions/${id}`);
  await expect(page.getByRole("heading", { name: /\[Synthetic\]/ })).toBeVisible();
  await expect(page.getByText("Top three improvements")).toBeVisible();
  await expect(page.getByText("What Rally AI measured")).toBeVisible();
  await expect(page.getByText("Upper-body turn happens late").first()).toBeVisible();
  await expect(page.getByText("Coaching heuristics from on-device checks — not validated ratings.")).toBeVisible();
  // fixture AI output must be visibly labelled
  await expect(page.getByText("Test mode — fixture data").first()).toBeVisible({ timeout: 30_000 });
  // annotations link to timestamps
  await page.locator("button[aria-expanded]", { hasText: "Upper-body turn happens late" }).first().click();
  await expect(page.getByText("Evidence").first()).toBeVisible();
  // timeline markers jump to the annotated moment
  await expect(page.getByRole("button", { name: /Jump to .*Upper-body turn happens late/ }).first()).toBeVisible();
  // stroke correction: mark one detection as not a stroke and restore it
  await page.getByRole("button", { name: "Mark stroke 1 as not a stroke" }).click();
  await expect(page.getByRole("button", { name: "Restore stroke 1" })).toBeVisible();
  await page.getByRole("button", { name: "Restore stroke 1" }).click();
});

test("progress dashboard charts comparable sessions", async ({ page }) => {
  await skipOnboarding(page);
  await seed(page, "seed-late");
  await seed(page, "seed-forehand");
  await page.goto("/progress");
  await expect(page.getByText("Technique trends")).toBeVisible();
  await expect(page.getByText("Turn completed by end of backswing").first()).toBeVisible();
  await expect(page.getByText(/moving in a positive direction/).first()).toBeVisible();
});

test("compare tool lines up two strokes and flags non-comparable measurements", async ({ page }) => {
  await skipOnboarding(page);
  await seed(page, "seed-late");
  await seed(page, "seed-forehand");
  await page.goto("/compare");
  await expect(page.getByText("Measurements side by side")).toBeVisible();
  await expect(page.getByText("Not comparable").first()).toBeVisible();
  await page.getByRole("button", { name: "Compare with AI" }).click();
  await expect(page.getByText("Test mode — fixture data")).toBeVisible();
});

test("coach chat answers from the player's own sessions", async ({ page }) => {
  await skipOnboarding(page);
  await seed(page, "seed-forehand");
  await page.goto("/assistant");
  await page.getByRole("button", { name: "Why is my forehand inconsistent?" }).click();
  await expect(page.getByText(/Test mode — fixture output/)).toBeVisible();
  // the reference chip links to the session
  await expect(page.getByRole("link", { name: /\[Synthetic\] Forehand/ })).toBeVisible();
});

test("video upload validates files and analyses a recorded clip on-device", async ({ page }) => {
  await skipOnboarding(page);
  await page.goto("/analyze");
  await page.getByLabel("Choose a video file").setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hello") });
  await expect(page.getByText(/Unsupported file type/)).toBeVisible();

  // Generate a short WebM clip in the browser (moving shapes, no person).
  const b64 = await page.evaluate(async () => {
    const c = document.createElement("canvas");
    c.width = 320;
    c.height = 240;
    const ctx = c.getContext("2d")!;
    const rec = new MediaRecorder(c.captureStream(15), { mimeType: "video/webm" });
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => chunks.push(e.data);
    rec.start(200);
    for (let i = 0; i < 30; i++) {
      ctx.fillStyle = "#123";
      ctx.fillRect(0, 0, 320, 240);
      ctx.fillStyle = "#4c7";
      ctx.fillRect(10 + i * 8, 100, 40, 40);
      await new Promise((r) => setTimeout(r, 66));
    }
    await new Promise<void>((r) => {
      rec.onstop = () => r();
      rec.stop();
    });
    const buf = await new Blob(chunks, { type: "video/webm" }).arrayBuffer();
    let s = "";
    new Uint8Array(buf).forEach((b) => (s += String.fromCharCode(b)));
    return btoa(s);
  });
  await page.getByLabel("Choose a video file").setInputFiles({ name: "clip.webm", mimeType: "video/webm", buffer: Buffer.from(b64, "base64") });
  await expect(page.getByText("clip.webm")).toBeVisible();
  await page.getByRole("button", { name: "Analyze video" }).click();
  await expect(page).toHaveURL(/\/analyze\/sess_/, { timeout: 90_000 });
  await expect(page.getByText("No strokes detected").first()).toBeVisible();
});

test("privacy settings persist and data can be exported", async ({ page }) => {
  await skipOnboarding(page);
  await page.goto("/settings");
  await page.getByRole("radio", { name: "Never record" }).click();
  await page.getByRole("switch", { name: "Share sampled key frames with the AI coach" }).click();
  await page.reload();
  await expect(page.getByRole("radio", { name: "Never record" })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByRole("switch", { name: "Share sampled key frames with the AI coach" })).toHaveAttribute("aria-checked", "false");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export all data (JSON)" }).click();
  expect((await download).suggestedFilename()).toMatch(/rally-ai-export-.*\.json/);
});

test("AI status endpoint never exposes secrets", async ({ request }) => {
  const res = await request.get("/api/ai/status");
  expect(res.ok()).toBeTruthy();
  const text = await res.text();
  expect(text).not.toMatch(/sk-|service_role|OPENAI_API_KEY/);
});

test("AI routes reject malformed requests", async ({ request }) => {
  const res = await request.post("/api/ai/report", { data: { nope: true } });
  expect(res.status()).toBe(400);
});
