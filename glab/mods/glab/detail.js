// The detail page: one MR's facts, its actions, approvals and review threads.

import { div } from "gpui-kit";
import { h_flex, v_flex, TextView } from "gpui-base";
import { icon, avatar, projectAvatar, pipelineIcon, pipelineLabel, ago, chip, iconButton } from "./ui.js";
import { MERGE_PROBLEM, pendingReviewers } from "./list.js";

const base = (project) => project.split("/").pop();

function sectionHead(t, id, title, extra, onClick, open) {
  return h_flex().id(id).px(14).pt(14).pb(4).gap(6).items_center().text_size(11).font_medium().text_color(t.dim)
    .when(Boolean(onClick), (el) => el.cursor_pointer().hover((s) => s.text_color(t.foreground)).on_click(onClick))
    .child(div().child(title))
    .when(Boolean(extra), (el) => el.child(div().child(extra)))
    .child(div().flex_1())
    .when(open === false, (el) => el.child(icon("chevron-right", 11)));
}

// `onClick` null: shown disabled, `tip` says why.
function button(t, id, name, label, onClick, { primary = false, tip = "" } = {}) {
  return h_flex().id(id).h(28).px(10).gap(6).items_center().rounded(7).text_size(12)
    .when(!onClick, (el) => el.bg(t.raised).text_color(t.dim))
    .when(Boolean(onClick) && primary, (el) => el.cursor_pointer().bg(t.solid).text_color(t.solid_foreground))
    .when(Boolean(onClick) && !primary, (el) => el.cursor_pointer().border_1().border_color(t.border).text_color(t.foreground).hover((s) => s.bg(t.hover)))
    .when(Boolean(onClick), (el) => el.on_click(onClick))
    .when(Boolean(tip), (el) => el.tooltip(tip))
    .child(icon(name, 13)).child(label);
}

function facts(v, t, mr) {
  const local = v.localState(mr);
  return [
    { key: "title", el: v_flex().px(14).pt(12).gap(8)
      .child(div().text_size(15).font_semibold().whitespace_normal().child(mr.title))
      .child(h_flex().gap(6).items_center().text_size(12).text_color(t.muted)
        .child(projectAvatar(mr.project, v.projectAvatarPath(mr), 16))
        .child(div().min_w(0).truncate().child(mr.project))
        .when(mr.draft, (el) => el.child(chip(t, "draft")))
        .when(mr.state && mr.state !== "opened", (el) => el.child(chip(t, mr.state, t.ansi5))))
      .child(h_flex().gap(6).items_center().text_size(12).text_color(t.muted)
        .child(icon("git-branch", 13, t.dim))
        .child(div().min_w(0).whitespace_normal().child(`${mr.sourceBranch} → ${mr.targetBranch}`)))
      .when(mr.roles.length > 0, (el) => el.child(h_flex().gap(4).flex_wrap().children(v.roleTitles(mr).map((r) => chip(t, r)))))
      .child(h_flex().gap(6).items_center().text_size(12).text_color(t.muted)
        .child(avatar(mr.author, 16)).child(mr.author).child(div().text_color(t.dim).child(`· updated ${ago(mr.updatedAt)} ago`)))
      .when(Boolean(mr.pipeline || MERGE_PROBLEM[mr.mergeStatus]), (el) => el.child(h_flex().gap(6).items_center().text_size(12).text_color(t.muted)
        .when(Boolean(mr.pipeline), (el) => el.child(pipelineIcon(t, mr.pipeline, 14)).child(`Pipeline ${pipelineLabel(mr.pipeline)}`))
        .when(Boolean(MERGE_PROBLEM[mr.mergeStatus]), (el) => el.child(chip(t, MERGE_PROBLEM[mr.mergeStatus], t.ansi1))))) },
    { key: "actions", el: h_flex().px(14).pt(12).gap(6).flex_wrap()
      .child(local === "checked-out"
        ? button(t, "dt-jump", "square-arrow-right", "Open space", (_e, cx) => v.act(cx, "jump", mr), { primary: true, tip: "Go to the space that has it  g" })
        : local === "repo"
          ? button(t, "dt-checkout", "git-branch-plus", "Check out", (_e, cx) => v.act(cx, "checkout", mr), { primary: true, tip: "Fetch the branch into a worktree space  c" })
          : button(t, "dt-checkout", "git-branch-plus", "Check out", null, { tip: `No space has a checkout of ${mr.project}` }))
      .child(button(t, "dt-review", "eye", "Review", (_e, cx) => v.act(cx, "review", mr), { tip: "Review in tuicr, in a new tab  r" })) },
  ];
}

function approvalRows(v, t, mr) {
  const pending = pendingReviewers(mr);
  const people = [...mr.approvedBy.map((u) => [u, true]), ...pending.map((u) => [u, false])];
  const rows = [{ key: "appr-head", el: sectionHead(t, "appr-head", "Approvals", mr.approvalsLeft > 0 ? `${mr.approvalsLeft} more required` : "") }];
  if (!people.length) rows.push({ key: "appr-none", el: div().px(14).text_size(12).text_color(t.dim).child("No approvals and no reviewers.") });
  for (const [u, ok] of people) {
    rows.push({ key: `appr-${u}`, el: h_flex().px(14).h(26).gap(8).items_center().text_size(12)
      .child(avatar(u, 18, { pending: !ok, t }))
      .child(div().flex_1().min_w(0).truncate().text_color(ok ? t.foreground : t.muted).child(u))
      .child(icon(ok ? "check" : "clock", 13, ok ? t.ansi2 : t.dim))
      .child(div().text_size(11).text_color(t.dim).child(ok ? "approved" : "pending")) });
  }
  return rows;
}

