// The right-click menu of an agent or sub-agent row: copy its address, pin it,
// peek at it, kill it. The mod opens a copy of itself as a popup with
// props { agentMenu: address }.

import { div, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { agents, terminals, run, props, openOverlay, closeOverlay, notify } from "herdr";

export function openAgentMenu(address) {
  // A popup is as tall as its items; height is only the most.
  openOverlay({ mod: "agents-menu", kind: "popup", width: 200, height: 170, props: { agentMenu: address } });
}

export function agentMenu(t) {
  const { agentMenu: address, overlay } = props();
  // Pins show only on agents(): a sub-agent has no pane to rise with.
  const agent = agents().find((a) => a.address === address);
  const name = agent?.program?.name ?? terminals().find((k) => k.address === address)?.program?.name ?? "Agent";
  const items = [
    { id: "copy", icon: "mods/agents-menu/icons/copy.svg", label: "Copy address", act: (cx) => {
      cx.write_to_clipboard(address);
      notify({ title: `Copied ${address}`, level: "success", timeout: 1500 });
    } },
    agent && { id: "pin", icon: `mods/workspace-chrome/${agent.pinned ? "pin-off" : "pin"}.svg`, label: agent.pinned ? "Unpin" : "Pin to the top",
      act: () => run("terminal.pin", { terminal: address, pinned: !agent.pinned }) },
    { id: "peek", icon: "mods/agents-menu/icons/eye.svg", label: "Peek", act: () => run("terminal.peek", { terminal: address }) },
    { id: "kill", icon: "mods/workspace-chrome/x.svg", label: "Kill…", danger: true, act: () => openOverlay({
      mod: "confirm", kind: "dialog", width: 380, height: 170,
      props: { title: `Kill ${name} (${address})?`, detail: "Its program ends; a pane showing it closes.", command: { name: "terminal.kill", args: { terminal: address } } },
    }) },
  ].filter(Boolean);
  return v_flex()
    .w_full()
    .p(5)
    .bg(t.popover)
    .text_size(12.8)
    .child(div().px(8).pt(4).pb(6).text_size(11).text_color(t.dim).truncate().child(address))
    .children(items.map((it) => h_flex()
      .id(`menu-${it.id}`)
      .h(31)
      .px(8)
      .gap(9)
      .rounded(7)
      .items_center()
      .text_color(it.danger ? t.blocked : t.foreground)
      .hover((el) => el.bg(t.hover))
      .on_click((_e, cx) => {
        closeOverlay(overlay);
        it.act(cx);
      })
      .child(svg(it.icon).size(14).flex_none().text_color(it.danger ? t.blocked : t.muted))
      .child(div().flex_1().child(it.label))));
}
