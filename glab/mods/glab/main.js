// GitLab merge requests in Herdr's side panel: every opened MR that concerns
// you, grouped by why; click one for its details, threads and actions.

import { View, div, image } from "gpui-kit";
import { h_flex, v_flex, InputState, Input } from "gpui-base";
import { theme, shared, setShared, spaces, nextCommand, notify, exec, appHome } from "herdr";
import { glabHost, fetchMine, fetchOne, fetchDiscussions, resolveDiscussion, parseMrUrl } from "./gitlab.js";
import { scanSpaces, spaceWith, findRepo } from "./repo.js";
import * as act from "./actions.js";
import { Scroller, icon, chip, iconButton } from "./ui.js";
import { listRows, emptyList } from "./list.js";
import { detailView } from "./detail.js";

// The last fetch, shared and persisted, so the panel shows it at once.
const STORE = "glab.mrs";
// Project avatars, one file per avatar version (GitLab changes the URL's ?v=).
const CACHE = "mods/glab/.cache";
const EVERY = 5 * 60 * 1000;

// An MR is listed once, under the first of these that applies.
const GROUPS = [
  ["reviewer", "Review requested"],
  ["assignee", "Assigned to me"],
  ["author", "Authored by me"],
  ["mentioned", "Mentioning me"],
];
const FILTERS = [["All", null], ["Review", "reviewer"], ["Assigned", "assignee"], ["Mine", "author"], ["Mentions", "mentioned"]];
const message = (e) => String(e?.message ?? e);
function avatarFile(url) {
  let h = 0;
  for (const ch of url) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  const ext = url.split("?")[0].match(/\.(png|jpe?g|gif|webp)$/i)?.[0] ?? ".png";
  return `${h.toString(16)}${ext}`;
}

export default class Glab extends View {
  init(_props, cx) {
    this.handle = cx.focus_handle();
    this.scroll = new Scroller("mrs");
    this.detailScroll = new Scroller("detail");
    this.filter = 0;
    this.search = "";
    this.searching = false;
    this.input = InputState.new({ placeholder: "Search title, project or branch" });
    this.input.on("change", (_e, cx) => { this.search = this.input.value(); cx.notify(); });
    this.folded = new Set();
    this.sel = null; // the selected MR's url
    this.hovered = null;
    this.detail = null; // { mr, threads, error, at, open, showResolved } while the detail page shows
    this.loading = false;
    this.repos = [];
    this.spacesKey = null;
    this.avatars = new Set(); // avatar URLs whose file is in CACHE

    this.host = glabHost();
    this.host.catch(() => {});
    cx.spawn(async () => { for (;;) if ((await nextCommand()) === "focus") this.handle.focus(); });
    cx.timer.every(EVERY, (cx) => this.refresh(cx));
    this.refresh(cx);
  }

  data() {
    return shared(STORE) ?? { mrs: [] };
  }

  refresh(cx) {
    if (this.loading) return;
    this.loading = true;
    cx.notify();
    cx.spawn(async (cx) => {
      try {
        const host = await this.host;
        const { username, mrs } = await fetchMine(host);
        setShared(STORE, { host, username, fetchedAt: Date.now(), error: "", mrs });
        await this.fetchAvatars(host, mrs);
      } catch (e) {
        // The last good list stays; its age and the error say it is stale.
        setShared(STORE, { ...this.data(), error: message(e) });
      }
      this.loading = false;
      cx.notify();
    });
  }

  // Which spaces hold which checkouts: read again whenever spaces or their
  // branches change, so a checkout shows up as soon as its space opens.
  rescanIfChanged(cx) {
    const key = JSON.stringify(spaces().filter((s) => !s.machine).map((s) => [s.id, s.branch, s.folder]));
    if (key === this.spacesKey) return;
    this.spacesKey = key;
    cx.spawn(async (cx) => {
      try { this.repos = await scanSpaces(await this.host); } catch { this.repos = []; }
      cx.notify();
    });
  }

  localState(mr) {
    if (spaceWith(this.repos, mr)) return "checked-out";
    return findRepo(this.repos, mr.project) ? "repo" : "none";
  }

