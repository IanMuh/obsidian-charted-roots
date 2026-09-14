/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument -- Obsidian API returns any-typed surfaces (frontmatter, file caches, plugin state); project policy accepts these. */
/**
 * Dashboard Tab for Charted Roots Control Center
 *
 * Provides quick-action tiles for common operations and vault overview.
 */

import { App, Menu, TFile } from 'obsidian';
import CanvasRootsPlugin from '../../main';
import { LucideIconName, setLucideIcon } from './lucide-icons';
import { VaultStatsService, FullVaultStats } from '../core/vault-stats';
import { getErrorMessage } from '../core/error-utils';
import { CreatePersonModal } from './create-person-modal';
import { CreatePlaceModal } from './create-place-modal';
import { CreateEventModal } from '../events/ui/create-event-modal';
import { CreateSourceModal } from '../sources/ui/create-source-modal';
import { ReportWizardModal } from '../reports/ui/report-wizard-modal';
import { MediaManagerModal } from '../core/ui/media-manager-modal';
import { ImportExportHubModal } from './import-export-hub-modal';
import { FamilyCreationWizardModal } from './family-creation-wizard';
import { CommandMenuModal } from './command-menu-modal';
import { EventService } from '../events/services/event-service';
import { StagingService } from '../core/staging-service';
import type { RecentFileEntry } from '../settings';

/**
 * Dashboard tile configuration
 */
interface DashboardTile {
	id: string;
	label: string;
	icon: LucideIconName;
	action: () => void;
	description?: string;
}

/**
 * Options for rendering the dashboard tab
 */
interface DashboardTabOptions {
	container: HTMLElement;
	plugin: CanvasRootsPlugin;
	app: App;
	createCard: (options: { title: string; icon?: LucideIconName; subtitle?: string }) => HTMLElement;
	switchTab: (tabId: string) => void;
	closeModal: () => void;
}

/**
 * Render the Dashboard tab content
 */
export function renderDashboardTab(options: DashboardTabOptions): void {
	const { container, plugin, app, createCard, switchTab, closeModal } = options;

	// Show first-run notice if this is the first visit to the new Dashboard
	if (!plugin.settings.dashboardFirstVisitDone) {
		renderFirstRunNotice(container, plugin);
	}

	// Documentation links card
	renderDocumentationCard(container);

	// Quick Actions section
	renderQuickActionsSection(container, plugin, app, switchTab, closeModal);

	// Dockable Views section
	renderDockableViewsSection(container, plugin, closeModal);

	// Staging section (if there are staged imports or clipped notes)
	renderStagingSection(container, plugin, app, closeModal);

	// Recent section (if there are recent files)
	renderRecentSection(container, plugin, app, closeModal);

	// Vault Health section (collapsible)
	void renderVaultHealthSection(container, plugin, app, createCard, closeModal);
}

/**
 * Render a first-run welcome notice for the new Dashboard
 */
function renderFirstRunNotice(container: HTMLElement, plugin: CanvasRootsPlugin): void {
	const notice = container.createDiv({ cls: 'crc-dashboard-first-run-notice' });

	const content = notice.createDiv({ cls: 'crc-dashboard-first-run-content' });
	const iconEl = content.createSpan({ cls: 'crc-dashboard-first-run-icon' });
	setLucideIcon(iconEl, 'sparkles', 18);

	const textEl = content.createDiv({ cls: 'crc-dashboard-first-run-text' });
	textEl.createEl('strong', { text: '欢迎使用新版仪表盘！' });
	textEl.createSpan({
		text: ' 快速操作、最近文件与库健康状况一览。'
	});

	const dismissBtn = notice.createEl('button', {
		cls: 'crc-dashboard-first-run-dismiss',
		attr: { 'aria-label': '关闭通知' }
	});
	setLucideIcon(dismissBtn, 'x', 14);

	dismissBtn.addEventListener('click', () => {
		plugin.settings.dashboardFirstVisitDone = true;
		void plugin.saveSettings();
		notice.remove();
	});
}

const WIKI_BASE = 'https://github.com/banisterious/obsidian-charted-roots/wiki';

