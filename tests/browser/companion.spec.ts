import { test, expect } from "@playwright/test";

test("simple mobile plan persists, voice stays manual, and text activities still need confirmation", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.getByRole("button", { name: "Explore the local demo" }).click();
  await expect(
    page.getByRole("heading", { name: "Just three little things." }),
  ).toBeVisible();
  await page
    .getByLabel("Your goals", { exact: true })
    .fill("Read ten minutes\nWalk outside");
  await page.getByLabel("Your check-in time").fill("7:30 PM");
  await page.getByRole("radio", { name: "Three times a week" }).click();
  await page.getByRole("button", { name: "That sounds good" }).click();
  await expect(
    page.getByRole("button", { name: "Let’s talk", exact: true }),
  ).toBeVisible();
  const checkin = page.getByRole("button", {
    name: "Edit my check-in plan",
    exact: true,
  });
  await expect(checkin).toContainText("7:30 PM");
  await expect(checkin).toBeInViewport({ ratio: 1 });
  await page.getByRole("button", { name: "Let’s talk", exact: true }).click();
  await expect(
    page.getByText(/your microphone hasn’t been opened/),
  ).toBeVisible();
  await page.getByRole("button", { name: "Type instead" }).click();
  await page.getByLabel("Message Kindred").fill("Plan a walk");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByText("Local demo · sample replies")).toBeVisible();
  await page.getByRole("button", { name: "Review suggested activity" }).click();
  await page.getByRole("button", { name: "Confirm & save event" }).click();
  await page.getByRole("button", { name: "Memory and account" }).click();
  await page.getByRole("button", { name: "Your saved activities" }).click();
  await expect(
    page.getByText("A little time outside", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Back to talking" }).click();
  await page.getByRole("button", { name: "My plan", exact: true }).click();
  await expect(page.getByLabel("Your goals", { exact: true })).toHaveValue(
    "Read ten minutes\nWalk outside",
  );
  await expect(page.getByLabel("Your check-in time")).toHaveValue("7:30 PM");
  await expect(
    page.getByRole("radio", { name: "Three times a week" }),
  ).toBeChecked();
  await page.reload();
  await page.getByRole("button", { name: "Explore the local demo" }).click();
  await page.getByRole("button", { name: "My plan", exact: true }).click();
  await expect(page.getByLabel("Your goals", { exact: true })).toHaveValue(
    "Read ten minutes\nWalk outside",
  );
  await page
    .getByRole("button", { name: "Memory and account", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Clear conversation history", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirm: clear conversation history" })
    .click();
  await expect(
    page.getByText("Your conversation history has been cleared."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Back to talking" }).click();
  await page.getByRole("button", { name: "Type instead" }).click();
  await expect(
    page.getByRole("heading", { name: "A little space to talk." }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("signup clearly explains email confirmation and uses this site's return URL", async ({
  page,
}) => {
  let redirect = "";
  await page.route("**/auth/v1/signup**", async (route) => {
    redirect =
      new URL(route.request().url()).searchParams.get("redirect_to") || "";
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: "d773cd36-e843-4eb5-b7c5-721c8283d721",
        email: "sample@example.com",
        identities: [],
        created_at: new Date().toISOString(),
      }),
    });
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: "New here? Create an account" })
    .click();
  await expect(
    page.getByText(/we’ll send you a link before you can sign in/),
  ).toBeVisible();
  await page.getByLabel("Email", { exact: true }).fill("sample@example.com");
  await page
    .getByLabel("Password", { exact: true })
    .fill("sample-password-123");
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Check your email." }),
  ).toBeVisible();
  await expect(
    page.getByText(/Open the confirmation email for sample@example.com/),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Resend available in/ }),
  ).toBeDisabled();
  expect(redirect).toBe("http://127.0.0.1:8081/");
});

test("expired email link has a clear recovery screen", async ({ page }) => {
  await page.goto(
    "/#error=access_denied&error_code=otp_expired&error_description=Email+link+expired",
  );
  await expect(
    page.getByRole("heading", { name: "Check your email." }),
  ).toBeVisible();
  await expect(page.getByRole("alert")).toContainText(
    /expired|already been used/,
  );
  await expect(
    page.getByRole("button", { name: "Resend confirmation email" }),
  ).toBeVisible();
});

test("desktop voice screen stays within viewport", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");
  await page.getByRole("button", { name: "Explore the local demo" }).click();
  await page.getByRole("button", { name: "Set up my plan by voice" }).click();
  await expect(
    page.getByRole("button", { name: "Let’s talk", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
