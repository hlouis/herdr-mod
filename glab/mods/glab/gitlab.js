// GitLab access: GraphQL over `fetch`, with the token from config.js.
// Queries and derived fields follow hlouis/herdr-glab doc/design.md §4.

const FRAGMENT = `
fragment mr on MergeRequest {
  iid title webUrl draft state updatedAt
  sourceBranch targetBranch
  detailedMergeStatus
  approvalsLeft
  resolvableDiscussionsCount resolvedDiscussionsCount
  author { username }
  project { fullPath avatarUrl }
  sourceProject { fullPath }
  headPipeline { status }
  approvedBy { nodes { username } }
  reviewers { nodes { username mergeRequestInteraction { approved } } }
}`;

// The three "related to me" lists. A list with no more pages is skipped
// through @include, so paging refetches only what is left.
const MINE = `
query($withAuthored: Boolean!, $withReview: Boolean!, $withAssigned: Boolean!,
      $authoredAfter: String, $reviewAfter: String, $assignedAfter: String) {
  currentUser {
    username
    authoredMergeRequests(state: opened, first: 50, after: $authoredAfter) @include(if: $withAuthored) {
      pageInfo { hasNextPage endCursor } nodes { ...mr }
    }
    reviewRequestedMergeRequests(state: opened, first: 50, after: $reviewAfter) @include(if: $withReview) {
      pageInfo { hasNextPage endCursor } nodes { ...mr }
    }
    assignedMergeRequests(state: opened, first: 50, after: $assignedAfter) @include(if: $withAssigned) {
      pageInfo { hasNextPage endCursor } nodes { ...mr }
    }
  }
}` + FRAGMENT;

// GitLab has no "merge requests mentioning me" list: pending mention todos are
// the only per-user view of them.
const MENTIONED = `
query($after: String) {
  currentUser {
    todos(action: [mentioned, directly_addressed], type: [MERGEREQUEST], state: [pending], first: 50, after: $after) {
      pageInfo { hasNextPage endCursor }
      nodes { target { ... on MergeRequest { ...mr } } }
    }
  }
}` + FRAGMENT;

const ONE = `
query($project: ID!, $iid: String!) {
  project(fullPath: $project) { mergeRequest(iid: $iid) { ...mr } }
}` + FRAGMENT;

const DISCUSSIONS = `
query($project: ID!, $iid: String!, $after: String) {
  project(fullPath: $project) {
    mergeRequest(iid: $iid) {
      discussions(first: 20, after: $after) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id resolved resolvable
          notes(first: 20) {
            nodes { system createdAt body author { username } position { filePath oldLine newLine } }
          }
        }
      }
    }
  }
}`;

const RESOLVE = `
mutation($id: DiscussionID!, $resolve: Boolean!) {
  discussionToggleResolve(input: { id: $id, resolve: $resolve }) { errors }
}`;

const WHO = `query { currentUser { username } }`;

// Refused credentials, told apart so the panel can offer its settings.
export class AuthError extends Error {}