/**
 * Render the documentation links card
 */
function renderDocumentationCard(container: HTMLElement): void {
	const card = container.createDiv({ cls: 'crc-dashboard-docs-card' });

	// Icon
	const iconEl = card.createSpan({ cls: 'crc-dashboard-docs-icon' });
	setLucideIcon(iconEl, 'book-open', 18);

	// Content
	const content = card.createDiv({ cls: 'crc-dashboard-docs-content' });
	content.createSpan({ text: '初次使用 Charted Roots？请先阅读 ', cls: 'crc-text-muted' });

	const essentialLink = content.createEl('a', {
		text: '核心属性',
		href: `${WIKI_BASE}/Essential-Properties`,
		cls: 'crc-link'
	});
	essentialLink.setAttr('target', '_blank');

	content.createSpan({ text: ' 或浏览 ', cls: 'crc-text-muted' });

	const wikiLink = content.createEl('a', {
		text: '完整文档',
		href: WIKI_BASE,
		cls: 'crc-link'
	});
	wikiLink.setAttr('target', '_blank');

	content.createSpan({ text: '.', cls: 'crc-text-muted' });
}

/**
 * Render the Quick Actions tile grid
 */
function renderQuickActionsSection(
	container: HTMLElement,
	plugin: CanvasRootsPlugin,
	app: App,
	switchTab: (tabId: string) => void,
	closeModal: () => void
): void {
	// Section header
	const header = container.createDiv({ cls: 'crc-dashboard-section-header' });
	header.createSpan({ text: '快速操作', cls: 'crc-dashboard-section-title' });

	// Tile grid
	const grid = container.createDiv({ cls: 'crc-dashboard-tile-grid' });

	// Helper to open create person modal
	const openCreatePerson = () => {
		closeModal();
		const familyGraph = plugin.createFamilyGraphService();

		new CreatePersonModal(app, {
			directory: plugin.settings.peopleFolder || '',
			familyGraph,
			propertyAliases: plugin.settings.propertyAliases,
			plugin,
			onCreated: (file) => {
				// Track the newly created person in recent files
				const recentService = plugin.getRecentFilesService();
				if (recentService) {
					void recentService.trackFile(file, 'person');
				}
			}
		}).open();
	};

	// Helper to open create event modal
	const openCreateEvent = () => {
		closeModal();
		const eventService = new EventService(app, plugin.settings);
		new CreateEventModal(app, eventService, plugin.settings, {
			plugin,
			onCreated: (file) => {
				// Track the newly created event in recent files
				const recentService = plugin.getRecentFilesService();
				if (recentService) {
					void recentService.trackFile(file, 'event');
				}
			}
		}).open();
	};

	// Helper to open create source modal
	const openCreateSource = () => {
		closeModal();
		new CreateSourceModal(app, plugin, {
			onSuccess: (file) => {
				// Track the newly created source in recent files
				if (file) {
					const recentService = plugin.getRecentFilesService();
					if (recentService) {
						void recentService.trackFile(file, 'source');
					}
				}
			}
		}).open();
	};

	// Helper to open create place modal
	const openCreatePlace = () => {
		closeModal();
		new CreatePlaceModal(app, {
			directory: plugin.settings.placesFolder || 'Charted Roots/Places',
			familyGraph: plugin.createFamilyGraphService(),
			placeGraph: plugin.createPlaceGraphService(),
			settings: plugin.settings,
			plugin,
			onCreated: (file) => {
				// Track the newly created place in recent files
				const recentService = plugin.getRecentFilesService();
				if (recentService) {
					void recentService.trackFile(file, 'place');
				}
			}
		}).open();
	};

	// Define the 12 tiles
	// Row 1: Core entity creation (Person, Event, Place, Source)
	// Row 2: Family & visualization (Family, Family Chart, Canvas Trees, Map)
	// Row 3: Analysis & utilities (Reports Wizard, Stats & Reports, Media, Import/Export)
	const tiles: DashboardTile[] = [
		// Row 1: Core entity creation
		{
			id: 'create-person',
			label: '人物',
			icon: 'user',
			description: '创建新的人物笔记',
			action: () => void openCreatePerson()
		},
		{
			id: 'create-event',
			label: '事件',
			icon: 'calendar',
			description: '创建新的事件笔记',
			action: openCreateEvent
		},
		{
			id: 'create-place',
			label: '地点',
			icon: 'map-pin',
			description: '创建新的地点笔记',
			action: openCreatePlace
		},
		{
			id: 'create-source',
			label: '来源',
			icon: 'file-text',
			description: '创建新的来源笔记',
			action: openCreateSource
		},
		// Row 2: Family & visualization
		{
			id: 'create-family',
			label: '创建家族',
			icon: 'users',
			description: '使用向导创建家族分组',
			action: () => {
				closeModal();
				new FamilyCreationWizardModal(app, plugin).open();
			}
		},
		{
			id: 'family-chart',
			label: '家族图表',
			icon: 'users',
			description: '打开交互式家族图表',
			action: () => {
				closeModal();
				void plugin.activateFamilyChartView();
			}
		},
		{
			id: 'tree-output',
			label: '生成画布树',
			icon: 'git-branch',
			description: '生成交互式树画布',
			action: () => {
				switchTab('tree-generation');
			}
		},
		{
			id: 'open-map',
			label: '地图',
			icon: 'map',
			description: '打开交互式地图视图',
			action: () => {
				closeModal();
				void plugin.activateMapView();
			}
		},
		{
			id: 'open-calendar',
			label: '日历',
			icon: 'calendar',
			description: '在日历上查看重要日期',
			action: () => {
				closeModal();
				void plugin.activateCalendarView();
			}
		},
		// Row 3: Analysis & utilities
		{
			id: 'reports',
			label: '报告向导',
			icon: 'file-text',
			description: '生成时间轴与叙述性报告',
			action: () => {
				closeModal();
				new ReportWizardModal(plugin).open();
			}
		},
		{
			id: 'statistics-reports',
			label: '统计与报告',
			icon: 'chart-bar-decreasing',
			description: '统计仪表盘与报告生成',
			action: () => {
				closeModal();
				void plugin.activateStatisticsView();
			}
		},
		{
			id: 'media-manager',
			label: '媒体',
			icon: 'image',
			description: '管理关联到实体的媒体文件',
			action: () => {
				closeModal();
				new MediaManagerModal(app, plugin).open();
			}
		},
		{
			id: 'import-export',
			label: '导入/导出',
			icon: 'arrow-up-down',
			description: '导入或导出家谱数据',
			action: () => {
				closeModal();
				new ImportExportHubModal(app, plugin).open();
			}
		},
		// Row 4: Utilities
		{
			id: 'quick-actions',
			label: '快速操作',
			icon: 'terminal',
			description: '搜索并运行任意插件命令',
			action: () => {
				closeModal();
				new CommandMenuModal(app).open();
			}
		},
		{
			id: 'settings',
			label: '设置',
			icon: 'settings',
			description: '打开 Charted Roots 插件设置',
			action: () => {
				closeModal();
				// @ts-expect-error - Obsidian internal API for opening settings
				app.setting.open();
				// @ts-expect-error - Obsidian internal API for navigating to plugin tab
				app.setting.openTabById('charted-roots');
			}
		}
	];

	// Render each tile
	for (const tile of tiles) {
		renderTile(grid, tile);
	}
}

