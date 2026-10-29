import { expect, test, type Page } from "@playwright/test";

const userId = "b2cd6153-9d7d-47cf-b35c-7d7f30bc5b47";
const email = "reset-test@example.com";
const user = {
  id: userId,
  aud: "authenticated",
  role: "authenticated",
  email,
  app_metadata: { provider: "email" },
  user_metadata: {},
  created_at: "2026-01-01T00:00:00Z",
};
const encode = (value: object) =>
  Buffer.from(JSON.stringify(value)).toString("base64url");
const accessToken = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: userId, role: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600 })}.test-signature`;
const recoveryLink = () =>
  `/#access_token=${accessToken}&refresh_token=reset-test-refresh&expires_in=3600&token_type=bearer&type=recovery`;

type RecoveryRequest = {
  redirect: string | null;
  body: Record<string, unknown>;
};

async function backend(
  page: Page,
  options: { requestError?: "rate" | "network"; failFirstSave?: boolean } = {},
) {
  const requests = {
    recoveries: [] as RecoveryRequest[],
    saves: [] as Record<string, unknown>[],
  };
  await page.route("**/*.supabase.co/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === "/auth/v1/recover") {
      requests.recoveries.push({
        redirect: url.searchParams.get("redirect_to"),
        body: request.postDataJSON(),
      });
      if (options.requestError === "network")
        return route.abort("internetdisconnected");
      if (options.requestError === "rate")
        return route.fulfill({
          status: 429,
          headers: {
            "x-supabase-api-version": "2024-01-01",
            "access-control-expose-headers": "X-Supabase-Api-Version",
          },
          json: {
            code: "over_email_send_rate_limit",
            msg: "Email rate limit exceeded",
          },
        });
      return route.fulfill({ json: {} });
    }
    if (url.pathname === "/auth/v1/token")
      return route.fulfill({
        json: {
          access_token: accessToken,
          refresh_token: "reset-test-refresh",
          expires_in: 3600,
          token_type: "bearer",
          user,
        },
      });
    if (url.pathname === "/auth/v1/user") {
      if (request.method() === "PUT") {
        expect(request.headers().authorization).toBe(`Bearer ${accessToken}`);
        requests.saves.push(request.postDataJSON());
        if (options.failFirstSave && requests.saves.length === 1)
          return route.fulfill({
            status: 422,
            headers: {
              "x-supabase-api-version": "2024-01-01",
              "access-control-expose-headers": "X-Supabase-Api-Version",
            },
            json: {
              code: "weak_password",
              msg: "Password requires more strength",
              weak_password: { reasons: ["length"] },
            },
          });
      }
      return route.fulfill({ json: user });
    }
    if (url.pathname === "/auth/v1/logout")
      return route.fulfill({ status: 204, body: "" });
    if (url.pathname.startsWith("/rest/v1/")) {
      const table = url.pathname.split("/").at(-1);
      return route.fulfill({
        json:
          table === "profiles"
            ? [
                {
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
                },
              ]
            : [],
      });
    }
    throw new Error(`Unexpected request: ${request.method()} ${url.pathname}`);
  });
  return requests;
}

async function forgotPassword(page: Page) {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Forgot your password?", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Send reset email", exact: true }),
  ).toBeVisible();
}

const save = (page: Page) =>
  page.getByRole("button", { name: "Save new password", exact: true });

