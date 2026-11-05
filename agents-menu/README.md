# agents-menu: a right-click menu on Herdr's agents list

Herdr's Agents list with a right-click menu on every agent and sub-agent row:

- **Copy address**: the agent's herdr-core address (`t2z`, or `vps/t7` on
  another machine), ready for `hc read`, `hc send`, `hc wait`.
- **Pin to the top** / **Unpin** (agents only; sub-agents have no pane).
- **Peek**: shows its terminal over the current tab.
- **Kill…**: ends its program, after a confirm dialog.

Everything else is Herdr's `agents` mod as it ships.

## Requirements

- The Herdr app. The mod is a copy of Herdr's `agents` mod (0.1.13, see
  `cloned_from` in `mod.json`); later changes to `agents` don't reach it.

## Install

```sh
cp -R mods/agents-menu ~/.config/herdr-app/mods/
```

Then, in your own layout (Herdr's are read-only: `layout.clone` one first),
point the agents block at it: `"content": { "mod": "agents-menu" }`.
The [glab](../glab/) layout already does.

## Built from

`mods/agents-menu/main.js` is the cloned `agents` mod; it hooks
`on_mouse_down("right")` onto the rows. `menu.js` draws the menu: the mod opens
a copy of itself as a popup with props `{ agentMenu: address }`, as the sort
menu does with `{ sortMenu: true }`. Kill goes through Herdr's `confirm` mod.
