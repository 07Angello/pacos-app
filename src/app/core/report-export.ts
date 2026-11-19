import { dayLabel, delta, hourLabel, pct, rangeLabel, SalesReport, WEEKDAYS } from './report';

// =============================================================================
// Excel (.xlsx real, sin dependencias pesadas): SpreadsheetML empaquetado con fflate.
// =============================================================================

type Cell = string | number | null | { v: string | number | null; s: Style };
type Style = 'text' | 'bold' | 'money' | 'moneyBold' | 'head' | 'pct' | 'title' | 'int' | 'intBold';
interface Sheet {
  name: string;
  widths: number[];
  rows: Cell[][];
}

const STYLE_ID: Record<Style, number> = { text: 0, bold: 1, money: 2, moneyBold: 3, head: 4, pct: 5, title: 6, int: 7, intBold: 8 };

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function colName(i: number): string {
  let s = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

function sheetXml(sheet: Sheet): string {
  const rows = sheet.rows
    .map((row, r) => {
      const cells = row
        .map((raw, c) => {
          if (raw === null || raw === undefined) return '';
          const { v, s } = typeof raw === 'object' ? raw : { v: raw, s: (typeof raw === 'number' ? 'int' : 'text') as Style };
          if (v === null || v === '') return '';
          const ref = `${colName(c)}${r + 1}`;
          const st = STYLE_ID[s];
          return typeof v === 'number'
            ? `<c r="${ref}" s="${st}"><v>${Number.isFinite(v) ? v : 0}</v></c>`
            : `<c r="${ref}" s="${st}" t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
        })
        .join('');
      return `<row r="${r + 1}">${cells}</row>`;
    })
    .join('');
  const cols = sheet.widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"/></sheetViews><cols>${cols}</cols><sheetData>${rows}</sheetData></worksheet>`;
}

function stylesXml(symbol: string): string {
  const money = `&quot;${esc(symbol)} &quot;#,##0.00`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="2"><numFmt numFmtId="164" formatCode="${money}"/><numFmt numFmtId="165" formatCode="0.0%"/></numFmts>
<fonts count="4"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font><font><b/><sz val="15"/><name val="Calibri"/></font></fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE8531F"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="9">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="164" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>
<xf numFmtId="0" fontId="2" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="3" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="3" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;
}

const m = (v: number): Cell => ({ v: Number(v), s: 'money' });
const mb = (v: number): Cell => ({ v: Number(v), s: 'moneyBold' });
const ib = (v: number): Cell => ({ v: Number(v), s: 'intBold' });
const p = (v: number | null): Cell => (v === null ? '—' : { v, s: 'pct' });
const b = (v: string): Cell => ({ v, s: 'bold' });
const head = (...cols: string[]): Cell[] => cols.map((v) => ({ v, s: 'head' }));
const title = (v: string): Cell => ({ v, s: 'title' });

function sheets(r: SalesReport): Sheet[] {
  const s = r.summary;
  const prev = r.previous;
  const header = (name: string): Cell[][] => [[title(`${r.range.restaurant} · ${name}`)], [rangeLabel(r.range.from, r.range.to)], []];

  const resumen: Sheet = {
    name: 'Resumen',
    widths: [34, 18, 20, 14],
    rows: [
      ...header('Reporte de ventas'),
      head('Indicador', 'Este periodo', 'Periodo anterior', 'Cambio'),
      ['Ventas (pedidos entregados)', mb(s.sales), m(prev.sales), p(delta(s.sales, prev.sales))],
      ['Pedidos entregados', ib(s.orders), prev.orders, p(delta(s.orders, prev.orders))],
      ['Ticket promedio', m(s.avgTicket), m(prev.avgTicket), p(delta(s.avgTicket, prev.avgTicket))],
      ['Platos vendidos', s.itemsSold, prev.itemsSold, p(delta(s.itemsSold, prev.itemsSold))],
      ['Venta de platos (sin envío)', m(s.subtotal), m(prev.subtotal), p(delta(s.subtotal, prev.subtotal))],
      ['Envíos cobrados', m(s.deliveryFees), m(prev.deliveryFees), p(delta(s.deliveryFees, prev.deliveryFees))],
      ['Clientes distintos', s.customers, prev.customers, p(delta(s.customers, prev.customers))],
      ['Clientes que repiten', s.returningCustomers, prev.returningCustomers, p(delta(s.returningCustomers, prev.returningCustomers))],
      [],
      head('Modalidad', 'Pedidos', 'Ventas', '% ventas'),
      ['Recoger en local', s.pickupOrders, m(s.pickupSales), p(pct(s.pickupSales, s.sales))],
      ['A domicilio', s.deliveryOrders, m(s.deliverySales), p(pct(s.deliverySales, s.sales))],
      ['Comer aquí', s.dineInOrders ?? 0, m(s.dineInSales ?? 0), p(pct(s.dineInSales ?? 0, s.sales))],
      ['En línea (web)', s.webOrders ?? 0, m(s.webSales ?? 0), p(pct(s.webSales ?? 0, s.sales))],
      ['En el local', s.counterOrders ?? 0, m(s.counterSales ?? 0), p(pct(s.counterSales ?? 0, s.sales))],
      ['Programados (recoger a una hora)', s.scheduledOrders, null, null],
      [],
      head('No concretados', 'Pedidos', 'Valor', ''),
      ['Cancelados por el cliente', s.cancelledOrders, m(s.cancelledValue), null],
      ['Rechazados por el restaurante', s.rejectedOrders, m(s.rejectedValue), null],
      ['Aún en curso (no cuentan como venta)', s.openOrders, m(s.openValue), null],
      [],
      [`Generado: ${new Intl.DateTimeFormat('es-HN', { timeZone: r.range.timezone, dateStyle: 'medium', timeStyle: 'short' }).format(new Date(r.range.generatedAt))}`],
    ],
  };

  const caja: Sheet = {
    name: 'Cierre de caja',
    widths: [26, 12, 18, 12],
    rows: [
      ...header('Cierre de caja'),
      head('Método de pago', 'Pedidos', 'Total', '% del total'),
      ...r.byPayment.map((x): Cell[] => [x.label, x.orders, m(x.sales), p(pct(x.sales, s.sales))]),
      [b('Total'), ib(s.orders), mb(s.sales), p(s.sales ? 1 : 0)],
      [],
      ['Solo pedidos entregados. Incluye el costo de envío.'],
    ],
  };

  const dias: Sheet = {
    name: 'Por día',
    widths: [20, 12, 18, 14],
    rows: [...header('Ventas por día'), head('Día', 'Pedidos', 'Ventas', 'Ticket prom.'),
      ...r.byDay.map((d): Cell[] => [`${dayLabel(d.date)} (${d.date})`, d.orders, m(d.sales), m(d.orders ? d.sales / d.orders : 0)]),
      [b('Total'), ib(s.orders), mb(s.sales), m(s.avgTicket)]],
  };

  const horas: Sheet = {
    name: 'Por hora',
    widths: [14, 12, 18, 14],
    rows: [...header('Ventas por hora del día'), head('Hora', 'Pedidos', 'Ventas', '% ventas'),
      ...r.byHour.filter((h) => h.orders).map((h): Cell[] => [hourLabel(h.hour), h.orders, m(h.sales), p(pct(h.sales, s.sales))])],
  };

  const hours = r.byHour.filter((h) => h.orders).map((h) => h.hour);
  const pico: Sheet = {
    name: 'Horas pico',
    widths: [14, ...hours.map(() => 9)],
    rows: [...header('Pedidos por día de la semana y hora'), head('Día', ...hours.map(hourLabel)),
      ...[1, 2, 3, 4, 5, 6, 0].map((wd): Cell[] => [WEEKDAYS[wd], ...hours.map((h) => r.heatmap.find((x) => x.weekday === wd && x.hour === h)?.orders ?? 0)])],
  };

  const productos: Sheet = {
    name: 'Productos',
    widths: [6, 32, 20, 12, 18, 12, 12],
    rows: [...header('Productos más vendidos'), head('#', 'Producto', 'Categoría', 'Cantidad', 'Ventas', '% ventas', 'Pedidos'),
      ...r.products.map((x, i): Cell[] => [i + 1, x.name, x.category, x.quantity, m(x.sales), p(pct(x.sales, s.subtotal)), x.orders])],
  };

  const categorias: Sheet = {
    name: 'Categorías',
    widths: [26, 12, 18, 12],
    rows: [...header('Ventas por categoría'), head('Categoría', 'Cantidad', 'Ventas', '% ventas'),
      ...r.categories.map((x): Cell[] => [x.name, x.quantity, m(x.sales), p(pct(x.sales, s.subtotal))])],
  };

  const extras: Sheet = {
    name: 'Extras',
    widths: [28, 26, 12, 16],
    rows: [...header('Extras y opciones elegidas'), head('Grupo', 'Opción', 'Veces', 'Ventas extra'),
      ...r.extras.map((x): Cell[] => [x.group, x.name, x.times, m(x.sales)])],
  };

  const colonias: Sheet = {
    name: 'Colonias',
    widths: [30, 12, 18],
    rows: [...header('Pedidos a domicilio por colonia'), head('Colonia', 'Pedidos', 'Ventas'),
      ...r.neighborhoods.map((x): Cell[] => [x.name, x.orders, m(x.sales)])],
  };

  const perdidas: Sheet = {
    name: 'No concretados',
    widths: [16, 40, 12, 18],
    rows: [...header('Pedidos cancelados y rechazados'), head('Tipo', 'Motivo', 'Pedidos', 'Valor'),
      ...r.losses.map((x): Cell[] => [x.type === 'CANCELLED' ? 'Cancelado' : 'Rechazado', x.reason, x.orders, m(x.value)])],
  };

  return [resumen, caja, dias, horas, pico, productos, categorias, extras, colonias, perdidas];
}

export async function buildXlsx(r: SalesReport): Promise<Blob> {
  const { zipSync, strToU8 } = await import('fflate');
  const list = sheets(r);
  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${list
      .map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`)
      .join('')}</Types>`),
    '_rels/.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`),
    'xl/workbook.xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${list
      .map((sh, i) => `<sheet name="${esc(sh.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
      .join('')}</sheets></workbook>`),
    'xl/_rels/workbook.xml.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${list
      .map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`)
      .join('')}<Relationship Id="rId${list.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`),
    'xl/styles.xml': strToU8(stylesXml(r.range.currencySymbol || 'L')),
  };
  list.forEach((sh, i) => (files[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(sheetXml(sh))));
  const zip = zipSync(files, { level: 6 });
  return new Blob([zip as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

// =============================================================================
// PDF (jsPDF + autotable, carga diferida)
// =============================================================================

const BRAND: [number, number, number] = [232, 83, 31];
const INK: [number, number, number] = [33, 26, 22];
const MUTED: [number, number, number] = [120, 110, 100];

export async function buildPdf(r: SalesReport): Promise<Blob> {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const W = doc.internal.pageSize.getWidth();
  const M = 40;
  const sym = r.range.currencySymbol || 'L';
  const money = (v: number) => `${sym} ${Number(v).toLocaleString('es-HN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const int = (v: number) => Number(v).toLocaleString('es-HN');
  const pc = (v: number | null) => (v === null ? '—' : `${v >= 0 ? '+' : ''}${(v * 100).toFixed(1)}%`);
  const share = (v: number) => `${(v * 100).toFixed(1)}%`;
  const s = r.summary;
  const prev = r.previous;
  let y = 0;

  // Encabezado
  doc.setFillColor(...BRAND);
  doc.rect(0, 0, W, 78, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.text(`${r.range.restaurant} · Reporte de ventas`, M, 36);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10.5);
  doc.text(rangeLabel(r.range.from, r.range.to), M, 56);
  y = 104;

  // Tarjetas de resumen
  const cards: [string, string, string][] = [
    ['Ventas', money(s.sales), pc(delta(s.sales, prev.sales))],
    ['Pedidos entregados', int(s.orders), pc(delta(s.orders, prev.orders))],
    ['Ticket promedio', money(s.avgTicket), pc(delta(s.avgTicket, prev.avgTicket))],
    ['Platos vendidos', int(s.itemsSold), pc(delta(s.itemsSold, prev.itemsSold))],
  ];
  const cw = (W - M * 2 - 30) / 4;
  cards.forEach(([label, value, change], i) => {
    const x = M + i * (cw + 10);
    doc.setFillColor(251, 245, 238);
    doc.roundedRect(x, y, cw, 62, 8, 8, 'F');
    doc.setTextColor(...MUTED);
    doc.setFontSize(8.5);
    doc.text(label.toUpperCase(), x + 10, y + 16);
    doc.setTextColor(...INK);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(value.length > 12 ? 12.5 : 15);
    doc.text(value, x + 10, y + 36);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    const up = change.startsWith('+');
    doc.setTextColor(...(change === '—' ? MUTED : up ? ([22, 128, 61] as [number, number, number]) : ([190, 40, 40] as [number, number, number])));
    doc.text(change === '—' ? 'sin periodo anterior' : `${change} vs. periodo anterior`, x + 10, y + 52);
  });
  y += 82;

  const section = (t: string) => {
    if (y > doc.internal.pageSize.getHeight() - 120) {
      doc.addPage();
      y = M;
    }
    doc.setTextColor(...INK);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12.5);
    doc.text(t, M, y);
    y += 8;
  };
  const table = (head: string[], body: (string | number)[][], opts: { foot?: (string | number)[]; right?: number[] } = {}) => {
    const right = Object.fromEntries((opts.right ?? []).map((i) => [i, { halign: 'right' as const }]));
    autoTable(doc, {
      startY: y,
      head: [head],
      body: body.map((row) => row.map(String)),
      foot: opts.foot ? [opts.foot.map(String)] : undefined,
      margin: { left: M, right: M },
      styles: { fontSize: 9, cellPadding: 5, textColor: INK },
      headStyles: { fillColor: BRAND, textColor: 255, fontStyle: 'bold' },
      footStyles: { fillColor: [251, 245, 238], textColor: INK, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [252, 250, 247] },
      columnStyles: right,
      showFoot: 'lastPage',
      // Encabezado y total alineados con sus números.
      didParseCell: (data) => {
        if ((opts.right ?? []).includes(data.column.index)) data.cell.styles.halign = 'right';
      },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 22;
  };

  section('Cierre de caja (pedidos entregados)');
  table(['Método de pago', 'Pedidos', 'Total', '% del total'],
    r.byPayment.map((x) => [x.label, int(x.orders), money(x.sales), share(pct(x.sales, s.sales))]),
    { foot: ['Total', int(s.orders), money(s.sales), s.sales ? '100%' : '0%'], right: [1, 2, 3] });

  section('Resumen del periodo');
  table(['Indicador', 'Este periodo', 'Periodo anterior', 'Cambio'], [
    ['Venta de platos (sin envío)', money(s.subtotal), money(prev.subtotal), pc(delta(s.subtotal, prev.subtotal))],
    ['Envíos cobrados', money(s.deliveryFees), money(prev.deliveryFees), pc(delta(s.deliveryFees, prev.deliveryFees))],
    ['Recoger en local', `${int(s.pickupOrders)} · ${money(s.pickupSales)}`, `${int(prev.pickupOrders)} · ${money(prev.pickupSales)}`, pc(delta(s.pickupSales, prev.pickupSales))],
    ['A domicilio', `${int(s.deliveryOrders)} · ${money(s.deliverySales)}`, `${int(prev.deliveryOrders)} · ${money(prev.deliverySales)}`, pc(delta(s.deliverySales, prev.deliverySales))],
    ['Comer aquí', `${int(s.dineInOrders ?? 0)} · ${money(s.dineInSales ?? 0)}`, `${int(prev.dineInOrders ?? 0)} · ${money(prev.dineInSales ?? 0)}`, pc(delta(s.dineInSales ?? 0, prev.dineInSales ?? 0))],
    ['En el local (mostrador)', `${int(s.counterOrders ?? 0)} · ${money(s.counterSales ?? 0)}`, `${int(prev.counterOrders ?? 0)} · ${money(prev.counterSales ?? 0)}`, pc(delta(s.counterSales ?? 0, prev.counterSales ?? 0))],
    ['Clientes distintos', int(s.customers), int(prev.customers), pc(delta(s.customers, prev.customers))],
    ['Clientes que repiten', int(s.returningCustomers), int(prev.returningCustomers), pc(delta(s.returningCustomers, prev.returningCustomers))],
  ], { right: [1, 2, 3] });

  section('Productos más vendidos');
  table(['#', 'Producto', 'Categoría', 'Cant.', 'Ventas', '%'],
    r.products.slice(0, 20).map((x, i) => [i + 1, x.name, x.category, int(x.quantity), money(x.sales), share(pct(x.sales, s.subtotal))]),
    { right: [3, 4, 5] });

  section('Ventas por categoría');
  table(['Categoría', 'Cantidad', 'Ventas', '%'],
    r.categories.map((x) => [x.name, int(x.quantity), money(x.sales), share(pct(x.sales, s.subtotal))]), { right: [1, 2, 3] });

  if (r.byDay.length > 1) {
    section('Ventas por día');
    table(['Día', 'Pedidos', 'Ventas', 'Ticket prom.'],
      r.byDay.map((d) => [dayLabel(d.date), int(d.orders), money(d.sales), money(d.orders ? d.sales / d.orders : 0)]),
      { foot: ['Total', int(s.orders), money(s.sales), money(s.avgTicket)], right: [1, 2, 3] });
  }

  const hours = r.byHour.filter((h) => h.orders);
  if (hours.length) {
    section('Ventas por hora del día');
    table(['Hora', 'Pedidos', 'Ventas', '%'], hours.map((h) => [hourLabel(h.hour), int(h.orders), money(h.sales), share(pct(h.sales, s.sales))]), { right: [1, 2, 3] });
  }

  const peaks = [...r.heatmap].sort((a, b) => b.orders - a.orders).slice(0, 8);
  if (peaks.length) {
    section('Horas pico (más pedidos)');
    table(['Día', 'Hora', 'Pedidos', 'Ventas'], peaks.map((x) => [WEEKDAYS[x.weekday], hourLabel(x.hour), int(x.orders), money(x.sales)]), { right: [2, 3] });
  }

  if (r.extras.length) {
    section('Extras y opciones más elegidas');
    table(['Grupo', 'Opción', 'Veces', 'Ventas extra'], r.extras.slice(0, 15).map((x) => [x.group, x.name, int(x.times), money(x.sales)]), { right: [2, 3] });
  }

  if (r.neighborhoods.length) {
    section('Pedidos a domicilio por colonia');
    table(['Colonia', 'Pedidos', 'Ventas'], r.neighborhoods.slice(0, 15).map((x) => [x.name, int(x.orders), money(x.sales)]), { right: [1, 2] });
  }

  section('Pedidos no concretados');
  table(['Tipo', 'Motivo', 'Pedidos', 'Valor'], [
    ...r.losses.map((x) => [x.type === 'CANCELLED' ? 'Cancelado' : 'Rechazado', x.reason, int(x.orders), money(x.value)]),
    ...(s.openOrders ? [['En curso', 'Aún no entregados (no cuentan como venta)', int(s.openOrders), money(s.openValue)]] : []),
  ], { foot: ['Total', '', int(s.cancelledOrders + s.rejectedOrders), money(s.cancelledValue + s.rejectedValue)], right: [2, 3] });

  // Pie de página
  const pages = doc.getNumberOfPages();
  const generated = new Intl.DateTimeFormat('es-HN', { timeZone: r.range.timezone, dateStyle: 'medium', timeStyle: 'short' }).format(new Date(r.range.generatedAt));
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    const h = doc.internal.pageSize.getHeight();
    doc.text(`Generado ${generated} · Ventas = pedidos entregados (incluye envío)`, M, h - 20);
    doc.text(`Página ${i} de ${pages}`, W - M, h - 20, { align: 'right' });
  }
  return doc.output('blob');
}
