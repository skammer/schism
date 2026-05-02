import { PRECISION } from "./constants.js";

export function roundTo(value: number, decimals: number = PRECISION): number {
  return Number.parseFloat(value.toFixed(decimals));
}

export function compareNumbersWithTolerance(
  actual: number,
  expected: number,
  fractionDigits: number = PRECISION,
): number {
  return Math.sign(roundTo(actual, fractionDigits) - roundTo(expected, fractionDigits));
}

export function areNumbersAlmostEqual(
  actual: number,
  expected: number,
  fractionDigits: number = PRECISION,
): boolean {
  return compareNumbersWithTolerance(actual, expected, fractionDigits) === 0;
}

export function areArraysEqual<T>(a: readonly T[], b: readonly T[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