/**
 * Render the Dockable Views tile grid
 */
function renderDockableViewsSection(
	container: HTMLElement,
	plugin: CanvasRootsPlugin,
	closeModal: () => void
): void {
	// Section header
	const header = container.createDiv({ cls: 'crc-dashboard-section-header' });
	header.createSpan({ text: '可停靠视图', cls: 'crc-dashboard-section-title' });

	// Tile grid
	const grid = container.createDiv({ cls: 'crc-dashboard-tile-grid' });

	// Define the dockable view tiles
	const tiles: DashboardTile[] = [
		{
			id: 'view-people',
			label: '人物',
			icon: 'users',
			description: '在侧边栏打开人物浏览器',
			action: () => {
				closeModal();
				void plugin.activatePeopleView();
			}
		},
		{
			id: 'view-places',
			label: '地点',
			icon: 'map-pin',
			description: '在侧边栏打开地点浏览器',
			action: () => {
				closeModal();
				void plugin.activatePlacesView();
			}
		},
		{
			id: 'view-events',
			label: '事件',
			icon: 'calendar',
			description: '在侧边栏打开事件浏览器',
			action: () => {
				closeModal();
				void plugin.activateEventsView();
			}
		},
		{
			id: 'view-sources',
			label: '来源',
			icon: 'book-open',
			description: '在侧边栏打开来源浏览器',
			action: () => {
				closeModal();
				void plugin.activateSourcesView();
			}
		},
		{
			id: 'view-organizations',
			label: '组织',
			icon: 'building',
			description: '在侧边栏打开组织浏览器',
			action: () => {
				closeModal();
				void plugin.activateOrganizationsView();
			}
		},
		{
			id: 'view-relationships',
			label: '关系',
			icon: 'git-merge',
			description: '在侧边栏打开关系浏览器',
			action: () => {
				closeModal();
				void plugin.activateRelationshipsView();
			}
		},
		{
			id: 'view-universes',
			label: '宇宙',
			icon: 'globe',
			description: '在侧边栏打开宇宙浏览器',
			action: () => {
				closeModal();
				void plugin.activateUniversesView();
			}
		},
		{
			id: 'view-collections',
			label: '合集',
			icon: 'folder',
			description: '在侧边栏打开合集浏览器',
			action: () => {
				closeModal();
				void plugin.activateCollectionsView();
			}
		},
		{
			id: 'view-data-quality',
			label: '数据质量',
			icon: 'shield-check',
			description: '在侧边栏打开数据质量仪表盘',
			action: () => {
				closeModal();
				void plugin.activateDataQualityView();
			}
		}
	];

	// Render each tile
	for (const tile of tiles) {
		renderTile(grid, tile);
	}
}

