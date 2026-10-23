# Connect the MVP

## 1. Supabase

Create a Supabase project. In its SQL editor run `supabase/migrations/202610200001_initial.sql`, or use the Supabase CLI:

```sh
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
supabase functions deploy chat
supabase functions deploy dispatch-reminders
```

The checked-in `supabase/config.toml` disables gateway JWT verification for these two functions. This is intentional: `chat` verifies the user token with `auth.getUser`; the reminder endpoint accepts only a separate worker secret. Do not remove those checks. Supabase supplies `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to Edge Functions automatically.

In Supabase Auth enable email/password signup and configure the Site URL, email templates and allowed redirect URLs for your deployment. The MVP uses email confirmation followed by returning to the app to sign in; it does not require a magic-link callback. Use a strong password (UI requires at least 8 characters). Password reset, account deletion, export and production abuse controls are release follow-ups.

Create `.env` from `.env.example`:

- `EXPO_PUBLIC_SUPABASE_URL`: your project's HTTPS URL.
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`: the project's public publishable / legacy anon key, never service_role.
- `EXPO_PUBLIC_EAS_PROJECT_ID`: the EAS project UUID, needed only for push registration.

For EAS cloud builds, add the same public variables to the selected EAS environment in the Expo dashboard; the ignored local `.env` is not a reliable source for a remote build. Restart Expo after changing public variables. Public variables are embedded in the app and are not secrets. RLS protects user data; the public key is not an authorization boundary.

## 2. OpenAI (server only)

In Supabase **Edge Function Secrets**, securely add:

| Secret                   | Purpose                                                                 |
| ------------------------ | ----------------------------------------------------------------------- |
| `OPENAI_API_KEY`         | OpenAI API project key with access to the selected model                |
| `OPENAI_MODEL`           | Optional; defaults to `gpt-4.1-mini` with Structured Outputs            |
| `REMINDER_WORKER_SECRET` | A unique, high-entropy scheduler-only secret (at least 32 random bytes) |
| `EXPO_ACCESS_TOKEN`      | Optional Expo push access token if enhanced push security is enabled    |

Never paste credentials into chat or commit `.env`. No OpenAI secret belongs in the mobile app. Conversation requests include recent messages, approved memories, goals, recent completions, upcoming events, name and timezone; disclose this in your privacy policy and choose provider retention settings before releasing to users. RLS and encrypted native token storage do not constitute end-to-end encryption.

## 3. Push notifications

Create an Expo/EAS project, set real unique iOS bundle and Android package identifiers in `app.json`, and configure APNs and FCM v1 credentials with EAS. The checked-in identifiers are placeholders to replace before distribution. Build an iOS/Android **development build** with `eas build --profile development --platform ios` or `android`, install it on a physical device, and start Metro with `npx expo start --dev-client`. `expo-dev-client` is already installed. Push is not validated in a web browser or Expo Go.

In the app's Your space tab, enable notifications on that device. Grant OS permission, then save check-in time, quiet hours, timezone and daily cap. Device registration assigns a token to the signed-in user; sign-out unregisters that installation. Daily check-ins are opt-in; event reminders are explicitly requested by confirming an event; post-activity check-ins are separately opt-in.

The dispatcher sends generic notification text so goals and conversation contents do not appear on a lock screen. Tapping a notification opens Chat; it never auto-starts a microphone or voice call.

## 4. Schedule the worker

Enable Supabase `pg_cron`, `pg_net`, and Vault extensions. In Vault, securely create `kindred_worker_url` with the full URL `https://YOUR_PROJECT_REF.supabase.co/functions/v1/dispatch-reminders` and `kindred_worker_secret` with the same worker secret stored in Edge Function Secrets. Execute `scripts/schedule-reminders.sql` in SQL editor. It is repeatable and never contains a secret value.

The every-minute cron invokes the protected worker. Daily check-ins are generated per user's local calendar date; activity jobs are created transactionally when the user confirms an event. Changes to events rebuild their jobs; deletion cancels queued jobs. Quiet hours delay pending jobs until an allowed window; expired activity reminders are skipped, not sent late. Daily cap includes event, post-activity and daily check-ins together. A zero cap disables all delivery. Disabling daily check-ins skips that day's queued daily check-in, while separately requested activity reminders remain enabled.

Jobs are claimed atomically with per-profile locks. Failed/ambiguous deliveries are not automatically retried because the push gateway has no idempotency key; retrying an unknown outcome can duplicate a notification. Stale processing jobs fail after ten minutes. The next scheduled check-in is still generated. Monitor failed jobs and the function's `accepted_by_gateway` / `failed` response. `sent` means at least one device was accepted by Expo, not delivered. Tickets are stored for diagnosis; a production release should poll Expo receipts and monitor delivery before claiming reliable reminders. Invalid tokens reported by the send gateway are removed. The worker handles up to 40 jobs per invocation and 100 devices per account per job; expand batching and fairness for larger workloads.

## 5. Required live checks

1. Sign up two accounts, confirm emails, sign in, and complete onboarding. Verify each sees only their own goals, chat, events and memories.
2. Ask for a daily goal, edit and save the card, complete it, pause it, then resume. Reload to verify persistence.
3. Ask to schedule a future activity with a date/time and timezone. Verify no event exists before confirmation. Edit its time, confirm, and inspect the calendar and queued notification jobs.
4. Enable a physical device, set a near-future reminder outside quiet hours, and invoke the worker through cron. Verify actual device delivery and tapping into Chat. Test foreground, background, denied permission and signed-out behavior on both platforms.
5. Set a zero cap and quiet hours spanning midnight; verify no delivery. Delete a scheduled event before it is due; verify jobs disappear. A cancellation racing an in-flight external request cannot recall an already accepted push.
6. Approve a memory, correct it, ask about it, forget it and clear history. Verify deleted information is no longer sent in future requests. This does not erase requests already processed by the AI provider.

These live checks need your services and devices and have not been executed in the credential-free cloud environment.

## Cloud networking

Package downloads use the existing package-manager allowlist. To test real services from this cloud machine, add your exact Supabase project hostname, `api.openai.com`, and (for worker testing) `exp.host` to environment network settings. The deployed Supabase functions use Supabase's own egress, not this machine's allowlist. Do not disable TLS verification. No service credentials are presently configured in this onboarding machine.
