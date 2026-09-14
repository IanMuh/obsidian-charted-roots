/**
 * Duplicate Detection Modal
 *
 * Displays potential duplicate person records and allows users
 * to review and manage them.
 */

import { App, Modal, Notice, Setting, TFile } from 'obsidian';
import {
	DuplicateDetectionService,
	DuplicateMatch,
	DuplicateDetectionOptions,
	dismissedDuplicatePairKey
} from '../core/duplicate-detection';
import { MergeWizardModal } from './merge-wizard-modal';
import { setButtonDestructive } from './button-helpers';
import type { CanvasRootsSettings } from '../settings';
import type CanvasRootsPlugin from '../../main';
import { getLogger } from '../core/logging';

const logger = getLogger('DuplicateModal');

/**
 * Modal for viewing and managing duplicate detections
 */
export class DuplicateDetectionModal extends Modal {
	private matches: DuplicateMatch[] = [];
	private options: DuplicateDetectionOptions = {};
	private service: DuplicateDetectionService;
	private resultsContainer: HTMLElement | null = null;

	constructor(
		app: App,
		private plugin?: CanvasRootsPlugin
	) {
		super(app);
		this.service = new DuplicateDetectionService(app);
	}

	/** Settings, when the modal was opened with a plugin reference. */
	private get settings(): CanvasRootsSettings | undefined {
		return this.plugin?.settings;
	}

	onOpen(): void {
		const { contentEl, titleEl } = this;
		titleEl.setText('重复检测');
		contentEl.empty();
		contentEl.addClass('cr-duplicate-modal');

		// Options section
		this.buildOptionsSection(contentEl);

		// Results container (will be populated after scan)
		this.resultsContainer = contentEl.createDiv({ cls: 'cr-duplicate-results' });

		// Initial empty state
		this.showEmptyState();
	}

	onClose(): void {
		this.contentEl.empty();
	}

	/**
	 * Build the options/settings section
	 */
	private buildOptionsSection(container: HTMLElement): void {
		const optionsSection = container.createDiv({ cls: 'cr-duplicate-options' });

		// Minimum confidence threshold
		new Setting(optionsSection)
			.setName('最低置信度')
			.setDesc('仅显示高于此置信度的匹配（0-100）')
			.addSlider(slider => slider
				.setLimits(40, 90, 5)
				.setValue(60)
				.onChange(value => {
					this.options.minConfidence = value;
				})
			);

		// Minimum name similarity
		new Setting(optionsSection)
			.setName('最低姓名相似度')
			.setDesc('要求的姓名匹配百分比（0-100）')
			.addSlider(slider => slider
				.setLimits(50, 95, 5)
				.setValue(70)
				.onChange(value => {
					this.options.minNameSimilarity = value;
				})
			);

		// Max year difference
		new Setting(optionsSection)
			.setName('最大年份差')
			.setDesc('日期相差多少年以内仍视为匹配')
			.addSlider(slider => slider
				.setLimits(1, 20, 1)
				.setValue(5)
				.onChange(value => {
					this.options.maxYearDifference = value;
				})
			);

		// Same collection only toggle
		new Setting(optionsSection)
			.setName('仅限同一合集')
			.setDesc('仅比较同一合集内的人物')
			.addToggle(toggle => toggle
				.setValue(false)
				.onChange(value => {
					this.options.sameCollectionOnly = value;
				})
			);

		// Dismissed-pairs management (#633) — only shown when there are pairs the
		// user has marked "not a duplicate", so they can undo a stale dismissal.
		const dismissedCount = this.plugin?.settings.dismissedDuplicatePairs?.length ?? 0;
		if (this.plugin && dismissedCount > 0) {
			new Setting(optionsSection)
				.setName('已忽略的对')
				.setDesc(`已标记为"非重复"并已从结果中隐藏：${dismissedCount} 对。`)
				.addButton(button => setButtonDestructive(button.setButtonText('清除已忽略'))
					.onClick(async () => {
						if (!this.plugin) return;
						this.plugin.settings.dismissedDuplicatePairs = [];
						await this.plugin.saveSettings();
						button.setButtonText('已清除').setDisabled(true);
						new Notice('已清除忽略的对 — 重新扫描即可再次看到');
					})
				);
		}

		// Scan button
		const buttonContainer = optionsSection.createDiv({ cls: 'cr-duplicate-button-container' });
		const scanBtn = buttonContainer.createEl('button', {
			cls: 'mod-cta',
			text: '扫描重复项'
		});
		scanBtn.addEventListener('click', () => {
			void this.runScan();
		});
	}

