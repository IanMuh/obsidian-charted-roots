/**
 * Command Menu / Multi-Action Launcher
 *
 * A searchable, categorized modal that provides quick access to all plugin
 * commands via a single hotkey. Uses Obsidian's SuggestModal for built-in
 * search, keyboard navigation, and fuzzy matching.
 *
 * @see https://github.com/banisterious/obsidian-charted-roots/issues/290
 */

import { SuggestModal, setIcon } from 'obsidian';
import type { App } from 'obsidian';

// ── Types ──────────────────────────────────────────────────────────────

interface CommandEntry {
	type: 'command';
	id: string;
	name: string;
	icon: string;
	category: string;
}

interface SeparatorEntry {
	type: 'separator';
	category: string;
}

type CommandMenuItem = CommandEntry | SeparatorEntry;

// ── Command Registry ───────────────────────────────────────────────────

const PLUGIN_ID = 'charted-roots';

interface CategoryDef {
	label: string;
	icon: string;
	commands: { id: string; name: string; icon: string }[];
}

const CATEGORIES: CategoryDef[] = [
	{
		label: '创建',
		icon: 'plus-circle',
		commands: [
			{ id: 'create-person-note', name: '创建人物笔记', icon: 'user' },
			{ id: 'create-event-note', name: '创建事件笔记', icon: 'calendar' },
			{ id: 'create-place-note', name: '创建地点笔记', icon: 'map-pin' },
			{ id: 'create-source-note', name: '创建来源笔记', icon: 'file-text' },
			{ id: 'create-organization-note', name: '创建组织笔记', icon: 'building' },
			{ id: 'create-note', name: '创建笔记', icon: 'file-plus' },
			{ id: 'create-family-wizard', name: '创建家族向导', icon: 'users' },
			{ id: 'create-universe', name: '创建宇宙', icon: 'globe' },
		],
	},
	{
		label: '查看',
		icon: 'eye',
		commands: [
			{ id: 'open-family-chart', name: '打开家族图表', icon: 'users' },
			{ id: 'open-map-view', name: '打开地图视图', icon: 'map' },
			{ id: 'open-statistics-dashboard', name: '打开统计仪表盘', icon: 'chart-bar-decreasing' },
			{ id: 'open-entity-profile', name: '打开实体档案', icon: 'id-card' },
			{ id: 'open-people-view', name: '打开人物', icon: 'user' },
			{ id: 'open-events-view', name: '打开事件', icon: 'calendar' },
			{ id: 'open-places-view', name: '打开地点', icon: 'map-pin' },
			{ id: 'open-organizations-view', name: '打开组织', icon: 'building' },
			{ id: 'open-sources-view', name: '打开来源', icon: 'file-text' },
			{ id: 'open-universes-view', name: '打开宇宙', icon: 'globe' },
			{ id: 'open-collections-view', name: '打开合集', icon: 'folder' },
			{ id: 'open-relationships-view', name: '打开关系', icon: 'link' },
			{ id: 'open-data-quality-view', name: '打开数据质量', icon: 'check-circle' },
		],
	},
	{
		label: '编辑',
		icon: 'pencil',
		commands: [
			{ id: 'edit-current-note', name: '编辑当前笔记', icon: 'pencil' },
			{ id: 'add-research-question', name: '添加研究问题', icon: 'help-circle' },
			{ id: 'add-citation', name: '添加引文', icon: 'quote' },
			{ id: 'add-custom-relationship', name: '添加自定义关系', icon: 'link' },
			{ id: 'insert-dynamic-blocks', name: '插入动态块', icon: 'code' },
		],
	},
	{
		label: '树与编号',
		icon: 'git-branch',
		commands: [
			{ id: 'generate-tree-for-current-note', name: '为当前笔记生成树', icon: 'git-branch' },
			{ id: 'regenerate-tree', name: '重新生成树', icon: 'refresh-cw' },
			{ id: 'generate-all-trees', name: '生成所有树', icon: 'git-branch' },
			{ id: 'split-tree-wizard', name: '拆分树向导', icon: 'scissors' },
			{ id: 'assign-ahnentafel', name: '分配 Ahnentafel 编号（祖先）', icon: 'hash' },
			{ id: 'assign-daboville', name: "分配 d'Aboville 编号（后代）", icon: 'hash' },
			{ id: 'assign-henry', name: '分配 Henry 编号（后代）', icon: 'hash' },
			{ id: 'assign-generation', name: '分配世代编号', icon: 'hash' },
			{ id: 'clear-reference-numbers', name: '清除参考编号', icon: 'x' },
			{ id: 'assign-lineage', name: '从根人物分配世系', icon: 'arrow-down' },
			{ id: 'remove-lineage', name: '移除世系标签', icon: 'x' },
		],
	},
	{
		label: 'Bases',
		icon: 'table',
		commands: [
			{ id: 'create-all-bases', name: '创建所有 Base 模板', icon: 'layers' },
			{ id: 'create-base-template', name: '创建人物 Base 模板', icon: 'user' },
			{ id: 'create-events-base-template', name: '创建事件 Base 模板', icon: 'calendar' },
			{ id: 'create-places-base-template', name: '创建地点 Base 模板', icon: 'map-pin' },
			{ id: 'create-sources-base-template', name: '创建来源 Base 模板', icon: 'file-text' },
			{ id: 'create-organizations-base-template', name: '创建组织 Base 模板', icon: 'building' },
			{ id: 'create-universes-base-template', name: '创建宇宙 Base 模板', icon: 'globe' },
			{ id: 'create-notes-base-template', name: '创建笔记 Base 模板', icon: 'file-plus' },
			{ id: 'create-research-base-template', name: '创建研究 Base 模板', icon: 'search' },
		],
	},
	{
		label: '书籍与汇编',
		icon: 'book',
		commands: [
			{ id: 'open-book-builder', name: '打开书籍构建器', icon: 'book' },
			{ id: 'regenerate-book', name: '重新生成书籍', icon: 'refresh-cw' },
		],
	},
	{
		label: '工具',
		icon: 'wrench',
		commands: [
			{ id: 'open-control-center', name: '打开控制中心', icon: 'settings' },
			{ id: 'manage-staging-area', name: '管理暂存区', icon: 'inbox' },
			{ id: 'open-cleanup-wizard', name: '导入后清理向导', icon: 'wand' },
			{ id: 'calculate-relationship', name: '计算关系', icon: 'git-merge' },
			{ id: 'find-related-research', name: '查找相关研究', icon: 'folder-search' },
			{ id: 'find-duplicates', name: '查找重复人物', icon: 'copy' },
			{ id: 'merge-duplicate-places', name: '合并重复地点', icon: 'git-merge' },
			{ id: 'validate-vault-schemas', name: '按模式验证库', icon: 'check-circle' },
			{ id: 'lookup-place', name: '查找地点', icon: 'search' },
			{ id: 'create-custom-map', name: '创建自定义地图', icon: 'map' },
			{ id: 'generate-place-notes', name: '从字符串生成地点笔记', icon: 'map-pin' },
			{ id: 'view-relationship-history', name: '查看关系历史', icon: 'history' },
			{ id: 'undo-relationship-change', name: '撤销上次关系更改', icon: 'undo' },
		],
	},
];

