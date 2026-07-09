import { useState, useEffect, useCallback, useRef } from 'react';
import { base44 } from '@/api/base44Client';

let cachedMains = null;
let cachedSubs = null;
let fetchPromise = null;

export default function useCategories() {
  const [mains, setMains] = useState(cachedMains || []);
  const [subs, setSubs] = useState(cachedSubs || []);
  const [loading, setLoading] = useState(!cachedMains);
  const mounted = useRef(true);

  useEffect(() => {
    if (cachedMains && cachedSubs) return;
    if (fetchPromise) {
      fetchPromise.then(() => {
        if (mounted.current) { setMains(cachedMains); setSubs(cachedSubs); setLoading(false); }
      });
      return;
    }

    fetchPromise = (async () => {
      try {
        const cats = await base44.entities.Category.list('sort_order', 500);
        cachedMains = cats.filter(c => c.category_type === 'main' && c.status === 'active')
          .map(c => ({ value: c.name, label: c.name }));
        cachedSubs = cats.filter(c => c.category_type === 'sub' && c.status === 'active')
          .map(c => ({ value: c.name, label: c.name, parent_name: c.parent_name }));
      } catch (e) {
        cachedMains = []; cachedSubs = [];
      }
      if (mounted.current) { setMains(cachedMains); setSubs(cachedSubs); setLoading(false); }
    })();

    return () => { mounted.current = false; };
  }, []);

  const getSubcategories = useCallback((mainValue) => {
    if (!mainValue) return [];
    return subs.filter(s => s.parent_name === mainValue);
  }, [subs]);

  const getLabel = useCallback((value) => {
    if (!value) return '';
    const found = [...mains, ...subs].find(c => c.value === value);
    return found ? found.label : value;
  }, [mains, subs]);

  return { mains, subs, loading, getSubcategories, getLabel };
}