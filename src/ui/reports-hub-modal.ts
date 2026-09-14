/**
 * Reports Hub Modal
 * A hub modal providing access to different report types:
 * - Narrative Reports (opens Report Wizard)
 * - Visual Charts (opens Unified Tree Wizard)
 */

import { App, Modal, setIcon } from 'obsidian';
import type CanvasRootsPlugin from '../../main';

/**
 * Reports Hub Modal
 * Provides a card-based interface to access different report generation tools
 */
export class ReportsHubModal extends Modal {
	private plugin: CanvasRootsPlugin;

	constructor(app: App, plugin: CanvasRootsPlugin) {
		super(app);
		this.plugin = plugin;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('crc-reports-hub-modal');
		this.modalEl.addClass('crc-reports-hub-modal-sized');

		// Header
		const header = contentEl.createDiv({ cls: 'crc-reports-hub-header' });
		const headerIcon = header.createDiv({ cls: 'crc-reports-hub-header-icon' });
		setIcon(headerIcon, 'bar-chart');
		header.createEl('h2', { text: '报告' });

		// Action cards grid
		const grid = contentEl.createDiv({ cls: 'crc-reports-hub-grid' });

		// Narrative Reports card
		this.renderActionCard(grid, {
			icon: 'file-text',
			iconClass: 'narrative',
			title: '叙事报告',
			description: '生成基于文本的报告，如祖先叙事、后代报告和家族群组表。',
			onClick: () => this.openReportType('narrative')
		});

		// Visual Charts card
		this.renderActionCard(grid, {
			icon: 'git-branch',
			iconClass: 'visual',
			title: '可视图表',
			description: '创建谱系图、后代树、扇形图及其他家谱可视化图表。',
			onClick: () => this.openReportType('visual')
		});
	}

	onClose(): void {
		const { contentEl } = this;
		contentEl.empty();
	}

	/**
	 * Render an action card
	 */
	private renderActionCard(
		container: HTMLElement,
		config: {
			icon: string;
			iconClass: string;
			title: string;
			description: string;
			onClick: () => void;
		}
	): void {
		const card = container.createDiv({ cls: 'crc-reports-hub-card' });

		const cardHeader = card.createDiv({ cls: 'crc-reports-hub-card-header' });
		const iconEl = cardHeader.createDiv({ cls: `crc-reports-hub-card-icon crc-reports-hub-card-icon--${config.iconClass}` });
		setIcon(iconEl, config.icon);
		cardHeader.createDiv({ cls: 'crc-reports-hub-card-title', text: config.title });

		card.createDiv({ cls: 'crc-reports-hub-card-description', text: config.description });

		card.addEventListener('click', config.onClick);
	}

	/**
	 * Open the selected report type modal
	 */
	private openReportType(type: 'narrative' | 'visual'): void {
		// Close this hub first
		this.close();

		if (type === 'narrative') {
			// Open Report Wizard
			void import('../reports/ui/report-wizard-modal').then(({ ReportWizardModal }) => {
				new ReportWizardModal(this.plugin).open();
			});
		} else {
			// Open Unified Tree Wizard
			void import('../trees/ui/unified-tree-wizard-modal').then(({ UnifiedTreeWizardModal }) => {
				new UnifiedTreeWizardModal(this.plugin).open();
			});
		}
	}
}
