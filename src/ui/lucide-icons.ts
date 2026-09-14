/**
 * Lucide icon helper utilities for Charted Roots Control Center
 * Obsidian provides Lucide icons via setIcon API
 */

import { addIcon, setIcon } from 'obsidian';

/**
 * Custom SVG icons for visual tree reports
 *
 * IMPORTANT: Obsidian's addIcon() expects:
 * - SVG content WITHOUT the <svg> wrapper (Obsidian adds its own)
 * - Icons must fit within a 0 0 100 100 viewBox
 * - Follow Lucide guidelines: 2px stroke equivalent (scaled to 100), round joins/caps
 */
const CUSTOM_ICONS: Record<string, string> = {
	// Pedigree tree: root at bottom, ancestors branching up
	'cr-pedigree-tree': `
		<circle cx="50" cy="80" r="12" fill="none" stroke="currentColor" stroke-width="8"/>
		<circle cx="20" cy="42" r="10" fill="none" stroke="currentColor" stroke-width="8"/>
		<circle cx="80" cy="42" r="10" fill="none" stroke="currentColor" stroke-width="8"/>
		<circle cx="20" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="8"/>
		<circle cx="80" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="8"/>
		<line x1="40" y1="72" x2="28" y2="52" stroke="currentColor" stroke-width="8" stroke-linecap="round"/>
		<line x1="60" y1="72" x2="72" y2="52" stroke="currentColor" stroke-width="8" stroke-linecap="round"/>
		<line x1="20" y1="32" x2="20" y2="20" stroke="currentColor" stroke-width="8" stroke-linecap="round"/>
		<line x1="80" y1="32" x2="80" y2="20" stroke="currentColor" stroke-width="8" stroke-linecap="round"/>
	`,
	// Descendant tree: root at top, descendants branching down
	'cr-descendant-tree': `
		<circle cx="50" cy="20" r="12" fill="none" stroke="currentColor" stroke-width="8"/>
		<circle cx="20" cy="58" r="10" fill="none" stroke="currentColor" stroke-width="8"/>
		<circle cx="80" cy="58" r="10" fill="none" stroke="currentColor" stroke-width="8"/>
		<circle cx="20" cy="88" r="8" fill="none" stroke="currentColor" stroke-width="8"/>
		<circle cx="80" cy="88" r="8" fill="none" stroke="currentColor" stroke-width="8"/>
		<line x1="40" y1="28" x2="28" y2="48" stroke="currentColor" stroke-width="8" stroke-linecap="round"/>
		<line x1="60" y1="28" x2="72" y2="48" stroke="currentColor" stroke-width="8" stroke-linecap="round"/>
		<line x1="20" y1="68" x2="20" y2="80" stroke="currentColor" stroke-width="8" stroke-linecap="round"/>
		<line x1="80" y1="68" x2="80" y2="80" stroke="currentColor" stroke-width="8" stroke-linecap="round"/>
	`,
	// Hourglass tree: root in center, ancestors above, descendants below
	'cr-hourglass-tree': `
		<circle cx="50" cy="50" r="12" fill="none" stroke="currentColor" stroke-width="8"/>
		<circle cx="15" cy="15" r="10" fill="none" stroke="currentColor" stroke-width="8"/>
		<circle cx="85" cy="15" r="10" fill="none" stroke="currentColor" stroke-width="8"/>
		<circle cx="15" cy="85" r="10" fill="none" stroke="currentColor" stroke-width="8"/>
		<circle cx="85" cy="85" r="10" fill="none" stroke="currentColor" stroke-width="8"/>
		<line x1="40" y1="40" x2="24" y2="24" stroke="currentColor" stroke-width="8" stroke-linecap="round"/>
		<line x1="60" y1="40" x2="76" y2="24" stroke="currentColor" stroke-width="8" stroke-linecap="round"/>
		<line x1="40" y1="60" x2="24" y2="76" stroke="currentColor" stroke-width="8" stroke-linecap="round"/>
		<line x1="60" y1="60" x2="76" y2="76" stroke="currentColor" stroke-width="8" stroke-linecap="round"/>
	`,
	// Fan chart: semicircular ancestor chart
	'cr-fan-chart': `
		<path d="M 8 88 A 54 54 0 0 1 92 88" fill="none" stroke="currentColor" stroke-width="8" stroke-linecap="round"/>
		<path d="M 20 88 A 42 42 0 0 1 80 88" fill="none" stroke="currentColor" stroke-width="8" stroke-linecap="round"/>
		<path d="M 32 88 A 30 30 0 0 1 68 88" fill="none" stroke="currentColor" stroke-width="8" stroke-linecap="round"/>
		<line x1="50" y1="88" x2="50" y2="34" stroke="currentColor" stroke-width="8" stroke-linecap="round"/>
		<line x1="50" y1="88" x2="12" y2="50" stroke="currentColor" stroke-width="8" stroke-linecap="round"/>
		<line x1="50" y1="88" x2="88" y2="50" stroke="currentColor" stroke-width="8" stroke-linecap="round"/>
	`
};

