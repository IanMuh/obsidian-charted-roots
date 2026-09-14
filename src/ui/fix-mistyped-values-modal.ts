/**
 * Fix mistyped property values (#758).
 *
 * Scans all Charted Roots entity notes for text/identity fields (`cr_type`,
 * `event_type`, `place_category`, `org_type`, `source_type`) whose stored value
 * isn't text — e.g. `event_type: 1850`, which YAML parses as a number and which
 * can break type-matching downstream (it stopped the whole map refresh in #746).
 * Reports each note + property + value and offers a one-click coerce-to-text.
 */

import { App, Modal, Notice, TFile } from 'obsidian';
import { createLucideIcon } from './lucide-icons';
import { findMistypedTypeFields, coerceTypeValueToText, MistypedTypeField } from './data-quality-type-checks';

interface FileWithMistypedValues {
	file: TFile;
	fields: MistypedTypeField[];
}

export interface FixMistypedValuesModalOptions {
	/** Called after a fix run, with the number of notes modified. */
	onComplete?: (modified: number) => void;
}

export class FixMistypedValuesModal extends Modal {
	private options: FixMistypedValuesModalOptions;
	private results: FileWithMistypedValues[] | null = null;
	private isScanning = false;
	private isApplying = false;

	private scanButton: HTMLButtonElement | null = null;
	private applyButton: HTMLButtonElement | null = null;
	private resultsContainer: HTMLElement | null = null;
	private progressContainer: HTMLElement | null = null;

	constructor(app: App, options: FixMistypedValuesModalOptions = {}) {
		super(app);
		this.options = options;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		this.modalEl.addClass('cr-fix-mistyped-modal');

		// Header
		const header = contentEl.createDiv({ cls: 'crc-modal-header' });
		const titleContainer = header.createDiv({ cls: 'crc-modal-title' });
		titleContainer.appendChild(createLucideIcon('wand', 24));
		titleContainer.appendText('修复类型错误的属性值');

		// Description
		const description = contentEl.createDiv({ cls: 'crc-modal-description' });
		description.createEl('p', {
			text: '扫描值被存储为数字或日期而非文本的类型字段（type、category 等）。' +
				'像 "event_type: 1850" 这样的异常值会破坏基于类型匹配的功能，因此此处会将其转换回文本。'
		});

		// Scan button
		const scanContainer = contentEl.createDiv({ cls: 'cr-fix-mistyped-scan' });
		this.scanButton = scanContainer.createEl('button', { text: '扫描类型错误的值', cls: 'mod-cta' });
		this.scanButton.addEventListener('click', () => this.runScan());

		// Progress (hidden until applying)
		this.progressContainer = contentEl.createDiv({ cls: 'cr-fix-mistyped-progress crc-hidden' });

		// Results
		this.resultsContainer = contentEl.createDiv({ cls: 'cr-fix-mistyped-results' });

		// Backup warning
		const warning = contentEl.createDiv({ cls: 'crc-warning-callout' });
		warning.appendChild(createLucideIcon('alert-triangle', 16));
		warning.createSpan({ text: ' 继续操作前请先备份你的库。此操作会修改现有笔记。' });

		// Footer
		const footer = contentEl.createDiv({ cls: 'crc-modal-footer' });
		this.applyButton = footer.createEl('button', { text: '全部修复', cls: 'mod-cta' });
		this.applyButton.disabled = true;
		this.applyButton.addEventListener('click', () => void this.applyFix());
		footer.createEl('button', { text: '关闭' }).addEventListener('click', () => this.close());
	}

	onClose(): void {
		this.contentEl.empty();
	}

	/** Scan all notes carrying a cr_type for mistyped type/identity values. */
	private runScan(): void {
		if (this.isScanning) return;
		this.isScanning = true;

		const results: FileWithMistypedValues[] = [];
		for (const file of this.app.vault.getMarkdownFiles()) {
			const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
			if (!fm || typeof fm.cr_type === 'undefined') continue;
			const fields = findMistypedTypeFields(fm as Record<string, unknown>);
			if (fields.length > 0) {
				results.push({ file, fields });
			}
		}

		this.results = results;
		this.isScanning = false;
		this.renderResults();
	}

	private renderResults(): void {
		const container = this.resultsContainer;
		if (!container) return;
		container.empty();

		const results = this.results ?? [];
		if (results.length === 0) {
			container.createEl('p', {
				cls: 'crc-text-muted',
				text: '未找到类型错误的值。你的类型字段均以文本形式读取。'
			});
			if (this.applyButton) this.applyButton.disabled = true;
			return;
		}

		const count = results.reduce((sum, r) => sum + r.fields.length, 0);
		container.createEl('p', {
			text: `在 ${results.length} 条笔记中发现 ${count} 个类型错误的值：`
		});

		const list = container.createEl('ul', { cls: 'cr-fix-mistyped-list' });
		for (const { file, fields } of results) {
			const item = list.createEl('li');
			item.createEl('strong', { text: file.basename });
			for (const f of fields) {
				item.createDiv({
					cls: 'cr-fix-mistyped-detail',
					text: `${f.property}：${f.coerced}（当前为${typeof f.value === 'object' ? '日期' : typeof f.value}）`
				});
			}
		}

		if (this.applyButton) this.applyButton.disabled = this.isApplying;
	}

	/** Coerce each flagged value to text via processFrontMatter. */
	private async applyFix(): Promise<void> {
		if (this.isApplying || !this.results || this.results.length === 0) return;
		this.isApplying = true;
		if (this.scanButton) this.scanButton.disabled = true;
		if (this.applyButton) this.applyButton.disabled = true;

		const total = this.results.length;
		let modified = 0;
		let errors = 0;

		if (this.progressContainer) {
			this.progressContainer.removeClass('crc-hidden');
			this.progressContainer.empty();
		}

		for (const { file, fields } of this.results) {
			if (this.progressContainer) {
				this.progressContainer.empty();
				this.progressContainer.createEl('p', { text: `正在修复第 ${modified + 1} / ${total} 条…` });
			}
			try {
				await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
					for (const f of fields) {
						const current = (frontmatter as Record<string, unknown>)[f.property];
						if (current === undefined || current === null) continue;
						if (typeof current === 'string') continue;
						if (Array.isArray(current)) continue;
						(frontmatter as Record<string, unknown>)[f.property] = coerceTypeValueToText(current);
					}
				});
				modified++;
			} catch (error) {
				console.error(`Error fixing ${file.path}:`, error);
				errors++;
			}
		}

		if (errors === 0) {
			new Notice(`已修复 ${modified} 条笔记中的类型错误的值。`);
		} else {
			new Notice(`已修复 ${modified} 条笔记，出现 ${errors} 个错误。详情请查看控制台。`);
		}

		this.options.onComplete?.(modified);

		this.isApplying = false;
		if (this.scanButton) this.scanButton.disabled = false;
		if (this.progressContainer) this.progressContainer.addClass('crc-hidden');

		// Re-scan so the list reflects the now-clean state.
		this.runScan();
	}
}
