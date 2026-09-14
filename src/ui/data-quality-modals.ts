/**
 * Data Quality modal classes used by the Data Quality tab
 *
 * Extracted from control-center.ts to reduce file size. Contains all preview
 * modals for batch operations: duplicate relationships, placeholder removal,
 * name normalization, orphaned references, bidirectional inconsistencies,
 * impossible dates, generic batch operations, confirmation dialog, and
 * date validation.
 */

import { App, Modal, TFile, setIcon } from 'obsidian';
import type CanvasRootsPlugin from '../../main';
import { createLucideIcon } from './lucide-icons';
import type { NormalizationPreview } from '../core/data-quality';

// ==========================================================================
// DuplicateRelationshipsPreviewModal
// ==========================================================================

/**
 * Modal for previewing duplicate relationship removal
 */
export class DuplicateRelationshipsPreviewModal extends Modal {
	// All changes for this operation
	private allChanges: Array<{ person: { name: string }; field: string; oldValue: string; newValue: string; file: TFile }>;
	// Filtered/sorted changes for display
	private filteredChanges: Array<{ person: { name: string }; field: string; oldValue: string; newValue: string; file: TFile }> = [];
	private onApply: () => Promise<void>;

	// Filter state
	private searchQuery = '';
	private selectedField = 'all';
	private sortAscending = true;

	// UI elements
	private tbody: HTMLTableSectionElement | null = null;
	private countEl: HTMLElement | null = null;

	constructor(
		app: App,
		changes: Array<{ person: { name: string }; field: string; oldValue: string; newValue: string; file: TFile }>,
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

		titleEl.setText('预览：移除重复关系');

		// Count display
		this.countEl = contentEl.createEl('p', { cls: 'crc-batch-count' });

		// Controls row: search + filter + sort
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

		// Field filter dropdown (only show if multiple fields)
		const uniqueFields = [...new Set(this.allChanges.map(c => c.field))];
		if (uniqueFields.length > 1) {
			const filterContainer = controlsRow.createDiv({ cls: 'crc-batch-filter' });
			const filterSelect = filterContainer.createEl('select', { cls: 'crc-batch-filter-select' });
			filterSelect.createEl('option', { text: '所有字段', value: 'all' });
			for (const field of uniqueFields.sort()) {
				filterSelect.createEl('option', { text: field, value: field });
			}
			filterSelect.addEventListener('change', () => {
				this.selectedField = filterSelect.value;
				this.applyFiltersAndSort();
			});
		}

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
		headerRow.createEl('th', { text: '字段' });
		headerRow.createEl('th', { text: '当前' });
		headerRow.createEl('th', { text: '更改后' });
		headerRow.createEl('th', { text: '操作' });

		this.tbody = table.createEl('tbody');

		// Initial render
		this.applyFiltersAndSort();

		// Backup warning
		const warning = contentEl.createDiv({ cls: 'crc-warning-callout' });
		const warningIcon = createLucideIcon('alert-triangle', 16);
		warning.appendChild(warningIcon);
		warning.createSpan({
			text: ' 操作前请备份你的库。此操作将修改现有笔记。'
		});

		// Buttons
		const buttonContainer = contentEl.createDiv({ cls: 'crc-confirmation-buttons' });

		const cancelButton = buttonContainer.createEl('button', {
			text: '取消',
			cls: 'crc-btn-secondary'
		});
		cancelButton.addEventListener('click', () => this.close());

		const applyButton = buttonContainer.createEl('button', {
			text: `应用 ${this.allChanges.length} 项更改`,
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
			// Field filter
			if (this.selectedField !== 'all' && change.field !== this.selectedField) {
				return false;
			}
			return true;
		});

		// Sort by person name
		this.filteredChanges.sort((a, b) => {
			const cmp = a.person.name.localeCompare(b.person.name);
			return this.sortAscending ? cmp : -cmp;
		});

		// Update count
		if (this.countEl) {
			const peopleCount = new Set(this.allChanges.map(c => c.person.name)).size;
			if (this.filteredChanges.length === this.allChanges.length) {
				this.countEl.textContent = `在 ${peopleCount} 位人物中发现 ${this.allChanges.length} 条重复关系：`;
			} else {
				this.countEl.textContent = `显示 ${this.allChanges.length} 条重复条目中的 ${this.filteredChanges.length} 条：`;
			}
		}

		// Re-render table
		this.renderTable();
	}

	/**
	 * Render the filtered/sorted changes to the table body
	 */
	private renderTable(): void {
		if (!this.tbody) return;

		this.tbody.empty();

		for (const change of this.filteredChanges) {
			const row = this.tbody.createEl('tr');
			row.createEl('td', { text: change.person.name });
			row.createEl('td', { text: change.field });
			// Old value with strikethrough
			const oldCell = row.createEl('td', { cls: 'crc-batch-old-value' });
			oldCell.createEl('s', { text: change.oldValue, cls: 'crc-text--muted' });
			row.createEl('td', { text: change.newValue, cls: 'crc-batch-new-value' });

			// Action buttons (inline)
			const actionCell = row.createEl('td', { cls: 'crc-batch-actions crc-batch-actions--inline' });

			// Open in new tab button
			const openTabBtn = actionCell.createEl('button', {
				cls: 'crc-batch-action-btn clickable-icon',
				attr: { 'aria-label': '在新标签页中打开笔记' }
			});
			const fileIcon = createLucideIcon('file-text', 14);
			openTabBtn.appendChild(fileIcon);
			openTabBtn.addEventListener('click', () => {
				void this.app.workspace.getLeaf('tab').openFile(change.file);
			});

			// Open in new window button
			const openWindowBtn = actionCell.createEl('button', {
				cls: 'crc-batch-action-btn clickable-icon',
				attr: { 'aria-label': '在新窗口中打开笔记' }
			});
			const windowIcon = createLucideIcon('external-link', 14);
			openWindowBtn.appendChild(windowIcon);
			openWindowBtn.addEventListener('click', () => {
				void this.app.workspace.getLeaf('window').openFile(change.file);
			});
		}

		if (this.filteredChanges.length === 0 && this.allChanges.length > 0) {
			const row = this.tbody.createEl('tr');
			const cell = row.createEl('td', {
				text: '未找到匹配项',
				cls: 'crc-text-muted'
			});
			cell.setAttribute('colspan', '5');
		}
	}

	onClose(): void {
		const { contentEl } = this;
		contentEl.empty();
	}
}

// ==========================================================================
// PlaceholderRemovalPreviewModal
// ==========================================================================

/**
 * Modal for previewing placeholder value removal
 */
export class PlaceholderRemovalPreviewModal extends Modal {
	// All changes for this operation
	private allChanges: Array<{ person: { name: string }; field: string; oldValue: string; newValue: string; file: TFile }>;
	// Filtered/sorted changes for display
	private filteredChanges: Array<{ person: { name: string }; field: string; oldValue: string; newValue: string; file: TFile }> = [];
	private onApply: () => Promise<void>;

	// Filter state
	private searchQuery = '';
	private selectedField = 'all';
	private sortAscending = true;

	// UI elements
	private tbody: HTMLTableSectionElement | null = null;
	private countEl: HTMLElement | null = null;

