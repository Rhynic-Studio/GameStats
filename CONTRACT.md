# 插件契约

底座 = 网站整体架构（`src/core/`）。插件 = 每个游戏的规则（`src/plugins/<游戏>/`）。

## 底座提供

| | |
|---|---|
| 名单 | 玩家、角色、武器、模式…统一增删改，带别名 |
| 记录 | 「场 + 行」两层。一场对局 = 一行场记录 + 若干行子记录 |
| 字段 | 按插件的声明存取，底座不认识字段的含义 |
| 参与方展开 | 把一行摊成两条"我方视角"的行 |
| 聚合 | 分组 + 分子 / 分母 → 计数、比率、求和、平均 |
| 展示 | 表格、矩阵、筛选（日期、玩家、对手） |
| 录入页外壳 | 面包屑、保存、删除、列表页 |

## 插件声明

```ts
export default defineGame({
  slug: 'cs2',
  name: 'CS2 单挑',

  // 这个游戏有哪些名单（玩家是底座自带的）
  lists: [{ key: '模式', label: '模式' }, { key: '项', label: '项' }],

  // 场级字段
  matchFields: [
    { key: '玩家A', label: '玩家A', type: { kind: 'player' } },
    { key: '玩家B', label: '玩家B', type: { kind: 'player' } },
    { key: '模式',  label: '模式',  type: { kind: 'list', list: '模式' } },
  ],

  // 行级字段。一个游戏可以有多种行（crash 有 BP 行和轮行）
  entryKinds: [
    {
      key: '项', label: '项',
      fields: [
        { key: '项',    label: '项',    type: { kind: 'list', list: '项' } },
        { key: 'A得分', label: 'A得分', type: { kind: 'number' } },
        { key: 'B得分', label: 'B得分', type: { kind: 'number' } },
      ],
      // 这一种行的两侧配对
      sides: { score: ['A得分', 'B得分'] },
    },
  ],

  // 场级的玩家配对
  playerSides: ['玩家A', '玩家B'],

  // 衍生字段：插件给的算法，底座不做任何推导
  derive: {
    局数: (e) => 2 * Math.max(e.A得分, e.B得分) - 1,
    赢:   (e) => e.A得分 > e.B得分,
  },

  // 统计
  stats: [ /* 见下 */ ],

  // 录入页（React 组件，用底座导出的控件写）
  Entry: Cs2Entry,
})
```

## 参与方行

声明了配对之后，底座为每条记录生成两条镜像行。行上能读到的：

| | |
|---|---|
| 原始字段 | 场级 + 行级的全部字段，未镜像 |
| `r.我` / `r.对手` | 本方的玩家 / 对方玩家 |
| `r.我分` / `r.对手分` | score 配对的两个字段（如果声明了） |
| `r.我角色` / `r.对手角色` | entity 配对的两个字段（如果声明了） |
| `r.赢` | 插件 `derive` 里算出来的胜负 |

## 统计

```ts
{
  key: '武器',
  title: '各项武器胜率',
  at: 'entry',            // 在行级算；'match' 是在场级算
  kind: '项',             // 哪种行
  groupBy: ['项'],        // 分组字段
  numerator:   { sum: '我分' },
  denominator: { sum: '局数' },
}
```

分子分母各能写三种：

```ts
{ count: true }                    // 行数
{ countWhere: (r) => boolean }     // 满足条件的行数
{ sum: '字段名' }                  // 某字段求和
```

矩阵把 `groupBy` 换成两个字段：

```ts
{
  key: '角色矩阵',
  title: '角色对角色胜率',
  at: 'entry', kind: '轮',
  matrix: ['我角色', '对手角色'],   // 行、列
  byPlayer: true,                   // 界面上带一个玩家筛选
  numerator:   { countWhere: (r) => r.赢 },
  denominator: { count: true },
}
```

## cs2 的统计

