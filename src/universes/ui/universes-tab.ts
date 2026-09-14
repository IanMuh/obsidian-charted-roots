/**
 * Universes Tab UI Component
 *
 * Renders the Universes tab in the Control Center, showing
 * universe list, orphan detection, and quick actions.
 */

import { Menu, Notice, setIcon } from 'obsidian';
import type CanvasRootsPlugin from '../../../main';
import type { LucideIconName } from '../../ui/lucide-icons';
import { createLucideIcon, setLucideIcon } from '../../ui/lucide-icons';
import { UniverseService, createUniverseService } from '../services/universe-service';
import { UniverseWizardModal } from './universe-wizard';
import { EditUniverseModal } from './edit-universe-modal';
import type { UniverseInfo, UniverseEntityCounts } from '../types';
import { UNIVERSE_STATUS_LABELS } from '../types';
import { DEFAULT_DATE_SYSTEMS } from '../../dates/constants/default-date-systems';

/**
 * Resolve a calendar id (built-in or custom) to its display name. Returns
 * the id verbatim when nothing matches so the user still sees something
 * actionable rather than an empty cell (#432 Phase 1).
 */
function resolveCalendarName(plugin: CanvasRootsPlugin, calendarId: string): string {
	const builtin = DEFAULT_DATE_SYSTEMS.find(s => s.id === calendarId);
	if (builtin) return builtin.name;
	const customs = plugin.settings.fictionalDateSystems || [];
	const custom = customs.find(s => s.id === calendarId);
	return custom ? custom.name : calendarId;
}
import { getLogger } from '../../core/logging';
import { getErrorMessage } from '../../core/error-utils';
import { confirmDeleteUniverse } from '../../plugin/context-menus';

const logger = getLogger('UniversesTab');

export type UniverseListFilter = 'all' | 'active' | 'draft' | 'archived' | 'has-entities' | 'empty';
export type UniverseListSort = 'name-asc' | 'name-desc' | 'created-asc' | 'created-desc' | 'entities-asc' | 'entities-desc';

export interface UniversesListOptions {
	container: HTMLElement;
	plugin: CanvasRootsPlugin;
	initialFilter?: UniverseListFilter;
	initialSort?: UniverseListSort;
	initialSearch?: string;
	onStateChange?: (filter: UniverseListFilter, sort: UniverseListSort, search: string) => void;
}

type UnivFilter = UniverseListFilter;
type UnivSort = UniverseListSort;

/** Module-level state for universe list filter */
let universeListFilter: UnivFilter = 'all';

/** Module-level state for universe list sort */
let universeListSort: UnivSort = 'name-asc';

/**
 * Render the Universes tab content
 */
