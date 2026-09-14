/**
 * Merge Wizard Modal
 *
 * Provides a UI for merging two duplicate person records with
 * field-by-field conflict resolution.
 */

import { App, Modal, Notice, TFile } from 'obsidian';
import {
	MergeService,
	MergeFieldChoice,
	FieldDifference,
	PersonFrontmatter
} from '../core/merge-service';
import type { CanvasRootsSettings } from '../settings';
import { getLogger } from '../core/logging';
import { getSpouseLabel } from '../utils/terminology';

const logger = getLogger('MergeWizard');

/**
 * Modal for merging two person records
 */
export class MergeWizardModal extends Modal {
	private mergeService: MergeService;
	private differences: FieldDifference[];
	private choices: Map<string, 'main' | 'staging' | 'both'>;
	private onMergeComplete?: () => void;

	constructor(
		app: App,
		private settings: CanvasRootsSettings,
		private stagingFile: TFile,
		private mainFile: TFile,
		onMergeComplete?: () => void
	) {
		super(app);
		this.mergeService = new MergeService(app, settings);
		this.differences = this.mergeService.getFieldDifferences(stagingFile, mainFile);
		this.choices = new Map();
		this.onMergeComplete = onMergeComplete;

		// Initialize choices - default to 'main' for all fields
		for (const diff of this.differences) {
			this.choices.set(diff.field, 'main');
		}
	}

	onOpen(): void {
		const { contentEl, titleEl } = this;
		titleEl.setText('合并记录');
		contentEl.addClass('cr-merge-wizard');

		this.renderContent();
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private renderContent(): void {
		const { contentEl } = this;
		contentEl.empty();

		// Header info
		const headerEl = contentEl.createDiv({ cls: 'cr-merge-header' });
		headerEl.createEl('p', {
			text: `正在将暂存数据合并到主树记录中。`,
			cls: 'cr-merge-header__desc'
		});

		const filesEl = headerEl.createDiv({ cls: 'cr-merge-files' });
		filesEl.createDiv({
			text: `暂存：${this.stagingFile.basename}`,
			cls: 'cr-merge-files__staging'
		});
		filesEl.createDiv({
			text: `主记录：${this.mainFile.basename}`,
			cls: 'cr-merge-files__main'
		});

		// Field comparison table
		const tableEl = contentEl.createDiv({ cls: 'cr-merge-table' });

		// Table header
		const headerRow = tableEl.createDiv({ cls: 'cr-merge-row cr-merge-row--header' });
		headerRow.createDiv({ text: '字段', cls: 'cr-merge-cell cr-merge-cell--field' });
		headerRow.createDiv({ text: '暂存', cls: 'cr-merge-cell cr-merge-cell--staging' });
		headerRow.createDiv({ text: '主记录', cls: 'cr-merge-cell cr-merge-cell--main' });
		headerRow.createDiv({ text: '采用', cls: 'cr-merge-cell cr-merge-cell--choice' });

		// Field rows
		for (const diff of this.differences) {
			this.renderFieldRow(tableEl, diff);
		}

		// Info section
		const infoEl = contentEl.createDiv({ cls: 'cr-merge-info' });
		infoEl.createEl('p', {
			text: '合并后：',
			cls: 'cr-merge-info__title'
		});
		const infoList = infoEl.createEl('ul', { cls: 'cr-merge-info__list' });
		infoList.createEl('li', { text: '暂存文件将被删除' });
		infoList.createEl('li', { text: '主文件将用合并后的数据更新' });
		infoList.createEl('li', { text: '指向暂存的关系将被更新' });

		// Action buttons
		const actionsEl = contentEl.createDiv({ cls: 'cr-merge-actions' });

		const cancelBtn = actionsEl.createEl('button', {
			text: '取消',
			cls: 'cr-merge-btn cr-merge-btn--secondary'
		});
		cancelBtn.addEventListener('click', () => this.close());

		const previewBtn = actionsEl.createEl('button', {
			text: '预览',
			cls: 'cr-merge-btn cr-merge-btn--secondary'
		});
		previewBtn.addEventListener('click', () => this.showPreview());

		const mergeBtn = actionsEl.createEl('button', {
			text: '合并',
			cls: 'cr-merge-btn mod-cta'
		});
		mergeBtn.addEventListener('click', () => void this.executeMerge());
	}

	private renderFieldRow(container: HTMLElement, diff: FieldDifference): void {
		const rowEl = container.createDiv({
			cls: `cr-merge-row ${diff.isDifferent ? 'cr-merge-row--different' : ''}`
		});

		// Field label
		rowEl.createDiv({
			text: diff.label,
			cls: 'cr-merge-cell cr-merge-cell--field'
		});

		// Staging value
		const stagingCell = rowEl.createDiv({ cls: 'cr-merge-cell cr-merge-cell--staging' });
		stagingCell.createSpan({
			text: this.formatValue(diff.stagingValue),
			cls: diff.stagingValue ? '' : 'cr-merge-empty'
		});

		// Main value
		const mainCell = rowEl.createDiv({ cls: 'cr-merge-cell cr-merge-cell--main' });
		mainCell.createSpan({
			text: this.formatValue(diff.mainValue),
			cls: diff.mainValue ? '' : 'cr-merge-empty'
		});

		// Choice dropdown
		const choiceCell = rowEl.createDiv({ cls: 'cr-merge-cell cr-merge-cell--choice' });

		if (!diff.isDifferent) {
			// No conflict - show checkmark
			choiceCell.createSpan({ text: '✓', cls: 'cr-merge-same' });
		} else {
			const select = choiceCell.createEl('select', { cls: 'cr-merge-select' });

			select.createEl('option', { value: 'main', text: '主记录' });
			select.createEl('option', { value: 'staging', text: '暂存' });

			if (diff.canCombine) {
				select.createEl('option', { value: 'both', text: '两者' });
			}

			// Set current choice
			select.value = this.choices.get(diff.field) || 'main';

			select.addEventListener('change', () => {
				this.choices.set(diff.field, select.value as 'main' | 'staging' | 'both');
			});
		}
	}

	private formatValue(value: string | string[] | undefined): string {
		if (value === undefined) {
			return '（空）';
		}
		if (Array.isArray(value)) {
			return value.join(', ');
		}
		// Clean up wikilink formatting for display
		return value.replace(/"\[\[([^\]]+)\]\]"/g, '[[$1]]');
	}

	private showPreview(): void {
		const choices = this.getChoices();
		const preview = this.mergeService.previewMerge(this.stagingFile, this.mainFile, choices);

		if (!preview) {
			new Notice('无法生成预览');
			return;
		}

		// Show preview modal
		const previewModal = new MergePreviewModal(this.app, preview, this.settings);
		previewModal.open();
	}

	private getChoices(): MergeFieldChoice[] {
		const choices: MergeFieldChoice[] = [];

		for (const diff of this.differences) {
			if (diff.isDifferent) {
				choices.push({
					field: diff.field,
					choice: this.choices.get(diff.field) || 'main'
				});
			}
		}

		return choices;
	}

	private async executeMerge(): Promise<void> {
		const choices = this.getChoices();

		try {
			const result = await this.mergeService.merge(
				this.stagingFile,
				this.mainFile,
				choices
			);

			if (result.success) {
				let message = '记录合并成功';
				if (result.relationshipsUpdated > 0) {
					message += `（已更新 ${result.relationshipsUpdated} 个关系）`;
				}
				new Notice(message);
				this.close();

				if (this.onMergeComplete) {
					this.onMergeComplete();
				}
			} else {
				new Notice(`合并失败：${result.error}`);
			}
		} catch (error) {
			const msg = error instanceof Error ? error.message : String(error);
			logger.error('merge', `Merge execution failed: ${msg}`);
			new Notice(`合并失败：${msg}`);
		}
	}
}

/**
 * Modal for previewing merged result
 */
class MergePreviewModal extends Modal {
	constructor(app: App, private preview: PersonFrontmatter, private settings: CanvasRootsSettings) {
		super(app);
	}

