export function sanitizeName(name: string): string {
  const withoutControls = Array.from(
    name.normalize("NFC").replace(/[<>:"/\\|?*]/g, "_"),
    (character) => {
      const codePoint = character.codePointAt(0) || 0;
      return codePoint <= 31 || codePoint === 127 ? "_" : character;
    },
  ).join("");
  const sanitized = withoutControls
    .replace(/\s+/g, " ")
    .replace(/[ .]+$/g, "")
    .trim()
    .slice(0, 80);
  return sanitized || "podcast";
}

export function timestamp(date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(
    date.getHours(),
  )}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

export function baseFilename(name: string, date = new Date()): string {
  return `${timestamp(date)}_${sanitizeName(name)}`;
}
