/**
 * Place Lookup Modal
 *
 * Modal for looking up place information from external sources
 * (Wikidata, GeoNames, Nominatim). Allows users to search, view results,
 * and select a result to populate place data.
 */

import { App, Modal, Setting, Notice, setIcon } from 'obsidian';
import {
	PlaceLookupService,
	PlaceLookupResult,
	PlaceLookupSource,
	PlaceLookupOptions
} from '../services/place-lookup-service';
import type { CanvasRootsSettings } from '../../settings';

/**
 * Callback when a place result is selected
 */
export interface PlaceLookupCallback {
	(result: PlaceLookupResult): void;
}

/**
 * Options for the place lookup modal
 */
export interface PlaceLookupModalOptions {
	/** Initial search query */
	initialQuery?: string;
	/** Settings for GeoNames username etc. */
	settings?: CanvasRootsSettings;
	/** Callback when a result is selected */
	onSelect?: PlaceLookupCallback;
	/** Whether to show the "Create place" button (for standalone mode) */
	showCreateButton?: boolean;
}

/**
 * Source display information
 */
const SOURCE_INFO: Record<PlaceLookupSource, { name: string; icon: string; description: string }> = {
	wikidata: {
		name: 'Wikidata',
		icon: 'globe',
		description: '包含详细地点信息的结构化知识库'
	},
	geonames: {
		name: 'GeoNames',
		icon: 'map',
		description: '带层级结构的综合地理数据库'
	},
	nominatim: {
		name: 'OpenStreetMap',
		icon: 'map-pin',
		description: '来自 OpenStreetMap 数据的地理编码'
	},
	familysearch: {
		name: 'FamilySearch',
		icon: 'users',
		description: '历史地点数据（第三阶段）'
	},
	gov: {
		name: 'GOV',
		icon: 'building-2',
		description: '德国/欧洲历史行政区划（第三阶段）'
	}
};

/**
 * Modal for looking up place information from external sources
 */
export class PlaceLookupModal extends Modal {
	private service: PlaceLookupService;
	private settings?: CanvasRootsSettings;
	private onSelect?: PlaceLookupCallback;
	private showCreateButton: boolean;

	// UI state
	private searchQuery: string = '';
	// Only wikidata and nominatim selected by default; geonames requires username
	private selectedSources: Set<PlaceLookupSource> = new Set(['wikidata', 'nominatim']);
	private results: PlaceLookupResult[] = [];
	private isLoading: boolean = false;
	private errorMessage?: string;

	// UI elements
	private searchInputEl?: HTMLInputElement;
	private resultsContainerEl?: HTMLElement;
	private loadingEl?: HTMLElement;
	private errorEl?: HTMLElement;

