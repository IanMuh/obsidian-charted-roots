/**
 * Statistics Tab UI Component
 *
 * Renders the Statistics tab in the Control Center, showing
 * vault statistics, data completeness, and quality metrics.
 */

import { setIcon, Setting } from 'obsidian';
import type CanvasRootsPlugin from '../../../main';
import type { LucideIconName } from '../../ui/lucide-icons';
import { StatisticsService } from '../services/statistics-service';
import { formatDateRangeLine } from '../../core/collection-date-range';
import { createUniverseService } from '../../universes/services/universe-service';
import { UniverseWizardModal } from '../../universes/ui/universe-wizard';
import type { StatisticsData, TopListItem } from '../types/statistics-types';
import { VIEW_TYPE_STATISTICS } from '../constants/statistics-constants';

/**
 * Render the Statistics tab content
 */
export function renderStatisticsTab(
	container: HTMLElement,
	plugin: CanvasRootsPlugin,
	createCard: (options: { title: string; icon?: LucideIconName; subtitle?: string }) => HTMLElement,
	showTab: (tabId: string) => void,
	closeModal?: () => void
): void {
	const service = new StatisticsService(plugin.app, plugin.settings, plugin);
	const stats = service.getAllStatistics();

	// Actions card (at top for discoverability)
	renderActionsCard(container, plugin, createCard, closeModal);

	// Overview card with entity counts
	renderOverviewCard(container, stats, createCard);

	// Data completeness card
	renderCompletenessCard(container, stats, createCard);

	// Quality alerts card
	renderQualityCard(container, stats, createCard, showTab);

	// Universes card (always visible for discoverability)
	renderUniversesCard(container, plugin, createCard, showTab);

	// Top lists card
	renderTopListsCard(container, stats, createCard);
}

/**
 * Render the Overview card with entity counts
 */
function renderOverviewCard(
	container: HTMLElement,
	stats: StatisticsData,
	createCard: (options: { title: string; icon?: LucideIconName; subtitle?: string }) => HTMLElement
): void {
	const card = createCard({
		title: '概览',
		icon: 'bar-chart-2',
		subtitle: `上次更新：${formatTime(stats.lastUpdated)}`
	});
	const content = card.querySelector('.crc-card__content') as HTMLElement;

	// Entity counts grid
	const statsGrid = content.createDiv({ cls: 'cr-stats-grid' });

	const createStatItem = (label: string, value: number, icon: LucideIconName) => {
		const item = statsGrid.createDiv({ cls: 'cr-stat-item' });
		const iconEl = item.createDiv({ cls: 'cr-stat-icon' });
		setIcon(iconEl, icon);
		item.createDiv({ cls: 'cr-stat-value', text: formatNumber(value) });
		item.createDiv({ cls: 'cr-stat-label', text: label });
	};

	createStatItem('人物', stats.entityCounts.people, 'users');
	createStatItem('事件', stats.entityCounts.events, 'calendar');
	createStatItem('地点', stats.entityCounts.places, 'map-pin');
	createStatItem('来源', stats.entityCounts.sources, 'archive');
	createStatItem('组织', stats.entityCounts.organizations, 'building');
	createStatItem('画布', stats.entityCounts.canvases, 'file');

	// Date range — per-universe and era-aware (#719)
	const ranges = stats.dateRange.byUniverse;
	if (ranges.length > 0) {
		const dateRangeDiv = content.createDiv({ cls: 'cr-date-range' });
		dateRangeDiv.createEl('span', { cls: 'cr-date-range-label', text: '日期范围：' });
		if (ranges.length === 1) {
			dateRangeDiv.createEl('span', { cls: 'cr-date-range-value', text: formatDateRangeLine(ranges[0], false) });
		} else {
			const list = dateRangeDiv.createEl('ul', { cls: 'cr-date-range-list' });
			for (const range of ranges) {
				list.createEl('li', { cls: 'cr-date-range-value', text: formatDateRangeLine(range, true) });
			}
		}
	}

	container.appendChild(card);
}

/**
 * Render the Data Completeness card
 */
