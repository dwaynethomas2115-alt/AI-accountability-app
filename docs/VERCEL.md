# Deploy Kindred to Vercel

Vercel hosts the Expo web app. Supabase continues to run authentication, PostgreSQL, and the chat/reminder functions. The OpenAI key remains in Supabase Secrets.

1. Open https://vercel.com/new, connect GitHub, and import `dwaynethomas2115-alt/AI-accountability-app`.
2. Use the repository root. Framework preset: **Other**. The checked-in `vercel.json` sets install command `npm ci`, build command `npm run build:vercel`, and output directory `dist`. Choose **Node.js 24.x** in Vercel's project settings.
3. Under Environment Variables, add these for Production and Preview:

   | Name | Value |
   | --- | --- |
   | `EXPO_PUBLIC_SUPABASE_URL` | `https://xkxbvanspfaxxggqhteu.supabase.co` |
   | `EXPO_PUBLIC_SUPABASE_ANON_KEY` | The Supabase project's public `sb_publishable_…` key supplied during setup |

   Do not add `OPENAI_API_KEY` or `SUPABASE_SERVICE_ROLE_KEY` to the web project. `EXPO_PUBLIC_EAS_PROJECT_ID` is only needed for native push; web push is not implemented.
4. Click **Deploy**. The build refuses missing public Supabase settings, so a production deployment cannot silently use demo mode. Public variables are embedded in the browser bundle; they are not secrets.
5. In Supabase → Authentication → URL Configuration, set **Site URL** to the Vercel production HTTPS URL. Add exact allowed redirect URLs for environments you use. The current app uses email/password authentication and a confirmation email followed by returning to sign in.

After connecting Vercel to the repository, pushes to `main` automatically build production deployments. Pull requests can create preview deployments. Environment-variable changes require a new deployment because Expo embeds values during build.

## Verify the live app

Open the production URL on a phone-sized browser. Create an account, confirm the email, sign in, create a goal, and send a message to Kindred. Check that goals persist after reload and a real assistant reply appears. Confirm a calendar card before expecting an event to exist. The explicitly labeled local demo remains available for sample-only use.

A successful Vercel build verifies hosting, not an OpenAI response or device push delivery. Push reminders require native builds and the backend worker setup described in DEPLOYMENT.md.

## Local production-build equivalent

With the public values set in `.env`:

```sh
node --env-file=.env scripts/check-web-env.mjs
npm run build:web
```

Never commit `.env`, `.vercel/`, or service credentials. `vercel.json` includes SPA fallback routing so direct visits and refreshes return the web application; assets are served from the build output.
