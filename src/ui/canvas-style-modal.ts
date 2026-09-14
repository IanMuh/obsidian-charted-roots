/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument -- Obsidian API returns any-typed surfaces (frontmatter, file caches, plugin state); project policy accepts these. */
/**
 * Canvas Style Customization Modal
 *
 * Modal for customizing per-canvas style settings.
 * Reads existing style overrides from canvas metadata and allows editing.
 */

import { App, Modal, Notice, Setting, TFile } from 'obsidian';
import type CanvasRootsPlugin from '../../main';
import type { ArrowStyle, ColorScheme, CanvasColor, SpouseEdgeLabelFormat } from '../settings';
import type { StyleOverrides } from '../core/canvas-style-overrides';
import type { CanvasData } from '../core/canvas-generator';
import { getLogger } from '../core/logging';
import { getSpouseCompoundLabel } from '../utils/terminology';

const logger = getLogger('CanvasStyleModal');

export class CanvasStyleModal extends Modal {
	private plugin: CanvasRootsPlugin;
	private canvasFile: TFile;
	private currentOverrides?: StyleOverrides;

	constructor(app: App, plugin: CanvasRootsPlugin, canvasFile: TFile) {
		super(app);
		this.plugin = plugin;
		this.canvasFile = canvasFile;
	}

	async onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl('h2', { text: '自定义画布样式' });

		// Load current metadata
		try {
			const canvasContent = await this.app.vault.read(this.canvasFile);
			const canvasData: CanvasData = JSON.parse(canvasContent);
			const metadata = canvasData.metadata?.frontmatter;

			if (metadata?.plugin === 'charted-roots' || metadata?.plugin === 'canvas-roots') {
				this.currentOverrides = metadata.styleOverrides as StyleOverrides | undefined;
			}
		} catch (error: unknown) {
			logger.error('style-modal', 'Failed to read canvas metadata', error);
		}

		// Description
		contentEl.createEl('p', {
			text: '自定义此画布的样式。重新生成画布后更改将生效。',
			cls: 'setting-item-description'
		});

		// Global settings notice
		contentEl.createEl('p', {
			text: `保留默认的选项将使用当前全局设置。单独切换某项设置可仅为此画布覆盖。`,
			cls: 'setting-item-description'
		});

		// Style controls
		let nodeColorScheme: ColorScheme | undefined = this.currentOverrides?.nodeColorScheme;
		let parentChildArrowStyle: ArrowStyle | undefined = this.currentOverrides?.parentChildArrowStyle;
		let spouseArrowStyle: ArrowStyle | undefined = this.currentOverrides?.spouseArrowStyle;
		let parentChildEdgeColor: CanvasColor | undefined = this.currentOverrides?.parentChildEdgeColor;
		let spouseEdgeColor: CanvasColor | undefined = this.currentOverrides?.spouseEdgeColor;
		let showSpouseEdges: boolean | undefined = this.currentOverrides?.showSpouseEdges;
		let spouseEdgeLabelFormat: SpouseEdgeLabelFormat | undefined = this.currentOverrides?.spouseEdgeLabelFormat;

		// Node color scheme
		new Setting(contentEl)
			.setName('节点配色')
			.setDesc('人物节点的配色方案')
			.addDropdown(dropdown => {
				dropdown
					.addOption('', '（使用全局设置）')
					.addOption('sex', '性别（绿/紫）')
					.addOption('generation', '世代（渐变）')
					.addOption('collection', '合集（多色）')
					.addOption('monochrome', '单色（中性）')
					.setValue(nodeColorScheme || '')
					.onChange(value => {
						nodeColorScheme = value ? value as ColorScheme : undefined;
					});
			});

		// Parent-child arrow style
		new Setting(contentEl)
			.setName('父母子女箭头')
			.setDesc('父母子女关系的箭头样式')
			.addDropdown(dropdown => {
				dropdown
					.addOption('', '（使用全局设置）')
					.addOption('directed', '单向（→）')
					.addOption('bidirectional', '双向（↔）')
					.addOption('undirected', '无向（—）')
					.setValue(parentChildArrowStyle || '')
					.onChange(value => {
						parentChildArrowStyle = value ? value as ArrowStyle : undefined;
					});
			});

		// Spouse arrow style
		new Setting(contentEl)
			.setName(getSpouseCompoundLabel(this.plugin.settings, 'arrows'))
			.setDesc('配偶/伴侣关系的箭头样式')
			.addDropdown(dropdown => {
				dropdown
					.addOption('', '（使用全局设置）')
					.addOption('directed', '单向（→）')
					.addOption('bidirectional', '双向（↔）')
					.addOption('undirected', '无向（—）')
					.setValue(spouseArrowStyle || '')
					.onChange(value => {
						spouseArrowStyle = value ? value as ArrowStyle : undefined;
					});
			});

		// Parent-child edge color
		new Setting(contentEl)
			.setName('父母子女连线颜色')
			.setDesc('父母子女关系连线的颜色')
				.addDropdown(dropdown => {
					dropdown
						.addOption('', '（使用全局设置）')
						.addOption('none', '主题默认')
						.addOption('1', '红')
						.addOption('2', '橙')
						.addOption('3', '黄')
						.addOption('4', '绿')
						.addOption('5', '青')
						.addOption('6', '紫')
						.setValue(parentChildEdgeColor || '')
					.onChange(value => {
						parentChildEdgeColor = value ? value as CanvasColor : undefined;
					});
			});