function renderCompletenessCard(
	container: HTMLElement,
	stats: StatisticsData,
	createCard: (options: { title: string; icon?: LucideIconName }) => HTMLElement
): void {
	const card = createCard({
		title: '数据完整度',
		icon: 'check-circle'
	});
	const content = card.querySelector('.crc-card__content') as HTMLElement;

	const createProgressRow = (label: string, percent: number, colorClass?: string) => {
		const row = content.createDiv({ cls: 'cr-stat-progress-row' });
		const labelDiv = row.createDiv({ cls: 'cr-stat-progress-label' });
		labelDiv.createSpan({ text: label });
		labelDiv.createSpan({ cls: 'cr-stat-progress-percent', text: `${percent}%` });

		const progressContainer = row.createDiv({ cls: 'cr-stat-progress-container' });
		const progressBar = progressContainer.createDiv({ cls: `cr-stat-progress-bar ${colorClass ?? ''}` });
		progressBar.style.width = `${percent}%`;
	};

	createProgressRow('有出生日期', stats.completeness.withBirthDate, getProgressColor(stats.completeness.withBirthDate));
	createProgressRow('有去世日期', stats.completeness.withDeathDate, getProgressColor(stats.completeness.withDeathDate));
	createProgressRow('有来源', stats.completeness.withSources, getProgressColor(stats.completeness.withSources));
	createProgressRow('有父亲', stats.completeness.withFather, getProgressColor(stats.completeness.withFather));
	createProgressRow('有母亲', stats.completeness.withMother, getProgressColor(stats.completeness.withMother));
	createProgressRow('有配偶', stats.completeness.withSpouse, getProgressColor(stats.completeness.withSpouse));

	// Gender distribution
	const { male, female, other, unknown } = stats.genderDistribution;
	const total = male + female + other + unknown;
	if (total > 0) {
		const genderSection = content.createDiv({ cls: 'cr-gender-section' });
		genderSection.createEl('h4', { text: '性别分布', cls: 'cr-subsection-heading' });

		const genderGrid = genderSection.createDiv({ cls: 'cr-gender-grid' });
		const createGenderItem = (label: string, count: number, colorClass: string) => {
			const item = genderGrid.createDiv({ cls: `cr-gender-item ${colorClass}` });
			item.createSpan({ cls: 'cr-gender-count', text: formatNumber(count) });
			item.createSpan({ cls: 'cr-gender-label', text: label });
			item.createSpan({ cls: 'cr-gender-percent crc-text-muted', text: `${Math.round((count / total) * 100)}%` });
		};

		createGenderItem('男性', male, 'cr-gender-male');
		createGenderItem('女性', female, 'cr-gender-female');
		if (other > 0) createGenderItem('其他', other, 'cr-gender-other');
		if (unknown > 0) createGenderItem('未知', unknown, 'cr-gender-unknown');
	}

	container.appendChild(card);
}

/**
 * Get progress bar color class based on percentage
 */
function getProgressColor(percent: number): string {
	if (percent >= 80) return 'cr-stat-progress-good';
	if (percent >= 50) return 'cr-stat-progress-moderate';
	return 'cr-stat-progress-low';
}

/**
 * Render the Quality Alerts card
 */
