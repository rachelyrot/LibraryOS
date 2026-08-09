// LibraryOS — admin-users Edge Function
//
// The only server-side code in this repo besides the plpgsql functions in
// supabase/migrations/. It exists for exactly one reason: creating auth users and
// assigning roles requires the `service_role` key, which must never reach the
// browser. Everything else in the app talks to Postgres directly under RLS.
//
// Registration model (see .claude/plans/user-registration.md):
//   - Self-service signup is disabled at the project level (Dashboard → Auth →
//     Sign In / Providers → "Allow new users to sign up" = off). Removing the
//     signup form from Login.jsx alone did NOT close that hole — the anon key is
//     public, so /auth/v1/signup stayed reachable.
//   - `invite` is the normal path: the person gets an email and sets their own
//     password. It requires custom SMTP to be configured on the project —
//     Supabase's built-in mailer is capped at 2 messages/hour AND refuses to
//     deliver to addresses outside the project team, so it cannot invite staff.
//   - `create` is the fallback: the admin sets an initial password and hands it
//     over directly. Kept for when mail doesn't arrive at all.
//   - Both still work while signup is disabled, because service_role bypasses
//     that restriction.
//
// Deploy: either paste this file into Dashboard → Edge Functions → Deploy a new
// function (no tooling required), or `npx supabase functions deploy admin-users`.
// Unlike the migrations in this project, it cannot be applied from the SQL Editor.

import { createClient } from 'jsr:@supabase/supabase-js@2';

// Must stay in sync with the profiles.role check constraint
// (supabase/migrations/0001_init_schema.sql) and ROLES in src/lib/permissions.js.
const VALID_ROLES = ['admin', 'remote_manager', 'local_manager', 'user'];

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are injected automatically into the
// Edge Functions runtime — they are not part of .env.local and must never be
// referenced from client code.
const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const PROFILE_FIELDS = 'id, email, full_name, role, created_date';

