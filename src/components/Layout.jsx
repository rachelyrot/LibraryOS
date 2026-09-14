import { Outlet, Link, useLocation } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import {
  LayoutDashboard, ShoppingCart, FileText, Package, BookOpen, CreditCard, Menu, X, LogOut, BookMarked, ChevronLeft, Building2, Settings as SettingsIcon, Users, FolderKanban, UserCog
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { canAccessPage, ROLE_DISPLAY_NAMES } from '@/lib/permissions';

// Visibility comes from PAGE_ACCESS in permissions.js, the same table App.jsx
// guards the routes with — so a hidden item is genuinely unreachable rather
// than just missing from the menu.
const navItems = [
  { to: '/', label: 'דשבורד', icon: LayoutDashboard, color: 'text-purple-400' },
  { to: '/orders', label: 'הזמנות רכש', icon: ShoppingCart, color: 'text-blue-400' },
  { to: '/quotes', label: 'הצעות מחיר', icon: FileText, color: 'text-teal-400' },
  { to: '/inventory', label: 'מלאי', icon: Package, color: 'text-orange-400' },
  { to: '/book-procurement', label: 'רכש ספרים', icon: BookMarked, color: 'text-pink-400' },
  { to: '/credits', label: 'מקורות תקציב', icon: CreditCard, color: 'text-green-400' },
  { to: '/suppliers', label: 'ספקים', icon: Building2, color: 'text-emerald-400' },
  { to: '/staff', label: 'כוח אדם', icon: Users, color: 'text-indigo-400' },
  { to: '/projects', label: 'ניהול פרויקטים', icon: FolderKanban, color: 'text-cyan-400' },
  { to: '/users', label: 'משתמשים', icon: UserCog, color: 'text-rose-400' },
  { to: '/settings', label: 'הגדרות', icon: SettingsIcon, color: 'text-purple-400' },
];

export default function Layout() {
  const location = useLocation();
  const [user, setUser] = useState(null);
  const [open, setOpen] = useState(true);

  useEffect(() => {
    base44.auth.me().then(setUser).catch(() => {});
  }, []);

  return (
    <div className="flex h-screen overflow-hidden bg-background font-heebo" dir="rtl">
      {/* Sidebar */}
      <aside className={cn(
        "flex flex-col bg-sidebar text-sidebar-foreground transition-all duration-300 shrink-0",
        open ? "w-60" : "w-16"
      )}>
        {/* Logo */}
        <div className="flex items-center justify-between px-4 py-5 border-b border-sidebar-border">
          {open && (
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center">
                <BookOpen className="w-4 h-4 text-white" />
              </div>
              <span className="font-bold text-white text-sm leading-tight">LibraryOS<br /><span className="text-sidebar-foreground/60 font-normal text-xs">ספרייה עירונית</span></span>
            </div>
          )}
          <button onClick={() => setOpen(!open)} className="p-1.5 rounded-lg hover:bg-sidebar-accent transition-colors text-sidebar-foreground/70 hover:text-white">
            {open ? <ChevronLeft className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-4 px-2 space-y-1">
          {navItems.filter(item => canAccessPage(user, item.to)).map(({ to, label, icon: Icon, color }) => {
            const active = location.pathname === to || (to !== '/' && location.pathname.startsWith(to));
            return (
              <Link
                key={to}
                to={to}
                title={!open ? label : undefined}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-150 group",
                  active
                    ? "bg-sidebar-accent text-white font-semibold shadow-sm"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-white"
                )}
              >
                <Icon className={cn("w-5 h-5 shrink-0", color)} />
                {open && <span className="text-sm">{label}</span>}
              </Link>
            );
          })}
        </nav>

        {/* User */}
        {user && (
          <div className="p-3 border-t border-sidebar-border">
            <div className={cn("flex items-center gap-3", !open && "justify-center")}>
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-pink-500 to-purple-500 flex items-center justify-center text-white text-xs font-bold shrink-0">
                {user.full_name?.[0] || '?'}
              </div>
              {open && (
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold text-white truncate">{user.full_name}</div>
                  <div className="text-xs text-sidebar-foreground/50">{ROLE_DISPLAY_NAMES[user.role] || 'משתמשת'}</div>
                </div>
              )}
              {open && (
                <button onClick={() => base44.auth.logout()} title="התנתק" className="p-1 hover:text-white text-sidebar-foreground/40 transition-colors">
                  <LogOut className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        )}
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}