export function renderUniversesTab(
	container: HTMLElement,
	plugin: CanvasRootsPlugin,
	createCard: (options: { title: string; icon?: LucideIconName; subtitle?: string }) => HTMLElement,
	showTab: (tabId: string) => void,
	closeModal: () => void
): void {
	const app = plugin.app;
	const universeService = createUniverseService(plugin);
	const universes = universeService.getAllUniverses();
	const orphans = universeService.findOrphanUniverses();

	// Build universe list with entity counts for filtering/sorting
	const universeItems = universes.map(u => {
		const counts = universeService.getEntityCountsForUniverse(u.crId);
		const totalEntities = counts.people + counts.places + counts.events +
			counts.organizations + counts.maps + counts.calendars;
		return { ...u, counts, totalEntities };
	});

	// Refresh helper — re-renders the entire tab
	const refresh = () => {
		renderUniversesTab(container, plugin, createCard, showTab, closeModal);
	};

	// Quick Actions Card
	const actionsCard = createCard({
		title: '快捷操作',
		icon: 'zap',
		subtitle: '创建宇宙并探索相关功能'
	});
	const actionsContent = actionsCard.querySelector('.crc-card__content') as HTMLElement;

	const tileGrid = actionsContent.createDiv({ cls: 'crc-dashboard-tile-grid' });

	// Tile 1: Create Universe
	const createTile = tileGrid.createDiv({ cls: 'crc-dashboard-tile' });
	createTile.setAttribute('data-tile-id', 'create-universe');
	createTile.setAttribute('title', '创建带有可选历法、地图和架构的新虚构世界');
	const createIcon = createTile.createDiv({ cls: 'crc-dashboard-tile-icon' });
	setLucideIcon(createIcon, 'globe', 24);
	createTile.createDiv({ cls: 'crc-dashboard-tile-label', text: '创建宇宙' });
	createTile.setAttribute('tabindex', '0');
	createTile.setAttribute('role', 'button');
	createTile.addEventListener('click', () => {
		new UniverseWizardModal(plugin, {
			onComplete: () => refresh()
		}).open();
	});
	createTile.addEventListener('keydown', (e) => {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			new UniverseWizardModal(plugin, {
				onComplete: () => refresh()
			}).open();
		}
	});

	// Tile 2: Fictional Date Systems
	const calendarTile = tileGrid.createDiv({ cls: 'crc-dashboard-tile' });
	calendarTile.setAttribute('data-tile-id', 'fictional-calendars');
	calendarTile.setAttribute('title', '了解用于虚构世界的自定义历法');
	const calendarIcon = calendarTile.createDiv({ cls: 'crc-dashboard-tile-icon' });
	setLucideIcon(calendarIcon, 'calendar-plus', 24);
	calendarTile.createDiv({ cls: 'crc-dashboard-tile-label', text: '日期系统' });
	calendarTile.setAttribute('tabindex', '0');
	calendarTile.setAttribute('role', 'button');
	calendarTile.addEventListener('click', () => {
		showTab('events');
	});
	calendarTile.addEventListener('keydown', (e) => {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			showTab('events');
		}
	});

	// Tile 3: Custom Maps
	const mapTile = tileGrid.createDiv({ cls: 'crc-dashboard-tile' });
	mapTile.setAttribute('data-tile-id', 'custom-maps');
	mapTile.setAttribute('title', '了解用于虚构地理的自定义地图');
	const mapIcon = mapTile.createDiv({ cls: 'crc-dashboard-tile-icon' });
	setLucideIcon(mapIcon, 'map', 24);
	mapTile.createDiv({ cls: 'crc-dashboard-tile-label', text: '自定义地图' });
	mapTile.setAttribute('tabindex', '0');
	mapTile.setAttribute('role', 'button');
	mapTile.addEventListener('click', () => {
		showTab('places');
	});
	mapTile.addEventListener('keydown', (e) => {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			showTab('places');
		}
	});

	container.appendChild(actionsCard);

	// Universe List Card
	const listCard = createCard({
		title: '你的宇宙',
		icon: 'globe',
		subtitle: '库中的所有宇宙笔记'
	});
	addUniversesDockButton(listCard, plugin);
	const listContent = listCard.querySelector('.crc-card__content') as HTMLElement;

	if (universeItems.length === 0) {
		// Empty state message
		const emptyState = listContent.createDiv({ cls: 'crc-empty-state' });
		emptyState.createEl('p', {
			text: '未找到宇宙笔记。点击上方的"创建宇宙"开始。',
			cls: 'crc-text--muted'
		});
	} else {
		// Controls row (filter + sort + search)
		const controlsRow = listContent.createDiv({ cls: 'crc-person-controls' });

		// Filter dropdown
		const filterSelect = controlsRow.createEl('select', { cls: 'dropdown' });
		const filterOptions = [
			{ value: 'all', label: '全部宇宙' },
			{ value: 'active', label: '活跃' },
			{ value: 'draft', label: '草稿' },
			{ value: 'archived', label: '已归档' },
			{ value: 'has-entities', label: '有实体' },
			{ value: 'empty', label: '空' }
		];
		filterOptions.forEach(opt => {
			const option = filterSelect.createEl('option', { text: opt.label, value: opt.value });
			if (opt.value === universeListFilter) option.selected = true;
		});

		// Sort dropdown
		const sortSelect = controlsRow.createEl('select', { cls: 'dropdown' });
		const sortOptions = [
			{ value: 'name-asc', label: '名称（A\u2013Z）' },
			{ value: 'name-desc', label: '名称（Z\u2013A）' },
			{ value: 'created-asc', label: '创建时间（最早）' },
			{ value: 'created-desc', label: '创建时间（最新）' },
			{ value: 'entities-asc', label: '实体数（最少）' },
			{ value: 'entities-desc', label: '实体数（最多）' }
		];
		sortOptions.forEach(opt => {
			const option = sortSelect.createEl('option', { text: opt.label, value: opt.value });
			if (opt.value === universeListSort) option.selected = true;
		});

		// Search input
		const searchInput = controlsRow.createEl('input', {
			cls: 'crc-filter-input',
			attr: {
				type: 'text',
				placeholder: `搜索 ${universeItems.length} 个宇宙…`
			}
		});

		// Usage hint
		const hint = listContent.createEl('p', {
			cls: 'crc-text-muted crc-text-small crc-mb-2'
		});
		hint.appendText('点击行以编辑。');
		const fileIconHint = createLucideIcon('file-text', 12);
		fileIconHint.addClass('crc-icon-inline');
		hint.appendChild(fileIconHint);
		hint.appendText(' 打开笔记。');

		// List container
		const listContainer = listContent.createDiv({ cls: 'crc-person-list' });

		// Apply filter, sort, and render
		const applyFiltersAndRender = () => {
			const query = searchInput.value.toLowerCase();

			// Filter by search query
			let filtered = universeItems.filter(u =>
				u.name.toLowerCase().includes(query) ||
				(u.description && u.description.toLowerCase().includes(query)) ||
				(u.author && u.author.toLowerCase().includes(query)) ||
				(u.genre && u.genre.toLowerCase().includes(query))
			);

			// Apply category filter
			switch (universeListFilter) {
				case 'active':
					filtered = filtered.filter(u => u.status === 'active');
					break;
				case 'draft':
					filtered = filtered.filter(u => u.status === 'draft');
					break;
				case 'archived':
					filtered = filtered.filter(u => u.status === 'archived');
					break;
				case 'has-entities':
					filtered = filtered.filter(u => u.totalEntities > 0);
					break;
				case 'empty':
					filtered = filtered.filter(u => u.totalEntities === 0);
					break;
			}

			// Apply sort
			filtered.sort((a, b) => {
				switch (universeListSort) {
					case 'name-asc':
						return a.name.localeCompare(b.name);
					case 'name-desc':
						return b.name.localeCompare(a.name);
					case 'created-asc':
						return (a.created || '0000').localeCompare(b.created || '0000');
					case 'created-desc':
						return (b.created || '9999').localeCompare(a.created || '9999');
					case 'entities-asc':
						return a.totalEntities - b.totalEntities;
					case 'entities-desc':
						return b.totalEntities - a.totalEntities;
					default:
						return 0;
				}
			});

			renderUniverseListItems(listContainer, filtered, universeService, app, plugin, refresh);
		};

		// Event handlers
		searchInput.addEventListener('input', applyFiltersAndRender);
		filterSelect.addEventListener('change', () => {
			universeListFilter = filterSelect.value as typeof universeListFilter;
			applyFiltersAndRender();
		});
		sortSelect.addEventListener('change', () => {
			universeListSort = sortSelect.value as typeof universeListSort;
			applyFiltersAndRender();
		});

		// Initial render
		applyFiltersAndRender();

		// View full statistics link
		const statsLink = listContent.createDiv({ cls: 'cr-stats-link' });
		const link = statsLink.createEl('a', { text: '查看完整统计 \u2192', cls: 'crc-text-muted' });
		link.addEventListener('click', (e) => {
			e.preventDefault();
			closeModal();
			void plugin.activateStatisticsView();
		});
	}

	container.appendChild(listCard);

	// Orphan universes section
	if (orphans.length > 0) {
		const orphanCard = createCard({
			title: '孤立的宇宙值',
			icon: 'alert-triangle',
			subtitle: '没有对应笔记的宇宙引用'
		});
		const orphanContent = orphanCard.querySelector('.crc-card__content') as HTMLElement;

		orphanContent.createEl('p', {
			text: '这些宇宙值被实体使用，但没有对应的宇宙笔记。创建笔记以启用完整的宇宙管理。',
			cls: 'crc-text-muted crc-mb-3'
		});

		orphans.forEach(orphan => {
			const row = orphanContent.createDiv({ cls: 'crc-flex crc-justify-between crc-items-center crc-mb-2' });
			row.createSpan({ text: `"${orphan.value}"`, cls: 'crc-code' });
			row.createSpan({ text: `${orphan.entityCount} 个实体`, cls: 'crc-text-muted' });
			const createNoteBtn = row.createEl('button', {
				text: '创建笔记',
				cls: 'crc-btn crc-btn--small'
			});
			createNoteBtn.addEventListener('click', () => {
				void (async () => {
					try {
						// Create universe from orphan value, using the orphan value as cr_id
						// so existing entity references will match
						await universeService.createUniverse({
							name: orphan.value.charAt(0).toUpperCase() + orphan.value.slice(1).replace(/-/g, ' '),
							crId: orphan.value
						});
						new Notice(`已创建宇宙：${orphan.value}`);
						// Refresh the tab
						refresh();
					} catch (err) {
						new Notice(`创建宇宙失败：${getErrorMessage(err)}`);
					}
				})();
			});
		});

		// Create all button
		if (orphans.length > 1) {
			const createAllBtn = orphanContent.createEl('button', {
				text: '全部创建',
				cls: 'crc-btn crc-btn--secondary crc-mt-3'
			});
			createAllBtn.addEventListener('click', () => {
				void (async () => {
					for (const orphan of orphans) {
						try {
							await universeService.createUniverse({
								name: orphan.value.charAt(0).toUpperCase() + orphan.value.slice(1).replace(/-/g, ' '),
								crId: orphan.value
							});
						} catch (err) {
							logger.error('createOrphanUniverse', `Failed: ${orphan.value}`, err);
						}
					}
					new Notice(`已创建 ${orphans.length} 个宇宙笔记`);
					refresh();
				})();
			});
		}

		container.appendChild(orphanCard);
	}
}

