# dsh-activity-bar 设计方案

- 状态：v0.1 已按其 P0–P4 实现（代码在 `lib/`，自测脚本 `scripts/smoke.mjs`）；与本文的差异见 §11
- 目标环境：Windows 桌面版 DSH `0.2.1-rc.3`（Web 端差异见 §4.2）
- 来源：产品方案评审团三个角色独立分析后汇总，证据位置标在正文里

---

## 1 结论

做两条 48px 常驻竖条：左条接管「插件 / 定时任务 / 上下文洞察 / 更多 / 记忆」与新会话入口，右条接管右侧 9 个工具入口。宽度收益与平台强相关：Windows 桌面端左栏收起后整列消失（`collapsedWidth = 0`），所以左条必须自绘；普通 Web 端左栏收起后自带 56px 图标轨，此时插件不再画第二条，只做「启动即收起 + 记住状态」。

v1 范围：

| 档位 | 内容 |
|---|---|
| 必做 | 右条（自绘，条目取自宿主账本）、左条（桌面端自绘 / Web 端让位原生轨）、两个布尔开关、图形配置页、中英文 locale、卸载复位说明 |
| 建议 | 溢出「更多」折叠、快捷键提示、明暗主题自测矩阵 |
| 不做 | 自绘工作区树与会话树、图标排序自定义、单条宽度可调、主题色自定义 |

一句话风险：右条的价值只在「右栏收起」时兑现。打开工具后 300–466px 的面板会回来，宽度还回去。README 必须把这一点写在明处，否则用户会觉得被骗。

---

## 2 现状量化

截图 2797×1499 物理像素，缩放到 CSS 约 1.46 倍（以宿主侧栏默认 280 CSS、截图实测 408px 反推），视口约 1920×1027 CSS：

| 区域 | 物理 px | CSS px | 占视口 |
|---|---|---|---|
| 左侧栏 | 408 | ≈279 | 14.5% |
| 中间工作区 | 1710 | ≈1171 | 61.0% |
| 右侧栏 | 679 | ≈466 | 24.3% |

换成两条 44px 竖条后（视口 1920 CSS，右栏收起态；轨宽取实现值 44，理由见 §11.1）：

| 配置 | 左 | 中 | 右 | 中间相对现状 |
|---|---|---|---|---|
| 现状 | 279 | 1171 | 466 | — |
| 只开右条 | 279 | 1597 | 44 | +36.4% |
| 只开左条 | 44 | 1410 | 466 | +20.4% |
| 两条都开 | 44 | 1832 | 44 | +56.4% |

> 修正记录：产品评审最初按 2 倍缩放得出「左栏 204 CSS、中区 855、换成竖条后 1303」，与宿主 `clampWidth(sidebar, 264, 420)`（`dsh-client-ui-layout/lib/client.js:413`）冲突——204 落在允许区间之外，不可能出现。已按 1.46 倍缩放修正，中区基线从 855 改为 1171，所有阈值随之改算。后续文档与 README 一律使用 1171 / 1597 / 1832 这组数字（44px 轨口径）。

---

## 3 三个会改变方案的事实

### 3.1 左栏收起后是否留下图标轨，取决于平台

`dsh-client-ui-layout/lib/client.js:242`

```js
const collapsedWidth = darwin || document.documentElement.hasAttribute("data-windows-titlebar") ? 0 : 56;
```

- 普通 Web / 浏览器：收起宽度 56px，侧栏自己渲染 36×36 图标按钮，带 500ms tooltip、`aria-label`、`aria-current`（`dsh-client-ui-sidebar/lib/client.js:115` 的 CSS 与 `:204-236` 的 `PanelRow`）。
- macOS 桌面、Windows 桌面（本机就是这一类，截图顶部有自绘标题栏与「应用 / 编辑」菜单）：收起宽度 0，整列消失。侧栏把 `panelList`、`regionArea`、`footArea` 全部 `display:none`，只把 28px 的收起开关与新建会话按钮固定进标题栏（`left:12px` 与 `left:48px`）。

结论：在本机现状下，左栏一收，5 个入口全部消失。用户要的「左侧图标条」在 Windows 桌面上是真新增，在普通 Web 端是重复建设。方案按平台分流，见 §4.2。

### 3.2 右侧没有「常驻工具条」槽位

右栏的 `renderSlot` 全集只有 4 个：`rightbar.session`、`sidebar.right.tab.guide.actions`、`sidebar.right.tab.guide.entry`、`sidebar.right.tab.menu.item`（`dsh-client-ui-sidebar-right/lib/client.js`）。工具入口是引导页条目，`guide.entry` 接收 `{ id, title, description, useTabInfo }`（`dsh-client-ui-sidebar-right/README.zh.md:115`）。没有给竖条预留位置。

右栏最小宽度 300（`setRightbar` 内 `Math.max(300, viewport * RIGHTBAR_MAX_RATIO)`，`dsh-client-ui-layout/lib/client.js:428`），不能压到 48。所以右条只能自绘，挂在别处。

### 3.3 `shell.overlay` 是唯一合适的挂载座

