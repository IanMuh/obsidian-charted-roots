/**
 * Place Generator Modal
 *
 * UI for generating place notes from place strings found in person and event notes.
 * Part of the Data Enhancement Pass feature.
 */

import { App, Modal, Notice, Setting, TFile } from 'obsidian';
import { createLucideIcon, setLucideIcon } from '../../ui/lucide-icons';
import {
	PlaceGeneratorService,
	PlaceGeneratorOptions,
	PlaceGeneratorResult,
	PlaceNoteInfo,
	FoundPlace,
	DEFAULT_PLACE_GENERATOR_OPTIONS
} from '../services/place-generator';
import type { CanvasRootsSettings } from '../../settings';
import { PlaceGraphService } from '../../core/place-graph';
import { CreatePlaceModal } from '../../ui/create-place-modal';

/**
 * Options for the place generator modal
 */
export interface PlaceGeneratorModalOptions {
	/** Callback when generation is complete */
	onComplete?: (result: PlaceGeneratorResult) => void;
}

/**
 * Modal for generating place notes from existing data
 */
export class PlaceGeneratorModal extends Modal {
	private settings: CanvasRootsSettings;
	private modalOptions: PlaceGeneratorModalOptions;
	private service: PlaceGeneratorService;
	private placeGraph: PlaceGraphService | null = null;

	// Options state
	private options: PlaceGeneratorOptions;

	// UI state
	private previewResult: PlaceGeneratorResult | null = null;
	private isScanning = false;
	private isGenerating = false;
	private isCancelled = false;

	// Table state for preview places list
	private allPlaces: FoundPlace[] = [];
	private filteredPlaces: FoundPlace[] = [];
	private searchQuery = '';
	private sortField: 'name' | 'refs' = 'name';
	private sortAscending = true;
	private currentPage = 0;
	private pageSize = 20;

	// Table state for results list
	private resultNotes: PlaceNoteInfo[] = [];
	private filteredResultNotes: PlaceNoteInfo[] = [];
	private resultsSearchQuery = '';
	private resultsSortField: 'name' | 'status' = 'name';
	private resultsSortAscending = true;
	private resultsCurrentPage = 0;
	private resultsTableBody: HTMLTableSectionElement | null = null;
	private resultsCountEl: HTMLElement | null = null;
	private resultsPaginationContainer: HTMLElement | null = null;

	// UI elements
	private contentContainer: HTMLElement | null = null;
	private previewButton: HTMLButtonElement | null = null;
	private generateButton: HTMLButtonElement | null = null;
	private cancelButton: HTMLButtonElement | null = null;
	private progressContainer: HTMLElement | null = null;
	private resultsContainer: HTMLElement | null = null;
	private placesTableBody: HTMLTableSectionElement | null = null;
	private placesCountEl: HTMLElement | null = null;
	private paginationContainer: HTMLElement | null = null;

	// Progress UI elements
	private progressPhaseEl: HTMLElement | null = null;
	private progressBarEl: HTMLElement | null = null;
	private progressTextEl: HTMLElement | null = null;

	constructor(
		app: App,
		settings: CanvasRootsSettings,
		modalOptions: PlaceGeneratorModalOptions = {},
		placeGraph?: PlaceGraphService
	) {
		super(app);
		this.settings = settings;
		this.modalOptions = modalOptions;
		this.service = new PlaceGeneratorService(app, settings);
		this.placeGraph = placeGraph ?? null;

		// Initialize options with defaults
		this.options = {
			...DEFAULT_PLACE_GENERATOR_OPTIONS,
			placesFolder: settings.placesFolder || DEFAULT_PLACE_GENERATOR_OPTIONS.placesFolder
		};
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		this.modalEl.addClass('cr-place-generator-modal');

		// Header
		const header = contentEl.createDiv({ cls: 'crc-modal-header' });
		const titleContainer = header.createDiv({ cls: 'crc-modal-title' });
		const icon = createLucideIcon('map-pin', 24);
		titleContainer.appendChild(icon);
		titleContainer.appendText('生成地点笔记');

		// Description
		const description = contentEl.createDiv({ cls: 'crc-modal-description' });
		description.createEl('p', {
			text: '扫描人物和事件笔记中的地点字符串（非 wikilink），并创建具有正确层级的地点笔记。' +
				'可选择更新引用以改用 wikilink。'
		});

		// Content container
		this.contentContainer = contentEl.createDiv({ cls: 'cr-place-generator-content' });

		// Options section
		this.renderOptionsSection();

		// Progress container (hidden initially)
		this.progressContainer = this.contentContainer.createDiv({ cls: 'cr-place-generator-progress crc-hidden' });

		// Results container
		this.resultsContainer = this.contentContainer.createDiv({ cls: 'cr-place-generator-results' });
		this.renderInitialPrompt();

		// Footer with buttons
		const footer = contentEl.createDiv({ cls: 'crc-modal-footer' });

		this.previewButton = footer.createEl('button', {
			text: '预览',
			cls: 'mod-cta'
		});
		this.previewButton.addEventListener('click', () => void this.runPreview());

		this.generateButton = footer.createEl('button', {
			text: '生成',
			cls: 'mod-warning'
		});
		this.generateButton.disabled = true;
		this.generateButton.addEventListener('click', () => void this.runGenerate());

		this.cancelButton = footer.createEl('button', {
			text: '取消',
			cls: 'cr-place-generator-cancel-btn crc-hidden'
		});
		this.cancelButton.addEventListener('click', () => this.cancelGeneration());

		footer.createEl('button', { text: '关闭' })
			.addEventListener('click', () => this.close());
	}