/**
 * Render universe list items as a table
 */
function renderUniverseListItems(
	container: HTMLElement,
	universes: (UniverseInfo & { counts: UniverseEntityCounts; totalEntities: number })[],
	universeService: UniverseService,
	app: CanvasRootsPlugin['app'],
	plugin: CanvasRootsPlugin,
	refresh: () => void
): void {
	container.empty();

	if (universes.length === 0) {
		container.createEl('p', {
			text: '未找到匹配的宇宙。',
			cls: 'crc-text--muted'
		});
		return;
	}

	// Create table structure
	const table = container.createEl('table', { cls: 'crc-person-table' });
	const thead = table.createEl('thead');
	const headerRow = thead.createEl('tr');
	headerRow.createEl('th', { text: '名称', cls: 'crc-person-table__th' });
	headerRow.createEl('th', { text: '状态', cls: 'crc-person-table__th' });
	headerRow.createEl('th', { text: '实体', cls: 'crc-person-table__th' });
	headerRow.createEl('th', { text: '', cls: 'crc-person-table__th crc-person-table__th--icon' });

	const tbody = table.createEl('tbody');

	for (const universe of universes) {
		renderUniverseTableRow(tbody, universe, universeService, app, plugin, refresh);
	}
}

/**
 * Render a single universe as a table row
 */
