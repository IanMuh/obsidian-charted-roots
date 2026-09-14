/**
 * Source Picker Modal
 *
 * Allows users to search and select a source to link to a person note.
 * Similar pattern to PersonPickerModal.
 */

import { App, Modal, TFile } from 'obsidian';
import { createLucideIcon } from '../../ui/lucide-icons';
import { CreateSourceModal } from './create-source-modal';
import type { SourceNote } from '../types/source-types';
import { getSourceType } from '../types/source-types';
import type CanvasRootsPlugin from '../../../main';

/**
 * Sort options for source list
 */
type SortOption = 'title-asc' | 'title-desc' | 'date-asc' | 'date-desc' | 'recent';

/**
 * Filter options for source list
 */
interface FilterOptions {
	sourceType: string; // 'all' or specific type id
	confidence: 'all' | 'high' | 'medium' | 'low' | 'unknown';
}

/**
 * Options for configuring the SourcePickerModal
 */
export interface SourcePickerOptions {
	/** Callback when a source is selected */
	onSelect: (source: SourceNote) => void | Promise<void>;
	/** cr_ids of sources to exclude from the list (e.g., already linked) */
	excludeSources?: string[];
	/** Whether to show the "Create new" button (default: true) */
	allowCreate?: boolean;
}

/**
 * Source Picker Modal
 * Allows users to search and select a source from the vault
 */
export class SourcePickerModal extends Modal {
	private plugin: CanvasRootsPlugin;
	private searchQuery: string = '';
	private allSources: SourceNote[] = [];
	private filteredSources: SourceNote[] = [];
	private options: SourcePickerOptions;
	private searchInput!: HTMLInputElement;
	private resultsContainer!: HTMLElement;
	private sortOption: SortOption = 'title-asc';
	private filters: FilterOptions = {
		sourceType: 'all',
		confidence: 'all'
	};

	constructor(app: App, plugin: CanvasRootsPlugin, options: SourcePickerOptions) {
		super(app);
		this.plugin = plugin;
		this.options = {
			allowCreate: true,  // Default to true
			...options
		};
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();

		// Add modal class for styling
		this.modalEl.addClass('cr-source-picker-modal');

		// Load all sources from vault
		this.loadSources();

		// Create modal structure
		this.createModalContent();
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}

	/**
	 * Load all source notes from the vault
	 */
	private loadSources(): void {
		const sourceService = this.plugin.getSourceService();
		let sources = sourceService.getAllSources();

		// Filter out excluded sources if specified
		if (this.options.excludeSources && this.options.excludeSources.length > 0) {
			const excludeSet = new Set(this.options.excludeSources);
			sources = sources.filter(s => !excludeSet.has(s.crId));
		}

		this.allSources = sources;

		// Initial sort by title
		this.sortSources();
		this.filteredSources = [...this.allSources];
	}

	/**
	 * Sort sources based on current sort option
	 */
	private sortSources(): void {
		switch (this.sortOption) {
			case 'title-asc':
				this.allSources.sort((a, b) => a.title.localeCompare(b.title));
				break;
			case 'title-desc':
				this.allSources.sort((a, b) => b.title.localeCompare(a.title));
				break;
			case 'date-asc':
				this.allSources.sort((a, b) => this.compareDates(a.date, b.date, true));
				break;
			case 'date-desc':
				this.allSources.sort((a, b) => this.compareDates(a.date, b.date, false));
				break;
			case 'recent':
				// Sort by file modification time
				this.allSources.sort((a, b) => {
					const fileA = this.app.vault.getAbstractFileByPath(a.filePath);
					const fileB = this.app.vault.getAbstractFileByPath(b.filePath);
					if (fileA instanceof TFile && fileB instanceof TFile) {
						return fileB.stat.mtime - fileA.stat.mtime;
					}
					return 0;
				});
				break;
		}
	}

	/**
	 * Compare dates for sorting
	 */
	private compareDates(dateA: string | undefined, dateB: string | undefined, ascending: boolean): number {
		if (!dateA && !dateB) return 0;
		if (!dateA) return 1;
		if (!dateB) return -1;

		const comparison = dateA.localeCompare(dateB);
		return ascending ? comparison : -comparison;
	}

