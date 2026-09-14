import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { SHAREABLE_ROLES, ROLE_DISPLAY_NAMES } from '@/lib/permissions';

/**
 * "רמת שיתוף" — which roles may see this supplier.
 *
 * Only the two restrictable roles are listed. מנהלת מערכת and מזכירה always see
 * every supplier and are shown as a fixed note rather than as checked boxes, so
 * an admin can't accidentally hide a supplier from herself. That asymmetry is
 * enforced for real in the RLS policy on `suppliers` (migration 0010), not here.
 *
 * Rendered by both the create dialog (Suppliers.jsx) and the edit dialog
 * (SupplierDetail.jsx); only an admin ever sees it.
 *
 * @param {object} props
 * @param {string[]} [props.value] current shared_with_roles
 * @param {(role: string, checked: boolean) => void} props.onToggle
 */
export default function SharingFields({ value, onToggle }) {
  // A supplier created before migration 0010 has no list yet. Treat that as
  // "shared with everyone" — the column default says so, and showing empty
  // boxes would read as "hidden from everyone", which is the opposite.
  const shared = Array.isArray(value) ? value : [...SHAREABLE_ROLES];

  return (
    <div className="space-y-2 rounded-xl border border-border bg-muted/30 p-3">
      <Label className="text-sm">רמת שיתוף — מי רואה את הספק הזה</Label>
      <div className="space-y-2 pt-0.5">
        {SHAREABLE_ROLES.map(role => (
          <label key={role} className="flex items-center gap-2 cursor-pointer text-sm">
            <Checkbox
              checked={shared.includes(role)}
              onCheckedChange={checked => onToggle(role, checked === true)}
            />
            <span>{ROLE_DISPLAY_NAMES[role]}</span>
          </label>
        ))}
      </div>
      <p className="text-xs text-muted-foreground pt-0.5">
        מנהלת מערכת ומזכירה רואות תמיד את כל הספקים.
      </p>
      {shared.length === 0 && (
        <p className="text-xs text-amber-600">
          לא סומן אף תפקיד — הספק יוצג רק למנהלת המערכת ולמזכירה.
        </p>
      )}
    </div>
  );
}
