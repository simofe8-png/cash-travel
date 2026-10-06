/** Hebrew UI strings (V1 is Hebrew-only, RTL). */
export const he = {
  appName: 'Cash Travel',
  tabs: { home: 'בית', journal: 'יומן', add: 'הוספה', summary: 'סיכום', settings: 'הגדרות' },
  common: {
    save: 'שמירה',
    cancel: 'ביטול',
    delete: 'מחיקה',
    edit: 'עריכה',
    close: 'סגירה',
    back: 'חזרה',
    confirm: 'אישור',
    optional: 'אופציונלי',
    more: 'פרטים נוספים',
    none: 'ללא',
    unknown: 'לא ידוע',
    retry: 'נסו שוב',
  },
  categories: {
    FOOD: 'אוכל',
    ACCOMMODATION: 'לינה',
    TRANSPORT: 'תחבורה',
    ENTERTAINMENT: 'בילוי ואטרקציות',
    SHOPPING: 'קניות',
    OTHER: 'אחר',
  } as Record<string, string>,
  types: {
    OPENING_BALANCE: 'יתרת פתיחה',
    EXPENSE: 'הוצאה',
    FX_EXCHANGE: 'המרת מט״ח',
    ATM_WITHDRAWAL: 'משיכה מכספומט',
    CASH_ADJUSTMENT: 'תיקון יתרה',
  } as Record<string, string>,
  payment: { CASH: 'מזומן', CARD: 'אשראי', unspecifiedCard: 'כרטיס אשראי' },
  issuers: { ISRACARD: 'ישראכרט', MAX: 'MAX', CAL: 'כאל', OTHER: 'אחר' } as Record<string, string>,
  errors: {
    dbTitle: 'לא ניתן לפתוח את הנתונים',
    dbBody: 'הנתונים שלך לא נמחקו. נסו לסגור ולפתוח את האפליקציה מחדש.',
  },
} as const;

export function categoryLabel(c: { builtinKey: string | null; name: string | null }): string {
  return c.builtinKey ? (he.categories[c.builtinKey] ?? c.builtinKey) : (c.name ?? '');
}
