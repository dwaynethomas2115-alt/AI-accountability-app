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

async function artworkFitsForest(page: Page) {
  const forest = page.getByRole("img", { name: /^Your growing forest\./ });
  await expect
    .poll(() =>
      forest.evaluate((root) => {
        const frame = root.getBoundingClientRect();
        const images = [...root.querySelectorAll("img")];
        // Trees and foreground leaves intentionally extend into cropped edges.
        // The scene itself must fit the screen and every displayed asset must load.
        return (
          frame.width > 0 &&
          frame.height > 0 &&
          frame.left >= -1 &&
          frame.right <= window.innerWidth + 1 &&
          images.length > 0 &&
          images.every(
            (image) =>
              image.complete &&
              image.naturalWidth > 0 &&
              image.getBoundingClientRect().width > 0,
          )
        );
      }),
    )
    .toBe(true);
}

// The preview must never create completions or otherwise rewrite the user's plan.
test("a new garden starts empty and every preview stage leaves saved progress untouched", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await makePlan(page);
  await expect(ring(page)).toContainText(/0\s*\/\s*2/);
  await artworkFitsForest(page);
  const original = await snapshot(page);
  expect(original.completions).toEqual([]);
  await expect(
    page.getByRole("img", { name: /Your growing forest\. Just grass/ }),
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
        name: new RegExp(`Your growing forest\\. .*${stage}`),
      }),
    ).toBeVisible();
    await artworkFitsForest(page);
    expect(await snapshot(page)).toEqual(original);
  }
  await page
    .getByRole("button", { name: "Preview one more day", exact: true })
    .click();
  await expect(
    page.getByText("Preview: 15 completed days. Each new day adds growth.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("img", {
      name: /Movement: fully grown plant, 15 completed days/,
    }),
  ).toBeVisible();
  expect(await snapshot(page)).toEqual(original);
  await page
    .getByRole("button", { name: "First sprouts", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Preview one more day", exact: true })
    .click();
  await expect(
    page.getByRole("img", { name: /Movement: sprout, 2 completed days/ }),
  ).toBeVisible();
  expect(await snapshot(page)).toEqual(original);
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
  await expect(
    page.getByText("Walk outside grew a little.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("img", { name: /Walk outside: sprout, 1 completed day/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Your garden", exact: true }),
  ).toBeHidden();
  await expect(ring(page)).toContainText(/1\s*\/\s*2/);
  await page.getByRole("button", { name: "Keep growing", exact: true }).click();
  await expect(
    page.getByText("Walk outside grew a little.", { exact: true }),
  ).toBeHidden();
  await ring(page).click();
  await expect(undo(page, "Walk outside")).toBeVisible();
  await mark(page, "Read ten minutes").click();
  await expect(
    page.getByText("Read ten minutes grew a little.", { exact: true }),
  ).toBeVisible();
  await expect(ring(page)).toContainText(/2\s*\/\s*2/);
  await expect
    .poll(async () => (await snapshot(page)).completions.length)
    .toBe(2);
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

for (const viewport of [
  { width: 390, height: 844 },
  { width: 1280, height: 900 },
]) {
  test(`the forest fills the ${viewport.width}px view while talk and text stay within reach`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await makePlan(page);
    const forest = page.getByRole("img", { name: /^Your growing forest\./ });
    await artworkFitsForest(page);
    const coverage = await forest.evaluate((element) => {
      const box = element.getBoundingClientRect();
      return (
        Math.max(
          0,
          Math.min(box.bottom, window.innerHeight) - Math.max(box.top, 0),
        ) / window.innerHeight
      );
    });
    expect(coverage).toBeGreaterThanOrEqual(0.75);
    await expect(
      page.getByRole("button", { name: "Let’s talk", exact: true }),
    ).toBeInViewport({ ratio: 1 });
    await expect(
      page.getByRole("button", { name: "Type instead", exact: true }),
    ).toBeInViewport({ ratio: 1 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  });
}

test("plant names appear only on selection and preview selections never change saved goals", async ({
  page,
}) => {
  await makePlan(page);
  const original = await snapshot(page);
  await page
    .getByRole("button", { name: "Preview garden growth", exact: true })
    .click();
  await page.getByRole("button", { name: "Full garden", exact: true }).click();
  await artworkFitsForest(page);
  for (const name of [
    "Movement",
    "Learning",
    "Rest",
    "Creativity",
    "Connection",
  ]) {
    await expect(page.getByText(name, { exact: true })).toBeHidden();
    await expect(
      page.getByRole("button", { name: `About ${name}`, exact: true }),
    ).toBeVisible();
  }
  await page
    .getByRole("button", { name: "About Movement", exact: true })
    .click();
  await expect(page.getByText("Movement", { exact: true })).toBeVisible();
  await expect(page.getByText("Learning", { exact: true })).toBeHidden();
  const label = page.getByTestId("forest-scene").getByTestId("plant-details");
  await expect(label).toContainText("14 days of care");
  const labelBounds = await label.boundingBox();
  expect(labelBounds).not.toBeNull();
  expect(labelBounds!.width).toBeLessThanOrEqual(150);
  expect(labelBounds!.height).toBeLessThanOrEqual(75);
  await expect(label).toBeInViewport({ ratio: 1 });
  await page
    .getByRole("button", { name: "About Learning", exact: true })
    .click();
  await expect(page.getByText("Movement", { exact: true })).toBeHidden();
  await expect(page.getByText("Learning", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Close plant details", exact: true })
    .click();
  await expect(page.getByText("Learning", { exact: true })).toBeHidden();
  expect(await snapshot(page)).toEqual(original);
  await page
    .getByRole("button", { name: "Back to my garden", exact: true })
    .click();
  await expect(page.getByText("Movement", { exact: true })).toBeHidden();
  await expect(
    page.getByRole("button", { name: "Close plant details", exact: true }),
  ).toBeHidden();
  expect(await snapshot(page)).toEqual(original);
});
