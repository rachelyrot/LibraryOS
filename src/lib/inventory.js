// Inventory rules shared by the inventory screen and the dashboard.
//
// Items in "תקשורת ומחשוב" are software licences, not stock: no quantities,
// only a validity date (inventory_items.license_expiry, migration 0027). They
// are never "low stock"; instead they are flagged when the licence has expired
// or is about to.

export const SOFTWARE_CATEGORY = 'תקשורת ומחשוב';
export const LICENSE_WARN_DAYS = 30;

// Matched by the word "מחשוב", not the exact name: the category is a row in the
// categories table, so its spelling there (spacing, "מחשוב ותקשורת"...) is
// whatever was typed in Settings.
export const isSoftwareItem = (item) => /מחשוב/.test(String(item?.category || ''));

// פעילות תרבות: כמות בלבד — בלי כמות מינימום ויחידת מידה, ולכן גם לא "מלאי נמוך"
export const isCultureItem = (item) => /תרבות/.test(String(item?.category || ''));

/** Does the item track a minimum quantity (and so can be low stock)? */
export const tracksMinimum = (item) => !isSoftwareItem(item) && !isCultureItem(item);

export const isLowStock = (item) =>
  tracksMinimum(item) && Number(item?.current_quantity || 0) <= Number(item?.minimum_quantity || 0);

/** 'expired' | 'soon' (within LICENSE_WARN_DAYS) | 'ok' | null (no date). */
export function licenseState(item) {
  if (!item?.license_expiry) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const days = Math.round((new Date(`${item.license_expiry}T00:00:00`) - today) / 86400000);
  if (days < 0) return 'expired';
  if (days <= LICENSE_WARN_DAYS) return 'soon';
  return 'ok';
}
