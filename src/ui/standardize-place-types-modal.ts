/* eslint-disable @typescript-eslint/no-unsafe-member-access -- Obsidian API returns any-typed surfaces (frontmatter, file caches, plugin state); project policy accepts these. */
/**
 * Modal for standardizing place types
 * Helps convert generic types like 'locality' to specific types (city, town, village)
 */

import { App, ButtonComponent, Modal, Notice, TFile } from 'obsidian';
import { createLucideIcon, setLucideIcon } from './lucide-icons';
import { PlaceGraphService } from '../core/place-graph';
import { PlaceNode, KnownPlaceType } from '../models/place';

/**
 * Place types that should be reviewed/standardized
 */
const NON_STANDARD_TYPES = ['locality', 'municipality', 'hamlet', 'settlement'];

/**
 * Standard place types to convert to
 */
const STANDARD_SETTLEMENT_TYPES: KnownPlaceType[] = ['city', 'town', 'village'];

/**
 * Display labels for the standard settlement types (value stays the English type)
 */
const PLACE_TYPE_LABELS: Record<string, string> = {
	city: '城市',
	town: '镇',
	village: '村庄'
};

interface StandardizePlaceTypesOptions {
	onComplete?: (updated: number) => void;
}

/**
 * Modal for reviewing and standardizing place types
 */
export class StandardizePlaceTypesModal extends Modal {
	private placeService: PlaceGraphService;
	private placesToReview: PlaceNode[];
	private selectedTypes: Map<string, string>; // place id -> new type
	private appliedPlaces: Set<string>; // place ids that have been updated
	private listContainer: HTMLElement | null = null;
	private statusEl: HTMLElement | null = null;
	private onComplete?: (updated: number) => void;
	private totalUpdated = 0;

	constructor(
		app: App,
		placeService: PlaceGraphService,
		options: StandardizePlaceTypesOptions = {}
	) {
		super(app);
		this.placeService = placeService;
		this.selectedTypes = new Map();
		this.appliedPlaces = new Set();
		this.onComplete = options.onComplete;

		// Find places with non-standard types
		this.placesToReview = this.findPlacesToReview();

		// Pre-select 'city' as the default for all
		for (const place of this.placesToReview) {
			this.selectedTypes.set(place.id, 'city');
		}
	}

	/**
	 * Find places with non-standard types that should be reviewed
	 */
	private findPlacesToReview(): PlaceNode[] {
		const allPlaces = this.placeService.getAllPlaces();
		return allPlaces.filter(place =>
			place.placeType &&
			NON_STANDARD_TYPES.includes(place.placeType.toLowerCase())
		);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		// Add modal class for styling
		this.modalEl.addClass('crc-standardize-types-modal');

		// Header
		const header = contentEl.createDiv({ cls: 'crc-modal-header' });
		const titleContainer = header.createDiv({ cls: 'crc-modal-title' });
		const icon = createLucideIcon('map-pin', 24);
		titleContainer.appendChild(icon);
		titleContainer.appendText('标准化地点类型');

		// Description
		const descriptionEl = contentEl.createDiv({ cls: 'crc-standardize-description' });

		if (this.placesToReview.length === 0) {
			descriptionEl.createEl('p', {
				text: '未发现使用非标准类型的地点。所有地点类型都已标准化！',
				cls: 'crc-text--success'
			});

			const buttonContainer = contentEl.createDiv({ cls: 'crc-modal-buttons' });
			new ButtonComponent(buttonContainer)
				.setButtonText('关闭')
				.setCta()
				.onClick(() => this.close());
			return;
		}

		descriptionEl.createEl('p', {
			text: `发现 ${this.placesToReview.length} 个地点使用了"locality"之类可标准化的泛化类型。`,
			cls: 'crc-text--muted'
		});

		const explanationEl = descriptionEl.createDiv({ cls: 'crc-standardize-explanation' });
		explanationEl.createEl('p', {
			text: '导入时若无法确定具体类型，常会赋予"locality"之类的泛化类型。请逐个检查地点并选择适当的类型：',
			cls: 'crc-text--muted'
		});
		const typesList = explanationEl.createEl('ul', { cls: 'crc-field-list' });
		typesList.createEl('li', { text: '城市 — 大型城区，人口通常超过 1 万' });
		typesList.createEl('li', { text: '镇 — 中型聚居地，人口通常为 1,000–10,000' });
		typesList.createEl('li', { text: '村庄 — 小型乡村聚居地，人口通常少于 1,000' });

		// Bulk actions
		this.renderBulkActions(contentEl);

		// Status display
		this.statusEl = contentEl.createDiv({ cls: 'crc-standardize-status crc-text--muted crc-text-small crc-mb-2' });
		this.updateStatus();

		// Places list
		this.listContainer = contentEl.createDiv({ cls: 'crc-standardize-list' });
		this.renderPlacesList();

		// Footer buttons
		const buttonContainer = contentEl.createDiv({ cls: 'crc-modal-buttons' });

		new ButtonComponent(buttonContainer)
			.setButtonText('全部应用')
			.setCta()
			.onClick(() => {
				void this.applyAll();
			});

		const closeBtn = buttonContainer.createEl('button', {
			text: '关闭',
			cls: 'crc-btn'
		});
		closeBtn.addEventListener('click', () => this.close());
	}