/**
 * Register custom icons with Obsidian
 * Should be called once during plugin initialization
 */
export function registerCustomIcons(): void {
	for (const [name, svg] of Object.entries(CUSTOM_ICONS)) {
		addIcon(name, svg);
	}
}

/**
 * Lucide icon names used in Control Center
 */
export type LucideIconName =
	| 'activity'       // Status tab
	| 'zap'            // Bulk actions
	| 'user-plus'      // Data Entry tab
	| 'git-branch'     // Tree Generation tab
	| 'git-compare'    // Relationship calculator
	| 'file-text'      // GEDCOM tab
	| 'user'           // Person Details tab
	| 'settings'       // Canvas settings tab
	| 'book-open'      // Guide tab
	| 'users'          // Multiple people icon
	| 'calendar'       // Date picker
	| 'search'         // Search icon
	| 'folder'         // Folder browser
	| 'x'              // Close button
	| 'check'          // Success/complete
	| 'alert-circle'   // Warning
	| 'alert-triangle' // Error
	| 'info'           // Information
	| 'chevron-right'  // Navigation
	| 'chevron-left'   // Navigation back
	| 'chevron-down'   // Dropdown
	| 'plus'           // Add/create
	| 'minus'          // Remove
	| 'edit'           // Edit
	| 'trash'          // Delete
	| 'refresh-cw'     // Refresh/recalculate
	| 'download'       // Download/export
	| 'upload'         // Upload/import
	| 'link'           // Link relationship
	| 'unlink'         // Unlink relationship
	| 'external-link'  // Open external
	| 'eye'            // View
	| 'eye-off'        // Hide
	| 'file-plus'      // Create file
	| 'hash'           // ID/identifier
	| 'heart'          // Health/status
	| 'layout'         // Layout options
	| 'file'           // File/canvas
	| 'play'           // Generate/run action
	| 'clock'          // Time/recent items
	| 'crown'          // Root person marker
	| 'arrow-up'       // Direction up
	| 'arrow-down'     // Direction down
	| 'arrow-right'    // Direction right/lateral
	| 'copy'           // Copy to clipboard
	| 'circle'         // Neutral/dot indicator
	| 'home'           // Family/home
	| 'baby'           // Child icon
	| 'bar-chart'      // Statistics
	| 'bar-chart-2'    // Folder statistics
	| 'maximize-2'     // Largest
	| 'minimize-2'     // Smallest
	| 'undo-2'         // Undo action
	| 'history'        // History view
	| 'user-minus'     // Remove person
	| 'table-2'        // CSV/spreadsheet
	| 'package'        // Staging/import packages
	| 'shield-check'   // Data quality
	| 'layers'         // Layers/generations
	| 'network'        // Network/connected trees
	| 'arrow-up-down'  // Bidirectional/ancestor-descendant
	| 'map-pin'        // Places/locations
	| 'globe'          // World/geography
	| 'file-code'      // Templates/code files
	| 'lightbulb'      // Ideas/concepts
	| 'list-checks'    // Task lists
	| 'map'            // Map view
	| 'more-vertical' // Overflow menu
	| 'clipboard-check' // Schema validation
	| 'file-check' // Schema note
	| 'link-2' // Relationships
	| 'building' // Organizations tab
	| 'building-2' // Corporation
	| 'hammer' // Guild
	| 'church' // Religious
	| 'landmark' // Political
	| 'graduation-cap' // Educational
	| 'shield' // Military
	// Source types
	| 'bookmark' // Obituary
	| 'gavel' // Court records
	| 'scroll' // Probate
	| 'ship' // Immigration
	| 'image' // Photos
	| 'mail' // Correspondence
	| 'newspaper' // Newspaper articles
	| 'mic' // Oral history
	| 'archive' // Sources tab
	| 'scale' // Proof summaries (weighing evidence)
	| 'sliders' // Preferences tab
	// Event types
	| 'skull' // Death
	| 'heart-off' // Divorce
	| 'heart-handshake' // Adoption
	| 'droplets' // Baptism
	| 'calendar-plus' // Extract events
	| 'calendar-check' // Create events
	| 'star' // Star marker
	| 'flag' // Flag marker
	| 'check-circle' // Success indicator
	| 'circle-off' // Disabled/off state
	| 'help-circle' // Help/unknown
	// Data enhancement
	| 'sparkles' // Enhancement/magic
	| 'plus-circle' // Add/create new
	// Privacy
	| 'lock' // Private/locked field
	// Statistics
	| 'briefcase' // Occupation/work
	| 'chart-bar-decreasing' // Statistics dashboard
	// Visual tree reports
	| 'file-image' // PDF/image export
	| 'git-fork' // Descendant tree fallback
	| 'hourglass' // Hourglass tree fallback
	| 'pie-chart' // Fan chart fallback
	// DNA tracking
	| 'flask-conical' // DNA match badge
	// Custom icons (registered via addIcon)
	| 'cr-pedigree-tree' // Pedigree tree icon
	| 'cr-descendant-tree' // Descendant tree icon
	| 'cr-hourglass-tree' // Hourglass tree icon
	| 'cr-fan-chart' // Fan chart icon
	// Unified wizard
	| 'layout-dashboard' // Canvas output format
	// Additional action / entity icons
	| 'save'
	| 'pencil'
	| 'book'
	| 'wand'
	| 'terminal'
	| 'git-merge'
	| 'clipboard-list'
	| 'arrow-right-left';