	onClose(): void {
		const { contentEl } = this;
		contentEl.empty();
	}

	/**
	 * Render the options section
	 */
	private renderOptionsSection(): void {
		if (!this.contentContainer) return;

		const optionsSection = this.contentContainer.createDiv({ cls: 'cr-place-generator-options' });
		optionsSection.createEl('h3', { text: '选项' });

		// Scan person notes
		new Setting(optionsSection)
			.setName('扫描人物笔记')
			.setDesc('查找 birth_place 和 death_place 属性')
			.addToggle(toggle => toggle
				.setValue(this.options.scanPersonNotes)
				.onChange(value => {
					this.options.scanPersonNotes = value;
					this.previewResult = null;
					this.updateButtonStates();
				})
			);

		// Scan event notes
		new Setting(optionsSection)
			.setName('扫描事件笔记')
			.setDesc('在事件笔记中查找地点属性')
			.addToggle(toggle => toggle
				.setValue(this.options.scanEventNotes)
				.onChange(value => {
					this.options.scanEventNotes = value;
					this.previewResult = null;
					this.updateButtonStates();
				})
			);

		// Parse hierarchy
		new Setting(optionsSection)
			.setName('解析地点层级')
			.setDesc('创建父地点（例如「都柏林，爱尔兰」将同时创建都柏林和爱尔兰）')
			.addToggle(toggle => toggle
				.setValue(this.options.parseHierarchy)
				.onChange(value => {
					this.options.parseHierarchy = value;
					this.previewResult = null;
					this.updateButtonStates();
				})
			);

		// Update references
		new Setting(optionsSection)
			.setName('更新引用')
			.setDesc('创建笔记后将地点字符串转换为 wikilink')
			.addToggle(toggle => toggle
				.setValue(this.options.updateReferences)
				.onChange(value => {
					this.options.updateReferences = value;
					this.previewResult = null;
					this.updateButtonStates();
				})
			);

		// Places folder
		new Setting(optionsSection)
			.setName('地点文件夹')
			.setDesc('创建新地点笔记的位置')
			.addText(text => text
				.setValue(this.options.placesFolder)
				.onChange(value => {
					this.options.placesFolder = value || DEFAULT_PLACE_GENERATOR_OPTIONS.placesFolder;
				})
			);
	}

	/**
	 * Render initial prompt before preview
	 */
	private renderInitialPrompt(): void {
		if (!this.resultsContainer) return;

		this.resultsContainer.empty();
		this.resultsContainer.createEl('p', {
			text: '点击「预览」扫描可转换为地点笔记的地点字符串。',
			cls: 'crc-text--muted'
		});
	}

	/**
	 * Run preview scan
	 */
	private async runPreview(): Promise<void> {
		if (this.isScanning || this.isGenerating) return;

		this.isScanning = true;
		this.updateButtonStates();

		// Show progress
		if (this.progressContainer) {
			this.progressContainer.removeClass('crc-hidden');
			this.progressContainer.empty();
			this.progressContainer.createEl('p', { text: '正在扫描笔记中的地点字符串…' });
		}

		try {
			this.previewResult = await this.service.preview(this.options);
			this.renderPreviewResults();
		} catch (error) {
			console.error('Error scanning for places:', error);
			new Notice('扫描笔记时出错。请查看控制台了解详情。');
		} finally {
			this.isScanning = false;
			this.updateButtonStates();
			if (this.progressContainer) {
				this.progressContainer.addClass('crc-hidden');
			}
		}
	}