	constructor(app: App, options?: PlaceLookupModalOptions) {
		super(app);
		this.service = new PlaceLookupService(options?.settings?.geonamesUsername);
		this.settings = options?.settings;
		this.onSelect = options?.onSelect;
		this.showCreateButton = options?.showCreateButton ?? false;

		if (options?.initialQuery) {
			this.searchQuery = options.initialQuery;
		}

		// Add geonames to selected sources if it's enabled (has username)
		if (options?.settings?.geonamesUsername) {
			this.selectedSources.add('geonames');
		}
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		// Add modal class to modalEl for proper sizing (like other create modals)
		this.modalEl.addClass('crc-place-lookup-modal');

		// Header (using crc- prefix to match other modals)
		const header = contentEl.createDiv({ cls: 'crc-modal-header' });
		const titleContainer = header.createDiv({ cls: 'crc-modal-title' });
		setIcon(titleContainer.createSpan(), 'search');
		titleContainer.appendText('查找地点');

		// Form container (using crc-form for consistent styling)
		const form = contentEl.createDiv({ cls: 'crc-form' });

		// Search input with button - use standard Setting pattern
		new Setting(form)
			.setName('地点名称')
			.setDesc('输入要搜索的地点名称')
			.addText(text => {
				this.searchInputEl = text.inputEl;
				text
					.setPlaceholder('例如：伦敦、斯普林菲尔德 IL、慕尼黑')
					.setValue(this.searchQuery)
					.onChange(value => {
						this.searchQuery = value;
					});

				// Search on Enter
				text.inputEl.addEventListener('keydown', (e) => {
					if (e.key === 'Enter') {
						e.preventDefault();
						void this.performSearch();
					}
				});
			})
			.addButton(btn => {
				btn
					.setButtonText('搜索')
					.setCta()
					.onClick(() => void this.performSearch());
			});

		// Source selection
		const sourcesSection = form.createDiv({ cls: 'cr-lookup-sources-section' });
		sourcesSection.createEl('label', { text: '来源', cls: 'cr-lookup-sources-label' });

		const sourcesRow = sourcesSection.createDiv({ cls: 'cr-lookup-sources-row' });

		// Phase 1 sources only
		const availableSources: PlaceLookupSource[] = ['wikidata', 'geonames', 'nominatim'];

		for (const source of availableSources) {
			const info = SOURCE_INFO[source];
			const isEnabled = this.isSourceEnabled(source);
			const isSelected = this.selectedSources.has(source) && isEnabled;

			const sourceChip = sourcesRow.createDiv({
				cls: `cr-lookup-source-chip${isSelected ? ' cr-lookup-source-chip--selected' : ''}${!isEnabled ? ' cr-lookup-source-chip--disabled' : ''}`
			});

			const chipIcon = sourceChip.createSpan({ cls: 'cr-lookup-source-chip-icon' });
			setIcon(chipIcon, info.icon);
			sourceChip.createSpan({ text: info.name, cls: 'cr-lookup-source-chip-name' });

			if (!isEnabled) {
				sourceChip.setAttribute('title', this.getDisabledReason(source));
			} else {
				sourceChip.setAttribute('title', info.description);
				sourceChip.addEventListener('click', () => {
					this.toggleSource(source);
					sourceChip.toggleClass('cr-lookup-source-chip--selected', this.selectedSources.has(source));
				});
			}
		}

		// Loading indicator
		this.loadingEl = contentEl.createDiv({ cls: 'cr-lookup-loading cr-hidden' });
		this.loadingEl.createDiv({ cls: 'cr-lookup-spinner' });
		this.loadingEl.createSpan({ text: '搜索中…' });

		// Error message
		this.errorEl = contentEl.createDiv({ cls: 'cr-lookup-error cr-hidden' });

		// Results section
		this.resultsContainerEl = contentEl.createDiv({ cls: 'cr-lookup-results' });

		// Show initial message
		this.renderEmptyState();

		// Auto-search if initial query provided
		if (this.searchQuery) {
			void this.performSearch();
		}

		// Footer with cancel button
		const footer = contentEl.createDiv({ cls: 'cr-modal-footer' });
		const cancelBtn = footer.createEl('button', {
			text: '取消',
			cls: 'cr-btn'
		});
		cancelBtn.addEventListener('click', () => this.close());
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}

	/**
	 * Check if a source is enabled based on settings
	 */
	private isSourceEnabled(source: PlaceLookupSource): boolean {
		if (source === 'geonames') {
			// GeoNames requires a username
			return !!this.settings?.geonamesUsername;
		}
		// Phase 3 sources are not yet available
		if (source === 'familysearch' || source === 'gov') {
			return false;
		}
		return true;
	}

	/**
	 * Get reason why a source is disabled
	 */
	private getDisabledReason(source: PlaceLookupSource): string {
		if (source === 'geonames' && !this.settings?.geonamesUsername) {
			return 'GeoNames 需要用户名。请在设置 → 地点 → 地点查找中配置';
		}
		if (source === 'familysearch') {
			return 'FamilySearch 集成将在第三阶段推出';
		}
		if (source === 'gov') {
			return 'GOV 集成将在第三阶段推出';
		}
		return '来源不可用';
	}

