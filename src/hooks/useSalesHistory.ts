/** Carga de ventas por fecha con descarte de respuestas antiguas. */
import { useEffect, useState } from "react";
import { salesApi, type SalesDay } from "../api/sales";
export function useSalesHistory(date: string) {
  const [data, setData] = useState<SalesDay | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    salesApi.list(date || undefined).then((value) => {
      if (active) { setData(value); setError(""); setLoading(false); }
    }).catch((reason: Error) => {
      if (active) { setError(reason.message); setLoading(false); }
    });
    return () => { active = false; };
  }, [date, revision]);
  return { data, error, loading, refresh: () => { setLoading(true); setRevision((value) => value + 1); } };
}