	/**
	 * Render preview results
	 */
	private renderPreviewResults(): void {
		if (!this.resultsContainer || !this.previewResult) return;

		this.resultsContainer.empty();
		const result = this.previewResult;

		// No places found
		if (result.placesFound === 0) {
			const successMsg = this.resultsContainer.createDiv({ cls: 'crc-success-callout' });
			const successIcon = createLucideIcon('check-circle', 16);
			successMsg.appendChild(successIcon);
			successMsg.appendText(' 未找到地点字符串。所有地点可能已在使用 wikilink。');
			return;
		}

		// Summary section
		const summary = this.resultsContainer.createDiv({ cls: 'cr-place-generator-summary' });
		summary.createEl('h4', { text: '预览摘要' });

		const statsGrid = summary.createDiv({ cls: 'cr-place-generator-stats' });

		this.createStatItem(statsGrid, 'map-pin', '找到的地点', result.placesFound);
		this.createStatItem(statsGrid, 'plus-circle', '待创建的新笔记', result.notesCreated);
		this.createStatItem(statsGrid, 'check-circle', '匹配的现有笔记', result.existingMatched);

		if (this.options.updateReferences) {
			this.createStatItem(statsGrid, 'link', '待更新的引用', result.referencesUpdated);
		}

		// Place list section
		const placesSection = this.resultsContainer.createDiv({ cls: 'cr-place-generator-places' });
		placesSection.createEl('h4', { text: '待创建的地点' });

		// Filter to show only places that would be new (have referencing files)
		this.allPlaces = result.foundPlaces.filter(p => p.referencingFiles.length > 0);
		this.currentPage = 0;
		this.searchQuery = '';

		if (this.allPlaces.length === 0) {
			placesSection.createEl('p', {
				text: '无需创建新的地点笔记。所有地点均已存在。',
				cls: 'crc-text--muted'
			});
		} else {
			// Count display
			this.placesCountEl = placesSection.createEl('p', { cls: 'crc-batch-count' });

			// Controls row: search + sort
			const controlsRow = placesSection.createDiv({ cls: 'crc-batch-controls' });

			// Search input
			const searchContainer = controlsRow.createDiv({ cls: 'crc-batch-search' });
			const searchInput = searchContainer.createEl('input', {
				type: 'text',
				placeholder: '搜索地点…',
				cls: 'crc-batch-search-input'
			});
			searchInput.addEventListener('input', () => {
				this.searchQuery = searchInput.value.toLowerCase();
				this.currentPage = 0;
				this.applyFiltersAndSort();
			});

			// Sort dropdown
			const sortContainer = controlsRow.createDiv({ cls: 'crc-batch-filter' });
			const sortSelect = sortContainer.createEl('select', { cls: 'crc-batch-filter-select' });
			sortSelect.createEl('option', { text: '按名称排序', value: 'name' });
			sortSelect.createEl('option', { text: '按引用数排序', value: 'refs' });
			sortSelect.addEventListener('change', () => {
				this.sortField = sortSelect.value as 'name' | 'refs';
				this.applyFiltersAndSort();
			});

			// Sort direction toggle
			const sortDirContainer = controlsRow.createDiv({ cls: 'crc-batch-sort' });
			const sortDirBtn = sortDirContainer.createEl('button', {
				text: 'A→Z',
				cls: 'crc-batch-sort-btn'
			});
			sortDirBtn.addEventListener('click', () => {
				this.sortAscending = !this.sortAscending;
				sortDirBtn.textContent = this.sortAscending ? 'A→Z' : 'Z→A';
				this.applyFiltersAndSort();
			});

			// Scrollable table container
			const tableContainer = placesSection.createDiv({ cls: 'crc-batch-table-container' });
			const table = tableContainer.createEl('table', { cls: 'crc-batch-preview-table' });
			const thead = table.createEl('thead');
			const headerRow = thead.createEl('tr');
			headerRow.createEl('th', { text: '地点' });
			headerRow.createEl('th', { text: '引用' });
			if (this.options.parseHierarchy) {
				headerRow.createEl('th', { text: '层级' });
			}
			headerRow.createEl('th', { text: '', cls: 'cr-place-generator-action-header' });

			this.placesTableBody = table.createEl('tbody');

			// Pagination container
			this.paginationContainer = placesSection.createDiv({ cls: 'cr-place-generator-pagination' });

			// Initial render
			this.applyFiltersAndSort();
		}

		// Warning callout
		const warning = this.resultsContainer.createDiv({ cls: 'crc-warning-callout' });
		const warningIcon = createLucideIcon('alert-triangle', 16);
		warning.appendChild(warningIcon);
		warning.createSpan({
			text: ' 继续前请备份你的库。此操作将创建新文件并修改现有笔记。'
		});

		this.updateButtonStates();
	}

