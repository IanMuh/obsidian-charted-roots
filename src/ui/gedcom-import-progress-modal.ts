import { App, Modal } from 'obsidian';
import { createLucideIcon, LucideIconName } from './lucide-icons';

/**
 * Import progress phases
 */
export type ImportPhase =
	| 'validating'
	| 'parsing'
	| 'media'
	| 'places'
	| 'sources'
	| 'people'
	| 'relationships'
	| 'events'
	| 'complete';

/**
 * Progress state for GEDCOM import
 */
export interface ImportProgress {
	phase: ImportPhase;
	current: number;
	total: number;
	message?: string;
}

/**
 * Phase display configuration
 */
const PHASE_CONFIG: Record<ImportPhase, { label: string; icon: LucideIconName }> = {
	validating: { label: '正在验证文件', icon: 'file-check' },
	parsing: { label: '正在解析 GEDCOM', icon: 'file-code' },
	media: { label: '正在提取媒体', icon: 'image' },
	places: { label: '正在创建地点', icon: 'map-pin' },
	sources: { label: '正在创建来源', icon: 'book-open' },
	people: { label: '正在创建人物', icon: 'users' },
	relationships: { label: '正在关联关系', icon: 'git-branch' },
	events: { label: '正在创建事件', icon: 'calendar' },
	complete: { label: '完成', icon: 'check' }
};

/**
 * Modal to display GEDCOM import progress
 */
export class GedcomImportProgressModal extends Modal {
	private progressBar: HTMLElement | null = null;
	private progressText: HTMLElement | null = null;
	private phaseLabel: HTMLElement | null = null;
	private phaseIcon: HTMLElement | null = null;
	private statsContainer: HTMLElement | null = null;
	private currentPhase: ImportPhase = 'validating';

	// Running totals for stats display
	private stats = {
		media: 0,
		places: 0,
		sources: 0,
		people: 0,
		events: 0
	};

	constructor(app: App) {
		super(app);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		// Add modal class and prevent closing by clicking outside
		this.modalEl.addClass('cr-import-progress-modal');

		// Title
		contentEl.createEl('h2', {
			text: '正在导入 GEDCOM',
			cls: 'crc-modal-title'
		});

		// Phase indicator
		const phaseContainer = contentEl.createDiv({ cls: 'cr-import-phase' });
		this.phaseIcon = phaseContainer.createDiv({ cls: 'cr-import-phase__icon' });
		this.phaseLabel = phaseContainer.createEl('span', {
			cls: 'cr-import-phase__label',
			text: '正在验证文件…'
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

		// Stats container (shows running totals)
		this.statsContainer = contentEl.createDiv({ cls: 'cr-import-running-stats' });
		this.updateStatsDisplay();

		// Update icon for initial phase
		this.updatePhaseIcon('validating');
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}

	/**
	 * Update the progress display
	 */
	updateProgress(progress: ImportProgress): void {
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
	 * Mark import as complete
	 */
	markComplete(): void {
		if (!this.progressBar || !this.progressText || !this.phaseLabel) return;

		this.currentPhase = 'complete';
		this.phaseLabel.textContent = '导入完成';
		this.updatePhaseIcon('complete');
		this.progressBar.setCssProps({ '--progress-width': '100%' });
		this.progressText.textContent = '完成！';
	}

	/**
	 * Update the phase icon
	 */
	private updatePhaseIcon(phase: ImportPhase): void {
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

		if (this.stats.media > 0) {
			items.push({ label: '媒体', value: this.stats.media, icon: 'image' });
		}
		if (this.stats.places > 0) {
			items.push({ label: '地点', value: this.stats.places, icon: 'map-pin' });
		}
		if (this.stats.sources > 0) {
			items.push({ label: '来源', value: this.stats.sources, icon: 'book-open' });
		}
		if (this.stats.people > 0) {
			items.push({ label: '人物', value: this.stats.people, icon: 'users' });
		}
		if (this.stats.events > 0) {
			items.push({ label: '事件', value: this.stats.events, icon: 'calendar' });
		}

		for (const item of items) {
			const statEl = this.statsContainer.createDiv({ cls: 'cr-import-stat' });
			const icon = createLucideIcon(item.icon, 16);
			statEl.appendChild(icon);
			statEl.createEl('span', { text: `${item.value} ${item.label.toLowerCase()}` });
		}
	}
}