`dsh-client-ui-layout/lib/client.js:73` 的 CSS：`.overlayLayer{position:absolute;inset:0;z-index:20;pointer-events:none}`，且 `.overlayLayer>*{pointer-events:auto}`；默认组合不占用这个座（`dsh-client-ui-layout/README.zh.md:34`）。

这同时满足插件规范的两条硬约束：不往 `document.body` 外写 DOM（插件技能 `references/practices.md:37`）、不替换应用根节点（`references/ui-plugin.md:14`）——overlay 本身就是「整帧覆盖层」这个既有容器。

---

## 4 方案设计

### 4.1 形态与尺寸

- 两条竖条，宽 48px，贴视口左右边缘，从 `--dsh-frame-top-clearance` 下方开始（Windows 桌面下它就是 `var(--dsh-windows-titlebar-height)`）。
- 图标 20px，按钮 36×36，行距 12px，圆角 `--dsw-radius-md`。
- 悬浮底色 `--dsw-alias-interactive-bg-hover`；选中项额外加 2px 内嵌竖条，颜色 `--dsw-alias-state-business-primary`。
- 竖条底色 `--dsw-specific-sidebar-fill`，与宿主侧栏同一填充色；分隔线 `0.5px solid var(--dsw-alias-border-l3)`。
- 只使用 `--dsw-*` 令牌，不写死色值，明暗主题自动跟随。

### 4.2 平台分流（左条）

| 平台判定 | 做法 |
|---|---|
| `collapsedWidth === 0`（桌面端） | 自绘左条：5 个 `sidebar.panellist` 条目 + 新建会话 + 展开侧栏 + 工作区 + 底部 `sidebar.footer.action` |
| `collapsedWidth === 56`（普通 Web） | 不自绘。调用 `layout.panels.setSidebar(0)` 让宿主的 56px 轨出现，并把「展开/收起」写进设置，刷新后恢复 |

判定方式：`documentElement.hasAttribute('data-windows-titlebar') || documentElement.dataset.platform === 'darwin'`，不用 UA 嗅探。

### 4.3 右条

- 挂 `shell.overlay`：`position:absolute; inset-inline-end:0; top:var(--dsh-frame-top-clearance)`。
- 条目来源 `ctx.slots.entries('sidebar.right.tab.guide.entry')`，按 `order` 排序，不硬编码 `kind`。条目没有注册图标时用内置 glyph 表（见 README 图标对照表）。
- 点击：`ctx.sidebarRight.openTab(kind)`，其内部会经 `layout.openRightbar(track, fullscreen)` 展开右栏；再点同一图标不收起（收起交给面板自己的按钮），避免第二次点击把界面带回脏状态。
- 右栏展开期间右条照常显示：让位改由右栏整列的内边距完成（面板头部与它自己的收起按钮一起左移），右条不再隐藏。见 §11 第 11 条。
- 纵向溢出（条目数 × 48 大于可用高度）时，末尾收进「更多」按钮，弹出菜单宽度与原生一致性取 288px、最大不超过视口减 24px。

### 4.4 两态与状态机

| 状态 | 左 | 右 | 中间宽度 |
|---|---|---|---|
| 空载（默认） | 48 轨 | 48 轨 | 最宽 |
| 侧栏展开 | 264–420 | 48 | 中 |
| 右栏展开 | 48 | 隐藏 | 中 |
| 两侧都展开 | 264–420 | 隐藏 | 最窄 |

一次点击只改一个区域，不做联动展开。回到宽栏只能由用户点左条的「展开侧栏」触发。

### 4.5 配置

v1 只允许两个布尔项（实现沿用这两个名字，见 §11）：

| 键 | 类型 | 默认 | 含义 |
|---|---|---|---|
| `left` | boolean | `true` | 启用左侧活动栏（只在 Windows 桌面端绘制；其他平台不画，见 §11.4、§11.5） |
| `right` | boolean | `true` | 启用右侧活动栏 |

- 存储：客户端 `localStorage` 键 `dsh-activity-bar.prefs`，值形如 `{"left":true,"right":true}`（改动理由见 §11.3）。
- 配置页：注册 `settings.section`（由 `@deepseek-ai/dsh-client-ui-settings` 声明的 slot 类型，`README.zh.md:44`），两行开关直接读写上面的键。

### 4.6 无障碍与提示