/**
 * Navigation group identifiers
 */
export type NavGroup = 'dashboard' | 'entities' | 'data-structure' | 'output' | 'tools' | 'settings';

/**
 * Navigation group configuration
 */
export interface NavGroupConfig {
	id: NavGroup;
	label: string | null;  // null = no label (e.g., Dashboard)
}

/**
 * Navigation group definitions with display labels
 */
export const NAV_GROUPS: NavGroupConfig[] = [
	{ id: 'dashboard', label: null },
	{ id: 'entities', label: '实体' },
	{ id: 'data-structure', label: '数据与结构' },
	{ id: 'output', label: '输出' },
	{ id: 'tools', label: '工具' }
	// 'settings' group removed - Preferences consolidated into Plugin Settings (#176)
];

/**
 * Tab configuration for Control Center navigation
 */
export interface TabConfig {
	id: string;
	name: string;
	icon: LucideIconName;
	description: string;
	group: NavGroup;
}

/**
 * Tool entry configuration - opens modals/leaves instead of switching tabs
 */
export interface ToolConfig {
	id: string;
	name: string;
	icon: LucideIconName;
	description: string;
}

/**
 * Tool entries that appear in the Tools group
 * These open modals or dedicated leaves instead of switching the main content
 */
export const TOOL_CONFIGS: ToolConfig[] = [
	{
		id: 'templates',
		name: '模板',
		icon: 'file-code',
		description: '查看并复制模板片段'
	},
	{
		id: 'media-manager',
		name: '媒体管理器',
		icon: 'layout',
		description: '管理媒体文件与附件'
	},
	{
		id: 'family-chart',
		name: '家谱图',
		icon: 'users',
		description: '打开交互式家谱图视图'
	},
	{
		id: 'import-export',
		name: '导入/导出',
		icon: 'arrow-up-down',
		description: '导入和导出家谱数据'
	},
	{
		id: 'statistics',
		name: '统计',
		icon: 'chart-bar-decreasing',
		description: '数据分析与统计仪表盘'
	},
	{
		id: 'create-family',
		name: '创建家族',
		icon: 'users',
		description: '使用向导创建家族分组'
	}
];

