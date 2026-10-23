import { test, expect } from "@playwright/test";
test("mobile demo persists goals, confirmations, preferences and corrected memories", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.getByRole("button", { name: "Explore the local demo" }).click();
  await page.getByLabel("What should I call you?").fill("Dwayne");
  await page.getByRole("button", { name: "Let’s begin" }).click();
  await page.getByRole("button", { name: "＋ Goal" }).click();
  await page.getByLabel("Goal", { exact: true }).fill("Read ten minutes");
  await page.getByRole("button", { name: "Save goal", exact: true }).click();
  await page.getByRole("button", { name: "Mark today complete" }).click();
  await expect(page.getByText("1 of 1 planned steps today")).toBeVisible();
  await page.getByRole("tab", { name: "Chat", exact: true }).click();
  await page.getByLabel("Message Kindred").fill("Plan a walk");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(
    page.getByText("Kindred · sample reply", { exact: true }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Calendar", exact: true }).click();
  await expect(
    page.getByText("A little time outside", { exact: true }),
  ).toHaveCount(0);
  await page.getByRole("tab", { name: "Chat", exact: true }).click();
  await page.getByRole("button", { name: "Confirm & save event" }).click();
  await page.getByRole("tab", { name: "Calendar", exact: true }).click();
  await expect(
    page.getByText("A little time outside", { exact: true }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Your space", exact: true }).click();
  await page
    .getByLabel("Something you’d like remembered")
    .fill("I enjoy evening walks.");
  await page
    .getByRole("button", { name: "Remember this", exact: true })
    .click();
  await expect(
    page.getByText("I enjoy evening walks.", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Correct", exact: true }).click();
  await page.getByLabel("Correct this memory").fill("I prefer morning walks.");
  await page.getByRole("button", { name: "Save correction" }).click();
  await expect(
    page.getByText("I prefer morning walks.", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Explore the local demo" }).click();
  await expect(
    page.getByText("Read ten minutes", { exact: true }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Your space", exact: true }).click();
  await expect(
    page.getByText("I prefer morning walks.", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Forget", exact: true }).click();
  await expect(page.getByText("No saved memories yet.")).toBeVisible();
  expect(errors).toEqual([]);
});
test("desktop layout stays within viewport", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Explore the local demo" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