- 每个按钮：本地化 `aria-label`；左条目用 `aria-current="true"`；右条目用 `aria-pressed`；有快捷键的补 `aria-keyshortcuts`（终端 <kbd>Ctrl</kbd>+<kbd>`</kbd>、浏览器 <kbd>Ctrl</kbd>+<kbd>T</kbd>）。
- tooltip 延迟 500ms，与宿主收起轨一致。
- 焦点态：`outline: var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary))`。
- Tab 可达，宿主注册的每个入口都能不用鼠标完成。

### 4.7 首屏

收起必须在首帧完成，不能等挂载后再补一次，否则每次加载都会闪一下 280→48。做法：Client 半侧在校验配置后同步派发一次 `setSidebar(0)`，用 `useLayoutEffect` 而非 `useEffect`；用户手动拖宽后写入设置，下次加载不再强行收回。

---

## 5 被否掉的两个方向

| 方向 | 否掉的理由 |
|---|---|
| 自绘左栏并接管工作区树、会话树 | 相当于重写侧栏。`sidebar.workspaces` 账本里的行组件、hover 动作、会话右键菜单、目录选择器都在宿主内部，搬出来要复刻十几个行为，且随升级必坏 |
| 硬编码 9 个 kind 的右条 | DSH 升级即失效；`openTab` 对未注册 kind 直接抛错；「更多工具」无法跟随 |

---

## 6 文件骨架

按本机已装第三方插件的真实形状（对照 `dsh-bottom-info-bar` 1.21.9）：

```text
dsh-activity-bar/
├── package.json            # dsh.bundle.patch 与 dsh.client.platform/inject
├── cordis.patch.yml        # insert 一行：id 用 activity-bar，name 用包名
├── lib/
│   ├── index.js            # host 半侧：Config 声明，apply 为空
│   └── client.js           # client 半侧：两条竖条
├── locale/
│   ├── en.json
│   └── zh.json
├── docs/
│   ├── DESIGN.md           # 本文件
│   └── images/             # 截图与示意图
├── README.md               # 英文
├── README.zh-CN.md         # 中文
└── LICENSE
```

`package.json` 关键字段（照抄已装插件的做法）：

```json
{
  "name": "dsh-activity-bar",
  "type": "module",
  "main": "lib/index.js",
  "exports": {
    ".": "./lib/index.js",
    "./client": "./lib/client.js",
    "./cordis.patch.yml": "./cordis.patch.yml",
    "./locale/*.json": "./locale/*.json",
    "./package.json": "./package.json"
  },
  "dsh": {
    "bundle": { "patch": "./cordis.patch.yml" },
    "client": {
      "platform": "web",
      "inject": [
        "@deepseek-ai/dsh-client-ui-layout",
        "@deepseek-ai/dsh-client-ui-sidebar",
        "@deepseek-ai/dsh-client-ui-sidebar-right",
        "@deepseek-ai/dsh-client-ui-settings",
        "@deepseek-ai/dsh-client-locale"
      ]
    }
  }
}
```

`cordis.patch.yml`：

```yaml
- insert:
    - id: activity-bar
      name: 'dsh-activity-bar'
```

> 行 `id` 与 `name` 刻意不同：DSH 的插件卡片会把两者分行印出，相同时会出现同一串文字两次。

---

## 7 分阶段

| 阶段 | 内容 | 完成判据 |
|---|---|---|
| P0 | 骨架能装能卸：package.json、patch、host 半侧 Config、一个空的 `shell.overlay` 组件 | 装上后页面无报错，卸掉后无残留，`configForms` 里能看到两个键 |
| P1 | 右条：账本读取、图标回退表、开合两态、tooltip、aria | 9 个入口点击都有反应；再点收起；右栏收起时中间区达到 §8 阈值 |
| P2 | 左条：平台分流、桌面端自绘、Web 端只做收起 | 桌面端 5 个入口 + 新会话可用；Web 端出现宿主 56px 轨且不出现第二条 |
| P3 | 配置页 `settings.section` 两个开关 | 改开关并刷新后行为改变；关掉时该侧完全消失 |
| P4 | 溢出滚动、locale、明暗与窄屏矩阵 | 700px 高视口下所有入口可达（轨内滚动） |

每阶段都要 Bot 自己跑验证并留存输出，不让用户代测。

---

## 8 验收标准

| 编号 | 判据 | 测法 |
|---|---|---|
| A1 | 视口 1920 CSS、右栏收起、`right=true` 时中间区 ≥ 1580 | 截图量宽 |
| A2 | 同上，两条都开时中间区 ≥ 1810 | 截图量宽 |
| A3 | 关掉 `right` 并刷新，右条消失且右栏默认展开行为回到宿主原样 | 手动 + 截图 |
| A4 | 关掉 `left` 并刷新，左侧恢复宿主默认展开 | 手动 + 截图 |
| A5 | 宿主已注册的每个入口逐一可点，中文与英文 tooltip 齐全，Tab 可全部到达 | 键盘走查 + 截图 |
| A6 | 明暗两主题下图标与底色对比度 ≥ 3:1 | 取色计算 |
| A7 | 连续开合 20 次无控制台错误、无 `slot entry crashed` | 控制台日志 |
| A8 | 卸载插件后无残留元素，侧栏状态可手动恢复 | 卸载后检查 DOM |
| A9 | 1280×800 与 1024×700 下无死按钮、无裁剪、无双导航 | 矩阵截图 |

---

## 9 未验证项（写进 README 的已知限制）

1. `ctx.slots.entries('sidebar.right.tab.guide.entry')` 返回的条目能否在引导页之外独立渲染。若条目组件依赖 guide 页注入的 `useTabInfo`，右条要退回「自建按钮 + 按 kind 打开」。
2. Client 平台 `Slots.listSubTree` 与 `Theme.listTokens` 本轮两次调用均 10 秒超时（提示重新连接页面），真实 slot 树没有取到，§3 的 slot 结论全部来自包源码静态阅读。
3. Client 半侧读写自身 `Config` 的路径未核实，影响配置页的写入能力（§4.5）。
4. 窄屏（<1024 自动收起、<768 右栏全屏）下与既有自动行为的相互作用未实测。
5. 用户真实使用频次无数据（n=1 自述），「图标条比文字列表更快」属类比推断，不是测量结论。
6. 本轮没有安装任何插件，也没有在 `http://127.0.0.1:59400` 上验证任何开合行为。

