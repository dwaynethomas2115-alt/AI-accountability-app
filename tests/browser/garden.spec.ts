import { test, expect, type Page } from "@playwright/test";

test.use({ timezoneId: "UTC" });

async function makePlan(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Explore the local demo" }).click();
  await page
    .getByLabel("Your goals", { exact: true })
    .fill("Walk outside\nRead ten minutes");
  await page.getByRole("button", { name: "That sounds good" }).click();
  await expect(
    page.getByRole("button", { name: "Let’s talk", exact: true }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const saved = JSON.parse(localStorage.getItem("kindred-demo") || "{}");
        return saved.goals?.length;
      }),
    )
    .toBe(2);
}

const ring = (page: Page) =>
  page.getByRole("button", { name: "Today’s progress", exact: true });
const mark = (page: Page, title: string) =>
  page.getByRole("button", {
    name: `Mark ${title} complete today`,
    exact: true,
  });
const undo = (page: Page, title: string) =>
  page.getByRole("button", { name: `Undo today for ${title}`, exact: true });
const snapshot = (page: Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem("kindred-demo") || "{}"));

// The preview must never create completions or otherwise rewrite the user's plan.
test("a new garden starts empty and every preview stage leaves saved progress untouched", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await makePlan(page);
  await expect(ring(page)).toContainText(/0\s*\/\s*2/);
  const original = await snapshot(page);
  expect(original.completions).toEqual([]);
  await expect(
    page.getByRole("img", { name: /Your floating garden\. Just grass/ }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Preview garden growth", exact: true })
    .click();
  for (const [index, name] of [
    "Just grass",
    "First sprouts",
    "Growing",
    "In bloom",
    "Full garden",
  ].entries()) {
    await page.getByRole("button", { name, exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Back to my garden", exact: true }),
    ).toBeVisible();
    const stage = [
      "Just grass",
      "sprout",
      "young plant",
      "growing plant",
      "fully grown plant",
    ][index];
    await expect(
      page.getByRole("img", {
        name: new RegExp(`Your floating garden\\. .*${stage}`),
      }),
    ).toBeVisible();
    expect(await snapshot(page)).toEqual(original);
  }
  await page
    .getByRole("button", { name: "Back to my garden", exact: true })
    .click();
  await expect(ring(page)).toContainText(/0\s*\/\s*2/);
  await page.reload();
  await page.getByRole("button", { name: "Explore the local demo" }).click();
  await expect(ring(page)).toContainText(/0\s*\/\s*2/);
  expect((await snapshot(page)).completions).toEqual([]);
  expect(errors).toEqual([]);
});

test("daily goal completions grow progress, persist after reload and can be corrected", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await makePlan(page);
  await ring(page).click();
  await expect(
    page.getByRole("heading", { name: "Your garden", exact: true }),
  ).toBeVisible();
  await mark(page, "Walk outside").click();
  await expect(undo(page, "Walk outside")).toBeVisible();
  await expect(ring(page)).toContainText(/1\s*\/\s*2/);
  await mark(page, "Read ten minutes").click();
  await expect(ring(page)).toContainText(/2\s*\/\s*2/);
  await expect
    .poll(async () => (await snapshot(page)).completions.length)
    .toBe(2);
  await page
    .getByRole("button", { name: "Close garden details", exact: true })
    .click();
  await expect(
    page.getByRole("img", { name: /Walk outside: sprout/ }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Explore the local demo" }).click();
  await expect(ring(page)).toContainText(/2\s*\/\s*2/);
  await ring(page).click();
  await undo(page, "Walk outside").click();
  await expect(ring(page)).toContainText(/1\s*\/\s*2/);
  await expect(mark(page, "Walk outside")).toBeVisible();
  await expect
    .poll(async () => (await snapshot(page)).completions.length)
    .toBe(1);
  expect(errors).toEqual([]);
});

test("past efforts remain in the garden even when today's circle is empty", async ({
  page,
}) => {
  await makePlan(page);
  await page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem("kindred-demo")!);
    const base = new Date();
    // Leave yesterday empty too: growth depends on accumulated effort, not a streak.
    saved.completions = Array.from({ length: 14 }, (_, index) => {
      const date = new Date(base);
      date.setUTCDate(date.getUTCDate() - index - 2);
      return {
        id: `old-effort-${index}`,
        goal_id: saved.goals[0].id,
        local_date: date.toISOString().slice(0, 10),
      };
    });
    localStorage.setItem("kindred-demo", JSON.stringify(saved));
  });
  await page.reload();
  await page.getByRole("button", { name: "Explore the local demo" }).click();
  await expect(ring(page)).toContainText(/0\s*\/\s*2/);
  await expect(
    page.getByRole("img", { name: /Walk outside: fully grown plant/ }),
  ).toBeVisible();
  await ring(page).click();
  await expect(mark(page, "Walk outside")).toBeVisible();
  await expect(mark(page, "Read ten minutes")).toBeVisible();
  expect((await snapshot(page)).completions).toHaveLength(14);
});