function renderQualityCard(
	container: HTMLElement,
	stats: StatisticsData,
	createCard: (options: { title: string; icon?: LucideIconName }) => HTMLElement,
	showTab: (tabId: string) => void
): void {
	const card = createCard({
		title: '数据质量',
		icon: 'shield-check'
	});
	const content = card.querySelector('.crc-card__content') as HTMLElement;

	const { quality } = stats;

	// Only show alerts if there are issues
	const hasIssues = quality.missingBirthDate > 0 ||
		quality.orphanedPeople > 0 ||
		quality.unsourcedEvents > 0 ||
		quality.placesWithoutCoordinates > 0;

	if (!hasIssues) {
		const successMsg = content.createDiv({ cls: 'cr-quality-success' });
		setIcon(successMsg.createSpan({ cls: 'cr-quality-success-icon' }), 'check-circle');
		successMsg.createSpan({ text: '未检测到数据质量问题' });
	} else {
		const alertsList = content.createDiv({ cls: 'cr-quality-alerts' });

		const createAlert = (icon: LucideIconName, text: string, count: number, severity: 'warning' | 'info') => {
			if (count === 0) return;
			const alert = alertsList.createDiv({ cls: `cr-quality-alert cr-quality-${severity}` });
			const iconEl = alert.createSpan({ cls: 'cr-quality-alert-icon' });
			setIcon(iconEl, icon);
			alert.createSpan({ cls: 'cr-quality-alert-text', text: `${text}: ` });
			alert.createSpan({ cls: 'cr-quality-alert-count', text: formatNumber(count) });
		};

		createAlert('alert-circle', '缺少出生日期', quality.missingBirthDate, 'warning');
		createAlert('link', '孤立人物（无任何关系）', quality.orphanedPeople, 'warning');
		createAlert('archive', '无来源事件', quality.unsourcedEvents, 'info');
		createAlert('map-pin', '缺少地理或像素坐标的地点', quality.placesWithoutCoordinates, 'info');

		// Living people is informational, not an alert
		if (quality.livingPeople > 0) {
			const infoDiv = content.createDiv({ cls: 'cr-quality-info-text' });
			infoDiv.createSpan({ cls: 'crc-text-muted', text: `${formatNumber(quality.livingPeople)} 人被标记为在世（有出生日期但无去世日期）` });
		}
	}

	// Link to Data Quality tab
	const linkDiv = content.createDiv({ cls: 'cr-quality-link' });
	const link = linkDiv.createEl('a', { text: '打开数据质量标签页查看详细分析' });
	link.addEventListener('click', (e) => {
		e.preventDefault();
		showTab('data-quality');
	});

	container.appendChild(card);
}

/**
 * Render the Top Lists card
 */
function renderTopListsCard(
	container: HTMLElement,
	stats: StatisticsData,
	createCard: (options: { title: string; icon?: LucideIconName }) => HTMLElement
): void {
	const card = createCard({
		title: '排行榜',
		icon: 'list-checks'
	});
	const content = card.querySelector('.crc-card__content') as HTMLElement;

	// Collapsible sections
	const createTopListSection = (title: string, items: TopListItem[], icon: LucideIconName) => {
		if (items.length === 0) return;

		const section = content.createDiv({ cls: 'cr-top-list-section' });
		const header = section.createDiv({ cls: 'cr-top-list-header' });

		const headerLeft = header.createDiv({ cls: 'cr-top-list-header-left' });
		const iconEl = headerLeft.createSpan({ cls: 'cr-top-list-icon' });
		setIcon(iconEl, icon);
		headerLeft.createSpan({ text: title });

		const chevron = header.createSpan({ cls: 'cr-top-list-chevron' });
		setIcon(chevron, 'chevron-down');

		const listContent = section.createDiv({ cls: 'cr-top-list-content crc-hidden' });

		for (const item of items) {
			const row = listContent.createDiv({ cls: 'cr-top-list-row' });
			row.createSpan({ cls: 'cr-top-list-name', text: item.name });
			row.createSpan({ cls: 'cr-top-list-count crc-text-muted', text: formatNumber(item.count) });
		}

		// Toggle on click
		header.addEventListener('click', () => {
			const isExpanded = !listContent.hasClass('crc-hidden');
			listContent.toggleClass('crc-hidden', isExpanded);
			setIcon(chevron, isExpanded ? 'chevron-down' : 'chevron-up');
			section.classList.toggle('cr-top-list-expanded', !isExpanded);
		});
	};

	createTopListSection('常见姓氏', stats.topSurnames, 'users');
	createTopListSection('常见地点', stats.topLocations, 'map-pin');
	createTopListSection('常见职业', stats.topOccupations, 'briefcase');
	createTopListSection('被引用最多的来源', stats.topSources, 'archive');

	// Event types breakdown
	const eventTypes = Object.entries(stats.eventsByType);
	if (eventTypes.length > 0) {
		createTopListSection(
			'按类型统计事件',
			eventTypes.map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
			'calendar'
		);
	}

	container.appendChild(card);
}

/**
 * Render the Actions card
 */