---

## 10 README 内容规划

中英文两版，章节一一对应：

1. 标题、徽章、一句话定位
2. 布局示意图（示意图，非截图）
3. 为什么做：§2 的数字表
4. 功能清单
5. 界面截图：三张待补（左条收起态、右条 + 已打开面板、配置页），实现后由 Bot 自己截图
6. 安装：对话式安装、手动写 profile 两种
7. 使用：两条竖条各自的行为、开关含义、图标对照表、快捷键
8. 配置项表
9. 兼容性与已知限制：§9 全部条目
10. 卸载与复位
11. 开发：目录、构建、HMR 观察方式
12. 自测清单：§8 的 A1–A9，做成可勾选
13. 许可证

中文版写作约束：只用简体中文；不用「栈 / 落地 / 钉死 / 对齐 / 契约 / 拆」；不用「不是……而是」句式；不写总起与总结章节。

---

## 11 实现与本文的差异

v0.1 已按 §7 的 P0–P4 实现，真机反馈后又迭代四轮，实现时共改了十八处，README 两版按实现写，不按方案写：

1. **轨宽 48 → 44**。48 留给宿主 36px 图标加左右 6px 内边距，实测在 Windows 标题条下偏宽；44 让 32px 按钮的左右各留 6px，与宿主收起态 36px 图标加 12px padding 的视觉密度接近。§2 的数字表因此整体减 4px（只右条 1597、只左条 1410、两条 1832）。
2. **左条不含「新会话」与「更多」**。新会话在 Windows 收起态已由宿主固定在标题栏 `left:48px`，再放一枚就是两个入口；「更多」是菜单不是面板，宿主把它的锚点挂在面板列表末尾，收起态随整列一起隐藏。左条因此只放宿主注册的每个面板（真机反馈后连「展开/工作区」那枚双态按钮也去掉了，见第 10 条）。
3. **两个开关移进设置页，存 `localStorage`**（键 `dsh-activity-bar.prefs`，值 `{left,right}`）。§4.5 设想的「读插件 `Config`」在 Client 半侧走不通（宿主的设置服务只对白名单命名空间开放），为两个布尔值搭一条宿主 HTTP 路由不划算。§9 第 3 条因此关闭。
4. **Web 端不接管收起**。方案里的「启动即收起 + 记住状态」会改变用户在 Web 端已有的侧栏状态，收益与风险不成比例；v0.1 在 Web 端不画左条、不改侧栏状态，等有人需要再做。
5. **左条只在 `html[data-windows-titlebar]` 下绘制**，macOS 桌面端（`data-platform=darwin`）整列同样消失，但没有设备验证红绿灯区域的避让，v0.1 不绘制，写进 README 已知限制。
6. **右条条目用 `sidebarRightTabs.guide()` 的账本**，不读 `sidebar.right.tab.guide.entry` 插槽的渲染结果（§9 第 1 条因此关闭：只取 `{id,title,kind}` 元数据，不渲染别人的组件）。点击调 `sidebarRight.openTab(kind)`，右栏展开由宿主在 `openWithFocus` 内完成，插件不自己调 `openRightbar`。

7. **安装机制以实测为准**。`dsh plugin --profile <profile> add "<包名>@link:<绝对路径>"` 在 profile 目录里跑 `pnpm add`，并同时写 `dependencies` 与 `dsh.profile.bundles`；挂载由插件自带的 `cordis.patch.yml` 完成。所以 §6 设想的「在 profile 的 `cordis.patch.yml` 里手写一条 `- insert:`」是错的双挂载写法，README 已改成「进 bundles」。另外 `dsh --profile desktop --dump-config` 在桌面端 profile 上直接报 `error: profile "desktop" is managed exclusively by the Electron application`，安装后的合成结果只能在重启桌面应用后观察。

8. **两侧竖条都在展开态出现**（v0.1 真机反馈后改）。原先设想「只在面板收起时绘制」，真机上一开右栏竖条就消失、侧栏展开就没了入口，等于把竖条当成收起态的补丁。现在：右条在右栏展开、收起时都绘制；左条在 Windows 与 macOS 桌面端常驻，普通 Web 端只在侧栏展开时绘制（收起后宿主自带 56px 轨，再画就重复）。判定读 `<html>` 上的 `data-windows-titlebar` 与 `data-platform="darwin"`，两个都没有按普通网页处理。
9. **占位按相邻列分别处理**。收起态让中列让出 44px；侧栏展开时让侧栏列让出，右栏展开时让右栏列让出。实现是用三组标记（`data-dsh-ab-center` / `-sidebar` / `-rightbar`）加 `html[data-dsh-ab-left="sidebar|center"]` 的 `margin` 规则，竖条占的正是自己腾出来的那条空隙，不压住面板内容。顶边避让取 `max(frame 的 padding-top, --dsh-frame-top-clearance)`，macOS 的 48px 由此生效；macOS 下把竖条底色置为透明，露出宿主的半透明框架。

