import { expect, test } from "@playwright/test";

test("mobile layout uses the bottom tab bar and fits the screen", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("rally.onboardingSkipped", "1"));
  await page.goto("/dashboard");
  const nav = page.getByRole("navigation", { name: "Primary" }).last();
  await expect(nav).toBeVisible();
  for (const label of ["Home", "Live Coach", "Analyze", "Progress", "Profile"]) {
    await expect(nav.getByRole("link", { name: label })).toBeVisible();
  }
  // no horizontal overflow
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  // touch targets are at least 44px tall
  const box = await nav.getByRole("link", { name: "Progress" }).boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(44);
  await nav.getByRole("link", { name: "Progress" }).click();
  await expect(page).toHaveURL(/\/progress/);
});