// Shared tail of `create` and `invite`. By the time this runs the
// on_auth_user_created trigger has already inserted the profiles row (role
// hardcoded to 'user', full_name taken from user_metadata), so the requested
// role is applied as a follow-up update.
//
// This relies on the protect_profile_role trigger allowing the change: it only
// blocks when auth.uid() is not null, and a service_role JWT carries no `sub`
// claim. If that ever stops holding, the role would silently revert to 'user' —
// hence the read-back and the explicit mismatch error instead of a quiet failure.
async function applyRole(userId: string, role: string) {
  if (role === 'user') {
    const { data, error } = await admin
      .from('profiles').select(PROFILE_FIELDS).eq('id', userId).single();
    if (error) throw error;
    return { profile: data, mismatch: false };
  }

  const { data, error } = await admin
    .from('profiles').update({ role }).eq('id', userId).select(PROFILE_FIELDS).single();
  if (error) throw error;
  return { profile: data, mismatch: data.role !== role };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    // ── Authorize ────────────────────────────────────────────────────────────
    // The caller's identity comes from their JWT and nothing else — never from
    // the request body. This is the real enforcement layer; the UI gate in
    // Users.jsx only hides controls.
    const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
    if (!token) return json({ error: 'Missing Authorization header' }, 401);

    const { data: { user: caller }, error: callerError } = await admin.auth.getUser(token);
    if (callerError || !caller) return json({ error: 'Invalid session' }, 401);

    const { data: callerProfile, error: profileError } = await admin
      .from('profiles')
      .select('role')
      .eq('id', caller.id)
      .maybeSingle();
    if (profileError) throw profileError;

    if (callerProfile?.role !== 'admin') {
      return json({ error: 'אין לך הרשאה לנהל משתמשים' }, 403);
    }

    const { action, ...payload } = await req.json();

    // ── list ─────────────────────────────────────────────────────────────────
    if (action === 'list') {
      const { data, error } = await admin
        .from('profiles')
        .select('id, email, full_name, role, created_date')
        .order('created_date', { ascending: false });
      if (error) throw error;
      return json({ users: data });
    }

    // ── invite / create ──────────────────────────────────────────────────────
    // Same shape, two ways of handing over the first password: `invite` mails a
    // link and lets the person choose one, `create` sets one the admin dictates.
    if (action === 'invite' || action === 'create') {
      const email = String(payload.email ?? '').trim();
      const fullName = String(payload.full_name ?? '').trim();
      const role = String(payload.role ?? 'user');

      if (!email) return json({ error: 'חסר אימייל' }, 400);
      if (!fullName) return json({ error: 'חסר שם מלא' }, 400);
      if (!VALID_ROLES.includes(role)) return json({ error: 'תפקיד לא חוקי' }, 400);

      let userId: string;

      if (action === 'invite') {
        // redirectTo must also appear in the project's redirect allow-list
        // (Dashboard → Authentication → URL Configuration) or Supabase drops it
        // and falls back to the Site URL.
        const redirectTo = String(payload.redirect_to ?? '') || undefined;

        const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(
          email,
          { data: { full_name: fullName }, redirectTo },
        );
        if (inviteError) {
          const alreadyExists = /already|exists|registered/i.test(inviteError.message);
          if (alreadyExists) return json({ error: 'קיים כבר משתמש עם האימייל הזה' }, 409);
          // Almost always a missing/misconfigured SMTP setup — the built-in
          // mailer refuses non-team addresses, so say so instead of leaking a
          // raw provider error.
          return json({
            error: `שליחת ההזמנה נכשלה: ${inviteError.message}. אם לא הוגדר SMTP חיצוני בפרויקט, יש ליצור את המשתמש/ת עם סיסמה ידנית.`,
          }, 502);
        }
        userId = invited.user.id;
      } else {
        const password = String(payload.password ?? '');
        // Matches the minLength on the Login.jsx password field.
        if (password.length < 6) return json({ error: 'הסיסמה חייבת להכיל לפחות 6 תווים' }, 400);

        // email_confirm: true — this path deliberately sends no mail at all, so
        // the account has to be usable immediately.
        const { data: created, error: createError } = await admin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { full_name: fullName },
        });
        if (createError) {
          const alreadyExists = /already|exists|registered/i.test(createError.message);
          return json(
            { error: alreadyExists ? 'קיים כבר משתמש עם האימייל הזה' : createError.message },
            alreadyExists ? 409 : 400,
          );
        }
        userId = created.user.id;
      }

      const { profile, mismatch } = await applyRole(userId, role);
      if (mismatch) {
        return json({
          error: `המשתמש נוצר אך התפקיד נשאר "${profile.role}". יש לעדכן אותו ידנית ב-Supabase Studio.`,
          user: profile,
        }, 500);
      }

      return json({ user: profile });
    }

    // ── set_role ─────────────────────────────────────────────────────────────
    if (action === 'set_role') {
      const userId = String(payload.user_id ?? '');
      const role = String(payload.role ?? '');

      if (!userId) return json({ error: 'חסר מזהה משתמש' }, 400);
      if (!VALID_ROLES.includes(role)) return json({ error: 'תפקיד לא חוקי' }, 400);
      // Without this an admin could demote themselves and, if they are the only
      // admin, lock everyone out of this screen permanently.
      if (userId === caller.id) return json({ error: 'אי אפשר לשנות את התפקיד של עצמך' }, 400);

      const { data: updated, error } = await admin
        .from('profiles')
        .update({ role })
        .eq('id', userId)
        .select('id, email, full_name, role, created_date')
        .single();
      if (error) throw error;

      if (updated.role !== role) {
        return json({
          error: `התפקיד לא השתנה ונשאר "${updated.role}". יש לעדכן אותו ידנית ב-Supabase Studio.`,
          user: updated,
        }, 500);
      }

      return json({ user: updated });
    }

    return json({ error: `פעולה לא מוכרת: ${action}` }, 400);
  } catch (error) {
    console.error('admin-users failed:', error);
    return json({ error: (error as Error).message ?? 'Unexpected error' }, 500);
  }
});