10. **竖条接管面板入口后，侧栏让出那些空间**（第二轮真机反馈）。三点变化：一是去掉左条顶部的「工作区 / 展开侧栏」双态按钮，它和执行栏里的收放开关重复；二是竖条既然列出了全部面板，侧栏内部那份同名列表与底部动作行（DS Bot、已登录、远程）就隐藏掉，展开后只剩工作区树与会话列表，用户要的就是这段空间；三是图标改成渲染 `sidebar.panellist` 条目自带的 `component`（插件自己画的图标），外面套一层 `getDerivedStateFromError` 错误边界，某个图标组件依赖不到的上下文出错时退回内置字形，整条竖条不受影响。

11. **占位方式由 `margin` 改 `padding`**。第 9 条的写法在侧栏展开时暴露问题：侧栏外壳给内层盒子写了固定 `width:280px`，网格列上再挂 `margin` 只压缩列的外框、不压缩这个固定宽盒子，盒子被挤出列外，列上的 `overflow:hidden` 于是把右侧内容裁掉（真机上表现为「新会话」按钮右半边不见、整块 UI 右移）。现在改为在贴着竖条的那一列的内层盒子上留 `padding-left`（左，`calc(44px + 10px)` 保留宿主原有的 10px 内边距）或 `padding-right`（右），内层盒子宽度不变、内容整体内移，不再有溢出与裁剪；收起态那一列宽度为 0，仍用中列的 `margin` 从邻列借出 44px。定位内层盒子用 `resolveInner()`：逐层跳过 `display:contents` 的插槽宿主，取到真正有盒子的一层，打 `data-dsh-ab-padleft` / `-padright` 标记。

12. **右侧让位改到整列，收起按钮才不被挡**（第三轮真机反馈）。第 11 条只在右栏内层盒子上留 `padding-right`，而面板头部（含收起按钮）是宿主画在列顶的另一层，于是按钮落进竖条底下、点不到，中间区也没回到自适应。现在改为给右栏整列加 `padding-right:44px`：头部、面板、收起按钮一起左移，中列由宿主自己的 `1fr` 网格跟着变窄。左侧仍留在侧栏内层盒子上（第 11 条的原因不变：外壳有固定宽度）。
13. **底部动作行搬进竖条的下三分之一**（第三轮真机反馈）。用户要求「左侧下方占据三分之一，上方占据三分之二，头像固定在最下方，DS Bot 也要回到左下」。实现不改宿主逻辑，只用定位把宿主自己的 `.footArea` 搬到竖条下半段：`top:67%; bottom:6px`、纵向排列、`justify-content:flex-end`（最后一项贴底）、`font-size:0` 隐藏文字、`button/a` 收成 32×32、`svg/img` 收成 18px、超长时该区域内部滚动；同时侧栏内层盒子加 `padding-bottom:clamp(120px,30vh,320px)`，工作区树不钻到这块底下。竖条自己的面板入口包在 `.dsh-ab-top` 里，占上方 67%。
14. **右侧图标最终定稿为纯入口**（第三轮提出开关，第五轮恢复开关，第六轮用户拍板去掉）。两次开关实现都在真机上失手：`active()` 读不到未提交的 tab（判定落空、第二次点击变成重新打开），放宽成「展开态无其它工具在前就收起」又会把刚点开的其它工具一并收掉。用户结论：「第二次点击不用做任何动作」。现在 `activateTool` 只调 `openTab(kind)`，收起走右栏自己的收起按钮。
15. **方向判定改用实测盒宽**（第三轮真机反馈）。原先靠 `data-sidebar-collapsed` / `data-rightbar-collapsed` 两个属性决定 44px 借自哪一列，收起/展开动画期间属性与盒宽短暂不同步，会出现「贴着竖条的那一列已经变宽但占位规则还按旧状态走」。现在 `readShellState()` 直接读两列的 `getBoundingClientRect().width`，宽于 8px 即视为展开，并用 `ResizeObserver` 盯两列；属性只作为回调触发源，不再当真相。

16. **右侧独立区域最终改成整个网格内缩**（第四轮真机反馈）。第 12 条给右栏列留 `padding-right` 仍不够：面板头部与收起按钮是宿主绝对定位在列顶的另一层，`padding` 不会位移 `right:0` 的绝对定位子元素，于是「文件」图标与收起按钮继续重叠。现在给 frame 本身留 `padding-left` / `padding-right:44px`（`box-sizing:border-box`），整个网格（侧栏列、`1fr` 中列、右栏列及其头部）一起向内收，中列由宿主自己的网格重算。第 9、11、12 条的列内 `margin` / `padding` 规则随之删除。