function threadRow(v, t, th) {
  const d = v.detail;
  const selected = d.threads[d.at] === th && v.hasKeys();
  const open = d.open.has(th.id);
  const first = th.notes[0];
  const where = th.file ? (th.line ? `${th.file.split("/").pop()}:${th.line}` : th.file.split("/").pop()) : "Overall";
  const head = v_flex().gap(3)
    .child(h_flex().gap(7).items_center().min_w(0).text_size(12)
      .child(th.resolved ? icon("circle-check", 13, t.ansi2) : icon("message-square", 13, t.ansi3))
      .child(avatar(first.author, 16))
      .child(div().id(`where-${th.id}`).min_w(0).flex_shrink_1().truncate().text_color(t.muted).tooltip(th.file ? `${th.file}${th.line ? `:${th.line}` : ""}` : "On the whole MR").child(where))
      .child(div().flex_1())
      .when(th.notes.length > 1, (el) => el.child(div().flex_none().text_size(11).text_color(t.dim).child(`${th.notes.length}`)))
      .child(div().flex_none().text_size(11).text_color(t.dim).child(ago(first.at))))
    .when(!open, (el) => el.child(div().pl(20).min_w(0).truncate().text_size(12).text_color(th.resolved ? t.muted : t.foreground).child(first.body.trim().split("\n")[0])));
  return v_flex().id(`th-${th.id}`).mx(6).px(8).py(7).gap(8).rounded(8).cursor_pointer()
    .when(selected, (el) => el.bg(t.selected))
    .hover((s) => s.bg(selected ? t.selected : t.hover))
    .on_click((_e, cx) => { d.at = d.threads.indexOf(th); v.toggleThread(); cx.notify(); })
    .child(head)
    .when(open, (el) => el
      .children(th.notes.map((n, i) => v_flex().pl(20).gap(4)
        .when(i > 0, (el) => el.child(h_flex().gap(6).items_center().text_size(11.5).text_color(t.muted)
          .child(avatar(n.author, 14)).child(n.author).child(div().text_color(t.dim).child(ago(n.at)))))
        .child(TextView.markdown(`note-${th.id}-${i}`, n.body).text_size(12.5).text_color(t.foreground))))
      .child(h_flex().pl(20).child(button(t, `res-${th.id}`, th.resolved ? "rotate-ccw" : "check", th.resolved ? "Reopen" : "Resolve",
        (_e, cx) => { cx.stop_propagation(); d.at = d.threads.indexOf(th); v.resolveThread(cx); }))));
}

function threadRows(v, t) {
  const d = v.detail;
  const all = d.threads ?? [];
  const resolved = all.filter((th) => th.resolved).length;
  const rows = [{ key: "th-head", el: sectionHead(t, "th-head", "Threads", all.length ? `${resolved}/${all.length} resolved` : "") }];
  if (d.error) rows.push({ key: "th-error", el: div().px(14).text_size(12).text_color(t.ansi1).whitespace_normal().child(d.error) });
  else if (d.threads === null) rows.push({ key: "th-loading", el: div().px(14).text_size(12).text_color(t.dim).child("Loading threads…") });
  else if (!all.length) rows.push({ key: "th-none", el: div().px(14).text_size(12).text_color(t.dim).child("No review threads.") });
  for (const th of all.filter((th) => !th.resolved)) rows.push({ key: th.id, el: threadRow(v, t, th) });
  if (resolved) {
    const toggle = (_e, cx) => { d.showResolved = !d.showResolved; cx.notify(); };
    rows.push({ key: "th-resolved", el: sectionHead(t, "th-resolved", "Resolved", String(resolved), toggle, d.showResolved) });
    if (d.showResolved) for (const th of all.filter((th) => th.resolved)) rows.push({ key: th.id, el: threadRow(v, t, th) });
  }
  return rows;
}

export function detailView(v, t) {
  const mr = v.detail.mr;
  return v_flex().flex_1().min_h(0)
    .child(h_flex().h(36).flex_none().px(8).gap(4).items_center().border_b(1).border_color(t.border)
      .child(iconButton(t, "dt-back", "chevron-left", "Back  esc", () => v.closeDetail()))
      .child(div().text_size(12).text_color(t.muted).child(`${base(mr.project)} !${mr.iid}`))
      .child(div().flex_1())
      .child(iconButton(t, "dt-copy", "copy", "Copy link  y", (_e, cx) => v.act(cx, "copy", mr)))
      .child(iconButton(t, "dt-browser", "external-link", "Open in the browser  o", (_e, cx) => v.act(cx, "browser", mr))))
    .child(v.detailScroll.render(t, [
      ...facts(v, t, mr),
      ...approvalRows(v, t, mr),
      ...threadRows(v, t),
      { key: "end", el: div().h(14) },
    ]));
}
