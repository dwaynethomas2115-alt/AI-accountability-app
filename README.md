# Kindred — AI Accountability Companion

A calm, voice-first companion for personal goals. React Native, Expo, TypeScript, Supabase and OpenAI Realtime. Warm support, without guilt or streak penalties.

## Start here

```sh
npm ci
npm start
# or: npm run web
```

Use Node 24.19 (see `.nvmrc`). Expo SDK 58. Copy `.env.example` to `.env` and follow [deployment](docs/DEPLOYMENT.md). The two public Supabase values belong in Expo configuration. OpenAI and Supabase service-role keys belong only in backend secrets.

**Explore the local demo** works without credentials and stores sample plans, events and text replies locally. It is clearly labeled, uses fixed sample replies, and never opens a microphone or sends notifications. Use sample information in its unencrypted local storage.

## The simple experience

- A continuous garden forest grows upward from the bottom of the screen, with planted beds, soft light and water blending into a calm header. Talk, text and the next check-in sit above the garden. Each goal owns a flower or tree that grows from its first sprout with completed days, with new stages at 1, 3, 7 and 14 days. Care across all goals also fills in the surrounding forest. Each newly saved accomplishment shows its growth and a celebration. Paused goals and missed days keep earned growth; reduced-motion settings are respected.
- Goal labels stay hidden until you tap a plant. A small garden sign set beside its roots reveals the goal and completed days; tapping the sign tucks it away.
- After a voice conversation or a successful text message, users can confirm a completed goal and return to their growing garden. Recording the same goal again today never adds duplicate progress. Conversations alone do not award completions.
- Tap the daily progress circle to mark scheduled goals complete or correct today’s entry. The circle includes extra goals completed on unscheduled days and resets daily; lifetime garden growth is calculated from saved completions.
- **Preview garden growth** shows five sample stages and **Preview one more day** demonstrates growth between stages, without writing progress or changing the account. **Back to my garden** restores the real view.

- Setup asks only for goals, a convenient time, and check-in frequency. Users can also describe the plan by voice.
- **Let’s talk** starts an actual two-way Realtime audio conversation anytime. Voice supports interruption, live captions, mute and end. Microphone access starts only after the user presses the button, and stops on end, backgrounding, sign-out or navigation.
- Spoken plan changes are shown for review and require a later explicit confirmation or a Save press. Saving preserves progress and pauses goals removed from the plan.
- The home screen shows the next chosen check-in. For this version users open the app themselves; there are no automatic calls.
- **Type instead** offers a simple messaging interface. Calendar suggestions can be expanded, edited and explicitly saved. Existing calendar and approved memory records remain accessible through account settings.
- Recent text and voice history give future conversations context. Users can correct/delete approved memories and clear conversation history. The app does not store raw audio.
- Email signup explains confirmation before submission and shows a dedicated check-email screen afterward. Browser sign-in persists across visits; native sessions use OS secure storage.

The voice backend needs a one-time Supabase update: **[activate voice](docs/VOICE.md)**. Existing text-chat credentials are reused. Native voice needs a fresh development or production build with WebRTC; Expo Go does not contain the required module.

## Project map

```text
App.tsx                         Simple navigation, auth shell, voice lifecycle
src/screens/                    Talk, plan, messages, account, auth and saved calendar
src/components/garden/          Forest scene, plant details, goal actions and preview
src/lib/garden.ts               Stable goal plants and timezone-aware growth rules
src/hooks/useVoiceConversation.ts  React binding for the voice session controller
src/lib/voice/                  Browser/native WebRTC, session events and confirmation
src/state/CompanionProvider.tsx  User-owned data actions and separate persistent demo
supabase/migrations/            Schema, RLS, atomic plan saving and rate limits
supabase/functions/voice-session/  Authenticated Realtime credentials and transcript saving
supabase/functions/chat/        Authenticated text conversation endpoint
supabase/functions/dispatch-reminders/  Existing optional Expo push worker
scripts/prepare-voice-deploy.mjs  Generate complete dashboard-ready voice deployment files
```

## Verification

```sh
npm run typecheck
npm test                  # PostgreSQL/RLS, plan, auth and voice lifecycle/endpoint tests
npm run check:backend      # Deno type-check of all Edge Functions
npm run build:web
npm run test:e2e           # Built web app; real UI, mocked external voice services
npm run build:all          # JS/Hermes bundles; not native binaries
npm run prepare:voice      # Dashboard-ready SQL and single index.ts in /tmp/kindred-voice
```

Browser tests default to Chromium at `/usr/bin/chromium`; set `CHROMIUM_PATH` if needed. Automated tests mock microphones, SDP, Supabase auth and OpenAI calls. They cannot establish live audio quality, provider access/billing, native audio routing or push delivery. Follow the [live checks](docs/VOICE.md#live-verification) before relying on voice with real accounts.

In this managed environment use `npm_config_cache=/tmp/npm-cache` and `EXPO_NO_TELEMETRY=1 EXPO_OFFLINE=1` when Expo metadata destinations are restricted.

## Deployment and boundaries

[Vercel](docs/VERCEL.md) serves the website; Supabase remains the backend. GitHub-connected Vercel deployments update from `main`. Supabase migrations/functions are deployed separately. [Architecture](docs/ARCHITECTURE.md) explains data ownership and security boundaries.

The existing backend push queue remains available for configured native installations, with selected weekdays, quiet hours and frequency caps. This simplified release uses a scheduled time to open the app manually; it does not promise browser push or automatic voice calls. Google/Apple Calendar integrations, telephone calling, billing, account export/deletion and automated retention remain future work.
