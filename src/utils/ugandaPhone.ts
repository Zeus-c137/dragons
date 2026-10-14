export function normalizeUgandaPhone(value: string): string {
  const digits = value.replace(/\D/g, "");
  return digits.startsWith("256") ? `0${digits.slice(3)}` : digits;
}

export function isValidUgandaPhone(value: string): boolean {
  return /^\d{9,10}$/.test(normalizeUgandaPhone(value));
}

export function formatUgandaPhoneInput(value: string): string {
  const digits = value.replace(/\D/g, "");
  const normalized = normalizeUgandaPhone(value);
  const local = normalized.length === 9 ? `0${normalized}` : normalized;
  if (!/^0\d{9}$/.test(local)) return value;

  if (digits.startsWith("256")) {
    const national = digits.slice(3);
    return `+256 ${national.slice(0, 3)} ${national.slice(3, 6)} ${national.slice(6)}`;
  }

  return `${local.slice(0, 4)} ${local.slice(4, 7)} ${local.slice(7)}`;
}
