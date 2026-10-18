-- inventory_items.license_expiry: software validity for IT items.
--
-- Why: items in "תקשורת ומחשוב" are mostly software licences, not stock. The
-- admin doesn't want quantities, minimum or unit on them, but the date the
-- software is valid until ("תוקף התוכנה"). The inventory screen now shows that
-- date for these items, frames them when it has passed or is near, and leaves
-- them out of the low-stock counts (a 0 / 0 quantity would otherwise count as
-- low stock). copies_in_agron is no longer shown anywhere in inventory; the
-- column stays (additive only).
--
-- Additive only.

alter table public.inventory_items
  add column if not exists license_expiry date;

comment on column public.inventory_items.license_expiry is
  'Software validity date ("תוקף התוכנה") for items in תקשורת ומחשוב, which have no stock quantities.';
