import { App, ButtonComponent, Modal } from 'obsidian';
import { ValidationResult } from '../core/relationship-validator';
import { createLucideIcon } from './lucide-icons';

/**
 * Modal to display relationship validation results
 */
export class ValidationResultsModal extends Modal {
	private result: ValidationResult;

	constructor(app: App, result: ValidationResult) {
		super(app);
		this.result = result;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		// Add modal class
		this.modalEl.addClass('cr-validation-results-modal');

		// Title
		contentEl.createEl('h2', {
			text: `验证：${this.result.personName}`,
			cls: 'crc-modal-title'
		});

		// Summary
		const summary = contentEl.createDiv({ cls: 'cr-validation-summary' });

		if (this.result.isValid) {
			const successIcon = createLucideIcon('check', 20);
			successIcon.addClass('cr-icon--success');
			summary.appendChild(successIcon);
			summary.createEl('span', {
				text: ' 未发现问题',
				cls: 'cr-validation-summary__text'
			});
			summary.addClass('cr-text--success');
		} else {
			const errorIcon = createLucideIcon('alert-circle', 20);
			errorIcon.addClass('cr-icon--error');
			summary.appendChild(errorIcon);
			summary.createEl('span', {
				text: ` 发现 ${this.result.issues.length} 个问题`,
				cls: 'cr-validation-summary__text'
			});
			summary.addClass('cr-text--error');
		}

		// Issues list
		if (this.result.issues.length > 0) {
			const issuesList = contentEl.createDiv({ cls: 'cr-validation-issues' });

			this.result.issues.forEach((issue, index) => {
				const issueItem = issuesList.createDiv({ cls: 'cr-validation-issue' });

				// Issue icon and number
				const issueHeader = issueItem.createDiv({ cls: 'cr-validation-issue__header' });
				const warningIcon = createLucideIcon('alert-triangle', 16);
				warningIcon.addClass('cr-icon--warning');
				issueHeader.appendChild(warningIcon);
				issueHeader.createEl('span', {
					text: ` 问题 ${index + 1}`,
					cls: 'cr-validation-issue__number'
				});

				// Issue details
				const issueBody = issueItem.createDiv({ cls: 'cr-validation-issue__body' });

				issueBody.createEl('div', {
					text: issue.message,
					cls: 'cr-validation-issue__message'
				});

				issueBody.createEl('div', {
					text: `字段：${issue.field}`,
					cls: 'cr-validation-issue__field'
				});

				if (issue.referencedCrId) {
					issueBody.createEl('div', {
						text: `引用的 cr_id：${issue.referencedCrId}`,
						cls: 'cr-validation-issue__ref'
					});
				}

				// Issue type badge
				issueBody.createEl('span', {
					text: this.getIssueTypeLabel(issue.type),
					cls: 'cr-validation-issue__type-badge'
				});
			});
		}

		// Close button
		const buttonContainer = contentEl.createDiv({ cls: 'cr-modal-buttons' });
		new ButtonComponent(buttonContainer)
			.setButtonText('关闭')
			.setCta()
			.onClick(() => {
				this.close();
			});
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}

	/**
	 * Get human-readable label for issue type
	 */
	private getIssueTypeLabel(type: string): string {
		const labels: Record<string, string> = {
			'broken-father-ref': '损坏的父亲引用',
			'broken-mother-ref': '损坏的母亲引用',
			'broken-spouse-ref': '损坏的配偶引用',
			'broken-child-ref': '损坏的子女引用',
			'missing-bidirectional-parent': '缺少双向关系（父母）',
			'missing-bidirectional-spouse': '缺少双向关系（配偶）',
			'missing-bidirectional-child': '缺少双向关系（子女）'
		};
		return labels[type] || type;
	}
}
