import { randomBytes } from "crypto";

export function randomBytes32(): `0x${string}` {
  return `0x${randomBytes(32).toString("hex")}`;
}