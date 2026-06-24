/**
 * Parses a size value (number=%, "50%", "240px", "20em", "10rem", "30vh", "20vw")
 * into a percentage or pixels relative to the group's pixel size along the active axis.
 *
 * Returns null when the value can't be parsed.
 */
export function sizeToPercent(
  value: number | string | null | undefined,
  groupPx: number,
  rootEl: HTMLElement,
): number | null {
  const px = sizeToPixels(value, groupPx, rootEl);
  return px == null || groupPx <= 0 ? null : (px / groupPx) * 100;
}

export function sizeToPixels(
  value: number | string | null | undefined,
  groupPx: number,
  rootEl: HTMLElement,
): number | null {
  if (value == null || value === "") return null;
  if (typeof value === "number") return (value / 100) * groupPx;
  const trimmed = value.trim();
  if (trimmed === "") return null;

  const m = /^(-?\d*\.?\d+)\s*([a-z%]*)$/i.exec(trimmed);
  if (!m) return null;
  const n = Number.parseFloat(m[1]!);
  if (Number.isNaN(n)) return null;
  const unit = (m[2] || "%").toLowerCase();

  if (groupPx <= 0) return null;
  switch (unit) {
    case "%":
      return (n / 100) * groupPx;
    case "px":
      return n;
    case "em":
    case "rem": {
      const fontSize =
        unit === "rem"
          ? Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
          : Number.parseFloat(getComputedStyle(rootEl).fontSize) || 16;
      return n * fontSize;
    }
    case "vh":
      return (n * window.innerHeight) / 100;
    case "vw":
      return (n * window.innerWidth) / 100;
    default:
      return null;
  }
}