	/**
	 * Apply filters and sorting, then re-render the table
	 */
	private applyFiltersAndSort(): void {
		// Filter
		this.filteredPlaces = this.allPlaces.filter(place => {
			if (this.searchQuery && !place.placeString.toLowerCase().includes(this.searchQuery)) {
				return false;
			}
			return true;
		});

		// Sort
		this.filteredPlaces.sort((a, b) => {
			let cmp: number;
			if (this.sortField === 'refs') {
				cmp = a.referencingFiles.length - b.referencingFiles.length;
			} else {
				cmp = a.placeString.localeCompare(b.placeString);
			}
			return this.sortAscending ? cmp : -cmp;
		});

		// Update count
		if (this.placesCountEl) {
			if (this.filteredPlaces.length === this.allPlaces.length) {
				this.placesCountEl.textContent = `待创建 ${this.allPlaces.length} 个地点：`;
			} else {
				this.placesCountEl.textContent = `显示 ${this.filteredPlaces.length} / ${this.allPlaces.length} 个地点：`;
			}
		}

		// Re-render table and pagination
		this.renderPlacesTable();
		this.renderPagination();
	}

	/**
	 * Render the places table for the current page
	 */
	private renderPlacesTable(): void {
		if (!this.placesTableBody) return;

		this.placesTableBody.empty();

		const startIdx = this.currentPage * this.pageSize;
		const endIdx = Math.min(startIdx + this.pageSize, this.filteredPlaces.length);
		const pageItems = this.filteredPlaces.slice(startIdx, endIdx);

		for (const place of pageItems) {
			const row = this.placesTableBody.createEl('tr');

			// Place name
			row.createEl('td', { text: place.placeString });

			// Reference count
			row.createEl('td', {
				text: String(place.referencingFiles.length),
				cls: 'cr-place-generator-refs-cell'
			});

			// Hierarchy (if enabled)
			if (this.options.parseHierarchy) {
				row.createEl('td', {
					text: place.hierarchyParts.length > 1 ? place.hierarchyParts.join(' → ') : '—',
					cls: 'crc-text--muted'
				});
			}

			// Action button
			const actionCell = row.createEl('td', { cls: 'cr-place-generator-action-cell' });
			const createBtn = actionCell.createEl('button', {
				text: '创建',
				cls: 'cr-place-generator-create-btn'
			});
			createBtn.addEventListener('click', () => {
				void this.generateSinglePlace(place, row, createBtn);
			});
		}

		// Empty state
		if (pageItems.length === 0 && this.allPlaces.length > 0) {
			const row = this.placesTableBody.createEl('tr');
			const cell = row.createEl('td', {
				text: '未找到匹配项',
				cls: 'crc-text--muted crc-text--center'
			});
			cell.setAttribute('colspan', this.options.parseHierarchy ? '4' : '3');
		}
	}

	/**
	 * Render pagination controls
	 */
	private renderPagination(): void {
		if (!this.paginationContainer) return;

		this.paginationContainer.empty();

		const totalPages = Math.ceil(this.filteredPlaces.length / this.pageSize);

		if (totalPages <= 1) {
			return;
		}

		// Previous button
		const prevBtn = this.paginationContainer.createEl('button', {
			text: '← 上一页',
			cls: 'cr-place-generator-page-btn'
		});
		prevBtn.disabled = this.currentPage === 0;
		prevBtn.addEventListener('click', () => {
			if (this.currentPage > 0) {
				this.currentPage--;
				this.renderPlacesTable();
				this.renderPagination();
			}
		});

		// Page info
		const startItem = this.currentPage * this.pageSize + 1;
		const endItem = Math.min((this.currentPage + 1) * this.pageSize, this.filteredPlaces.length);
		this.paginationContainer.createSpan({
			text: `${startItem}–${endItem} / ${this.filteredPlaces.length}`,
			cls: 'cr-place-generator-page-info'
		});

		// Next button
		const nextBtn = this.paginationContainer.createEl('button', {
			text: '下一页 →',
			cls: 'cr-place-generator-page-btn'
		});
		nextBtn.disabled = this.currentPage >= totalPages - 1;
		nextBtn.addEventListener('click', () => {
			if (this.currentPage < totalPages - 1) {
				this.currentPage++;
				this.renderPlacesTable();
				this.renderPagination();
			}
		});
	}

	/**
	 * Generate a single place note
	 */
	private async generateSinglePlace(
		place: FoundPlace,
		row: HTMLTableRowElement,
		button: HTMLButtonElement
	): Promise<void> {
		// Disable button and show loading state
		button.disabled = true;
		button.textContent = '...';
		button.addClass('cr-place-generator-create-btn--loading');

		try {
			// Generate just this one place
			const result = await this.service.generateSinglePlace(place, this.options);

			if (result.success) {
				// Mark row as completed
				row.addClass('cr-place-generator-row--created');
				button.textContent = '✓';
				button.addClass('cr-place-generator-create-btn--done');

				// Remove from allPlaces so it won't show on re-render
				const idx = this.allPlaces.findIndex(p => p.placeString === place.placeString);
				if (idx !== -1) {
					this.allPlaces.splice(idx, 1);
				}

				// Update the count display
				if (this.placesCountEl && this.previewResult) {
					this.previewResult.notesCreated--;
					const remaining = this.allPlaces.length;
					this.placesCountEl.textContent = `待创建 ${remaining} 个地点：`;
				}

				new Notice(`已创建地点笔记：${place.placeString}`);
			} else {
				// Show error state
				button.textContent = '✗';
				button.addClass('cr-place-generator-create-btn--error');
				new Notice(`创建 ${place.placeString} 失败：${result.error}`);
			}
		} catch (error) {
			console.error('Error generating single place:', error);
			button.textContent = '✗';
			button.addClass('cr-place-generator-create-btn--error');
				new Notice(`创建 ${place.placeString} 时出错`);
		}
	}