/**
 * Render a single dashboard tile
 */
function renderTile(container: HTMLElement, tile: DashboardTile): void {
	const tileEl = container.createDiv({ cls: 'crc-dashboard-tile' });
	tileEl.setAttribute('data-tile-id', tile.id);
	if (tile.description) {
		tileEl.setAttribute('aria-label', tile.description);
		tileEl.setAttribute('title', tile.description);
	}

	// Icon container
	const iconContainer = tileEl.createDiv({ cls: 'crc-dashboard-tile-icon' });
	setLucideIcon(iconContainer, tile.icon, 24);

	// Label
	tileEl.createDiv({ cls: 'crc-dashboard-tile-label', text: tile.label });

	// Click handler
	tileEl.addEventListener('click', () => {
		tile.action();
	});

	// Keyboard accessibility
	tileEl.setAttribute('tabindex', '0');
	tileEl.setAttribute('role', 'button');
	tileEl.addEventListener('keydown', (e) => {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			tile.action();
		}
	});
}

/**
 * Get icon for entity type
 */
function getEntityIcon(type: RecentFileEntry['type']): LucideIconName {
	switch (type) {
		case 'person': return 'user';
		case 'event': return 'calendar';
		case 'source': return 'file-text';
		case 'place': return 'map-pin';
		case 'canvas': return 'git-branch';
		case 'map': return 'map';
		case 'organization': return 'building';
		default: return 'file';
	}
}

/**
 * Render the Recent section (only if there are recent files)
 */