	/**
	 * Render bulk action controls
	 */
	private renderBulkActions(container: HTMLElement) {
		const bulkActions = container.createDiv({ cls: 'crc-bulk-actions crc-mb-3' });

		bulkActions.createEl('span', {
			text: '全部设为：',
			cls: 'crc-text--muted'
		});

		for (const type of STANDARD_SETTLEMENT_TYPES) {
			const btn = bulkActions.createEl('button', {
				text: PLACE_TYPE_LABELS[type] ?? type,
				cls: 'crc-btn crc-btn--small crc-ml-1'
			});
			btn.addEventListener('click', () => this.setAllToType(type));
		}
	}

	/**
	 * Set all pending places to a specific type
	 */
	private setAllToType(type: string) {
		for (const place of this.placesToReview) {
			if (!this.appliedPlaces.has(place.id)) {
				this.selectedTypes.set(place.id, type);
			}
		}
		this.renderPlacesList();
	}

	/**
	 * Render the list of places to review
	 */
	private renderPlacesList() {
		if (!this.listContainer) return;
		this.listContainer.empty();

		const pendingPlaces = this.placesToReview.filter(p => !this.appliedPlaces.has(p.id));

		if (pendingPlaces.length === 0) {
			this.listContainer.createEl('p', {
				text: '所有地点都已更新！',
				cls: 'crc-text--success crc-text-center'
			});
			return;
		}

		for (const place of pendingPlaces) {
			this.renderPlaceRow(place);
		}
	}

	/**
	 * Render a single place row
	 */
	private renderPlaceRow(place: PlaceNode) {
		if (!this.listContainer) return;

		const row = this.listContainer.createDiv({ cls: 'crc-standardize-row' });

		// Place info
		const infoContainer = row.createDiv({ cls: 'crc-standardize-info' });

		const nameContainer = infoContainer.createDiv({ cls: 'crc-standardize-name' });
		const mapIcon = nameContainer.createSpan({ cls: 'crc-standardize-icon' });
		setLucideIcon(mapIcon, 'map-pin', 14);
		nameContainer.createSpan({ text: place.name });

		// Current type badge
		nameContainer.createSpan({
			text: place.placeType || '未知',
			cls: 'crc-stnd-type-badge crc-stnd-type-badge--current'
		});

		// Parent info if available
		if (place.parentId) {
			const parent = this.placeService.getPlaceByCrId(place.parentId);
			if (parent) {
				infoContainer.createEl('span', {
					text: `位于 ${parent.name}`,
					cls: 'crc-text--muted crc-text-small crc-ml-2'
				});
			}
		}

		// Type selector
		const selectorContainer = row.createDiv({ cls: 'crc-standardize-selector' });

		const select = selectorContainer.createEl('select', {
			cls: 'crc-select'
		});

		for (const type of STANDARD_SETTLEMENT_TYPES) {
			const option = select.createEl('option', {
				text: PLACE_TYPE_LABELS[type] ?? type,
				value: type
			});
			if (this.selectedTypes.get(place.id) === type) {
				option.selected = true;
			}
		}

		// Also add option to keep current type
		const keepOption = select.createEl('option', {
			text: `保持为 ${place.placeType}`,
			value: place.placeType || ''
		});
		if (this.selectedTypes.get(place.id) === place.placeType) {
			keepOption.selected = true;
		}

		select.addEventListener('change', () => {
			this.selectedTypes.set(place.id, select.value);
		});

		// Apply button for individual place
		const applyBtn = selectorContainer.createEl('button', {
			cls: 'crc-btn crc-btn--small crc-btn--primary crc-ml-2',
			attr: { 'aria-label': '应用' }
		});
		const checkIcon = createLucideIcon('check', 14);
		applyBtn.appendChild(checkIcon);
		applyBtn.addEventListener('click', () => {
			void this.applyToPlace(place);
		});
	}