	/**
	 * Create a stat item
	 */
	private createStatItem(
		container: HTMLElement,
		iconName: 'map-pin' | 'plus-circle' | 'check-circle' | 'link' | 'file-text',
		label: string,
		value: number
	): void {
		const item = container.createDiv({ cls: 'cr-place-generator-stat-item' });
		const icon = createLucideIcon(iconName, 16);
		item.appendChild(icon);
		item.createSpan({ text: `${label}: ` });
		item.createSpan({ text: String(value), cls: 'cr-place-generator-stat-value' });
	}

	/**
	 * Run place generation
	 */
	private async runGenerate(): Promise<void> {
		if (this.isScanning || this.isGenerating || !this.previewResult) return;

		// Confirm before proceeding
		if (this.previewResult.notesCreated > 0 || this.previewResult.referencesUpdated > 0) {
			const confirmMessage = `这将创建${this.previewResult.notesCreated}个地点笔记`;
			const updateMessage = this.options.updateReferences
				? `并更新${this.previewResult.referencesUpdated}条引用`
				: '';
			const proceed = await new Promise<boolean>(resolve => {
				const modal = new ConfirmationModal(
					this.app,
					'确认生成',
					`${confirmMessage}${updateMessage}。是否继续？`,
					resolve
				);
				modal.open();
			});
			if (!proceed) return;
		}

		this.isGenerating = true;
		this.isCancelled = false;
		this.updateButtonStates();

		// Show progress UI
		this.renderProgressUI();

		try {
			const result = await this.service.generate(
				{
					...this.options,
					dryRun: false
				},
				{
					onProgress: (current, total, placeName) => {
						this.updateProgressUI(current, total, placeName);
					},
					isCancelled: () => this.isCancelled
				}
			);

			// Brief delay before showing results
			await new Promise(resolve => window.setTimeout(resolve, 300));

			// Hide progress, show results
			if (this.progressContainer) {
				this.progressContainer.addClass('crc-hidden');
			}

			this.renderGenerationResults(result);

			// Callback
			if (this.modalOptions.onComplete) {
				this.modalOptions.onComplete(result);
			}

			// Success notice
			if (result.cancelled) {
				new Notice(`生成已取消。创建了 ${result.notesCreated} 个地点笔记。`);
			} else if (result.errors.length === 0) {
				new Notice(`创建了 ${result.notesCreated} 个地点笔记，更新了 ${result.referencesUpdated} 条引用。`);
			} else {
				new Notice(`完成，有 ${result.errors.length} 个错误。请查看控制台了解详情。`);
			}

		} catch (error) {
			console.error('Error generating place notes:', error);
			new Notice('生成地点笔记时出错。请查看控制台了解详情。');
			if (this.progressContainer) {
				this.progressContainer.addClass('crc-hidden');
			}
		} finally {
			this.isGenerating = false;
			this.isCancelled = false;
			this.updateButtonStates();
		}
	}

	/**
	 * Render the progress UI
	 */
	private renderProgressUI(): void {
		if (!this.progressContainer) return;

		this.progressContainer.removeClass('crc-hidden');
		this.progressContainer.empty();
		this.progressContainer.addClass('cr-place-generator-progress-content');

		// Phase indicator
		const phaseContainer = this.progressContainer.createDiv({ cls: 'cr-place-generator-phase' });
		const phaseIcon = phaseContainer.createDiv({ cls: 'cr-place-generator-phase__icon' });
		setLucideIcon(phaseIcon, 'map-pin', 20);
		this.progressPhaseEl = phaseContainer.createDiv({ cls: 'cr-place-generator-phase__label' });
		this.progressPhaseEl.textContent = '正在创建地点笔记…';

		// Progress bar
		const barContainer = this.progressContainer.createDiv({ cls: 'cr-place-generator-progress-bar' });
		this.progressBarEl = barContainer.createDiv({ cls: 'cr-place-generator-progress-bar__fill' });
		this.progressBarEl.setCssProps({ '--progress-width': '0%' });

		// Progress text
		this.progressTextEl = this.progressContainer.createDiv({ cls: 'cr-place-generator-progress-text' });
		this.progressTextEl.textContent = '正在开始…';
	}

