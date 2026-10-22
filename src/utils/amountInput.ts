import type { ChangeEvent } from "react";

type AmountSetter = (amount: number) => void;
type TextSetter = (amount: string) => void;

function restoreCaret(input: HTMLInputElement, formatted: string, meaningfulCharactersBeforeCaret: number, meaningfulCharacterPattern: RegExp) {
  requestAnimationFrame(() => {
    if (!input.isConnected || document.activeElement !== input) return;
    let position = 0;
    let count = 0;
    while (position < formatted.length && count < meaningfulCharactersBeforeCaret) {
      if (meaningfulCharacterPattern.test(formatted[position])) count += 1;
      position += 1;
    }
    input.setSelectionRange(position, position);
  });
}

function groupIntegerDigits(digits: string) {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export function formatIntegerAmount(amount: number) {
  const normalized = Math.max(0, Math.trunc(Number(amount) || 0));
  return normalized ? groupIntegerDigits(String(normalized)) : "";
}

export function handleIntegerAmountInput(event: ChangeEvent<HTMLInputElement>, setAmount: AmountSetter) {
  const input = event.currentTarget;
  const caret = input.selectionStart ?? input.value.length;
  const digitsBeforeCaret = input.value.slice(0, caret).replace(/\D/g, "").length;
  const digits = input.value.replace(/\D/g, "");
  const formatted = groupIntegerDigits(digits);
  setAmount(digits ? Number(digits) : 0);
  restoreCaret(input, formatted, digitsBeforeCaret, /\d/);
}

function normalizeDecimalAmount(value: string) {
  const clean = value.replace(/,/g, "").replace(/[^\d.]/g, "");
  const decimalIndex = clean.indexOf(".");
  if (decimalIndex < 0) return clean;
  return `${clean.slice(0, decimalIndex)}.${clean.slice(decimalIndex + 1).replace(/\./g, "")}`;
}

export function formatDecimalAmountText(value: string | number) {
  const clean = normalizeDecimalAmount(String(value));
  const decimalIndex = clean.indexOf(".");
  if (decimalIndex < 0) return groupIntegerDigits(clean);
  return `${groupIntegerDigits(clean.slice(0, decimalIndex))}.${clean.slice(decimalIndex + 1)}`;
}

export function parseDecimalAmountText(value: string) {
  return Number(value.replace(/,/g, "")) || 0;
}

export function handleDecimalAmountInput(event: ChangeEvent<HTMLInputElement>, setAmount: TextSetter) {
  const input = event.currentTarget;
  const caret = input.selectionStart ?? input.value.length;
  const cleanPrefix = normalizeDecimalAmount(input.value.slice(0, caret));
  const meaningfulCharactersBeforeCaret = cleanPrefix.length;
  const formatted = formatDecimalAmountText(input.value);
  setAmount(formatted);
  restoreCaret(input, formatted, meaningfulCharactersBeforeCaret, /[\d.]/);
}
