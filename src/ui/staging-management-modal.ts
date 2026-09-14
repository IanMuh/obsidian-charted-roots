/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call -- Obsidian API returns any-typed surfaces (frontmatter, file caches, plugin state); project policy accepts these. */
/**
 * Staging Management Modal
 *
 * Provides UI for managing staged imports:
 * - View staging folder status and statistics
 * - Check for duplicates against main tree
 * - Promote staging files to main tree
 * - Delete staging data
 */

import { App, Modal, Notice, setIcon } from 'obsidian';
import type CanvasRootsPlugin from '../../main';
import {
	StagingService,
	type EntityTypeCounts,
	type StagingSubfolderInfo
} from '../core/staging-service';
import { CrossImportDetectionService } from '../core/cross-import-detection';
import { FolderFilterService } from '../core/folder-filter';
import type { NoteType } from '../utils/note-type-detection';

/**
 * Options for StagingManagementModal
 */
export interface StagingManagementOptions {
	filterClipped?: boolean;
}

/**
 * Staging Management Modal
 */
type StagingFilterMode = 'all' | 'clipped' | 'imports';

export class StagingManagementModal extends Modal {
	private plugin: CanvasRootsPlugin;
	private stagingService: StagingService;
	private crossImportService: CrossImportDetectionService | null = null;
	private expandedBatches: Set<string> = new Set();
	private filterMode: StagingFilterMode;

	constructor(app: App, plugin: CanvasRootsPlugin, options?: StagingManagementOptions) {
		super(app);
		this.plugin = plugin;
		this.stagingService = new StagingService(app, plugin.settings);
		// Map old boolean to new enum for backward compatibility
		if (options?.filterClipped) {
			this.filterMode = 'clipped';
		} else {
			this.filterMode = 'all';
		}
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('crc-staging-modal');
		this.modalEl.addClass('crc-staging-modal-sized');

		this.renderContent();
	}

	onClose(): void {
		const { contentEl } = this;
		contentEl.empty();
	}

	/**
	 * Render the modal content
	 */
	private renderContent(): void {
		const { contentEl } = this;
		contentEl.empty();

		// Header
		this.renderHeader(contentEl);

		// Check if staging is configured
		if (!this.stagingService.isConfigured()) {
			this.renderNotConfigured(contentEl);
			return;
		}

		// Filter toggles
		this.renderFilterToggles(contentEl);

		// Get staging stats (filtered based on current mode)
		const stats = this.getFilteredStats();

		// Empty state
		if (stats.totalFiles === 0) {
			this.renderEmptyState(contentEl);
			return;
		}

		// Staging overview
		this.renderOverview(contentEl, stats);

		// Subfolder list
		this.renderSubfolderList(contentEl);

		// Bulk actions
		this.renderBulkActions(contentEl, stats);
	}

	/**
	 * Get filtered stats based on current filter mode
	 */
	private getFilteredStats(): { totalFiles: number; totalEntities: number; entityCounts: EntityTypeCounts; subfolderCount: number } {
		const allStats = this.stagingService.getStagingStats();

		// If showing all or no web clipper service, return unfiltered stats
		const webClipperService = this.plugin.getWebClipperService();
		if (this.filterMode === 'all' || !webClipperService) {
			return allStats;
		}

		// Filter files based on mode
		const allFiles = this.stagingService.getStagingFiles();
		const filteredFiles = allFiles.filter(file => {
			if (this.filterMode === 'clipped') {
				return webClipperService.isClippedNote(file);
			} else if (this.filterMode === 'imports') {
				return !webClipperService.isClippedNote(file);
			}
			return true;
		});

		// Recalculate stats for filtered files
		const entityCounts = this.stagingService.countEntityTypes(filteredFiles);
		const totalEntities = entityCounts.person + entityCounts.place + entityCounts.source +
		                      entityCounts.event + entityCounts.organization + entityCounts.other;

		// Count subfolders that have at least one matching file
		const subfolders = this.stagingService.getStagingSubfolders();
		const subfolderCount = subfolders.filter(subfolder => {
			const files = this.stagingService.getSubfolderFiles(subfolder.path);
			return files.some(({ file }) => {
				if (this.filterMode === 'clipped') {
					return webClipperService.isClippedNote(file);
				} else if (this.filterMode === 'imports') {
					return !webClipperService.isClippedNote(file);
				}
				return true;
			});
		}).length;

		return {
			totalFiles: filteredFiles.length,
			totalEntities,
			entityCounts,
			subfolderCount
		};
	}

