/**
 * Parses a size value (number=%, "50%", "240px", "20em", "10rem", "30vh", "20vw")
 * into a percentage relative to the group's pixel size along the active axis.
 *
 * Returns null when the value can't be parsed.
 */
export function sizeToPercent(
  value: number | string | null | undefined,
  groupPx: number,
  rootEl: HTMLElement,
): number | null {
  if (value == null || value === "") return null;
  if (typeof value === "number") return value;
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
      return n;
    case "px":
      return (n / groupPx) * 100;
    case "em":
    case "rem": {
      const fontSize =
        unit === "rem"
          ? Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
          : Number.parseFloat(getComputedStyle(rootEl).fontSize) || 16;
      return ((n * fontSize) / groupPx) * 100;
    }
    case "vh":
      return ((n * window.innerHeight) / 100 / groupPx) * 100;
    case "vw":
      return ((n * window.innerWidth) / 100 / groupPx) * 100;
    default:
      return null;
  }
}