/**
 * Control Center tab configurations
 * Ordered by group for rendering
 */
export const TAB_CONFIGS: TabConfig[] = [
	// Dashboard (ungrouped)
	{
		id: 'dashboard',
		name: '仪表盘',
		icon: 'home',
		description: '快速操作与库概览',
		group: 'dashboard'
	},
	// Entities group
	{
		id: 'people',
		name: '人物',
		icon: 'users',
		description: '人物笔记、统计与数据录入',
		group: 'entities'
	},
	{
		id: 'events',
		name: '事件',
		icon: 'calendar',
		description: '日期系统与时间数据',
		group: 'entities'
	},
	{
		id: 'places',
		name: '地点',
		icon: 'map-pin',
		description: '地理位置与地点统计',
		group: 'entities'
	},
	{
		id: 'sources',
		name: '来源',
		icon: 'archive',
		description: '证据与来源文档',
		group: 'entities'
	},
	{
		id: 'organizations',
		name: '组织',
		icon: 'building',
		description: '管理组织与成员身份',
		group: 'entities'
	},
	{
		id: 'universes',
		name: '宇宙',
		icon: 'globe',
		description: '管理虚构宇宙与世界',
		group: 'entities'
	},
	{
		id: 'collections',
		name: '合集',
		icon: 'folder',
		description: '浏览并整理家族分组与合集',
		group: 'entities'
	},
	// Data & Structure group
	{
		id: 'data-quality',
		name: '数据质量',
		icon: 'shield-check',
		description: '分析数据质量并发现问题',
		group: 'data-structure'
	},
	{
		id: 'schemas',
		name: 'Schema',
		icon: 'clipboard-check',
		description: '用于数据一致性的校验 Schema',
		group: 'data-structure'
	},
	{
		id: 'relationships',
		name: '关系',
		icon: 'link-2',
		description: '自定义关系类型与连接',
		group: 'data-structure'
	},
	// Output group
	{
		id: 'tree-generation',
		name: '树与报告',
		icon: 'git-branch',
		description: '生成可视化树与格式化报告',
		group: 'output'
	},
	{
		id: 'maps',
		name: '地图',
		icon: 'map',
		description: '地图可视化与自定义地图',
		group: 'output'
	}
	// Settings group removed - Preferences consolidated into Plugin Settings (#176)
];

/**
 * Create a Lucide icon element
 *
 * @param iconName - Name of the Lucide icon
 * @param size - Icon size in pixels (default: 20)
 * @returns HTMLElement with the icon rendered
 */
export function createLucideIcon(iconName: LucideIconName, size: number = 20): HTMLElement {
	const iconEl = activeDocument.createElement('span');
	iconEl.addClass('crc-icon', 'cr-lucide-icon');
	iconEl.style.setProperty('width', `${size}px`);
	iconEl.style.setProperty('height', `${size}px`);

	setIcon(iconEl, iconName);

	return iconEl;
}

/**
 * Set icon on an existing element
 *
 * @param element - Target element
 * @param iconName - Name of the Lucide icon
 * @param size - Icon size in pixels (default: 20)
 */
export function setLucideIcon(element: HTMLElement, iconName: LucideIconName, size: number = 20): void {
	element.empty();
	element.addClass('crc-icon', 'cr-lucide-icon');
	element.setCssStyles({
		width: `${size}px`,
		height: `${size}px`
	});

	setIcon(element, iconName);
}