	/**
	 * Render the modal header
	 */
	private renderHeader(container: HTMLElement): void {
		const header = container.createDiv({ cls: 'crc-staging-header' });
		const headerIcon = header.createDiv({ cls: 'crc-staging-header-icon' });
		setIcon(headerIcon, 'archive');
		header.createEl('h2', { text: '暂存管理器' });
	}

	/**
	 * Render filter toggle buttons
	 */
	private renderFilterToggles(container: HTMLElement): void {
		const filterContainer = container.createDiv({ cls: 'crc-staging-filter' });
		filterContainer.createSpan({ text: '显示：', cls: 'crc-staging-filter-label' });

		const buttonGroup = filterContainer.createDiv({ cls: 'crc-staging-filter-buttons' });

		// All button
		const allBtn = buttonGroup.createEl('button', {
			text: '全部',
			cls: this.filterMode === 'all' ? 'crc-staging-filter-btn crc-staging-filter-btn-active' : 'crc-staging-filter-btn'
		});
		allBtn.addEventListener('click', () => {
			this.filterMode = 'all';
			this.renderContent();
		});

		// Clipped button
		const clippedBtn = buttonGroup.createEl('button', {
			text: '剪藏',
			cls: this.filterMode === 'clipped' ? 'crc-staging-filter-btn crc-staging-filter-btn-active' : 'crc-staging-filter-btn'
		});
		clippedBtn.addEventListener('click', () => {
			this.filterMode = 'clipped';
			this.renderContent();
		});

		// Other button
		const otherBtn = buttonGroup.createEl('button', {
			text: '其他',
			cls: this.filterMode === 'imports' ? 'crc-staging-filter-btn crc-staging-filter-btn-active' : 'crc-staging-filter-btn'
		});
		otherBtn.addEventListener('click', () => {
			this.filterMode = 'imports';
			this.renderContent();
		});
	}

	/**
	 * Render not configured state
	 */
	private renderNotConfigured(container: HTMLElement): void {
		const empty = container.createDiv({ cls: 'crc-staging-empty' });
		const icon = empty.createDiv({ cls: 'crc-staging-empty-icon' });
		setIcon(icon, 'settings');

		empty.createEl('h3', { text: '暂存未配置' });
		empty.createEl('p', {
			text: '在设置中启用暂存隔离并配置暂存文件夹以使用此功能。'
		});

		const openSettings = empty.createEl('button', {
			text: '打开设置',
			cls: 'mod-cta'
		});
		openSettings.addEventListener('click', () => {
			this.close();
			// Open plugin settings
			// @ts-expect-error - accessing private API
			this.app.setting.open();
			// @ts-expect-error - accessing private API
			this.app.setting.openTabById('canvas-roots');
		});
	}

	/**
	 * Render empty staging state
	 */
	private renderEmptyState(container: HTMLElement): void {
		const empty = container.createDiv({ cls: 'crc-staging-empty' });
		const icon = empty.createDiv({ cls: 'crc-staging-empty-icon' });
		setIcon(icon, 'inbox');

		empty.createEl('h3', { text: '无暂存导入' });
		empty.createEl('p', {
			text: '使用导入向导将数据导入暂存，或配置 Web Clipper 将剪藏保存到此处。'
		});

		const stagingPath = this.stagingService.getStagingFolder();
		if (stagingPath) {
			empty.createDiv({
				cls: 'crc-staging-path',
				text: `暂存文件夹：${stagingPath}`
			});
		}

		const openImport = empty.createEl('button', {
			text: '打开导入向导',
			cls: 'mod-cta'
		});
		openImport.addEventListener('click', () => {
			this.close();
			void import('./import-wizard-modal').then(({ ImportWizardModal }) => {
				new ImportWizardModal(this.app, this.plugin).open();
			});
		});
	}

