// Where invite / password-recovery emails send people back to.
//
// Defaults to the origin the app is currently served from. That is correct in
// production, but wrong when an admin invites someone while working on the dev
// server — the recipient gets a localhost link they cannot open on their own
// machine. Set VITE_APP_URL in .env.local to the production URL so invites sent
// from localhost still point at production; leave it unset to exercise the flow
// locally.
//
// Whatever this resolves to must also be listed in Supabase under
// Authentication → URL Configuration → Redirect URLs, or Supabase discards it
// and silently substitutes the project's Site URL.
export function resetPasswordUrl() {
  const base = import.meta.env.VITE_APP_URL || window.location.origin;
  return `${base.replace(/\/+$/, '')}/reset-password`;
}