  projectAvatarPath(mr) {
    return this.avatars.has(mr.projectAvatar) ? `${CACHE}/${avatarFile(mr.projectAvatar)}` : null;
  }

  // GitLab serves project avatars to the API (unlike people's), so glab
  // downloads each once; a file already there is kept.
  async fetchAvatars(host, mrs) {
    const want = new Map(mrs.filter((mr) => mr.projectAvatar && !this.avatars.has(mr.projectAvatar)).map((mr) => [mr.projectAvatar, mr.project]));
    for (const [url, project] of want) {
      const r = await exec("sh", ["-c", 'mkdir -p "$1" && { [ -s "$1/$2" ] || { glab api --hostname "$3" "projects/$4/avatar" > "$1/$2.part" && mv "$1/$2.part" "$1/$2"; }; }',
        "sh", `${appHome()}/${CACHE}`, avatarFile(url), host, encodeURIComponent(project)]);
      if (r.code === 0) this.avatars.add(url);
    }
  }

  // Why an MR concerns you, in group order.
  roleTitles(mr) {
    return GROUPS.filter(([r]) => mr.roles.includes(r)).map(([, title]) => title);
  }

  hasKeys() {
    return this.handle.is_focused();
  }

  groups() {
    const role = FILTERS[this.filter][1];
    const q = this.search.trim().toLowerCase();
    const mrs = this.data().mrs.filter((mr) =>
      (!role || mr.roles.includes(role)) &&
      (!q || `${mr.title} ${mr.project} ${mr.sourceBranch}`.toLowerCase().includes(q)));
    const groupOf = (mr) => role ?? GROUPS.find(([r]) => mr.roles.includes(r))[0];
    return GROUPS.map(([r, title]) => {
      const inGroup = mrs.filter((mr) => groupOf(mr) === r).sort((a, b) => a.draft - b.draft || b.updatedAt - a.updatedAt);
      return { role: r, title, count: inGroup.length, mrs: inGroup };
    }).filter((g) => g.count);
  }

  visibleMrs() {
    return this.groups().flatMap((g) => (this.folded.has(g.role) ? [] : g.mrs));
  }

  selected() {
    if (this.detail) return this.detail.mr;
    return this.visibleMrs().find((mr) => mr.url === this.sel) ?? null;
  }

  move(delta) {
    const mrs = this.visibleMrs();
    if (!mrs.length) return;
    const at = mrs.findIndex((mr) => mr.url === this.sel);
    this.sel = mrs[Math.min(mrs.length - 1, Math.max(0, at < 0 ? 0 : at + delta))].url;
    this.scroll.reveal(this.sel);
  }

  // ---- actions ----

  act(cx, name, mr) {
    const run = {
      jump: (repos) => act.jump(repos, mr),
      checkout: (repos) => act.checkout(repos, mr),
      review: (repos) => act.review(repos, mr),
      browser: () => act.openInBrowser(mr),
      copy: () => act.copyLink(mr),
    }[name];
    cx.spawn(async (cx) => {
      let error;
      try { error = await run(this.repos); } catch (e) { error = message(e); }
      if (error) notify({ title: `!${mr.iid}`, body: error, level: "error" });
      else if (name === "copy") notify({ title: "Link copied", body: mr.url, level: "success", timeout: 2500 });
      cx.notify();
    });
  }

  openDetail(cx) {
    const mr = this.selected();
    if (mr) this.showMr(mr, cx);
  }

  // The detail page for an MR, its threads loading behind it.
  showMr(mr, cx) {
    const d = { mr, threads: null, error: "", at: 0, open: new Set(), showResolved: false };
    this.detail = d;
    this.detailScroll = new Scroller("detail");
    cx.notify();
    cx.spawn(async (cx) => {
      try {
        const threads = await fetchDiscussions(await this.host, mr.project, mr.iid);
        d.threads = [...threads.filter((th) => !th.resolved), ...threads.filter((th) => th.resolved)];
        // The first open thread starts open: it is usually why you came.
        // With none open, the resolved ones show instead of an empty page.
        if (d.threads[0] && !d.threads[0].resolved) d.open.add(d.threads[0].id);
        else d.showResolved = true;
      } catch (e) {
        d.error = message(e);
      }
      cx.notify();
    });
  }