function renderUniverseTableRow(
	tbody: HTMLElement,
	universe: UniverseInfo & { counts: UniverseEntityCounts; totalEntities: number },
	universeService: UniverseService,
	app: CanvasRootsPlugin['app'],
	plugin: CanvasRootsPlugin,
	refresh: () => void
): void {
	const row = tbody.createEl('tr', { cls: 'crc-person-table__row' });

	// Name cell
	const nameCell = row.createEl('td', { cls: 'crc-person-table__td crc-person-table__td--name' });
	nameCell.createSpan({ text: universe.name });
	if (universe.description) {
		nameCell.createEl('br');
		nameCell.createSpan({
			text: universe.description,
			cls: 'crc-text--muted crc-text--small'
		});
	}

	// Status cell
	const statusCell = row.createEl('td', { cls: 'crc-person-table__td' });
	statusCell.createSpan({
		text: UNIVERSE_STATUS_LABELS[universe.status || 'active'],
		cls: `crc-badge crc-badge--${universe.status || 'active'}`
	});

	// Entities cell - show count breakdown
	const entitiesCell = row.createEl('td', { cls: 'crc-person-table__td crc-person-table__td--date' });
	if (universe.totalEntities > 0) {
		const countParts: string[] = [];
		if (universe.counts.people > 0) countParts.push(`${universe.counts.people} 位人物`);
		if (universe.counts.places > 0) countParts.push(`${universe.counts.places} 个地点`);
		if (universe.counts.events > 0) countParts.push(`${universe.counts.events} 个事件`);
		if (universe.counts.organizations > 0) countParts.push(`${universe.counts.organizations} 个组织`);
		if (universe.counts.maps > 0) countParts.push(`${universe.counts.maps} 张地图`);
		if (universe.counts.calendars > 0) countParts.push(`${universe.counts.calendars} 种历法`);
		entitiesCell.setText(countParts.join('，'));
	} else {
		entitiesCell.setText('\u2014');
	}

	// Default-calendar sub-line in the entities cell when set (#432 Phase 1)
	if (universe.defaultCalendar) {
		entitiesCell.createEl('br');
		entitiesCell.createSpan({
			text: `默认：${resolveCalendarName(plugin, universe.defaultCalendar)}`,
			cls: 'crc-text--muted crc-text--small'
		});
	}

	// Actions cell
	const actionsCell = row.createEl('td', { cls: 'crc-person-table__td crc-person-table__td--actions' });

	// Open note button
	const openBtn = actionsCell.createEl('button', {
		cls: 'crc-person-table__open-btn clickable-icon',
		attr: { 'aria-label': '打开笔记' }
	});
	const fileIcon = createLucideIcon('file-text', 14);
	openBtn.appendChild(fileIcon);
	openBtn.addEventListener('click', (e) => {
		e.stopPropagation();
		void app.workspace.getLeaf(false).openFile(universe.file);
	});

	// Click row to open edit modal
	row.addEventListener('click', () => {
		new EditUniverseModal(app, plugin, {
			universe,
			file: universe.file,
			onUpdated: () => refresh()
		}).open();
	});

	// Context menu for row
	row.addEventListener('contextmenu', (e) => {
		e.preventDefault();
		showUniverseContextMenu(universe, e, app, plugin, refresh);
	});
}

