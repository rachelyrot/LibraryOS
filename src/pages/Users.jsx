import { useEffect, useState } from 'react';
import { base44, supabase } from '@/api/base44Client';
import { UserPlus, RefreshCw, ShieldAlert, KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import PageHeader from '@/components/PageHeader';
import { toast } from 'sonner';
import { canManageUsers, ROLE_DISPLAY_NAMES, getRoleDisplayName } from '@/lib/permissions';
import { resetPasswordUrl } from '@/lib/appUrl';

const EMPTY = { full_name: '', email: '', password: '', role: 'user' };

// Only used by the manual fallback, for when the invite mail doesn't arrive.
function generatePassword() {
  const chars = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from(crypto.getRandomValues(new Uint32Array(12)))
    .map(n => chars[n % chars.length])
    .join('');
}

// supabase.functions.invoke reports a non-2xx as `error` with the body left
// unparsed, so the function's Hebrew message has to be dug out of error.context.
async function callAdminUsers(body) {
  const { data, error } = await supabase.functions.invoke('admin-users', { body });
  if (error) {
    let message = error.message;
    try {
      const parsed = await error.context?.json();
      if (parsed?.error) message = parsed.error;
    } catch {
      // Non-JSON response (network/platform level) — keep the generic message.
    }
    throw new Error(message);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

export default function Users() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [userLoaded, setUserLoaded] = useState(false);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [savingRoleFor, setSavingRoleFor] = useState(null);
  const [resettingFor, setResettingFor] = useState(null);
  // Email invite is the default; the manual-password path stays available for
  // when mail delivery fails.
  const [byEmail, setByEmail] = useState(true);

  const isAdmin = canManageUsers(user);

  const load = async () => {
    setLoading(true);
    try {
      const data = await callAdminUsers({ action: 'list' });
      setUsers(data.users || []);
    } catch (error) {
      toast.error(error.message || 'שגיאה בטעינת המשתמשים');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    base44.auth.me()
      .then(setUser)
      .catch(() => {})
      .finally(() => setUserLoaded(true));
  }, []);

  useEffect(() => {
    if (isAdmin) load();
    else if (userLoaded) setLoading(false);
  }, [isAdmin, userLoaded]);

  const openNew = () => { setForm({ ...EMPTY, password: generatePassword() }); setByEmail(true); setOpen(true); };

  const save = async () => {
    if (!canManageUsers(user)) return;
    if (!form.full_name.trim()) { toast.error('יש להזין שם מלא'); return; }
    if (!form.email.trim()) { toast.error('יש להזין אימייל'); return; }
    if (!byEmail && form.password.length < 6) { toast.error('הסיסמה חייבת להכיל לפחות 6 תווים'); return; }

    setSaving(true);
    try {
      if (byEmail) {
        await callAdminUsers({
          action: 'invite',
          full_name: form.full_name,
          email: form.email,
          role: form.role,
          redirect_to: resetPasswordUrl(),
        });
        toast.success('ההזמנה נשלחה במייל.');
      } else {
        await callAdminUsers({ action: 'create', ...form });
        toast.success('המשתמש/ת נוצר/ה. יש למסור את הסיסמה באופן אישי.');
      }
      setOpen(false);
      load();
    } catch (error) {
      toast.error(error.message || 'שגיאה ביצירת המשתמש');
    } finally {
      setSaving(false);
    }
  };

  // Goes straight through supabase-js rather than the Edge Function: any client
  // may request a reset for any address, so no elevated privileges are involved.
  const sendReset = async (targetUser) => {
    setResettingFor(targetUser.id);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(targetUser.email, {
        redirectTo: resetPasswordUrl(),
      });
      if (error) throw error;
      toast.success(`נשלח קישור לאיפוס סיסמה אל ${targetUser.email}`);
    } catch (error) {
      toast.error(error.message || 'שגיאה בשליחת הקישור');
    } finally {
      setResettingFor(null);
    }
  };

  const changeRole = async (targetUser, role) => {
    if (!canManageUsers(user)) return;
    setSavingRoleFor(targetUser.id);
    try {
      await callAdminUsers({ action: 'set_role', user_id: targetUser.id, role });
      setUsers(list => list.map(u => (u.id === targetUser.id ? { ...u, role } : u)));
      toast.success(`התפקיד של ${targetUser.full_name || targetUser.email} עודכן`);
    } catch (error) {
      toast.error(error.message || 'שגיאה בעדכון התפקיד');
    } finally {
      setSavingRoleFor(null);
    }
  };

  if (!userLoaded || loading) {
    return <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" /></div>;
  }

  if (!isAdmin) {
    return (
      <div className="p-6 max-w-3xl mx-auto" dir="rtl">
        <div className="flex items-center gap-3 p-4 border border-amber-200 bg-amber-50 rounded-xl text-amber-900">
          <ShieldAlert className="w-5 h-5 shrink-0" />
          <span className="text-sm">ניהול משתמשים זמין למנהלת המערכת בלבד.</span>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto animate-fade-in" dir="rtl">
      <PageHeader
        title="משתמשים"
        subtitle="הרשמה עצמית סגורה — חשבונות נוצרים כאן בלבד"
        actions={
          <>
            <Button variant="outline" size="icon" onClick={load} title="רענון">
              <RefreshCw className="w-4 h-4" />
            </Button>
            <Button onClick={openNew} className="gap-2 bg-gradient-to-l from-purple-400 to-indigo-500 text-white border-0 hover:opacity-90">
              <UserPlus className="w-4 h-4" /> הוספת משתמש/ת
            </Button>
          </>
        }
      />

      <div className="border border-border rounded-xl overflow-hidden bg-card">
        <div className="grid grid-cols-[1.3fr_1.5fr_1fr_auto] gap-3 px-4 py-2.5 bg-muted/50 border-b border-border text-xs font-semibold text-muted-foreground">
          <span>שם מלא</span>
          <span>אימייל</span>
          <span>תפקיד</span>
          <span className="w-9" />
        </div>

        {users.length === 0 ? (
          <div className="px-4 py-6 text-sm text-muted-foreground">אין משתמשים להצגה</div>
        ) : (
          users.map(u => (
            <div key={u.id} className="grid grid-cols-[1.3fr_1.5fr_1fr_auto] gap-3 items-center px-4 py-2.5 border-b border-border/40 last:border-b-0">
              <span className="text-sm font-medium truncate">
                {u.full_name || <span className="text-muted-foreground">ללא שם</span>}
                {u.id === user?.id && <span className="text-xs text-muted-foreground mr-1">(את/ה)</span>}
              </span>
              <span className="text-sm text-muted-foreground truncate">{u.email}</span>
              {u.id === user?.id ? (
                // Self-demotion is blocked in the Edge Function too — a lone admin
                // dropping their own role would lock this screen for everyone.
                <span className="text-sm">{getRoleDisplayName(u.role)}</span>
              ) : (
                <Select value={u.role} onValueChange={v => changeRole(u, v)} disabled={savingRoleFor === u.id}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(ROLE_DISPLAY_NAMES).map(([value, label]) => (
                      <SelectItem key={value} value={value}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                disabled={resettingFor === u.id}
                onClick={() => sendReset(u)}
                title="שליחת קישור לאיפוס סיסמה"
              >
                <KeyRound className="w-3.5 h-3.5" />
              </Button>
            </div>
          ))
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md font-heebo" dir="rtl">
          <DialogHeader>
            <DialogTitle>הוספת משתמש/ת</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>שם מלא *</Label>
              <Input value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} placeholder="שם מלא" />
            </div>

            <div className="space-y-1.5">
              <Label>אימייל *</Label>
              <Input type="email" dir="ltr" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="name@example.com" />
            </div>

            <div className="space-y-1.5">
              <Label>אופן קביעת הסיסמה</Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={byEmail ? 'default' : 'outline'}
                  className="flex-1"
                  onClick={() => setByEmail(true)}
                >
                  הזמנה במייל
                </Button>
                <Button
                  type="button"
                  variant={byEmail ? 'outline' : 'default'}
                  className="flex-1"
                  onClick={() => setByEmail(false)}
                >
                  סיסמה ידנית
                </Button>
              </div>
            </div>

            {byEmail ? (
              <p className="text-xs text-muted-foreground">
                יישלח מייל עם קישור, והמשתמש/ת תקבע סיסמה בעצמה. אם המייל לא מגיע — אפשר לעבור ל&quot;סיסמה ידנית&quot;.
              </p>
            ) : (
              <div className="space-y-1.5">
                <Label>סיסמה התחלתית *</Label>
                <div className="flex gap-2">
                  <Input dir="ltr" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} minLength={6} />
                  <Button type="button" variant="outline" onClick={() => setForm(f => ({ ...f, password: generatePassword() }))}>
                    הגרלה
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">לא יישלח מייל. יש להעתיק את הסיסמה ולמסור אותה למשתמש/ת.</p>
              </div>
            )}

            <div className="space-y-1.5">
              <Label>תפקיד</Label>
              <Select value={form.role} onValueChange={v => setForm(f => ({ ...f, role: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(ROLE_DISPLAY_NAMES).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>ביטול</Button>
            <Button onClick={save} disabled={saving} className="bg-gradient-to-l from-purple-400 to-indigo-500 text-white border-0 hover:opacity-90">
              {saving ? 'רגע...' : 'יצירה'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
