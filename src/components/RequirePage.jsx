import { useLocation, Link } from 'react-router-dom';
import { ShieldOff, ArrowLeft } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { canAccessPage, landingPage } from '@/lib/permissions';

/**
 * Route-level access gate.
 *
 * Layout.jsx already hides nav items the current role can't use, but hiding a
 * link is not blocking a page — the URL stays typeable, and every route in this
 * app is a plain client-side render with no server round-trip to refuse it.
 * This wraps each route so the page component never mounts (and therefore never
 * fires its data-loading useEffect) for a role that shouldn't reach it.
 *
 * Both the menu and this guard read the same PAGE_ACCESS table in
 * permissions.js, so the two can't drift apart.
 */
export default function RequirePage({ children }) {
  const { user } = useAuth();
  const { pathname } = useLocation();

  if (!user) return null;
  if (canAccessPage(user, pathname)) return children;

  const home = landingPage(user);

  return (
    <div className="p-6 max-w-2xl mx-auto" dir="rtl">
      <div className="bg-card border border-border rounded-2xl p-10 text-center mt-12">
        <div className="w-14 h-14 rounded-2xl bg-rose-50 flex items-center justify-center mx-auto mb-4">
          <ShieldOff className="w-7 h-7 text-rose-500" />
        </div>
        <h1 className="text-xl font-bold text-foreground">אין לך הרשאה לעמוד הזה</h1>
        <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
          העמוד הזה סגור לתפקיד שלך במערכת.
          <br />
          אם את צריכה גישה אליו, פני למנהלת המערכת.
        </p>
        <Link
          to={home}
          className="inline-flex items-center gap-2 mt-6 px-4 py-2 rounded-xl bg-gradient-to-l from-purple-500 to-blue-500 text-white text-sm font-medium hover:opacity-90 transition-opacity"
        >
          <ArrowLeft className="w-4 h-4" />
          חזרה לעמוד הראשי
        </Link>
      </div>
    </div>
  );
}