/**
 * Show context menu for a universe row
 */
function showUniverseContextMenu(
	universe: UniverseInfo,
	event: MouseEvent,
	app: CanvasRootsPlugin['app'],
	plugin: CanvasRootsPlugin,
	refresh: () => void
): void {
	const menu = new Menu();

	menu.addItem(item => item
		.setTitle('打开笔记')
		.setIcon('file-text')
		.onClick(() => {
			void app.workspace.getLeaf(false).openFile(universe.file);
		}));

	menu.addItem(item => item
		.setTitle('编辑宇宙')
		.setIcon('pencil')
		.onClick(() => {
			new EditUniverseModal(app, plugin, {
				universe,
				file: universe.file,
				onUpdated: () => refresh()
			}).open();
		}));

	menu.addSeparator();

	menu.addItem(item => item
		.setTitle('删除宇宙')
		.setIcon('trash-2')
		.onClick(async () => {
			const confirmed = await confirmDeleteUniverse(plugin, universe.name);
			if (confirmed) {
				await app.fileManager.trashFile(universe.file);
				new Notice(`已删除宇宙：${universe.name}`);
				refresh();
			}
		}));

	menu.showAtMouseEvent(event);
}

function addUniversesDockButton(card: HTMLElement, plugin: CanvasRootsPlugin): void {
	const header = card.querySelector('.crc-card__header');
	if (!header) return;

	const dockBtn = activeDocument.createElement('button');
	dockBtn.className = 'crc-card__dock-btn clickable-icon';
	dockBtn.setAttribute('aria-label', '在侧边栏中打开');
	setIcon(dockBtn, 'panel-right');
	dockBtn.addEventListener('click', (e) => {
		e.stopPropagation();
		void plugin.activateUniversesView();
	});
	header.appendChild(dockBtn);
}

