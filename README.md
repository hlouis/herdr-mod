# herdr-mod

Layouts and mods for the [Herdr](https://herdr.dev) desktop app.

| Name | Kind | What it is |
|---|---|---|
| [glab](glab/) | layout | GitLab merge requests in a side panel: review threads, worktree checkout, tuicr review |

## Install one

Each folder is laid out like `~/.config/herdr-app` and installs on its own. The
simplest way is to ask an agent running in Herdr to add it, giving the folder's
GitHub URL, for example `https://github.com/hlouis/herdr-mod/tree/main/glab`.
Herdr's own guide (`~/.config/herdr-app/AGENTS.md`, "Layouts and mods other
people made") tells the agent how. Each folder's README has the manual steps.

## Layout of this repository

```
<name>/
  RECIPE.md      the brief to build it from scratch
  preview.png
  README.md      what it is, install, setup
  layouts/       a layout's JSON and preview (layouts only)
  mods/<mod>/    one folder per mod
  keys.json      the keys it expects, to merge into yours
```

## Develop

The repository is the source; `./sync.sh <name>` copies a folder's layouts and
mods into `~/.config/herdr-app` (or `$HERDR_APP_HOME`), where Herdr reloads
them. It copies rather than symlinks because Herdr's file watcher doesn't
follow symlinks. Check every mod after a change:

```sh
./sync.sh glab
herdr-app check ~/.config/herdr-app/mods/glab
```
