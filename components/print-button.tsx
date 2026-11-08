"use client";
export function PrintButton() {
  return <button type="button" className="btn" onClick={() => window.print()}>طباعة أو حفظ PDF</button>;
}