	/**
	 * Toggle source selection
	 */
	private toggleSource(source: PlaceLookupSource): void {
		if (this.selectedSources.has(source)) {
			// Don't allow deselecting all sources
			if (this.selectedSources.size > 1) {
				this.selectedSources.delete(source);
			}
		} else {
			this.selectedSources.add(source);
		}
	}

	/**
	 * Perform the search
	 */
	private async performSearch(): Promise<void> {
		const query = this.searchQuery.trim();

		if (!query) {
			new Notice('请输入要搜索的地点名称');
			return;
		}

		if (this.selectedSources.size === 0) {
			new Notice('请至少选择一个来源');
			return;
		}

		// Filter to only enabled sources
		const enabledSources = Array.from(this.selectedSources).filter(s => this.isSourceEnabled(s));

		if (enabledSources.length === 0) {
			new Notice('未选择已启用的来源。请在设置中配置 GeoNames 用户名。');
			return;
		}

		this.isLoading = true;
		this.errorMessage = undefined;
		this.results = [];
		this.updateUI();

		try {
			const options: PlaceLookupOptions = {
				sources: enabledSources,
				maxResults: 5
			};

			this.results = await this.service.lookup(query, options);

			if (this.results.length === 0) {
				this.errorMessage = `未找到"${query}"的结果。请尝试其他拼写或添加更多上下文（例如：城市、国家）。`;
			}
		} catch (error) {
			console.error('Place lookup failed:', error);
			this.errorMessage = `搜索失败：${error instanceof Error ? error.message : '未知错误'}`;
		} finally {
			this.isLoading = false;
			this.updateUI();
		}
	}

	/**
	 * Update the UI based on current state
	 */
	private updateUI(): void {
		// Loading state
		if (this.loadingEl) {
			this.loadingEl.toggleClass('cr-hidden', !this.isLoading);
		}

		// Error state
		if (this.errorEl) {
			this.errorEl.toggleClass('cr-hidden', !this.errorMessage);
			if (this.errorMessage) {
				this.errorEl.empty();
				const errorIcon = this.errorEl.createSpan({ cls: 'cr-lookup-error-icon' });
				setIcon(errorIcon, 'alert-circle');
				this.errorEl.createSpan({ text: this.errorMessage });
			}
		}

		// Results
		if (this.resultsContainerEl) {
			this.resultsContainerEl.empty();

			if (this.isLoading) {
				return;
			}

			if (this.results.length === 0 && !this.errorMessage) {
				this.renderEmptyState();
				return;
			}

			if (this.results.length > 0) {
				this.renderResults();
			}
		}
	}

	/**
	 * Render empty state message
	 */
	private renderEmptyState(): void {
		if (!this.resultsContainerEl) return;

		const empty = this.resultsContainerEl.createDiv({ cls: 'cr-lookup-empty' });
		const emptyIcon = empty.createDiv({ cls: 'cr-lookup-empty-icon' });
		setIcon(emptyIcon, 'search');
		empty.createEl('p', { text: '输入地点名称并点击"搜索"以查找地点信息。' });
		empty.createEl('p', {
			text: '结果包含来自多个来源的坐标、地点类型和层级。',
			cls: 'cr-text-muted'
		});
	}

	/**
	 * Render search results
	 */
	private renderResults(): void {
		if (!this.resultsContainerEl) return;

		const resultsHeader = this.resultsContainerEl.createDiv({ cls: 'cr-lookup-results-header' });
		resultsHeader.createEl('h4', { text: `找到 ${this.results.length} 个结果` });

		const resultsList = this.resultsContainerEl.createDiv({ cls: 'cr-lookup-results-list' });

		for (const result of this.results) {
			this.renderResultCard(resultsList, result);
		}
	}