	/**
	 * Update the progress UI
	 */
	private updateProgressUI(current: number, total: number, placeName: string): void {
		const percent = Math.round((current / total) * 100);

		if (this.progressBarEl) {
			this.progressBarEl.setCssProps({ '--progress-width': `${percent}%` });
		}

		if (this.progressTextEl) {
			this.progressTextEl.textContent = `正在创建 ${current} / ${total}：${placeName}`;
		}
	}

	/**
	 * Cancel the generation process
	 */
	private cancelGeneration(): void {
		if (this.isGenerating && !this.isCancelled) {
			this.isCancelled = true;
			if (this.cancelButton) {
				this.cancelButton.disabled = true;
				this.cancelButton.textContent = '正在取消…';
			}
		}
	}

	/**
	 * Render generation results
	 */
	private renderGenerationResults(result: PlaceGeneratorResult): void {
		if (!this.resultsContainer) return;

		this.resultsContainer.empty();

		// Success header
		const header = this.resultsContainer.createDiv({ cls: 'cr-place-generator-complete-header' });
		const successIcon = createLucideIcon(result.cancelled ? 'alert-circle' : 'check-circle', 24);
		header.appendChild(successIcon);
		header.createEl('h4', { text: result.cancelled ? '生成已取消' : '生成完成' });

		// Stats grid
		const statsGrid = this.resultsContainer.createDiv({ cls: 'cr-place-generator-stats' });

		this.createStatItem(statsGrid, 'plus-circle', '已创建笔记', result.notesCreated);
		this.createStatItem(statsGrid, 'check-circle', '匹配现有', result.existingMatched);
		this.createStatItem(statsGrid, 'link', '已更新引用', result.referencesUpdated);
		this.createStatItem(statsGrid, 'file-text', '已修改文件', result.filesModified);

		// Errors section
		if (result.errors.length > 0) {
			const errorsSection = this.resultsContainer.createDiv({ cls: 'cr-place-generator-errors' });
			errorsSection.createEl('h4', { text: '错误' });

			const errorList = errorsSection.createEl('ul', { cls: 'cr-place-generator-error-list' });
			for (const error of result.errors.slice(0, 10)) {
				errorList.createEl('li', {
					text: `${error.place}: ${error.error}`,
					cls: 'crc-text--error'
				});
			}

			if (result.errors.length > 10) {
				errorList.createEl('li', {
					text: `… 还有 ${result.errors.length - 10} 个错误`,
					cls: 'crc-text--muted'
				});
			}
		}

		// Created notes section with paginated table
		if (result.placeNotes.length > 0) {
			const notesSection = this.resultsContainer.createDiv({ cls: 'cr-place-generator-created-notes' });
			notesSection.createEl('h4', { text: '地点笔记' });

			// Initialize results table state
			this.resultNotes = result.placeNotes;
			this.resultsCurrentPage = 0;
			this.resultsSearchQuery = '';
			this.resultsSortField = 'name';
			this.resultsSortAscending = true;

			// Count display
			this.resultsCountEl = notesSection.createEl('p', { cls: 'crc-batch-count' });

			// Controls row (search + sort)
			this.renderResultsControls(notesSection);

			// Scrollable table container
			const tableContainer = notesSection.createDiv({ cls: 'crc-batch-table-container' });
			const table = tableContainer.createEl('table', { cls: 'crc-batch-preview-table' });
			const thead = table.createEl('thead');
			const headerRow = thead.createEl('tr');
			headerRow.createEl('th', { text: '地点' });
			headerRow.createEl('th', { text: '状态' });
			headerRow.createEl('th', { text: '', cls: 'cr-place-generator-action-header' });

			this.resultsTableBody = table.createEl('tbody');

			// Pagination container
			this.resultsPaginationContainer = notesSection.createDiv({ cls: 'cr-place-generator-pagination' });

			// Initial render
			this.applyResultsFiltersAndSort();
		}

		// Clear preview result so generate button is disabled
		this.previewResult = null;
		this.updateButtonStates();
	}

