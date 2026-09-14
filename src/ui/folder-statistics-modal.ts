/**
 * Folder Statistics Modal for Charted Roots
 *
 * Displays comprehensive statistics about person notes in a folder,
 * including data completeness, relationship health, and family structure.
 */

import { App, ButtonComponent, Modal, TFolder } from 'obsidian';
import { FamilyGraphService, CollectionAnalytics } from '../core/family-graph';
import { FolderFilterService } from '../core/folder-filter';
import { createLucideIcon, LucideIconName } from './lucide-icons';
import { formatDateRangeLine } from '../core/collection-date-range';

/**
 * Modal to display folder-level statistics and health reports
 */
export class FolderStatisticsModal extends Modal {
	private folder: TFolder;
	private analytics: CollectionAnalytics | null = null;
	private loading = true;
	private folderFilter?: FolderFilterService;

	constructor(app: App, folder: TFolder, folderFilter?: FolderFilterService) {
		super(app);
		this.folder = folder;
		this.folderFilter = folderFilter;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();

		this.modalEl.addClass('cr-folder-statistics-modal');

		// Title
		contentEl.createEl('h2', {
			text: `统计：${this.folder.name}`,
			cls: 'crc-modal-title'
		});

		// Loading state
		const loadingEl = contentEl.createDiv({ cls: 'cr-loading' });
		loadingEl.createEl('p', { text: '正在分析文件夹…' });

		// Load analytics
		try {
			const graphService = new FamilyGraphService(this.app);
			if (this.folderFilter) {
				graphService.setFolderFilter(this.folderFilter);
			}
			this.analytics = graphService.calculateCollectionAnalytics();
			this.loading = false;

			// Remove loading and render stats
			loadingEl.remove();
			this.renderStatistics(contentEl);
		} catch (error) {
			loadingEl.empty();
			loadingEl.createEl('p', {
				text: `加载统计出错：${error}`,
				cls: 'cr-error-text'
			});
		}
	}

