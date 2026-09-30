# 工作约定

## 操作边界

### 这个仓库之外，要动先问

默认只改 `game-stats`。隔壁那些仓库——尤其是 `~/Repos/nix-packages`——不编辑、不提交、
不 amend、不 push，**除非对方明确说了这次可以**。

注意是**逐个改动地授权**，不要把一次许可当成长期通行证。他们那边有发版 bot 管版本号和
哈希；被授权动手时也只改被点名的那部分，别顺手多改。

被贴了构建报错要我一起看时，读文件、读日志总是可以的 —— 那不算动手。

### 版本号

按 semver：**patch 修 bug，minor 加功能，major 破坏兼容。**

- 不要逢十进一 —— `0.2.9` 后面是 `0.2.10`，不是 `0.3.0`
- 也不要矫枉过正地永远只加 patch —— 加了新功能就该走 minor

两个方向我都错过一次：

- 只是修 bug 却从 `0.1.9` 跳到 `0.2.0`
- 加了「启用哪些游戏可配置」这种新功能，却走 `0.2.9`（应该是 `0.3.0`）

**判断标准**：这次改动让用户能做以前做不到的事吗？能就是 minor。
（新增一个默认关闭的 nix option 也算 —— 默认行为没变，但它确实是新能力。）

### 推送

任何仓库，没被明确要求就不推。`--force` 和 `--force-with-lease` 更是要先问。

### GameStats（`~/Repos/game-stats`）

新改动一律开**新提交**，不改写已经推出去的历史 —— 除非对方明确说 amend。

## nix 打包的已知坑（对方来问时对照用，我不动手改）

**漏字段** —— 改包名时最隐蔽的一个：`meta.mainProgram` 没跟着改，
`lib.getExe` 就解析出不存在的路径，systemd 报 `status=203/EXEC`（不是「服务起不来」那么笼统，
是那个 203）。会被漏的字段：

- `pname`、`version`、`rev`
- `meta.mainProgram`、`meta.homepage`、`meta.changelog`
- `installPhase` 里的 `$out/bin/…`、`$out/lib/…`
- NixOS 模块的选项名前缀、`stateDirectory`、`documentation` URL
- **`src` 的 `hash`** —— 改了 `rev` 就必须重新取

## 两种典型构建报错，别误判

**1. 「构建成功」但编译的是旧源码 —— 改了 `rev` 没改 `hash`。**

固定输出推导按哈希定 store path：哈希没变 → 命中缓存 → 根本不去下载。判断依据是
**store path 有没有变**，不是「构建成功」。

```
nix-prefetch-url --unpack https://github.com/<owner>/<repo>/archive/refs/tags/vX.tar.gz
nix hash convert --hash-algo sha256 --from nix32 --to sri <base32>
```

**2. 「拉 android 包」不是网络差，是抓取器不看平台。**

nix 抓 npm 依赖用的是 `pkgs/build-support/node/prefetch-npm-deps/src/main.rs`，一个 Rust 程序。
它遍历 lockfile 里 `packages` 的每一项逐个下载，**`os` / `cpu` 一个都不检查**
（那两个字段只是被保留下来，留给后面的 npm 自己过滤）。lock 里有 76 个平台二进制包，
它就老老实实下 76 个，其中 67 个本机永远用不上 —— android / darwin / riscv64 / loong64 …
每多一个，构建就多一次「一条连接抖动、整个失败」的机会：

```
couldn't fetch node_modules/@esbuild/android-x64 …
Caused by: [92] Stream error in the HTTP/2 framing layer
```

**`npmInstallFlags = [ "--os=…" "--cpu=…" ]` 治不了这个** —— 那个参数只有 `buildNpmPackage`
（构建那一步）读，抓取那一步是另一个程序，读不到。产物树确实会瘦下去，下载量一点没少。
之前就是被这个假象骗了。

**真正的修法是把这些包从 `package-lock.json` 里删掉**：`npm run trim-lock`
（`scripts/trim-lock.mjs`）。不能只删条目 —— 父包的 `optionalDependencies` 里还留着引用，
npm ci 会报 `Missing: xxx from lock file`，得连引用一起清。删完 76 个只剩 9 个，全是 linux-x64。

**跑过 `npm install` 之后要重新跑一次 `npm run trim-lock`**，npm 会重新生成完整 lock。

代价：lockfile 从此是 linux-x64 专用的。换平台构建得先重新生成 lock。
这个包只在 x86_64-linux 上构建，可以接受。

## 本机环境（这些坑是实际踩出来的，别绕开）

- `NODE_ENV=production` 且 `npm config omit=dev` → `npm install` **默认不装 devDependencies**。
  必须 `npm install --include=dev --cache ./.npm-cache --no-audit --no-fund`。
- `~/.npm/_cacache` 只读 → 永远加 `--cache ./.npm-cache`。
- `~/.cache/nix` 只读 → `export XDG_CACHE_HOME=<repo>/.nix-cache`。
- SSH：`GIT_SSH_COMMAND="ssh -F /home/a746/.ssh/config -o BatchMode=yes"`（否则 `Bad owner or permissions`）。
- `GIT_EDITOR=true`；全局开了 `tag.gpgSign`，打 tag 要 `git -c tag.gpgSign=false tag`。
- `/tmp` 每次 bash 调用都会被清 → 临时文件放工作区。
- `pkill -f "…"` 会连自己的 shell 一起杀（命令行里含同样的字符串），后面的命令就不执行了。
  别写进命令串，或者只放在最后。

## 测试别污染仓库

无头浏览器 profile、临时数据库，放已经忽略的目录（`.nix-cache/`）。

别用 `.cA` / `.cB` 这种随手起的名字 —— 会被 `git add -A` 扫进去，
`.gitignore` 里写 `.chromium*/` 也盖不住。已经踩过两次：一次 1237 个文件，
一次 492 个。规则要写成 `/.c*/` 这种能盖住的形状。

## 验证标准

- **`curl` 返回 200 不算验证过。** 改了界面或部署方式，要用无头浏览器真跑一遍：

  ```
  chromium --headless=new --disable-gpu --no-sandbox \
    --user-data-dir=<已忽略目录> --virtual-time-budget=8000 \
    --dump-dom <URL>        # 或 --screenshot=<文件>
  ```

  链接跳转、深层链接刷新、子路径下的资源加载，只有跑起来才看得见 ——
  「首页正常」和「点进去正常」是两回事。

- `index.html` 已改成按请求读，前端重新构建后不用重启服务（v0.1.9 起）。

- 光看代码推不出结论的时候，搭个最小复现（比如剥前缀的代理）比反复读代码快。

## game-stats 项目约定

- 配置要能在站点里改，不许塞进源码。「改 `.ts` 文件是很差很差的想法。」
- 每个游戏一套表、一套查询、一套页面（`/cs2`、`/crash`）。
  共享的只有 db、`Card` / `Crumbs` / `TopBar`、`StatBoard`、api wrapper。
- 不追代码复用。
- 界面里不写解释性文字；代码里不写游戏规则注释 —— 「你怎么可能有真的玩游戏的人懂规则？」
- 用词用对方自己的说法，不自造术语。
- 不写「没有 X」式的表述 ——「为什么要在番茄炒蛋的菜谱里强调不加东坡肉？」
- 风格：浅灰底 + 白卡片 + 细边框 + 淡阴影的干净后台卡片。
- 子路径部署：前缀按请求推断，一份构建要能同时挂在根和任意多个前缀下。