	/**
	 * Create the modal content
	 */
	private createModalContent(): void {
		const { contentEl } = this;

		// Header
		const header = contentEl.createDiv({ cls: 'crc-picker-header' });
		const titleSection = header.createDiv({ cls: 'crc-picker-title' });
		const icon = createLucideIcon('archive', 20);
		titleSection.appendChild(icon);
		titleSection.appendText('选择来源');

		// Create new source button (conditionally shown)
		if (this.options.allowCreate !== false) {
			const createBtn = header.createEl('button', { cls: 'mod-cta cr-source-picker-create-btn' });
			createBtn.createSpan({ text: '新建' });
			createBtn.addEventListener('click', () => {
				this.close();
				new CreateSourceModal(this.app, this.plugin, {
					onSuccess: (file) => {
						// After creating, get the source and call onSelect
						if (file) {
							const sourceService = this.plugin.getSourceService();
							const source = sourceService.getSourceByPath(file.path);
							if (source) {
								void this.options.onSelect(source);
							}
						}
					}
				}).open();
			});
		}

		// Search section
		const searchSection = contentEl.createDiv({ cls: 'crc-picker-search' });

		this.searchInput = searchSection.createEl('input', {
			cls: 'crc-form-input',
			attr: {
				type: 'text',
				placeholder: '按标题、保管机构搜索…'
			}
		});

		this.searchInput.addEventListener('input', () => {
			this.searchQuery = this.searchInput.value.toLowerCase();
			this.filterSources();
		});

		// Auto-focus search input
		window.setTimeout(() => this.searchInput.focus(), 50);

		// Sort dropdown
		const sortContainer = contentEl.createDiv({ cls: 'crc-picker-sort' });
		sortContainer.createSpan({ cls: 'crc-picker-sort__label', text: '排序方式：' });
		const sortSelect = sortContainer.createEl('select', { cls: 'crc-form-select' });

		const sortOptions: Array<{ value: SortOption; label: string }> = [
			{ value: 'title-asc', label: '标题（A-Z）' },
			{ value: 'title-desc', label: '标题（Z-A）' },
			{ value: 'date-asc', label: '日期（最旧优先）' },
			{ value: 'date-desc', label: '日期（最新优先）' },
			{ value: 'recent', label: '最近修改' }
		];

		sortOptions.forEach(opt => {
			const option = sortSelect.createEl('option', { value: opt.value, text: opt.label });
			if (opt.value === this.sortOption) {
				option.selected = true;
			}
		});

		sortSelect.addEventListener('change', () => {
			this.sortOption = sortSelect.value as SortOption;
			this.sortSources();
			this.filteredSources = [...this.allSources];
			this.filterSources();
		});

		// Filters section
		const filtersContainer = contentEl.createDiv({ cls: 'crc-picker-filters' });

		// Source type filter
		const typeFilter = filtersContainer.createDiv({ cls: 'crc-picker-filter' });
		typeFilter.createSpan({ cls: 'crc-picker-filter__label', text: '类型：' });
		const typeSelect = typeFilter.createEl('select', { cls: 'crc-form-select crc-form-select--small' });

		// Get unique source types from current sources
		const sourceTypes = new Set<string>();
		this.allSources.forEach(s => sourceTypes.add(s.sourceType));

		typeSelect.createEl('option', { value: 'all', text: '全部类型' });
		Array.from(sourceTypes).sort().forEach(typeId => {
			const typeDef = getSourceType(
				typeId,
				this.plugin.settings.customSourceTypes,
				this.plugin.settings.showBuiltInSourceTypes
			);
			const label = typeDef ? typeDef.name : typeId;
			typeSelect.createEl('option', { value: typeId, text: label });
		});

		typeSelect.addEventListener('change', () => {
			this.filters.sourceType = typeSelect.value;
			this.filterSources();
		});

		// Confidence filter
		const confFilter = filtersContainer.createDiv({ cls: 'crc-picker-filter' });
		confFilter.createSpan({ cls: 'crc-picker-filter__label', text: '置信度：' });
		const confSelect = confFilter.createEl('select', { cls: 'crc-form-select crc-form-select--small' });
		[
			{ value: 'all', label: '全部' },
			{ value: 'high', label: '高' },
			{ value: 'medium', label: '中' },
			{ value: 'low', label: '低' },
			{ value: 'unknown', label: '未知' }
		].forEach(opt => {
			confSelect.createEl('option', { value: opt.value, text: opt.label });
		});
		confSelect.addEventListener('change', () => {
			this.filters.confidence = confSelect.value as FilterOptions['confidence'];
			this.filterSources();
		});

		// Results section
		this.resultsContainer = contentEl.createDiv({ cls: 'crc-picker-results' });
		this.renderResults();
	}