/* ══════════════════════════════════════════════════════════════════════════
   Dockable Universes List — standalone renderer for the sidebar ItemView
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Render a browsable universes list for the dockable sidebar view.
 * Uses closure-scoped state so it operates independently of the modal tab.
 */
export function renderUniversesList(options: UniversesListOptions): void {
	const {
		container,
		plugin,
		initialFilter = 'all',
		initialSort = 'name-asc',
		initialSearch = '',
		onStateChange
	} = options;

	const app = plugin.app;

	// Closure-scoped state
	let currentFilter: UnivFilter = initialFilter;
	let currentSort: UnivSort = initialSort;
	let currentSearch = initialSearch;
	let displayLimit = 25;

	// Load data
	const universeService = createUniverseService(plugin);
	const universes = universeService.getAllUniverses();

	// Build universe items with entity counts
	const universeItems = universes.map(u => {
		const counts = universeService.getEntityCountsForUniverse(u.crId);
		const totalEntities = counts.people + counts.places + counts.events +
			counts.organizations + counts.maps + counts.calendars;
		return { ...u, counts, totalEntities };
	});

	container.empty();

	if (universeItems.length === 0) {
		const emptyState = container.createDiv({ cls: 'crc-empty-state' });
		emptyState.createEl('p', {
			text: '未找到宇宙笔记。',
			cls: 'crc-text--muted'
		});
		return;
	}

	// Controls row
	const controlsRow = container.createDiv({ cls: 'crc-person-controls' });

	// Filter dropdown
	const filterSelect = controlsRow.createEl('select', { cls: 'dropdown' });
	const filterOptions: { value: UnivFilter; label: string }[] = [
		{ value: 'all', label: '全部宇宙' },
		{ value: 'active', label: '活跃' },
		{ value: 'draft', label: '草稿' },
		{ value: 'archived', label: '已归档' },
		{ value: 'has-entities', label: '有实体' },
		{ value: 'empty', label: '空' }
	];
	filterOptions.forEach(opt => {
		const option = filterSelect.createEl('option', { text: opt.label, value: opt.value });
		if (opt.value === currentFilter) option.selected = true;
	});

	// Sort dropdown
	const sortSelect = controlsRow.createEl('select', { cls: 'dropdown' });
	const sortOptions: { value: UnivSort; label: string }[] = [
		{ value: 'name-asc', label: '名称（A\u2013Z）' },
		{ value: 'name-desc', label: '名称（Z\u2013A）' },
		{ value: 'created-asc', label: '创建时间（最早）' },
		{ value: 'created-desc', label: '创建时间（最新）' },
		{ value: 'entities-asc', label: '实体数（最少）' },
		{ value: 'entities-desc', label: '实体数（最多）' }
	];
	sortOptions.forEach(opt => {
		const option = sortSelect.createEl('option', { text: opt.label, value: opt.value });
		if (opt.value === currentSort) option.selected = true;
	});

	// Search input
	const searchInput = controlsRow.createEl('input', {
		cls: 'crc-filter-input',
		attr: {
			type: 'text',
			placeholder: `搜索 ${universeItems.length} 个宇宙…`
		}
	});
	if (currentSearch) searchInput.value = currentSearch;

	// List container
	const listContainer = container.createDiv({ cls: 'crc-person-list' });

	const applyFiltersAndRender = () => {
		const query = searchInput.value.toLowerCase();

		// Filter by search query
		let filtered = universeItems.filter(u =>
			u.name.toLowerCase().includes(query) ||
			(u.description && u.description.toLowerCase().includes(query)) ||
			(u.author && u.author.toLowerCase().includes(query)) ||
			(u.genre && u.genre.toLowerCase().includes(query))
		);

		// Apply category filter
		switch (currentFilter) {
			case 'active':
				filtered = filtered.filter(u => u.status === 'active');
				break;
			case 'draft':
				filtered = filtered.filter(u => u.status === 'draft');
				break;
			case 'archived':
				filtered = filtered.filter(u => u.status === 'archived');
				break;
			case 'has-entities':
				filtered = filtered.filter(u => u.totalEntities > 0);
				break;
			case 'empty':
				filtered = filtered.filter(u => u.totalEntities === 0);
				break;
		}

		// Apply sort
		filtered.sort((a, b) => {
			switch (currentSort) {
				case 'name-asc':
					return a.name.localeCompare(b.name);
				case 'name-desc':
					return b.name.localeCompare(a.name);
				case 'created-asc':
					return (a.created || '0000').localeCompare(b.created || '0000');
				case 'created-desc':
					return (b.created || '9999').localeCompare(a.created || '9999');
				case 'entities-asc':
					return a.totalEntities - b.totalEntities;
				case 'entities-desc':
					return b.totalEntities - a.totalEntities;
				default:
					return 0;
			}
		});

		// Render with pagination
		listContainer.empty();

		if (filtered.length === 0) {
			listContainer.createEl('p', {
				text: '未找到匹配的宇宙。',
				cls: 'crc-text--muted'
			});
			return;
		}

		const table = listContainer.createEl('table', { cls: 'crc-person-table' });
		const thead = table.createEl('thead');
		const headerRow = thead.createEl('tr');
		headerRow.createEl('th', { text: '名称', cls: 'crc-person-table__th' });
		headerRow.createEl('th', { text: '状态', cls: 'crc-person-table__th' });
		headerRow.createEl('th', { text: '实体', cls: 'crc-person-table__th' });
		headerRow.createEl('th', { text: '', cls: 'crc-person-table__th crc-person-table__th--icon' });

		const tbody = table.createEl('tbody');

		const visible = filtered.slice(0, displayLimit);
		for (const universe of visible) {
			renderBrowseUniverseRow(tbody, universe, app, plugin);
		}

		// Load more button
		if (filtered.length > displayLimit) {
			const remaining = filtered.length - displayLimit;
			const loadMore = listContainer.createEl('button', {
				text: `加载更多（剩余 ${remaining} 个）`,
				cls: 'crc-btn crc-btn--secondary crc-btn--full-width crc-mt-3'
			});
			loadMore.addEventListener('click', () => {
				displayLimit += 25;
				applyFiltersAndRender();
			});
		}
	};

	// Event handlers
	searchInput.addEventListener('input', () => {
		currentSearch = searchInput.value;
		displayLimit = 25;
		onStateChange?.(currentFilter, currentSort, currentSearch);
		applyFiltersAndRender();
	});
	filterSelect.addEventListener('change', () => {
		currentFilter = filterSelect.value as UnivFilter;
		displayLimit = 25;
		onStateChange?.(currentFilter, currentSort, currentSearch);
		applyFiltersAndRender();
	});
	sortSelect.addEventListener('change', () => {
		currentSort = sortSelect.value as UnivSort;
		displayLimit = 25;
		onStateChange?.(currentFilter, currentSort, currentSearch);
		applyFiltersAndRender();
	});

	// Initial render
	applyFiltersAndRender();
}