	constructor(
		app: App,
		changes: Array<{ person: { name: string }; field: string; oldValue: string; newValue: string; file: TFile }>,
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

		titleEl.setText('预览：移除占位符值');

		// Description
		const description = contentEl.createDiv({ cls: 'crc-batch-description' });
		description.createEl('p', {
			text: '此操作会移除 GEDCOM 导入和数据录入错误中常见的占位符值：'
		});
		const useCases = description.createEl('ul');
		useCases.createEl('li', { text: '占位文本：(unknown)、Unknown、N/A、???、Empty、None' });
		useCases.createEl('li', { text: '格式错误的 wikilink：括号不匹配的 [[unknown) ]]' });
		useCases.createEl('li', { text: '地点中的前导逗号：", , , Canada" → "Canada"' });
		useCases.createEl('li', { text: '显示为"Empty"的空父母/配偶字段' });

		// Count display
		this.countEl = contentEl.createEl('p', { cls: 'crc-batch-count' });

		// Controls row: search + filter + sort
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

		// Field filter dropdown (only show if multiple fields)
		const uniqueFields = [...new Set(this.allChanges.map(c => c.field))];
		if (uniqueFields.length > 1) {
			const filterContainer = controlsRow.createDiv({ cls: 'crc-batch-filter' });
			const filterSelect = filterContainer.createEl('select', { cls: 'crc-batch-filter-select' });
			filterSelect.createEl('option', { text: '所有字段', value: 'all' });
			for (const field of uniqueFields.sort()) {
				filterSelect.createEl('option', { text: field, value: field });
			}
			filterSelect.addEventListener('change', () => {
				this.selectedField = filterSelect.value;
				this.applyFiltersAndSort();
			});
		}

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
		headerRow.createEl('th', { text: '字段' });
		headerRow.createEl('th', { text: '当前' });
		headerRow.createEl('th', { text: '更改后' });
		headerRow.createEl('th', { text: '操作' });

		this.tbody = table.createEl('tbody');

		// Initial render
		this.applyFiltersAndSort();

		// Backup warning
		const warning = contentEl.createDiv({ cls: 'crc-warning-callout' });
		const warningIcon = createLucideIcon('alert-triangle', 16);
		warning.appendChild(warningIcon);
		warning.createSpan({
			text: ' 操作前请备份你的库。此操作将修改现有笔记。'
		});

		// Buttons
		const buttonContainer = contentEl.createDiv({ cls: 'crc-confirmation-buttons' });

		const cancelButton = buttonContainer.createEl('button', {
			text: '取消',
			cls: 'crc-btn-secondary'
		});
		cancelButton.addEventListener('click', () => this.close());

		const applyButton = buttonContainer.createEl('button', {
			text: `应用 ${this.allChanges.length} 项更改`,
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
			// Field filter
			if (this.selectedField !== 'all' && change.field !== this.selectedField) {
				return false;
			}
			return true;
		});

		// Sort by person name
		this.filteredChanges.sort((a, b) => {
			const cmp = a.person.name.localeCompare(b.person.name);
			return this.sortAscending ? cmp : -cmp;
		});

		// Update count
		if (this.countEl) {
			const peopleCount = new Set(this.allChanges.map(c => c.person.name)).size;
			if (this.filteredChanges.length === this.allChanges.length) {
				this.countEl.textContent = `在 ${peopleCount} 位人物中发现 ${this.allChanges.length} 个占位符值：`;
			} else {
				this.countEl.textContent = `显示 ${this.allChanges.length} 个占位符值中的 ${this.filteredChanges.length} 个：`;
			}
		}

		// Re-render table
		this.renderTable();
	}

	/**
	 * Render the filtered/sorted changes to the table body
	 */
	private renderTable(): void {
		if (!this.tbody) return;

		this.tbody.empty();

		for (const change of this.filteredChanges) {
			const row = this.tbody.createEl('tr');
			row.createEl('td', { text: change.person.name });
			row.createEl('td', { text: change.field });
			row.createEl('td', { text: change.oldValue, cls: 'crc-batch-old-value' });
			row.createEl('td', { text: change.newValue, cls: 'crc-batch-new-value' });

			// Action buttons
			const actionCell = row.createEl('td', { cls: 'crc-batch-actions crc-batch-actions--inline' });

			// Open in new tab button
			const openTabBtn = actionCell.createEl('button', {
				cls: 'crc-batch-action-btn clickable-icon',
				attr: { 'aria-label': '在新标签页中打开笔记' }
			});
			const fileIcon = createLucideIcon('file-text', 14);
			openTabBtn.appendChild(fileIcon);
			openTabBtn.addEventListener('click', () => {
				void this.app.workspace.getLeaf('tab').openFile(change.file);
			});

			// Open in new window button
			const openWindowBtn = actionCell.createEl('button', {
				cls: 'crc-batch-action-btn clickable-icon',
				attr: { 'aria-label': '在新窗口中打开笔记' }
			});
			const windowIcon = createLucideIcon('external-link', 14);
			openWindowBtn.appendChild(windowIcon);
			openWindowBtn.addEventListener('click', () => {
				void this.app.workspace.getLeaf('window').openFile(change.file);
			});
		}

		if (this.filteredChanges.length === 0 && this.allChanges.length > 0) {
			const row = this.tbody.createEl('tr');
			const cell = row.createEl('td', {
				text: '未找到匹配项',
				cls: 'crc-text-muted'
			});
			cell.setAttribute('colspan', '5');
		}
	}

	onClose(): void {
		const { contentEl } = this;
		contentEl.empty();
	}
}

// ==========================================================================
// NameNormalizationPreviewModal
// ==========================================================================

/**
 * Modal for previewing name formatting normalization
 */
export class NameNormalizationPreviewModal extends Modal {
	// All changes for this operation
	private allChanges: Array<{ person: { name: string }; field: string; oldValue: string; newValue: string; file: TFile }>;
	// Filtered/sorted changes for display
	private filteredChanges: Array<{ person: { name: string }; field: string; oldValue: string; newValue: string; file: TFile }> = [];
	private onApply: () => Promise<void>;

	// Filter state
	private searchQuery = '';
	private sortAscending = true;

	// UI elements
	private tbody: HTMLTableSectionElement | null = null;
	private countEl: HTMLElement | null = null;

	constructor(
		app: App,
		changes: Array<{ person: { name: string }; field: string; oldValue: string; newValue: string; file: TFile }>,
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

		titleEl.setText('预览：规范化姓名格式');

		// Description
		const description = contentEl.createDiv({ cls: 'crc-batch-description' });
		description.createEl('p', {
			text: '此操作会统一姓名大小写并处理姓氏前缀：'
		});
		const useCases = description.createEl('ul');
		useCases.createEl('li', { text: '全大写姓名："JOHN SMITH" → "John Smith"' });
		useCases.createEl('li', { text: '小写姓名："john doe" → "John Doe"' });
		useCases.createEl('li', { text: 'Mac/Mc 前缀："macdonald" → "MacDonald"，"mccarthy" → "McCarthy"' });
		useCases.createEl('li', { text: "O' 前缀：\"o'brien\" → \"O'Brien\"" });
		useCases.createEl('li', { text: '荷兰语/德语前缀："Vincent Van Gogh" → "Vincent van Gogh"' });
		useCases.createEl('li', { text: '多个连续空格合并为单个空格' });

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
		headerRow.createEl('th', { text: '当前姓名' });
		headerRow.createEl('th', { text: '规范化后姓名' });
		headerRow.createEl('th', { text: '操作' });

		this.tbody = table.createEl('tbody');

		// Initial render
		this.applyFiltersAndSort();

		// Backup warning
		const warning = contentEl.createDiv({ cls: 'crc-warning-callout' });
		const warningIcon = createLucideIcon('alert-triangle', 16);
		warning.appendChild(warningIcon);
		warning.createSpan({
			text: ' 操作前请备份你的库。此操作将修改现有笔记。'
		});

		// Buttons
		const buttonContainer = contentEl.createDiv({ cls: 'crc-confirmation-buttons' });

		const cancelButton = buttonContainer.createEl('button', {
			text: '取消',
			cls: 'crc-btn-secondary'
		});
		cancelButton.addEventListener('click', () => this.close());

		const applyButton = buttonContainer.createEl('button', {
			text: `应用 ${this.allChanges.length} 项更改`,
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
			const cmp = a.person.name.localeCompare(b.person.name);
			return this.sortAscending ? cmp : -cmp;
		});

		// Update count
		if (this.countEl) {
			const peopleCount = new Set(this.allChanges.map(c => c.person.name)).size;
			if (this.filteredChanges.length === this.allChanges.length) {
				this.countEl.textContent = `在 ${peopleCount} 位人物中发现 ${this.allChanges.length} 个待规范化的姓名：`;
			} else {
				this.countEl.textContent = `显示 ${this.allChanges.length} 个姓名中的 ${this.filteredChanges.length} 个：`;
			}
		}

		// Re-render table
		this.renderTable();
	}

