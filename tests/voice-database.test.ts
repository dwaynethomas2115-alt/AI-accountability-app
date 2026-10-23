import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import {
  normalizePlan,
  nextCheckin,
  describeCheckinDays,
  formatCheckinTime,
} from "../src/lib/plan.ts";

const a = "11111111-1111-4111-8111-111111111111";
const b = "22222222-2222-4222-8222-222222222222";
const migration = readFileSync(
  new URL(
    "../supabase/migrations/202610230001_voice_plan.sql",
    import.meta.url,
  ),
  "utf8",
);
async function database() {
  const db = new PGlite();
  await db.exec(
    `create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$; grant usage on schema public,auth to anon,authenticated,service_role; grant execute on function auth.uid() to authenticated; insert into auth.users values('${a}'),('${b}');
     alter default privileges in schema public grant all on tables to anon,authenticated,service_role;
     alter default privileges in schema public grant all on functions to anon,authenticated,service_role;`,
  );
  await db.exec(
    readFileSync(
      new URL(
        "../supabase/migrations/202610200001_initial.sql",
        import.meta.url,
      ),
      "utf8",
    ).replace("create extension if not exists pgcrypto;", ""),
  );
  await db.exec(migration);
  return db;
}
async function asUser(db: PGlite, user: string) {
  await db.exec(
    `set role authenticated; select set_config('request.jwt.claim.sub','${user}',false);`,
  );
}

test("simple plan save is atomic, retains progress, pauses removed goals and isolates users", async () => {
  const db = await database();
  try {
    await db.exec(
      `insert into profiles(user_id,display_name,checkins_enabled) values('${a}','Dwayne',true); insert into goals(user_id,title) values('${a}','Read'),('${a}','Walk'),('${b}','Private goal');`,
    );
    const original = await db.query<{ id: string }>(
      `select id from goals where user_id='${a}' and title='Read'`,
    );
    await db.exec(
      `insert into completions(user_id,goal_id,local_date) values('${a}','${original.rows[0]!.id}',current_date)`,
    );
    await asUser(db, a);
    await db.exec(
      `select save_companion_plan(array[' Read ','Sleep earlier'],'19:15',array[5,1,3],'America/Whitehorse')`,
    );
    const profile = (
      await db.query<{
        display_name: string;
        checkin_days: number[];
        checkin_time: string;
        checkins_enabled: boolean;
      }>("select * from profiles")
    ).rows[0]!;
    assert.equal(profile.display_name, "Dwayne");
    assert.deepEqual(profile.checkin_days, [1, 3, 5]);
    assert.equal(profile.checkin_time, "19:15:00");
    assert.equal(profile.checkins_enabled, true);
    assert.equal(
      (
        await db.query<{ id: string }>(
          "select id from goals where title='Read'",
        )
      ).rows[0]!.id,
      original.rows[0]!.id,
    );
    assert.equal((await db.query("select * from completions")).rows.length, 1);
    assert.equal(
      (
        await db.query<{ status: string }>(
          "select status from goals where title='Walk'",
        )
      ).rows[0]!.status,
      "paused",
    );
    await db.exec(
      `select save_companion_plan(array['Walk'],'08:00',array[1],'UTC')`,
    );
    assert.equal(
      (
        await db.query<{ status: string }>(
          "select status from goals where title='Walk'",
        )
      ).rows[0]!.status,
      "active",
    );
    assert.equal((await db.query("select * from goals")).rows.length, 3);
    await asUser(db, b);
    assert.equal(
      (await db.query<{ title: string }>("select title from goals")).rows[0]!
        .title,
      "Private goal",
    );
    assert.equal((await db.query("select * from profiles")).rows.length, 0);
    await assert.rejects(
      db.exec(
        `select save_companion_plan(array['New'], '08:00',array[8], 'UTC')`,
      ),
    );
    assert.equal((await db.query("select * from profiles")).rows.length, 0);
  } finally {
    await db.close();
  }
});

test("plan RPC rejects unauthenticated, malformed and duplicate input; migration can be rerun", async () => {
  const db = await database();
  try {
    await db.exec(migration);
    await asUser(db, "");
    await assert.rejects(
      db.exec(
        "select save_companion_plan(array['Walk'],'18:00',array[1],'UTC')",
      ),
    );
    await asUser(db, a);
    for (const [goals, time, days, zone] of [
      ["array[]::text[]", "18:00", "array[1]", "UTC"],
      ["array['Walk',' walk ']", "18:00", "array[1]", "UTC"],
      ["array['Walk']", "24:00", "array[1]", "UTC"],
      ["array['Walk']", "18:00", "array[]::integer[]", "UTC"],
      ["array['Walk']", "18:00", "array[1,1]", "UTC"],
      ["array['Walk']", "18:00", "array[1]", "Imaginary/Timezone"],
    ])
      await assert.rejects(
        db.exec(
          `select save_companion_plan(${goals},'${time}',${days},'${zone}')`,
        ),
      );
    await db.exec(
      "select save_companion_plan(array['Walk'],'18:00',array[0,6],'UTC')",
    );
    const profile = (
      await db.query<{
        display_name: string;
        checkins_enabled: boolean;
        onboarded: boolean;
      }>("select * from profiles")
    ).rows[0]!;
    assert.equal(profile.display_name, "friend");
    assert.equal(profile.checkins_enabled, false);
    assert.equal(profile.onboarded, true);
    await assert.rejects(
      db.exec(
        `update profiles set checkin_days=array[1,1]::smallint[] where user_id='${a}'`,
      ),
    );
  } finally {
    await db.close();
  }
});

