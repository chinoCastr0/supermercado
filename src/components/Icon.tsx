/** Iconografía compartida: SVG de 20 px, trazo uniforme y sin dependencias. */
const paths = {
  box: "m12 3 9 5-9 5-9-5 9-5Zm-9 5v8l9 5 9-5V8M12 13v8M7.5 5.5l9 5",
  list: "M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01",
  users: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M16 3a4 4 0 0 1 0 8M22 21v-2a4 4 0 0 0-3-3.87M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
  upload: "M12 16V3m-5 5 5-5 5 5M3 15v5a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1v-5",
  refresh: "M20 7v5h-5M4 17v-5h5M6.1 6a8 8 0 0 1 13.2 2M4.7 16A8 8 0 0 0 18 18",
  search: "M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0",
  plus: "M12 5v14M5 12h14",
  close: "m6 6 12 12M6 18 18 6",
  check: "m5 12 4 4L19 6",
  alert: "M12 8v5m0 3h.01M10.3 3.9 2 18a2 2 0 0 0 1.7 3h16.6a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0",
  info: "M12 11v6m0-10h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0",
  scan: "M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5M7 7v10m4-10v10m3-10v10m3-10v10",
  printer: "M6 9V3h12v6M6 18H3v-9h18v9h-3M6 14h12v7H6v-7M17 12h.01",
  left: "m14 6-6 6 6 6",
  right: "m10 6 6 6-6 6",
  arrow: "M4 12h16m-6-6 6 6-6 6",
  sun: "M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
  moon: "M21 13a9 9 0 1 1-10-10 7 7 0 0 0 10 10",
  monitor: "M3 3h18v14H3V3m5 18h8m-4-4v4",
  trash: "M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7",
  download: "M12 3v12m-5-5 5 5 5-5M3 16v5h18v-5",
} as const;

export function Icon({ name, size = 20 }: { name: keyof typeof paths; size?: 16 | 20 }) {
  return <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d={paths[name]} /></svg>;
}
