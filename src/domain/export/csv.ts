import type { Rate } from "../stats/types";

/**
 * CSV para o Excel em português: separador `;` (o Excel pt-BR usa vírgula decimal), decimais com
 * vírgula, BOM UTF-8 (acentos) e CRLF. Base comum dos relatórios em CSV.
 */
export const SEP = ";";
export const EOL = "\r\n";
export const BOM = "﻿";

export type Cell = string | number | null;

/** Texto seguro: neutraliza fórmulas (=, +, -, @) e põe entre aspas quando precisa. */
export function text(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[;"\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

const decimal = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1).replace(".", ","));

export function cell(value: Cell): string {
  if (value === null) return "";
  return typeof value === "number" ? decimal(value) : text(value);
}

/** Porcentagem com 1 casa (62,5); null quando não há base de cálculo. */
export const pct = (value: Rate | number | null): number | null => {
  const n = value !== null && typeof value === "object" ? value.pct : value;
  return n === null ? null : Math.round(n * 1000) / 10;
};

export const row = (cells: Cell[]) => cells.map(cell).join(SEP);

export const document = (lines: string[]) => BOM + lines.join(EOL) + EOL;
