# Architecture

## App and data boundaries

The Expo client accesses only user-owned records with a Supabase public key and authenticated JWT. PostgreSQL Row Level Security enforces ownership, including completion-to-goal and proposal-source ownership. Server-created text messages cannot be forged through client inserts. Browser sessions use localStorage with migration from the previous sessionStorage release; native tokens use SecureStore. Demo data has a separate local storage key and cannot silently replace a failed live backend request.

The interface centers on Talk, with a three-question plan screen, plain text messages and memory/account controls. Setup does not require push permission. A chosen check-in time is displayed in the user's stored IANA timezone; voice can start anytime after a manual button press. It never starts from a notification or timer.

`save_companion_plan` atomically updates goals and profile preferences for `auth.uid()`. Matching goal titles retain their IDs and progress; removed goals are paused. The API accepts one to five goals, local check-in time, selected weekdays and timezone. Voice and typed setup use the same validated operation. Editing a plan does not silently enable push notifications.

## Realtime voice

`POST /functions/v1/voice-session` authenticates the Supabase token and creates a short-lived OpenAI Realtime client credential. The long-lived OpenAI key stays in Edge Function secrets. A separate private request ledger enforces three starts per minute and twenty per day, even after history is cleared. The client exchanges SDP directly with OpenAI over WebRTC. The web adapter uses browser media APIs; native uses `react-native-webrtc` in a custom Expo build. No camera access is requested.

The framework-neutral session controller handles connection timeout, captions, interrupted responses, microphone mute, remote audio playback and disposal. The hook ends capture on backgrounding/sign-out/unmount, and navigation ends the active session. All tracks are stopped even if a permission prompt resolves after cancellation. A blocked autoplay gesture can be recovered explicitly. Failed voice never substitutes prerecorded or synthetic demo replies.

Realtime exposes two tools: propose a plan and confirm it. A model tool call cannot authorize a database write on its own. The controller validates the proposal, waits for a later finalized user turn with clear affirmative wording, and checks that the confirmed proposal is still current. An explicit visible Save button is an alternative. Conditional responses and old/out-of-order transcripts do not count as confirmation.

On end, the device submits bounded transcript turns to its own previously allocated session. Finish is idempotent and cannot recreate an expired or deleted record. Stored transcripts are unverified client input, explicitly labeled as such in future model context. They do not become authoritative assistant records or grant new permissions. No raw audio is stored by this app. See [voice deployment and live verification](VOICE.md).

The app ends calls after twenty minutes, but this is a client lifecycle limit rather than a provider-enforced billing ceiling. Production operation also needs OpenAI project cost monitoring and budgets. Live microphone quality, interruptions, mobile audio routing and provider access require real-service and device testing.

## Text, calendar and reminders

`POST /functions/v1/chat` accepts `{text, request_id}` with a user bearer token. It verifies identity, claims an idempotent rate-limit slot (8/minute,150/day), reads bounded context, invokes OpenAI Structured Outputs and persists the user/assistant pair atomically. The endpoint creates proposals, not goals/events/memories. Provider failures do not leave partial message pairs.

Text proposals are drafts. An expanded calendar card can be edited before explicit confirmation. A unique `(user_id, source_message_id)` prevents duplicate goal/event saves. Confirmed events create reminder jobs in the same database transaction. History deletion preserves approved goals/events and removes their source link. Calendar adapters should preserve this internal confirmation boundary before requesting external provider permissions.

The existing `dispatch-reminders` function requires a scheduler secret. It atomically claims jobs, respecting weekday selection, timezone, quiet hours and daily caps, and sends generic Expo pushes. Voice is never opened automatically. The simplified web interface does not register a browser push subscription. Push acceptance does not prove delivery; production work still includes receipt polling, monitoring, token limits and rechecking preferences at send time.

## Memory and retention

Future conversations receive bounded recent text/voice history, current goals and approved memory records. There is no hidden summary or embedding store. Users can inspect, correct and delete approved memories and clear conversation history. Only finalized transcript segments are persisted; abrupt tab closure may prevent the final history request.

A future summary pipeline needs provenance, inspectable entries and deletion propagation. Account deletion/export, automated retention, calendar integrations and optional telephone calls are separate follow-ups. Billing and real telephone calls are outside this update.
