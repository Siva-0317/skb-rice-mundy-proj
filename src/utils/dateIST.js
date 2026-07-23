// Centralizes all "what day/time is it in India" logic so the app behaves identically
// regardless of the viewing device's or server's own timezone. IST (Asia/Kolkata) is a
// fixed UTC+5:30 offset with no daylight-saving changes, which makes it safe to compute
// via a constant shift rather than relying on Intl/browser timezone support.
//
// Two distinct kinds of date live in this app and need different handling:
//  - "Business dates" (sale.date, purchase.date, ledger.date) are day-only values,
//    always stored as UTC midnight of the chosen calendar day (new Date('YYYY-MM-DD')
//    parses as UTC midnight). They carry no time-of-day, so their calendar day should
//    always be read via UTC getters — never local or IST-shifted — to avoid any
//    timezone reinterpretation at all.
//  - "Precise timestamps" (createdAt, lastPayment, lastPurchase, editedAt) are real
//    serverTimestamp() instants. Determining which IST calendar day they fall on, or
//    formatting them for display, requires explicitly reading them in Asia/Kolkata.

const IST_TIMEZONE = 'Asia/Kolkata';
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

export const toDateObj = (val) => {
  if (!val) return null;
  if (typeof val.toDate === 'function') return val.toDate();
  if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
  if (typeof val.seconds === 'number') return new Date(val.seconds * 1000);
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
};

// Epoch millis for any timestamp-like value — Firestore Timestamp, Date, ISO string, or
// raw millis. Used as a sort/tiebreak key; returns 0 (oldest-sorting) for missing values.
export const toMillis = (val) => {
  if (!val) return 0;
  if (typeof val.toMillis === 'function') return val.toMillis();
  if (typeof val.toDate === 'function') return val.toDate().getTime();
  if (typeof val.seconds === 'number') return val.seconds * 1000;
  const d = new Date(val);
  return isNaN(d.getTime()) ? 0 : d.getTime();
};

// Same-day sales/purchases all share one `date` value (UTC midnight of that business
// day), so Firestore's orderBy("date") alone leaves them in an arbitrary tie-break
// order, not creation order. Sorting with createdAt as the tiebreaker puts same-day
// records in true reverse-chronological order (most recently made first).
export const sortByDateThenCreatedAt = (docs) => docs.sort((a, b) => {
  const dateDiff = toMillis(b.date) - toMillis(a.date);
  if (dateDiff !== 0) return dateDiff;
  return toMillis(b.createdAt) - toMillis(a.createdAt);
});

// Y/M/D/weekday as they read on an IST wall clock for a given instant.
const getISTParts = (val) => {
  const d = toDateObj(val) || new Date();
  const shifted = new Date(d.getTime() + IST_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    date: shifted.getUTCDate(),
    day: shifted.getUTCDay()
  };
};

const pad2 = (n) => String(n).padStart(2, '0');

// 'YYYY-MM-DD' as the given instant reads in IST — for date-input defaults and
// day-bucket keys derived from precise timestamps.
export const getISTDateString = (val) => {
  const p = getISTParts(val);
  return `${p.year}-${pad2(p.month + 1)}-${pad2(p.date)}`;
};

// Today's 'YYYY-MM-DD' in IST, regardless of the device's local timezone. Use this
// anywhere the app previously defaulted a date picker to `new Date().toISOString()
// .split('T')[0]` (which is UTC-based and shows the wrong day during IST early-morning
// hours). The resulting string plugs directly into `new Date(str)` for storage, exactly
// as before.
export const getISTTodayDateString = () => getISTDateString(new Date());

// A UTC Date instance for "today" (IST) at midnight — matches how business dates are
// stored, so this is the right anchor for Firestore range queries against those fields.
export const getISTTodayAsUtcMidnight = () => {
  const p = getISTParts(new Date());
  return new Date(Date.UTC(p.year, p.month, p.date));
};

// Formats a timestamp for display, always in Asia/Kolkata regardless of viewer timezone.
export const formatDateIST = (val, options = { day: '2-digit', month: 'short', year: 'numeric' }) => {
  const d = toDateObj(val);
  if (!d) return '-';
  return d.toLocaleDateString('en-IN', { ...options, timeZone: IST_TIMEZONE });
};

// 'Today' / 'Yesterday' / short date — comparisons done on IST calendar days.
export const formatRelativeDateIST = (val) => {
  const d = toDateObj(val);
  if (!d) return '-';
  const dayStr = getISTDateString(d);
  const todayStr = getISTTodayDateString();
  if (dayStr === todayStr) return 'Today';
  const yesterday = new Date(getISTTodayAsUtcMidnight().getTime() - 24 * 60 * 60 * 1000);
  if (dayStr === getISTDateString(yesterday)) return 'Yesterday';
  return formatDateIST(d, { day: '2-digit', month: 'short' });
};

// Start-of-day / end-of-day boundaries for a business-date-only string ('YYYY-MM-DD'),
// as UTC instants — matching how business dates are stored (UTC midnight of that day).
// No local/IST shifting needed here since the string already unambiguously names a
// calendar day.
export const businessDayStartUtc = (dateOnlyStr) => new Date(`${dateOnlyStr}T00:00:00.000Z`);
export const businessDayEndUtc = (dateOnlyStr) => new Date(`${dateOnlyStr}T23:59:59.999Z`);
