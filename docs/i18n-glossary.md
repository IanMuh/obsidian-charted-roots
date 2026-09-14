# Charted Roots 中文化术语表与翻译规则

本文件用于统一 fork 内全量 UI 中文化的译名与边界。所有翻译工作必须遵守。

## 一、翻译边界（硬性规则）

### 必须翻译（用户可见的展示文本）
- `new Notice(...)` 的用户可见消息
- `Setting.setName(...)` / `.setDesc(...)` 的名称与描述
- 模态框 / 视图的标题、按钮、说明文字（`.setTitle`、`.setButtonText`、`.setHeading`、`text:`、`contentEl.createEl('h2', { text: ... })` 等）
- 下拉选项的显示标签（`.addOption(value, 'Label')` 的第二个参数）
- `getDisplayText()` 返回的视图标题
- `placeholder`、`aria-label`、`setTooltip` 等可访问性文本
- 上下文菜单项 `.setTitle(...)` / `.addItem(item => item.setTitle(...))`
- 命令定义中的 `name`（`addCommand({ id, name })` 的 name）
- 图表 / 地图 / 时间轴 / 统计图表上渲染的显示标签
- 内置默认类型表中的 `name` / `description` / `label` 等**显示字段**

### 绝对不要翻译（数据/标识/导出/代码）
- 任何 `id`、`value`、`slug`、`key`、CSS 类名、DOM 选择器
- 正则表达式、`toISOString()`、文件名、frontmatter 键名
- GEDCOM / GEDCOMX 标签（BIRT、DEAT、ABT、BEF、AFT、BET…）
- `src/constants/` 下的 Markdown 模板正文（会写入用户 vault 的内容）
- `console.log/warn/error` 等开发者日志
- 抛给开发者的 `throw new Error('...')` 内部错误消息（除非该错误文本会原样展示给用户）
- 变量插值中的枚举值/键名（如 `` `${type}` `` 里的 type 值）
- 报告导出正文（reports 服务的 Markdown/PDF 内容）——本期不改

### 判断要点
**先 grep 该字面量是否被用于写入 vault 或与用户数据比对**。例如默认类型表的 `id` 是 slug（不可译），而 `name` 是纯显示字段（可译）。
若一个字符串既可能显示又可能作为数据，**宁可不译**，并在提交信息里记录。

## 二、核心术语对照（务必统一）

| 英文 | 中文 | 备注 |
|---|---|---|
| person / people | 人物 | |
| family | 家族 | |
| family tree | 家谱 | |
| tree | 树 | |
| relationship | 关系 | |
| parent | 父母 | 泛称；单指父/母用父亲/母亲 |
| father / mother | 父亲 / 母亲 | |
| son / daughter | 儿子 / 女儿 | |
| child / children | 子女 | |
| sibling | 兄弟姐妹 | |
| brother / sister | 兄弟 / 姐妹 | |
| spouse | 配偶 | |
| partner | 伴侣 | |
| ancestor | 祖先 | |
| descendant | 后代 | |
| grandparent | 祖父母 | |
| great-grandparent | 曾祖父母 | |
| generation | 世代 | |
| birth / born | 出生 / 出生于 | |
| death / died | 去世 / 逝世于 | |
| marriage / married | 婚姻 / 已婚 | |
| divorce | 离婚 | |
| adoption / adopted | 收养 / 被收养 | |
| event | 事件 | |
| place | 地点 | |
| source | 来源 | |
| citation | 引文 | |
| confidence | 置信度 | |
| evidence | 证据 | |
| research | 研究 | |
| organization | 组织 | |
| universe | 宇宙 | |
| collection | 合集 | |
| vault | 库 | Obsidian vault |
| folder | 文件夹 | |
| property | 属性 | |
| tag | 标签 | |
| canvas | 画布 | |
| map | 地图 | |
| chart | 图表 | |
| timeline | 时间轴 | |
| statistics | 统计 | |
| report | 报告 | |
| wizard | 向导 | |
| dashboard | 仪表盘 | |
| profile | 档案 | |
| migration | 迁移 | |
| data quality | 数据质量 | |
| frontmatter | frontmatter | 保留 |
| GEDCOM / GEDCOMX | GEDCOM / GEDCOMX | 保留 |

## 三、常用 UI 词对照

| 英文 | 中文 |
|---|---|
| OK | 确定 |
| Cancel | 取消 |
| Save | 保存 |
| Delete | 删除 |
| Edit | 编辑 |
| Add | 添加 |
| Remove | 移除 |
| Close | 关闭 |
| Create | 创建 |
| Apply | 应用 |
| Reset | 重置 |
| Import | 导入 |
| Export | 导出 |
| Search | 搜索 |
| Filter | 筛选 |
| Sort | 排序 |
| Name | 名称 |
| Description | 描述 |
| Type | 类型 |
| Category | 分类 |
| Date | 日期 |
| Unknown | 未知 |
| None | 无 |
| All | 全部 |
| Custom | 自定义 |
| Default | 默认 |
| Enabled / Disabled | 启用 / 禁用 |
| Show / Hide | 显示 / 隐藏 |
| Next | 下一步 |
| Back | 上一步 |
| Finish | 完成 |
| Continue | 继续 |
| Yes / No | 是 / 否 |
| Warning | 警告 |
| Error | 错误 |
| Success | 成功 |
| Failed | 失败 |
| Loading… | 加载中… |
| No results | 无结果 |
| Untitled | 未命名 |
| Optional | 可选 |

## 四、排版规范
- 中英文混排：数字/英文与中文之间不加空格（如"第 2 代"→"第2代"），保持简洁。
- 标点使用中文全角：，。！？：；（）引号用「」或""（统一用""）。
- 省略号用 `…`。
- 保留占位符/插值原样：`${x}`、`{{x}}` 不得改动。
- 按钮用词尽量短（2-4 字），避免撑破布局。
- 翻译后不要改变字符串拼接结构；模板字符串的插值位置可调整语序。
