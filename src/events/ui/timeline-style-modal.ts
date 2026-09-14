/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument -- Obsidian API returns any-typed surfaces (frontmatter, file caches, plugin state); project policy accepts these. */
/**
 * Timeline Style Customization Modal
 *
 * Modal for customizing per-timeline canvas style settings.
 * Reads existing style overrides from canvas metadata and allows editing.
 */

import { App, Modal, Notice, Setting, TFile } from 'obsidian';
import type CanvasRootsPlugin from '../../../main';
import type { CanvasColor } from '../../settings';
import type { TimelineColorScheme, TimelineLayoutStyle } from '../services/timeline-canvas-exporter';
import type { TimelineStyleOverrides, TimelineCanvasMetadata } from '../services/timeline-style-overrides';
import { TIMELINE_STYLE_DEFAULTS } from '../services/timeline-style-overrides';
import { getLogger } from '../../core/logging';

const logger = getLogger('TimelineStyleModal');

interface CanvasData {
	nodes: unknown[];
	edges: unknown[];
	metadata?: {
		version?: string;
		frontmatter?: {
			'canvas-roots'?: TimelineCanvasMetadata;
		};
	};
}

export class TimelineStyleModal extends Modal {
	private plugin: CanvasRootsPlugin;
	private canvasFile: TFile;
	private currentOverrides?: TimelineStyleOverrides;
	private currentMetadata?: TimelineCanvasMetadata;

	constructor(app: App, plugin: CanvasRootsPlugin, canvasFile: TFile) {
		super(app);
		this.plugin = plugin;
		this.canvasFile = canvasFile;
	}

	async onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('cr-timeline-style-modal');

		contentEl.createEl('h2', { text: '自定义时间轴样式' });

		// Load current metadata
		try {
			const canvasContent = await this.app.vault.read(this.canvasFile);
			const canvasData: CanvasData = JSON.parse(canvasContent);
			const metadata = canvasData.metadata?.frontmatter?.['canvas-roots'];

			if (metadata?.type === 'timeline-export') {
				this.currentMetadata = metadata;
				this.currentOverrides = metadata.styleOverrides;
			}
		} catch (error: unknown) {
			logger.error('style-modal', 'Failed to read canvas metadata', error);
		}

		// Description
		contentEl.createEl('p', {
			text: '自定义此时间轴画布的样式。更改将在你重新生成时间轴时应用。',
			cls: 'setting-item-description'
		});

		// Current settings info
		if (this.currentMetadata) {
			const infoEl = contentEl.createDiv({ cls: 'cr-timeline-info' });
			infoEl.createEl('p', {
				text: `事件：${this.currentMetadata.eventCount} • 布局：${this.currentMetadata.layoutStyle} • 颜色：${this.currentMetadata.colorScheme}`,
				cls: 'setting-item-description'
			});
			if (this.currentMetadata.filterPerson || this.currentMetadata.filterEventType) {
				const filters: string[] = [];
				if (this.currentMetadata.filterPerson) {
					filters.push(`人物：${this.currentMetadata.filterPerson.replace(/^\[\[|\]\]$/g, '')}`);
				}
				if (this.currentMetadata.filterEventType) {
					filters.push(`类型：${this.currentMetadata.filterEventType}`);
				}
				infoEl.createEl('p', {
					text: `筛选条件：${filters.join('，')}`,
					cls: 'setting-item-description'
				});
			}
		}

		// Style controls
		let colorScheme: TimelineColorScheme | undefined = this.currentOverrides?.colorScheme;
		let layoutStyle: TimelineLayoutStyle | undefined = this.currentOverrides?.layoutStyle;
		let nodeWidth: number | undefined = this.currentOverrides?.nodeWidth;
		let nodeHeight: number | undefined = this.currentOverrides?.nodeHeight;
		let spacingX: number | undefined = this.currentOverrides?.spacingX;
		let spacingY: number | undefined = this.currentOverrides?.spacingY;
		let includeOrderingEdges: boolean | undefined = this.currentOverrides?.includeOrderingEdges;
		let groupByPerson: boolean | undefined = this.currentOverrides?.groupByPerson;
		let orderingEdgeColor: CanvasColor | undefined = this.currentOverrides?.orderingEdgeColor;

