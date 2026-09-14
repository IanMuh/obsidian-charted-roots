import { App, Modal } from 'obsidian';
import { createLucideIcon, LucideIconName } from './lucide-icons';
import type { ValidationProgress } from '../schemas';
import type { ValidationSummary } from '../schemas/types/schema-types';

/**
 * Phase display configuration
 */
const PHASE_CONFIG: Record<ValidationProgress['phase'], { label: string; icon: LucideIconName }> = {
	scanning: { label: '正在扫描库', icon: 'search' },
	validating: { label: '正在验证笔记', icon: 'clipboard-check' },
	complete: { label: '完成', icon: 'check' }
};

/**
 * Modal to display schema validation progress
 */
export class SchemaValidationProgressModal extends Modal {
	private progressBar: HTMLElement | null = null;
	private progressText: HTMLElement | null = null;
	private phaseLabel: HTMLElement | null = null;
	private phaseIcon: HTMLElement | null = null;
	private currentFileEl: HTMLElement | null = null;
	private statsContainer: HTMLElement | null = null;
	private currentPhase: ValidationProgress['phase'] = 'scanning';

	constructor(app: App) {
		super(app);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		// Add modal class
		this.modalEl.addClass('cr-import-progress-modal');

		// Title
		contentEl.createEl('h2', {
			text: '正在验证库',
			cls: 'crc-modal-title'
		});

		// Phase indicator
		const phaseContainer = contentEl.createDiv({ cls: 'cr-import-phase' });
		this.phaseIcon = phaseContainer.createDiv({ cls: 'cr-import-phase__icon' });
		this.phaseLabel = phaseContainer.createEl('span', {
			cls: 'cr-import-phase__label',
			text: '正在扫描库…'
		});

		// Progress bar container
		const progressContainer = contentEl.createDiv({ cls: 'cr-import-progress' });
		const progressTrack = progressContainer.createDiv({ cls: 'cr-import-progress__track' });
		this.progressBar = progressTrack.createDiv({ cls: 'cr-import-progress__bar' });
		this.progressBar.setCssProps({ '--progress-width': '0%' });

		// Progress text
		this.progressText = contentEl.createDiv({
			cls: 'cr-import-progress__text',
			text: '正在开始…'
		});

		// Current file being processed
		this.currentFileEl = contentEl.createDiv({
			cls: 'cr-import-progress__current-file crc-text--muted crc-text--small'
		});

		// Stats container (shows results at end)
		this.statsContainer = contentEl.createDiv({ cls: 'cr-import-running-stats' });

		// Update icon for initial phase
		this.updatePhaseIcon('scanning');
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}

	/**
	 * Update the progress display
	 */
	updateProgress(progress: ValidationProgress): void {
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
		this.progressBar.style.setProperty('width', `${percentage}%`);

		// Update progress text
		if (progress.total > 0) {
			this.progressText.textContent = `第 ${progress.current} / ${progress.total}`;
		} else {
			this.progressText.textContent = '正在处理…';
		}

		// Update current file
		if (this.currentFileEl && progress.currentFile) {
			this.currentFileEl.textContent = progress.currentFile;
		} else if (this.currentFileEl) {
			this.currentFileEl.textContent = '';
		}
	}

	/**
	 * Mark validation as complete and show summary
	 */
	markComplete(summary: ValidationSummary): void {
		if (!this.progressBar || !this.progressText || !this.phaseLabel) return;

		this.currentPhase = 'complete';
		this.phaseLabel.textContent = '验证完成';
		this.updatePhaseIcon('complete');
		this.progressBar.setCssProps({ '--progress-width': '100%' });
		this.progressText.textContent = '完成！';

		// Clear current file
		if (this.currentFileEl) {
			this.currentFileEl.textContent = '';
		}

		// Show summary stats
		if (this.statsContainer) {
			this.statsContainer.empty();

			const items: { label: string; value: number; icon: LucideIconName; cls?: string }[] = [
				{ label: '已验证人物', value: summary.totalPeopleValidated, icon: 'users' },
				{ label: '已检查模式', value: summary.totalSchemas, icon: 'clipboard-check' },
				{
					label: '错误',
					value: summary.totalErrors,
					icon: summary.totalErrors > 0 ? 'alert-circle' : 'check',
					cls: summary.totalErrors > 0 ? 'cr-import-stat--error' : 'cr-import-stat--success'
				}
			];

			if (summary.totalWarnings > 0) {
				items.push({
					label: '警告',
					value: summary.totalWarnings,
					icon: 'alert-triangle',
					cls: 'cr-import-stat--warning'
				});
			}

			for (const item of items) {
				const statEl = this.statsContainer.createDiv({
					cls: `cr-import-stat ${item.cls || ''}`
				});
				const icon = createLucideIcon(item.icon, 16);
				statEl.appendChild(icon);
				statEl.createEl('span', { text: `${item.value} ${item.label.toLowerCase()}` });
			}
		}
	}

	/**
	 * Update the phase icon
	 */
	private updatePhaseIcon(phase: ValidationProgress['phase']): void {
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
