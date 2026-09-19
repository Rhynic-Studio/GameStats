# battle-stats

内网对战数据统计。一个站点、一个数据库，用路径区分游戏：`/cs2`、`/crash`。

## 结构

```
src/
  server/
    db.ts        建表 + 播种名单
    cs2.ts       cs2 的查询、录入、统计
    crash.ts     crash 的查询、录入、统计
    index.ts     路由
  client/
    App.tsx      路由
    common/      Card / TopBar / StatBoard（网格表 + 矩阵）/ 接口封装
    cs2/         对局列表、查看、录入、统计
    crash/
  shared/
    types.ts     共用类型
    crash.ts     crash 的两套规则、结果类型、buff 相关计算
```

每个游戏自己的表、自己的统计查询、自己的页面。共享的只有数据库、卡片与导航、统计表格与矩阵、接口封装。

## cs2 单挑

### 数据

```
cs2_items     id, name, sort        项目：手枪 / 长枪 / 狙击
cs2_modes     id, name, sort        单挑：手枪单挑 / 长枪单挑 / 狙击单挑 / solo三项
cs2_matches   id, played_at, player_a, player_b, mode_id, note
cs2_entries   id, match_id, item_id, score_a, score_b, seq
```

一场对局 = 一条 `cs2_matches` + 一到三条 `cs2_entries`。solo三项 填三条，其余填一条。

### 算法

```
局数（单项） = 2 × max(得分A, 得分B) − 1
局数（一场） = 2 × max(总分A, 总分B) − 1
胜负（单项） = 得分高的一方
胜负（一场） = 总分高的一方
```

21:19 → 41 局。solo三项 6:4 / 19:9 / 2:4 → 总分 27:17 → 53 局。

### 统计

| 表 | 行 | 列 |
|---|---|---|
| 单挑胜率 | 单挑 | 胜率、场次 |
| 项目胜率 | 项目 | 胜率、局数 |
| 高阶数据 → solo三项项目优胜 | 项目 | 优胜数、优胜率 |

玩家和对手是筛选，跟着左侧项目切换继承。单挑胜率在场这一层算，分母是场次；项目胜率在项这一层算，分母是总局数，手枪单挑的手枪局和 solo三项的手枪项合并；项目优胜只在 solo三项 的场里算。

## crash

### 数据

```
crash_roles    id, name, sort        角色（14 个）
crash_matches  id, played_at, player_a, player_b, rule, first_side, note
crash_pool     match_id, role_id, seq          出现名单
crash_draft    match_id, seq, role_id          ban / pick，seq 是槽位序号
crash_rounds   match_id, idx, initiative_side, role_a, role_b, result, win_kind
```

### 规则

两套，写在 `src/shared/crash.ts` 的 `RULES`，槽位序列就是 ban/pick 的执行顺序：

```
初见模式  池 6   pick先 pick后 pick后 pick先 pick先 pick后
bp模式    池 10  ban先 ban后 pick后 pick先 pick先 pick后 pick后 pick先
```

- 先手 = BP 先手方
- 一场 bo3，先拿 2 分赢，最多 3 轮
- 每轮双方各出一个角色，记录先攻方、双方角色、胜方、胜利条件
- 轮结果：胜、投降、双方弃赛、未打完

### buff

上场时自己的大比分不是 0，这个角色就带 buff。大比分 = 本场此前赢下的轮数。所以：

```
第 1 轮   双方都 0            → 都无
第 2 轮   第 1 轮的胜方带 buff  → 我优 / 我劣
第 3 轮   1:1 时两边都带       → 都有
```

### 统计

| 分组 | 表 | 行 | 列 |
|---|---|---|---|
| 基础 | 角色 BP 率 | 角色 | bp率、ban率、pick率、出现 |
| 基础 | 角色总胜率 | 角色 | 胜率、轮数 + 角色对角色矩阵 |
| 基础 | 先攻胜率 | 角色 / 玩家 | 胜率、轮数 |
| 高阶 | 首 ban 首 pick 率 | 角色 | 首ban率、首pick率、出现 |
| 高阶 | 无 buff 胜率 | 角色 | 胜率、轮数 + 矩阵 |
| 高阶 | 优势胜率 | 角色 | 胜率、轮数 + 矩阵 |
| 高阶 | 决战胜率 | 角色 | 胜率、轮数 + 矩阵 |
| 高阶 | 公平胜率 | 角色 | 胜率、轮数 + 矩阵 |

- bp / ban / pick / 首ban / 首pick 率的分母 = 该角色出现的场次
- 胜率的分母 = 该角色实际出场的轮数
- 公平胜率 = 无 buff + 决战
- 玩家筛选同时作用于普通表和矩阵

## 排序

所有统计表的列头都能点，点一下升序再点降序。名单类的列按内部 id 排，数字类的列按数值排。

## 跑

```bash
npm install --cache ./.npm-cache
npm run seed      # 示例数据 + 三份真实 log（log2 的旧 bp 规则不在支持范围内）
npm run dev       # API :8787 + 前端 :5174
# 或者
npm run build && npm start
```