	private renderStatistics(container: HTMLElement): void {
		if (!this.analytics) return;

		// Overview section
		const overviewSection = container.createDiv({ cls: 'cr-stats-section' });
		overviewSection.createEl('h3', { text: '概览' });

		const overviewGrid = overviewSection.createDiv({ cls: 'cr-stats-grid' });

		this.createStatCard(overviewGrid, 'users', '人物总数', this.analytics.totalPeople.toString());
		this.createStatCard(overviewGrid, 'home', '家族群组', this.analytics.totalFamilies.toString());
		this.createStatCard(overviewGrid, 'folder', '合集', this.analytics.totalUserCollections.toString());

		const dateRanges = this.analytics.dateRange.byUniverse;
		if (dateRanges.length > 0) {
			const dateRangeText = dateRanges.length === 1
				? formatDateRangeLine(dateRanges[0], false)
				: dateRanges.map(r => formatDateRangeLine(r, true)).join('; ');
			this.createStatCard(overviewGrid, 'calendar', '日期范围', dateRangeText);
		}

		// Data completeness section
		const completenessSection = container.createDiv({ cls: 'cr-stats-section' });
		completenessSection.createEl('h3', { text: '数据完整度' });

		const completenessGrid = completenessSection.createDiv({ cls: 'cr-completeness-grid' });

		this.createProgressBar(completenessGrid, '出生日期', this.analytics.dataCompleteness.birthDatePercent);
		this.createProgressBar(completenessGrid, '去世日期', this.analytics.dataCompleteness.deathDatePercent);
		this.createProgressBar(completenessGrid, '性别', this.analytics.dataCompleteness.sexPercent);

		// Relationship health section
		const relationshipSection = container.createDiv({ cls: 'cr-stats-section' });
		relationshipSection.createEl('h3', { text: '关系覆盖' });

		const relationshipGrid = relationshipSection.createDiv({ cls: 'cr-stats-grid' });

		const withParentsPercent = this.analytics.totalPeople > 0
			? Math.round((this.analytics.relationshipMetrics.peopleWithParents / this.analytics.totalPeople) * 100)
			: 0;
		const withSpousesPercent = this.analytics.totalPeople > 0
			? Math.round((this.analytics.relationshipMetrics.peopleWithSpouses / this.analytics.totalPeople) * 100)
			: 0;
		const withChildrenPercent = this.analytics.totalPeople > 0
			? Math.round((this.analytics.relationshipMetrics.peopleWithChildren / this.analytics.totalPeople) * 100)
			: 0;

		this.createStatCard(
			relationshipGrid,
			'users',
			'有父母',
			`${this.analytics.relationshipMetrics.peopleWithParents} (${withParentsPercent}%)`
		);
		this.createStatCard(
			relationshipGrid,
			'heart',
			'有配偶',
			`${this.analytics.relationshipMetrics.peopleWithSpouses} (${withSpousesPercent}%)`
		);
		this.createStatCard(
			relationshipGrid,
			'baby',
			'有子女',
			`${this.analytics.relationshipMetrics.peopleWithChildren} (${withChildrenPercent}%)`
		);

		// Orphaned people warning
		if (this.analytics.relationshipMetrics.orphanedPeople > 0) {
			const orphanWarning = relationshipSection.createDiv({ cls: 'cr-stats-warning' });
			const warnIcon = createLucideIcon('alert-triangle', 16);
			warnIcon.addClass('cr-icon--warning');
			orphanWarning.appendChild(warnIcon);
			orphanWarning.createEl('span', {
				text: ` ${this.analytics.relationshipMetrics.orphanedPeople} 位人物没有任何关系（孤立）`
			});
		}

		// Collection sizes section
		if (this.analytics.largestCollection && this.analytics.smallestCollection) {
			const sizeSection = container.createDiv({ cls: 'cr-stats-section' });
			sizeSection.createEl('h3', { text: '合集规模' });

			const sizeGrid = sizeSection.createDiv({ cls: 'cr-stats-grid' });

			this.createStatCard(
				sizeGrid,
				'maximize-2',
				'最大',
				`${this.analytics.largestCollection.name} (${this.analytics.largestCollection.size})`
			);
			this.createStatCard(
				sizeGrid,
				'minimize-2',
				'最小',
				`${this.analytics.smallestCollection.name} (${this.analytics.smallestCollection.size})`
			);
			this.createStatCard(
				sizeGrid,
				'bar-chart',
				'平均规模',
				this.analytics.averageCollectionSize.toString()
			);
		}

		// Cross-collection connections
		if (this.analytics.crossCollectionMetrics.totalConnections > 0) {
			const connectionsSection = container.createDiv({ cls: 'cr-stats-section' });
			connectionsSection.createEl('h3', { text: '跨合集连接' });

			const connectionsInfo = connectionsSection.createDiv({ cls: 'cr-stats-info' });
			connectionsInfo.createEl('p', {
				text: `合集之间有 ${this.analytics.crossCollectionMetrics.totalConnections} 条连接`
			});
			connectionsInfo.createEl('p', {
				text: `${this.analytics.crossCollectionMetrics.totalBridgePeople} 位桥梁人物连接不同群体`
			});

			if (this.analytics.crossCollectionMetrics.topConnections.length > 0) {
				const topList = connectionsSection.createEl('ul', { cls: 'cr-stats-list' });
				for (const conn of this.analytics.crossCollectionMetrics.topConnections) {
					topList.createEl('li', {
						text: `${conn.from} ↔ ${conn.to}：${conn.bridgeCount} 位桥梁人物`
					});
				}
			}
		}

		// Close button
		const buttonContainer = container.createDiv({ cls: 'cr-modal-buttons' });
		new ButtonComponent(buttonContainer)
			.setButtonText('关闭')
			.setCta()
			.onClick(() => this.close());
	}

	private createStatCard(container: HTMLElement, icon: LucideIconName, label: string, value: string): void {
		const card = container.createDiv({ cls: 'cr-stat-card' });

		const iconEl = createLucideIcon(icon, 20);
		iconEl.addClass('cr-stat-icon');
		card.appendChild(iconEl);

		const textDiv = card.createDiv({ cls: 'cr-stat-text' });
		textDiv.createEl('div', { text: label, cls: 'cr-stat-label' });
		textDiv.createEl('div', { text: value, cls: 'cr-stat-value' });
	}

	private createProgressBar(container: HTMLElement, label: string, percent: number): void {
		const row = container.createDiv({ cls: 'cr-progress-row' });

		row.createEl('span', { text: label, cls: 'cr-progress-label' });

		const barContainer = row.createDiv({ cls: 'cr-progress-bar-container' });
		const bar = barContainer.createDiv({ cls: 'cr-progress-bar' });
		bar.style.setProperty('width', `${percent}%`);

		// Color based on percent
		if (percent >= 80) {
			bar.addClass('cr-progress-bar--good');
		} else if (percent >= 50) {
			bar.addClass('cr-progress-bar--medium');
		} else {
			bar.addClass('cr-progress-bar--low');
		}

		row.createEl('span', { text: `${percent}%`, cls: 'cr-progress-percent' });
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}
