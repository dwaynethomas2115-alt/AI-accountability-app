import { expect, test, type Page } from "@playwright/test";

// The UI, Supabase client, voice controller and browser adapter all run normally.
// Only external HTTP services and browser media hardware are substituted here.
const userId = "8d994ce2-935d-42df-aed4-d793f66ab77c";
const sessionId = "8d994ce2-935d-42df-aed4-d793f66ab77d";
type VoiceEvent = Record<string, unknown>;

async function installMedia(page: Page) {
  await page.addInitScript(() => {
    const state = {
      microphoneRequests: 0,
      stoppedTracks: 0,
      closedPeers: 0,
      closedChannels: 0,
      sent: [] as Record<string, any>[],
      track: {
        enabled: true,
        stop: () => {
          state.stoppedTracks++;
          state.track.enabled = false;
        },
      },
      emit: (_event: Record<string, unknown>) => {},
    };
    (window as any).__voiceTest = state;
    const stream = {
      getTracks: () => [state.track],
      getAudioTracks: () => [state.track],
    };
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: async () => {
          state.microphoneRequests++;
          state.track.enabled = true;
          return stream;
        },
      },
    });
    HTMLMediaElement.prototype.play = async function () {};
    HTMLMediaElement.prototype.pause = function () {};
    class MockPeer {
      connectionState = "new";
      onconnectionstatechange: (() => void) | null = null;
      ontrack: ((event: { streams: MediaStream[] }) => void) | null = null;
      channel = {
        readyState: "connecting",
        onopen: null as (() => void) | null,
        onclose: null as (() => void) | null,
        onerror: null as (() => void) | null,
        onmessage: null as ((event: { data: string }) => void) | null,
        send: (raw: string) => state.sent.push(JSON.parse(raw)),
        close: () => {
          state.closedChannels++;
          this.channel.readyState = "closed";
        },
      };
      addTrack() {}
      createDataChannel() {
        state.emit = (event) =>
          this.channel.onmessage?.({ data: JSON.stringify(event) });
        return this.channel;
      }
      async createOffer() {
        return { type: "offer", sdp: "v=0\r\nmock-offer" };
      }
      async setLocalDescription() {}
      async setRemoteDescription() {
        this.connectionState = "connected";
        this.channel.readyState = "open";
        this.ontrack?.({ streams: [new MediaStream()] });
        this.channel.onopen?.();
      }
      close() {
        state.closedPeers++;
        this.connectionState = "closed";
      }
    }
    (window as any).RTCPeerConnection = MockPeer;
  });
}

