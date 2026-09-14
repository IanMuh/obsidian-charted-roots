/**
 * Privacy Notice Modal
 *
 * Shows a first-run notice when living persons are detected after import.
 * Helps users discover privacy protection features.
 */

import { App, Modal } from 'obsidian';
import { createLucideIcon, type LucideIconName } from './lucide-icons';

/**
 * User decision from the privacy notice
 */
export type PrivacyNoticeDecision = 'configure' | 'later' | 'dismiss';

/**
 * Modal to inform users about privacy protection features
 */
export class PrivacyNoticeModal extends Modal {
	private livingCount: number;
	private resolvePromise: ((decision: PrivacyNoticeDecision) => void) | null = null;

	constructor(app: App, livingCount: number) {
		super(app);
		this.livingCount = livingCount;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('cr-privacy-notice-modal');

		// Header with info icon
		const header = contentEl.createDiv({ cls: 'cr-privacy-notice__header' });
		const iconContainer = header.createDiv({ cls: 'cr-privacy-notice__icon' });
		const infoIcon = createLucideIcon('shield-check', 32);
		infoIcon.addClass('cr-icon--info');
		iconContainer.appendChild(infoIcon);

		header.createEl('h2', {
			text: '隐私保护可用',
			cls: 'cr-privacy-notice__title'
		});

		// Description
		const description = contentEl.createDiv({ cls: 'cr-privacy-notice__description' });
		description.createEl('p', {
			text: `Charted Roots 检测到 ${this.livingCount} 位可能健在的人物。`
		});
		description.createEl('p', {
			text: '隐私保护可在导出时隐藏或匿名化健在人物，以保护其个人信息。'
		});

		// Features list
		const featuresList = contentEl.createDiv({ cls: 'cr-privacy-notice__features' });
		const features: Array<{ icon: LucideIconName; text: string }> = [
			{ icon: 'eye-off', text: '从导出中排除或遮盖健在人物' },
			{ icon: 'lock', text: '将敏感字段标记为私密' },
			{ icon: 'user', text: '按人物覆盖健在状态' }
		];

		for (const feature of features) {
			const featureRow = featuresList.createDiv({ cls: 'cr-privacy-notice__feature' });
			const featureIcon = createLucideIcon(feature.icon, 16);
			featureRow.appendChild(featureIcon);
			featureRow.createEl('span', { text: feature.text });
		}

		// Button container
		const buttonContainer = contentEl.createDiv({ cls: 'cr-privacy-notice__buttons' });

		// Configure button (primary)
		const configureBtn = buttonContainer.createEl('button', {
			text: '配置隐私设置',
			cls: 'mod-cta'
		});
		configureBtn.addEventListener('click', () => {
			this.resolve('configure');
		});

		// Later button
		const laterBtn = buttonContainer.createEl('button', {
			text: '稍后提醒'
		});
		laterBtn.addEventListener('click', () => {
			this.resolve('later');
		});

		// Dismiss button
		const dismissBtn = buttonContainer.createEl('button', {
			text: '不再显示',
			cls: 'mod-muted'
		});
		dismissBtn.addEventListener('click', () => {
			this.resolve('dismiss');
		});

		// Focus the primary action
		configureBtn.focus();
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();

		// If modal was closed without explicit decision, treat as "later"
		if (this.resolvePromise) {
			this.resolvePromise('later');
			this.resolvePromise = null;
		}
	}

	/**
	 * Show the modal and wait for user decision
	 */
	async waitForDecision(): Promise<PrivacyNoticeDecision> {
		return new Promise((resolve) => {
			this.resolvePromise = resolve;
			this.open();
		});
	}

	/**
	 * Resolve with a decision and close
	 */
	private resolve(decision: PrivacyNoticeDecision): void {
		if (this.resolvePromise) {
			this.resolvePromise(decision);
			this.resolvePromise = null;
		}
		this.close();
	}
}