  closeDetail() {
    this.detail = null;
    this.scroll.reveal(this.sel);
  }

  // Threads the keyboard can reach: resolved ones only while shown.
  reachableThreads() {
    const d = this.detail;
    return (d?.threads ?? []).filter((th) => !th.resolved || d.showResolved);
  }

  moveThread(delta) {
    const d = this.detail;
    const list = this.reachableThreads();
    if (!list.length) return;
    const at = list.indexOf(d.threads[d.at]);
    const next = list[Math.min(list.length - 1, Math.max(0, at < 0 ? 0 : at + delta))];
    d.at = d.threads.indexOf(next);
    this.detailScroll.reveal(next.id);
  }

  toggleThread() {
    const d = this.detail;
    const th = d?.threads?.[d.at];
    if (!th) return;
    if (d.open.has(th.id)) d.open.delete(th.id);
    else d.open.add(th.id);
    this.detailScroll.reveal(th.id);
  }

  resolveThread(cx) {
    const d = this.detail;
    const th = d?.threads?.[d.at];
    if (!th) return;
    cx.spawn(async (cx) => {
      try {
        await resolveDiscussion(await this.host, th.id, !th.resolved);
        th.resolved = !th.resolved;
        if (th.resolved) d.open.delete(th.id);
        notify({ title: th.resolved ? "Thread resolved" : "Thread reopened", body: `${d.mr.project.split("/").pop()} !${d.mr.iid}`, level: "success", timeout: 2500 });
        this.refresh(cx);
      } catch (e) {
        notify({ title: "Couldn't change the thread", body: message(e), level: "error" });
      }
      cx.notify();
    });
  }

  // The MR whose link is on the clipboard, mine or not.
  openFromClipboard(cx) {
    cx.spawn(async (cx) => {
      try {
        const url = await act.clipboard();
        const host = await this.host;
        const p = parseMrUrl(url);
        if (!p) throw new Error(`The clipboard holds no merge request link: ${url.slice(0, 120) || "(empty)"}`);
        if (p.host !== host.toLowerCase()) throw new Error(`${p.host} is not ${host}, the host glab is set up for.`);
        const known = this.data().mrs.find((mr) => mr.iid === p.iid && mr.project.toLowerCase() === p.project.toLowerCase());
        const mr = known ?? await fetchOne(host, p.project, p.iid);
        await this.fetchAvatars(host, [mr]);
        this.showMr(mr, cx);
      } catch (e) {
        notify({ title: "Merge request from the clipboard", body: message(e), level: "error" });
      }
      cx.notify();
    });
  }

  // ---- keys ----

  key(e, cx) {
    const m = e.modifiers;
    if (m.platform || m.control || m.alt) return;
    if (this.searching) {
      if (e.key === "escape") this.clearSearch();
      else if (e.key === "enter") { this.searching = false; this.handle.focus(); }
      else if (e.key === "down" || e.key === "up") this.move(e.key === "down" ? 1 : -1);
      else return;
    } else {
      const k = e.key.length === 1 ? (e.key_char ?? e.key) : m.shift ? `shift-${e.key}` : e.key;
      const mr = this.selected();
      const actions = { c: "checkout", r: "review", o: "browser", b: "browser", y: "copy", g: "jump" };
      if (this.detail) {
        if (k === "escape" || k === "h" || k === "left" || k === "backspace") this.closeDetail();
        else if (k === "j" || k === "down") this.moveThread(1);
        else if (k === "k" || k === "up") this.moveThread(-1);
        else if (k === "enter") this.toggleThread();
        else if (k === "R") this.resolveThread(cx);
        else if (actions[k] && mr) this.act(cx, actions[k], mr);
        else return;
      } else if (k === "j" || k === "down") this.move(1);
      else if (k === "k" || k === "up") this.move(-1);
      else if ((k === "enter" || k === "l" || k === "right") && mr) this.openDetail(cx);
      else if (actions[k] && mr) this.act(cx, actions[k], mr);
      else if (k === "tab") this.filter = (this.filter + 1) % FILTERS.length;
      else if (k === "shift-tab") this.filter = (this.filter + FILTERS.length - 1) % FILTERS.length;
      else if (k === "/") this.startSearch();
      else if (k === "v") this.openFromClipboard(cx);
      else if (k === "R") this.refresh(cx);
      else if (k === "escape" && this.search) this.clearSearch();
      else return;
    }
    cx.stop_propagation();
    cx.notify();
  }