async function installBackend(page: Page, startStatus = 200) {
  const requests = {
    starts: 0,
    finishes: [] as Record<string, any>[],
    saves: [] as Record<string, any>[],
    sdps: [] as { authorization: string | undefined; body: string | null }[],
  };
  let profile = {
    user_id: userId,
    display_name: "Sam",
    onboarded: true,
    timezone: "America/New_York",
    checkins_enabled: false,
    checkin_time: "18:00",
    checkin_days: [0, 1, 2, 3, 4, 5, 6],
    quiet_start: "21:00",
    quiet_end: "08:00",
    daily_limit: 2,
  };
  let goals = [
    {
      id: "initial-goal",
      user_id: userId,
      title: "Walk a little more",
      status: "active",
      steps: [],
      schedule: { kind: "daily", days: [] },
      created_at: "2026-10-23T12:00:00Z",
    },
  ];
  const encode = (value: object) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  const accessToken = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: userId, role: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600 })}.test-signature`;
  const user = {
    id: userId,
    aud: "authenticated",
    role: "authenticated",
    email: "voice-test@example.com",
    app_metadata: { provider: "email" },
    user_metadata: {},
    created_at: "2026-10-23T12:00:00Z",
  };
  await page.route("**/*.supabase.co/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const json = (body: unknown, status = 200) =>
      route.fulfill({ status, json: body });
    if (url.pathname === "/auth/v1/token") {
      return json({
        access_token: accessToken,
        refresh_token: "test-refresh-token",
        token_type: "bearer",
        expires_in: 3600,
        user,
      });
    }
    if (url.pathname === "/auth/v1/user") return json(user);
    if (url.pathname === "/functions/v1/voice-session") {
      expect(request.headers().authorization).toBe(`Bearer ${accessToken}`);
      const body = request.postDataJSON();
      if (body.action === "start") {
        requests.starts++;
        if (startStatus !== 200)
          return json({ error: "Unavailable in this test" }, startStatus);
        return json({
          client_secret: "ephemeral-test-value",
          expires_at: Math.floor(Date.now() / 1000) + 60,
          session_id: sessionId,
          model: "gpt-realtime",
          max_duration_seconds: 1200,
        });
      }
      requests.finishes.push(body);
      return json({ ok: true });
    }
    if (url.pathname === "/rest/v1/rpc/save_companion_plan") {
      const body = request.postDataJSON();
      requests.saves.push(body);
      profile = {
        ...profile,
        checkin_time: body.p_checkin_time,
        checkin_days: body.p_checkin_days,
        timezone: body.p_timezone,
      };
      goals = body.p_goals.map((title: string, index: number) => ({
        ...goals[0],
        id: `saved-${index}`,
        title,
      }));
      return json(null);
    }
    if (url.pathname.startsWith("/rest/v1/")) {
      const table = url.pathname.split("/").at(-1);
      return json(
        table === "profiles" ? [profile] : table === "goals" ? goals : [],
      );
    }
    throw new Error(
      `Unexpected backend request: ${request.method()} ${url.pathname}`,
    );
  });
  await page.route(
    "https://api.openai.com/v1/realtime/calls",
    async (route) => {
      requests.sdps.push({
        authorization: route.request().headers().authorization,
        body: route.request().postData(),
      });
      await route.fulfill({
        status: 201,
        contentType: "application/sdp",
        body: "v=0\r\nmock-answer",
      });
    },
  );
  return requests;
}

async function signIn(page: Page) {
  await page.goto("/");
  await page
    .getByLabel("Email", { exact: true })
    .fill("voice-test@example.com");
  await page.getByLabel("Password", { exact: true }).fill("test-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Let’s talk", exact: true }),
  ).toBeVisible();
}

async function emit(page: Page, ...events: VoiceEvent[]) {
  await page.evaluate((items) => {
    for (const item of items) (window as any).__voiceTest.emit(item);
  }, events);
}

test("signed-in voice starts only on request, transcribes, mutes, and releases the microphone", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await installMedia(page);
  const requests = await installBackend(page);
  await signIn(page);
  expect(
    await page.evaluate(() => (window as any).__voiceTest.microphoneRequests),
  ).toBe(0);
  expect(requests.starts).toBe(0);

  await page.getByRole("button", { name: "Let’s talk", exact: true }).click();
  await expect(page.getByText("I’m listening", { exact: true })).toBeVisible();
  expect(requests.starts).toBe(1);
  expect(requests.sdps).toEqual([
    { authorization: "Bearer ephemeral-test-value", body: "v=0\r\nmock-offer" },
  ]);
  expect(
    await page.evaluate(() => (window as any).__voiceTest.microphoneRequests),
  ).toBe(1);
  await emit(
    page,
    { type: "input_audio_buffer.speech_started", item_id: "user-one" },
    {
      type: "conversation.item.input_audio_transcription.completed",
      item_id: "user-one",
      transcript: "I took a short walk today.",
    },
  );
  await expect(
    page.getByText("I took a short walk today.", { exact: true }),
  ).toBeVisible();
  await emit(
    page,
    {
      type: "response.output_audio_transcript.done",
      item_id: "assistant-one",
      transcript: "That sounds like a lovely small step.",
    },
    { type: "output_audio_buffer.started" },
  );
  await expect(
    page.getByText("Kindred is speaking", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("That sounds like a lovely small step.", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Mute microphone", exact: true })
    .click();
  expect(
    await page.evaluate(() => (window as any).__voiceTest.track.enabled),
  ).toBe(false);
  await expect(
    page.getByText("Microphone paused", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Unmute microphone", exact: true })
    .click();
  expect(
    await page.evaluate(() => (window as any).__voiceTest.track.enabled),
  ).toBe(true);
  await page
    .getByRole("button", { name: "End conversation", exact: true })
    .click();
  await expect(
    page.getByText("Talk a little more", { exact: true }),
  ).toBeVisible();
  await expect.poll(() => requests.finishes.length).toBe(1);
  expect(requests.finishes[0]).toMatchObject({
    action: "finish",
    session_id: sessionId,
    transcript: [
      { role: "user", content: "I took a short walk today." },
      { role: "assistant", content: "That sounds like a lovely small step." },
    ],
  });
  expect(
    await page.evaluate(() => {
      const s = (window as any).__voiceTest;
      return {
        tracks: s.stoppedTracks,
        peers: s.closedPeers,
        channels: s.closedChannels,
      };
    }),
  ).toEqual({ tracks: 1, peers: 1, channels: 1 });
  await expect(page.locator("audio")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("a voice plan is saved only after a new spoken confirmation and survives returning to My plan", async ({
  page,
}) => {
  await installMedia(page);
  const requests = await installBackend(page);
  await signIn(page);
  await page.getByRole("button", { name: "Let’s talk", exact: true }).click();
  await expect(page.getByText("I’m listening", { exact: true })).toBeVisible();
  await emit(
    page,
    { type: "response.done", response: { status: "completed" } },
    {
      type: "response.function_call_arguments.done",
      name: "propose_plan",
      call_id: "proposal-one",
      arguments: JSON.stringify({
        goals: ["Read before bed"],
        checkin_time: "20:30",
        checkin_days: [1, 3, 5],
      }),
    },
  );
  await expect(
    page.getByRole("button", { name: "Save this plan", exact: true }),
  ).toBeVisible();
  expect(requests.saves).toHaveLength(0);
  const proposalId = await page.evaluate(() => {
    const event = (window as any).__voiceTest.sent.find(
      (e: any) => e.item?.call_id === "proposal-one",
    );
    return JSON.parse(event.item.output).proposal_id as string;
  });
  await emit(page, {
    type: "response.function_call_arguments.done",
    name: "confirm_plan",
    call_id: "unapproved-confirmation",
    arguments: JSON.stringify({ proposal_id: proposalId }),
  });
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as any).__voiceTest.sent.some(
          (e: any) => e.item?.call_id === "unapproved-confirmation",
        ),
      ),
    )
    .toBe(true);
  expect(requests.saves).toHaveLength(0);
  await emit(
    page,
    { type: "input_audio_buffer.speech_started", item_id: "approval-one" },
    {
      type: "conversation.item.input_audio_transcription.completed",
      item_id: "approval-one",
      transcript: "Yes, save that.",
    },
    {
      type: "response.function_call_arguments.done",
      name: "confirm_plan",
      call_id: "approved-confirmation",
      arguments: JSON.stringify({ proposal_id: proposalId }),
    },
  );
  await expect.poll(() => requests.saves.length).toBe(1);
  expect(requests.saves[0]).toEqual({
    p_goals: ["Read before bed"],
    p_checkin_time: "20:30",
    p_checkin_days: [1, 3, 5],
    p_timezone: "America/New_York",
  });
  await expect(
    page.getByRole("button", { name: "Save this plan", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "My plan", exact: true }).click();
  await expect(page.getByLabel("Your goals", { exact: true })).toHaveValue(
    "Read before bed",
  );
  await expect(
    page.getByLabel("Your check-in time", { exact: true }),
  ).toHaveValue("8:30 PM");
  expect(
    await page.evaluate(() => (window as any).__voiceTest.stoppedTracks),
  ).toBe(1);
  await expect.poll(() => requests.finishes.length).toBe(1);
});

test("an unavailable voice endpoint shows an honest error and stops microphone capture", async ({
  page,
}) => {
  await installMedia(page);
  const requests = await installBackend(page, 404);
  await signIn(page);
  await page.getByRole("button", { name: "Let’s talk", exact: true }).click();
  await expect(
    page.getByText(
      "Voice is still being connected. Please try again shortly, or send a message instead.",
      { exact: true },
    ),
  ).toBeVisible();
  expect(
    await page.evaluate(() => (window as any).__voiceTest.stoppedTracks),
  ).toBe(1);
  expect(requests.sdps).toHaveLength(0);
  await expect(
    page.getByRole("button", { name: "End conversation", exact: true }),
  ).toHaveCount(0);
  await expect(page.locator("audio")).toHaveCount(0);
});

test("switching accounts ends an active conversation and discards the previous account's proposal", async ({
  page,
}) => {
  await installMedia(page);
  const requests = await installBackend(page);
  await signIn(page);
  await page.getByRole("button", { name: "Let’s talk", exact: true }).click();
  await expect(page.getByText("I’m listening", { exact: true })).toBeVisible();
  await emit(
    page,
    { type: "input_audio_buffer.speech_started", item_id: "private-turn" },
    {
      type: "conversation.item.input_audio_transcription.completed",
      item_id: "private-turn",
      transcript: "My private goal is to make more time for my family.",
    },
    { type: "response.done", response: { status: "completed" } },
    {
      type: "response.function_call_arguments.done",
      name: "propose_plan",
      call_id: "private-proposal",
      arguments: JSON.stringify({
        goals: ["Make time for my family"],
        checkin_time: "20:30",
        checkin_days: [1, 3, 5],
      }),
    },
  );
  await expect(
    page.getByRole("button", { name: "Save this plan", exact: true }),
  ).toBeVisible();
  // Supabase propagates sign-ins from another tab through this same channel.
  // There is deliberately no intermediate SIGNED_OUT event.
  await page.evaluate(() => {
    const key = Object.keys(localStorage).find((key) =>
      /^sb-.*-auth-token$/.test(key),
    );
    if (!key) throw new Error("No persisted auth session found");
    const session = JSON.parse(localStorage.getItem(key)!);
    const nextId = "34de393c-c702-4670-a6bf-1ee9dbf1d55e";
    const payload = {
      sub: nextId,
      role: "authenticated",
      exp: Math.floor(Date.now() / 1000) + 3600,
    };
    session.access_token = `${btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }))}.${btoa(JSON.stringify(payload))}.second-test-signature`;
    session.user = {
      ...session.user,
      id: nextId,
      email: "another-account@example.com",
    };
    localStorage.setItem(key, JSON.stringify(session));
    const channel = new BroadcastChannel(key);
    channel.postMessage({ event: "SIGNED_IN", session });
    setTimeout(() => channel.close(), 100);
  });
  await expect(
    page.getByRole("button", { name: "Let’s talk", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "End conversation", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Save this plan", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText("My private goal is to make more time for my family.", {
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(page.locator("audio")).toHaveCount(0);
  expect(
    await page.evaluate(() => (window as any).__voiceTest.stoppedTracks),
  ).toBe(1);
  expect(requests.saves).toHaveLength(0);
  expect(requests.finishes).toHaveLength(0);
});
