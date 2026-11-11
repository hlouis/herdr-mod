---
name: herdr-update
description: Herdr（herdr-app）或 herdr-core 升级后的例行工作：查两边的版本和是否有新版，把上游内置 layout/mod 的改动合进本仓库里 clone 出来的副本并同步到本机 ~/.config/herdr-app，最后给用户一份面向用户的更新总结。用户说「herdr 更新了 / herdr-app 更新了，看一下 / herdr-core 有没有更新 / 这次更新了啥 / 合一下上游改动」时使用。
---

# herdr-update

三步，按顺序做：查更新 → 合入上游改动并同步 → 给用户总结。

## 1. 查更新

**herdr-app**（自己下载更新，重启后生效）

- 当前版本：`herdr-app --version`
- 新版说明：`~/.config/herdr-app/update-notes-cache.md` 是远端 changelog 的缓存，最上面的版本号比当前版本新，说明有更新在等重启。
- 想立刻查一次：`herdr-app do app.check_updates`，结果在 Settings → Updates。不要自己执行 `app.update`（会重启 app），让用户决定。

**herdr-core**

- 本机正在跑的版本：`hc server status` 的 `version`。`holders` 里 `current: false` 的是旧 core 留下的托管进程，它们托管的终端是更新前开的。
- 其他机器：`hc machine ls` 的 `version`。
- 最新版本：`gh api repos/herdrdev/herdr-core/tags --jq '.[0].name'`
- 更新说明只在仓库的 `CHANGELOG.md` 里，GitHub Releases 是空的：
  `gh api repos/herdrdev/herdr-core/contents/CHANGELOG.md -H 'Accept: application/vnd.github.raw'`
- app 首次启动新版时会顺带把本机 core 升到同代最新版；远端机器不会，要用 `hc machine update <name>`，这一步先问用户。

## 2. 合入上游改动并同步到本机

本仓库的 clone 记录了来源：`grep -rn '"cloned_from"' --include='*.json' .`（mod 在 `mod.json`，layout 在 `layouts/*.json`）。上游的新版就是本机 `~/.config/herdr-app/mods/<name>/` 和 `~/.config/herdr-app/layouts/<name>.json`，app 升级时会覆盖它们。

对每个 clone：

1. 和上游新版做两方 diff：
   - mod：`diff ~/.config/herdr-app/mods/<上游名>/main.js <folder>/mods/<clone名>/main.js`，资源文件（svg 等）用 `cmp` 逐个比。
   - layout：`diff <(jq -S 'del(.cloned_from)' ~/.config/herdr-app/layouts/<上游名>.json) <(jq -S 'del(.cloned_from)' <folder>/layouts/<clone名>.json)`
2. 把每块差异分成「我们的改动」和「上游的改动」。我们改了什么写在各 folder 的 `RECIPE.md` 和 `README.md` 里，代码里也常带 `glab:` 之类的注释；拿不准时看 `git log -p -- <folder>`，再对照第 1 步的 app changelog 找对应条目。
3. 只把上游那部分搬进 clone，我们的改动保持不动。上游删掉的逻辑在 clone 里也删掉。搬完再 diff 一次，剩下的应该全是我们的改动。
4. 把 `cloned_from.version` 改成新版本号。版本号只记在这里，README 里不写版本号。
5. 同步并检查：
   ```sh
   ./sync.sh <folder>
   herdr-app check ~/.config/herdr-app/mods/<每个 mod>
   herdr-app status   # errors 应为空
   ```

上游 diff 没变化的 clone 也要更新 `cloned_from.version`，表示它已经和这个版本对过了。不提交，除非用户要求。

## 3. 给用户总结

用中文，在对话里直接给，先结论后细节：

- **版本**：app 和 core 各自从哪个版本到哪个版本，远端机器各在哪个版本。
- **用户能感觉到的变化**：从 app changelog（`update-notes-cache.md` 里旧版本到新版本之间的各节）和 core 的 `CHANGELOG.md` 里挑，重要的放前面（带粗体标题的 New 条目、影响终端存活或日常操作的修复），零碎修复合成一句。和本仓库 mod 相关的 mod API 变化单独点出来，说明用没用上。
- **本仓库合了什么**：每个 clone 合入了哪些上游改动，一句话一条，带上游的 issue 号。
- **建议用户做的事**：比如远端机器升 core、旧终端关掉重开（看 `holders` 里 `current: false` 的），只列这次确实需要的。