/**
 * Build the flat list of menu items (separators + commands) for unfiltered display
 */
function buildFullMenu(): CommandMenuItem[] {
	const items: CommandMenuItem[] = [];
	for (const cat of CATEGORIES) {
		items.push({ type: 'separator', category: cat.label });
		for (const cmd of cat.commands) {
			items.push({ type: 'command', ...cmd, category: cat.label });
		}
	}
	return items;
}

/**
 * Build a flat list of only command entries (for search)
 */
function buildCommandList(): CommandEntry[] {
	const items: CommandEntry[] = [];
	for (const cat of CATEGORIES) {
		for (const cmd of cat.commands) {
			items.push({ type: 'command', ...cmd, category: cat.label });
		}
	}
	return items;
}

// ── Modal ──────────────────────────────────────────────────────────────

export class CommandMenuModal extends SuggestModal<CommandMenuItem> {
	private fullMenu: CommandMenuItem[];
	private commandList: CommandEntry[];

	constructor(app: App) {
		super(app);
		this.fullMenu = buildFullMenu();
		this.commandList = buildCommandList();
		this.setPlaceholder('搜索命令…');
		this.modalEl.addClass('cr-command-menu');
	}

	getSuggestions(query: string): CommandMenuItem[] {
		if (!query.trim()) {
			return this.fullMenu;
		}

		const lower = query.toLowerCase();
		const terms = lower.split(/\s+/);

		// Score and filter commands
		const scored: { item: CommandEntry; score: number }[] = [];
		for (const cmd of this.commandList) {
			const nameLower = cmd.name.toLowerCase();
			const catLower = cmd.category.toLowerCase();
			const searchable = `${nameLower} ${catLower}`;

			// All terms must match somewhere
			const allMatch = terms.every((t) => searchable.includes(t));
			if (!allMatch) continue;

			// Score: prefer name-starts-with, then name-contains, then category-only
			let score = 0;
			if (nameLower.startsWith(lower)) {
				score = 3;
			} else if (nameLower.includes(lower)) {
				score = 2;
			} else {
				score = 1;
			}

			scored.push({ item: cmd, score });
		}

		scored.sort((a, b) => b.score - a.score);
		return scored.map((s) => s.item);
	}

	renderSuggestion(item: CommandMenuItem, el: HTMLElement): void {
		if (item.type === 'separator') {
			el.addClass('cr-command-menu__separator');
			el.setText(item.category);
			return;
		}

		el.addClass('cr-command-menu__item');

		const iconEl = el.createSpan({ cls: 'cr-command-menu__icon' });
		setIcon(iconEl, item.icon);

		el.createSpan({ cls: 'cr-command-menu__name', text: item.name });
		el.createSpan({ cls: 'cr-command-menu__category', text: item.category });
	}

	onChooseSuggestion(item: CommandMenuItem): void {
		if (item.type === 'separator') return;
		this.app.commands.executeCommandById(`${PLUGIN_ID}:${item.id}`);
	}
}