		// Color scheme
		new Setting(contentEl)
			.setName('配色方案')
			.setDesc('如何为事件节点着色')
			.addDropdown(dropdown => {
				dropdown
					.addOption('', `（默认：${TIMELINE_STYLE_DEFAULTS.colorScheme}）`)
					.addOption('event_type', '事件类型')
					.addOption('category', '分类（核心/扩展/叙事）')
					.addOption('confidence', '置信度')
					.addOption('monochrome', '无颜色')
					.setValue(colorScheme || '')
					.onChange(value => {
						colorScheme = value ? value as TimelineColorScheme : undefined;
					});
			});

		// Layout style
		new Setting(contentEl)
			.setName('布局样式')
			.setDesc('如何在画布上排列事件')
			.addDropdown(dropdown => {
				dropdown
					.addOption('', `（默认：${TIMELINE_STYLE_DEFAULTS.layoutStyle}）`)
					.addOption('horizontal', '水平（从左到右）')
					.addOption('vertical', '垂直（从上到下）')
					.addOption('gantt', '甘特（按日期和人物）')
					.setValue(layoutStyle || '')
					.onChange(value => {
						layoutStyle = value ? value as TimelineLayoutStyle : undefined;
					});
			});

		// Node dimensions section
		contentEl.createEl('h3', { text: '节点尺寸', cls: 'setting-item-heading' });

		// Node width
		new Setting(contentEl)
			.setName('节点宽度')
			.setDesc(`事件节点宽度（像素，默认：${TIMELINE_STYLE_DEFAULTS.nodeWidth}）`)
			.addText(text => {
				text
					.setPlaceholder(String(TIMELINE_STYLE_DEFAULTS.nodeWidth))
					.setValue(nodeWidth !== undefined ? String(nodeWidth) : '')
					.onChange(value => {
						const num = parseInt(value, 10);
						nodeWidth = !isNaN(num) && num > 0 ? num : undefined;
					});
			});

		// Node height
		new Setting(contentEl)
			.setName('节点高度')
			.setDesc(`事件节点高度（像素，默认：${TIMELINE_STYLE_DEFAULTS.nodeHeight}）`)
			.addText(text => {
				text
					.setPlaceholder(String(TIMELINE_STYLE_DEFAULTS.nodeHeight))
					.setValue(nodeHeight !== undefined ? String(nodeHeight) : '')
					.onChange(value => {
						const num = parseInt(value, 10);
						nodeHeight = !isNaN(num) && num > 0 ? num : undefined;
					});
			});

		// Spacing section
		contentEl.createEl('h3', { text: '间距', cls: 'setting-item-heading' });

		// Horizontal spacing
		new Setting(contentEl)
			.setName('水平间距')
			.setDesc(`节点之间的水平间距（像素，默认：${TIMELINE_STYLE_DEFAULTS.spacingX}）`)
			.addText(text => {
				text
					.setPlaceholder(String(TIMELINE_STYLE_DEFAULTS.spacingX))
					.setValue(spacingX !== undefined ? String(spacingX) : '')
					.onChange(value => {
						const num = parseInt(value, 10);
						spacingX = !isNaN(num) && num >= 0 ? num : undefined;
					});
			});

		// Vertical spacing
		new Setting(contentEl)
			.setName('垂直间距')
			.setDesc(`节点之间的垂直间距（像素，默认：${TIMELINE_STYLE_DEFAULTS.spacingY}）`)
			.addText(text => {
				text
					.setPlaceholder(String(TIMELINE_STYLE_DEFAULTS.spacingY))
					.setValue(spacingY !== undefined ? String(spacingY) : '')
					.onChange(value => {
						const num = parseInt(value, 10);
						spacingY = !isNaN(num) && num >= 0 ? num : undefined;
					});
			});

		// Options section
		contentEl.createEl('h3', { text: '选项', cls: 'setting-item-heading' });

