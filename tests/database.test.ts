import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
const a = "11111111-1111-4111-8111-111111111111",
  b = "22222222-2222-4222-8222-222222222222";
async function database() {
  const db = new PGlite();
  await db.exec(
    `create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth to authenticated,service_role;grant execute on function auth.uid() to authenticated;insert into auth.users values('${a}'),('${b}');`,
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
  await db.exec(
    `insert into profiles(user_id,display_name,timezone,quiet_start,quiet_end) values('${a}','A','UTC','00:00','00:00'),('${b}','B','UTC','00:00','00:00');`,
  );
  return db;
}
async function asUser(db: PGlite, user: string) {
  await db.exec(
    `set role authenticated;select set_config('request.jwt.claim.sub','${user}',false);`,
  );
}
test("RLS isolates user data and prevents forged AI and cross-user completions", async () => {
  const db = await database();
  try {
    await asUser(db, a);
    const result = await db.query<{ id: string }>(
      `insert into goals(user_id,title) values('${a}','Walk') returning id`,
    );
    const id = result.rows[0]!.id;
    await assert.rejects(
      db.exec(`insert into goals(user_id,title) values('${b}','Wrong owner')`),
    );
    await assert.rejects(
      db.exec(
        `insert into messages(user_id,role,content) values('${a}','assistant','Forged')`,
      ),
    );
    await asUser(db, b);
    assert.equal((await db.query("select * from goals")).rows.length, 0);
    await assert.rejects(
      db.exec(
        `insert into completions(user_id,goal_id,local_date) values('${b}','${id}',current_date)`,
      ),
    );
    await assert.rejects(db.exec(`select * from claim_notifications(40)`));
    await asUser(db, a);
    await db.exec(
      `insert into completions(user_id,goal_id,local_date) values('${a}','${id}',current_date)`,
    );
    assert.equal((await db.query("select * from completions")).rows.length, 1);
  } finally {
    await db.close();
  }
});
test("confirmed event queues reminders; deletion cancels all jobs; duplicate proposal cannot save twice", async () => {
  const db = await database();
  try {
    const m = crypto.randomUUID();
    await db.exec(
      `insert into messages(id,user_id,role,content) values('${m}','${a}','assistant','Plan?')`,
    );
    await asUser(db, a);
    const r = await db.query<{ id: string }>(
      `insert into events(user_id,title,starts_at,timezone,post_checkin,source_message_id) values('${a}','Gym',now()+interval '2 hours','America/Whitehorse',true,'${m}') returning id`,
    );
    await assert.rejects(
      db.exec(
        `insert into events(user_id,title,starts_at,timezone,source_message_id) values('${a}','Gym',now()+interval '3 hours','UTC','${m}')`,
      ),
    );
    await db.exec("reset role");
    assert.equal(
      (await db.query("select * from notification_jobs")).rows.length,
      2,
    );
    await asUser(db, a);
    await db.exec(`delete from events where id='${r.rows[0]!.id}'`);
    await db.exec("reset role");
    assert.equal(
      (await db.query("select * from notification_jobs")).rows.length,
      0,
    );
  } finally {
    await db.close();
  }
});
test("worker enforces daily caps, quiet windows, opt-out, and rate limits", async () => {
  const db = await database();
  try {
    await db.exec(
      `update profiles set daily_limit=1 where user_id='${a}';insert into events(user_id,title,starts_at,timezone,reminder_minutes) values('${a}','One',now()+interval '10 minutes','UTC',30),('${a}','Two',now()+interval '10 minutes','UTC',30)`,
    );
    const claimed = await db.query("select * from claim_notifications(40)");
    assert.equal(claimed.rows.length, 1);
    assert.equal(
      (await db.query("select * from claim_notifications(40)")).rows.length,
      0,
    );
    await db.exec(
      `update profiles set quiet_start=(now()-interval '1 hour')::time,quiet_end=(now()+interval '1 hour')::time,daily_limit=5 where user_id='${a}'`,
    );
    assert.equal(
      (await db.query("select * from claim_notifications(40)")).rows.length,
      0,
    );
    await db.exec(
      `update profiles set quiet_start='00:00',quiet_end='00:00',checkins_enabled=true,checkin_time='00:00' where user_id='${b}'`,
    );
    assert.equal(
      (await db.query("select * from claim_notifications(40)")).rows.length,
      1,
    );
    assert.equal(
      (
        await db.query(
          `select * from notification_jobs where user_id='${b}' and kind='daily_checkin'`,
        )
      ).rows.length,
      1,
    );
    const request = crypto.randomUUID();
    assert.equal(
      (
        await db.query<{ claim_chat: boolean }>(
          `select claim_chat('${a}','${request}')`,
        )
      ).rows[0]!.claim_chat,
      true,
    );
    assert.equal(
      (
        await db.query<{ claim_chat: boolean }>(
          `select claim_chat('${a}','${request}')`,
        )
      ).rows[0]!.claim_chat,
      false,
    );
    for (let i = 0; i < 7; i++)
      await db.exec(`select claim_chat('${a}','${crypto.randomUUID()}')`);
    await assert.rejects(
      db.exec(`select claim_chat('${a}','${crypto.randomUUID()}')`),
    );
  } finally {
    await db.close();
  }
});

test("deleting a delivered event does not reset the daily notification cap", async () => {
  const db = await database();
  try {
    await db.exec(
      `update profiles set daily_limit=1 where user_id='${a}'; insert into events(user_id,title,starts_at,timezone,reminder_minutes) values('${a}','First',now()+interval '10 minutes','UTC',30)`,
    );
    const first = await db.query<{ id: string; event_id: string }>(
      "select * from claim_notifications(40)",
    );
    assert.equal(first.rows.length, 1);
    await db.exec(
      `update notification_jobs set status='sent',sent_at=now() where id='${first.rows[0]!.id}';delete from events where id='${first.rows[0]!.event_id}';insert into events(user_id,title,starts_at,timezone,reminder_minutes) values('${a}','Second',now()+interval '10 minutes','UTC',30)`,
    );
    assert.equal(
      (await db.query("select * from claim_notifications(40)")).rows.length,
      0,
    );
    assert.equal(
      (
        await db.query(
          "select * from notification_jobs where status='sent' and event_id is null",
        )
      ).rows.length,
      1,
    );
  } finally {
    await db.close();
  }
});
