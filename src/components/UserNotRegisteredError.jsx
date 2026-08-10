import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { supabase } from '@/api/base44Client';
import { Button } from '@/components/ui/button';

// Shown when there is a valid Supabase session but no matching `profiles` row.
// Normally impossible (the handle_new_user trigger creates one), so this is the
// defensive path — e.g. a profile row deleted by hand in Studio.
const UserNotRegisteredError = () => {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-background font-heebo" dir="rtl">
      <div className="w-full max-w-md p-8 bg-card border border-border rounded-2xl shadow-sm">
        <div className="flex flex-col items-center text-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center">
            <AlertTriangle className="w-6 h-6 text-amber-600" />
          </div>
          <h1 className="text-xl font-bold">אין הרשאת גישה</h1>
          <p className="text-sm text-muted-foreground">
            החשבון שלך מחובר, אך אינו רשום למערכת. יש לפנות למנהלת המערכת כדי לקבל גישה.
          </p>
        </div>

        <div className="p-4 bg-muted/50 rounded-xl text-sm text-muted-foreground">
          <p className="mb-2">אם נראה לך שזו טעות, אפשר:</p>
          <ul className="list-disc list-inside space-y-1">
            <li>לוודא שההתחברות בוצעה עם החשבון הנכון</li>
            <li>לפנות למנהלת המערכת לקבלת גישה</li>
            <li>להתנתק ולהתחבר מחדש</li>
          </ul>
        </div>

        <Button variant="outline" className="w-full mt-4" onClick={() => supabase.auth.signOut()}>
          התנתקות
        </Button>
      </div>
    </div>
  );
};

export default UserNotRegisteredError;