	/**
	 * Render controls for the results table
	 */
	private renderResultsControls(container: HTMLElement): void {
		const controlsRow = container.createDiv({ cls: 'crc-batch-controls' });

		// Search input
		const searchContainer = controlsRow.createDiv({ cls: 'crc-batch-search' });
		const searchInput = searchContainer.createEl('input', {
			type: 'text',
			placeholder: '搜索已创建的笔记…',
			cls: 'crc-batch-search-input'
		});
		searchInput.addEventListener('input', () => {
			this.resultsSearchQuery = searchInput.value.toLowerCase();
			this.resultsCurrentPage = 0;
			this.applyResultsFiltersAndSort();
		});

		// Sort dropdown
		const sortContainer = controlsRow.createDiv({ cls: 'crc-batch-filter' });
		const sortSelect = sortContainer.createEl('select', { cls: 'crc-batch-filter-select' });
		sortSelect.createEl('option', { text: '按名称排序', value: 'name' });
		sortSelect.createEl('option', { text: '按状态排序', value: 'status' });
		sortSelect.addEventListener('change', () => {
			this.resultsSortField = sortSelect.value as 'name' | 'status';
			this.applyResultsFiltersAndSort();
		});

		// Sort direction toggle
		const sortDirContainer = controlsRow.createDiv({ cls: 'crc-batch-sort' });
		const sortDirBtn = sortDirContainer.createEl('button', {
			text: 'A→Z',
			cls: 'crc-batch-sort-btn'
		});
		sortDirBtn.addEventListener('click', () => {
			this.resultsSortAscending = !this.resultsSortAscending;
			sortDirBtn.textContent = this.resultsSortAscending ? 'A→Z' : 'Z→A';
			this.applyResultsFiltersAndSort();
		});
	}

	/**
	 * Apply filters and sorting to results table
	 */
	private applyResultsFiltersAndSort(): void {
		// Filter
		this.filteredResultNotes = this.resultNotes.filter(note => {
			if (this.resultsSearchQuery && !note.name.toLowerCase().includes(this.resultsSearchQuery)) {
				return false;
			}
			return true;
		});

		// Sort
		this.filteredResultNotes.sort((a, b) => {
			let cmp: number;
			if (this.resultsSortField === 'status') {
				// New notes first when ascending
				cmp = (a.isNew ? 0 : 1) - (b.isNew ? 0 : 1);
			} else {
				cmp = a.name.localeCompare(b.name);
			}
			return this.resultsSortAscending ? cmp : -cmp;
		});

		// Update count
		if (this.resultsCountEl) {
			if (this.filteredResultNotes.length === this.resultNotes.length) {
				this.resultsCountEl.textContent = `${this.resultNotes.length} 个地点笔记：`;
			} else {
				this.resultsCountEl.textContent = `显示 ${this.filteredResultNotes.length} / ${this.resultNotes.length} 条笔记：`;
			}
		}

		// Re-render table and pagination
		this.renderResultsTable();
		this.renderResultsPagination();
	}

	/**
	 * Render the results table for the current page
	 */
	private renderResultsTable(): void {
		if (!this.resultsTableBody) return;

		this.resultsTableBody.empty();

		const startIdx = this.resultsCurrentPage * this.pageSize;
		const endIdx = Math.min(startIdx + this.pageSize, this.filteredResultNotes.length);
		const pageItems = this.filteredResultNotes.slice(startIdx, endIdx);

		for (const note of pageItems) {
			const row = this.resultsTableBody.createEl('tr');
			row.addClass('cr-place-generator-result-row');

			// Place name (clickable to open)
			const nameCell = row.createEl('td');
			const nameLink = nameCell.createEl('a', {
				text: note.name,
				cls: 'cr-place-generator-note-link'
			});
			nameLink.addEventListener('click', (e) => {
				e.preventDefault();
				void this.app.workspace.openLinkText(note.path, '');
			});

			// Status
			const statusCell = row.createEl('td');
			statusCell.textContent = note.isNew ? '已创建' : '已存在';
			statusCell.addClass(note.isNew ? 'cr-text-success' : 'crc-text--muted');

			// Edit button
			const actionCell = row.createEl('td', { cls: 'cr-place-generator-action-cell' });
			const editBtn = actionCell.createEl('button', {
				text: '编辑',
				cls: 'cr-place-generator-edit-btn'
			});
			editBtn.addEventListener('click', () => {
				void this.openPlaceForEdit(note);
			});
		}

		// Empty state
		if (pageItems.length === 0 && this.resultNotes.length > 0) {
			const row = this.resultsTableBody.createEl('tr');
			const cell = row.createEl('td', {
				text: '未找到匹配项',
				cls: 'crc-text--muted crc-text--center'
			});
			cell.setAttribute('colspan', '3');
		}
	}