function renderRecentSection(
	container: HTMLElement,
	plugin: CanvasRootsPlugin,
	app: App,
	closeModal: () => void
): void {
	const recentService = plugin.getRecentFilesService();
	if (!recentService) return;

	const recentFiles = recentService.getValidRecentFiles();
	if (recentFiles.length === 0) return;

	// Section header
	const header = container.createDiv({ cls: 'crc-dashboard-section-header crc-dashboard-recent-header' });
	header.createSpan({ text: '最近', cls: 'crc-dashboard-section-title' });

	// Recent list
	const list = container.createDiv({ cls: 'crc-dashboard-recent-list' });

	for (const entry of recentFiles) {
		const item = list.createDiv({ cls: 'crc-dashboard-recent-item' });

		// Icon
		const iconEl = item.createSpan({ cls: 'crc-dashboard-recent-icon' });
		setLucideIcon(iconEl, getEntityIcon(entry.type), 16);

		// Name
		item.createSpan({ cls: 'crc-dashboard-recent-name', text: entry.name });

		// Type badge
		item.createSpan({ cls: 'crc-dashboard-recent-type', text: entry.type });

		// Click to open file
		item.addEventListener('click', () => {
			const file = app.vault.getAbstractFileByPath(entry.path);
			if (file instanceof TFile) {
				closeModal();
				void app.workspace.getLeaf().openFile(file);
			}
		});

		// Context menu for type-specific actions
		item.addEventListener('contextmenu', (e) => {
			e.preventDefault();
			showRecentItemContextMenu(e, entry, plugin, app, closeModal);
		});

		// Keyboard accessibility
		item.setAttribute('tabindex', '0');
		item.setAttribute('role', 'button');
		item.addEventListener('keydown', (e) => {
			if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				const file = app.vault.getAbstractFileByPath(entry.path);
				if (file instanceof TFile) {
					closeModal();
					void app.workspace.getLeaf().openFile(file);
				}
			}
		});
	}
}

/**
 * Render the unified Staging section (shows all staging with breakdown)
 */
function renderStagingSection(
	container: HTMLElement,
	plugin: CanvasRootsPlugin,
	app: App,
	closeModal: () => void
): void {
	const stagingService = new StagingService(app, plugin.settings);
	const webClipperService = plugin.getWebClipperService();

	// Only show if staging is configured and has data
	if (!stagingService.isConfigured()) return;

	const allStats = stagingService.getStagingStats();
	if (allStats.totalFiles === 0) return;

	// Calculate clipped vs non-clipped counts
	let clippedCount = 0;
	let nonClippedCount = allStats.totalFiles;

	if (webClipperService) {
		const stagingFiles = stagingService.getStagingFiles();
		const clippedFiles = stagingFiles.filter(file => webClipperService.isClippedNote(file));
		clippedCount = clippedFiles.length;
		nonClippedCount = allStats.totalFiles - clippedCount;
	}

	// Section container with alert styling
	const section = container.createDiv({ cls: 'crc-dashboard-staging-section' });

	// Icon
	const iconEl = section.createSpan({ cls: 'crc-dashboard-staging-icon' });
	setLucideIcon(iconEl, 'archive', 20);

	// Content
	const content = section.createDiv({ cls: 'crc-dashboard-staging-content' });

	// Title
	content.createEl('strong', { text: '暂存' });

	// Stats summary with breakdown
	const statsText = content.createSpan({ cls: 'crc-dashboard-staging-stats' });

	// Build breakdown
	const breakdown: string[] = [];
	if (clippedCount > 0) {
		const unreadCount = webClipperService?.getUnreadClipCount() ?? 0;
		const newBadge = unreadCount > 0 ? `（${unreadCount} 个新）` : '';
		breakdown.push(`${clippedCount} 个剪藏${newBadge}`);
	}
	if (nonClippedCount > 0) {
		breakdown.push(`其他 ${nonClippedCount} 个`);
	}

	if (breakdown.length > 0) {
		statsText.setText(` — ${breakdown.join(', ')}`);
	} else {
		statsText.setText(` — ${allStats.totalFiles} 个文件`);
	}

	// Action button
	const manageBtn = section.createEl('button', {
		cls: 'crc-dashboard-staging-btn',
		text: '查看'
	});

	manageBtn.addEventListener('click', () => {
		closeModal();
		// Reset unread count when opening
		webClipperService?.resetUnreadCount();
		void (async () => {
			const { StagingManagementModal } = await import('./staging-management-modal');
			new StagingManagementModal(app, plugin).open();
		})();
	});
}