	/**
	 * Render staging overview with stats
	 */
	private renderOverview(
		container: HTMLElement,
		stats: {
			totalFiles: number;
			totalEntities: number;
			entityCounts: EntityTypeCounts;
			subfolderCount: number;
		}
	): void {
		const overview = container.createDiv({ cls: 'crc-staging-overview' });

		// Staging folder path
		const stagingPath = this.stagingService.getStagingFolder();
		overview.createDiv({
			cls: 'crc-staging-info',
			text: `暂存文件夹：${stagingPath}`
		});

		// Stats grid
		const statsGrid = overview.createDiv({ cls: 'crc-staging-stats' });

		// Total entities
		this.renderStatCard(statsGrid, 'users', stats.totalEntities.toString(), '实体总数');

		// Entity breakdown
		const breakdown = overview.createDiv({ cls: 'crc-staging-breakdown' });
		breakdown.createEl('span', { text: '按类型：', cls: 'crc-staging-breakdown-label' });

		const counts: Array<{ type: string; count: number; icon: string }> = [
			{ type: '人物', count: stats.entityCounts.person, icon: 'user' },
			{ type: '地点', count: stats.entityCounts.place, icon: 'map-pin' },
			{ type: '来源', count: stats.entityCounts.source, icon: 'book-open' },
			{ type: '事件', count: stats.entityCounts.event, icon: 'calendar' },
			{ type: '组织', count: stats.entityCounts.organization, icon: 'building' }
		];

		const nonZeroCounts = counts.filter(c => c.count > 0);
		nonZeroCounts.forEach((c, idx) => {
			const badge = breakdown.createSpan({ cls: 'crc-staging-type-badge' });
			const badgeIcon = badge.createSpan({ cls: 'crc-staging-type-badge-icon' });
			setIcon(badgeIcon, c.icon);
			badge.createSpan({ text: `${c.count} ${c.type}` });
			if (idx < nonZeroCounts.length - 1) {
				breakdown.createSpan({ text: ', ', cls: 'crc-staging-separator' });
			}
		});

		if (stats.entityCounts.other > 0) {
			if (nonZeroCounts.length > 0) {
				breakdown.createSpan({ text: ', ', cls: 'crc-staging-separator' });
			}
			breakdown.createSpan({ text: `其他 ${stats.entityCounts.other}` });
		}
	}

	/**
	 * Render a stat card
	 */
	private renderStatCard(
		container: HTMLElement,
		icon: string,
		value: string,
		label: string
	): void {
		const card = container.createDiv({ cls: 'crc-staging-stat-card' });
		const iconEl = card.createDiv({ cls: 'crc-staging-stat-icon' });
		setIcon(iconEl, icon);
		card.createDiv({ cls: 'crc-staging-stat-value', text: value });
		card.createDiv({ cls: 'crc-staging-stat-label', text: label });
	}

	/**
	 * Render the subfolder list
	 */
	private renderSubfolderList(container: HTMLElement): void {
		let subfolders = this.stagingService.getStagingSubfolders();
		if (subfolders.length === 0) return;

		// Filter subfolders based on mode
		const webClipperService = this.plugin.getWebClipperService();
		if (webClipperService && this.filterMode !== 'all') {
			subfolders = subfolders.filter(subfolder => {
				const files = this.stagingService.getSubfolderFiles(subfolder.path);
				return files.some(({ file }) => {
					if (this.filterMode === 'clipped') {
						return webClipperService.isClippedNote(file);
					} else if (this.filterMode === 'imports') {
						return !webClipperService.isClippedNote(file);
					}
					return true;
				});
			});
		}

		if (subfolders.length === 0) return;

		const list = container.createDiv({ cls: 'crc-staging-list' });

		for (const subfolder of subfolders) {
			this.renderSubfolderItem(list, subfolder);
		}
	}

	/**
	 * Render a single subfolder item
	 */
	private renderSubfolderItem(container: HTMLElement, subfolder: StagingSubfolderInfo): void {
		const isExpanded = this.expandedBatches.has(subfolder.path);
		const item = container.createDiv({
			cls: `crc-staging-item ${isExpanded ? 'is-expanded' : ''}`
		});

		// Clickable header with folder icon and name
		const header = item.createDiv({ cls: 'crc-staging-item-header' });
		header.setAttribute('role', 'button');
		header.setAttribute('tabindex', '0');
		header.setAttribute('aria-expanded', isExpanded.toString());

		// Chevron for expand/collapse
		const chevron = header.createDiv({ cls: 'crc-staging-item-chevron' });
		setIcon(chevron, 'chevron-right');

		const iconEl = header.createDiv({ cls: 'crc-staging-item-icon' });
		setIcon(iconEl, 'folder');

		const info = header.createDiv({ cls: 'crc-staging-item-info' });
		info.createDiv({ cls: 'crc-staging-item-name', text: subfolder.name });

		// Stats line
		const statsText = this.formatEntityCounts(subfolder.entityCounts);
		const modifiedText = subfolder.modifiedDate
			? `修改于：${this.formatDate(subfolder.modifiedDate)}`
			: '';

		const statsLine = info.createDiv({ cls: 'crc-staging-item-stats' });
		statsLine.createSpan({ text: statsText });
		if (modifiedText) {
			statsLine.createSpan({ text: ' — ' });
			statsLine.createSpan({ text: modifiedText, cls: 'crc-staging-item-date' });
		}

		// Toggle expand on header click
		header.addEventListener('click', (e) => {
			// Don't toggle if clicking on actions
			if ((e.target as HTMLElement).closest('.crc-staging-item-actions')) return;
			this.toggleBatchExpanded(subfolder.path);
		});
		header.addEventListener('keydown', (e) => {
			if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				this.toggleBatchExpanded(subfolder.path);
			}
		});

