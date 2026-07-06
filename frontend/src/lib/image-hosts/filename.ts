import { v4 as uuidv4 } from "uuid";

export function buildObjectKey(file: File): string {
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const dot = file.name.lastIndexOf(".");
  const ext = dot > 0 ? file.name.slice(dot + 1).toLowerCase() : "bin";
  return `${yyyy}/${mm}/${uuidv4()}.${ext}`;
}