	onOpen(): void {
		const { contentEl, titleEl } = this;
		titleEl.setText('合并预览');
		contentEl.addClass('cr-merge-preview');

		contentEl.createEl('p', {
			text: '合并后的记录将如下所示：',
			cls: 'cr-merge-preview__desc'
		});

		const previewEl = contentEl.createDiv({ cls: 'cr-merge-preview__content' });

		// Show key fields
		const fields = [
			{ key: 'name', label: '名称' },
			{ key: 'born', label: '出生日期' },
			{ key: 'died', label: '去世日期' },
			{ key: 'birth_place', label: '出生地点' },
			{ key: 'death_place', label: '去世地点' },
			{ key: 'sex', label: '性别' },
			{ key: 'father', label: '父亲' },
			{ key: 'mother', label: '母亲' },
			{ key: 'spouse', label: `${getSpouseLabel(this.settings)}（们）` },
			{ key: 'child', label: '子女' }
		];

		for (const { key, label } of fields) {
			const value = this.preview[key];
			if (value !== undefined && value !== '') {
				const row = previewEl.createDiv({ cls: 'cr-merge-preview__row' });
				row.createSpan({ text: `${label}: `, cls: 'cr-merge-preview__label' });
				row.createSpan({
					text: this.formatValue(value),
					cls: 'cr-merge-preview__value'
				});
			}
		}

		const closeBtn = contentEl.createEl('button', {
			text: '关闭',
			cls: 'mod-cta'
		});
		closeBtn.addEventListener('click', () => this.close());
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private formatValue(value: unknown): string {
		if (Array.isArray(value)) {
			return value.join(', ');
		}
		return String(value).replace(/"\[\[([^\]]+)\]\]"/g, '[[$1]]');
	}
}
