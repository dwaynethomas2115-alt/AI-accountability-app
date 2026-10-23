-- First enable pg_cron, pg_net and Vault in Supabase, then securely populate
-- Vault entries kindred_worker_url and kindred_worker_secret using the dashboard.
-- No secret values belong in this file or source control.
do $$
begin
 if not exists(select 1 from vault.decrypted_secrets where name='kindred_worker_url')
 or not exists(select 1 from vault.decrypted_secrets where name='kindred_worker_secret') then
 raise exception 'Create both Kindred Vault entries before scheduling'; end if;
 perform cron.unschedule(jobid) from cron.job where jobname='kindred-minute';
 perform cron.schedule('kindred-minute','* * * * *',$job$
 select net.http_post(
   url := (select decrypted_secret from vault.decrypted_secrets where name='kindred_worker_url'),
   headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='kindred_worker_secret')),
   body := '{}'::jsonb,
   timeout_milliseconds := 60000
 );
 $job$);
end $$;
