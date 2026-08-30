import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/**
 * שדה סכום כספי לדיאלוגים של התקציב.
 *
 * במכוון *לא* `<input type="number">`: הדפדפן מחזיר `e.target.value === ''` לכל
 * תו שהוא לא מצליח לפרסר כמספר תוך כדי הקלדה — מפריד אלפים ("10,000"), רווח,
 * או "₪". בשילוב עם `value={form.amount || ''}` זה גרם לכל השדה להתאפס באמצע
 * ההקלדה: Number('') === 0, ו-`0 || ''` מרוקן את התצוגה. המשתמשת הקלידה סכום
 * גדול עם פסיק והכל נמחק.
 *
 * כאן הערך נשמר כמחרוזת גולמית, וכל מה שאינו ספרה או נקודה עשרונית מסונן החוצה
 * במקום למחוק את השדה — כך "10,000" נקלט כ-"10000" ושום דבר לא הולך לאיבוד.
 * ההמרה למספר נעשית אצל הקורא, בשליחת הטופס.
 *
 * @param {object} props
 * @param {string|number} [props.value] הערך הנוכחי (מחרוזת גולמית או מספר)
 * @param {(value: string) => void} props.onChange מקבל את המחרוזת המסוננת
 */
export default function MoneyInput({ value, onChange, className, ...props }) {
  const handleChange = (e) => {
    const cleaned = e.target.value.replace(/[^\d.]/g, '');
    const parts = cleaned.split('.');
    // נקודה עשרונית אחת לכל היותר
    onChange(parts.length > 2 ? `${parts.shift()}.${parts.join('')}` : cleaned);
  };

  return (
    <Input
      type="text"
      inputMode="decimal"
      dir="ltr"
      className={cn('text-right', className)}
      value={value ?? ''}
      onChange={handleChange}
      {...props}
    />
  );
}
