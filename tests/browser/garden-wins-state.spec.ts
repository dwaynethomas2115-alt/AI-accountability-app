import { expect, test, type Page } from "@playwright/test";

test.use({ timezoneId: "UTC" });
const userId = "7dd69d36-0c56-4dd8-9f65-7dc5cc302251";
const goalId = "5147fcab-e670-4c15-aef8-6fe33307fa87";
const completionId = "32e16d61-4bc2-4b54-bd20-534e6d7fa5e3";
type CompletionRow = {
  id: string;
  user_id: string;
  goal_id: string;
  local_date: string;
};

async function installAccount(
  page: Page,
  outcome: "insert" | "duplicate" | "failure",
) {
  const encode = (value: object) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  const token = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: userId, role: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600 })}.test-signature`;
  const user = {
    id: userId,
    aud: "authenticated",
    role: "authenticated",
    email: "garden-win@example.com",
    app_metadata: {},
    user_metadata: {},
    created_at: "2020-01-01T00:00:00Z",
  };
  let rows: CompletionRow[] = [];
  let messageCount = 0;
  const requests: { method: string; body: Record<string, unknown> }[] = [];
  await page.route("**/*.supabase.co/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === "/auth/v1/token")
      return route.fulfill({
        json: {
          access_token: token,
          refresh_token: "test-refresh",
          expires_in: 3600,
          token_type: "bearer",
          user,
        },
      });
    if (url.pathname === "/auth/v1/user") return route.fulfill({ json: user });
    expect(request.headers().authorization).toBe(`Bearer ${token}`);
    if (url.pathname === "/functions/v1/chat") {
      messageCount++;
      return route.fulfill({ json: { ok: true } });
    }
    if (!url.pathname.startsWith("/rest/v1/"))
      throw new Error(`Unexpected request ${url.pathname}`);
    const table = url.pathname.split("/").at(-1);
    if (table === "completions" && request.method() !== "GET") {
      const body = request.postDataJSON();
      requests.push({ method: request.method(), body });
      expect(request.method()).toBe("POST");
      expect(url.searchParams.get("on_conflict")).toBe("goal_id,local_date");
      expect(request.headers().prefer).toContain(
        "resolution=ignore-duplicates",
      );
      expect(request.headers().prefer).toContain("return=representation");
      expect(body).toMatchObject({
        user_id: userId,
        goal_id: goalId,
        local_date: new Date().toISOString().slice(0, 10),
      });
      if (outcome === "failure")
        return route.fulfill({
          status: 500,
          json: { message: "Could not save this step", code: "XX000" },
        });
      const row = {
        id: completionId,
        user_id: userId,
        goal_id: goalId,
        local_date: String(body.local_date),
      };
      rows = [row];
      return route.fulfill({ json: outcome === "duplicate" ? [] : [row] });
    }
    if (table === "completions")
      return route.fulfill({
        json: rows,
        headers: {
          "content-range": rows.length ? "0-0/1" : "*/0",
          "access-control-expose-headers": "content-range",
        },
      });
    const data =
      table === "profiles"
        ? [
            {
              user_id: userId,
              display_name: "Sam",
              timezone: "UTC",
              onboarded: true,
              checkin_time: "18:00",
              checkin_days: [0, 1, 2, 3, 4, 5, 6],
              quiet_start: "21:00",
              quiet_end: "08:00",
              daily_limit: 2,
              checkins_enabled: false,
            },
          ]
        : table === "goals"
          ? [
              {
                id: goalId,
                user_id: userId,
                title: "Walk outside",
                status: "active",
                schedule: { kind: "daily", days: [] },
                steps: [],
                created_at: "2020-01-01T00:00:00Z",
              },
            ]
          : table === "messages"
            ? Array.from({ length: messageCount }, (_, i) => ({
                id: `reply-${i}`,
                user_id: userId,
                role: "assistant",
                content:
                  "A little time outside sounds good. What felt helpful?",
                proposal: null,
                created_at: new Date(Date.now() + i).toISOString(),
              }))
            : [];
    return route.fulfill({ json: data });
  });
  await page.goto("/");
  await page
    .getByLabel("Email", { exact: true })
    .fill("garden-win@example.com");
  await page.getByLabel("Password", { exact: true }).fill("test-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Today’s progress", exact: true }),
  ).toContainText(/0\s*\/\s*1/);
  return { requests, rows: () => rows };
}
async function reviewWin(page: Page) {
  await page.getByRole("button", { name: "Type instead", exact: true }).click();
  await page.getByLabel("Message Kindred").fill("I took my walk today.");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await page
    .getByRole("button", { name: "Record a small win", exact: true })
    .click();
}

test("an explicitly recorded chat accomplishment inserts once and cannot be toggled away by another confirmation", async ({
  page,
}) => {
  const state = await installAccount(page, "insert");
  await reviewWin(page);
  expect(state.requests).toHaveLength(0);
  await page
    .getByRole("button", { name: "Record Walk outside for today", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Today’s progress", exact: true }),
  ).toContainText(/1\s*\/\s*1/);
  await expect(
    page.getByText("Walk outside grew a little.", { exact: true }),
  ).toBeVisible();
  expect(state.requests).toHaveLength(1);
  expect(state.rows()).toHaveLength(1);
  await page.getByRole("button", { name: "Keep growing", exact: true }).click();
  await reviewWin(page);
  await expect(
    page.getByRole("button", {
      name: "Walk outside already recorded today",
      exact: true,
    }),
  ).toBeDisabled();
  expect(state.requests).toHaveLength(1);
  expect(state.rows()).toHaveLength(1);
});

test("a completion already saved on another device refreshes progress without creating a new celebration", async ({
  page,
}) => {
  const state = await installAccount(page, "duplicate");
  await reviewWin(page);
  await page
    .getByRole("button", { name: "Record Walk outside for today", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Today’s progress", exact: true }),
  ).toContainText(/1\s*\/\s*1/);
  await expect(
    page.getByText("Walk outside grew a little.", { exact: true }),
  ).toHaveCount(0);
  expect(state.requests).toHaveLength(1);
  expect(state.rows()).toHaveLength(1);
});

test("a failed completion does not change the garden or claim a saved win", async ({
  page,
}) => {
  const state = await installAccount(page, "failure");
  await reviewWin(page);
  await page
    .getByRole("button", { name: "Record Walk outside for today", exact: true })
    .click();
  await expect(
    page.getByText("Could not save this step", { exact: true }).last(),
  ).toBeVisible();
  await expect(
    page.getByText("Walk outside grew a little.", { exact: true }),
  ).toHaveCount(0);
  expect(state.rows()).toHaveLength(0);
  await page
    .getByRole("button", { name: "Rather talk? Switch to voice", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Today’s progress", exact: true }),
  ).toContainText(/0\s*\/\s*1/);
});
