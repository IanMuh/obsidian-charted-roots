/**
 * Trees & Reports tab for the Control Center
 *
 * Displays canvas tree overview, recent trees, tips, reports, visual trees,
 * and canvas settings. Also contains GEDCOM import/export helpers and
 * reference numbering prompts used after import.
 */

import { setIcon } from 'obsidian';
import type { App } from 'obsidian';
import type CanvasRootsPlugin from '../../../main';
import type { LucideIconName } from '../../ui/lucide-icons';
import { createLucideIcon } from '../../ui/lucide-icons';
import type { RecentTreeInfo } from '../../settings';
import { renderCanvasLayoutCard, renderCanvasStylingCard } from '../../ui/preferences-tab';
import { UnifiedTreeWizardModal } from './unified-tree-wizard-modal';
import { REPORT_METADATA } from '../../reports/types/report-types';
import type { ReportType } from '../../reports/types/report-types';
import { ReportWizardModal } from '../../reports/ui/report-wizard-modal';
import { BookBuilderModal } from '../../book/ui/book-builder-modal';
import type { FamilyGraphService } from '../../core/family-graph';

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

export interface TreesTabOptions {
	container: HTMLElement;
	plugin: CanvasRootsPlugin;
	app: App;
	createCard: (options: { title: string; icon?: LucideIconName; subtitle?: string }) => HTMLElement;
	showTab: (tabId: string) => void;
	closeModal: () => void;
	openCanvasTree: (canvasPath: string) => Promise<void>;
	showRecentTreeContextMenu: (event: MouseEvent, tree: RecentTreeInfo) => void;
	openAndGenerateAllTrees: () => Promise<void>;
	formatTimeAgo: (timestamp: number) => string;
	getCachedFamilyGraph: () => FamilyGraphService;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * Render the Trees & Reports tab content into the given container.
 */
export function renderTreesTab(options: TreesTabOptions): void {
	showTreeGenerationTab(options);
}


// ---------------------------------------------------------------------------
// Tab renderer
// ---------------------------------------------------------------------------

/**
 * Render the Canvas Trees tab.
 *
 * Shows stats, quick actions, recent trees, tips, reports, visual trees,
 * and canvas layout / styling cards.
 */
function showTreeGenerationTab(options: TreesTabOptions): void {
	const { container, plugin, showTab, openCanvasTree,
		showRecentTreeContextMenu, openAndGenerateAllTrees, formatTimeAgo, createCard } = options;

	// Get data
	const graphService = plugin.createFamilyGraphService();
	const familyComponents = graphService.findAllFamilyComponents();
	const recentTrees = plugin.settings.recentTrees?.slice(0, 10) || [];
	const totalPeopleInTrees = recentTrees.reduce((sum, t) => sum + (t.peopleCount || 0), 0);
	const totalPeopleInVault = familyComponents.reduce((sum, c) => sum + c.size, 0);

	// === Overview Card ===
	const overviewCard = container.createDiv({ cls: 'crc-tree-card' });

	// Card header with title and actions
	const cardHeader = overviewCard.createDiv({ cls: 'crc-tree-card__header' });
	const titleSection = cardHeader.createDiv({ cls: 'crc-tree-card__title-section' });
	titleSection.appendChild(createLucideIcon('git-branch', 20));
	titleSection.createSpan({ text: '画布树', cls: 'crc-tree-card__title' });

	// Quick actions in header
	const actionsSection = cardHeader.createDiv({ cls: 'crc-tree-card__actions' });

	const newTreeBtn = actionsSection.createEl('button', { cls: 'cr-btn cr-btn--primary' });
	newTreeBtn.appendChild(createLucideIcon('plus', 16));
	newTreeBtn.appendText('新建树');
	newTreeBtn.addEventListener('click', () => {
		const wizard = new UnifiedTreeWizardModal(plugin, {
			onComplete: () => showTab('tree-generation')
		});
		wizard.open();
	});

	if (recentTrees.length > 0) {
		const openLatestBtn = actionsSection.createEl('button', { cls: 'cr-btn cr-btn--secondary' });
		openLatestBtn.appendChild(createLucideIcon('external-link', 16));
		openLatestBtn.appendText('打开最新');
		openLatestBtn.addEventListener('click', () => {
			void openCanvasTree(recentTrees[0].canvasPath);
		});
	}

	if (familyComponents.length > 1) {
		const allTreesBtn = actionsSection.createEl('button', { cls: 'cr-btn cr-btn--secondary' });
		allTreesBtn.appendChild(createLucideIcon('network', 16));
		allTreesBtn.appendText(`全部生成（${familyComponents.length}）`);
		allTreesBtn.addEventListener('click', () => {
			void openAndGenerateAllTrees();
		});
	}

	// Stats grid
	const statsGrid = overviewCard.createDiv({ cls: 'crc-tree-card__stats' });

	const stats = [
		{ value: recentTrees.length, label: '树', icon: 'file' as const },
		{ value: totalPeopleInTrees, label: '树中人物', icon: 'users' as const },
		{ value: familyComponents.length, label: '家族', icon: 'home' as const },
		{ value: totalPeopleInVault, label: '库中人物', icon: 'user' as const }
	];

	stats.forEach(stat => {
		const statBox = statsGrid.createDiv({ cls: 'crc-tree-stat-box' });
		const iconEl = statBox.createDiv({ cls: 'crc-tree-stat-box__icon' });
		iconEl.appendChild(createLucideIcon(stat.icon, 16));
		statBox.createDiv({ cls: 'crc-tree-stat-box__value', text: String(stat.value) });
		statBox.createDiv({ cls: 'crc-tree-stat-box__label', text: stat.label });
	});

	// === Recent Trees Card ===
	const recentCard = container.createDiv({ cls: 'crc-tree-card' });
	const recentHeader = recentCard.createDiv({ cls: 'crc-tree-card__header crc-tree-card__header--simple' });
	recentHeader.appendChild(createLucideIcon('clock', 18));
	recentHeader.createSpan({ text: '最近的树', cls: 'crc-tree-card__title' });
	if (recentTrees.length > 0) {
		recentHeader.createSpan({ text: String(recentTrees.length), cls: 'crc-tree-card__badge' });
	}

	const recentContent = recentCard.createDiv({ cls: 'crc-tree-card__content' });

	if (recentTrees.length > 0) {
		recentTrees.forEach((tree, index) => {
			const treeItem = recentContent.createDiv({
				cls: `crc-recent-tree-item ${index > 0 ? 'crc-recent-tree-item--bordered' : ''}`
			});

			const treeInfo = treeItem.createDiv({ cls: 'crc-recent-tree-info' });

			const titleRow = treeInfo.createDiv({ cls: 'crc-recent-tree-title' });
			titleRow.appendChild(createLucideIcon('git-branch', 16));
			titleRow.createSpan({
				text: tree.canvasName.replace('.canvas', ''),
				cls: 'crc-recent-tree-name'
			});

			const metaRow = treeInfo.createDiv({ cls: 'crc-recent-tree-meta' });
			metaRow.createSpan({ text: `${tree.peopleCount} 人`, cls: 'crc-badge crc-badge--small' });
			if (tree.rootPerson) {
				metaRow.createSpan({ text: ' · ', cls: 'crc-text-muted' });
				metaRow.createSpan({ text: `根人物：${tree.rootPerson}`, cls: 'crc-text-muted crc-text-sm' });
			}
			if (tree.timestamp) {
				metaRow.createSpan({ text: ' · ', cls: 'crc-text-muted' });
				metaRow.createSpan({ text: formatTimeAgo(tree.timestamp), cls: 'crc-text-muted crc-text-sm' });
			}

			const actionRow = treeItem.createDiv({ cls: 'crc-recent-tree-actions' });

			const openBtn = actionRow.createEl('button', {
				cls: 'crc-btn crc-btn--icon',
				attr: { 'aria-label': '打开画布' }
			});
			openBtn.appendChild(createLucideIcon('external-link', 14));
			openBtn.addEventListener('click', (e) => {
				e.stopPropagation();
				void openCanvasTree(tree.canvasPath);
			});

			const moreBtn = actionRow.createEl('button', {
				cls: 'crc-btn crc-btn--icon',
				attr: { 'aria-label': '更多操作' }
			});
			moreBtn.appendChild(createLucideIcon('more-vertical', 14));
			moreBtn.addEventListener('click', (e) => {
				e.stopPropagation();
				showRecentTreeContextMenu(e, tree);
			});

			treeItem.addEventListener('click', () => {
				void openCanvasTree(tree.canvasPath);
			});
		});
	} else {
		// Empty state
		const emptyState = recentContent.createDiv({ cls: 'crc-tree-empty-state' });
		const emptyIcon = emptyState.createDiv({ cls: 'crc-tree-empty-icon' });
		emptyIcon.appendChild(createLucideIcon('git-branch', 40));
		emptyState.createEl('p', {
			text: '还没有树。点击「新建树」创建你的第一个画布。',
			cls: 'crc-text-muted'
		});
	}

	// === Tips Card ===
	const tipsCard = container.createDiv({ cls: 'crc-tree-card crc-tree-card--muted' });
	const tipsHeader = tipsCard.createDiv({ cls: 'crc-tree-card__header crc-tree-card__header--simple' });
	tipsHeader.appendChild(createLucideIcon('lightbulb', 18));
	tipsHeader.createSpan({ text: '提示', cls: 'crc-tree-card__title' });

	const tipsContent = tipsCard.createDiv({ cls: 'crc-tree-card__content' });
	const tipsList = tipsContent.createEl('ul', { cls: 'crc-tree-tips-list' });
	const tips = [
		'使用「祖先」或「后代」获得聚焦的世系视图。',
		'按合集筛选，为特定分支生成树。',
		'右键单击最近的树，可重新生成、定位或删除。'
	];
	tips.forEach(tip => tipsList.createEl('li', { text: tip }));

	// === Book Builder Card ===
	const bookCard = container.createDiv({ cls: 'crc-tree-card' });
	const bookHeader = bookCard.createDiv({ cls: 'crc-tree-card__header crc-tree-card__header--simple' });
	bookHeader.appendChild(createLucideIcon('book', 18));
	bookHeader.createSpan({ text: '书籍构建器', cls: 'crc-tree-card__title' });

	const bookContent = bookCard.createDiv({ cls: 'crc-tree-card__content' });
	const bookDesc = bookContent.createDiv({ cls: 'crc-text-muted crc-mb-2' });
	bookDesc.setText('将报告、树和笔记编译为单个 PDF 或 ODT 文档。');

	const bookActions = bookContent.createDiv({ cls: 'cr-sv-report-card-actions' });
	const bookBtn = bookActions.createEl('button', {
		cls: 'mod-cta',
		text: '打开书籍构建器'
	});

	bookBtn.addEventListener('click', () => {
		const modal = new BookBuilderModal(plugin);
		modal.open();
	});

	// === Report Wizard Card (#372) ===
	const wizardCard = container.createDiv({ cls: 'crc-tree-card' });
	const wizardHeader = wizardCard.createDiv({ cls: 'crc-tree-card__header crc-tree-card__header--simple' });
	wizardHeader.appendChild(createLucideIcon('wand', 18));
	wizardHeader.createSpan({ text: '报告向导', cls: 'crc-tree-card__title' });

	const wizardContent = wizardCard.createDiv({ cls: 'crc-tree-card__content' });
	const wizardDesc = wizardContent.createDiv({ cls: 'crc-text-muted crc-mb-2' });
	wizardDesc.setText('分步向导，可为任意报告类型生成并配置选项。');

	const wizardActions = wizardContent.createDiv({ cls: 'cr-sv-report-card-actions' });
	const wizardBtn = wizardActions.createEl('button', {
		cls: 'mod-cta',
		text: '打开报告向导'
	});

	wizardBtn.addEventListener('click', () => {
		void import('../../reports/ui/report-wizard-modal').then(({ ReportWizardModal }) => {
			new ReportWizardModal(plugin).open();
		});
	});

	// === Reports Card ===
	const reportsCard = container.createDiv({ cls: 'crc-tree-card' });
	const reportsHeader = reportsCard.createDiv({ cls: 'crc-tree-card__header crc-tree-card__header--simple' });
	reportsHeader.appendChild(createLucideIcon('file-text', 18));
	reportsHeader.createSpan({ text: '报告', cls: 'crc-tree-card__title' });

	const reportsContent = reportsCard.createDiv({ cls: 'crc-tree-card__content' });
	const reportsDesc = reportsContent.createDiv({ cls: 'crc-text-muted crc-mb-2' });
	reportsDesc.setText('根据你的家谱数据生成格式化报告。');

	const reportsGrid = reportsContent.createDiv({ cls: 'cr-sv-reports-grid' });

	// Create a card for each report type (excluding visual trees which use the tree wizard)
	for (const [type, metadata] of Object.entries(REPORT_METADATA)) {
		// Skip visual trees - they're generated via the tree wizard above
		if (metadata.category === 'visual-trees') continue;

		const reportCard = reportsGrid.createDiv({ cls: 'cr-sv-report-card' });

		const reportCardHeader = reportCard.createDiv({ cls: 'cr-sv-report-card-header' });
		const iconEl = reportCardHeader.createSpan({ cls: 'cr-sv-report-card-icon' });
		setIcon(iconEl, metadata.icon);
		reportCardHeader.createSpan({ cls: 'cr-sv-report-card-title', text: metadata.name });

		reportCard.createDiv({ cls: 'cr-sv-report-card-desc crc-text-muted', text: metadata.description });

		const reportCardActions = reportCard.createDiv({ cls: 'cr-sv-report-card-actions' });
		const generateBtn = reportCardActions.createEl('button', {
			cls: 'mod-cta',
			text: '生成'
		});

		generateBtn.addEventListener('click', () => {
			const modal = new ReportWizardModal(plugin, {
				reportType: type as ReportType
			});
			modal.open();
		});
	}

	// === Visual Trees Card (PDF exports) ===
	const visualTreesCard = container.createDiv({ cls: 'crc-tree-card' });
	const visualTreesHeader = visualTreesCard.createDiv({ cls: 'crc-tree-card__header crc-tree-card__header--simple' });
	visualTreesHeader.appendChild(createLucideIcon('file-image', 18));
	visualTreesHeader.createSpan({ text: '视觉树', cls: 'crc-tree-card__title' });

	const visualTreesContent = visualTreesCard.createDiv({ cls: 'crc-tree-card__content' });
	const visualTreesDesc = visualTreesContent.createDiv({ cls: 'crc-text-muted crc-mb-2' });
	visualTreesDesc.setText('生成可打印的 PDF 树图，包含定位的方框和连接线。');

	const visualTreesGrid = visualTreesContent.createDiv({ cls: 'cr-sv-reports-grid' });

	// Visual tree type mapping for the unified wizard
	const visualTreeTypes: Record<string, 'full' | 'ancestors' | 'descendants' | 'fan'> = {
		'pedigree-tree-pdf': 'ancestors',
		'descendant-tree-pdf': 'descendants',
		'hourglass-tree-pdf': 'full',
		'fan-chart-pdf': 'fan'
	};

	// Create a card for each visual tree report
	for (const [type, metadata] of Object.entries(REPORT_METADATA)) {
		if (metadata.category !== 'visual-trees') continue;
		if (metadata.hidden) continue;

		const vtCard = visualTreesGrid.createDiv({ cls: 'cr-sv-report-card' });

		const vtCardHeader = vtCard.createDiv({ cls: 'cr-sv-report-card-header' });
		const vtIconEl = vtCardHeader.createSpan({ cls: 'cr-sv-report-card-icon' });
		setIcon(vtIconEl, metadata.icon);
		vtCardHeader.createSpan({ cls: 'cr-sv-report-card-title', text: metadata.name });

		vtCard.createDiv({ cls: 'cr-sv-report-card-desc crc-text-muted', text: metadata.description });

		const vtCardActions = vtCard.createDiv({ cls: 'cr-sv-report-card-actions' });
		const vtGenerateBtn = vtCardActions.createEl('button', {
			cls: 'mod-cta',
			text: '生成'
		});

		vtGenerateBtn.addEventListener('click', () => {
			const wizard = new UnifiedTreeWizardModal(plugin, {
				outputFormat: 'pdf',
				treeType: visualTreeTypes[type]
			});
			wizard.open();
		});
	}

	// === Canvas Settings Section ===
	// Canvas Layout and Styling cards (moved from Preferences tab)
	renderCanvasLayoutCard(container, plugin, createCard);
	renderCanvasStylingCard(container, plugin, createCard);
}

// ---------------------------------------------------------------------------
// GEDCOM helpers
// ---------------------------------------------------------------------------