17. **竖条改用 `position:fixed`，不再跟着 frame 的盒模型走**。上面那条曾让我把竖条写成 `left:-44px`：`shell.overlay` 的 `inset:0` 覆盖的是 frame 的 **padding 盒**（含刚让出的 44px），负偏移等于把竖条推到边框盒外，被 frame 的 `overflow:hidden` 整条裁掉，真机表现是「按钮都不见了」。现在竖条固定在视口左右边缘（`position:fixed` + `left:0` / `right:0`），顶边取 `max(frame 的 padding-top, --dsh-frame-top-clearance)`、底边取底部行高度；让出的 44px 由 frame 内边距保证，那条空隙里永远没有内容，竖条只是站在空处。`position:fixed` 同时让竖条不再受宿主任何包含块与裁剪的约束。

17a. **侧栏列在展开态放开裁剪**。底部动作行被绝对定位到列外一格（`left:-44px`，落进 frame 让出的空隙），而宿主侧栏列自带 `overflow:hidden`，会把这块一起裁掉——这是「按钮都不见了」的第二处成因。规则 `html[data-dsh-ab-left="sidebar"] [data-dsh-ab-sidebar]{overflow:visible !important}` 只在侧栏展开时放开裁剪（收起时那套规则本来就不生效）。

18b-2. **「远程」行是 JS 搬进来的**（第六轮真机反馈：「远程图标还在外面」）。它根本不在宿主的 `footArea` 里——那是外壳画在工作区树里的用户级入口，CSS 选择器永远够不着。`relocateRemoteRow()` 按可达名精确匹配（整段文本恰为「远程」）找到真正的行节点，`appendChild` 挪进脚部条带并打 `data-dsh-ab-remote` 标记收成 32×32 图标；卸载时把节点放回原处（从 foot 里移除，React 下次渲染重建原树）。头像居中同轮修正：`margin:0 auto` 在 flex 列里被 `align-items:center` 架空，改由 JS 打 `data-dsh-ab-account` 标记，CSS 用 `margin-top:auto` 贴底、`align-self:center` 居中。

18a. **底部动作行改回正常流 + 负外边距**（第五轮真机反馈：「重启后远程图标漂移了」「头像的 logo 没了」）。绝对定位的 `top:67%` 把脚部钉在列高的三分之二处，而宿主某些行（远程）自带绝对定位，重启时序不同就漂到工作区列表上；`background:none` 又抹掉了账号按钮的头像底色。现在脚部保持宿主的正常流（本来就钉在列底），只用 `margin-left:calc(-1 * (44px + var(--dsh-sidebar-inline-padding,12px)))` 平移进竖条空隙并水平居中，容器内所有后代的 `position` 一律 `static`，按钮不再清背景色与文字色。

18b. **账号行与「读不到活动 tab」的收起兜底**（第六轮真机反馈：「第二次点击只有工作区回去」「头像没有左右居中」）。两处收口：一是收起判定从「展开且活动 tab 是它」放宽为「展开且没有其它工具在前」——`active()` 只覆盖已提交的 tab，未提交时会落空、第二次点击又打开了；现在展开态下点任何图标，只要没有别的工具抢着前台就收起。二是头像居中不再靠 `margin:0 auto`（在 flex 列里被 `align-items:center` 架空），改为 JS 按文案给账号行打 `data-dsh-ab-account` 标记，CSS 用 `margin-top:auto` 把它钉在条带最底、`align-self:center` 水平居中；用户明确「头像可单独写死」，其余行保持宿主流式顺序。

18c. **「远程」是 `dsh-web-remote` 插件自己造的按钮，「远程」不是宿主行**（第七轮真机反馈：「远程的按钮没有处理好，没出现在左下角，是不是注册机制不一样？」）。查证：该按钮由 `dsh-web-remote` 的 `panel.mjs` 用 `document.createElement('button')` 创建（`#webrm-native`），靠 250ms 轮询在侧栏里找位置插入，`aria-label`/`title` 都是「远程访问」，可访问名从不可能等于「远程」——第 18b-2 条那套文本匹配一次都没命中，按钮停在原处（截图里带图标和文字的宽行）。现在 `relocateRemoteRow()` 先按 id 认领 `#webrm-native`，再保留按文本兜底（宿主行存在时才用）；该插件最多 10 秒才插入，认领失败时用 1 秒轮询补认、最多 30 次。该插件每 2 秒往按钮写内联 `width/height/margin`，本插件一律用 `!important` 压住；健康红点 `> i` 需要绝对定位，单独加例外并把按钮设成 `position:relative`、`overflow:visible` 作锚点。

18d. **头像不居中：整条脚部的平移量是猜的，触发器也不是 flex 条目**（第七轮真机反馈：「左下角头像还是没有居中」）。根因有两条。一是 `margin-left` 里写死的 `44px + var(--dsh-sidebar-inline-padding,12px)` 只是对宿主内边距链的猜测；实际嵌套多一层时整条脚部整体左移，32px 的头像被推到窗口外沿（截图里贴边、右侧留空）。现在 `alignFootStrip()` 先把 `--dsh-ab-foot-shift` 置 0、量出脚部真实 `rect.left` 再把负值写回，静态 `calc()` 只作首帧兜底。二是账号触发器外面还套着宿主的 `_5Qcc8a_root`（`flex:1`）与 `_5Qcc8a_anchor`（`width:100%`）两层 div，`> *` 只溶解直接子级，触发器实际是这两层里的普通块，`data-dsh-ab-account` 上的 `order/margin-top:auto/align-self:center` 全部落空。现在 `[class*="footArea"] div{display:contents}` 把整条 div 链透明化，按钮才真正成为脚部的 flex 条目。

