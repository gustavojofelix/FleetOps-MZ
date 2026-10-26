/** Builds a CSV string (RFC 4180 quoting) with a UTF-8 BOM so Excel opens accents correctly. */
export function toCsv(headers: readonly string[], rows: readonly (readonly (string | number | null | undefined)[])[], separator = ';'): string {
  const escape = (value: string | number | null | undefined): string => {
    if (value === null || value === undefined) return '';
    const text = String(value);
    return /[";\n\r,]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const lines = [headers, ...rows].map((row) => row.map(escape).join(separator));
  return `﻿${lines.join('\r\n')}`;
}

/** Triggers a local download; nothing leaves the browser. */
export function downloadCsv(fileName: string, headers: readonly string[], rows: readonly (readonly (string | number | null | undefined)[])[]): void {
  const blob = new Blob([toCsv(headers, rows)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName.endsWith('.csv') ? fileName : `${fileName}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
