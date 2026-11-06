// Support links deliberately accept no tenant names, messages or record data.
export function supportLink(phone: string): string | null {
  if (!/^[1-9][0-9]{7,14}$/.test(phone)) return null;
  return `https://wa.me/${phone}?text=${encodeURIComponent("مرحبًا دعم سِير، أحتاج مساعدة في استخدام المنصة.")}`;
}
