// What the panel does to a merge request. Each returns an error message, or ""
// when it worked; the panel closes itself after one that changes the screen.

import { exec, run, openOverlay, focused, home } from "herdr";
import { isFork } from "./gitlab.js";
import { git, findRepo, spaceWith, localBranch } from "./repo.js";

export function jump(repos, mr) {
  const wr = spaceWith(repos, mr);
  if (!wr) return `!${mr.iid} is not checked out in any space: c checks it out.`;
  run("space.select", { id: wr.space });
  return "";
}

// The branch in a worktree space: an existing worktree is reused, else the
// branch is fetched and the shipped worktree mod creates one from it.
export async function checkout(repos, mr) {
  const wr = findRepo(repos, mr.project);
  if (!wr) return `No space has a checkout of ${mr.project}: open the repository first.`;
  const branch = localBranch(mr);

  const list = await git(wr.top, ["worktree", "list", "--porcelain"]);
  if (!list.ok) return list.err;
  const existing = list.out.split(/\n\n+/).find((block) => block.split("\n").includes(`branch refs/heads/${branch}`));
  if (existing) {
    const path = existing.split("\n")[0].slice("worktree ".length);
    const shown = repos.find((r) => r.top === path);
    run(shown ? "space.select" : "space.new", shown ? { id: shown.space } : { folder: path });
    return "";
  }

  if (isFork(mr)) {
    const r = await git(wr.top, ["fetch", wr.remote, `+refs/merge-requests/${mr.iid}/head:refs/heads/${branch}`]);
    if (!r.ok) return r.err;
  } else {
    const r = await git(wr.top, ["fetch", wr.remote, branch]);
    if (!r.ok) return r.err;
    // An existing local branch is left as it is: pulling is the person's call.
    if (!(await git(wr.top, ["show-ref", "--verify", "--quiet", `refs/heads/${branch}`])).ok) {
      const b = await git(wr.top, ["branch", "--track", branch, `${wr.remote}/${branch}`]);
      if (!b.ok) return b.err;
    }
  }
  openOverlay({ mod: "worktree", kind: "dialog", width: 440, height: 260, props: { folder: wr.top, branch, action: "new" } });
  return "";
}

// tuicr in a new tab of the space holding the repository, else of this space.
export function review(repos, mr) {
  const wr = findRepo(repos, mr.project);
  run("tab.new", {
    space: wr?.space ?? focused()?.space,
    folder: wr?.top ?? home(),
    name: `review !${mr.iid}`,
    argv: ["tuicr", "mr", mr.url],
  });
  return "";
}

export async function openInBrowser(mr) {
  const r = await exec("open", [mr.url]);
  return r.code === 0 ? "" : r.stderr.trim() || "open failed.";
}

export async function copyLink(mr) {
  const r = await exec("sh", ["-c", 'printf %s "$1" | pbcopy', "sh", mr.url]);
  return r.code === 0 ? "" : r.stderr.trim() || "pbcopy failed.";
}

export async function clipboard() {
  const r = await exec("pbpaste", []);
  return r.code === 0 ? r.stdout.trim() : "";
}