	/**
	 * Filter sources based on search query and filter options
	 */
	private filterSources(): void {
		this.filteredSources = this.allSources.filter(source => {
			// Search query filter
			if (this.searchQuery) {
				const matchesSearch =
					source.title.toLowerCase().includes(this.searchQuery) ||
					source.repository?.toLowerCase().includes(this.searchQuery) ||
					source.collection?.toLowerCase().includes(this.searchQuery) ||
					source.crId.toLowerCase().includes(this.searchQuery);
				if (!matchesSearch) return false;
			}

			// Source type filter
			if (this.filters.sourceType !== 'all') {
				if (source.sourceType !== this.filters.sourceType) return false;
			}

			// Confidence filter
			if (this.filters.confidence !== 'all') {
				if (source.confidence !== this.filters.confidence) return false;
			}

			return true;
		});

		this.renderResults();
	}

	/**
	 * Render the filtered results
	 */
	private renderResults(): void {
		this.resultsContainer.empty();

		if (this.filteredSources.length === 0) {
			const emptyState = this.resultsContainer.createDiv({ cls: 'crc-picker-empty' });
			const emptyIcon = createLucideIcon('archive', 48);
			emptyState.appendChild(emptyIcon);
			emptyState.createEl('p', { text: '未找到来源' });
			emptyState.createEl('p', {
				text: this.allSources.length === 0
					? '创建来源笔记以将其关联到人物'
					: '请尝试其他搜索词或筛选条件',
				cls: 'crc-text-muted'
			});
			return;
		}

		// Render source cards
		this.filteredSources.forEach(source => {
			this.renderSourceCard(source);
		});
	}

	/**
	 * Render a single source card
	 */
	private renderSourceCard(source: SourceNote): void {
		const typeDef = getSourceType(
			source.sourceType,
			this.plugin.settings.customSourceTypes,
			this.plugin.settings.showBuiltInSourceTypes
		);

		const card = this.resultsContainer.createDiv({ cls: 'crc-picker-item' });

		// Main info
		const mainInfo = card.createDiv({ cls: 'crc-picker-item__main' });
		mainInfo.createDiv({ cls: 'crc-picker-item__name', text: source.title });

		// Meta info
		const metaInfo = card.createDiv({ cls: 'crc-picker-item__meta' });

		// Type badge
		if (typeDef) {
			const typeBadge = metaInfo.createDiv({ cls: 'crc-picker-badge' });
			typeBadge.style.setProperty('background-color', typeDef.color);
			typeBadge.style.setProperty('color', this.getContrastColor(typeDef.color));
			typeBadge.textContent = typeDef.name;
		}

		// Date if available
		if (source.date) {
			const dateBadge = metaInfo.createDiv({ cls: 'crc-picker-badge crc-picker-badge--muted' });
			const dateIcon = createLucideIcon('calendar', 12);
			dateBadge.appendChild(dateIcon);
			dateBadge.appendText(source.date);
		}

		// Repository if available
		if (source.repository) {
			const repoBadge = metaInfo.createDiv({ cls: 'crc-picker-badge crc-picker-badge--muted' });
			const repoIcon = createLucideIcon('building', 12);
			repoBadge.appendChild(repoIcon);
			repoBadge.appendText(source.repository);
		}

		// Click handler
		card.addEventListener('click', () => {
			void this.options.onSelect(source);
			this.close();
		});

		// Hover effect
		card.addEventListener('mouseenter', () => {
			card.addClass('crc-picker-item--hover');
		});
		card.addEventListener('mouseleave', () => {
			card.removeClass('crc-picker-item--hover');
		});
	}

	/**
	 * Get contrasting text color for a background
	 */
	private getContrastColor(hexColor: string): string {
		const hex = hexColor.replace('#', '');
		const r = parseInt(hex.substring(0, 2), 16);
		const g = parseInt(hex.substring(2, 4), 16);
		const b = parseInt(hex.substring(4, 6), 16);
		const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
		return luminance > 0.5 ? '#000000' : '#ffffff';
	}
}
