/**
 * Strip lone surrogates and C0 control chars (except TAB/LF/CR)
 * before content leaves the editor. Pydantic v2 rejects invalid Unicode.
 */
export function stripUnsafeUnicode(value: string): string {
  let out = "";
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code === 9 || code === 10 || code === 13) {
      out += value[i];
      continue;
    }
    if (code < 0x20 || code === 0x7f) continue;
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        out += value[i] + value[i + 1];
        i++;
        continue;
      }
      continue; // lone high surrogate
    }
    if (code >= 0xdc00 && code <= 0xdfff) continue; // lone low surrogate
    out += value[i];
  }
  return out;
}