// One GraphQL request to the instance in `conn` ({ url, token }).
async function graphql(conn, query, variables = {}) {
  let r;
  try {
    r = await fetch(`${conn.url}/api/graphql`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${conn.token}` },
      body: JSON.stringify({ query, variables }),
    });
  } catch (e) {
    throw new Error(`Can't reach ${conn.url}: ${e?.message ?? e}`);
  }
  if (r.status === 401) throw new AuthError("The token was refused: expired, revoked, or missing the api scope.");
  if (!r.ok) throw new Error(`${conn.url} answered HTTP ${r.status}.`);
  let resp;
  try { resp = await r.json(); } catch { throw new Error(`${conn.url} didn't answer like GitLab: is the URL right?`); }
  if (resp.errors?.length) throw new Error(`GraphQL: ${resp.errors.map((e) => e.message).join("; ")}`);
  return resp.data;
}

// Who the token signs in as; GitLab answers null for no user at all.
export async function whoAmI(conn) {
  const user = (await graphql(conn, WHO)).currentUser;
  if (!user) throw new AuthError("The token was refused: expired, revoked, or missing the api scope.");
  return user.username;
}

function convert(n) {
  return {
    roles: [],
    iid: Number(n.iid),
    title: n.title,
    url: n.webUrl,
    project: n.project.fullPath,
    projectAvatar: n.project.avatarUrl ?? "",
    sourceProject: n.sourceProject?.fullPath ?? n.project.fullPath,
    sourceBranch: n.sourceBranch,
    targetBranch: n.targetBranch,
    draft: n.draft,
    state: n.state,
    author: n.author?.username ?? "",
    updatedAt: Date.parse(n.updatedAt),
    mergeStatus: n.detailedMergeStatus ?? "",
    pipeline: n.headPipeline?.status ?? "",
    approvalsLeft: n.approvalsLeft ?? 0,
    approvedBy: (n.approvedBy?.nodes ?? []).map((a) => a.username),
    threadsTotal: n.resolvableDiscussionsCount,
    threadsUnresolved: Math.max(n.resolvableDiscussionsCount - n.resolvedDiscussionsCount, 0),
    reviewers: (n.reviewers?.nodes ?? []).map((r) => ({ username: r.username, approved: r.mergeRequestInteraction?.approved ?? false })),
  };
}

// Every opened MR the user authored, is assigned to, is asked to review, or is
// mentioned in, merged by URL; `roles` says which of those apply.
export async function fetchMine(conn) {
  const lists = [
    { role: "author", include: "withAuthored", after: "authoredAfter", key: "authoredMergeRequests" },
    { role: "reviewer", include: "withReview", after: "reviewAfter", key: "reviewRequestedMergeRequests" },
    { role: "assignee", include: "withAssigned", after: "assignedAfter", key: "assignedMergeRequests" },
  ];
  let username = "";
  const nodes = [];
  while (lists.some((l) => !l.done)) {
    const vars = {};
    for (const l of lists) {
      vars[l.include] = !l.done;
      if (l.cursor) vars[l.after] = l.cursor;
    }
    const data = await graphql(conn, MINE, vars);
    if (!data.currentUser) throw new AuthError("The token was refused: expired, revoked, or missing the api scope.");
    username = data.currentUser.username;
    for (const l of lists) {
      if (l.done) continue;
      const page = data.currentUser[l.key];
      if (!page) { l.done = true; continue; }
      for (const n of page.nodes) nodes.push([l.role, n]);
      l.cursor = page.pageInfo.endCursor;
      l.done = !page.pageInfo.hasNextPage;
    }
  }
  for (let after = null; ;) {
    const todos = (await graphql(conn, MENTIONED, { after })).currentUser.todos;
    // A todo outlives its MR being merged or closed.
    for (const t of todos.nodes) if (t.target?.state === "opened") nodes.push(["mentioned", t.target]);
    if (!todos.pageInfo.hasNextPage) break;
    after = todos.pageInfo.endCursor;
  }
  const byUrl = new Map();
  for (const [role, n] of nodes) {
    const mr = byUrl.get(n.webUrl) ?? convert(n);
    if (!mr.roles.includes(role)) mr.roles.push(role);
    byUrl.set(n.webUrl, mr);
  }
  return { username, mrs: [...byUrl.values()] };
}

// One MR by project and iid, whatever its state.
export async function fetchOne(conn, project, iid) {
  const data = await graphql(conn, ONE, { project, iid: String(iid) });
  const n = data.project?.mergeRequest;
  if (!n) throw new Error(`${project}!${iid} not found.`);
  return convert(n);
}

// The resolvable review threads of an MR, without system notes.
export async function fetchDiscussions(conn, project, iid) {
  const out = [];
  for (let after = null; ;) {
    const data = await graphql(conn, DISCUSSIONS, { project, iid: String(iid), after });
    const page = data.project?.mergeRequest?.discussions;
    if (!page) return out;
    for (const d of page.nodes) {
      if (!d.resolvable) continue;
      const notes = d.notes.nodes.filter((n) => !n.system);
      if (!notes.length) continue;
      const pos = notes.find((n) => n.position)?.position;
      out.push({
        id: d.id,
        resolved: d.resolved,
        file: pos?.filePath ?? "",
        line: pos?.newLine ?? pos?.oldLine ?? 0,
        notes: notes.map((n) => ({ author: n.author?.username ?? "", body: n.body, at: Date.parse(n.createdAt) })),
      });
    }
    if (!page.pageInfo.hasNextPage) return out;
    after = page.pageInfo.endCursor;
  }
}

export async function resolveDiscussion(conn, id, resolve) {
  const data = await graphql(conn, RESOLVE, { id, resolve });
  const errors = data.discussionToggleResolve?.errors ?? [];
  if (errors.length) throw new Error(errors.join("; "));
}

// GitLab groups nest, so the project is everything between the host and `/-/`.
export function parseMrUrl(raw) {
  const m = raw.trim().match(/^https?:\/\/([^/\s]+)\/(.+?)\/-\/merge_requests\/(\d+)(?:[/#?]\S*)?$/);
  return m ? { host: m[1].toLowerCase(), project: m[2], iid: Number(m[3]) } : null;
}

export const isFork = (mr) => mr.sourceProject.toLowerCase() !== mr.project.toLowerCase();
