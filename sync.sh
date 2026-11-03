#!/bin/sh
# 把仓库里的一份（布局 + mods）同步到 herdr-app，触发热加载。
# 仓库是真源，herdr-app 里的是部署副本。用法：./sync.sh glab
# herdr-app 的文件监听不跟随软链接，所以用复制而不是软链接。
set -eu
src="$(cd "$(dirname "$0")" && pwd)/$1"
home=${HERDR_APP_HOME:-$HOME/.config/herdr-app}
for mod in "$src"/mods/*/; do
  name=$(basename "$mod")
  rsync -a --delete --exclude jsconfig.json --exclude '*.d.ts' --exclude .cache "$mod" "$home/mods/$name/"
done
if [ -d "$src/layouts" ]; then
  rsync -a "$src/layouts/" "$home/layouts/"
fi
