// The GitLab connection: { url, token } in ~/.config/herdr-app/glab.json,
// readable only by you, as glab keeps its own token when no keyring is used.
// Outside the mod's folder, so syncing or committing the mod never touches it.

import { appHome, readTextFile, exec } from "herdr";
import * as fs from "fs/promises";

export const GITLAB_COM = "https://gitlab.com";
export const configPath = () => `${appHome()}/glab.json`;

// "gitlab.example.com/" → "https://gitlab.example.com"
export function normalizeUrl(raw) {
  const s = raw.trim().replace(/\/+$/, "");
  return /^https?:\/\//i.test(s) ? s : `https://${s}`;
}

export const hostOf = (url) => url.replace(/^https?:\/\//i, "").split("/")[0].toLowerCase();

export async function loadConfig() {
  const text = await readTextFile(configPath());
  if (!text) return null;
  const c = JSON.parse(text);
  return c.url && c.token ? { url: normalizeUrl(c.url), token: c.token } : null;
}

// The file is created mode 600 before anything is written to it; writing an
// existing file keeps its mode. The token never goes on a command line.
export async function saveConfig(conn) {
  const path = configPath();
  const r = await exec("sh", ["-c", 'umask 077 && : >> "$1" && chmod 600 "$1"', "sh", path]);
  if (r.code !== 0) throw new Error(`Can't create ${path}: ${r.stderr.trim()}`);
  await fs.writeFile(path, `${JSON.stringify({ url: conn.url, token: conn.token }, null, 2)}\n`);
}

export async function clearConfig() {
  await fs.unlink(configPath());
}