		// Spouse edge color
		new Setting(contentEl)
			.setName(getSpouseCompoundLabel(this.plugin.settings, 'edge color'))
			.setDesc('配偶/伴侣关系连线的颜色')
				.addDropdown(dropdown => {
					dropdown
						.addOption('', '（使用全局设置）')
						.addOption('none', '主题默认')
						.addOption('1', '红')
						.addOption('2', '橙')
						.addOption('3', '黄')
						.addOption('4', '绿')
						.addOption('5', '青')
						.addOption('6', '紫')
						.setValue(spouseEdgeColor || '')
					.onChange(value => {
						spouseEdgeColor = value ? value as CanvasColor : undefined;
					});
			});

		// Show spouse edges
		new Setting(contentEl)
			.setName(`显示${getSpouseCompoundLabel(this.plugin.settings, 'edges').toLowerCase()}`)
			.setDesc('在画布上显示婚姻关系连线')
			.addDropdown(dropdown => {
				dropdown
					.addOption('', '（使用全局设置）')
					.addOption('true', '启用')
					.addOption('false', '禁用')
					.setValue(showSpouseEdges === undefined ? '' : String(showSpouseEdges))
					.onChange(value => {
						showSpouseEdges = value === '' ? undefined : value === 'true';
					});
			});

		// Spouse label format
		new Setting(contentEl)
			.setName(getSpouseCompoundLabel(this.plugin.settings, 'edge labels'))
			.setDesc('配偶/伴侣关系连线的标签格式')
			.addDropdown(dropdown => {
				dropdown
					.addOption('', '（使用全局设置）')
					.addOption('none', '无')
					.addOption('date-only', '仅日期')
					.addOption('date-location', '日期 + 地点')
					.addOption('full', '完整（日期 + 地点 + 状态）')
					.setValue(spouseEdgeLabelFormat || '')
					.onChange(value => {
						spouseEdgeLabelFormat = value ? value as SpouseEdgeLabelFormat : undefined;
					});
			});

		// Action buttons
		const buttonContainer = contentEl.createDiv({ cls: 'modal-button-container' });

		// Save button
		buttonContainer.createEl('button', {
			text: '保存样式',
			cls: 'mod-cta'
		}).addEventListener('click', () => {
			void this.saveStyleOverrides({
				nodeColorScheme,
				parentChildArrowStyle,
				spouseArrowStyle,
				parentChildEdgeColor,
				spouseEdgeColor,
				showSpouseEdges,
				spouseEdgeLabelFormat
			});
		});

		// Clear all button
		buttonContainer.createEl('button', {
			text: '清除所有覆盖'
		}).addEventListener('click', () => {
			void this.saveStyleOverrides({});
		});

		// Cancel button
		buttonContainer.createEl('button', {
			text: '取消'
		}).addEventListener('click', () => {
			this.close();
		});
	}

	private async saveStyleOverrides(overrides: StyleOverrides): Promise<void> {
		try {
			// Read current canvas data
			const canvasContent = await this.app.vault.read(this.canvasFile);
			const canvasData: CanvasData = JSON.parse(canvasContent);

			// Ensure metadata structure exists
			if (!canvasData.metadata) {
				canvasData.metadata = { version: '1.0-1.0', frontmatter: {} };
			}
			if (!canvasData.metadata.frontmatter) {
				canvasData.metadata.frontmatter = {};
			}

			// Update style overrides in metadata
			const metadata = canvasData.metadata.frontmatter;

			// If all overrides are undefined, remove styleOverrides entirely
			const hasOverrides = Object.values(overrides).some(value => value !== undefined);
			if (hasOverrides) {
				metadata.styleOverrides = overrides;
				logger.info('style-modal', 'Saving style overrides', overrides);
			} else {
				delete metadata.styleOverrides;
				logger.info('style-modal', 'Clearing all style overrides');
			}

			// Format and save canvas JSON
			const formattedJson = this.formatCanvasJson(canvasData);
			await this.app.vault.modify(this.canvasFile, formattedJson);

			new Notice('画布样式已更新！重新生成画布以查看更改。');
			this.close();
		} catch (error: unknown) {
			logger.error('style-modal', 'Failed to save style overrides', error);
			new Notice('保存样式覆盖失败。详情请查看控制台。');
		}
	}

	/**
	 * Format canvas JSON to match Obsidian's exact format
	 */
	private formatCanvasJson(data: CanvasData): string {
		// Helper to safely stringify handling circular references
		const safeStringify = (obj: unknown): string => {
			const seen = new WeakSet();
			return JSON.stringify(obj, (_key, value) => {
				if (typeof value === 'object' && value !== null) {
					if (seen.has(value)) {
						return '[Circular]';
					}
					seen.add(value);
				}
				return value;
			});
		};

		const lines: string[] = [];
		lines.push('{');

		// Nodes
		lines.push('\t"nodes":[');
		data.nodes.forEach((node, i) => {
			const isLast = i === data.nodes.length - 1;
			const nodeStr = safeStringify(node);
			lines.push(`\t\t${nodeStr}${isLast ? '' : ','}`);
		});
		lines.push('\t],');

		// Edges
		lines.push('\t"edges":[');
		data.edges.forEach((edge, i) => {
			const isLast = i === data.edges.length - 1;
			const edgeStr = safeStringify(edge);
			lines.push(`\t\t${edgeStr}${isLast ? '' : ','}`);
		});
		lines.push('\t],');

		// Metadata
		lines.push('\t"metadata":{');
		if (data.metadata?.version) {
			lines.push(`\t\t"version":"${data.metadata.version}",`);
		}
		const frontmatter = data.metadata?.frontmatter || {};
		lines.push(`\t\t"frontmatter":${safeStringify(frontmatter)}`);
		lines.push('\t}');

		lines.push('}');

		return lines.join('\n');
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

/* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument -- Match scope of file-level disable at top. */