  startSearch() {
    this.searching = true;
    this.input.focus();
  }

  clearSearch() {
    this.search = "";
    this.searching = false;
    this.input.set_value("");
    this.handle.focus();
  }

  // ---- drawing ----

  render(cx) {
    const t = theme();
    const d = this.data();
    this.rescanIfChanged(cx);
    const mrs = this.visibleMrs();
    if (!this.detail && !mrs.some((mr) => mr.url === this.sel)) this.sel = mrs[0]?.url ?? null;
    return v_flex().id("glab").size_full().min_h(0).rounded(10).overflow_hidden()
      .bg(t.background).border_1().border_color(t.border).text_color(t.foreground).text_size(13)
      .track_focus(this.handle)
      .on_mouse_down("left", () => { if (!this.searching) this.handle.focus(); })
      .on_key_down((e, cx) => this.key(e, cx))
      .child(this.header(t, d))
      .when(Boolean(d.error), (el) => el.child(div().px(14).py(6).border_b(1).border_color(t.border).text_size(11.5).text_color(t.ansi1).whitespace_normal().child(d.error)))
      .child(this.detail ? detailView(this, t) : this.listPage(t));
  }

  header(t, d) {
    const total = d.mrs.length;
    return h_flex().h(42).flex_none().px(14).gap(8).items_center().border_b(1).border_color(t.border)
      .child(image("mods/glab/gitlab.svg").size(16).flex_none())
      .child(div().font_semibold().child("Merge requests"))
      .when(total > 0, (el) => el.child(chip(t, String(total))))
      .child(div().flex_1())
      .child(iconButton(t, "hd-search", "search", "Search  /", () => (this.searching ? this.clearSearch() : this.startSearch())))
      .child(iconButton(t, "hd-paste", "clipboard-paste", "Open the MR link on the clipboard  v", (_e, cx) => this.openFromClipboard(cx)))
      .child(iconButton(t, "hd-refresh", "refresh-cw", this.loading ? "Refreshing…" : `Refresh  R${d.fetchedAt ? ` · updated ${new Date(d.fetchedAt).toLocaleTimeString()}` : ""}`, (_e, cx) => this.refresh(cx))
        .when(this.loading, (el) => el.text_color(t.working)));
  }

  listPage(t) {
    const rows = listRows(this, t).map((r) => ({ key: r.key, el: div().px(6).child(r.el) }));
    return v_flex().flex_1().min_h(0)
      .child(h_flex().flex_none().px(10).py(6).gap(2).items_center().border_b(1).border_color(t.border)
        .children(FILTERS.map(([name], i) => div().id(`filter-${name}`).px(7).py(2).rounded(6).text_size(11.5).cursor_pointer()
          .when(i === this.filter, (el) => el.bg(t.selected))
          .text_color(i === this.filter ? t.foreground : t.muted)
          .hover((s) => s.bg(t.hover))
          .on_click((_e, cx) => { this.filter = i; cx.notify(); })
          .child(name))))
      .when(this.searching || this.search !== "", (el) => el.child(
        h_flex().flex_none().mx(10).mt(8).h(30).px(10).gap(8).items_center().rounded(8).border_1()
          .border_color(this.searching ? t.accent : t.border)
          .child(icon("search", 13, t.dim))
          .child(Input.new(this.input).flex_1().h_full().text_size(12).text_color(t.foreground))))
      .child(rows.length ? this.scroll.render(t, [{ key: "top", el: div().h(4) }, ...rows, { key: "bottom", el: div().h(6) }]) : emptyList(this, t));
  }
}