	/**
	 * Render the filtered/sorted changes to the table body
	 */
	private renderTable(): void {
		if (!this.tbody) return;

		this.tbody.empty();

		for (const change of this.filteredChanges) {
			const row = this.tbody.createEl('tr');
			row.createEl('td', { text: change.person.name });
			row.createEl('td', { text: change.oldValue, cls: 'crc-batch-old-value' });
			row.createEl('td', { text: change.newValue, cls: 'crc-batch-new-value' });

			// Action buttons
			const actionCell = row.createEl('td', { cls: 'crc-batch-actions crc-batch-actions--inline' });

			// Open in new tab button
			const openTabBtn = actionCell.createEl('button', {
				cls: 'crc-batch-action-btn clickable-icon',
				attr: { 'aria-label': '在新标签页中打开笔记' }
			});
			const fileIcon = createLucideIcon('file-text', 14);
			openTabBtn.appendChild(fileIcon);
			openTabBtn.addEventListener('click', () => {
				void this.app.workspace.getLeaf('tab').openFile(change.file);
			});

			// Open in new window button
			const openWindowBtn = actionCell.createEl('button', {
				cls: 'crc-batch-action-btn clickable-icon',
				attr: { 'aria-label': '在新窗口中打开笔记' }
			});
			const windowIcon = createLucideIcon('external-link', 14);
			openWindowBtn.appendChild(windowIcon);
			openWindowBtn.addEventListener('click', () => {
				void this.app.workspace.getLeaf('window').openFile(change.file);
			});
		}

		if (this.filteredChanges.length === 0 && this.allChanges.length > 0) {
			const row = this.tbody.createEl('tr');
			const cell = row.createEl('td', {
				text: '未找到匹配项',
				cls: 'crc-text-muted'
			});
			cell.setAttribute('colspan', '4');
		}
	}

	onClose(): void {
		const { contentEl } = this;
		contentEl.empty();
	}
}

// ==========================================================================
// OrphanedRefsPreviewModal
// ==========================================================================

/**
 * Modal for previewing orphaned cr_id reference removal
 */
export class OrphanedRefsPreviewModal extends Modal {
	private allChanges: Array<{ person: { name: string; file: TFile }; field: string; orphanedId: string }>;
	private filteredChanges: Array<{ person: { name: string; file: TFile }; field: string; orphanedId: string }> = [];
	private onApply: () => Promise<void>;

	// Filter state
	private searchQuery = '';
	private selectedField = 'all';
	private sortAscending = true;

	// UI elements
	private tbody: HTMLTableSectionElement | null = null;
	private countEl: HTMLElement | null = null;

	constructor(
		app: App,
		changes: Array<{ person: { name: string; file: TFile }; field: string; orphanedId: string }>,
		onApply: () => Promise<void>
	) {
		super(app);
		this.allChanges = changes;
		this.filteredChanges = [...changes];
		this.onApply = onApply;
	}

