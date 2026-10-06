import type { JournalRow } from '../../application/ports/JournalQueries';
import type { TripReportData } from '../../application/report/TripReportService';
import type { Total } from '../../domain/reporting';
import { money } from '../../domain/money';
import { localDateOf, localTimeOf } from '../../domain/time';
import { formatDate, formatDayHeader, formatMoney, formatRange } from '../format';
import { categoryLabel, he } from '../i18n/he';

/** Escapes text for HTML (the print WebView must never interpret user-entered text as markup). */
export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
}

const m = (x: { minor: number; currency: string }) => `<span class="num">${esc(formatMoney(x))}</span>`;

function total(t: Total): string {
  const extra: string[] = [];
  if (t.unavailableCount) extra.push(`+ ${t.unavailable.map((u) => esc(formatMoney(u))).join(' + ')} ללא שער`);
  if (t.estimatedCount) extra.push('כולל ערכים משוערים');
  return `${m(t.amount)}${extra.length ? `<div class="note">${extra.join(' · ')}</div>` : ''}`;
}

function rowText(r: JournalRow, d: TripReportData): { title: string; detail: string; amount: string } {
  const primary = money(r.amountMinor, r.currency);
  const cat = r.categoryId !== null ? d.categories.get(r.categoryId) : undefined;
  const card = r.cardId !== null ? d.cards.get(r.cardId) : undefined;
  const cardName = card ? card.nickname || he.issuers[card.issuer] || '' : he.payment.unspecifiedCard;
  switch (r.type) {
    case 'EXPENSE':
      return {
        title: r.description || (cat ? categoryLabel(cat) : he.types.EXPENSE),
        detail: [cat ? categoryLabel(cat) : null, r.paymentMethod === 'CARD' ? `${he.payment.CARD} · ${cardName}` : he.payment.CASH, r.place].filter(Boolean).join(' · '),
        amount: m(primary),
      };
    case 'FX_EXCHANGE':
      return { title: he.types.FX_EXCHANGE, detail: r.place ?? '', amount: `${m(primary)} ← ${m(money(r.counterAmountMinor ?? 0, r.counterCurrency ?? r.currency))}` };
    case 'ATM_WITHDRAWAL':
      return { title: he.types.ATM_WITHDRAWAL, detail: [r.feeMinor ? `עמלה ${formatMoney(money(r.feeMinor, r.currency))}` : null, cardName, r.place].filter(Boolean).join(' · '), amount: m(primary) };
    case 'CASH_ADJUSTMENT':
      return { title: he.types.CASH_ADJUSTMENT, detail: r.note ?? '', amount: m(primary) };
    case 'OPENING_BALANCE':
      return { title: he.types.OPENING_BALANCE, detail: '', amount: m(primary) };
  }
}