/**
 * Render a universe row for the browse-only dockable view.
 * No click-to-edit, simplified context menu (open note only).
 */
function renderBrowseUniverseRow(
	tbody: HTMLElement,
	universe: UniverseInfo & { counts: UniverseEntityCounts; totalEntities: number },
	app: CanvasRootsPlugin['app'],
	plugin: CanvasRootsPlugin
): void {
	const row = tbody.createEl('tr', { cls: 'crc-person-table__row cr-universe-row--browse' });

	// Name cell
	const nameCell = row.createEl('td', { cls: 'crc-person-table__td crc-person-table__td--name' });
	nameCell.createSpan({ text: universe.name });
	if (universe.description) {
		nameCell.createEl('br');
		nameCell.createSpan({
			text: universe.description,
			cls: 'crc-text--muted crc-text--small'
		});
	}

	// Status cell
	const statusCell = row.createEl('td', { cls: 'crc-person-table__td' });
	statusCell.createSpan({
		text: UNIVERSE_STATUS_LABELS[universe.status || 'active'],
		cls: `crc-badge crc-badge--${universe.status || 'active'}`
	});

	// Entities cell
	const entitiesCell = row.createEl('td', { cls: 'crc-person-table__td crc-person-table__td--date' });
	if (universe.totalEntities > 0) {
		const countParts: string[] = [];
		if (universe.counts.people > 0) countParts.push(`${universe.counts.people} 位人物`);
		if (universe.counts.places > 0) countParts.push(`${universe.counts.places} 个地点`);
		if (universe.counts.events > 0) countParts.push(`${universe.counts.events} 个事件`);
		if (universe.counts.organizations > 0) countParts.push(`${universe.counts.organizations} 个组织`);
		if (universe.counts.maps > 0) countParts.push(`${universe.counts.maps} 张地图`);
		if (universe.counts.calendars > 0) countParts.push(`${universe.counts.calendars} 种历法`);
		entitiesCell.setText(countParts.join('，'));
	} else {
		entitiesCell.setText('\u2014');
	}

	// Default-calendar sub-line in the entities cell when set (#432 Phase 1)
	if (universe.defaultCalendar) {
		entitiesCell.createEl('br');
		entitiesCell.createSpan({
			text: `默认：${resolveCalendarName(plugin, universe.defaultCalendar)}`,
			cls: 'crc-text--muted crc-text--small'
		});
	}

	// Actions cell
	const actionsCell = row.createEl('td', { cls: 'crc-person-table__td crc-person-table__td--actions' });
	const openBtn = actionsCell.createEl('button', {
		cls: 'crc-person-table__open-btn clickable-icon',
		attr: { 'aria-label': '打开笔记' }
	});
	setIcon(openBtn, 'file-text');
	openBtn.addEventListener('click', (e) => {
		e.stopPropagation();
		void app.workspace.getLeaf(false).openFile(universe.file);
	});

	// Context menu — open note only (no edit/delete)
	row.addEventListener('contextmenu', (e) => {
		e.preventDefault();
		const menu = new Menu();

		menu.addItem(item => item
			.setTitle('打开笔记')
			.setIcon('file-text')
			.onClick(() => {
				void app.workspace.getLeaf(false).openFile(universe.file);
			}));

		menu.addItem(item => item
			.setTitle('在新标签页中打开')
			.setIcon('file-plus')
			.onClick(() => {
				void app.workspace.getLeaf('tab').openFile(universe.file);
			}));

		menu.showAtMouseEvent(e);
	});
}