	/**
	 * Render pagination for results table
	 */
	private renderResultsPagination(): void {
		if (!this.resultsPaginationContainer) return;

		this.resultsPaginationContainer.empty();

		const totalPages = Math.ceil(this.filteredResultNotes.length / this.pageSize);

		if (totalPages <= 1) {
			return;
		}

		// Previous button
		const prevBtn = this.resultsPaginationContainer.createEl('button', {
			text: '← 上一页',
			cls: 'cr-place-generator-page-btn'
		});
		prevBtn.disabled = this.resultsCurrentPage === 0;
		prevBtn.addEventListener('click', () => {
			if (this.resultsCurrentPage > 0) {
				this.resultsCurrentPage--;
				this.renderResultsTable();
				this.renderResultsPagination();
			}
		});

		// Page info
		const startItem = this.resultsCurrentPage * this.pageSize + 1;
		const endItem = Math.min((this.resultsCurrentPage + 1) * this.pageSize, this.filteredResultNotes.length);
		this.resultsPaginationContainer.createSpan({
			text: `${startItem}–${endItem} / ${this.filteredResultNotes.length}`,
			cls: 'cr-place-generator-page-info'
		});

		// Next button
		const nextBtn = this.resultsPaginationContainer.createEl('button', {
			text: '下一页 →',
			cls: 'cr-place-generator-page-btn'
		});
		nextBtn.disabled = this.resultsCurrentPage >= totalPages - 1;
		nextBtn.addEventListener('click', () => {
			if (this.resultsCurrentPage < totalPages - 1) {
				this.resultsCurrentPage++;
				this.renderResultsTable();
				this.renderResultsPagination();
			}
		});
	}

	/**
	 * Open a place note for editing
	 */
	private async openPlaceForEdit(noteInfo: PlaceNoteInfo): Promise<void> {
		// Get the file
		const file = this.app.vault.getAbstractFileByPath(noteInfo.path);
		if (!(file instanceof TFile)) {
			new Notice(`找不到文件：${noteInfo.path}`);
			return;
		}

		// Get PlaceNode from PlaceGraphService
		if (!this.placeGraph) {
			// If no placeGraph, just open the file directly
			await this.app.workspace.openLinkText(noteInfo.path, '');
			return;
		}

		// Ensure cache is loaded
		void this.placeGraph.reloadCache();

		const placeNode = this.placeGraph.getPlaceByCrId(noteInfo.crId);
		if (!placeNode) {
			// Fallback: just open the file
			await this.app.workspace.openLinkText(noteInfo.path, '');
			return;
		}

		// Open CreatePlaceModal in edit mode
		new CreatePlaceModal(this.app, {
			editPlace: placeNode,
			editFile: file,
			placeGraph: this.placeGraph,
			settings: this.settings,
			onUpdated: () => {
				new Notice(`已更新：${noteInfo.name}`);
				void this.placeGraph?.reloadCache();
			}
		}).open();
	}

	/**
	 * Update button states
	 */
	private updateButtonStates(): void {
		const canScan = !this.isScanning && !this.isGenerating &&
			(this.options.scanPersonNotes || this.options.scanEventNotes);

		const canGenerate = !this.isScanning && !this.isGenerating &&
			this.previewResult !== null &&
			(this.previewResult.notesCreated > 0 || this.previewResult.referencesUpdated > 0);

		if (this.previewButton) {
			this.previewButton.disabled = !canScan;
			this.previewButton.textContent = this.isScanning ? '正在扫描…' : '预览';
		}

		if (this.generateButton) {
			this.generateButton.disabled = !canGenerate;
			this.generateButton.textContent = this.isGenerating ? '正在生成…' : '生成';
			// Hide generate button when generating (cancel button will show)
			this.generateButton.toggleClass('crc-hidden', this.isGenerating);
		}

		if (this.cancelButton) {
			// Show cancel button only while generating
			this.cancelButton.toggleClass('crc-hidden', !this.isGenerating);
			this.cancelButton.disabled = this.isCancelled;
			this.cancelButton.textContent = this.isCancelled ? '正在取消…' : '取消';
		}
	}
}

/**
 * Simple confirmation modal for destructive actions
 */
class ConfirmationModal extends Modal {
	private titleText: string;
	private message: string;
	private onResult: (confirmed: boolean) => void;

	constructor(app: App, title: string, message: string, onResult: (confirmed: boolean) => void) {
		super(app);
		this.titleText = title;
		this.message = message;
		this.onResult = onResult;
	}

	onOpen(): void {
		const { contentEl, titleEl } = this;
		titleEl.setText(this.titleText);

		contentEl.createEl('p', { text: this.message });

		const buttonContainer = contentEl.createDiv({ cls: 'crc-confirmation-buttons' });

		const cancelBtn = buttonContainer.createEl('button', {
			text: '取消',
			cls: 'crc-btn-secondary'
		});
		cancelBtn.addEventListener('click', () => {
			this.onResult(false);
			this.close();
		});

		const confirmBtn = buttonContainer.createEl('button', {
			text: '继续',
			cls: 'mod-warning'
		});
		confirmBtn.addEventListener('click', () => {
			this.onResult(true);
			this.close();
		});
	}

	onClose(): void {
		this.contentEl.empty();
	}
}