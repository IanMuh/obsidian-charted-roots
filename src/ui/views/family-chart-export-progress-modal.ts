import { App, Modal } from 'obsidian';
import { createLucideIcon, LucideIconName } from '../lucide-icons';

/**
 * Export progress phases for family chart
 */
export type FamilyChartExportPhase =
	| 'preparing'
	| 'embedding'
	| 'rendering'
	| 'encoding'
	| 'saving'
	| 'complete';

/**
 * Progress state for family chart export
 */
export interface FamilyChartExportProgress {
	phase: FamilyChartExportPhase;
	current: number;
	total: number;
	message?: string;
}

/**
 * Phase display configuration
 */
const PHASE_CONFIG: Record<FamilyChartExportPhase, { label: string; icon: LucideIconName }> = {
	preparing: { label: '正在准备图表', icon: 'git-branch' },
	embedding: { label: '正在嵌入头像', icon: 'image' },
	rendering: { label: '正在渲染图像', icon: 'layout' },
	encoding: { label: '正在编码输出', icon: 'file-code' },
	saving: { label: '正在保存文件', icon: 'download' },
	complete: { label: '完成', icon: 'check' }
};

/**
 * Callback type for progress updates
 */
export type ProgressCallback = (progress: FamilyChartExportProgress) => void;

/**
 * Modal to display family chart export progress with cancel support
 */
export class FamilyChartExportProgressModal extends Modal {
	private progressBar: HTMLElement | null = null;
	private progressText: HTMLElement | null = null;
	private phaseLabel: HTMLElement | null = null;
	private phaseIcon: HTMLElement | null = null;
	private cancelButton: HTMLElement | null = null;
	private currentPhase: FamilyChartExportPhase = 'preparing';
	private formatName: string;
	private _cancelled = false;

	constructor(app: App, formatName: string) {
		super(app);
		this.formatName = formatName;
	}

	/**
	 * Check if export was cancelled
	 */
	get cancelled(): boolean {
		return this._cancelled;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		// Add modal class
		this.modalEl.addClass('cr-fcv-export-progress-modal');

		// Title
		contentEl.createEl('h2', {
			text: `正在导出 ${this.formatName}`,
			cls: 'crc-modal-title'
		});

		// Phase indicator
		const phaseContainer = contentEl.createDiv({ cls: 'cr-fcv-export-phase' });
		this.phaseIcon = phaseContainer.createDiv({ cls: 'cr-fcv-export-phase__icon' });
		this.phaseLabel = phaseContainer.createEl('span', {
			cls: 'cr-fcv-export-phase__label',
			text: '正在准备图表…'
		});

		// Progress bar container
		const progressContainer = contentEl.createDiv({ cls: 'cr-fcv-export-progress' });
		const progressTrack = progressContainer.createDiv({ cls: 'cr-fcv-export-progress__track' });
		this.progressBar = progressTrack.createDiv({ cls: 'cr-fcv-export-progress__bar' });
		this.progressBar.setCssProps({ '--progress-width': '0%' });

		// Progress text
		this.progressText = contentEl.createDiv({
			cls: 'cr-fcv-export-progress__text',
			text: '正在开始…'
		});

		// Cancel button container
		const buttonContainer = contentEl.createDiv({ cls: 'cr-fcv-export-buttons' });
		this.cancelButton = buttonContainer.createEl('button', {
			cls: 'cr-btn cr-btn--secondary',
			text: '取消'
		});
		this.cancelButton.addEventListener('click', () => {
			this._cancelled = true;
			this.cancelButton?.setText('正在取消…');
			this.cancelButton?.setAttribute('disabled', 'true');
		});

		// Update icon for initial phase
		this.updatePhaseIcon('preparing');
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}

	/**
	 * Update the progress display
	 */
	updateProgress(progress: FamilyChartExportProgress): void {
		if (!this.progressBar || !this.progressText || !this.phaseLabel) return;

		// Update phase if changed
		if (progress.phase !== this.currentPhase) {
			this.currentPhase = progress.phase;
			const config = PHASE_CONFIG[progress.phase];
			this.phaseLabel.textContent = config.label + '…';
			this.updatePhaseIcon(progress.phase);
		}

		// Update progress bar
		const percentage = progress.total > 0
			? Math.round((progress.current / progress.total) * 100)
			: 0;
		this.progressBar.setCssProps({ '--progress-width': `${percentage}%` });

		// Update progress text
		if (progress.message) {
			this.progressText.textContent = progress.message;
		} else if (progress.total > 0) {
			this.progressText.textContent = `第${progress.current}项，共${progress.total}项`;
		} else {
			this.progressText.textContent = '正在处理…';
		}
	}

	/**
	 * Mark export as complete
	 */
	markComplete(): void {
		if (!this.progressBar || !this.progressText || !this.phaseLabel) return;

		this.currentPhase = 'complete';
		this.phaseLabel.textContent = '导出完成';
		this.updatePhaseIcon('complete');
		this.progressBar.setCssProps({ '--progress-width': '100%' });
		this.progressText.textContent = '完成！';

		// Hide cancel button on completion
		if (this.cancelButton) {
			this.cancelButton.addClass('cr-hidden');
		}
	}

	/**
	 * Mark export as cancelled
	 */
	markCancelled(): void {
		if (!this.progressText || !this.phaseLabel) return;

		this.phaseLabel.textContent = '导出已取消';
		this.progressText.textContent = '';

		if (this.cancelButton) {
			this.cancelButton.addClass('cr-hidden');
		}
	}

	/**
	 * Update the phase icon
	 */
	private updatePhaseIcon(phase: FamilyChartExportPhase): void {
		if (!this.phaseIcon) return;

		this.phaseIcon.empty();
		const config = PHASE_CONFIG[phase];
		const icon = createLucideIcon(config.icon, 24);
		if (phase === 'complete') {
			icon.addClass('cr-icon--success');
		}
		this.phaseIcon.appendChild(icon);
	}
}
