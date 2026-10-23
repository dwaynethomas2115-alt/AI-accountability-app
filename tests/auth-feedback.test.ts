import { test } from "node:test";
import assert from "node:assert/strict";
import {
  authFeedback,
  authRedirectUrl,
  callbackFeedback,
  resendSecondsRemaining,
} from "../src/lib/auth-feedback.ts";

test("confirmation redirects follow the actual deployment and native scheme", () => {
  assert.equal(
    authRedirectUrl(
      "web",
      "https://pokemedoit.vercel.app/?foo=bar#error=access_denied",
    ),
    "https://pokemedoit.vercel.app/",
  );
  assert.equal(
    authRedirectUrl("web", "https://kindred-preview.vercel.app/path"),
    "https://kindred-preview.vercel.app/",
  );
  assert.equal(
    authRedirectUrl("web", "http://localhost:8081"),
    "http://localhost:8081/",
  );
  assert.equal(authRedirectUrl("web", "javascript:alert(1)"), undefined);
  assert.equal(authRedirectUrl("web"), undefined);
  assert.equal(authRedirectUrl("ios"), "kindred://auth");
  assert.equal(authRedirectUrl("android"), "kindred://auth");
});

test("expired callback links explain recovery without exposing arbitrary callback text", () => {
  const feedback = callbackFeedback(
    "https://pokemedoit.vercel.app/#error=access_denied&error_code=otp_expired&error_description=arbitrary+provider+text",
  );
  assert.equal(feedback?.needsConfirmation, true);
  assert.match(feedback!.message, /expired or was already used/);
  assert.doesNotMatch(feedback!.message, /arbitrary/);
  assert.equal(
    callbackFeedback("https://pokemedoit.vercel.app/#access_token=example"),
    null,
  );
  assert.equal(callbackFeedback("not a URL"), null);
  assert.match(
    callbackFeedback("https://pokemedoit.vercel.app/?error=access_denied")!
      .message,
    /couldn’t be opened/,
  );
});

test("email rate limits and unconfirmed users have actionable feedback", () => {
  const rate = authFeedback({
    code: "over_email_send_rate_limit",
    status: 429,
  });
  assert.equal(rate.rateLimited, true);
  assert.match(rate.message, /couldn’t send/);
  assert.doesNotMatch(rate.message, /sent you/);
  assert.equal(
    authFeedback({ code: "email_not_confirmed" }).needsConfirmation,
    true,
  );
  assert.match(
    authFeedback({ code: "invalid_credentials" }).message,
    /don’t match/,
  );
  assert.match(
    authFeedback({ code: "email_address_not_authorized" }).message,
    /email service needs/,
  );
});

test("resend cooldown rounds up and never becomes negative", () => {
  assert.equal(resendSecondsRemaining(60000, 0), 60);
  assert.equal(resendSecondsRemaining(60000, 59001), 1);
  assert.equal(resendSecondsRemaining(60000, 60000), 0);
  assert.equal(resendSecondsRemaining(60000, 80000), 0);
});

test("sign-in rate limits do not incorrectly claim an email was sent", () => {
  const feedback = authFeedback({
    code: "over_request_rate_limit",
    status: 429,
  });
  assert.equal(feedback.rateLimited, true);
  assert.match(feedback.message, /too many attempts/i);
  assert.doesNotMatch(feedback.message, /email|send/i);
});
