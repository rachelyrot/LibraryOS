import { useEffect, useState } from 'react';
import { supabase } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { BookOpen, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

// Landing page for both flows that arrive by email:
//   - invite   (admin added a user from /users → they pick their first password)
//   - recovery ("שכחתי סיסמה" from the login screen)
// Both links carry tokens in the URL hash, which supabase-js consumes on load
// (detectSessionInUrl is on by default) and turns into a real session — so
// updateUser() below is authenticated. App.jsx routes here *before* the auth
// gate, since the visitor is mid-flow and shouldn't be bounced to the app.
export default function ResetPassword() {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [checking, setChecking] = useState(true);
  const [linkError, setLinkError] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    // An expired or already-used link comes back with the reason in the hash
    // rather than tokens, and no session is ever created.
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const hashError = hash.get('error_description') || hash.get('error');

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setLinkError('');
      else setLinkError(hashError || 'הקישור אינו תקף או שפג תוקפו.');
      setChecking(false);
    });

    // getSession can resolve before the hash tokens finish being exchanged.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) { setLinkError(''); setChecking(false); }
    });
    return () => subscription.unsubscribe();
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    if (password.length < 6) { toast.error('הסיסמה חייבת להכיל לפחות 6 תווים'); return; }
    if (password !== confirm) { toast.error('הסיסמאות אינן תואמות'); return; }

    setSubmitting(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setDone(true);
      toast.success('הסיסמה נקבעה בהצלחה');
      // Full reload so AuthContext re-reads the session and the app renders
      // normally instead of staying on this page.
      setTimeout(() => { window.location.href = '/'; }, 1200);
    } catch (error) {
      toast.error(error.message || 'שגיאה בקביעת הסיסמה');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-background font-heebo" dir="rtl">
      <div className="w-full max-w-sm p-8 bg-card border border-border rounded-2xl shadow-sm">
        <div className="flex flex-col items-center gap-2 mb-6">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center">
            <BookOpen className="w-5 h-5 text-white" />
          </div>
          <h1 className="text-lg font-bold">LibraryOS</h1>
          <p className="text-sm text-muted-foreground">קביעת סיסמה</p>
        </div>

        {checking ? (
          <div className="flex justify-center py-6">
            <div className="w-6 h-6 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
          </div>
        ) : linkError ? (
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-3 border border-amber-200 bg-amber-50 rounded-xl text-amber-900">
              <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
              <span className="text-sm">{linkError}</span>
            </div>
            <p className="text-xs text-muted-foreground">
              יש לבקש קישור חדש ממסך ההתחברות, או לפנות למנהלת המערכת.
            </p>
            <Button variant="outline" className="w-full" onClick={() => { window.location.href = '/'; }}>
              חזרה למסך ההתחברות
            </Button>
          </div>
        ) : done ? (
          <p className="text-sm text-center text-muted-foreground py-4">
            הסיסמה נקבעה. מעביר אותך למערכת...
          </p>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5">
              <Label>סיסמה חדשה</Label>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
            </div>
            <div className="space-y-1.5">
              <Label>אימות סיסמה</Label>
              <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required minLength={6} />
            </div>
            <Button type="submit" disabled={submitting} className="w-full bg-gradient-to-l from-purple-500 to-blue-500 text-white border-0 hover:opacity-90">
              {submitting ? 'רגע...' : 'שמירת סיסמה'}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
