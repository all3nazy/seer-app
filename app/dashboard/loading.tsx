/** Shown instantly while a dashboard page loads its data, so navigation never feels frozen. */
export default function Loading() {
  return <div aria-busy="true" aria-live="polite" style={{ display: "grid", gap: 16 }}>
    <span className="sr-only">جارٍ التحميل…</span>
    <div className="skeleton" style={{ height: 36, width: "40%" }} />
    <div className="skeleton" style={{ height: 18, width: "60%" }} />
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 14, marginTop: 8 }}>
      {Array.from({ length: 4 }, (_, index) => <div key={index} className="skeleton" style={{ height: 92 }} />)}
    </div>
    <div className="skeleton" style={{ height: 260 }} />
  </div>;
}
