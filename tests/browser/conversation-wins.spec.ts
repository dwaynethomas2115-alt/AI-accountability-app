import { expect, test, type Page } from "@playwright/test";

test.use({ timezoneId: "UTC" });
async function enterGarden(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Explore the local demo" }).click();
  await page
    .getByLabel("Your goals", { exact: true })
    .fill("Walk outside\nRead ten minutes");
  await page.getByRole("button", { name: "That sounds good" }).click();
}
async function talkByText(page: Page, message: string) {
  await page.getByRole("button", { name: "Type instead", exact: true }).click();
  await page.getByLabel("Message Kindred").fill(message);
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Record a small win", exact: true }),
  ).toBeVisible();
}
const completions = (page: Page) =>
  page.evaluate(
    () =>
      JSON.parse(localStorage.getItem("kindred-demo") || "{}").completions ||
      [],
  );

test("chat only grows a goal after explicit confirmation, then returns to the garden", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await enterGarden(page);
  await talkByText(page, "I went for my walk today.");
  expect(await completions(page)).toHaveLength(0);
  await page
    .getByRole("button", { name: "Record a small win", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "A small win to bring back?",
      exact: true,
    }),
  ).toBeVisible();
  expect(await completions(page)).toHaveLength(0);
  await page
    .getByRole("button", { name: "Record Walk outside for today", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Today’s progress", exact: true }),
  ).toContainText(/1\s*\/\s*2/);
  await expect.poll(async () => (await completions(page)).length).toBe(1);
  await talkByText(page, "I mentioned my walk already.");
  await page
    .getByRole("button", { name: "Record a small win", exact: true })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Walk outside already recorded today",
      exact: true,
    }),
  ).toBeDisabled();
  expect(await completions(page)).toHaveLength(1);
  expect(errors).toEqual([]);
});

test("a reflection can be dismissed without awarding progress", async ({
  page,
}) => {
  await enterGarden(page);
  await talkByText(page, "Today was difficult and I did not get to my goals.");
  await page
    .getByRole("button", { name: "Record a small win", exact: true })
    .click();
  await page
    .getByRole("button", {
      name: "Not today — keep my garden as it is",
      exact: true,
    })
    .click();
  expect(await completions(page)).toHaveLength(0);
  await page
    .getByRole("button", { name: "Back to talking", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Today’s progress", exact: true }),
  ).toContainText(/0\s*\/\s*2/);
});
