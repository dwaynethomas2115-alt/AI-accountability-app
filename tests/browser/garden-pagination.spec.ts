import { expect, test } from "@playwright/test";

const userId = "8d994ce2-935d-42df-aed4-d793f66ab77c";
const olderGoal = "00000000-0000-4000-8000-000000000001";
const newerGoal = "00000000-0000-4000-8000-000000000002";

for (const serverCap of [1000, 333]) {
  test(`lifetime garden keeps early goal growth beyond the ${serverCap}-row REST cap`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const encode = (value: object) =>
      Buffer.from(JSON.stringify(value)).toString("base64url");
    const token = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: userId, role: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600 })}.test-signature`;
    const user = {
      id: userId,
      aud: "authenticated",
      role: "authenticated",
      email: "garden-test@example.com",
      app_metadata: {},
      user_metadata: {},
      created_at: "2020-01-01T00:00:00Z",
    };
    const profile = {
      user_id: userId,
      display_name: "Sam",
      onboarded: true,
      timezone: "UTC",
      checkins_enabled: false,
      checkin_time: "18:00",
      checkin_days: [0, 1, 2, 3, 4, 5, 6],
      quiet_start: "21:00",
      quiet_end: "08:00",
      daily_limit: 2,
    };
    const goals = [
      { id: olderGoal, title: "My first goal" },
      { id: newerGoal, title: "My newer goal" },
    ].map((goal) => ({
      ...goal,
      user_id: userId,
      steps: [],
      status: "active",
      schedule: { kind: "daily", days: [] },
      created_at: "2020-01-01T00:00:00Z",
    }));
    // The older goal's 14 completions lie beyond the first page. They are also
    // chronologically older than the other 1,086 records, so the previous single
    // latest-1,000 query would erase this goal's earned growth from the display.
    const completions = Array.from({ length: 1100 }, (_, index) => {
      const older = index >= 1086;
      const date = new Date(
        Date.UTC(older ? 2020 : 2021, 0, 1 + (older ? index - 1086 : index)),
      );
      return {
        id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
        user_id: userId,
        goal_id: older ? olderGoal : newerGoal,
        local_date: date.toISOString().slice(0, 10),
        created_at: date.toISOString(),
      };
    });
    const pageRequests: { after: string | null; ids: string[] }[] = [];
    await page.route("**/*.supabase.co/**", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.pathname === "/auth/v1/token")
        return route.fulfill({
          json: {
            access_token: token,
            refresh_token: "garden-test-refresh",
            token_type: "bearer",
            expires_in: 3600,
            user,
          },
        });
      if (url.pathname === "/auth/v1/user")
        return route.fulfill({ json: user });
      if (!url.pathname.startsWith("/rest/v1/"))
        throw new Error(`Unexpected request: ${url.pathname}`);
      expect(request.headers().authorization).toBe(`Bearer ${token}`);
      expect(url.searchParams.get("user_id")).toBe(`eq.${userId}`);
      const table = url.pathname.split("/").at(-1);
      if (table === "completions") {
        const after = url.searchParams.get("id")?.replace(/^gt\./, "") ?? null;
        const order = url.searchParams.get("order");
        const remaining = completions
          .filter((row) => !after || row.id > after)
          .sort((a, b) =>
            order === "id.asc"
              ? a.id.localeCompare(b.id)
              : b.created_at.localeCompare(a.created_at),
          );
        const rows = remaining.slice(
          0,
          Math.min(
            serverCap,
            Number(url.searchParams.get("limit") || serverCap),
          ),
        );
        pageRequests.push({ after, ids: rows.map((row) => row.id) });
        return route.fulfill({
          status: 200,
          json: rows,
          headers: {
            "content-range": `0-${rows.length - 1}/${remaining.length}`,
            "access-control-expose-headers": "content-range",
          },
        });
      }
      return route.fulfill({
        json: table === "profiles" ? [profile] : table === "goals" ? goals : [],
      });
    });
    await page.goto("/");
    await page
      .getByLabel("Email", { exact: true })
      .fill("garden-test@example.com");
    await page.getByLabel("Password", { exact: true }).fill("test-password");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(
      page.getByRole("img", {
        name: /Your floating garden\. .*My first goal: fully grown plant/,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Today’s progress", exact: true }),
    ).toContainText(/0\s*\/\s*2/);
    await page
      .getByRole("button", { name: "Today’s progress", exact: true })
      .click();
    await expect(page.getByText(/14 completed days/)).toBeVisible();
    expect(pageRequests.length).toBe(Math.ceil(1100 / serverCap));
    expect(pageRequests[0]!.after).toBeNull();
    for (let i = 1; i < pageRequests.length; i++)
      expect(pageRequests[i]!.after).toBe(pageRequests[i - 1]!.ids.at(-1));
    expect(new Set(pageRequests.flatMap((request) => request.ids)).size).toBe(
      1100,
    );
    expect(errors).toEqual([]);
  });
}
