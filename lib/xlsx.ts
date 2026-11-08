/**
 * A small reader for the first sheet of an Excel .xlsx file, in the browser and without a library:
 * an .xlsx is a zip of XML files; entries are inflated with DecompressionStream and read with
 * DOMParser. Only cell values are read (text, numbers, dates as serial numbers are converted).
 */
async function inflate(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function unzip(buffer: ArrayBuffer, wanted: (name: string) => boolean): Promise<Map<string, string>> {
  const bytes = new Uint8Array(buffer), view = new DataView(buffer);
  let end = bytes.length - 22;
  while (end >= 0 && view.getUint32(end, true) !== 0x06054b50) end--;
  if (end < 0) throw new Error("not a zip");
  const count = view.getUint16(end + 10, true);
  let offset = view.getUint32(end + 16, true);
  const files = new Map<string, string>();
  const decoder = new TextDecoder();
  for (let i = 0; i < count; i++) {
    if (view.getUint32(offset, true) !== 0x02014b50) break;
    const method = view.getUint16(offset + 10, true), size = view.getUint32(offset + 20, true);
    const nameLength = view.getUint16(offset + 28, true), extraLength = view.getUint16(offset + 30, true), commentLength = view.getUint16(offset + 32, true);
    const local = view.getUint32(offset + 42, true);
    const name = decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLength));
    if (wanted(name)) {
      const dataStart = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
      const raw = bytes.subarray(dataStart, dataStart + size);
      files.set(name, decoder.decode(method === 8 ? await inflate(raw) : raw));
    }
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return files;
}

const columnIndex = (ref: string) => [...ref.replace(/\d+/g, "")].reduce((total, char) => total * 26 + char.charCodeAt(0) - 64, 0) - 1;
const excelDate = (serial: number) => new Date(Date.UTC(1899, 11, 30) + serial * 86400_000).toISOString().slice(0, 10);

/** The first worksheet as rows of text. Date-formatted cells are read as YYYY-MM-DD when recognisable. */
export async function readXlsx(buffer: ArrayBuffer): Promise<string[][]> {
  const files = await unzip(buffer, name => name === "xl/sharedStrings.xml" || name === "xl/styles.xml" || /^xl\/worksheets\/sheet1\.xml$/.test(name) || name === "xl/workbook.xml");
  const sheet = files.get("xl/worksheets/sheet1.xml");
  if (!sheet) throw new Error("no sheet");
  const parser = new DOMParser();
  const shared = files.has("xl/sharedStrings.xml")
    ? [...parser.parseFromString(files.get("xl/sharedStrings.xml")!, "application/xml").getElementsByTagName("si")].map(si => [...si.getElementsByTagName("t")].map(t => t.textContent ?? "").join(""))
    : [];
  // Styles that format a number as a date (built-in ids 14–22, or custom formats containing d/m/y).
  const dateStyles = new Set<number>();
  if (files.has("xl/styles.xml")) {
    const styles = parser.parseFromString(files.get("xl/styles.xml")!, "application/xml");
    const custom = new Map([...styles.getElementsByTagName("numFmt")].map(fmt => [Number(fmt.getAttribute("numFmtId")), fmt.getAttribute("formatCode") ?? ""]));
    const xfs = styles.getElementsByTagName("cellXfs")[0]?.getElementsByTagName("xf") ?? [];
    [...xfs].forEach((xf, index) => {
      const id = Number(xf.getAttribute("numFmtId"));
      if ((id >= 14 && id <= 22) || /[dmy]/i.test((custom.get(id) ?? "").replace(/"[^"]*"/g, ""))) dateStyles.add(index);
    });
  }
  const doc = parser.parseFromString(sheet, "application/xml");
  const rows: string[][] = [];
  for (const row of [...doc.getElementsByTagName("row")]) {
    const cells: string[] = [];
    for (const cell of [...row.getElementsByTagName("c")]) {
      const index = columnIndex(cell.getAttribute("r") ?? "A");
      const type = cell.getAttribute("t");
      const raw = cell.getElementsByTagName("v")[0]?.textContent ?? cell.getElementsByTagName("t")[0]?.textContent ?? "";
      let value = type === "s" ? shared[Number(raw)] ?? "" : raw;
      if (!type && raw && dateStyles.has(Number(cell.getAttribute("s"))) && Number(raw) > 1000 && Number(raw) < 80000) value = excelDate(Number(raw));
      cells[index] = value;
    }
    rows.push(Array.from(cells, value => value ?? ""));
  }
  return rows.filter(cells => cells.some(value => String(value).trim()));
}
