import type { GithubConfig, ImageHostEngine, UploadResult } from "./types";
import { buildObjectKey } from "./filename";

async function fileToBase64(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

export const githubEngine: ImageHostEngine<GithubConfig> = {
  id: "github",
  label: "GitHub",
  isConfigured: (c) => Boolean(c && c.repo && c.branch && c.accessToken),
  async upload(file: File, config: GithubConfig): Promise<UploadResult> {
    const path = buildObjectKey(file);
    const url = `https://api.github.com/repos/${config.repo}/contents/${path}`;
    const body = {
      message: `upload ${path}`,
      branch: config.branch,
      content: await fileToBase64(file),
    };
    const res = await fetch(url, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${config.accessToken}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error((err as { message?: string }).message || `GitHub upload failed (${res.status})`);
    }
    const json = (await res.json()) as { content?: { download_url?: string; path?: string } };
    const downloadUrl = json.content?.download_url;
    if (!downloadUrl) throw new Error("GitHub response missing download_url");
    const finalUrl = config.useCDN
      ? `https://cdn.jsdelivr.net/gh/${config.repo}@${config.branch}/${path}`
      : downloadUrl;
    return { url: finalUrl, pathname: path };
  },
};