18. **底部三分区加三条硬约束**。一是用 `display:contents` 溶解宿主的分组容器，让真正的 `button/a/[role=button]` 成为这块区域的 flex 条目，否则分组容器自己吃掉全部高度、把按钮撑开，头像就落不到最下面；二是每条收成 32×32、`flex:0 0 auto`、`margin:0 auto` 居中；三是文字（`span/small/p/div`）连同「远程」这类标签用 `font-size:0 !important` 清掉，子元素自带字号，只在容器上设 0 不生效。账号那一行用文案匹配（`登录|账号|account|profile|用户|user|avatar`）写 `order:9999` 排到最后，不动 DOM，React 仍拥有节点。

19. **脚部条不再测量位移，改为钉到竖条自己的坐标**（第八轮真机反馈：「左下角三个图标为什么无法居中？你调了这么多次怎么还是无法居中？」）。前面几条（18a 的负外边距、18c 的 id 认领、18d 的实测位移）都在解同一类题：先量宿主的内边距链，再算一个位移量补偿。宿主每改一层包裹，这个量就错一次，表现永远是差几个像素，用户看到的就是「还是没居中」。现在整段换算删掉：脚部条直接 `position:fixed`、`left:0`、`width:44px`、`bottom:var(--dsh-ab-bottom,0px)`、`padding:8px 0`、`justify-content:flex-end`、`z-index:3`，和竖条站在同一个边框盒里，`align-items:center` 于是落在竖条中线上——没有量出来的量，也就没有可漂的余量。配套三处缺一不可：`> *` 与 `div` 两层 `display:contents` 把宿主的行分组连同账号菜单的两层满宽包裹一起溶解，按钮本身成为 flex 条目（只溶解直接子级时，32px 的触发器仍被钉在满宽祖先的左端）；`[class*="footArea"] *{position:static}` 压住宿主自带的绝对定位行；`gap` 只收横向（`gap:2px 0`），因为行内空隙里只剩被压掉文字却仍占位的标签盒，纵向间距留着更像列表。条带当时还被当成压在侧栏上的一层，于是配了个 `reserveFootSpace()` 量出条带高度写进 `--dsh-ab-foot-space`，侧栏列用 `padding-bottom` 把这段高度还回去；19c 证明这层预留是错的，已删。

19c. **侧栏底部不留预留带：条带在竖条自己的列里，不压在树上**（第十轮真机反馈：「左下角这里是空的，理论上工作区的树应该渲染到这里来了」）。19 里那层 `padding-bottom:var(--dsh-ab-foot-space)` 是把条带当成盖在侧栏上的一层来还空间的，可条带的定位是 `left:0;width:44px`，而 `html[data-dsh-ab-left] [data-dsh-ab-frame]{padding-left:44px}` 已经把侧栏整体推到 x=44 以后，两者根本不重叠。于是这条预留只做了两件事：把宿主的 `.wtg9ga_regionArea`（`flex:1`，工作区树与会话列表的容器）从底部截短一个条带的高度，再把这段空白画给用户看。现在 CSS 只留 `overflow:visible`，`reserveFootSpace()` 与 `--dsh-ab-foot-space` 全部删除，侧栏的工作区树按宿主自己的 flex 规则长到底。

19b. **居中交给 auto 外边距，不再逐图标调 `align-self`**（第九轮真机反馈：「ds bot 彻底居中了，但是头像和远程的两个图标还是没有居中」「这个居中不能针对每个图标写特殊代码，而是要适配所有的插件」）。量真机截图：竖条盒 0–44 CSS px，中线 22；两个偏的图标都在 0–32 之间（中心 16），也就是贴在条带左缘。原因是 flex 条目的 `align-self:stretch` 与确定 `width:32px` 同时存在时，条目按行首对齐，`align-items:center` 不起作用；远程插件还用内联 `alignSelf:'stretch'` 强化了这一点。现在按钮与远程条目的规则都写 `margin:0 auto`：分余空间发生在计算 `align-self` 之前，不受内联 stretch 影响，一条声明覆盖宿主行与任何插件自建行，不需要按文案或 id 写特例。

19a. **压掉文字不等于压掉文字的盒子**。用户猜「是不是因为他们默认就是带着字体一起渲染的」，方向对，但只把容器设成 `font-size:0` 不够：`span` 里的「远程」「DS Bot」字号归零后盒子还在，flex 行里仍占一段宽度，图标被挤到右侧，看起来就像偏了几像素。现在 JS 在 `orderFootRows()` 里给每个有文字的叶子打 `data-dsh-ab-label`，CSS 用 `display:none` 让它们彻底离开布局；带头像的 span 没有文字，永不标记，账号按钮的图片不受影响。

