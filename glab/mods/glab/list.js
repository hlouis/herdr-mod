// The list page: MRs grouped by why they concern you, two lines each.

import { div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { icon, avatar, projectAvatar, pipelineIcon, pipelineLabel, ago, chip, iconButton } from "./ui.js";

const base = (project) => project.split("/").pop();
export const MERGE_PROBLEM = { NEED_REBASE: "rebase", CONFLICT: "conflict" };
export const pendingReviewers = (mr) => mr.reviewers.filter((r) => !r.approved && !mr.approvedBy.includes(r.username)).map((r) => r.username);

// Group heading, as the agents list draws its own: click folds it.
function groupHead(v, t, g) {
  const open = !v.folded.has(g.role);
  return h_flex().id(`group-${g.role}`).px(8).pt(8).h(30).gap(6).items_center().text_size(11).font_medium()
    .cursor_pointer().hover((s) => s.text_color(t.foreground))
    .on_click((_e, cx) => { open ? v.folded.add(g.role) : v.folded.delete(g.role); cx.notify(); })
    .child(div().text_color(t.dim).child(g.title))
    .child(div().text_color(t.dim).child(String(g.count)))
    .child(div().flex_1())
    .when(!open, (el) => el.child(icon("chevron-right", 11, t.dim)));
}

// Who approved, then who still owes a review (outlined).
function approvals(t, mr) {
  const pending = pendingReviewers(mr);
  if (!mr.approvedBy.length && !pending.length) return null;
  return h_flex().id(`appr-${mr.url}`).gap(2).items_center().flex_none()
    .tooltip([mr.approvedBy.length ? `Approved by ${mr.approvedBy.join(", ")}` : "", pending.length ? `Waiting on ${pending.join(", ")}` : ""].filter(Boolean).join(" · "))
    .children([
      ...mr.approvedBy.slice(0, 3).map((u) => avatar(u, 14)),
      ...pending.slice(0, 3).map((u) => avatar(u, 14, { pending: true, t })),
    ]);
}

function mrRow(v, t, mr) {
  // The keyboard's row shows only while the panel has the keyboard.
  const selected = v.sel === mr.url && v.hasKeys();
  const hovered = v.hovered === mr.url;
  const local = v.localState(mr);
  return v_flex().id(`mr-${mr.url}`).px(8).py(6).gap(4).rounded(8).cursor_pointer()
    .when(selected, (el) => el.bg(t.selected))
    .hover((s) => s.bg(selected ? t.selected : t.hover))
    .on_hover((on, cx) => {
      if (on) v.hovered = mr.url;
      else if (v.hovered === mr.url) v.hovered = null;
      cx.notify();
    })
    .on_click((_e, cx) => { v.sel = mr.url; v.openDetail(cx); cx.notify(); })
    .child(h_flex().gap(7).items_center().min_w(0)
      .child(div().id(`pl-${mr.url}`).flex_none().tooltip(`Pipeline ${pipelineLabel(mr.pipeline)}`).child(pipelineIcon(t, mr.pipeline)))
      .child(div().flex_1().min_w(0).truncate().text_size(12.8).text_color(mr.draft ? t.muted : t.foreground).child(mr.title))
      .when(mr.draft, (el) => el.child(chip(t, "draft"))))
    .child(h_flex().pl(21).gap(7).items_center().min_w(0).text_size(11).text_color(t.dim)
      .child(projectAvatar(mr.project, v.projectAvatarPath(mr), 14))
      .child(div().min_w(0).flex_shrink_1().truncate().child(`${base(mr.project)} !${mr.iid}`))
      .when(mr.threadsTotal > 0, (el) => el.child(h_flex().id(`th-${mr.url}`).flex_none().gap(3).items_center()
        .tooltip(`${mr.threadsTotal - mr.threadsUnresolved} of ${mr.threadsTotal} threads resolved`)
        .text_color(mr.threadsUnresolved ? t.ansi3 : t.dim)
        .child(icon("message-square", 11)).child(`${mr.threadsTotal - mr.threadsUnresolved}/${mr.threadsTotal}`)))
      .when(Boolean(approvals(t, mr)), (el) => el.child(approvals(t, mr)))
      .when(mr.approvalsLeft > 0, (el) => el.child(div().flex_none().text_color(t.ansi3).child(`+${mr.approvalsLeft}`)))
      .when(Boolean(MERGE_PROBLEM[mr.mergeStatus]), (el) => el.child(chip(t, MERGE_PROBLEM[mr.mergeStatus], t.ansi1)))
      .when(local !== "none", (el) => el.child(div().id(`loc-${mr.url}`).flex_none()
        .tooltip(local === "checked-out" ? "Checked out in a space" : "Repository open in a space")
        .child(icon(local === "checked-out" ? "git-branch" : "folder-git-2", 12, local === "checked-out" ? t.accent : t.dim))))
      .child(div().flex_1())
      .child(hovered
        ? h_flex().flex_none().gap(1).items_center()
          .child(local === "checked-out"
            ? iconButton(t, `go-${mr.url}`, "square-arrow-right", "Go to its space", (_e, cx) => v.act(cx, "jump", mr), 13)
            : iconButton(t, `co-${mr.url}`, "git-branch-plus", "Check out in a worktree", (_e, cx) => v.act(cx, "checkout", mr), 13))
          .child(iconButton(t, `rv-${mr.url}`, "eye", "Review in tuicr", (_e, cx) => v.act(cx, "review", mr), 13))
          .child(iconButton(t, `br-${mr.url}`, "external-link", "Open in the browser", (_e, cx) => v.act(cx, "browser", mr), 13))
        : div().flex_none().child(ago(mr.updatedAt))));
}

export function listRows(v, t) {
  const rows = [];
  for (const g of v.groups()) {
    rows.push({ key: `group-${g.role}`, el: groupHead(v, t, g) });
    if (v.folded.has(g.role)) continue;
    for (const mr of g.mrs) rows.push({ key: mr.url, el: mrRow(v, t, mr) });
  }
  return rows;
}

export function emptyList(v, t) {
  const text = v.loading && !v.data().fetchedAt ? "Loading merge requests…" : v.search ? "Nothing matches." : "No open merge requests concern you.";
  return div().p(14).text_size(12).text_color(t.dim).child(text);
}
