// The settings page: which GitLab, and the token to use there.

import { div } from "gpui-kit";
import { h_flex, v_flex, Input } from "gpui-base";
import { icon, iconButton, button } from "./ui.js";
import { GITLAB_COM, normalizeUrl, hostOf } from "./config.js";

const label = (t, text) => div().px(14).pt(16).pb(6).text_size(11).font_medium().text_color(t.dim).child(text.toUpperCase());

// A text field; its own presses stay with it, so the panel doesn't take the keyboard back.
const field = (t, id, state) => h_flex().id(id).h(30).px(10).items_center().rounded(8).border_1().border_color(t.input).bg(t.background)
  .cursor_text().on_mouse_down("left", (_e, cx) => cx.stop_propagation())
  .child(Input.new(state).flex_1().h_full().text_size(12).text_color(t.foreground));

function choice(v, t, kind, title, extra) {
  const s = v.settings;
  const on = s.kind === kind;
  return v_flex().id(`inst-${kind}`).px(12).py(9).gap(8).cursor_pointer().hover((st) => st.bg(t.hover))
    .on_click((_e, cx) => { s.kind = kind; s.error = ""; cx.notify(); })
    .child(h_flex().gap(9).items_center()
      .child(div().size(14).flex_none().rounded(7).border_1().border_color(on ? t.accent : t.input).flex().items_center().justify_center()
        .when(on, (el) => el.child(div().size(6).rounded(3).bg(t.accent))))
      .child(div().text_size(12.5).child(title)))
    .when(on && Boolean(extra), (el) => el.child(div().pl(23).child(extra)));
}

// The URL the form names now, or "" while the self-managed field is empty.
export function formUrl(v) {
  const s = v.settings;
  if (s.kind === "com") return GITLAB_COM;
  const raw = v.urlInput.value().trim();
  return raw ? normalizeUrl(raw) : "";
}

export function settingsView(v, t) {
  const s = v.settings;
  const connected = Boolean(v.conn);
  const url = formUrl(v);
  const who = v.data().username;
  return v_flex().flex_1().min_h(0).id("settings").overflow_y_scroll()
    .when(connected, (el) => el.child(h_flex().h(36).flex_none().px(8).gap(4).items_center().border_b(1).border_color(t.border)
      .child(iconButton(t, "st-back", "chevron-left", "Back  esc", () => v.closeSettings()))
      .child(div().text_size(12).text_color(t.muted).child("GitLab connection"))))
    .when(!connected, (el) => el.child(v_flex().px(14).pt(14).gap(4)
      .child(div().text_size(15).font_semibold().child("Connect to GitLab"))
      .child(div().text_size(12).text_color(t.muted).whitespace_normal().child("List the merge requests that concern you, right beside your terminals."))))
    .when(connected && Boolean(who), (el) => el.child(h_flex().px(14).pt(14).gap(8).items_center().text_size(12.5)
      .child(icon("circle-check", 14, t.ansi2))
      .child(v_flex().child(div().child(`Connected as ${who}`)).child(div().text_size(11.5).text_color(t.dim).child(hostOf(v.conn.url))))))
    .child(label(t, "Instance"))
    .child(v_flex().mx(14).rounded(8).border_1().border_color(t.border).overflow_hidden()
      .child(choice(v, t, "com", "GitLab.com"))
      .child(div().h(1).bg(t.border))
      .child(choice(v, t, "self", "Self-managed", field(t, "st-url", v.urlInput))))
    .child(label(t, "Access token"))
    .child(div().mx(14).child(field(t, "st-token", v.tokenInput)))
    .child(div().px(14).pt(6).text_size(11.5).text_color(t.dim).whitespace_normal().child("Needs the api scope: resolving a thread writes to GitLab."))
    .when(Boolean(url), (el) => el.child(h_flex().id("st-create").mx(14).mt(6).gap(5).items_center().text_size(12).text_color(t.accent).cursor_pointer()
      .hover((st) => st.text_color(t.foreground))
      .on_click((_e, cx) => v.openTokenPage(cx, url))
      .child(icon("external-link", 12)).child(`Create a token on ${hostOf(url)}`)))
    .child(h_flex().px(14).pt(16).gap(8)
      .child(button(t, "st-connect", "", s.busy ? "Connecting…" : "Connect", s.busy ? null : (_e, cx) => v.connect(cx), { primary: true }))
      .when(connected && !s.busy, (el) => el.child(button(t, "st-disconnect", "", "Disconnect", (_e, cx) => v.disconnect(cx)))))
    .when(Boolean(s.error), (el) => el.child(h_flex().px(14).pt(10).gap(6).items_start().text_size(12).text_color(t.ansi1)
      .child(icon("circle-x", 13)).child(div().flex_1().whitespace_normal().child(s.error))))
    .child(div().px(14).pt(16).pb(14).text_size(11).text_color(t.dim).whitespace_normal()
      .child("Saved to ~/.config/herdr-app/glab.json, readable only by you."));
}
