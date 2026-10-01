import { format, formatDistanceToNowStrict } from "date-fns";

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const usd2 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const num = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

export const money = (n: number | null | undefined) => usd.format(n ?? 0);
export const money2 = (n: number | null | undefined) => usd2.format(n ?? 0);
export const number = (n: number | null | undefined) => num.format(n ?? 0);
export const km = (n: number | null | undefined) => `${num.format(n ?? 0)} km`;
export const kg = (n: number | null | undefined) => `${num.format(n ?? 0)} kg`;

export const date = (d: Date | string | null | undefined) => (d ? format(new Date(d), "dd MMM yyyy") : "—");
export const dateTime = (d: Date | string | null | undefined) => (d ? format(new Date(d), "dd MMM, HH:mm") : "—");
export const ago = (d: Date | string | null | undefined) =>
  d ? formatDistanceToNowStrict(new Date(d), { addSuffix: true }) : "never";

/** For <input type="datetime-local"> default values. */
export const toLocalInput = (d: Date | string | null | undefined) =>
  d ? format(new Date(d), "yyyy-MM-dd'T'HH:mm") : "";
export const toDateInput = (d: Date | string | null | undefined) => (d ? format(new Date(d), "yyyy-MM-dd") : "");

export function daysUntil(d: Date | string | null | undefined) {
  if (!d) return null;
  return Math.ceil((new Date(d).getTime() - Date.now()) / 86_400_000);
}

/** A Date `n` days in the past (server-side query windows). */
export const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);
