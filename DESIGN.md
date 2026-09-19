# battle-stats

内网对战数据统计。一个站点、一个数据库，用路径区分游戏。

## 结构

```
src/
  server/
    db.ts       建表 + 播种
    cs2.ts      cs2 的查询、录入、统计
    index.ts    路由
  client/
    App.tsx     路由
    common/     接口封装、可排序表格
    cs2/        对局列表、录入、统计
  shared/
    types.ts
```

每个游戏自己的表、自己的统计查询、自己的页面。共享的只有数据库、可排序表格、基础控件。

## cs2 单挑

### 数据

```
players       id, name, aliases
cs2_items     id, name, sort        项目：手枪 / 长枪 / 狙击
cs2_modes     id, name, sort        单挑：手枪单挑 / 长枪单挑 / 狙击单挑 / solo三项
cs2_matches   id, played_at, player_a, player_b, mode_id, note
cs2_entries   id, match_id, item_id, score_a, score_b, seq
```

一场对局 = 一条 `cs2_matches` + 一到三条 `cs2_entries`。solo三项 填三条（手枪/长枪/狙击），其余填一条。

### 算法

```
局数（单项） = 2 × max(得分A, 得分B) − 1
局数（一场） = 2 × max(总分A, 总分B) − 1
胜负（单项） = 得分高的一方
胜负（一场） = 总分高的一方
```

21:19 → 41 局。solo三项 6:4 / 19:9 / 2:4 → 总分 27:17 → 53 局。

### 统计

三张表，每张带 `玩家` 和 `对手` 两个筛选。

| 表 | 行 | 列 |
|---|---|---|
| 单挑胜率 | 单挑 | 胜率、场次 |
| 项目胜率 | 项目 | 胜率、局数 |
| solo三项高阶数据 → 项目优胜 | 项目 | 优胜数、优胜率 |

- 单挑胜率：分母是该玩家在该单挑打过的场次，在**场**这一层算
- 项目胜率：分母是总局数，在**项**这一层算。手枪单挑的手枪局和 solo三项的手枪项合并统计
- 项目优胜：只在 solo三项 的场里算。优胜数 = 赢下的项数，优胜率 = 优胜数 ÷ 打过的项数

分母为 0 时显示 `—`。

### 排序

每张表的列头都能点，点一下升序，再点降序。名单类的列（项目、单挑、玩家）按**内部 id** 排，数字类的列按数值排。

## 跑

```bash
npm install --cache ./.npm-cache
npm run seed      # 可选，录几场示例数据
npm run dev       # API :8787 + 前端 :5174
# 或者
npm run build && npm start
```

## crash（还没做）

规则和统计需求见聊天记录；三份真实对局 log 存在 `docs/raw-logs.md`，作为验收数据。
