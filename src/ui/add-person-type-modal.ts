import { App, Modal, TFile } from 'obsidian';
import { createLucideIcon } from './lucide-icons';

/**
 * Preview modal for adding cr_type property to person notes
 */
export class AddPersonTypePreviewModal extends Modal {
	private allChanges: Array<{ person: { name: string }; file: TFile }>;
	private filteredChanges: Array<{ person: { name: string }; file: TFile }> = [];
	private onApply: () => Promise<void>;

	// Filter state
	private searchQuery = '';
	private sortAscending = true;

	// UI elements
	private tbody: HTMLTableSectionElement | null = null;
	private countEl: HTMLElement | null = null;

	constructor(
		app: App,
		changes: Array<{ person: { name: string }; file: TFile }>,
		onApply: () => Promise<void>
	) {
		super(app);
		this.allChanges = changes;
		this.onApply = onApply;
	}

	onOpen(): void {
		const { contentEl, titleEl } = this;

		// Add modal class for sizing
		this.modalEl.addClass('crc-batch-preview-modal');

		titleEl.setText('预览：为人物笔记添加 cr_type 属性');

		// Description
		const description = contentEl.createDiv({ cls: 'crc-batch-description' });
		description.createEl('p', {
			text: '此操作将为所有尚未包含 "cr_type: person" 的人物笔记添加该属性。推荐这样做以获得更好的兼容性，并确保所有批量操作都能可靠地找到你的人物笔记。'
		});

		// Count display
		this.countEl = contentEl.createEl('p', { cls: 'crc-batch-count' });

		// Controls row: search + sort
		const controlsRow = contentEl.createDiv({ cls: 'crc-batch-controls' });

		// Search input
		const searchContainer = controlsRow.createDiv({ cls: 'crc-batch-search' });
		const searchInput = searchContainer.createEl('input', {
			type: 'text',
			placeholder: '按姓名搜索…',
			cls: 'crc-batch-search-input'
		});
		searchInput.addEventListener('input', () => {
			this.searchQuery = searchInput.value.toLowerCase();
			this.applyFiltersAndSort();
		});

		// Sort toggle
		const sortContainer = controlsRow.createDiv({ cls: 'crc-batch-sort' });
		const sortBtn = sortContainer.createEl('button', {
			text: 'A→Z',
			cls: 'crc-batch-sort-btn'
		});
		sortBtn.addEventListener('click', () => {
			this.sortAscending = !this.sortAscending;
			sortBtn.textContent = this.sortAscending ? 'A→Z' : 'Z→A';
			this.applyFiltersAndSort();
		});

		// Scrollable table container
		const tableContainer = contentEl.createDiv({ cls: 'crc-batch-table-container' });
		const table = tableContainer.createEl('table', { cls: 'crc-batch-preview-table' });

		// Header
		const thead = table.createEl('thead');
		const headerRow = thead.createEl('tr');
		headerRow.createEl('th', { text: '人物' });
		headerRow.createEl('th', { text: '操作' });

		this.tbody = table.createEl('tbody');

		// Initial render
		this.applyFiltersAndSort();

		// Backup warning
		const warning = contentEl.createDiv({ cls: 'crc-warning-callout' });
		const warningIcon = createLucideIcon('alert-triangle', 16);
		warning.appendChild(warningIcon);
		warning.createSpan({
			text: ' 继续操作前请先备份你的库。此操作会修改现有笔记。'
		});

		// Buttons
		const buttonContainer = contentEl.createDiv({ cls: 'crc-confirmation-buttons' });

		const cancelButton = buttonContainer.createEl('button', {
			text: '取消',
			cls: 'crc-btn-secondary'
		});
		cancelButton.addEventListener('click', () => this.close());

		const applyButton = buttonContainer.createEl('button', {
			text: `应用到 ${this.allChanges.length} 条笔记`,
			cls: 'mod-cta'
		});
		applyButton.addEventListener('click', () => {
			void (async () => {
				// Disable buttons during operation
				applyButton.disabled = true;
				cancelButton.disabled = true;
				applyButton.textContent = '正在应用更改…';

				// Run the operation
				await this.onApply();

				// Close the modal after completion (like BuildPlaceHierarchyModal)
				// This avoids stale cache issues when user reopens the preview
				this.close();
			})();
		});
	}

	/**
	 * Apply filters and sorting, then re-render the table
	 */
	private applyFiltersAndSort(): void {
		// Filter
		this.filteredChanges = this.allChanges.filter(change => {
			// Search filter
			if (this.searchQuery && !change.person.name.toLowerCase().includes(this.searchQuery)) {
				return false;
			}
			return true;
		});

		// Sort by person name
		this.filteredChanges.sort((a, b) => {
			const comparison = a.person.name.localeCompare(b.person.name);
			return this.sortAscending ? comparison : -comparison;
		});

		// Update count
		if (this.countEl) {
			this.countEl.textContent = `共 ${this.allChanges.length} 条需要 cr_type 属性的人物笔记，显示 ${this.filteredChanges.length} 条`;
		}

		// Render table
		this.renderTable();
	}

	/**
	 * Render the table with current filtered/sorted data
	 */
	private renderTable(): void {
		if (!this.tbody) return;

		// Clear existing rows
		this.tbody.empty();

		for (const change of this.filteredChanges) {
			const row = this.tbody.createEl('tr');

			// Person name
			row.createEl('td', { text: change.person.name });

			// Action description
			row.createEl('td', {
				text: '添加 cr_type: person',
				cls: 'crc-batch-value'
			});
		}

		// Show empty state if no results
		if (this.filteredChanges.length === 0) {
			const emptyRow = this.tbody.createEl('tr');
			const emptyCell = emptyRow.createEl('td', {
				attr: { colspan: '2' },
				cls: 'crc-batch-empty'
			});
			emptyCell.createEl('p', {
				text: '没有匹配搜索的人物笔记'
			});
		}
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
