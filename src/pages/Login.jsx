import { useState } from 'react';
import { supabase } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { BookOpen } from 'lucide-react';
import { toast } from 'sonner';

export default function Login() {
  const [mode, setMode] = useState('signin'); // 'signin' | 'signup'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: fullName } },
        });
        if (error) throw error;
        toast.success('נרשמת בהצלחה! אם נדרש אימות מייל, בדקי את תיבת הדואר שלך.');
      }
      // AuthContext listens to onAuthStateChange and will pick up the new session automatically.
    } catch (error) {
      toast.error(error.message || 'שגיאה בהתחברות');
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
          <p className="text-sm text-muted-foreground">
            {mode === 'signin' ? 'התחברות למערכת' : 'הרשמה למערכת'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'signup' && (
            <div className="space-y-1.5">
              <Label>שם מלא</Label>
              <Input value={fullName} onChange={(e) => setFullName(e.target.value)} required />
            </div>
          )}
          <div className="space-y-1.5">
            <Label>אימייל</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label>סיסמה</Label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
          </div>
          <Button type="submit" disabled={submitting} className="w-full bg-gradient-to-l from-purple-500 to-blue-500 text-white border-0 hover:opacity-90">
            {submitting ? 'רגע...' : mode === 'signin' ? 'התחברות' : 'הרשמה'}
          </Button>
        </form>

        <button
          type="button"
          onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
          className="w-full text-center text-sm text-muted-foreground hover:text-foreground mt-4 transition-colors"
        >
          {mode === 'signin' ? 'אין לך חשבון? הרשמה' : 'כבר יש לך חשבון? התחברות'}
        </button>
      </div>
    </div>
  );
}