/**
 * Show context menu for a recent item with type-specific actions
 */
function showRecentItemContextMenu(
	event: MouseEvent,
	entry: RecentFileEntry,
	plugin: CanvasRootsPlugin,
	app: App,
	closeModal: () => void
): void {
	const menu = new Menu();

	// Always show "Open note" option
	menu.addItem((item) =>
		item
			.setTitle('打开笔记')
			.setIcon('file-text')
			.onClick(() => {
				const file = app.vault.getAbstractFileByPath(entry.path);
				if (file instanceof TFile) {
					closeModal();
					void app.workspace.getLeaf().openFile(file);
				}
			})
	);

	// Type-specific actions
	if (entry.type === 'place') {
		menu.addItem((item) =>
			item
				.setTitle('在地图视图中打开')
				.setIcon('map')
				.onClick(() => {
					closeModal();
					openPlaceInMapView(entry.path, plugin, app);
				})
		);
	}

	if (entry.type === 'person') {
		menu.addItem((item) =>
			item
				.setTitle('在家族图表中打开')
				.setIcon('git-branch')
				.onClick(() => {
					closeModal();
					openPersonInFamilyChart(entry.path, plugin, app);
				})
		);
	}

	menu.showAtMouseEvent(event);
}

/**
 * Open a place in Map View, zooming to its coordinates if available
 */
function openPlaceInMapView(
	placePath: string,
	plugin: CanvasRootsPlugin,
	_app: App
): void {
	// Load place data to get coordinates
	const placeGraph = plugin.createPlaceGraphService();

	const allPlaces = placeGraph.getAllPlaces();
	const place = allPlaces.find(p => p.filePath === placePath);

	if (place?.coordinates) {
		// Open map view centered on this place
		void plugin.activateMapView(undefined, false, undefined, {
			lat: place.coordinates.lat,
			lng: place.coordinates.long,
			zoom: 12
		});
	} else {
		// No coordinates, just open map view
		void plugin.activateMapView();
	}
}

/**
 * Open a person in Family Chart view
 */
function openPersonInFamilyChart(
	personPath: string,
	plugin: CanvasRootsPlugin,
	app: App
): void {
	const file = app.vault.getAbstractFileByPath(personPath);
	if (!(file instanceof TFile)) return;

	const cache = app.metadataCache.getFileCache(file);
	const crId = cache?.frontmatter?.cr_id;

	if (crId) {
		void plugin.activateFamilyChartView(crId);
	} else {
		// No cr_id, just open the chart without a specific root
		void plugin.activateFamilyChartView();
	}
}

/**
 * Render the Vault Health section (collapsible)
 */
function renderVaultHealthSection(
	container: HTMLElement,
	plugin: CanvasRootsPlugin,
	app: App,
	createCard: (options: { title: string; icon?: LucideIconName; subtitle?: string }) => HTMLElement,
	closeModal: () => void
): void {
	// Create collapsible details element
	const details = container.createEl('details', { cls: 'crc-dashboard-collapsible' });

	// Check if this is the first visit (expanded by default)
	const isFirstVisit = !plugin.settings.dashboardVaultHealthCollapsed;
	if (isFirstVisit) {
		details.setAttribute('open', '');
	}

	// Summary (header)
	const summary = details.createEl('summary', { cls: 'crc-dashboard-collapsible-header' });
	const chevron = summary.createSpan({ cls: 'crc-dashboard-chevron' });
	setLucideIcon(chevron, 'chevron-right', 14);
	summary.createSpan({ text: '库健康状况', cls: 'crc-dashboard-collapsible-title' });

	// Content container
	const content = details.createDiv({ cls: 'crc-dashboard-collapsible-content' });

	// Remember collapse state
	details.addEventListener('toggle', () => {
		plugin.settings.dashboardVaultHealthCollapsed = !details.open;
		void plugin.saveSettings();
	});

	// Load and render stats
	renderVaultHealthContent(content, plugin, app, closeModal);
}

/**
 * Render the vault health metrics content
 */
