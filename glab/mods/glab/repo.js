// Which local spaces hold which GitLab projects and branches.
// Phase 1 covers spaces on this computer only.

import { hc, spaces, panes } from "herdr";
import { isFork } from "./gitlab.js";

// Through herdr-core, where the terminals run: git then has the person's
// terminal environment and macOS permissions. The app's own process may be
// refused files an ssh config includes (1Password's agent config lives in
// another app's Group Container), which breaks `git fetch` over ssh.
async function git(cwd, args) {
  try {
    const r = await hc(["exec", "git", "-C", cwd, ...args]);
    return { ok: r.code === 0, out: r.stdout.trim(), err: (r.stderr || r.stdout).trim() };
  } catch (error) {
    return { ok: false, out: "", err: String(error) };
  }
}

// Where a space is now: its first terminal's live folder, else where it was made.
function place(s) {
  const tabs = new Set(s.tabs.map((t) => t.id));
  return panes().find((p) => tabs.has(p.tab) && p.cwd)?.cwd || s.folder || null;
}

// A git remote URL as { host, project }, both lowercase: https://, ssh:// and
// scp-style user@host:path all reduce to the same pair.
export function parseRemote(raw) {
  let host, path;
  const s = raw.trim();
  if (s.includes("://")) {
    const m = s.match(/^[a-z+]+:\/\/(?:[^@/]*@)?([^/:]+)(?::\d+)?\/(.*)$/i);
    if (!m) return null;
    [, host, path] = m;
  } else {
    const m = s.match(/^(?:[^@]*@)?([^:]+):(.*)$/);
    if (!m) return null;
    [, host, path] = m;
  }
  const project = path.replace(/^\/+|\/+$/g, "").replace(/\.git$/, "");
  return host && project ? { host: host.toLowerCase(), project: project.toLowerCase() } : null;
}

// Every local space in a checkout of a repo on `host`:
// { space, top, linked, branch, remotes: [{ name, project }] }.
export async function scanSpaces(host) {
  const out = [];
  for (const s of spaces().filter((s) => !s.machine)) {
    const cwd = place(s);
    if (!cwd) continue;
    const [top, common, branch, remotes] = await Promise.all([
      git(cwd, ["rev-parse", "--show-toplevel"]),
      git(cwd, ["rev-parse", "--path-format=absolute", "--git-common-dir"]),
      git(cwd, ["branch", "--show-current"]),
      git(cwd, ["remote", "-v"]),
    ]);
    if (!top.ok) continue;
    const seen = new Map();
    for (const line of remotes.out.split("\n")) {
      const [name, url] = line.split(/\s+/);
      const r = url && parseRemote(url);
      if (r && r.host === host.toLowerCase() && !seen.has(name)) seen.set(name, { name, project: r.project });
    }
    if (!seen.size) continue;
    const main = common.out.replace(/\/\.git$/, "");
    out.push({ space: s.id, top: top.out, linked: common.ok && main !== top.out, branch: branch.out, remotes: [...seen.values()] });
  }
  return out;
}

const remoteFor = (wr, project) => wr.remotes.find((r) => r.project === project.toLowerCase())?.name;

// The local branch an MR is checked out as: its source branch, or mr/<iid>
// for a fork (whose source branch name may clash with ours).
export const localBranch = (mr) => (isFork(mr) ? `mr/${mr.iid}` : mr.sourceBranch);

// The space that has this MR's branch checked out.
export function spaceWith(repos, mr) {
  return repos.find((wr) => remoteFor(wr, mr.project) && wr.branch === localBranch(mr));
}

// A local checkout of the MR's project and the remote pointing at it,
// preferring a main checkout over linked worktrees.
export function findRepo(repos, project) {
  const found = repos.filter((wr) => remoteFor(wr, project));
  const wr = found.find((w) => !w.linked) ?? found[0];
  return wr ? { ...wr, remote: remoteFor(wr, project) } : null;
}

export { git };
