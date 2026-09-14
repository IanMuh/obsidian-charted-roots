/**
 * Sort Order Result Modal
 *
 * Inspectable result after "Compute sort order" (#723). The transient toast
 * (#721) names the events in a before/after loop but they vanish and aren't
 * actionable. This modal lists the updated count, any errors, and — crucially —
 * the cycle events as clickable links so the user can jump straight to each
 * culprit and fix its "Occurs before/after".
 */

import { App, ButtonComponent, Modal } from 'obsidian';
import type { SortOrderResult } from '../services/sort-order-service';
import { createLucideIcon } from '../../ui/lucide-icons';

export class SortOrderResultModal extends Modal {
	private result: SortOrderResult;

	constructor(app: App, result: SortOrderResult) {
		super(app);
		this.result = result;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		this.modalEl.addClass('crc-sort-order-result-modal');

		// Header
		const header = contentEl.createDiv({ cls: 'crc-modal-header' });
		const titleContainer = header.createDiv({ cls: 'crc-modal-title' });
		titleContainer.appendChild(createLucideIcon('arrow-up-down', 24));
		titleContainer.appendText('计算排序顺序');

		// Summary line — updated count, or a clear "nothing to update" state.
		const summary = contentEl.createEl('p', { cls: 'crc-sort-order-result-summary' });
		if (this.result.updatedCount > 0) {
			summary.appendText(`已更新 ${this.result.updatedCount} 个事件。`);
		} else {
			summary.appendText('无需更新——所有事件均已按顺序排列。');
		}

		// Errors section (currently only ever surfaced via a toast).
		if (this.result.errors.length > 0) {
			this.renderErrors(contentEl);
		}

		// Cycle section — the reason this surface exists.
		if (this.result.cycleEventNotes.length > 0) {
			this.renderCycles(contentEl);
		} else if (this.result.errors.length === 0) {
			contentEl.createEl('p', {
				text: '未检测到循环——所有前后关系均已解决。',
				cls: 'crc-sort-order-result-clean'
			});
		}

		// The cycle links close the modal when followed; surface that the list
		// isn't lost — re-running Compute sort order brings it back (#723).
		if (this.result.cycleEventNotes.length > 0) {
			contentEl.createEl('p', {
				text: '打开笔记会关闭此对话框。重新运行"计算排序顺序"可再次显示此列表。',
				cls: 'crc-sort-order-result-hint'
			});
		}

		// Close button
		const buttonContainer = contentEl.createDiv({ cls: 'crc-modal-buttons' });
		new ButtonComponent(buttonContainer)
			.setButtonText('关闭')
			.setCta()
			.onClick(() => this.close());
	}

	private renderErrors(contentEl: HTMLElement) {
		const section = contentEl.createDiv({ cls: 'crc-sort-order-result-section' });
		section.createEl('h4', {
			text: `更新时出现 ${this.result.errors.length} 个错误`,
			cls: 'crc-sort-order-result-heading'
		});
		const list = section.createEl('ul', { cls: 'crc-sort-order-result-errors' });
		for (const error of this.result.errors) {
			list.createEl('li', { text: error });
		}
	}

	private renderCycles(contentEl: HTMLElement) {
		const count = this.result.cycleEventNotes.length;
		const section = contentEl.createDiv({ cls: 'crc-sort-order-result-section' });
		section.createEl('h4', {
			text: `${count} 个事件无法排序`,
			cls: 'crc-sort-order-result-heading'
		});
		section.createEl('p', {
			text: '这些事件构成了前后关系循环。请打开每个事件并调整其"发生于……之前/之后"以打破循环。',
			cls: 'crc-text--muted'
		});

		const list = section.createEl('ul', { cls: 'crc-sort-order-result-cycles' });
		for (const { title, file } of this.result.cycleEventNotes) {
			const item = list.createEl('li');
			const link = item.createEl('a', {
				text: title,
				cls: 'crc-sort-order-result-link',
				href: '#'
			});
			link.addEventListener('click', (evt) => {
				evt.preventDefault();
				this.close();
				void this.app.workspace.getLeaf(false).openFile(file);
			});
		}
	}

	onClose() {
		this.contentEl.empty();
	}
}