```ts
stats: [
  { key:'武器', title:'各项武器胜率', at:'entry', kind:'项', groupBy:['项'],
    numerator:{ sum:'我分' }, denominator:{ sum:'局数' } },

  { key:'单挑', title:'各项单挑胜率', at:'match', groupBy:['模式'],
    numerator:{ countWhere: r => r.赢 }, denominator:{ count:true } },

  { key:'对玩家武器', title:'对某玩家·各项武器胜率', at:'entry', kind:'项',
    groupBy:['项','对手'], numerator:{ sum:'我分' }, denominator:{ sum:'局数' } },

  { key:'对玩家单挑', title:'对某玩家·各项单挑胜率', at:'match',
    groupBy:['模式','对手'], numerator:{ countWhere: r => r.赢 }, denominator:{ count:true } },

  { key:'三项优胜', title:'solo三项 项目优胜数/率', at:'entry', kind:'项',
    filter: r => r.模式 === 'solo三项', groupBy:['对手'],
    numerator:{ countWhere: r => r.赢 }, denominator:{ count:true } },
]
```

## crash 的统计

```ts
stats: [
  // 基础
  { key:'bp', title:'角色 BP 率', at:'entry', kind:'BP', groupBy:['角色'],
    numerator:{ count:true }, denominator:{ /* 这个角色出现的场次 */ } },

  { key:'胜率', title:'角色总胜率', at:'entry', kind:'轮', groupBy:['我角色'],
    numerator:{ countWhere: r => r.赢 }, denominator:{ count:true } },

  { key:'矩阵', title:'角色对角色胜率', at:'entry', kind:'轮',
    matrix:['我角色','对手角色'], byPlayer:true,
    numerator:{ countWhere: r => r.赢 }, denominator:{ count:true } },

  // 高阶
  { key:'首ban', title:'首 ban / 首 pick 率', at:'entry', kind:'BP',
    groupBy:['角色'], filter: r => r.序号 === 1,
    numerator:{ count:true }, denominator:{ count:true } },

  { key:'先攻', title:'先攻胜率', at:'entry', kind:'轮', groupBy:['我角色','我'],
    filter: r => r.我先攻, numerator:{ countWhere: r => r.赢 }, denominator:{ count:true } },

  // 四类胜率：同一个统计换 buff 状态筛选
  { key:'无buff',   title:'无 buff 胜率',   at:'entry', kind:'轮', groupBy:['我角色'],
    filter: r => r.buff状态 === '都无', numerator:{...}, denominator:{...} },
  { key:'优势',     title:'优势胜率',       at:'entry', kind:'轮', groupBy:['我角色'],
    filter: r => r.buff状态 === '我优', numerator:{...}, denominator:{...} },
  { key:'决战',     title:'决战胜率',       at:'entry', kind:'轮', groupBy:['我角色'],
    filter: r => r.buff状态 === '都有', numerator:{...}, denominator:{...} },
  { key:'公平',     title:'公平胜率',       at:'entry', kind:'轮', groupBy:['我角色'],
    filter: r => r.buff状态 === '都无' || r.buff状态 === '都有', numerator:{...}, denominator:{...} },
]
```

上面四类也各自带矩阵（把 `groupBy` 换成 `matrix: ['我角色','对手角色']`）。

crash 的 `derive` 里算出 `buff状态`：

```ts
derive: {
  buff状态: (轮, 本场前面的轮) => {
    const 我赢过 = 前面有轮次我方胜;
    const 对手赢过 = 前面有轮次对手胜;
    return 我赢过 && 对手赢过 ? '都有'
         : 我赢过 ? '我优'
         : 对手赢过 ? '我劣'
         : '都无';
  },
}
```

## 我拍的两个决定（不同意就说）

**一、crash 两套 BP 的参数（池子大小、ban/pick 槽位序列）写在插件里。**

理由：赛制决定字段和录入流程，属于规则本身，而规则就是插件。两套赛制 = 插件里两个常量。
`对局记录里选了哪一套` 是数据，存在库里。

**二、录入界面由插件用底座导出的控件自己写。**

一个仓库，插件直接 import 底座控件，跨仓库的摩擦没有了。crash 的 BP 板按槽位序列一步步点角色，cs2 是按模式填一到三组比分，两边的交互差别太大，各写各的比硬凑一个表单引擎省事。

## 待你确认

1. 上面的声明形状，哪里别扭
2. 两个决定
3. `src/core/` 和 `src/plugins/` 这两个名字行不行
