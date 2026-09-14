/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access -- Obsidian API returns any-typed surfaces (frontmatter, file caches, plugin state); project policy accepts these. */
import { App, ButtonComponent, Modal, TFile } from 'obsidian';
import CanvasRootsPlugin from '../../main';

/**
 * Modal for selecting canvas regeneration options
 */
export class RegenerateOptionsModal extends Modal {
	plugin: CanvasRootsPlugin;
	canvasFile: TFile;
	private directionSelect?: HTMLSelectElement;

	constructor(app: App, plugin: CanvasRootsPlugin, canvasFile: TFile) {
		super(app);
		this.plugin = plugin;
		this.canvasFile = canvasFile;
	}

	async onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		// Add modal class for styling
		this.modalEl.addClass('crc-regenerate-options-modal');

		// Title
		contentEl.createEl('h2', {
			text: '重新生成画布',
			cls: 'crc-modal-title'
		});

		// Try to read canvas metadata to show original settings
		let originalSettings: string | null = null;
		try {
			const canvasContent = await this.app.vault.read(this.canvasFile);
			const canvasData = JSON.parse(canvasContent);
			const metadata = canvasData.metadata?.frontmatter;

			if ((metadata?.plugin === 'charted-roots' || metadata?.plugin === 'canvas-roots') && metadata.generation) {
				const gen = metadata.generation;
				originalSettings = `原先生成为「${gen.treeType}」树，根人物为 ${gen.rootPersonName}，` +
					`方向为：${gen.direction}`;
			}
		} catch {
			// Ignore errors - we'll just not show original settings
		}

		// Description
		if (originalSettings) {
			contentEl.createEl('p', {
				text: originalSettings,
				cls: 'crc-text-muted'
			});
			contentEl.createEl('p', {
				text: '选择新的布局方向（其他设置将被保留）：',
				cls: 'crc-text-muted'
			});
		} else {
			contentEl.createEl('p', {
				text: '选择此家谱画布的布局方向。',
				cls: 'crc-text-muted'
			});
		}

		// Direction selection
		const directionGroup = contentEl.createDiv({ cls: 'crc-form-group' });
		directionGroup.createEl('label', {
			cls: 'crc-form-label',
			text: '树方向'
		});

		this.directionSelect = directionGroup.createEl('select', {
			cls: 'crc-form-input'
		});

		[
			{ value: 'vertical', label: '垂直（从上到下）' },
			{ value: 'horizontal', label: '水平（从左到右）' }
		].forEach(option => {
			this.directionSelect!.createEl('option', {
				value: option.value,
				text: option.label
			});
		});

		// Set default to vertical
		this.directionSelect.value = 'vertical';

		// Buttons
		const buttonContainer = contentEl.createDiv({ cls: 'crc-modal-buttons' });

		new ButtonComponent(buttonContainer)
			.setButtonText('取消')
			.onClick(() => {
				this.close();
			});

		new ButtonComponent(buttonContainer)
			.setButtonText('重新生成')
			.setCta()
			.onClick(() => {
				void (async () => {
					const direction = this.directionSelect!.value as 'vertical' | 'horizontal';
					this.close();
					// Call the plugin's regenerate method with the selected direction
					await this.plugin.regenerateCanvas(this.canvasFile, direction);
				})();
			});
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

/* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access -- Match scope of file-level disable at top. */
