import { describe, expect, it } from "vitest";
import { digits, onColor, profileValues, quoteLines, shareMessage } from "../lib/documents";

const form = (values: Record<string, string>) => { const data = new FormData(); for (const [k, v] of Object.entries(values)) data.set(k, v); return data; };
describe("document helpers", () => {
  it("spreads a percent discount over every line and a fixed one from the first line on", () => {
    const items = [{ id: "a", name: "Tuition", kind: "tuition" as const, amount: 1000, vat_rate: 15 }, { id: "b", name: "Meals", kind: "meals" as const, amount: 300, vat_rate: 15, quantity: 2 }];
    expect(quoteLines(items, { kind: "percent", value: 10 }).map(line => line.discount)).toEqual([100, 60]);
    expect(quoteLines(items, { kind: "fixed", value: 1200 }).map(line => line.discount)).toEqual([1000, 200]);
    expect(quoteLines(items, null).map(line => [line.quantity, line.unit_price, line.discount, line.sort_order])).toEqual([[1, 1000, 0, 0], [2, 300, 0, 1]]);
  });
  it("validates and normalises the organization profile", () => {
    const values = profileValues(form({ cr_number: "١٠١٠ ١٢٣٤ ٥٦", vat_number: "300000000000003", iban: "sa03 8000 0000 6080 1016 7519", email: " Info@School.SA ", brand_color: "#112233", legal_name: "  " }));
    expect(values).toMatchObject({ cr_number: "1010123456", vat_number: "300000000000003", iban: "SA0380000000608010167519", email: "info@school.sa", brand_color: "#112233", legal_name: null });
    expect("logo_data" in values).toBe(false);
    expect(profileValues(form({ brand_color: "#000000", logo_data: "remove" })).logo_data).toBeNull();
    expect(() => profileValues(form({ brand_color: "#000000", vat_number: "123" }))).toThrow("الرقم الضريبي");
    expect(() => profileValues(form({ brand_color: "#000000", logo_data: "data:image/svg+xml;base64,PHN2Zz4=" }))).toThrow("الشعار");
    expect(() => profileValues(form({ brand_color: "red" }))).toThrow("لون");
  });
  it("picks readable text on the brand colour and writes a polite share message", () => {
    expect(onColor("#3E1657")).toBe("#FFFFFF");
    expect(onColor("#FFE7A8")).toBe("#111111");
    expect(digits("٠٥٠ ١٢٣-٤")).toBe("0501234");
    const message = shareMessage({ kind: "quote", organization: "حضانة كرز", number: 7, recipient: "أبو فهد", total: "1٬150٫00 ر.س", link: "https://x/d/t" });
    expect(message).toContain("عرض السعر رقم 7");
    expect(message).toContain("https://x/d/t");
  });
});
