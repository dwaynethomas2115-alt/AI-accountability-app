# Voice-first update

Kindred now uses OpenAI Realtime for an actual two-way audio conversation. A user chooses **Let’s talk**, grants microphone permission, and can speak naturally, interrupt, mute or end the conversation. The scheduled time is a suggestion for opening the app; voice is available at other times too. The app never starts a microphone or calls someone automatically.

The website works over HTTPS with a WebRTC-capable browser and microphone access. Native iOS/Android voice requires a fresh Expo development or production build with `react-native-webrtc`; Expo Go does not include that native module. Native media permission and audio routing still need device validation.

## One-time Supabase update

The existing text-chat function and its secret can stay in place. This update adds a separate function named **voice-session**.

1. Run `supabase/migrations/202610230001_voice_plan.sql` in Supabase SQL Editor. Run the complete file, including the final `commit;`. It is additive and repeatable: it preserves previous goal progress, adds simple plan saving and selected check-in days, and creates private voice-session storage.
2. Deploy `voice-session` with the Supabase CLI, or use the dashboard editor as described below.
3. In the function's settings, turn **Verify JWT with legacy secret** off. The function verifies each user's token with `auth.getUser` itself; anonymous requests return 401.
4. Keep `OPENAI_API_KEY` in Supabase Edge Function Secrets. The key already supplied for text chat is reused. Its OpenAI project must have Realtime model access and available API billing. `OPENAI_REALTIME_MODEL` is optional and defaults to `gpt-realtime`.

Using the CLI from the repository root:

```sh
supabase functions deploy voice-session --project-ref YOUR_PROJECT_REF
```

For the Supabase dashboard, generate a single file:

```sh
node scripts/prepare-voice-deploy.mjs
```

This writes `/tmp/kindred-voice/index.ts` and `/tmp/kindred-voice/database-update.sql` outside the repository. In **Edge Functions → Deploy a new function → Via Editor**, name the function **voice-session**, replace all of its `index.ts` with the generated file, and deploy. Do not paste only part of the file. The generated file has no relative imports and contains no secret values. A different output directory can be passed as the script's first argument.

## Live verification

After the migration and function deployment:

1. Sign in to the deployed app in an HTTPS browser. Choose **Let’s talk** and grant microphone access.
2. Confirm that you hear Kindred and that it responds to your spoken words. Interrupt it mid-sentence and verify the conversation continues naturally.
3. Ask to change a goal and your check-in time/frequency. Kindred should read the proposed plan aloud and ask before saving. Say **“yes, save it”**, then verify the saved plan after reload. A proposed plan or an assistant tool call alone must not save a change. A visible Save control is available if speech recognition cannot confidently confirm.
4. Mute and verify input stops. End the call and verify the browser/OS microphone indicator stops. Backgrounding the app or signing out should end capture too.
5. Start again and check useful continuity from the last conversation. Clear conversation history in the app and verify that future sessions stop receiving that history.
6. Test denied microphone permission, a dropped connection, blocked audio playback, expired sign-in and an unavailable provider. The app should explain the failure and release the microphone, without substituting pretend AI speech.

Builds and automated tests do not establish that live microphone capture, provider billing/model access or real-device audio routing works. Those require the checks above. A deployed text-chat endpoint does not prove the new voice endpoint has been deployed.

## Service behavior

`POST /functions/v1/voice-session` accepts a signed-in user's bearer token:

- `{ "action": "start", "request_id": "UUID" }` creates a rate-limited session and requests a client credential from OpenAI's GA `/v1/realtime/client_secrets` endpoint. It returns only the ephemeral credential, its expiry, the app session ID, model and suggested maximum duration. The credential expires for establishing new connections after 60 seconds. The browser/native app exchanges SDP directly with OpenAI at `/v1/realtime/calls`.
- `{ "action": "finish", "session_id": "UUID", "transcript": [...] }` saves bounded completed transcript turns to the user's own session. Each turn contains `role`, `content` and optional `item_id`. The finish operation is idempotent. An expired or user-deleted session cannot be recreated by a late request.

The server permits at most three new requests per minute and twenty per day per user, with duplicate request IDs rejected. The private rate-limit ledger survives conversation-history deletion. The UI ends a call at twenty minutes; this is a client lifecycle limit, not a server-enforced OpenAI billing ceiling. Client credentials can establish multiple connections before expiry, so production cost limits also need OpenAI project budgets and monitoring.

The long-lived OpenAI key never goes to the browser or phone. No raw audio is stored by this app. The AI provider processes audio; finalized transcripts are supplied by the user's device and stored in their own private session. Because a device can modify speaker labels or text, previous transcripts are explicitly labeled unverified user data in model context. They cannot write authoritative assistant messages or bypass plan confirmation and database ownership checks. Tracing is disabled in the requested Realtime session configuration.

Only two action tools are exposed: propose a full plan and confirm that plan. The client independently requires a later clear spoken confirmation or an explicit Save press before calling the authenticated plan-saving RPC. Removed plan goals are paused rather than deleting their progress. There are no voice tools for deleting memories, deleting accounts or placing telephone calls.

## Development checks

```sh
node_modules/.bin/tsx --test tests/voice-backend.test.ts
DENO_DIR=/tmp/deno-cache node_modules/.bin/deno check --config supabase/functions/deno.json supabase/functions/voice-session/index.ts
node scripts/prepare-voice-deploy.mjs
DENO_DIR=/tmp/deno-cache node_modules/.bin/deno check --config supabase/functions/deno.json /tmp/kindred-voice/index.ts
```

The Realtime request shape was checked against the official OpenAI JavaScript SDK's generated `resources/realtime/client-secrets.ts` and `resources/realtime/realtime.ts` definitions. No live OpenAI key was available in the development machine for a Realtime integration test.