test("voice sessions remain private under permissive default grants; only the service can issue sessions or erase rate limits", async () => {
  const db = await database();
  try {
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`set role ${role}`);
      for (const statement of [
        `truncate voice_sessions`,
        `truncate voice_requests`,
        `select claim_voice_session('${a}','${crypto.randomUUID()}')`,
        `select claim_chat('${a}','${crypto.randomUUID()}')`,
        `select * from claim_notifications(1)`,
      ]) {
        await assert.rejects(db.exec(statement), /permission denied/);
      }
    }
    await db.exec("set role anon");
    await assert.rejects(
      db.exec("select * from voice_sessions"),
      /permission denied/,
    );
    await assert.rejects(
      db.exec("select * from voice_requests"),
      /permission denied/,
    );
    await assert.rejects(
      db.exec(
        "select save_companion_plan(array['Walk'],'18:00',array[1],'UTC')",
      ),
      /permission denied/,
    );
    await asUser(db, a);
    await assert.rejects(
      db.exec(`select claim_voice_session('${a}','${crypto.randomUUID()}')`),
    );
    await assert.rejects(
      db.exec(
        `insert into voice_sessions(user_id,expires_at) values('${a}',now()+interval '30 minutes')`,
      ),
    );
    await db.exec("reset role;set role service_role");
    const first = crypto.randomUUID();
    assert.equal(
      (
        await db.query<{ claim_voice_session: boolean }>(
          `select claim_voice_session('${a}','${first}')`,
        )
      ).rows[0]!.claim_voice_session,
      true,
    );
    assert.equal(
      (
        await db.query<{ claim_voice_session: boolean }>(
          `select claim_voice_session('${a}','${first}')`,
        )
      ).rows[0]!.claim_voice_session,
      false,
    );
    await db.exec(
      `select claim_voice_session('${a}','${crypto.randomUUID()}');select claim_voice_session('${a}','${crypto.randomUUID()}')`,
    );
    await asUser(db, b);
    assert.equal(
      (await db.query("select * from voice_sessions")).rows.length,
      0,
    );
    await db.exec(`delete from voice_sessions where id='${first}'`);
    await asUser(db, a);
    assert.equal(
      (await db.query("select * from voice_sessions")).rows.length,
      3,
    );
    await db.exec("delete from voice_sessions");
    await assert.rejects(db.exec("delete from voice_requests"));
    await db.exec("reset role;set role service_role");
    await assert.rejects(
      db.exec(`select claim_voice_session('${a}','${crypto.randomUUID()}')`),
    );
  } finally {
    await db.close();
  }
});

test("optional daily notification jobs follow selected weekdays and skip cancelled pending check-ins", async () => {
  const db = await database();
  try {
    await db.exec(
      `insert into profiles(user_id,display_name,checkins_enabled,checkin_time,quiet_start,quiet_end,checkin_days) values('${a}','A',true,'00:00','00:00','00:00',array[((extract(dow from now() at time zone 'UTC')::integer+1)%7)]::smallint[])`,
    );
    assert.equal(
      (await db.query("select * from claim_notifications(40)")).rows.length,
      0,
    );
    await db.exec(
      `update profiles set checkin_days=array[extract(dow from now() at time zone 'UTC')::smallint] where user_id='${a}'`,
    );
    assert.equal(
      (await db.query("select * from claim_notifications(40)")).rows.length,
      1,
    );
    await db.exec(
      `update notification_jobs set status='pending',locked_at=null where user_id='${a}';update profiles set checkin_days=array[((extract(dow from now() at time zone 'UTC')::integer+1)%7)]::smallint[] where user_id='${a}'`,
    );
    assert.equal(
      (await db.query("select * from claim_notifications(40)")).rows.length,
      0,
    );
    assert.equal(
      (
        await db.query<{ status: string }>(
          "select status from notification_jobs where kind='daily_checkin'",
        )
      ).rows[0]!.status,
      "skipped",
    );
  } finally {
    await db.close();
  }
});

test("next check-in uses the chosen local days and PostgreSQL-compatible DST behavior", () => {
  const base = normalizePlan({
    goals: [" Read "],
    checkin_time: "18:00:00",
    checkin_days: [5, 1, 3],
    timezone: "America/Whitehorse",
  });
  assert.deepEqual(base.goals, ["Read"]);
  assert.deepEqual(base.checkin_days, [1, 3, 5]);
  assert.equal(
    nextCheckin(base, new Date("2026-10-22T02:00:00Z")).toISOString(),
    "2026-10-24T01:00:00.000Z",
  );
  assert.equal(
    nextCheckin(
      {
        ...base,
        checkin_time: "02:30",
        checkin_days: [0],
        timezone: "America/New_York",
      },
      new Date("2026-03-08T06:00:00Z"),
    ).toISOString(),
    "2026-03-08T07:30:00.000Z",
  );
  assert.equal(
    nextCheckin(
      {
        ...base,
        checkin_time: "01:30",
        checkin_days: [0],
        timezone: "America/New_York",
      },
      new Date("2026-11-01T04:00:00Z"),
    ).toISOString(),
    "2026-11-01T06:30:00.000Z",
  );
  assert.equal(formatCheckinTime("18:00:00"), "6:00 PM");
  assert.equal(describeCheckinDays([0, 1, 2, 3, 4, 5, 6]), "Every day");
  assert.throws(
    () => normalizePlan({ ...base, checkin_days: [] }),
    /different days/,
  );
  assert.throws(
    () => normalizePlan({ ...base, checkin_time: "25:00" }),
    /HH:MM/,
  );
});