	/**
	 * Apply type change to a single place
	 */
	private async applyToPlace(place: PlaceNode) {
		const newType = this.selectedTypes.get(place.id);
		if (!newType || newType === place.placeType) {
			// No change needed
			this.appliedPlaces.add(place.id);
			this.renderPlacesList();
			this.updateStatus();
			return;
		}

		try {
			const file = this.app.vault.getAbstractFileByPath(place.filePath);
			if (!(file instanceof TFile)) {
				new Notice(`找不到文件：${place.filePath}`);
				return;
			}

			await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
				frontmatter.place_type = newType;
			});

			this.appliedPlaces.add(place.id);
			this.totalUpdated++;
			this.renderPlacesList();
			this.updateStatus();

		} catch (error) {
			console.error('Failed to update place type:', error);
			new Notice(`更新 ${place.name} 失败：${error instanceof Error ? error.message : '未知错误'}`);
		}
	}

	/**
	 * Apply all pending type changes
	 */
	private async applyAll() {
		const pendingPlaces = this.placesToReview.filter(p => !this.appliedPlaces.has(p.id));

		if (pendingPlaces.length === 0) {
			new Notice('没有需要更新的地点');
			return;
		}

		let updated = 0;
		let skipped = 0;
		let failed = 0;

		for (const place of pendingPlaces) {
			const newType = this.selectedTypes.get(place.id);

			// Skip if keeping current type
			if (!newType || newType === place.placeType) {
				this.appliedPlaces.add(place.id);
				skipped++;
				continue;
			}

			try {
				const file = this.app.vault.getAbstractFileByPath(place.filePath);
				if (!(file instanceof TFile)) {
					failed++;
					continue;
				}

				await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
					frontmatter.place_type = newType;
				});

				this.appliedPlaces.add(place.id);
				updated++;
				this.totalUpdated++;

			} catch (error) {
				console.error('Failed to update place type:', error);
				failed++;
			}
		}

		// Update UI
		this.renderPlacesList();
		this.updateStatus();

		// Show result
		let message = `已更新 ${updated} 个地点`;
		if (skipped > 0) message += `，跳过 ${skipped} 个`;
		if (failed > 0) message += `，${failed} 个失败`;
		new Notice(message);
	}

	/**
	 * Update the status display
	 */
	private updateStatus() {
		if (!this.statusEl) return;

		const pending = this.placesToReview.length - this.appliedPlaces.size;
		const applied = this.appliedPlaces.size;

		this.statusEl.textContent = `${pending} 个待处理，${applied} 个已应用（${this.totalUpdated} 个已更新）`;
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();

		if (this.onComplete && this.totalUpdated > 0) {
			this.onComplete(this.totalUpdated);
		}
	}
}

/**
 * Find places with non-standard types that should be reviewed
 */
export function findNonStandardTypePlaces(placeService: PlaceGraphService): PlaceNode[] {
	const allPlaces = placeService.getAllPlaces();
	return allPlaces.filter(place =>
		place.placeType &&
		NON_STANDARD_TYPES.includes(place.placeType.toLowerCase())
	);
}

/* eslint-enable @typescript-eslint/no-unsafe-member-access -- Match scope of file-level disable at top. */
