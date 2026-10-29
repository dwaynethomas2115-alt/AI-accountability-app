export type AuthFeedback = {
  message: string;
  kind: "error" | "info";
  needsConfirmation?: boolean;
  rateLimited?: boolean;
};
type AuthErrorLike = { code?: string; status?: number; message?: string };

/** Give people an actionable message without exposing provider internals. */
export function authFeedback(error: unknown): AuthFeedback {
  const detail = (error ?? {}) as AuthErrorLike;
  const code = detail.code ?? "";
  const message = detail.message?.toLowerCase() ?? "";
  if (
    code === "over_email_send_rate_limit" ||
    (message.includes("email") && message.includes("rate limit"))
  ) {
    return {
      kind: "error",
      rateLimited: true,
      message:
        "Email is temporarily limited, so we couldn’t send another message. Please wait before trying again. If you already confirmed your email, you can sign in now.",
    };
  }
  if (
    detail.status === 429 ||
    code === "over_request_rate_limit" ||
    message.includes("rate limit")
  ) {
    return {
      kind: "error",
      rateLimited: true,
      message:
        "There have been too many attempts. Please wait a little before trying again.",
    };
  }
  if (
    code === "email_not_confirmed" ||
    message.includes("email not confirmed")
  ) {
    return {
      kind: "info",
      needsConfirmation: true,
      message:
        "Confirm your email before signing in. Open the latest email from Kindred, or request a new confirmation below.",
    };
  }
  if (
    code === "otp_expired" ||
    message.includes("expired") ||
    message.includes("invalid token")
  ) {
    return {
      kind: "error",
      needsConfirmation: true,
      message:
        "That email link has expired or was already used. If you already confirmed your account, sign in. Otherwise, request a fresh confirmation and use only the newest email.",
    };
  }
  if (
    code === "invalid_credentials" ||
    message.includes("invalid login credentials")
  ) {
    return {
      kind: "error",
      message: "That email and password don’t match. Check them and try again.",
    };
  }
  if (
    code === "user_already_exists" ||
    message.includes("already registered")
  ) {
    return {
      kind: "info",
      message:
        "There’s already an account for that email. Sign in with your existing password.",
    };
  }
  if (
    code === "email_address_not_authorized" ||
    message.includes("email address not authorized")
  ) {
    return {
      kind: "error",
      message:
        "Confirmation emails aren’t available for this address yet. The app’s email service needs to be configured before you can create this account.",
    };
  }
  if (
    code === "weak_password" ||
    (code === "validation_failed" && message.includes("password"))
  ) {
    return {
      kind: "error",
      message: "Choose a stronger password with at least 8 characters.",
    };
  }
  if (
    code === "email_address_invalid" ||
    (code === "validation_failed" && message.includes("email"))
  ) {
    return { kind: "error", message: "Please enter a valid email address." };
  }
  if (
    message.includes("fetch") ||
    message.includes("network") ||
    message.includes("connection")
  ) {
    return {
      kind: "error",
      message:
        "We couldn’t connect. Check your internet connection and try again.",
    };
  }
  return {
    kind: "error",
    message:
      "We couldn’t complete that just now. Please try again in a moment.",
  };
}

/** Email links return to this actual deployment, never a hard-coded localhost URL. */
export function authRedirectUrl(
  platform: string,
  currentUrl?: string,
): string | undefined {
  if (platform !== "web") return "kindred://auth";
  if (!currentUrl) return undefined;
  try {
    const url = new URL(currentUrl);
    return url.protocol === "https:" || url.protocol === "http:"
      ? `${url.origin}/`
      : undefined;
  } catch {
    return undefined;
  }
}

export function callbackFeedback(href?: string): AuthFeedback | null {
  if (!href) return null;
  try {
    const url = new URL(href);
    const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
    const code = hash.get("error_code") ?? url.searchParams.get("error_code");
    const error = hash.get("error") ?? url.searchParams.get("error");
    if (!code && !error) return null;
    if (code === "otp_expired") return authFeedback({ code });
    return {
      kind: "error",
      needsConfirmation: true,
      message:
        "That email link couldn’t be opened. Try signing in if you already confirmed your account, or request a fresh confirmation email.",
    };
  } catch {
    return null;
  }
}

export const RESEND_COOLDOWN_SECONDS = 60;

/** Recovery has different next steps from signup confirmation. */
export function passwordResetFeedback(
  error: unknown,
): AuthFeedback & { needsReset?: boolean } {
  const detail = (error ?? {}) as AuthErrorLike;
  const code = detail.code ?? "";
  if (code === "email_address_not_authorized")
    return {
      kind: "error",
      message:
        "Password-reset emails aren’t available for this address yet. The app’s email service needs to be configured.",
    };
  if (
    [
      "session_not_found",
      "session_expired",
      "refresh_token_not_found",
      "refresh_token_already_used",
      "bad_jwt",
      "otp_expired",
    ].includes(code) ||
    detail.message?.toLowerCase().includes("auth session missing") ||
    detail.status === 401 ||
    detail.status === 403
  ) {
    return {
      kind: "error",
      needsReset: true,
      message:
        "Your reset link is no longer valid. Request a fresh password-reset email and use the newest link.",
    };
  }
  if (code === "same_password")
    return {
      kind: "error",
      message: "Choose a new password different from your previous one.",
    };
  const feedback = authFeedback(error);
  if (feedback.rateLimited)
    return {
      ...feedback,
      message:
        "Password reset is temporarily limited. Please wait before trying again. Email limits may take longer than a minute to reset.",
    };
  if (feedback.needsConfirmation)
    return {
      kind: "error",
      needsReset: true,
      message:
        "That reset link couldn’t be used. Request a fresh password-reset email.",
    };
  return feedback;
}

export function resendSecondsRemaining(availableAt: number, now: number) {
  return Math.max(0, Math.ceil((availableAt - now) / 1000));
}
