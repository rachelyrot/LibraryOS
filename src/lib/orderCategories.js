export const CATEGORIES = [
  { value: 'books', label: 'ספרים' },
  { value: 'book_supplies', label: 'ציוד ספרים' },
  { value: 'equipment', label: 'מכשירים' },
  { value: 'furniture', label: 'ריהוט' },
  { value: 'other', label: 'אחר' },
];

export const SUBCATEGORIES = {
  books: [
    'ספרי ילדים',
    'ספרות יפה',
    'ספרי עיון',
    'ספרי נוער',
    'ספרי לימוד',
    'אחר',
  ],
  book_supplies: [
    'ניילון',
    'כיסויי ספרים רכים',
    'מדבקות',
    'חותמות',
    'ספינות / כרטיסיות',
    'אחר',
  ],
  equipment: [
    'מחשבים / טאבלטים',
    'מדפסות',
    'סורקים',
    'מצלמות',
    'ציוד שמע ווידאו',
    'אחר',
  ],
  furniture: [
    'כורסאות / שולחנות קריאה',
    'מדפים',
    'כסאות',
    'ריהוט ילדים',
    'אחר',
  ],
  other: ['אחר'],
};

export const getCategoryLabel = (value) =>
  CATEGORIES.find(c => c.value === value)?.label || value || '';