test("forgot password emails explicitly return to this app and explain the next step", async ({
  page,
}) => {
  const requests = await backend(page);
  await forgotPassword(page);
  const send = page.getByRole("button", {
    name: "Send reset email",
    exact: true,
  });
  await expect(send).toBeDisabled();
  await page.getByLabel("Email", { exact: true }).fill(email);
  await send.click();
  await expect(
    page.getByRole("heading", { name: "Check your email.", exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/If an account exists for/)).toContainText(email);
  await expect(page.getByText(/If an account exists for/)).toContainText(
    "newest link",
  );
  await expect(
    page.getByRole("button", { name: /^Try again in \d+s$/ }),
  ).toBeDisabled();
  expect(requests.recoveries).toHaveLength(1);
  expect(requests.recoveries[0]).toEqual({
    redirect: "http://127.0.0.1:8081/?reset=password",
    body: expect.objectContaining({ email }),
  });
  await page
    .getByRole("button", { name: "Back to sign in", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Sign in", exact: true }),
  ).toBeVisible();
});

for (const failure of ["rate", "network"] as const) {
  test(`reset email ${failure} failures never claim an email was sent`, async ({
    page,
  }) => {
    const requests = await backend(page, { requestError: failure });
    await forgotPassword(page);
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page
      .getByRole("button", { name: "Send reset email", exact: true })
      .click();
    await expect(page.getByRole("alert")).toContainText(
      failure === "rate"
        ? /temporarily limited|too many attempts/i
        : /connect|connection|internet/i,
    );
    await expect(
      page.getByRole("heading", { name: "Check your email.", exact: true }),
    ).toBeHidden();
    if (failure === "rate") {
      await expect(
        page.getByRole("button", { name: /^Try again in \d+s$/ }),
      ).toBeDisabled();
    } else {
      await expect(
        page.getByRole("button", { name: "Send reset email", exact: true }),
      ).toBeEnabled();
    }
    expect(requests.recoveries).toHaveLength(1);
    expect(requests.saves).toEqual([]);
  });
}

test("a valid recovery link survives refresh, validates matching passwords and saves securely", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const requests = await backend(page);
  await page.goto(recoveryLink());
  await expect(page.getByLabel("New password", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Let’s talk", exact: true }),
  ).toBeHidden();
  await expect
    .poll(() => new URL(page.url()).searchParams.get("reset"))
    .toBe("password");
  await expect.poll(() => new URL(page.url()).hash).toBe("");
  await page.reload();
  await expect(page.getByLabel("New password", { exact: true })).toBeVisible();
  await expect(save(page)).toBeDisabled();
  await page.getByLabel("New password", { exact: true }).fill("short");
  await page.getByLabel("Confirm new password", { exact: true }).fill("short");
  await expect(save(page)).toBeDisabled();
  await page
    .getByLabel("New password", { exact: true })
    .fill("New-password-12345");
  await expect(save(page)).toBeDisabled();
  expect(requests.saves).toEqual([]);
  await page
    .getByLabel("Confirm new password", { exact: true })
    .fill("New-password-12345");
  await save(page).click();
  await expect(
    page.getByRole("heading", {
      name: "Your password is updated.",
      exact: true,
    }),
  ).toBeVisible();
  expect(requests.saves).toHaveLength(1);
  expect(requests.saves[0]).toMatchObject({ password: "New-password-12345" });
  await page
    .getByRole("button", { name: "Continue to Kindred", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Let’s talk", exact: true }),
  ).toBeVisible();
  await expect
    .poll(() => new URL(page.url()).searchParams.has("reset"))
    .toBe(false);
  expect(errors).toEqual([]);
});

test("a rejected password update keeps the reset form open and allows a successful retry", async ({
  page,
}) => {
  const requests = await backend(page, { failFirstSave: true });
  await page.goto(recoveryLink());
  await page
    .getByLabel("New password", { exact: true })
    .fill("Weak-password-123");
  await page
    .getByLabel("Confirm new password", { exact: true })
    .fill("Weak-password-123");
  await save(page).click();
  await expect(page.getByRole("alert")).toContainText(/stronger password/);
  await expect(
    page.getByRole("button", { name: "Continue to Kindred", exact: true }),
  ).toBeHidden();
  await page
    .getByLabel("New password", { exact: true })
    .fill("Stronger-password-456");
  await page
    .getByLabel("Confirm new password", { exact: true })
    .fill("Stronger-password-456");
  await save(page).click();
  await expect(
    page.getByRole("heading", {
      name: "Your password is updated.",
      exact: true,
    }),
  ).toBeVisible();
  expect(requests.saves).toHaveLength(2);
});

for (const suffix of [
  "",
  "#error=access_denied&error_code=otp_expired&error_description=private-provider-details",
]) {
  test(`a ${suffix ? "expired" : "missing"} recovery session requests a fresh reset instead of accepting a new password`, async ({
    page,
  }) => {
    const requests = await backend(page);
    await page.goto(`/?reset=password${suffix}`);
    await expect(page.getByLabel("Email", { exact: true })).toBeVisible();
    await expect(page.getByLabel("New password", { exact: true })).toBeHidden();
    await expect(
      page.getByRole("button", { name: "Send reset email", exact: true }),
    ).toBeVisible();
    await expect(page.getByText(/private-provider-details/)).toBeHidden();
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page
      .getByRole("button", { name: "Send reset email", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Check your email.", exact: true }),
    ).toBeVisible();
    expect(requests.recoveries[0].redirect).toBe(
      "http://127.0.0.1:8081/?reset=password",
    );
    expect(requests.saves).toEqual([]);
    await page
      .getByRole("button", { name: "Back to sign in", exact: true })
      .click();
    await expect
      .poll(() => new URL(page.url()).searchParams.has("reset"))
      .toBe(false);
    await page.reload();
    await expect(
      page.getByRole("button", { name: "Sign in", exact: true }),
    ).toBeVisible();
  });
}

test("signing out in another tab removes the active password form", async ({
  page,
  context,
}) => {
  const requests = await backend(page);
  await page.goto(recoveryLink());
  await expect(page.getByLabel("New password", { exact: true })).toBeVisible();
  const other = await context.newPage();
  await backend(other);
  await other.goto("/");
  await other.getByRole("button", { name: "My plan", exact: true }).click();
  await other
    .getByRole("button", { name: "Memory and account", exact: true })
    .click();
  await other.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByLabel("New password", { exact: true })).toBeHidden();
  expect(requests.saves).toEqual([]);
});

test("a reset query alone cannot turn an existing signed-in session into a verified recovery", async ({
  page,
}) => {
  const requests = await backend(page);
  await page.goto("/");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page
    .getByLabel("Password", { exact: true })
    .fill("Existing-password-123");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Let’s talk", exact: true }),
  ).toBeVisible();
  await page.goto("/?reset=password");
  await expect(page.getByLabel("New password", { exact: true })).toBeHidden();
  await expect(
    page.getByRole("button", { name: "Send reset email", exact: true }),
  ).toBeVisible();
  expect(requests.saves).toEqual([]);
});

test("a rejected recovery callback cannot reuse a previously signed-in account to change its password", async ({
  page,
}) => {
  const requests = await backend(page);
  await page.goto("/");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page
    .getByLabel("Password", { exact: true })
    .fill("Existing-password-123");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Let’s talk", exact: true }),
  ).toBeVisible();
  await page.goto(
    "/?reset=password#error=access_denied&error_code=otp_expired&type=recovery&error_description=private-provider-details",
  );
  await expect(page.getByLabel("New password", { exact: true })).toBeHidden();
  await expect(
    page.getByRole("button", { name: "Send reset email", exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/private-provider-details/)).toBeHidden();
  expect(requests.saves).toEqual([]);
});