		// Actions
		const actions = item.createDiv({ cls: 'crc-staging-item-actions' });

		// Check duplicates button
		const checkBtn = actions.createEl('button', {
			cls: 'crc-staging-btn crc-staging-btn-check',
			attr: { 'aria-label': '检查重复项' }
		});
		setIcon(checkBtn, 'search');
		checkBtn.createSpan({ text: '检查重复项' });
		checkBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			this.handleCheckDuplicates(subfolder.path);
		});

		// Promote button
		const promoteBtn = actions.createEl('button', {
			cls: 'crc-staging-btn crc-staging-btn-promote',
			attr: { 'aria-label': '提升' }
		});
		setIcon(promoteBtn, 'arrow-up-right');
		promoteBtn.createSpan({ text: '提升' });
		promoteBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			void this.handlePromoteSubfolder(subfolder);
		});

		// Delete button
		const deleteBtn = actions.createEl('button', {
			cls: 'crc-staging-btn crc-staging-btn-delete',
			attr: { 'aria-label': '删除' }
		});
		setIcon(deleteBtn, 'trash-2');
		deleteBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			void this.handleDeleteSubfolder(subfolder);
		});

		// Expandable file list
		if (isExpanded) {
			this.renderFileList(item, subfolder.path);
		}
	}

	/**
	 * Toggle batch expansion state
	 */
	private toggleBatchExpanded(path: string): void {
		if (this.expandedBatches.has(path)) {
			this.expandedBatches.delete(path);
		} else {
			this.expandedBatches.add(path);
		}
		this.renderContent();
	}

	/**
	 * Render the file list for an expanded batch
	 */
	private renderFileList(container: HTMLElement, subfolderPath: string): void {
		let files = this.stagingService.getSubfolderFiles(subfolderPath);

		// Apply filter based on mode
		const webClipperService = this.plugin.getWebClipperService();
		if (webClipperService) {
			if (this.filterMode === 'clipped') {
				// Show only clipped notes
				files = files.filter(({ file }) => webClipperService.isClippedNote(file));
			} else if (this.filterMode === 'imports') {
				// Show only non-clipped files
				files = files.filter(({ file }) => !webClipperService.isClippedNote(file));
			}
			// 'all' mode: no filtering
		}

		if (files.length === 0) return;

		const fileList = container.createDiv({ cls: 'crc-staging-file-list' });

		for (const { file, entityType } of files) {
			const fileRow = fileList.createDiv({ cls: 'crc-staging-file-row' });
			fileRow.setAttribute('role', 'button');
			fileRow.setAttribute('tabindex', '0');

			// Entity type icon
			const typeIcon = fileRow.createDiv({ cls: 'crc-staging-file-icon' });
			setIcon(typeIcon, this.getEntityTypeIcon(entityType));

			// File name
			fileRow.createDiv({
				cls: 'crc-staging-file-name',
				text: file.basename
			});

			// Entity type badge
			if (entityType) {
				fileRow.createDiv({
					cls: 'crc-staging-file-type',
					text: entityType
				});
			}

			// Click to open file
			const openFile = () => {
				void this.app.workspace.openLinkText(file.path, '', true);
			};
			fileRow.addEventListener('click', openFile);
			fileRow.addEventListener('keydown', (e) => {
				if (e.key === 'Enter' || e.key === ' ') {
					e.preventDefault();
					openFile();
				}
			});
		}
	}

	/**
	 * Get icon for entity type
	 */
	private getEntityTypeIcon(entityType: NoteType | null): string {
		switch (entityType) {
			case 'person': return 'user';
			case 'place': return 'map-pin';
			case 'source': return 'book-open';
			case 'event': return 'calendar';
			case 'organization': return 'building';
			default: return 'file';
		}
	}

	/**
	 * Render bulk actions
	 */
	private renderBulkActions(
		container: HTMLElement,
		stats: { totalEntities: number }
	): void {
		const actions = container.createDiv({ cls: 'crc-staging-actions' });
		actions.createEl('h3', { text: '批量操作', cls: 'crc-staging-actions-header' });

		const buttonRow = actions.createDiv({ cls: 'crc-staging-actions-row' });

		// Check all duplicates
		const checkAllBtn = buttonRow.createEl('button', {
			cls: 'crc-staging-btn crc-staging-btn-check'
		});
		setIcon(checkAllBtn, 'search');
		checkAllBtn.createSpan({ text: '检查所有重复项' });
		checkAllBtn.addEventListener('click', () => { this.handleCheckDuplicates(); });

		// Promote all
		const promoteAllBtn = buttonRow.createEl('button', {
			cls: 'crc-staging-btn crc-staging-btn-promote'
		});
		setIcon(promoteAllBtn, 'arrow-up-right');
		promoteAllBtn.createSpan({ text: '全部提升' });
		promoteAllBtn.addEventListener('click', () => { void this.handlePromoteAll(stats.totalEntities); });

		// Delete all
		const deleteAllBtn = buttonRow.createEl('button', {
			cls: 'crc-staging-btn crc-staging-btn-delete'
		});
		setIcon(deleteAllBtn, 'trash-2');
		deleteAllBtn.createSpan({ text: '全部删除' });
		deleteAllBtn.addEventListener('click', () => { void this.handleDeleteAll(stats.totalEntities); });
	}

	/**
	 * Handle check duplicates action
	 */
	private handleCheckDuplicates(subfolderPath?: string): void {
		// Initialize cross-import service if needed
		if (!this.crossImportService) {
			const folderFilter = new FolderFilterService(this.plugin.settings);
			this.crossImportService = new CrossImportDetectionService(
				this.app,
				this.plugin.settings,
				folderFilter,
				this.stagingService
			);
		}

		// Find matches
		const matches = this.crossImportService.findCrossImportMatches(subfolderPath);

		if (matches.length === 0) {
			new Notice('未发现重复项。所有暂存数据看起来都是唯一的。');
			return;
		}

		// TODO: Open CrossImportReviewModal when implemented
		new Notice(`发现 ${matches.length} 个潜在重复项。审查弹窗即将推出。`);
	}

	/**
	 * Handle promote subfolder action
	 */
	private async handlePromoteSubfolder(subfolder: StagingSubfolderInfo): Promise<void> {
		const totalEntities = this.getTotalEntities(subfolder.entityCounts);
		const confirmed = await this.confirmAction(
			'提升暂存数据',
			`这会将 ${totalEntities} 个实体从"${subfolder.name}"移动到主文件夹。是否继续？`
		);

		if (!confirmed) return;

		// Build shouldSkip callback from resolutions
		const shouldSkip = this.crossImportService
			? (_file: import('obsidian').TFile, crId: string | undefined) => {
				if (!crId || !this.crossImportService) return false;
				const resolutions = this.crossImportService.getResolutions();
				return resolutions.some(r => r.stagingCrId === crId && r.resolution === 'same');
			}
			: undefined;

		const result = await this.stagingService.promoteSubfolder(subfolder.path, { shouldSkip });

		if (result.success) {
			let message = `已将 ${result.filesPromoted} 个实体提升到主树`;
			if (result.filesSkipped > 0) {
				message += `（${result.filesSkipped} 个因重复而跳过）`;
			}
			if (result.filesRenamed > 0) {
				message += `（${result.filesRenamed} 个因避免冲突而重命名）`;
			}
			new Notice(message);
		} else {
			new Notice(`提升失败：${result.errors.join(', ')}`);
		}

		// Refresh UI
		this.renderContent();
	}

	/**
	 * Handle promote all action
	 */
	private async handlePromoteAll(totalEntities: number): Promise<void> {
		const confirmed = await this.confirmAction(
			'提升所有暂存数据',
			`这会将 ${totalEntities} 个实体从暂存移动到主文件夹。标记为"同一实体"的文件将被跳过。是否继续？`
		);

		if (!confirmed) return;

		// Build shouldSkip callback from resolutions
		const shouldSkip = this.crossImportService
			? (_file: import('obsidian').TFile, crId: string | undefined) => {
				if (!crId || !this.crossImportService) return false;
				const resolutions = this.crossImportService.getResolutions();
				return resolutions.some(r => r.stagingCrId === crId && r.resolution === 'same');
			}
			: undefined;

		const result = await this.stagingService.promoteAll({ shouldSkip });

		if (result.success) {
			let message = `已将 ${result.filesPromoted} 个实体提升到主树`;
			if (result.filesSkipped > 0) {
				message += `（${result.filesSkipped} 个因重复而跳过）`;
			}
			if (result.filesRenamed > 0) {
				message += `（${result.filesRenamed} 个因避免冲突而重命名）`;
			}
			new Notice(message);
		} else {
			new Notice(`提升失败：${result.errors.join(', ')}`);
		}

		// Refresh UI
		this.renderContent();
	}

	/**
	 * Handle delete subfolder action
	 */
	private async handleDeleteSubfolder(subfolder: StagingSubfolderInfo): Promise<void> {
		const totalEntities = this.getTotalEntities(subfolder.entityCounts);
		const confirmed = await this.confirmAction(
			'删除暂存数据',
			`这将永久删除"${subfolder.name}"中的 ${totalEntities} 个实体。此操作无法撤销。是否继续？`
		);

		if (!confirmed) return;

		const result = await this.stagingService.deleteSubfolder(subfolder.path);

		if (result.success) {
			new Notice(`已从暂存删除 ${result.filesDeleted} 个文件`);
		} else {
			new Notice(`删除失败：${result.error}`);
		}

		// Refresh UI
		this.renderContent();
	}

	/**
	 * Handle delete all action
	 */
	private async handleDeleteAll(totalEntities: number): Promise<void> {
		const confirmed = await this.confirmAction(
			'删除所有暂存数据',
			`这将永久删除暂存中的 ${totalEntities} 个实体。此操作无法撤销。是否继续？`
		);

		if (!confirmed) return;

		const result = await this.stagingService.deleteAllStaging();

		if (result.success) {
			new Notice(`已从暂存删除 ${result.filesDeleted} 个文件`);
		} else {
			new Notice(`删除失败：${result.error}`);
		}

		// Refresh UI
		this.renderContent();
	}

	/**
	 * Show confirmation dialog
	 */
	private confirmAction(title: string, message: string): Promise<boolean> {
		return new Promise((resolve) => {
			const modal = new ConfirmationModal(this.app, title, message, resolve);
			modal.open();
		});
	}

	/**
	 * Format entity counts for display
	 */
	private formatEntityCounts(counts: EntityTypeCounts): string {
		const parts: string[] = [];

		if (counts.person > 0) parts.push(`${counts.person} 人物`);
		if (counts.place > 0) parts.push(`${counts.place} 地点`);
		if (counts.source > 0) parts.push(`${counts.source} 来源`);
		if (counts.event > 0) parts.push(`${counts.event} 事件`);
		if (counts.organization > 0) parts.push(`${counts.organization} 组织`);
		if (counts.other > 0) parts.push(`其他 ${counts.other}`);

		return parts.length > 0 ? parts.join(', ') : '空';
	}

	/**
	 * Get total entity count
	 */
	private getTotalEntities(counts: EntityTypeCounts): number {
		return counts.person + counts.place + counts.source +
			counts.event + counts.organization + counts.other;
	}

	/**
	 * Format a date for display
	 */
	private formatDate(date: Date): string {
		return date.toLocaleDateString(undefined, {
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		});
	}
}

/**
 * Simple confirmation modal
 */
class ConfirmationModal extends Modal {
	private titleText: string;
	private message: string;
	private onResult: (confirmed: boolean) => void;

	constructor(app: App, title: string, message: string, onResult: (confirmed: boolean) => void) {
		super(app);
		this.titleText = title;
		this.message = message;
		this.onResult = onResult;
	}

	onOpen(): void {
		const { contentEl, titleEl } = this;
		titleEl.setText(this.titleText);

		contentEl.createEl('p', { text: this.message });

		const buttonContainer = contentEl.createDiv({ cls: 'crc-confirmation-buttons' });

		const cancelBtn = buttonContainer.createEl('button', {
			text: '取消',
			cls: 'crc-btn-secondary'
		});
		cancelBtn.addEventListener('click', () => {
			this.onResult(false);
			this.close();
		});

		const confirmBtn = buttonContainer.createEl('button', {
			text: '继续',
			cls: 'mod-warning'
		});
		confirmBtn.addEventListener('click', () => {
			this.onResult(true);
			this.close();
		});
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

/* eslint-enable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call -- Match scope of file-level disable at top. */