	/**
	 * Show empty state before scan
	 */
	private showEmptyState(): void {
		if (!this.resultsContainer) return;
		this.resultsContainer.empty();

		const emptyState = this.resultsContainer.createDiv({ cls: 'cr-duplicate-empty' });
		emptyState.createEl('p', {
			text: '请在上方配置选项，然后点击"扫描重复项"以查找可能重复的人物记录。',
			cls: 'setting-item-description'
		});
	}

	/**
	 * Run the duplicate detection scan
	 */
	private async runScan(): Promise<void> {
		if (!this.resultsContainer) return;

		// Show loading state
		this.resultsContainer.empty();
		const loadingEl = this.resultsContainer.createDiv({ cls: 'cr-duplicate-loading' });
		loadingEl.createEl('p', { text: '正在扫描重复项…' });

		// Run detection (use setTimeout to allow UI to update)
		await new Promise(resolve => window.setTimeout(resolve, 50));

		try {
			const dismissed = new Set(this.plugin?.settings.dismissedDuplicatePairs ?? []);
			this.matches = this.service.findDuplicates(this.options)
				.filter(m => !dismissed.has(dismissedDuplicatePairKey(m.person1.crId, m.person2.crId)));
			this.displayResults();
		} catch (error) {
			logger.error('scan', 'Duplicate scan failed', error);
			this.resultsContainer.empty();
			this.resultsContainer.createEl('p', {
				text: `扫描失败：${error instanceof Error ? error.message : '未知错误'}`,
				cls: 'cr-error-text'
			});
		}
	}

	/**
	 * Display scan results
	 */
	private displayResults(): void {
		if (!this.resultsContainer) return;
		this.resultsContainer.empty();

		// Summary
		const summary = this.service.getSummary(this.matches);
		const summaryEl = this.resultsContainer.createDiv({ cls: 'cr-duplicate-summary' });

		if (this.matches.length === 0) {
			summaryEl.createEl('p', {
				text: '未发现潜在重复项。你的数据看起来很干净！',
				cls: 'cr-success-text'
			});
			return;
		}

		summaryEl.createEl('h4', { text: `发现 ${summary.totalMatches} 个潜在重复项` });

		const statsEl = summaryEl.createDiv({ cls: 'cr-duplicate-stats' });
		if (summary.highConfidence > 0) {
			statsEl.createSpan({
				text: `${summary.highConfidence} 个高置信度`,
				cls: 'cr-badge cr-badge--danger'
			});
		}
		if (summary.mediumConfidence > 0) {
			statsEl.createSpan({
				text: `${summary.mediumConfidence} 个中置信度`,
				cls: 'cr-badge cr-badge--warning'
			});
		}
		if (summary.lowConfidence > 0) {
			statsEl.createSpan({
				text: `${summary.lowConfidence} 个低置信度`,
				cls: 'cr-badge cr-badge--info'
			});
		}

		// Match list
		const listEl = this.resultsContainer.createDiv({ cls: 'cr-duplicate-list' });

		for (const match of this.matches) {
			this.renderMatchItem(listEl, match);
		}
	}

