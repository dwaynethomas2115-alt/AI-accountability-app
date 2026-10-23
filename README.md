# Kindred — AI Accountability Companion

A mobile-first Expo / React Native / TypeScript app with a Supabase backend. Warm support for personal goals, without guilt, shame, or streak penalties.

## Start here

```sh
npm ci
npm start
# or: npm run web
```

Node 22.13+ in the 22.x line, 24.3+ in the 24.x line, or 26+ (Node 24.19 used during development). Expo SDK 58. The app runs without credentials: select **Explore the local demo**. Demo goals, events, preferences, memories, and sample chat are stored locally on the device; they are separate from authenticated accounts. Demo replies are fixed, visibly labeled examples, not live AI. No notifications are delivered in demo mode. Demo data is unencrypted local app storage, so use sample information.

To connect real services, copy `.env.example` to `.env` and follow [deployment](docs/DEPLOYMENT.md). Never put an OpenAI key or a Supabase service-role key in Expo public variables.

## Implemented

- Email/password Supabase Auth, account confirmation, onboarding and native secure session storage.
- Conversational goal proposals with editable daily, weekly and custom schedules and small steps. Explicit save, pause/resume, edit, delete, daily completion and seven-day effort count.
- Server-side OpenAI text conversation with bounded history, approved memories, validated structured action proposals and per-user rate limiting.
- Editable in-chat calendar cards, explicit confirmation, an internal month calendar, event saving and cancellation. Dates use IANA timezones and reject ambiguous or nonexistent DST hours.
- User-approved memory creation, correction and deletion; conversation history deletion.
- Quiet hours, timezone, notification caps, optional daily and post-activity check-ins. Backend queue and protected push dispatcher; device registration and chat routing from notification taps.
- Row Level Security, cross-user ownership checks, idempotent proposal saves, atomic job claims, notification queue cancellation on event deletion.

## Project map

```text
App.tsx                         Safe area, keyboard handling, tabs, notification tap routing
src/screens/                    Authentication, onboarding, today, chat, calendar, settings
src/components/                 Shared accessible UI and proposal editors
src/state/CompanionProvider.tsx  Authenticated data actions and isolated persistent demo
src/lib/                        Domain types, timezone conversion, Supabase, device push
supabase/migrations/            Schema, RLS, validation, queue and rate-limit functions
supabase/functions/chat/        Authenticated OpenAI structured conversation endpoint
supabase/functions/dispatch-reminders/  Scheduler-authenticated Expo push worker
supabase/functions/_shared/     Validated API contracts and companion personality
scripts/schedule-reminders.sql  Vault-backed cron installation template
```

## Verification

```sh
npm run typecheck
npm test                  # Real PostgreSQL engine (PGlite): RLS, queue, caps, contracts, DST
npm run check:backend     # Deno type-check of both Edge Functions
npm run build:web
npm run build:all          # JS/Hermes bundles for iOS, Android and web; not native binaries
npm run test:e2e           # Built web app; Chromium path defaults to /usr/bin/chromium
```

Set `CHROMIUM_PATH` if Chromium is elsewhere. The browser suite starts a local static server and tests the demo at a mobile viewport; it does not verify Supabase Auth, OpenAI, APNs, FCM, or device behavior. Supabase integration and physical-device test steps are in the deployment guide. In this cloud environment run npm with `npm_config_cache=/tmp/npm-cache` and Expo with `EXPO_NO_TELEMETRY=1 EXPO_OFFLINE=1` if Expo metadata destinations are restricted; npm still downloads signed/integrity-checked dependencies from the registry.

## Milestone boundaries

This is an MVP implementation ready for credentialed integration testing, not a deployed production service. Push gateway acceptance is recorded, not proof of device delivery. No background live conversations, automatic external calendar writes, billing, telephone calls, or voice are implemented. Weekly progress is a factual seven-day effort count; personalized weekly AI recaps, detailed milestone charts, proactive recurring-obstacle analysis, calendar integrations and Realtime voice remain follow-ups. See [architecture and voice plan](docs/ARCHITECTURE.md).

## Website deployment

See [Vercel deployment](docs/VERCEL.md). The repository includes Vercel build/output settings and a required-public-configuration check. GitHub-connected deployments update automatically when changes are pushed to `main`; Supabase remains the backend.
