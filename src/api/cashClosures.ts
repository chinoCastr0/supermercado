/** Adaptador HTTP de cierres diarios. */
import { request } from "./products";
import type { Amounts } from "../utils/cashClosure";
export type Closure = { date: string; amounts: Amounts; total: string; sales_total: string; difference: string; status: "draft" | "confirmed"; confirmed_at: string | null };
const base = (date: string) => `/cash-closures/${date}`;
export const closuresApi = {
  get: (date: string) => request<Closure>(base(date)),
  save: (date: string, amounts: Amounts) => request<Closure>(base(date), { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ amounts }) }),
  confirm: (date: string) => request<Closure>(`${base(date)}/confirm`, { method: "POST" }),
  reopen: (date: string) => request<Closure>(`${base(date)}/reopen`, { method: "POST" }),
};
