/**
 * Private Fields Warning Modal
 *
 * Shows a confirmation dialog when export would include fields marked as private.
 * Users can choose to include, exclude, or cancel the export.
 */

import { App, Modal } from 'obsidian';
import { createLucideIcon } from './lucide-icons';
import type { PrivateFieldSummary } from '../core/privacy-service';

/**
 * User decision for handling private fields in export
 */
export type PrivateFieldsDecision = 'include' | 'exclude' | 'cancel';

/**
 * Modal to warn users about private fields in export data
 */
export class PrivateFieldsWarningModal extends Modal {
	private summary: PrivateFieldSummary[];
	private resolvePromise: ((decision: PrivateFieldsDecision) => void) | null = null;

	constructor(app: App, summary: PrivateFieldSummary[]) {
		super(app);
		this.summary = summary;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('cr-private-fields-warning-modal');

		// Header with warning icon
		const header = contentEl.createDiv({ cls: 'cr-private-fields-warning__header' });
		const iconContainer = header.createDiv({ cls: 'cr-private-fields-warning__icon' });
		const warningIcon = createLucideIcon('alert-triangle', 32);
		warningIcon.addClass('cr-icon--warning');
		iconContainer.appendChild(warningIcon);

		header.createEl('h2', {
			text: '导出内容包含私密字段',
			cls: 'cr-private-fields-warning__title'
		});

		// Description
		contentEl.createEl('p', {
			text: '以下字段被标记为私密，将包含在本次导出中：',
			cls: 'cr-private-fields-warning__description'
		});

		// List of private fields with counts
		const listContainer = contentEl.createDiv({ cls: 'cr-private-fields-warning__list' });
		for (const item of this.summary) {
			const row = listContainer.createDiv({ cls: 'cr-private-fields-warning__item' });

			const fieldIcon = createLucideIcon('lock', 16);
			row.appendChild(fieldIcon);

			row.createEl('span', {
				text: item.fieldName,
				cls: 'cr-private-fields-warning__field-name'
			});

			row.createEl('span', {
				text: `（${item.peopleCount} 位人物）`,
				cls: 'cr-private-fields-warning__count'
			});
		}

		// Information note
		const infoNote = contentEl.createDiv({ cls: 'cr-private-fields-warning__note' });
		const infoIcon = createLucideIcon('info', 16);
		infoNote.appendChild(infoIcon);
		infoNote.createEl('span', {
			text: '私密字段可能包含敏感信息，如曾用名、医疗记录或个人详情。'
		});

		// Button container
		const buttonContainer = contentEl.createDiv({ cls: 'cr-private-fields-warning__buttons' });

		// Include button (primary warning)
		const includeBtn = buttonContainer.createEl('button', {
			text: '包含私密字段',
			cls: 'mod-warning'
		});
		includeBtn.addEventListener('click', () => {
			this.resolve('include');
		});

		// Exclude button (primary safe)
		const excludeBtn = buttonContainer.createEl('button', {
			text: '排除私密字段',
			cls: 'mod-cta'
		});
		excludeBtn.addEventListener('click', () => {
			this.resolve('exclude');
		});

		// Cancel button
		const cancelBtn = buttonContainer.createEl('button', {
			text: '取消导出'
		});
		cancelBtn.addEventListener('click', () => {
			this.resolve('cancel');
		});

		// Focus the safe option
		excludeBtn.focus();
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();

		// If modal was closed without explicit decision, treat as cancel
		if (this.resolvePromise) {
			this.resolvePromise('cancel');
			this.resolvePromise = null;
		}
	}

	/**
	 * Show the modal and wait for user decision
	 */
	async waitForDecision(): Promise<PrivateFieldsDecision> {
		return new Promise((resolve) => {
			this.resolvePromise = resolve;
			this.open();
		});
	}

	/**
	 * Resolve with a decision and close
	 */
	private resolve(decision: PrivateFieldsDecision): void {
		if (this.resolvePromise) {
			this.resolvePromise(decision);
			this.resolvePromise = null;
		}
		this.close();
	}
}
