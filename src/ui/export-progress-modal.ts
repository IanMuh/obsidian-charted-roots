import { App, Modal } from 'obsidian';
import { createLucideIcon, LucideIconName } from './lucide-icons';

/**
 * Export progress phases
 */
export type ExportPhase =
	| 'loading'
	| 'filtering'
	| 'privacy'
	| 'events'
	| 'sources'
	| 'places'
	| 'generating'
	| 'writing'
	| 'complete';

/**
 * Progress state for export operations
 */
export interface ExportProgress {
	phase: ExportPhase;
	current: number;
	total: number;
	message?: string;
}

/**
 * Phase display configuration
 */
const PHASE_CONFIG: Record<ExportPhase, { label: string; icon: LucideIconName }> = {
	loading: { label: '正在加载数据', icon: 'folder' },
	filtering: { label: '正在筛选记录', icon: 'search' },
	privacy: { label: '正在应用隐私设置', icon: 'shield' },
	events: { label: '正在加载事件', icon: 'calendar' },
	sources: { label: '正在加载来源', icon: 'book-open' },
	places: { label: '正在加载地点', icon: 'map-pin' },
	generating: { label: '正在生成导出', icon: 'file-code' },
	writing: { label: '正在保存文件', icon: 'download' },
	complete: { label: '完成', icon: 'check' }
};

/**
 * Modal to display export progress
 */
export class ExportProgressModal extends Modal {
	private progressBar: HTMLElement | null = null;
	private progressText: HTMLElement | null = null;
	private phaseLabel: HTMLElement | null = null;
	private phaseIcon: HTMLElement | null = null;
	private statsContainer: HTMLElement | null = null;
	private currentPhase: ExportPhase = 'loading';
	private formatName: string;

	// Running totals for stats display
	private stats = {
		people: 0,
		events: 0,
		sources: 0,
		places: 0,
		relationships: 0
	};

	constructor(app: App, formatName: string) {
		super(app);
		this.formatName = formatName;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		// Add modal class and prevent closing by clicking outside
		this.modalEl.addClass('cr-export-progress-modal');

		// Title
		contentEl.createEl('h2', {
			text: `正在导出 ${this.formatName}`,
			cls: 'crc-modal-title'
		});

		// Phase indicator
		const phaseContainer = contentEl.createDiv({ cls: 'cr-export-phase' });
		this.phaseIcon = phaseContainer.createDiv({ cls: 'cr-export-phase__icon' });
		this.phaseLabel = phaseContainer.createEl('span', {
			cls: 'cr-export-phase__label',
			text: '正在加载数据…'
		});

		// Progress bar container
		const progressContainer = contentEl.createDiv({ cls: 'cr-export-progress' });
		const progressTrack = progressContainer.createDiv({ cls: 'cr-export-progress__track' });
		this.progressBar = progressTrack.createDiv({ cls: 'cr-export-progress__bar' });
		this.progressBar.setCssProps({ '--progress-width': '0%' });

		// Progress text
		this.progressText = contentEl.createDiv({
			cls: 'cr-export-progress__text',
			text: '正在开始…'
		});

		// Stats container (shows running totals)
		this.statsContainer = contentEl.createDiv({ cls: 'cr-export-running-stats' });
		this.updateStatsDisplay();

		// Update icon for initial phase
		this.updatePhaseIcon('loading');
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}

	/**
	 * Update the progress display
	 */
	updateProgress(progress: ExportProgress): void {
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
		if (progress.message) {
			this.progressText.textContent = progress.message;
		} else if (progress.total > 0) {
			this.progressText.textContent = `第 ${progress.current} / ${progress.total}`;
		} else {
			this.progressText.textContent = '正在处理…';
		}
	}

	/**
	 * Update running statistics
	 */
	updateStats(stats: Partial<typeof this.stats>): void {
		Object.assign(this.stats, stats);
		this.updateStatsDisplay();
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
	}

	/**
	 * Update the phase icon
	 */
	private updatePhaseIcon(phase: ExportPhase): void {
		if (!this.phaseIcon) return;

		this.phaseIcon.empty();
		const config = PHASE_CONFIG[phase];
		const icon = createLucideIcon(config.icon, 24);
		if (phase === 'complete') {
			icon.addClass('cr-icon--success');
		}
		this.phaseIcon.appendChild(icon);
	}

	/**
	 * Update the stats display
	 */
	private updateStatsDisplay(): void {
		if (!this.statsContainer) return;

		this.statsContainer.empty();

		const items: { label: string; value: number; icon: LucideIconName }[] = [];

		if (this.stats.people > 0) {
			items.push({ label: '人物', value: this.stats.people, icon: 'users' });
		}
		if (this.stats.events > 0) {
			items.push({ label: '事件', value: this.stats.events, icon: 'calendar' });
		}
		if (this.stats.sources > 0) {
			items.push({ label: '来源', value: this.stats.sources, icon: 'book-open' });
		}
		if (this.stats.places > 0) {
			items.push({ label: '地点', value: this.stats.places, icon: 'map-pin' });
		}
		if (this.stats.relationships > 0) {
			items.push({ label: '关系', value: this.stats.relationships, icon: 'git-branch' });
		}

		for (const item of items) {
			const statEl = this.statsContainer.createDiv({ cls: 'cr-export-stat' });
			const icon = createLucideIcon(item.icon, 16);
			statEl.appendChild(icon);
			statEl.createEl('span', { text: `${item.value} ${item.label.toLowerCase()}` });
		}
	}
}