	/**
	 * Render a single result card
	 */
	private renderResultCard(container: HTMLElement, result: PlaceLookupResult): void {
		const card = container.createDiv({ cls: 'cr-lookup-result-card' });

		// Header with source badge and name
		const cardHeader = card.createDiv({ cls: 'cr-lookup-result-header' });

		const sourceInfo = SOURCE_INFO[result.source];
		const sourceBadge = cardHeader.createSpan({ cls: `cr-lookup-source-badge cr-lookup-source-badge--${result.source}` });
		const badgeIcon = sourceBadge.createSpan({ cls: 'cr-lookup-source-badge-icon' });
		setIcon(badgeIcon, sourceInfo.icon);
		sourceBadge.createSpan({ text: sourceInfo.name });

		cardHeader.createSpan({
			cls: `cr-lookup-confidence-badge ${this.getConfidenceClass(result.confidence)}`,
			text: `${Math.round(result.confidence * 100)}%`
		});

		// Place name
		const nameRow = card.createDiv({ cls: 'cr-lookup-result-name' });
		nameRow.createEl('strong', { text: result.standardizedName });

		// Details
		const details = card.createDiv({ cls: 'cr-lookup-result-details' });

		// Place type
		if (result.placeType) {
			const typeRow = details.createDiv({ cls: 'cr-lookup-result-detail' });
			const typeIcon = typeRow.createSpan({ cls: 'cr-lookup-detail-icon' });
			setIcon(typeIcon, 'tag');
			typeRow.createSpan({ text: this.formatPlaceType(result.placeType) });
		}

		// Coordinates
		if (result.coordinates) {
			const coordRow = details.createDiv({ cls: 'cr-lookup-result-detail' });
			const coordIcon = coordRow.createSpan({ cls: 'cr-lookup-detail-icon' });
			setIcon(coordIcon, 'map-pin');
			coordRow.createSpan({
				text: `${result.coordinates.lat.toFixed(4)}, ${result.coordinates.lng.toFixed(4)}`
			});
		}

		// Hierarchy
		if (result.hierarchy && result.hierarchy.length > 0) {
			const hierRow = details.createDiv({ cls: 'cr-lookup-result-detail' });
			const hierIcon = hierRow.createSpan({ cls: 'cr-lookup-detail-icon' });
			setIcon(hierIcon, 'git-branch');
			hierRow.createSpan({ text: result.hierarchy.join(' → ') });
		}

		// Parent place
		if (result.parentPlace && (!result.hierarchy || result.hierarchy.length === 0)) {
			const parentRow = details.createDiv({ cls: 'cr-lookup-result-detail' });
			const parentIcon = parentRow.createSpan({ cls: 'cr-lookup-detail-icon' });
			setIcon(parentIcon, 'corner-up-right');
				parentRow.createSpan({ text: `父级：${result.parentPlace}` });
		}

		// External ID
		if (result.externalId) {
			const idRow = details.createDiv({ cls: 'cr-lookup-result-detail cr-text-muted' });
			const idIcon = idRow.createSpan({ cls: 'cr-lookup-detail-icon' });
			setIcon(idIcon, 'hash');
			idRow.createSpan({ text: result.externalId });
		}

		// Action button
		const cardFooter = card.createDiv({ cls: 'cr-lookup-result-footer' });

		const useButton = cardFooter.createEl('button', {
			text: '使用此地点',
			cls: 'cr-btn cr-btn--primary cr-btn--small'
		});
		useButton.addEventListener('click', () => {
			this.selectResult(result);
		});
	}

	/**
	 * Get CSS class for confidence level
	 */
	private getConfidenceClass(confidence: number): string {
		if (confidence >= 0.8) return 'cr-lookup-confidence--high';
		if (confidence >= 0.5) return 'cr-lookup-confidence--medium';
		return 'cr-lookup-confidence--low';
	}

	/**
	 * Format place type for display
	 */
	private formatPlaceType(type: string): string {
		return type.charAt(0).toUpperCase() + type.slice(1).replace(/-/g, ' ');
	}

	/**
	 * Select a result and trigger callback
	 */
	private selectResult(result: PlaceLookupResult): void {
		if (this.onSelect) {
			this.onSelect(result);
		}
		this.close();
	}
}