		// Include ordering edges
		new Setting(contentEl)
			.setName('显示顺序连线')
			.setDesc('显示事件之间前后关系的连线')
			.addDropdown(dropdown => {
				dropdown
					.addOption('', `（默认：${TIMELINE_STYLE_DEFAULTS.includeOrderingEdges ? '启用' : '禁用'}）`)
					.addOption('true', '启用')
					.addOption('false', '禁用')
					.setValue(includeOrderingEdges === undefined ? '' : String(includeOrderingEdges))
					.onChange(value => {
						includeOrderingEdges = value === '' ? undefined : value === 'true';
					});
			});

		// Group by person
		new Setting(contentEl)
			.setName('按人物分组')
			.setDesc('将事件按人物组织成泳道')
			.addDropdown(dropdown => {
				dropdown
					.addOption('', `（默认：${TIMELINE_STYLE_DEFAULTS.groupByPerson ? '启用' : '禁用'}）`)
					.addOption('true', '启用')
					.addOption('false', '禁用')
					.setValue(groupByPerson === undefined ? '' : String(groupByPerson))
					.onChange(value => {
						groupByPerson = value === '' ? undefined : value === 'true';
					});
			});

		// Ordering edge color
		new Setting(contentEl)
			.setName('顺序连线颜色')
			.setDesc('前后关系连线的颜色')
			.addDropdown(dropdown => {
				dropdown
					.addOption('', '（默认：主题默认）')
					.addOption('none', '主题默认')
					.addOption('1', '红色')
					.addOption('2', '橙色')
					.addOption('3', '黄色')
					.addOption('4', '绿色')
					.addOption('5', '青色')
					.addOption('6', '紫色')
					.setValue(orderingEdgeColor || '')
					.onChange(value => {
						orderingEdgeColor = value ? value as CanvasColor : undefined;
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
				colorScheme,
				layoutStyle,
				nodeWidth,
				nodeHeight,
				spacingX,
				spacingY,
				includeOrderingEdges,
				groupByPerson,
				orderingEdgeColor
			});
		});

		// Clear all button
		buttonContainer.createEl('button', {
			text: '清除所有覆盖设置'
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

	private async saveStyleOverrides(overrides: TimelineStyleOverrides): Promise<void> {
		try {
			// Read current canvas data
			const canvasContent = await this.app.vault.read(this.canvasFile);
			const canvasData: CanvasData = JSON.parse(canvasContent);

			// Ensure metadata structure exists
			if (!canvasData.metadata) {
				canvasData.metadata = { version: '1.0', frontmatter: {} };
			}
			if (!canvasData.metadata.frontmatter) {
				canvasData.metadata.frontmatter = {};
			}
			if (!canvasData.metadata.frontmatter['canvas-roots']) {
				// Create default metadata if missing
				canvasData.metadata.frontmatter['canvas-roots'] = {
					type: 'timeline-export',
					exportedAt: Date.now(),
					eventCount: 0,
					colorScheme: 'event_type',
					layoutStyle: 'horizontal'
				};
			}

			// Update style overrides in metadata
			const metadata = canvasData.metadata.frontmatter['canvas-roots'];

			// If all overrides are undefined, remove styleOverrides entirely
			const hasOverrides = Object.values(overrides).some(value => value !== undefined);
			if (hasOverrides) {
				metadata.styleOverrides = overrides;
				logger.info('style-modal', 'Saving timeline style overrides', overrides);
			} else {
				delete metadata.styleOverrides;
				logger.info('style-modal', 'Clearing all timeline style overrides');
			}

			// Format and save canvas JSON
			const formattedJson = this.formatCanvasJson(canvasData);
			await this.app.vault.modify(this.canvasFile, formattedJson);

			new Notice('时间轴样式已更新！重新生成时间轴以查看更改。');
			this.close();
		} catch (error: unknown) {
			logger.error('style-modal', 'Failed to save timeline style overrides', error);
			new Notice('保存样式覆盖设置失败。请查看控制台了解详情。');
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
		lines.push('\t]');

		// Metadata (if present)
		if (data.metadata) {
			lines[lines.length - 1] = '\t],';  // Add comma after edges
			lines.push(`\t"metadata":${JSON.stringify(data.metadata)}`);
		}

		lines.push('}');
		return lines.join('\n');
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

/* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument -- Match scope of file-level disable at top. */