function renderVaultHealthContent(
	container: HTMLElement,
	plugin: CanvasRootsPlugin,
	app: App,
	closeModal: () => void
): void {
	// Show loading state
	const loadingEl = container.createDiv({ cls: 'crc-dashboard-loading' });
	loadingEl.createSpan({ text: '正在加载统计…', cls: 'crc-text-muted' });

	// Collect statistics
	let stats: FullVaultStats;
	try {
		const statsService = new VaultStatsService(app);
		const folderFilter = plugin.getFolderFilter();
		if (folderFilter) {
			statsService.setFolderFilter(folderFilter);
		}
		statsService.setSettings(plugin.settings);
		stats = statsService.collectStats();
	} catch (error) {
		container.empty();
		container.createEl('p', {
			text: `加载统计失败：${getErrorMessage(error)}`,
			cls: 'crc-text-error'
		});
		return;
	}

	// Clear loading state
	container.empty();

	// Metrics grid
	const metricsGrid = container.createDiv({ cls: 'crc-dashboard-metrics-grid' });

	// Entity counts
	const metrics = [
		{ label: '人物', value: stats.people.totalPeople },
		{ label: '事件', value: stats.events.totalEvents },
		{ label: '来源', value: stats.sources.totalSources },
		{ label: '地点', value: stats.places.totalPlaces },
		{ label: '画布', value: stats.canvases.totalCanvases },
		{ label: '地图', value: stats.maps.totalMaps }
	];

	for (const metric of metrics) {
		const metricEl = metricsGrid.createDiv({ cls: 'crc-dashboard-metric' });
		metricEl.createDiv({ cls: 'crc-dashboard-metric-value', text: metric.value.toLocaleString() });
		metricEl.createDiv({ cls: 'crc-dashboard-metric-label', text: metric.label });
	}

	// Data completeness progress bar
	const completenessContainer = container.createDiv({ cls: 'crc-dashboard-completeness' });
	const completenessHeader = completenessContainer.createDiv({ cls: 'crc-dashboard-completeness-header' });
	completenessHeader.createSpan({ text: '数据完整度', cls: 'crc-dashboard-completeness-label' });

	// Calculate completeness percentage
	const totalPeople = stats.people.totalPeople;
	const completenessScore = totalPeople > 0
		? Math.round(
			((stats.people.peopleWithBirthDate + stats.people.peopleWithFather + stats.people.peopleWithMother) /
				(totalPeople * 3)) * 100
		)
		: 0;

	completenessHeader.createSpan({
		text: `${completenessScore}%`,
		cls: 'crc-dashboard-completeness-value'
	});

	const progressBar = completenessContainer.createDiv({ cls: 'crc-dashboard-progress-bar' });
	const progressFill = progressBar.createDiv({ cls: 'crc-dashboard-progress-fill' });
	progressFill.style.width = `${completenessScore}%`;

	// Data issues row
	const issuesRow = container.createDiv({ cls: 'crc-dashboard-issues-row' });
	const issuesLabel = issuesRow.createDiv({ cls: 'crc-dashboard-issues-label' });
	const issuesIcon = issuesLabel.createSpan({ cls: 'crc-dashboard-issues-icon' });
	setLucideIcon(issuesIcon, 'alert-triangle', 16);
	issuesLabel.createSpan({ text: '数据问题' });

	// Calculate total issues to match Statistics Dashboard
	// (missing birth dates + orphaned people + unsourced events)
	const missingBirthDate = stats.people.totalPeople - stats.people.peopleWithBirthDate;
	const issueCount = missingBirthDate + stats.people.orphanedPeople + stats.events.unsourcedEvents;
	issuesLabel.createSpan({
		cls: 'crc-dashboard-issues-badge',
		text: issueCount.toString()
	});

	const viewDetailsLink = issuesRow.createEl('a', {
		text: '查看详情',
		cls: 'crc-dashboard-view-details-link'
	});
	viewDetailsLink.addEventListener('click', (e) => {
		e.preventDefault();
		closeModal();
		void plugin.activateStatisticsView();
	});
}

/* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument -- Match scope of file-level disable at top. */
