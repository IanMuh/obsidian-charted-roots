/**
 * Universe Sync Modal
 *
 * Confirmation dialog for when a place's universe doesn't match the map's universe.
 * See docs/planning/map-place-universe-sync.md for design details.
 */

import { App, Modal, Setting } from 'obsidian';

export type UniverseSyncAction = 'add' | 'replace' | 'cancel';

export interface UniverseSyncResult {
	action: UniverseSyncAction;
}

interface UniverseSyncModalOptions {
	placeName: string;
	placeUniverses: string[];
	mapUniverse: string;
}

/**
 * Modal for confirming universe sync when place and map universes don't match
 */
export class UniverseSyncModal extends Modal {
	private options: UniverseSyncModalOptions;
	private resolvePromise: ((result: UniverseSyncResult) => void) | null = null;

	constructor(app: App, options: UniverseSyncModalOptions) {
		super(app);
		this.options = options;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('cr-universe-sync-modal');

		// Title
		contentEl.createEl('h2', { text: '宇宙不匹配' });

		// Description
		const placeUniverseText = this.options.placeUniverses.length === 1
			? `“${this.options.placeUniverses[0]}”`
			: this.options.placeUniverses.map(u => `“${u}”`).join('、');

		const descEl = contentEl.createEl('p');
		descEl.createSpan({ text: `“${this.options.placeName}” 属于宇宙 ${placeUniverseText}。` });
		descEl.createEl('br');
		descEl.createSpan({ text: `此地图属于宇宙 “${this.options.mapUniverse}”。` });

		contentEl.createEl('p', { text: '您希望如何处理？' });

		// Buttons
		const buttonContainer = contentEl.createDiv({ cls: 'cr-universe-sync-buttons' });

		new Setting(buttonContainer)
			.addButton(btn => btn
				.setButtonText('添加宇宙')
				.setCta()
				.onClick(() => {
					this.resolvePromise?.({ action: 'add' });
					this.close();
				}))
			.addButton(btn => btn
				.setButtonText('替换宇宙')
				.onClick(() => {
					this.resolvePromise?.({ action: 'replace' });
					this.close();
				}))
			.addButton(btn => btn
				.setButtonText('取消')
				.onClick(() => {
					this.resolvePromise?.({ action: 'cancel' });
					this.close();
				}));
	}

	onClose(): void {
		const { contentEl } = this;
		contentEl.empty();
		// If modal closed without selecting an action, treat as cancel
		if (this.resolvePromise) {
			this.resolvePromise({ action: 'cancel' });
			this.resolvePromise = null;
		}
	}

	/**
	 * Show the modal and return a promise that resolves with the user's choice
	 */
	async prompt(): Promise<UniverseSyncResult> {
		return new Promise((resolve) => {
			this.resolvePromise = resolve;
			this.open();
		});
	}
}
