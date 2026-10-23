// Expo embeds these PUBLIC settings at build time. Server secrets stay in Supabase.
const required = ['EXPO_PUBLIC_SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_ANON_KEY'];
const missing = required.filter(name => !process.env[name]?.trim());
if (missing.length) {
  console.error(`Add these public settings in Vercel → Settings → Environment Variables: ${missing.join(', ')}`);
  process.exit(1);
}
try {
  const url = new URL(process.env.EXPO_PUBLIC_SUPABASE_URL);
  if (url.protocol !== 'https:') throw new Error();
} catch {
  console.error('EXPO_PUBLIC_SUPABASE_URL must be a valid HTTPS project URL.');
  process.exit(1);
}
if (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY.startsWith('sb_secret_')) {
  console.error('Use the public publishable / anon key, never a Supabase secret key.');
  process.exit(1);
}
console.log('Vercel public app configuration is present.');
