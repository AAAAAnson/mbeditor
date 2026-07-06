import api from "@/lib/api";
import type { ApiResponse } from "@/types";

/** Configured appids (secrets never returned). [] on any error. */
export async function getCredentials(): Promise<string[]> {
  const res = await api.get<ApiResponse<{ configured: string[] }>>("/settings/credentials");
  return res.data.code === 0 ? res.data.data.configured : [];
}

/** Persist (non-empty) or clear ("") the secret for an appid, server-side. */
export async function putCredential(appid: string, appsecret: string): Promise<void> {
  await api.put<ApiResponse<unknown>>("/settings/credentials", { appid, appsecret });
}