/** Professional, print-ready Hebrew report. All figures come from TripReportData (engines). */
export function renderTripReportHtml(d: TripReportData): string {
  const s = d.spending;
  const t = d.trip;
  const generated = `${formatDate(localDateOf(d.generatedAt, d.generatedOffsetMin))} ${localTimeOf({ occurredAt: d.generatedAt, occurredLocalDate: '', tzOffsetMin: d.generatedOffsetMin })}`;
  const stat = (label: string, value: string) => `<div class="stat"><div class="label">${label}</div><div class="value">${value}</div></div>`;

  const categories = s.byCategory
    .map(({ categoryId, total: tt }) => {
      const c = d.categories.get(categoryId);
      return `<tr><td>${esc(c ? categoryLabel(c) : '—')}</td><td class="amt">${total(tt)}</td></tr>`;
    })
    .join('');

  const wallets = d.wallets.map((w) => `<tr><td>${esc(w.currency)}</td><td class="amt">${m(w.opening)}</td><td class="amt ${w.negative ? 'neg' : ''}">${m(w.current)}</td></tr>`).join('');

  const days = d.days
    .map((day) => {
      const rows = day.rows
        .map((r) => {
          const x = rowText(r, d);
          const time = localTimeOf({ occurredAt: r.occurredAt, occurredLocalDate: r.localDate, tzOffsetMin: r.tzOffsetMin });
          return `<tr><td class="time">${esc(time)}</td><td><div>${esc(x.title)}</div>${x.detail ? `<div class="note">${esc(x.detail)}</div>` : ''}</td><td class="amt">${x.amount}</td></tr>`;
        })
        .join('');
      return `<h3>${esc(formatDayHeader(day.date))}${day.expenseTotal ? ` <span class="daytotal">הוצאות: ${total(day.expenseTotal)}</span>` : ''}</h3><table class="rows">${rows}</table>`;
    })
    .join('');

  return `<!doctype html>
<html lang="he" dir="rtl"><head><meta charset="utf-8"><title>${esc(t.name)}</title>
<style>
  @page { margin: 28px; }
  * { box-sizing: border-box; }
  body { font-family: 'Noto Sans Hebrew', 'Rubik', 'Assistant', sans-serif; color: #1C2321; font-size: 11.5px; direction: rtl; margin: 0; }
  header { border-bottom: 3px solid #0F5E57; padding-bottom: 10px; margin-bottom: 14px; }
  h1 { font-size: 22px; margin: 0 0 4px; color: #0F5E57; }
  h2 { font-size: 14px; margin: 18px 0 8px; color: #0F5E57; border-bottom: 1px solid #E2DDD2; padding-bottom: 4px; }
  h3 { font-size: 12px; margin: 12px 0 4px; display: flex; justify-content: space-between; }
  .sub { color: #5F6B66; }
  .notice { background: #FFF1D6; color: #8A5A00; padding: 6px 10px; border-radius: 6px; margin-top: 8px; font-size: 10.5px; }
  .grid { display: flex; flex-wrap: wrap; gap: 8px; }
  .stat { flex: 1 1 30%; border: 1px solid #E2DDD2; border-radius: 8px; padding: 8px 10px; }
  .stat .label { color: #5F6B66; font-size: 10.5px; }
  .stat .value { font-size: 15px; font-weight: 700; margin-top: 2px; }
  .big .value { font-size: 22px; color: #0F5E57; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 4px 6px; border-bottom: 1px solid #EFEBE2; vertical-align: top; }
  th { text-align: right; color: #5F6B66; font-weight: 500; padding: 4px 6px; border-bottom: 1px solid #E2DDD2; }
  .amt { text-align: left; white-space: nowrap; }
  .num { direction: ltr; unicode-bidi: isolate; }
  .neg { color: #B3261E; }
  .note { color: #5F6B66; font-size: 10px; font-weight: 400; }
  .time { width: 44px; color: #5F6B66; }
  .daytotal { font-weight: 500; color: #5F6B66; }
  .rows { page-break-inside: auto; }
  tr { page-break-inside: avoid; }
  footer { margin-top: 18px; color: #5F6B66; font-size: 9.5px; border-top: 1px solid #E2DDD2; padding-top: 6px; }
</style></head><body>
<header>
  <h1>דוח טיול — ${esc(t.name)}</h1>
  <div class="sub">${esc(formatRange(t.startDate, t.endDate))} · סכומים מסוכמים ב-${esc(t.reportingCurrency)} · הופק ${esc(generated)}</div>
  <div class="notice">דוח לסיכום בלבד — אינו גיבוי ואינו ניתן לשחזור לאפליקציה. תמונות קבלות אינן נכללות.</div>
</header>

<h2>סיכום</h2>
<div class="grid">
  <div class="stat big"><div class="label">עלות הטיול הכוללת</div><div class="value">${total(s.totalTripCost)}</div></div>
  ${stat('במהלך הטיול', total(s.duringTrip))}
  ${s.averagePerDay ? stat(`ממוצע ליום (${s.averagePerDay.days} ימים)`, `${m(s.averagePerDay.amount)}${s.averagePerDay.partial ? '<div class="note">חלקי — חסרים שערים</div>' : ''}`) : ''}
  ${s.preTrip.count + s.preTrip.unavailableCount ? stat('לפני הטיול', total(s.preTrip)) : ''}
  ${s.postTrip.count + s.postTrip.unavailableCount ? stat('אחרי הטיול', total(s.postTrip)) : ''}
  ${stat('מזומן', total(s.cash))}
  ${stat('אשראי', total(s.card))}
  ${s.atmFees.count + s.atmFees.unavailableCount ? stat('עמלות כספומט', total(s.atmFees)) : ''}
</div>

${categories ? `<h2>לפי קטגוריה</h2><table><tr><th>קטגוריה</th><th class="amt">סכום</th></tr>${categories}</table>` : ''}

${wallets ? `<h2>מזומן בארנק</h2><table><tr><th>מטבע</th><th class="amt">פתיחה</th><th class="amt">יתרה נוכחית</th></tr>${wallets}</table>` : ''}

<h2>יומן פעולות</h2>
${days || '<div class="sub">אין פעולות.</div>'}

<footer>
  המרות לפי שערי ייחוס (הבנק המרכזי האירופי, ובמטבעות שאינו מפרסם — מקור משני) לתאריך כל פעולה. באשראי: חיוב בפועל כשהוזן, אחרת הערכה.
  יתרות המזומן מחושבות מכל הפעולות הרשומות. Cash Travel — הנתונים נשמרים במכשיר בלבד.
</footer>
</body></html>`;
}