	onOpen(): void {
		const { contentEl, titleEl } = this;

		this.modalEl.addClass('crc-batch-preview-modal');
		titleEl.setText('预览：移除孤立的 cr_id 引用');

		// Description with use cases
		const description = contentEl.createDiv({ cls: 'crc-batch-description' });
		description.createEl('p', {
			text: '此操作会移除指向已删除或不存在的人物笔记的损坏关系引用（cr_id 值）：'
		});
		const useCases = description.createEl('ul');
		useCases.createEl('li', { text: 'father_id、mother_id：父母引用' });
		useCases.createEl('li', { text: 'spouse_id、partners_id：配偶/伴侣引用' });
		useCases.createEl('li', { text: 'children_id：子女引用' });
		description.createEl('p', {
			text: '注意：仅清理 _id 字段。wikilink 引用（father、mother、spouse、children）保持不变。',
			cls: 'crc-text--muted'
		});

		// Search input
		const searchContainer = contentEl.createDiv({ cls: 'crc-filter-container' });
		const searchInput = searchContainer.createEl('input', {
			type: 'text',
			placeholder: '按人物姓名或孤立 ID 搜索…',
			cls: 'crc-search-input'
		});
		searchInput.addEventListener('input', (e) => {
			this.searchQuery = (e.target as HTMLInputElement).value.toLowerCase();
			this.applyFiltersAndSort();
		});

		// Field filter dropdown
		const filterContainer = contentEl.createDiv({ cls: 'crc-filter-container' });
		filterContainer.createSpan({ text: '按字段筛选：', cls: 'crc-filter-label' });
		const fieldSelect = filterContainer.createEl('select', { cls: 'dropdown' });

		const fields = ['all', 'father_id', 'mother_id', 'spouse_id', 'partners_id', 'children_id'];
		fields.forEach(field => {
			const option = fieldSelect.createEl('option', {
				value: field,
				text: field === 'all' ? '所有字段' : field
			});
			if (field === this.selectedField) {
				option.selected = true;
			}
		});

		fieldSelect.addEventListener('change', (e) => {
			this.selectedField = (e.target as HTMLSelectElement).value;
			this.applyFiltersAndSort();
		});

		// Sort toggle
		const sortContainer = contentEl.createDiv({ cls: 'crc-filter-container' });
		const sortButton = sortContainer.createEl('button', {
			text: `排序：${this.sortAscending ? 'A-Z' : 'Z-A'}`,
			cls: 'crc-btn-secondary'
		});
		sortButton.addEventListener('click', () => {
			this.sortAscending = !this.sortAscending;
			sortButton.textContent = `排序：${this.sortAscending ? 'A-Z' : 'Z-A'}`;
			this.applyFiltersAndSort();
		});

		// Count display
		this.countEl = contentEl.createDiv({ cls: 'crc-batch-count' });

		// Table
		const tableContainer = contentEl.createDiv({ cls: 'crc-table-container' });
		const table = tableContainer.createEl('table', { cls: 'crc-batch-table' });

		const thead = table.createEl('thead');
		const headerRow = thead.createEl('tr');
		headerRow.createEl('th', { text: '人物' });
		headerRow.createEl('th', { text: '字段' });
		headerRow.createEl('th', { text: '孤立 ID' });
		headerRow.createEl('th', { text: '操作' });

		this.tbody = table.createEl('tbody');

		// Initial render
		this.applyFiltersAndSort();

		// Backup warning
		const warning = contentEl.createDiv({ cls: 'crc-warning-callout' });
		const warningIcon = createLucideIcon('alert-triangle', 16);
		warning.appendChild(warningIcon);
		warning.createSpan({
			text: ' 操作前请备份你的库。此操作将修改现有笔记。'
		});

		// Buttons
		const buttonContainer = contentEl.createDiv({ cls: 'crc-confirmation-buttons' });

		const cancelButton = buttonContainer.createEl('button', {
			text: '取消',
			cls: 'crc-btn-secondary'
		});
		cancelButton.addEventListener('click', () => this.close());

		const applyButton = buttonContainer.createEl('button', {
			text: `应用 ${this.allChanges.length} 项更改`,
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

	private applyFiltersAndSort(): void {
		// Filter
		this.filteredChanges = this.allChanges.filter(change => {
			// Search filter
			if (this.searchQuery) {
				const matchesSearch =
					change.person.name.toLowerCase().includes(this.searchQuery) ||
					change.orphanedId.toLowerCase().includes(this.searchQuery);
				if (!matchesSearch) return false;
			}

			// Field filter
			if (this.selectedField !== 'all' && change.field !== this.selectedField) {
				return false;
			}

			return true;
		});

		// Sort
		this.filteredChanges.sort((a, b) => {
			const comparison = a.person.name.localeCompare(b.person.name);
			return this.sortAscending ? comparison : -comparison;
		});

		// Render
		this.renderTable();
	}

	private renderTable(): void {
		if (!this.tbody || !this.countEl) return;

		// Update count
		this.countEl.textContent = `显示 ${this.filteredChanges.length} / ${this.allChanges.length} 个孤立引用`;

		// Clear table
		this.tbody.empty();

		// Render rows
		for (const change of this.filteredChanges) {
			const row = this.tbody.createEl('tr');
			row.createEl('td', { text: change.person.name });
			row.createEl('td', { text: change.field, cls: 'crc-field-name' });
			row.createEl('td', { text: change.orphanedId, cls: 'crc-monospace' });

			// Action buttons
			const actionCell = row.createEl('td', { cls: 'crc-batch-actions crc-batch-actions--inline' });

			// Open in tab button
			const openTabBtn = actionCell.createEl('button', {
				cls: 'crc-batch-action-btn clickable-icon',
				attr: { 'aria-label': '在标签页中打开笔记' }
			});
			const fileIcon = createLucideIcon('file-text', 14);
			openTabBtn.appendChild(fileIcon);
			openTabBtn.addEventListener('click', () => {
				void this.app.workspace.getLeaf().openFile(change.person.file);
			});

			// Open in new window button
			const openWindowBtn = actionCell.createEl('button', {
				cls: 'crc-batch-action-btn clickable-icon',
				attr: { 'aria-label': '在新窗口中打开笔记' }
			});
			const windowIcon = createLucideIcon('external-link', 14);
			openWindowBtn.appendChild(windowIcon);
			openWindowBtn.addEventListener('click', () => {
				void this.app.workspace.getLeaf('window').openFile(change.person.file);
			});
		}

		// Empty state
		if (this.filteredChanges.length === 0) {
			const row = this.tbody.createEl('tr');
			const cell = row.createEl('td', {
				text: this.searchQuery || this.selectedField !== 'all'
					? '没有符合筛选条件的孤立引用'
					: '未发现孤立引用',
				cls: 'crc-text--muted'
			});
			cell.colSpan = 4;
		}
	}

	onClose(): void {
		const { contentEl } = this;
		contentEl.empty();
	}
}

// ==========================================================================
// BidirectionalInconsistencyPreviewModal
// ==========================================================================

/**
 * Modal for previewing bidirectional relationship inconsistencies
 */
export class BidirectionalInconsistencyPreviewModal extends Modal {
	private allChanges: Array<{
		person: { name: string; file: TFile };
		relatedPerson: { name: string; file: TFile };
		type: string;
		description: string;
	}>;
	private filteredChanges: Array<{
		person: { name: string; file: TFile };
		relatedPerson: { name: string; file: TFile };
		type: string;
		description: string;
	}> = [];
	private onApply: () => Promise<void>;
	private labels: { title: string; intro: string; bullets: string[]; warning: string };

	// Filter state
	private searchQuery = '';
	private selectedType = 'all';
	private sortAscending = true;

	// UI elements
	private tbody: HTMLTableSectionElement | null = null;
	private countEl: HTMLElement | null = null;

	constructor(
		app: App,
		changes: Array<{
			person: { name: string; file: TFile };
			relatedPerson: { name: string; file: TFile };
			type: string;
			description: string;
		}>,
		onApply: () => Promise<void>,
		labels?: { title?: string; intro?: string; bullets?: string[]; warning?: string }
	) {
		super(app);
		this.allChanges = changes;
		this.onApply = onApply;
		this.labels = {
			title: labels?.title ?? '预览：修复双向关系不一致',
			intro: labels?.intro ?? '此操作通过补充缺失的互惠链接来修复单向关系：',
			bullets: labels?.bullets ?? [
				'父母列出了子女，但子女未列出父母',
				'子女列出了父母，但父母未列出子女',
				'人物 A 将人物 B 列为配偶，但 B 未列出 A'
			],
			warning: labels?.warning ?? '操作前请备份你的库。此操作会向笔记添加缺失的关系链接。'
		};
	}

	onOpen(): void {
		const { contentEl, titleEl } = this;

		// Add modal class for sizing
		this.modalEl.addClass('crc-batch-preview-modal');

		titleEl.setText(this.labels.title);

		// Description
		const description = contentEl.createDiv({ cls: 'crc-batch-description' });
		description.createEl('p', { text: this.labels.intro });
		const useCases = description.createEl('ul');
		for (const bullet of this.labels.bullets) {
			useCases.createEl('li', { text: bullet });
		}

		// Count display
		this.countEl = contentEl.createEl('p', { cls: 'crc-batch-count' });

		// Controls row: search + filter + sort
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

		// Type filter dropdown
		const uniqueTypes = [...new Set(this.allChanges.map(c => c.type))];
		if (uniqueTypes.length > 1) {
			const filterContainer = controlsRow.createDiv({ cls: 'crc-batch-filter' });
			const filterSelect = filterContainer.createEl('select', { cls: 'crc-batch-filter-select' });
			filterSelect.createEl('option', { text: '所有类型', value: 'all' });
			for (const type of uniqueTypes.sort()) {
				const displayText = type
					.replace('missing-child-in-parent', '父母缺少子女')
					.replace('missing-parent-in-child', '子女缺少父母')
					.replace('missing-spouse-in-spouse', '缺少配偶链接');
				filterSelect.createEl('option', { text: displayText, value: type });
			}
			filterSelect.addEventListener('change', () => {
				this.selectedType = filterSelect.value;
				this.applyFiltersAndSort();
			});
		}

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
		headerRow.createEl('th', { text: '相关人物' });
		headerRow.createEl('th', { text: '问题' });
		headerRow.createEl('th', { text: '操作' });

		this.tbody = table.createEl('tbody');

		// Initial render
		this.applyFiltersAndSort();

		// Backup warning
		const warning = contentEl.createDiv({ cls: 'crc-warning-callout' });
		const warningIcon = createLucideIcon('alert-triangle', 16);
		warning.appendChild(warningIcon);
		warning.createSpan({ text: ` ${this.labels.warning}` });

		// Buttons
		const buttonContainer = contentEl.createDiv({ cls: 'crc-confirmation-buttons' });

		const cancelButton = buttonContainer.createEl('button', {
			text: '取消',
			cls: 'crc-btn-secondary'
		});
		cancelButton.addEventListener('click', () => this.close());

		const applyButton = buttonContainer.createEl('button', {
			text: `修复 ${this.allChanges.length} 处不一致`,
			cls: 'mod-cta'
		});
		applyButton.addEventListener('click', () => {
			void (async () => {
				// Disable buttons during operation
				applyButton.disabled = true;
				cancelButton.disabled = true;
				applyButton.textContent = '正在修复不一致…';

				// Run the operation
				await this.onApply();

				// Close modal after completion
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
			if (this.searchQuery) {
				const personMatch = change.person.name.toLowerCase().includes(this.searchQuery);
				const relatedMatch = change.relatedPerson.name.toLowerCase().includes(this.searchQuery);
				if (!personMatch && !relatedMatch) {
					return false;
				}
			}
			// Type filter
			if (this.selectedType !== 'all' && change.type !== this.selectedType) {
				return false;
			}
			return true;
		});

		// Sort by person name
		this.filteredChanges.sort((a, b) => {
			const cmp = a.person.name.localeCompare(b.person.name);
			return this.sortAscending ? cmp : -cmp;
		});

		// Update count
		if (this.countEl) {
			const peopleCount = new Set(this.allChanges.map(c => c.person.name)).size;
			if (this.filteredChanges.length === this.allChanges.length) {
				this.countEl.textContent = `在 ${peopleCount} 位人物中发现 ${this.allChanges.length} 处不一致：`;
			} else {
				this.countEl.textContent = `显示 ${this.allChanges.length} 处不一致中的 ${this.filteredChanges.length} 处：`;
			}
		}

		// Re-render table
		this.renderTable();
	}

	/**
	 * Render the filtered/sorted changes to the table body
	 */
	private renderTable(): void {
		if (!this.tbody) return;

		this.tbody.empty();

		for (const change of this.filteredChanges) {
			const row = this.tbody.createEl('tr');
			row.createEl('td', { text: change.person.name });
			row.createEl('td', { text: change.relatedPerson.name });
			row.createEl('td', { text: change.description });

			// Action buttons cell
			const actionCell = row.createEl('td', { cls: 'crc-batch-actions crc-batch-actions--inline' });

			// Open person in tab
			const openPersonTabBtn = actionCell.createEl('button', {
				cls: 'crc-batch-action-btn clickable-icon',
				attr: { 'aria-label': `在标签页中打开${change.person.name}` }
			});
			const fileIcon1 = createLucideIcon('file-text', 14);
			openPersonTabBtn.appendChild(fileIcon1);
			openPersonTabBtn.addEventListener('click', () => {
				void this.app.workspace.getLeaf().openFile(change.person.file);
			});

			// Open person in new window
			const openPersonWindowBtn = actionCell.createEl('button', {
				cls: 'crc-batch-action-btn clickable-icon',
				attr: { 'aria-label': `在新窗口中打开${change.person.name}` }
			});
			const windowIcon1 = createLucideIcon('external-link', 14);
			openPersonWindowBtn.appendChild(windowIcon1);
			openPersonWindowBtn.addEventListener('click', () => {
				void this.app.workspace.getLeaf('window').openFile(change.person.file);
			});

			// Separator
			actionCell.createSpan({ text: ' ', cls: 'crc-batch-actions-separator' });

			// Open related person in tab
			const openRelatedTabBtn = actionCell.createEl('button', {
				cls: 'crc-batch-action-btn clickable-icon',
				attr: { 'aria-label': `在标签页中打开${change.relatedPerson.name}` }
			});
			const fileIcon2 = createLucideIcon('file-text', 14);
			openRelatedTabBtn.appendChild(fileIcon2);
			openRelatedTabBtn.addEventListener('click', () => {
				void this.app.workspace.getLeaf().openFile(change.relatedPerson.file);
			});

			// Open related person in new window
			const openRelatedWindowBtn = actionCell.createEl('button', {
				cls: 'crc-batch-action-btn clickable-icon',
				attr: { 'aria-label': `在新窗口中打开${change.relatedPerson.name}` }
			});
			const windowIcon2 = createLucideIcon('external-link', 14);
			openRelatedWindowBtn.appendChild(windowIcon2);
			openRelatedWindowBtn.addEventListener('click', () => {
				void this.app.workspace.getLeaf('window').openFile(change.relatedPerson.file);
			});
		}

		if (this.filteredChanges.length === 0 && this.allChanges.length > 0) {
			const row = this.tbody.createEl('tr');
			const cell = row.createEl('td', {
				text: '未找到匹配项',
				cls: 'crc-text-muted'
			});
			cell.setAttribute('colspan', '4');
		}
	}

	onClose(): void {
		const { contentEl } = this;
		contentEl.empty();
	}
}

// ==========================================================================
// ImpossibleDatesPreviewModal
// ==========================================================================

/**
 * Modal for previewing impossible date issues
 */
export class ImpossibleDatesPreviewModal extends Modal {
	private allChanges: Array<{
		person: { name: string; file: TFile };
		relatedPerson?: { name: string; file: TFile };
		type: string;
		description: string;
	}>;
	private filteredChanges: Array<{
		person: { name: string; file: TFile };
		relatedPerson?: { name: string; file: TFile };
		type: string;
		description: string;
	}> = [];

	// Filter state
	private searchQuery = '';
	private selectedType = 'all';
	private sortAscending = true;

	// UI elements
	private tbody: HTMLTableSectionElement | null = null;
	private countEl: HTMLElement | null = null;

	constructor(
		app: App,
		changes: Array<{
			person: { name: string; file: TFile };
			relatedPerson?: { name: string; file: TFile };
			type: string;
			description: string;
		}>
	) {
		super(app);
		this.allChanges = changes;
	}

	onOpen(): void {
		const { contentEl, titleEl } = this;

		// Add modal class for sizing
		this.modalEl.addClass('crc-batch-preview-modal');

		titleEl.setText('预览：不可能的日期问题');

		// Description
		const description = contentEl.createDiv({ cls: 'crc-batch-description' });
		description.createEl('p', {
			text: '此预览显示需要人工审查和纠正的逻辑日期错误：'
		});
		const useCases = description.createEl('ul');
		useCases.createEl('li', { text: '出生晚于去世，或去世早于出生' });
		useCases.createEl('li', { text: '不合理的寿命（>120 年）' });
		useCases.createEl('li', { text: '父母出生于子女之后，或子女出生于父母去世之后' });
		useCases.createEl('li', { text: '父母在子女生育时过于年轻（<10 岁）' });

		const warningNote = contentEl.createDiv({ cls: 'crc-warning-callout' });
		const warningIcon = createLucideIcon('alert-triangle', 16);
		warningNote.appendChild(warningIcon);
		warningNote.createSpan({
			text: ' 这是仅预览的工具。请审查问题并手动更正受影响笔记中的日期。'
		});

		// Count display
		this.countEl = contentEl.createEl('p', { cls: 'crc-batch-count' });

		// Controls row: search + filter + sort
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

		// Type filter dropdown
		const uniqueTypes = [...new Set(this.allChanges.map(c => c.type))];
		if (uniqueTypes.length > 1) {
			const filterContainer = controlsRow.createDiv({ cls: 'crc-batch-filter' });
			const filterSelect = filterContainer.createEl('select', { cls: 'crc-batch-filter-select' });
			filterSelect.createEl('option', { text: '所有类型', value: 'all' });
			for (const type of uniqueTypes.sort()) {
				const displayText = type
					.replace('birth-after-death', '出生晚于去世')
					.replace('unrealistic-lifespan', '不合理的寿命')
					.replace('parent-born-after-child', '父母出生于子女之后')
					.replace('parent-died-before-child', '父母去世早于子女')
					.replace('parent-too-young', '父母过于年轻')
					.replace('child-born-after-parent-death', '子女出生于父母去世之后');
				filterSelect.createEl('option', { text: displayText, value: type });
			}
			filterSelect.addEventListener('change', () => {
				this.selectedType = filterSelect.value;
				this.applyFiltersAndSort();
			});
		}

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
		headerRow.createEl('th', { text: '相关人物' });
		headerRow.createEl('th', { text: '问题' });
		headerRow.createEl('th', { text: '操作' });

		this.tbody = table.createEl('tbody');

		// Initial render
		this.applyFiltersAndSort();

		// Close button
		const buttonContainer = contentEl.createDiv({ cls: 'crc-confirmation-buttons' });
		const closeButton = buttonContainer.createEl('button', {
			text: '关闭',
			cls: 'mod-cta'
		});
		closeButton.addEventListener('click', () => this.close());
	}

	/**
	 * Apply filters and sorting, then re-render the table
	 */
	private applyFiltersAndSort(): void {
		// Filter
		this.filteredChanges = this.allChanges.filter(change => {
			// Search filter
			if (this.searchQuery) {
				const personMatch = change.person.name.toLowerCase().includes(this.searchQuery);
				const relatedMatch = change.relatedPerson?.name.toLowerCase().includes(this.searchQuery);
				if (!personMatch && !relatedMatch) {
					return false;
				}
			}
			// Type filter
			if (this.selectedType !== 'all' && change.type !== this.selectedType) {
				return false;
			}
			return true;
		});

		// Sort by person name
		this.filteredChanges.sort((a, b) => {
			const cmp = a.person.name.localeCompare(b.person.name);
			return this.sortAscending ? cmp : -cmp;
		});

		// Update count
		if (this.countEl) {
			const peopleCount = new Set(this.allChanges.map(c => c.person.name)).size;
			if (this.filteredChanges.length === this.allChanges.length) {
				this.countEl.textContent = `在 ${peopleCount} 位人物中发现 ${this.allChanges.length} 个问题：`;
			} else {
				this.countEl.textContent = `显示 ${this.allChanges.length} 个问题中的 ${this.filteredChanges.length} 个：`;
			}
		}

		// Re-render table
		this.renderTable();
	}

	/**
	 * Render the filtered/sorted changes to the table body
	 */
	private renderTable(): void {
		if (!this.tbody) return;

		this.tbody.empty();

		for (const change of this.filteredChanges) {
			const row = this.tbody.createEl('tr');
			row.createEl('td', { text: change.person.name });
			row.createEl('td', { text: change.relatedPerson?.name || '\u2014' });
			row.createEl('td', { text: change.description });

			// Action buttons cell
			const actionCell = row.createEl('td', { cls: 'crc-batch-actions crc-batch-actions--inline' });

			// Open person in tab
			const openPersonTabBtn = actionCell.createEl('button', {
				cls: 'crc-batch-action-btn clickable-icon',
				attr: { 'aria-label': `在标签页中打开${change.person.name}` }
			});
			const fileIcon1 = createLucideIcon('file-text', 14);
			openPersonTabBtn.appendChild(fileIcon1);
			openPersonTabBtn.addEventListener('click', () => {
				void this.app.workspace.getLeaf().openFile(change.person.file);
			});

			// Open person in new window
			const openPersonWindowBtn = actionCell.createEl('button', {
				cls: 'crc-batch-action-btn clickable-icon',
				attr: { 'aria-label': `在新窗口中打开${change.person.name}` }
			});
			const windowIcon1 = createLucideIcon('external-link', 14);
			openPersonWindowBtn.appendChild(windowIcon1);
			openPersonWindowBtn.addEventListener('click', () => {
				void this.app.workspace.getLeaf('window').openFile(change.person.file);
			});

			// If there's a related person, add buttons for them too
			if (change.relatedPerson) {
				// Separator
				actionCell.createSpan({ text: ' ', cls: 'crc-batch-actions-separator' });

				// Open related person in tab
				const openRelatedTabBtn = actionCell.createEl('button', {
					cls: 'crc-batch-action-btn clickable-icon',
					attr: { 'aria-label': `在标签页中打开${change.relatedPerson.name}` }
				});
				const fileIcon2 = createLucideIcon('file-text', 14);
				openRelatedTabBtn.appendChild(fileIcon2);
				openRelatedTabBtn.addEventListener('click', () => {
					void this.app.workspace.getLeaf().openFile(change.relatedPerson!.file);
				});

				// Open related person in new window
				const openRelatedWindowBtn = actionCell.createEl('button', {
					cls: 'crc-batch-action-btn clickable-icon',
					attr: { 'aria-label': `在新窗口中打开${change.relatedPerson.name}` }
				});
				const windowIcon2 = createLucideIcon('external-link', 14);
				openRelatedWindowBtn.appendChild(windowIcon2);
				openRelatedWindowBtn.addEventListener('click', () => {
					void this.app.workspace.getLeaf('window').openFile(change.relatedPerson!.file);
				});
			}
		}

		if (this.filteredChanges.length === 0 && this.allChanges.length > 0) {
			const row = this.tbody.createEl('tr');
			const cell = row.createEl('td', {
				text: '未找到匹配项',
				cls: 'crc-text-muted'
			});
			cell.setAttribute('colspan', '4');
		}
	}

	onClose(): void {
		const { contentEl } = this;
		contentEl.empty();
	}
}

// ==========================================================================
// BatchPreviewModal
// ==========================================================================

/**
 * Modal for previewing batch operation changes
 */
export class BatchPreviewModal extends Modal {
	private operation: 'dates' | 'sex' | 'orphans' | 'legacy_type' | 'missing_ids';
	private preview: NormalizationPreview;
	private onApply: () => Promise<void>;
	private sexNormalizationDisabled: boolean;

	// All changes for this operation
	private allChanges: Array<{ person: { name: string }; field: string; oldValue: string; newValue: string }> = [];
	// Filtered/sorted changes for display
	private filteredChanges: Array<{ person: { name: string }; field: string; oldValue: string; newValue: string }> = [];

	// Filter state
	private searchQuery = '';
	private selectedField = 'all';
	private sortAscending = true;

	// UI elements
	private tbody: HTMLTableSectionElement | null = null;
	private countEl: HTMLElement | null = null;

	constructor(
		app: App,
		operation: 'dates' | 'sex' | 'orphans' | 'legacy_type' | 'missing_ids',
		preview: NormalizationPreview,
		onApply: () => Promise<void>,
		sexNormalizationDisabled = false
	) {
		super(app);
		this.operation = operation;
		this.preview = preview;
		this.onApply = onApply;
		this.sexNormalizationDisabled = sexNormalizationDisabled;
	}

	onOpen(): void {
		const { contentEl, titleEl } = this;

		// Add modal class for sizing
		this.modalEl.addClass('crc-batch-preview-modal');

		// Set title based on operation
		const titles: Record<string, string> = {
			dates: '预览：日期规范化',
			sex: '预览：性别规范化',
			orphans: '预览：清除孤立引用',
			legacy_type: '预览：迁移旧版 type 属性',
			missing_ids: '预览：修复缺失的关系 ID',
		};
		titleEl.setText(titles[this.operation]);

		// Add operation-specific descriptions
		if (this.operation === 'sex') {
			contentEl.createEl('p', {
				text: '谱系记录使用生理性别（M/F）而非性别认同，因为历史文献和 DNA 分析需要这一区分。',
				cls: 'crc-text-muted crc-text-small'
			});

			// Show disabled mode warning
			if (this.sexNormalizationDisabled) {
				const disabledWarning = contentEl.createDiv({ cls: 'crc-info-callout' });
				const infoIcon = createLucideIcon('info', 16);
				disabledWarning.appendChild(infoIcon);
				disabledWarning.createSpan({
					text: ' 性别规范化已禁用。下方预览显示将要做出的更改，但不会应用任何更改。可在 设置 → Charted Roots → 性别与性别认同 中修改。'
				});
			}
		} else if (this.operation === 'missing_ids') {
			contentEl.createEl('p', {
				text: '通过将 wikilink 解析为其 cr_id 值来填充缺失的 _id 字段。这能提高笔记重命名时关系的可靠性。',
				cls: 'crc-text-muted crc-text-small'
			});

			// Show unresolvable wikilinks warning if any
			if (this.preview.unresolvableWikilinks.length > 0) {
				const warningDiv = contentEl.createDiv({ cls: 'crc-warning-callout' });
				const warningIcon = createLucideIcon('alert-triangle', 16);
				warningDiv.appendChild(warningIcon);
				warningDiv.createSpan({
					text: ` ${this.preview.unresolvableWikilinks.length} 个 wikilink 无法解析（链接损坏、目标不明确或目标缺少 cr_id）。这些将被跳过。`
				});
			}
		}

		// Get changes for this operation
		switch (this.operation) {
			case 'dates':
				this.allChanges = [...this.preview.dateNormalization];
				break;
			case 'sex':
				this.allChanges = [...this.preview.genderNormalization];
				break;
			case 'orphans':
				this.allChanges = [...this.preview.orphanClearing];
				break;
			case 'legacy_type':
				this.allChanges = [...this.preview.legacyTypeMigration];
				break;
			case 'missing_ids':
				// Convert MissingIdRepair to the standard change format
				this.allChanges = this.preview.missingIdRepairs.map(repair => ({
					person: { name: repair.person.name },
					field: repair.field.replace(/s$/, '') + '_id' + (repair.arrayIndex !== undefined ? `[${repair.arrayIndex}]` : ''),
					oldValue: '(missing)',
					newValue: repair.resolvedCrId
				}));
				break;
		}

		if (this.allChanges.length === 0) {
			contentEl.createEl('p', {
				text: '无需更改。所有值都已是正确格式。',
				cls: 'crc-text-muted'
			});
		} else {
			// Count display
			this.countEl = contentEl.createEl('p', { cls: 'crc-batch-count' });

			// Controls row: search + filter + sort
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

			// Field filter dropdown (only show if multiple fields)
			const uniqueFields = [...new Set(this.allChanges.map(c => c.field))];
			if (uniqueFields.length > 1) {
				const filterContainer = controlsRow.createDiv({ cls: 'crc-batch-filter' });
				const filterSelect = filterContainer.createEl('select', { cls: 'crc-batch-filter-select' });
				filterSelect.createEl('option', { text: '所有字段', value: 'all' });
				for (const field of uniqueFields.sort()) {
					filterSelect.createEl('option', { text: field, value: field });
				}
				filterSelect.addEventListener('change', () => {
					this.selectedField = filterSelect.value;
					this.applyFiltersAndSort();
				});
			}

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
			const thead = table.createEl('thead');
			const headerRow = thead.createEl('tr');
			headerRow.createEl('th', { text: '人物' });
			headerRow.createEl('th', { text: '字段' });
			headerRow.createEl('th', { text: '当前' });
			headerRow.createEl('th', { text: '新建值' });

			this.tbody = table.createEl('tbody');

			// Initial render
			this.applyFiltersAndSort();
		}

		// Show skipped notes for sex operation (schema-aware mode)
		if (this.operation === 'sex' && this.preview.genderSkipped.length > 0) {
			const skippedSection = contentEl.createDiv({ cls: 'crc-batch-skipped-section' });
			const skippedHeader = skippedSection.createDiv({ cls: 'crc-batch-skipped-header' });
			const infoIcon = createLucideIcon('info', 16);
			skippedHeader.appendChild(infoIcon);
			skippedHeader.createSpan({
				text: ` 已跳过 ${this.preview.genderSkipped.length} 条笔记（架构覆盖）`
			});

			// Collapsible details
			const detailsContainer = skippedSection.createEl('details', { cls: 'crc-batch-skipped-details' });
			detailsContainer.createEl('summary', { text: '显示已跳过的笔记' });

			const skippedList = detailsContainer.createEl('ul', { cls: 'crc-batch-skipped-list' });
			for (const skipped of this.preview.genderSkipped) {
				const item = skippedList.createEl('li');
				item.createSpan({ text: skipped.person.name, cls: 'crc-batch-skipped-name' });
				item.createSpan({
					text: `（${skipped.currentValue}）\u2014 架构：${skipped.schemaName}`,
					cls: 'crc-text-muted'
				});
			}
		}

		// Backup warning (don't show if normalization is disabled for this operation)
		if (this.allChanges.length > 0 && !this.sexNormalizationDisabled) {
			const warning = contentEl.createDiv({ cls: 'crc-warning-callout' });
			const warningIcon = createLucideIcon('alert-triangle', 16);
			warning.appendChild(warningIcon);
			warning.createSpan({
				text: ' 操作前请备份你的库。此操作将修改现有笔记。'
			});
		}

		// Buttons
		const buttonContainer = contentEl.createDiv({ cls: 'crc-confirmation-buttons' });

		const cancelBtn = buttonContainer.createEl('button', {
			text: this.sexNormalizationDisabled ? '关闭' : '取消',
			cls: 'crc-btn-secondary'
		});
		cancelBtn.addEventListener('click', () => {
			this.close();
		});

		// Don't show Apply button if sex normalization is disabled
		if (this.sexNormalizationDisabled) {
			// No Apply button when disabled - user already sees the info callout
			return;
		}

		// Count actual changes (excluding unrecognized entries that won't be modified)
		const actualChanges = this.allChanges.filter(c => !c.newValue.includes('(unrecognized'));
		if (actualChanges.length > 0) {
			const applyBtn = buttonContainer.createEl('button', {
				text: `应用 ${actualChanges.length} 项更改`,
				cls: 'mod-cta'
			});
			applyBtn.addEventListener('click', () => {
				void (async () => {
					// Disable buttons during operation
					applyBtn.disabled = true;
					cancelBtn.disabled = true;
					applyBtn.textContent = '正在应用更改…';

					// Run the operation
					await this.onApply();

					// Show completion and enable close
					applyBtn.textContent = '\u2713 更改已应用';
					applyBtn.addClass('crc-btn-success');
					cancelBtn.textContent = '关闭';
					cancelBtn.disabled = false;

					// Update count to show completion
					if (this.countEl) {
						this.countEl.textContent = `\u2713 已成功应用 ${actualChanges.length} 项更改`;
					}
				})();
			});
		} else if (this.allChanges.length > 0) {
			// Only unrecognized values, no actual changes to apply
			contentEl.createEl('p', {
				text: '未找到可规范化的值。所列值无法识别，将不会被更改。',
				cls: 'crc-text-muted'
			});
		}
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
			// Field filter
			if (this.selectedField !== 'all' && change.field !== this.selectedField) {
				return false;
			}
			return true;
		});

		// Sort by person name
		this.filteredChanges.sort((a, b) => {
			const cmp = a.person.name.localeCompare(b.person.name);
			return this.sortAscending ? cmp : -cmp;
		});

		// Update count
		if (this.countEl) {
			if (this.filteredChanges.length === this.allChanges.length) {
				this.countEl.textContent = `将进行 ${this.allChanges.length} 项更改：`;
			} else {
				this.countEl.textContent = `显示 ${this.allChanges.length} 项更改中的 ${this.filteredChanges.length} 项：`;
			}
		}

		// Re-render table
		this.renderTable();
	}

	/**
	 * Render the filtered/sorted changes to the table body
	 */
	private renderTable(): void {
		if (!this.tbody) return;

		this.tbody.empty();

		for (const change of this.filteredChanges) {
			const isUnrecognized = change.newValue.includes('(unrecognized');
			const row = this.tbody.createEl('tr');
			if (isUnrecognized) {
				row.addClass('crc-batch-unrecognized-row');
			}
			row.createEl('td', { text: change.person.name });
			row.createEl('td', { text: change.field });
			row.createEl('td', {
				text: change.oldValue,
				cls: isUnrecognized ? 'crc-batch-unrecognized-value' : 'crc-batch-old-value'
			});
			row.createEl('td', {
				text: change.newValue,
				cls: isUnrecognized ? 'crc-text-muted' : 'crc-batch-new-value'
			});
		}

		if (this.filteredChanges.length === 0 && this.allChanges.length > 0) {
			const row = this.tbody.createEl('tr');
			const cell = row.createEl('td', {
				text: '未找到匹配项',
				cls: 'crc-text-muted crc-text--center'
			});
			cell.setAttribute('colspan', '4');
		}
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

// ==========================================================================
// ConfirmationModal
// ==========================================================================

/**
 * Simple confirmation modal for destructive actions
 */
export class ConfirmationModal extends Modal {
	private title: string;
	private message: string;
	private onResult: (confirmed: boolean) => void;

	constructor(app: App, title: string, message: string, onResult: (confirmed: boolean) => void) {
		super(app);
		this.title = title;
		this.message = message;
		this.onResult = onResult;
	}

	onOpen(): void {
		const { contentEl, titleEl } = this;
		titleEl.setText(this.title);

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

// ==========================================================================
// DateValidationPreviewModal
// ==========================================================================

/**
 * Modal for previewing date validation issues
 */
export class DateValidationPreviewModal extends Modal {
	private plugin: CanvasRootsPlugin;
	private allIssues: Array<{
		file: TFile;
		name: string;
		field: string;
		value: string;
		issue: string;
	}>;
	private filteredIssues: Array<{
		file: TFile;
		name: string;
		field: string;
		value: string;
		issue: string;
	}> = [];

	// Filter state
	private searchQuery = '';
	private selectedField = 'all';
	private sortAscending = true;

	// UI elements
	private tbody: HTMLTableSectionElement | null = null;
	private countEl: HTMLElement | null = null;

	constructor(
		app: App,
		plugin: CanvasRootsPlugin,
		issues: Array<{
			file: TFile;
			name: string;
			field: string;
			value: string;
			issue: string;
		}>
	) {
		super(app);
		this.plugin = plugin;
		this.allIssues = issues;
		this.filteredIssues = [...issues];
	}

	onOpen(): void {
		const { contentEl, titleEl } = this;

		this.modalEl.addClass('crc-batch-preview-modal');
		titleEl.setText('预览：日期格式验证问题');

		// Summary
		const summaryEl = contentEl.createDiv({ cls: 'crc-batch-summary' });
		summaryEl.createEl('p', {
			text: `发现 ${this.allIssues.length} 个存在格式问题的日期。`,
			cls: 'crc-batch-summary-text'
		});
		this.countEl = summaryEl.createEl('p', {
			text: `显示 ${this.allIssues.length} 个中的 ${this.filteredIssues.length} 个`,
			cls: 'crc-batch-summary-count'
		});

		// Search and filter controls
		const controlsEl = contentEl.createDiv({ cls: 'crc-batch-controls' });

		// Search input
		const searchContainer = controlsEl.createDiv({ cls: 'crc-batch-control' });
		searchContainer.createEl('label', { text: '搜索：', cls: 'crc-batch-label' });
		const searchInput = searchContainer.createEl('input', {
			type: 'text',
			placeholder: '按人物姓名筛选…',
			cls: 'crc-batch-search'
		});
		searchInput.addEventListener('input', () => {
			this.searchQuery = searchInput.value.toLowerCase();
			this.applyFiltersAndRender();
		});

		// Field filter dropdown
		const fieldContainer = controlsEl.createDiv({ cls: 'crc-batch-control' });
		fieldContainer.createEl('label', { text: '字段：', cls: 'crc-batch-label' });
		const fieldSelect = fieldContainer.createEl('select', { cls: 'crc-batch-select' });

		const fieldOptions = [
			{ value: 'all', label: '所有字段' },
			{ value: 'born', label: '出生日期' },
			{ value: 'birth_date', label: '出生日期（birth_date）' },
			{ value: 'died', label: '去世日期' },
			{ value: 'death_date', label: '去世日期（death_date）' }
		];

		for (const opt of fieldOptions) {
			fieldSelect.createEl('option', {
				value: opt.value,
				text: opt.label
			});
		}

		fieldSelect.addEventListener('change', () => {
			this.selectedField = fieldSelect.value;
			this.applyFiltersAndRender();
		});

		// Sort toggle
		const sortContainer = controlsEl.createDiv({ cls: 'crc-batch-control' });
		sortContainer.createEl('label', { text: '排序：', cls: 'crc-batch-label' });
		const sortBtn = sortContainer.createEl('button', {
			text: this.sortAscending ? 'A \u2192 Z' : 'Z \u2192 A',
			cls: 'crc-batch-sort-btn'
		});
		sortBtn.addEventListener('click', () => {
			this.sortAscending = !this.sortAscending;
			sortBtn.setText(this.sortAscending ? 'A \u2192 Z' : 'Z \u2192 A');
			this.applyFiltersAndRender();
		});

		// Table
		const tableContainer = contentEl.createDiv({ cls: 'crc-batch-table-container' });
		const table = tableContainer.createEl('table', { cls: 'crc-batch-table' });

		// Table header
		const thead = table.createEl('thead');
		const headerRow = thead.createEl('tr');
		headerRow.createEl('th', { text: '人物' });
		headerRow.createEl('th', { text: '字段' });
		headerRow.createEl('th', { text: '当前值' });
		headerRow.createEl('th', { text: '问题' });
		headerRow.createEl('th', { text: '操作' });

		// Table body
		this.tbody = table.createEl('tbody');

		// Render initial data
		this.renderTable();

		// Info box
		const infoEl = contentEl.createDiv({ cls: 'crc-batch-info' });
		const infoIcon = infoEl.createEl('span', { cls: 'crc-batch-info-icon' });
		setIcon(infoIcon, 'info');
		infoEl.createEl('span', {
			text: '日期验证仅为预览。点击"打开笔记"以手动更正每个日期。可在 设置 → Charted Roots → 日期与验证 中配置验证规则。'
		});

		// Buttons
		const buttonContainer = contentEl.createDiv({ cls: 'crc-batch-buttons' });

		const closeBtn = buttonContainer.createEl('button', {
			text: '关闭',
			cls: 'mod-cta'
		});
		closeBtn.addEventListener('click', () => {
			this.close();
		});
	}

	private applyFiltersAndRender(): void {
		// Apply search filter
		let filtered = this.allIssues.filter(issue =>
			issue.name.toLowerCase().includes(this.searchQuery)
		);

		// Apply field filter
		if (this.selectedField !== 'all') {
			filtered = filtered.filter(issue => issue.field === this.selectedField);
		}

		// Apply sort
		filtered.sort((a, b) => {
			const aName = a.name.toLowerCase();
			const bName = b.name.toLowerCase();
			return this.sortAscending
				? aName.localeCompare(bName)
				: bName.localeCompare(aName);
		});

		this.filteredIssues = filtered;

		// Update count
		if (this.countEl) {
			this.countEl.setText(`显示 ${this.allIssues.length} 个中的 ${this.filteredIssues.length} 个`);
		}

		// Re-render table
		this.renderTable();
	}

	private renderTable(): void {
		if (!this.tbody) return;

		this.tbody.empty();

		for (const issue of this.filteredIssues) {
			const row = this.tbody.createEl('tr');

			// Person name
			row.createEl('td', { text: issue.name });

			// Field
			row.createEl('td', { text: issue.field });

			// Current value
			row.createEl('td', {
				text: issue.value,
				cls: 'crc-batch-value'
			});

			// Issue
			row.createEl('td', {
				text: issue.issue,
				cls: 'crc-batch-issue'
			});

			// Action: Open note button
			const actionCell = row.createEl('td');
			const openBtn = actionCell.createEl('button', {
				text: '打开笔记',
				cls: 'crc-batch-action-btn'
			});
			openBtn.addEventListener('click', () => {
				void this.app.workspace.getLeaf().openFile(issue.file);
			});
		}

		// Show empty state if no results
		if (this.filteredIssues.length === 0) {
			const emptyRow = this.tbody.createEl('tr');
			const emptyCell = emptyRow.createEl('td', {
				attr: { colspan: '5' },
				cls: 'crc-batch-empty'
			});
			emptyCell.createEl('p', {
				text: '没有符合当前筛选条件的问题'
			});
		}
	}

	onClose(): void {
		this.contentEl.empty();
	}
}