function renderActionsCard(
	container: HTMLElement,
	plugin: CanvasRootsPlugin,
	createCard: (options: { title: string; icon?: LucideIconName }) => HTMLElement,
	closeModal?: () => void
): void {
	const card = createCard({
		title: '操作',
		icon: 'zap'
	});
	const content = card.querySelector('.crc-card__content') as HTMLElement;

	new Setting(content)
		.setName('打开统计仪表盘')
		.setDesc('在新标签页中打开完整的统计仪表盘以进行详细探索')
		.addButton(button => button
			.setButtonText('打开仪表盘')
			.setCta()
			.onClick(() => {
				closeModal?.();
				void plugin.app.workspace.getLeaf('tab').setViewState({
					type: VIEW_TYPE_STATISTICS,
					active: true
				});
			}));

	container.appendChild(card);
}

/**
 * Render the Universes card
 */
function renderUniversesCard(
	container: HTMLElement,
	plugin: CanvasRootsPlugin,
	createCard: (options: { title: string; icon?: LucideIconName; subtitle?: string }) => HTMLElement,
	showTab: (tabId: string) => void
): void {
	const universeService = createUniverseService(plugin);
	const universes = universeService.getAllUniverses();
	const orphans = universeService.findOrphanUniverses();
	const stats = universeService.getStats();

	const subtitle = universes.length > 0
		? `${universes.length} 个宇宙，${stats.totalEntities} 个实体`
		: '组织你的虚构世界';

	const card = createCard({
		title: '宇宙',
		icon: 'globe',
		subtitle
	});
	const content = card.querySelector('.crc-card__content') as HTMLElement;

	if (universes.length > 0) {
		// Universe list with Setting-style rows
		universes.forEach(universe => {
			const counts = universeService.getEntityCountsForUniverse(universe.crId);

			// Build entity count description
			const countParts: string[] = [];
			if (counts.people > 0) countParts.push(`${counts.people} 个人物`);
			if (counts.places > 0) countParts.push(`${counts.places} 个地点`);
			if (counts.events > 0) countParts.push(`${counts.events} 个事件`);
			if (counts.organizations > 0) countParts.push(`${counts.organizations} 个组织`);
			const countText = countParts.length > 0 ? countParts.join('，') : '暂无实体';

			new Setting(content)
				.setName(universe.name)
				.setDesc(countText)
				.addButton(btn => btn
					.setButtonText('打开')
					.onClick(async () => {
						const leaf = plugin.app.workspace.getLeaf(false);
						await leaf.openFile(universe.file);
					}));
		});

		// Create universe action (Setting-style layout)
		new Setting(content)
			.setName('创建宇宙')
			.setDesc('启动宇宙设置向导')
			.addButton(btn => btn
				.setButtonText('创建')
				.setCta()
				.onClick(() => {
					new UniverseWizardModal(plugin, {
						onComplete: () => showTab('universes')
					}).open();
				}));

		// Manage link
		const manageRow = content.createDiv({ cls: 'cr-universes-manage crc-mt-2' });
		const manageLink = manageRow.createEl('a', {
			text: '管理宇宙 →',
			cls: 'crc-link'
		});
		manageLink.addEventListener('click', (e) => {
			e.preventDefault();
			showTab('universes');
		});
	} else {
		// Empty state with Setting-style layout
		new Setting(content)
			.setName('创建宇宙')
			.setDesc('宇宙帮助你用自定义历法、地图和验证规则来组织虚构世界')
			.addButton(btn => btn
				.setButtonText('创建')
				.setCta()
				.onClick(() => {
					new UniverseWizardModal(plugin, {
						onComplete: () => showTab('universes')
					}).open();
				}));
	}

	// Orphan warning
	if (orphans.length > 0) {
		const warning = content.createDiv({ cls: 'cr-universes-warning crc-mt-3' });
		const warningIcon = warning.createSpan({ cls: 'cr-warning-icon' });
		setIcon(warningIcon, 'alert-triangle');
		warning.createSpan({
			text: `${orphans.length} 个孤立宇宙有值但没有对应笔记`
		});
		const fixLink = warning.createEl('a', {
			text: '修复 →',
			cls: 'crc-link crc-ml-2'
		});
		fixLink.addEventListener('click', (e) => {
			e.preventDefault();
			showTab('universes');
		});
	}

	container.appendChild(card);
}

/**
 * Format a number with thousands separators
 */
function formatNumber(num: number): string {
	return num.toLocaleString();
}

/**
 * Format a date/time for display
 */
function formatTime(date: Date): string {
	return date.toLocaleTimeString(undefined, {
		hour: '2-digit',
		minute: '2-digit'
	});
}