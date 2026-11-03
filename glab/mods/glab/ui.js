// Shared drawing pieces: icons, avatars, pipeline marks, and a scroller that
// can bring a row into view (plain rows keep their hover and click handlers,
// which virtual-list rows can't have).

import { div, svg, image } from "gpui-kit";
import { v_flex } from "gpui-base";

// The colors Herdr's own space tiles use, with white initials on them.
const TILE = ["#22a99a", "#e3814f", "#5b8def", "#8b7cf6", "#3fae6a", "#d9649a"];
function tileColor(name) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  return TILE[h % TILE.length];
}

export const icon = (name, size, color) => svg(`mods/glab/icons/${name}.svg`).size(size).flex_none().when(Boolean(color), (el) => el.text_color(color));

// A person: GitLab serves avatars only to a signed-in browser, so initials.
export function avatar(username, size = 18, { pending = false, t } = {}) {
  const base = div().size(size).flex_none().rounded(size / 2).flex().items_center().justify_center()
    .text_size(Math.round(size * 0.5)).font_semibold();
  return pending
    ? base.border_1().border_color(t.dim).text_color(t.dim).child(username[0]?.toUpperCase() ?? "?")
    : base.bg(tileColor(username)).text_color("#ffffff").child(username[0]?.toUpperCase() ?? "?");
}

// A project: its GitLab avatar when it has one, else a lettered tile.
export function projectAvatar(project, path, size = 16) {
  const name = project.split("/").pop();
  if (path) return image(path).size(size).flex_none().rounded(4);
  return div().size(size).flex_none().rounded(4).bg(tileColor(project)).flex().items_center().justify_center()
    .text_size(Math.round(size * 0.6)).font_bold().text_color("#ffffff").child(name[0]?.toUpperCase() ?? "?");
}

const PIPELINE = {
  SUCCESS: ["circle-check", "ansi2"], FAILED: ["circle-x", "ansi1"], RUNNING: ["loader-circle", "working"],
  CANCELED: ["circle-slash", "dim"], SKIPPED: ["circle-slash", "dim"], MANUAL: ["hand", "dim"],
  PENDING: ["clock", "dim"], CREATED: ["clock", "dim"], WAITING_FOR_RESOURCE: ["clock", "dim"], PREPARING: ["clock", "dim"], SCHEDULED: ["clock", "dim"],
};

export function pipelineIcon(t, status, size = 14) {
  const p = PIPELINE[status];
  if (!p) return div().size(size).flex_none();
  const el = icon(p[0], size, t[p[1]]);
  return status === "RUNNING" ? el.spin(1000) : el;
}
export const pipelineLabel = (status) => (status ? status.toLowerCase().replace(/_/g, " ") : "no pipeline");

export function ago(ms) {
  const s = (Date.now() - ms) / 1000;
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

// A small bordered label, as Herdr's panels draw counts.
export const chip = (t, text, color) => div().flex_none().px(5).py(0).rounded(4).border_1().border_color(t.border)
  .text_size(10).text_color(color ?? t.muted).child(text);

// An icon button with a tooltip, as the agents list draws its pin.
export function iconButton(t, id, name, tip, onClick, size = 14) {
  return div().id(id).flex_none().p(3).rounded(5).text_color(t.dim).cursor_pointer()
    .hover((s) => s.bg(t.hover).text_color(t.foreground))
    .tooltip(tip)
    .on_click((e, cx) => { cx.stop_propagation(); onClick(e, cx); cx.notify(); })
    .child(icon(name, size));
}

// A column of rows scrolled by the script: rows report their heights, so the
// selected one can be brought into view. `rows`: [{ key, el }].
export class Scroller {
  constructor(id) {
    this.id = id;
    this.offset = 0;
    this.view = 0;
    this.heights = new Map();
    this.want = null;
  }

  // Scrolls just enough to show the row with this key, on the next draw.
  reveal(key) {
    this.want = key;
  }

  render(t, rows) {
    const tops = new Map();
    let y = 0;
    for (const r of rows) { tops.set(r.key, y); y += this.heights.get(r.key) ?? 0; }
    const total = y;
    if (this.want && tops.has(this.want)) {
      const top = tops.get(this.want), bottom = top + (this.heights.get(this.want) ?? 0);
      if (top < this.offset) this.offset = top;
      else if (bottom > this.offset + this.view) this.offset = bottom - this.view;
      this.want = null;
    }
    this.offset = Math.max(0, Math.min(this.offset, total - this.view));
    const thumb = total > this.view && this.view > 0
      ? { h: Math.max(24, (this.view * this.view) / total), top: (this.offset / (total - this.view)) * (this.view - Math.max(24, (this.view * this.view) / total)) }
      : null;
    return div().id(this.id).flex_1().min_h(0).relative().overflow_hidden()
      .on_size_change((size, cx) => { if (size.height !== this.view) { this.view = size.height; cx.notify(); } })
      .on_scroll_wheel((e, cx) => {
        const next = Math.max(0, Math.min(this.offset - e.delta.y, Math.max(0, total - this.view)));
        if (next !== this.offset) { this.offset = next; cx.notify(); }
      })
      .child(v_flex().absolute().left(0).right(0).top(-this.offset).children(rows.map((r) =>
        div().id(`${this.id}-${r.key}`).flex_none()
          .on_size_change((size, cx) => { if (this.heights.get(r.key) !== size.height) { this.heights.set(r.key, size.height); cx.notify(); } })
          .child(r.el))))
      .when(Boolean(thumb), (el) => el.child(div().absolute().right(2).w(4).rounded(2).bg(t.border).top(thumb.top).h(thumb.h)));
  }
}