20. **右栏宽度只能写网格轨**（第八轮新增需求：「右侧图标点击展示出来的窗口不能左右拖动改变横向占据面积么」）。宿主自带拖拽手柄，但它只在 `rightbarFullscreen` 为假时渲染，而窄视口、活动 tab 要求全屏、`openRightbar` 带 `fullscreen` 调用时面板都切成全屏，手柄就不存在；`LayoutController` 暴露的只有 `selectPanel / beginNavigation / dispose / toggleSidebar / openRightbar / closeRightbar`，没有 `setRightbar`，宽度无法经由 store 改。宿主唯一的宽度通道是 frame 的内联 `grid-template-columns`（`1fr minmax(0,1fr) minmax(0,Wpx)`，第三轨即面板宽），于是在面板左缘画一个 10px 的 `.dsh-ab-resize`（`role=separator`、`aria-orientation=vertical`、可 Tab 聚焦、左右键各步进 24px、双击回默认），拖动时把第三轨改写成 `minmax(0px,{W}px)`，夹在 `300px` 与 `min(60% 窗宽, 窗宽 - 520px)` 之间，松手写 `localStorage` 的 `dsh-activity-bar.rightbar-width`，下次展开先按它写一遍。宿主在竖条收放、窗口 resize、面板切换时会重算三轨，所以 `MutationObserver` 盯着 `grid-template-columns` 把用户选的宽度写回去——只在用户真拖过（`saved > 0`）时才回写，没拖过的人拿到的仍是宿主默认比例。

20a. **只写网格轨不动面板本体**（第九轮真机反馈：「右侧展开拖动是这个效果，只有任务区动，右侧展开栏不动」）。查宿主 `AppFrame`：三轨是 `{sidebar}px minmax(400px,1fr) minmax(0px,{rightbarMax}px)`，第三轨只是**上限**，面板本体是 `div[data-sidebar-right-panel="push"]`，宽度来自 `rightbar` 插槽的 `width` 属性（内联 `width: <normal.rightbar>px`）。只改第三轨，等于只改面板能占的格子，面板自己还是原来的像素宽，于是中间列被挤、面板纹丝不动。现在两路一起写：`write()` 既改第三轨，又把宽度写进根元素的 `--dsh-ab-rightbar-width` 并打上 `html[data-dsh-ab-right-w]`，CSS 用 `html[data-dsh-ab-right-w] [data-sidebar-right-panel="push"]{width:var(--dsh-ab-rightbar-width,auto) !important}` 把面板钉到同一数值（同时覆盖 `--dsh-sidebar-width`，面板内部的宽度变量跟着走）。样式表声明压过 React 每次渲染写回的内联宽度，不需要额外观察者；全屏态（`data-sidebar-right-panel="fullscreen"`）保持 100vw 不动，marker 只在该右栏可见且用户拖过之后出现。

20b. **面板收起时不写宽度，手柄不等交接班**（第九轮真机反馈两连：「第一次展开右侧的时候，没有拖动按钮，要把窗口大小变化一下就会出现」「如图，这里怎么一大堆空白？是不是之前记录的位置记错了？」）。两条同一个根：写宽度的时机不看开关状态，手柄的显隐又只看一次性测量。

- **空白带**：宿主收面板时把第三轨写成 `minmax(0px,0px)`，而当时的观察者只判「当前轨值 ≠ 记住的宽度」就回写，于是收起瞬间又把 `minmax(0px,{W}px)` 写回去；面板自己是 `position:absolute;right:0` 且 `.panel` 无底色，收起时内部 `[data-dockkit-*]` 被 `translateX(var(--dsh-sidebar-width))` 推走并 `visibility:hidden`，于是那条被占住的轨道没有任何东西填，露出窗口底色——正是截图里那条与最后拖拽宽度等宽的空白。现在 `write()` 先问 `isOpen()`：以面板自身的 `data-sidebar-right-open` 为权威（取不到才退回列宽 > 8px），收起分支只做「摘掉 `data-dsh-ab-right-w`、隐藏手柄」，绝不碰轨道，宿主写的 0 就留在那儿。
- **手柄迟到**：`mountRightResize()` 原来以 `shell.rightbarOpen` 为挂载门槛，且 `place()` 在列宽为 0 时直接 `display:none`；首次展开若正好落在动画首帧（列宽还是 0），之后没有事件再触发 `place()`，要等窗口 resize 才补上。现在手柄一律挂载，显隐交给 `sync()`，并加 `ResizeObserver`（列宽）与放宽后的 `MutationObserver`（frame 全部属性 + 列的 `data-sidebar-right-open`/`class`/`style`，`childList`/`subtree`），面板一开就跑一次 `sync()`：写宽度、摆手柄。

另外两条顺带确认：`lib/index.js` 是空的宿主半侧（功能全在客户端，因此没有 `config:` 段，§C 的手工安装不需要写配置块）；仓库没有构建步骤，`lib/*.js` 直接就是产物，`scripts/smoke.mjs` 用假 DOM 与假 React 通过 `node:vm` 加载真实文件做断言。
