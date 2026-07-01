import { randomUUID } from "node:crypto";

export function id(prefix) {
  return `${prefix}_${randomUUID()}`;
}

export function confirmationNumber(sequence) {
  return `PMS-2026-${String(sequence).padStart(5, "0")}`;
}