	/**
	 * Render a single match item
	 */
	private renderMatchItem(container: HTMLElement, match: DuplicateMatch): void {
		const itemEl = container.createDiv({ cls: 'cr-duplicate-item' });

		// Confidence badge
		const confidenceClass = match.confidence >= 80 ? 'cr-badge--danger' :
			match.confidence >= 60 ? 'cr-badge--warning' : 'cr-badge--info';

		const headerEl = itemEl.createDiv({ cls: 'cr-duplicate-item-header' });
		headerEl.createSpan({
			text: `置信度 ${match.confidence}%`,
			cls: `cr-badge ${confidenceClass}`
		});

		// People comparison
		const comparisonEl = itemEl.createDiv({ cls: 'cr-duplicate-comparison' });

		// Person 1
		const person1El = comparisonEl.createDiv({ cls: 'cr-duplicate-person' });
		person1El.createEl('strong', { text: match.person1.name || '未知' });
		if (match.person1.birthDate || match.person1.deathDate) {
			const datesEl = person1El.createEl('small', { cls: 'cr-text-muted' });
			const dates: string[] = [];
			if (match.person1.birthDate) dates.push(`生于 ${match.person1.birthDate}`);
			if (match.person1.deathDate) dates.push(`逝于 ${match.person1.deathDate}`);
			datesEl.textContent = ` (${dates.join(', ')})`;
		}
		const file1Btn = person1El.createEl('button', {
			cls: 'cr-btn-link',
			text: '打开笔记'
		});
		file1Btn.addEventListener('click', () => {
			void this.openPersonNote(match.person1.file);
		});

		// VS separator
		comparisonEl.createSpan({ text: '对比', cls: 'cr-duplicate-vs' });

		// Person 2
		const person2El = comparisonEl.createDiv({ cls: 'cr-duplicate-person' });
		person2El.createEl('strong', { text: match.person2.name || '未知' });
		if (match.person2.birthDate || match.person2.deathDate) {
			const datesEl = person2El.createEl('small', { cls: 'cr-text-muted' });
			const dates: string[] = [];
			if (match.person2.birthDate) dates.push(`生于 ${match.person2.birthDate}`);
			if (match.person2.deathDate) dates.push(`逝于 ${match.person2.deathDate}`);
			datesEl.textContent = ` (${dates.join(', ')})`;
		}
		const file2Btn = person2El.createEl('button', {
			cls: 'cr-btn-link',
			text: '打开笔记'
		});
		file2Btn.addEventListener('click', () => {
			void this.openPersonNote(match.person2.file);
		});

		// Match details
		const detailsEl = itemEl.createDiv({ cls: 'cr-duplicate-details' });
		detailsEl.createEl('small', {
			text: `姓名相似度：${match.nameSimilarity}% | 日期接近度：${match.dateProximity}%`,
			cls: 'cr-text-muted'
		});

		// Reasons
		if (match.reasons.length > 0) {
			const reasonsEl = itemEl.createDiv({ cls: 'cr-duplicate-reasons' });
			reasonsEl.createEl('small', {
				text: match.reasons.join(' • '),
				cls: 'cr-text-muted'
			});
		}

		// Actions
		const actionsEl = itemEl.createDiv({ cls: 'cr-duplicate-actions' });

		// Merge button (only if settings available)
		if (this.settings) {
			const mergeBtn = actionsEl.createEl('button', {
				cls: 'mod-cta',
				text: '合并'
			});
			mergeBtn.addEventListener('click', () => {
				this.openMergeWizard(match, itemEl);
			});
		}

		const dismissBtn = actionsEl.createEl('button', {
			cls: 'cr-btn-secondary',
			text: '非重复'
		});
		dismissBtn.addEventListener('click', () => {
			void this.dismissMatch(match, itemEl);
		});
	}

	/**
	 * Mark a pair as "not a duplicate". Removes it from the current view and,
	 * when a plugin reference is available, persists the pair so it stays
	 * dismissed across sessions and future rescans (#633).
	 */
	private async dismissMatch(match: DuplicateMatch, itemEl: HTMLElement): Promise<void> {
		itemEl.remove();
		this.matches = this.matches.filter(m => m !== match);

		if (this.plugin) {
			const key = dismissedDuplicatePairKey(match.person1.crId, match.person2.crId);
			const dismissed = this.plugin.settings.dismissedDuplicatePairs ?? [];
			if (!dismissed.includes(key)) {
				this.plugin.settings.dismissedDuplicatePairs = [...dismissed, key];
				await this.plugin.saveSettings();
			}
		}

		new Notice('已忽略该匹配');
	}

	/**
	 * Open a person note in the editor
	 */
	private async openPersonNote(file: TFile): Promise<void> {
		await this.app.workspace.getLeaf(false).openFile(file);
	}

	/**
	 * Open merge wizard for a duplicate match
	 */
	private openMergeWizard(match: DuplicateMatch, itemEl: HTMLElement): void {
		if (!this.settings) return;

		// Use person1 as "staging" (source to merge from) and person2 as "main" (target)
		// User can decide which is which - the UI will show both
		const mergeModal = new MergeWizardModal(
			this.app,
			this.settings,
			match.person1.file,
			match.person2.file,
			() => {
				// After merge, remove the item from the list
				itemEl.remove();
				this.matches = this.matches.filter(m => m !== match);
			}
		);
		mergeModal.open();
	}
}