/**
 * Source Image Import Wizard
 *
 * Multi-step wizard for importing source images into the vault,
 * parsing filenames to extract metadata, optionally renaming files,
 * and creating source notes with media attached.
 */

import { App, Modal, Notice, Setting, TFile, TFolder, TextComponent, AbstractInputSuggest } from 'obsidian';
import type CanvasRootsPlugin from '../../../main';
import { createLucideIcon } from '../../ui/lucide-icons';
import {
	parseFilename,
	detectMultiPartGroups,
	generateStandardFilename,
	generateSourceTitle,
	isImageFile,
	shouldFilterFile,
	type ParsedImageFilename,
} from '../services/image-filename-parser';
import { getAllSourceTypes, getSourceType } from '../types/source-types';

/**
 * Simple folder suggest for text inputs
 */
class FolderSuggest extends AbstractInputSuggest<TFolder> {
	private textComponent: TextComponent;
	private onSelectValue?: (value: string) => void;

	constructor(app: App, textComponent: TextComponent, onSelectValue?: (value: string) => void) {
		super(app, textComponent.inputEl);
		this.textComponent = textComponent;
		this.onSelectValue = onSelectValue;
	}

	getSuggestions(query: string): TFolder[] {
		const folders: TFolder[] = [];
		const lowerQuery = query.toLowerCase();

		const collectFolders = (folder: TFolder) => {
			if (folder.path.toLowerCase().includes(lowerQuery) || !query) {
				folders.push(folder);
			}
			for (const child of folder.children) {
				if (child instanceof TFolder) {
					collectFolders(child);
				}
			}
		};

		collectFolders(this.app.vault.getRoot());
		return folders.slice(0, 20);
	}

	renderSuggestion(folder: TFolder, el: HTMLElement): void {
		el.setText(folder.path || '(根目录)');
	}

	selectSuggestion(folder: TFolder): void {
		this.textComponent.setValue(folder.path);
		this.onSelectValue?.(folder.path);
		this.close();
	}
}

/**
 * Wizard step type
 */
type WizardStep = 'select' | 'rename' | 'review' | 'configure' | 'execute';

/**
 * Image file info with parsed metadata
 */
interface ImageFileInfo {
	file: TFile;
	parsed: ParsedImageFilename;
	proposedName: string;
	includeInRename: boolean;
	isFiltered: boolean;
	groupId?: string;
	// User edits
	editedSurnames?: string;
	editedYear?: string;
	editedType?: string;
	editedLocation?: string;
}

/**
 * Import result for a single source
 */
interface ImportResult {
	success: boolean;
	sourcePath?: string;
	imageCount: number;
	error?: string;
}

/**
 * Source Image Import Wizard Modal
 */
export class SourceImageWizardModal extends Modal {
	private plugin: CanvasRootsPlugin;

	// Wizard state
	private currentStep: WizardStep = 'select';

	// Step 1: Select Source
	private selectedFolder: string = '';
	private excludeThumbnails: boolean = true;
	private excludeHidden: boolean = true;
	private excludeNonImages: boolean = true;

	// File data
	private allFiles: ImageFileInfo[] = [];
	private filteredFiles: ImageFileInfo[] = [];
	private multiPartGroups: Map<string, string[]> = new Map();

	// Step 2: Rename Files
	private enableRenaming: boolean = false; // Off by default since it's optional and can cause conflicts
	private renameConflicts: Set<string> = new Set();

	// Step 4: Configure
	private sourceNotesFolder: string = '';

	// Step 5: Execute
	private isExecuting: boolean = false;
	private executionResults: ImportResult[] = [];
	private executionProgress: number = 0;

	constructor(app: App, plugin: CanvasRootsPlugin) {
		super(app);
		this.plugin = plugin;
		this.sourceNotesFolder = plugin.settings.sourcesFolder || 'Charted Roots/Sources';
	}

	onOpen(): void {
		const { titleEl, modalEl } = this;
		titleEl.setText('导入来源图片');
		modalEl.addClass('cr-image-wizard');
		activeDocument.body.addClass('cr-image-wizard-active');

		this.render();
	}

	onClose(): void {
		activeDocument.body.removeClass('cr-image-wizard-active');
		this.contentEl.empty();
	}

	/**
	 * Render the current wizard step
	 */
	private render(): void {
		const { contentEl } = this;
		contentEl.empty();

		// Progress indicator
		this.renderProgressIndicator();

		// Step content
		const stepContent = contentEl.createDiv({ cls: 'cr-image-wizard__content' });

		switch (this.currentStep) {
			case 'select':
				this.renderSelectStep(stepContent);
				break;
			case 'rename':
				this.renderRenameStep(stepContent);
				break;
			case 'review':
				this.renderReviewStep(stepContent);
				break;
			case 'configure':
				this.renderConfigureStep(stepContent);
				break;
			case 'execute':
				this.renderExecuteStep(stepContent);
				break;
		}

		// Navigation buttons
		this.renderNavigationButtons();
	}

	/**
	 * Render step progress indicator
	 */
	private renderProgressIndicator(): void {
		const { contentEl } = this;
		const steps: WizardStep[] = ['select', 'rename', 'review', 'configure', 'execute'];
		const stepLabels = ['选择', '重命名', '检查', '配置', '执行'];

		const progressEl = contentEl.createDiv({ cls: 'cr-image-wizard__progress' });

		steps.forEach((step, index) => {
			const stepIndex = steps.indexOf(this.currentStep);
			const isActive = step === this.currentStep;
			const isCompleted = stepIndex > index;

			const stepEl = progressEl.createDiv({
				cls: `cr-image-wizard__step ${isActive ? 'cr-image-wizard__step--active' : ''} ${isCompleted ? 'cr-image-wizard__step--completed' : ''}`,
			});

			stepEl.createDiv({
				cls: 'cr-image-wizard__step-number',
				text: isCompleted ? '✓' : String(index + 1),
			});

			stepEl.createDiv({
				cls: 'cr-image-wizard__step-label',
				text: stepLabels[index],
			});
		});
	}

	/**
	 * Step 1: Select Source Folder
	 */
	private renderSelectStep(container: HTMLElement): void {
		container.createDiv({
			cls: 'cr-image-wizard__step-header',
			text: '选择来源文件夹',
		});

		// Folder selection
		new Setting(container)
			.setName('文件夹')
			.setDesc('选择包含来源图片的库文件夹')
			.addText((text) => {
				text.setPlaceholder('Charted Roots/Sources/Media').setValue(this.selectedFolder);

				// Add folder autocomplete with callback
				new FolderSuggest(this.app, text, (value) => {
					this.selectedFolder = value;
					this.loadFilesFromFolder();
					this.render();
				});

				text.onChange((value) => {
					this.selectedFolder = value;
					this.loadFilesFromFolder();
					this.render();
				});
			});

		// Filter options
		container.createDiv({
			cls: 'cr-image-wizard__section-header',
			text: '筛选选项',
		});

		new Setting(container)
			.setName('排除缩略图')
			.setDesc('跳过以 thumb_ 或 thumbnail_ 开头的文件')
			.addToggle((toggle) => {
				toggle.setValue(this.excludeThumbnails).onChange((value) => {
					this.excludeThumbnails = value;
					this.applyFilters();
					this.render();
				});
			});

		new Setting(container)
			.setName('排除隐藏文件')
			.setDesc('跳过以点号（.）开头的文件')
			.addToggle((toggle) => {
				toggle.setValue(this.excludeHidden).onChange((value) => {
					this.excludeHidden = value;
					this.applyFilters();
					this.render();
				});
			});

		new Setting(container)
			.setName('排除非图片文件')
			.setDesc('跳过 .doc、.pdf、.txt 等非图片文件')
			.addToggle((toggle) => {
				toggle.setValue(this.excludeNonImages).onChange((value) => {
					this.excludeNonImages = value;
					this.applyFilters();
					this.render();
				});
			});

		// File preview
		if (this.selectedFolder) {
			this.renderFilePreview(container);
		}
	}

	/**
	 * Load files from selected folder
	 */
	private loadFilesFromFolder(): void {
		this.allFiles = [];
		this.filteredFiles = [];

		if (!this.selectedFolder) return;

		const folder = this.app.vault.getAbstractFileByPath(this.selectedFolder);
		if (!(folder instanceof TFolder)) return;

		// Recursively get all files in folder
		const getAllFiles = (f: TFolder): TFile[] => {
			const files: TFile[] = [];
			for (const child of f.children) {
				if (child instanceof TFile) {
					files.push(child);
				} else if (child instanceof TFolder) {
					files.push(...getAllFiles(child));
				}
			}
			return files;
		};

		const files = getAllFiles(folder);

		// Parse each file
		for (const file of files) {
			const parsed = parseFilename(file.name);
			const proposedName = generateStandardFilename(parsed);

			this.allFiles.push({
				file,
				parsed,
				proposedName,
				includeInRename: parsed.confidence !== 'low',
				isFiltered: false,
			});
		}

		this.applyFilters();
		this.detectGroups();
	}

	/**
	 * Apply filters to file list
	 */
	private applyFilters(): void {
		for (const info of this.allFiles) {
			let filtered = false;

			if (this.excludeThumbnails && shouldFilterFile(info.file.name)) {
				filtered = true;
			}

			if (this.excludeHidden && info.file.name.startsWith('.')) {
				filtered = true;
			}

			if (this.excludeNonImages && !isImageFile(info.file.name)) {
				filtered = true;
			}

			info.isFiltered = filtered;
		}

		this.filteredFiles = this.allFiles.filter((f) => !f.isFiltered);
	}

	/**
	 * Detect multi-part document groups
	 */
	private detectGroups(): void {
		const filenames = this.filteredFiles.map((f) => f.file.name);
		this.multiPartGroups = detectMultiPartGroups(filenames);

		// Assign group IDs to files
		let groupIndex = 0;
		for (const [, files] of this.multiPartGroups) {
			const groupId = `group-${groupIndex++}`;
			for (const filename of files) {
				const info = this.filteredFiles.find((f) => f.file.name === filename);
				if (info) {
					info.groupId = groupId;
				}
			}
		}
	}

	/**
	 * Render file preview list
	 */
	private renderFilePreview(container: HTMLElement): void {
		const preview = container.createDiv({ cls: 'cr-image-wizard__preview' });

		const header = preview.createDiv({ cls: 'cr-image-wizard__preview-header' });
		header.createSpan({ text: '找到的文件', cls: 'cr-image-wizard__preview-title' });

		const filteredCount = this.allFiles.filter((f) => f.isFiltered).length;
		header.createSpan({
			text: `${this.filteredFiles.length} 张图片${filteredCount > 0 ? `（已排除 ${filteredCount} 个）` : ''}`,
			cls: 'cr-image-wizard__preview-count',
		});

		if (this.filteredFiles.length === 0 && this.allFiles.length === 0) {
			preview.createDiv({
				cls: 'cr-image-wizard__empty',
				text: '该文件夹中未找到文件',
			});
			return;
		}

		const list = preview.createDiv({ cls: 'cr-image-wizard__file-list' });

		// Show up to 10 files
		const displayFiles = this.filteredFiles.slice(0, 10);
		for (const info of displayFiles) {
			const item = list.createDiv({ cls: 'cr-image-wizard__file-item' });
			const icon = createLucideIcon('image', 14);
			item.appendChild(icon);
			item.createSpan({ text: info.file.name });
		}

		if (this.filteredFiles.length > 10) {
			list.createDiv({
				cls: 'cr-image-wizard__file-more',
				text: `… 还有 ${this.filteredFiles.length - 10} 个文件`,
			});
		}

		// Show excluded files
		const excluded = this.allFiles.filter((f) => f.isFiltered);
		if (excluded.length > 0) {
			const excludedHeader = preview.createDiv({ cls: 'cr-image-wizard__excluded-header' });
			excludedHeader.createSpan({ text: `已排除（${excluded.length}）`, cls: 'crc-text-muted' });

			const excludedList = preview.createDiv({ cls: 'cr-image-wizard__file-list cr-image-wizard__file-list--excluded' });
			for (const info of excluded.slice(0, 5)) {
				const item = excludedList.createDiv({ cls: 'cr-image-wizard__file-item cr-image-wizard__file-item--excluded' });
				item.createSpan({ text: info.file.name, cls: 'crc-text-muted' });
			}
		}
	}

	/**
	 * Step 2: Rename Files
	 */
	private renderRenameStep(container: HTMLElement): void {
		container.createDiv({
			cls: 'cr-image-wizard__step-header',
			text: '规范文件名（可选）',
		});

		new Setting(container)
			.setName('启用文件重命名')
			.setDesc('根据解析出的元数据，将文件重命名为统一格式')
			.addToggle((toggle) => {
				toggle.setValue(this.enableRenaming).onChange((value) => {
					this.enableRenaming = value;
					this.render();
				});
			});

		if (!this.enableRenaming) {
			container.createDiv({
				cls: 'cr-image-wizard__info',
				text: '文件将保留原始名称。点击"下一步"继续。',
			});
			return;
		}

		container.createDiv({
			cls: 'cr-image-wizard__help',
			text: '格式：surname_given_byyyy_type_yyyy_place.ext',
		});

		// Check for conflicts
		this.checkRenameConflicts();

		// Rename table
		const tableContainer = container.createDiv({ cls: 'cr-image-wizard__table-container' });
		const table = tableContainer.createEl('table', { cls: 'cr-image-wizard__table' });

		// Header
		const thead = table.createEl('thead');
		const headerRow = thead.createEl('tr');
		headerRow.createEl('th', { text: '', cls: 'cr-image-wizard__th-checkbox' });
		headerRow.createEl('th', { text: '当前文件名' });
		headerRow.createEl('th', { text: '', cls: 'cr-image-wizard__th-arrow' });
		headerRow.createEl('th', { text: '新文件名' });
		headerRow.createEl('th', { text: '状态' });

		// Body
		const tbody = table.createEl('tbody');

		for (const info of this.filteredFiles.slice(0, 50)) {
			const row = tbody.createEl('tr');

			// Checkbox
			const checkCell = row.createEl('td');
			const checkbox = checkCell.createEl('input', { type: 'checkbox' });
			checkbox.checked = info.includeInRename;
			checkbox.addEventListener('change', () => {
				info.includeInRename = checkbox.checked;
				this.checkRenameConflicts();
				this.render();
			});

			// Current name
			const currentCell = row.createEl('td', { cls: 'cr-image-wizard__cell-filename' });
			currentCell.createEl('code', { text: info.file.name });

			// Arrow
			row.createEl('td', { text: '→', cls: 'cr-image-wizard__cell-arrow' });

			// New name (editable)
			const newCell = row.createEl('td', { cls: 'cr-image-wizard__cell-filename' });
			const input = newCell.createEl('input', {
				type: 'text',
				cls: 'cr-image-wizard__input-filename',
				value: info.proposedName,
			});
			input.addEventListener('change', () => {
				info.proposedName = input.value;
				this.checkRenameConflicts();
				this.render();
			});

			// Status
			const statusCell = row.createEl('td', { cls: 'cr-image-wizard__cell-status' });
			if (!info.includeInRename) {
				statusCell.createSpan({ text: '— 跳过', cls: 'crc-text-muted' });
			} else if (this.renameConflicts.has(info.proposedName)) {
				statusCell.createSpan({ text: '⚠ 冲突', cls: 'cr-image-wizard__conflict' });
				row.addClass('cr-image-wizard__row--conflict');
			} else if (info.file.name === info.proposedName) {
				statusCell.createSpan({ text: '— 无变化', cls: 'crc-text-muted' });
			} else {
				statusCell.createSpan({ text: '✓ 正常', cls: 'cr-image-wizard__ok' });
			}
		}

		if (this.filteredFiles.length > 50) {
			container.createDiv({
				cls: 'cr-image-wizard__info',
				text: `显示 ${this.filteredFiles.length} 个文件中的 50 个`,
			});
		}

		// Summary
		const toRename = this.filteredFiles.filter((f) => f.includeInRename && f.file.name !== f.proposedName);
		container.createDiv({
			cls: 'cr-image-wizard__summary',
			text: `将重命名 ${toRename.length} 个文件`,
		});

		if (this.renameConflicts.size > 0) {
			container.createDiv({
				cls: 'cr-image-wizard__warning',
				text: `⚠ 检测到 ${this.renameConflicts.size} 个文件名冲突。请编辑建议的名称，或取消勾选以跳过。`,
			});
		}
	}

	/**
	 * Check for rename conflicts (duplicate proposed names)
	 */
	private checkRenameConflicts(): void {
		const nameCounts = new Map<string, number>();
		this.renameConflicts.clear();

		for (const info of this.filteredFiles) {
			if (!info.includeInRename) continue;
			const count = nameCounts.get(info.proposedName) || 0;
			nameCounts.set(info.proposedName, count + 1);
		}

		for (const [name, count] of nameCounts) {
			if (count > 1) {
				this.renameConflicts.add(name);
			}
		}
	}

	/**
	 * Step 3: Review Parsed Data
	 */
	private renderReviewStep(container: HTMLElement): void {
		container.createDiv({
			cls: 'cr-image-wizard__step-header',
			text: '检查解析出的元数据',
		});

		container.createDiv({
			cls: 'cr-image-wizard__help',
			text: '检查并更正解析出的元数据。点击任意单元格即可编辑。',
		});

		// Confidence summary
		const high = this.filteredFiles.filter((f) => f.parsed.confidence === 'high').length;
		const medium = this.filteredFiles.filter((f) => f.parsed.confidence === 'medium').length;
		const low = this.filteredFiles.filter((f) => f.parsed.confidence === 'low').length;

		const summaryEl = container.createDiv({ cls: 'cr-image-wizard__confidence-summary' });
		summaryEl.createSpan({ cls: 'cr-image-wizard__confidence-dot cr-image-wizard__confidence-dot--high' });
		summaryEl.createSpan({ text: `${high} 高  ` });
		summaryEl.createSpan({ cls: 'cr-image-wizard__confidence-dot cr-image-wizard__confidence-dot--medium' });
		summaryEl.createSpan({ text: `${medium} 中  ` });
		summaryEl.createSpan({ cls: 'cr-image-wizard__confidence-dot cr-image-wizard__confidence-dot--low' });
		summaryEl.createSpan({ text: `${low} 低` });

		// Review table
		const tableContainer = container.createDiv({ cls: 'cr-image-wizard__table-container' });
		const table = tableContainer.createEl('table', { cls: 'cr-image-wizard__table' });

		// Header
		const thead = table.createEl('thead');
		const headerRow = thead.createEl('tr');
		headerRow.createEl('th', { text: '文件名' });
		headerRow.createEl('th', { text: '姓氏' });
		headerRow.createEl('th', { text: '年份' });
		headerRow.createEl('th', { text: '类型' });
		headerRow.createEl('th', { text: '地点' });
		headerRow.createEl('th', { text: '多页文档', cls: 'crc-cursor-help', attr: { title: '多页文档（例如 census_p1.jpg、census_p2.jpg）会被归为一组' } });
		headerRow.createEl('th', { text: '', cls: 'cr-image-wizard__th-confidence' });

		// Body
		const tbody = table.createEl('tbody');

		// Get source types for dropdown
		const sourceTypes = getAllSourceTypes(this.plugin.settings.customSourceTypes, this.plugin.settings.showBuiltInSourceTypes);

		for (const info of this.filteredFiles.slice(0, 50)) {
			const row = tbody.createEl('tr');

			// Filename
			const filenameCell = row.createEl('td', { cls: 'cr-image-wizard__cell-filename' });
			const displayName = this.enableRenaming && info.includeInRename ? info.proposedName : info.file.name;
			filenameCell.createEl('code', { text: displayName, cls: 'cr-image-wizard__filename-code' });

			// Surnames (editable)
			const surnamesCell = row.createEl('td');
			const surnamesValue = info.editedSurnames ?? info.parsed.surnames.join(', ');
			const surnamesInput = surnamesCell.createEl('input', {
				type: 'text',
				cls: 'cr-image-wizard__editable-cell',
				value: surnamesValue,
				attr: { placeholder: '?' },
			});
			surnamesInput.addEventListener('change', () => {
				info.editedSurnames = surnamesInput.value;
			});

			// Year (editable)
			const yearCell = row.createEl('td');
			const yearValue = info.editedYear ?? String(info.parsed.recordYear || info.parsed.birthYear || '');
			const yearInput = yearCell.createEl('input', {
				type: 'text',
				cls: 'cr-image-wizard__editable-cell cr-image-wizard__editable-cell--narrow',
				value: yearValue,
				attr: { placeholder: '?' },
			});
			yearInput.addEventListener('change', () => {
				info.editedYear = yearInput.value;
			});

			// Type (dropdown)
			const typeCell = row.createEl('td');
			const typeSelect = typeCell.createEl('select', { cls: 'cr-image-wizard__type-select' });

			typeSelect.createEl('option', { value: '', text: '—' });
			for (const st of sourceTypes) {
				const opt = typeSelect.createEl('option', { value: st.id, text: st.name });
				if ((info.editedType ?? info.parsed.recordType) === st.id) {
					opt.selected = true;
				}
			}
			typeSelect.addEventListener('change', () => {
				info.editedType = typeSelect.value;
			});

			// Location (editable)
			const locationCell = row.createEl('td');
			const locationValue =
				info.editedLocation ??
				[info.parsed.location?.country, info.parsed.location?.state].filter(Boolean).join(', ');
			const locationInput = locationCell.createEl('input', {
				type: 'text',
				cls: 'cr-image-wizard__editable-cell',
				value: locationValue,
				attr: { placeholder: '—' },
			});
			locationInput.addEventListener('change', () => {
				info.editedLocation = locationInput.value;
			});

			// Multi-part group
			const groupCell = row.createEl('td');
			if (info.groupId) {
				const groupFiles = this.filteredFiles.filter((f) => f.groupId === info.groupId);
				const groupIndex = groupFiles.indexOf(info) + 1;
				groupCell.createSpan({
					text: `${groupIndex}/${groupFiles.length}`,
					cls: 'cr-image-wizard__group-badge',
					attr: {
						title: `本文档共 ${groupFiles.length} 页，这是第 ${groupIndex} 页。所有页面将关联到同一条来源笔记。`,
					},
				});
			} else {
				groupCell.createSpan({
					text: '—',
					cls: 'crc-text-muted',
					attr: { title: '单页文档' },
				});
			}

			// Confidence dot
			const confCell = row.createEl('td', { cls: 'cr-image-wizard__cell-confidence' });
			confCell.createSpan({
				cls: `cr-image-wizard__confidence-dot cr-image-wizard__confidence-dot--${info.parsed.confidence}`,
				attr: { title: `${info.parsed.confidence} 置信度` },
			});
		}

		if (this.filteredFiles.length > 50) {
			container.createDiv({
				cls: 'cr-image-wizard__info',
				text: `显示 ${this.filteredFiles.length} 个文件中的 50 个`,
			});
		}
	}

	/**
	 * Step 4: Configure Import
	 */
	private renderConfigureStep(container: HTMLElement): void {
		container.createDiv({
			cls: 'cr-image-wizard__step-header',
			text: '配置导入',
		});

		// Source notes folder
		const section = container.createDiv({ cls: 'cr-image-wizard__config-section' });
		section.createDiv({ cls: 'cr-image-wizard__config-title', text: '来源笔记' });

		new Setting(section)
			.setName('来源笔记文件夹')
			.setDesc('在何处创建来源笔记')
			.addText((text) => {
				text.setPlaceholder('Charted Roots/Sources').setValue(this.sourceNotesFolder);
				new FolderSuggest(this.app, text);
				text.onChange((value) => {
					this.sourceNotesFolder = value;
				});
			});

		// Summary section
		const summarySection = container.createDiv({ cls: 'cr-image-wizard__config-section' });
		summarySection.createDiv({ cls: 'cr-image-wizard__config-title', text: '导入摘要' });

		const summaryGrid = summarySection.createDiv({ cls: 'cr-image-wizard__summary-grid' });

		const toRename =
			this.enableRenaming && this.renameConflicts.size === 0
				? this.filteredFiles.filter((f) => f.includeInRename && f.file.name !== f.proposedName).length
				: 0;

		// Calculate source count (accounting for groups)
		const groupedFiles = new Set<string>();
		let sourceCount = 0;
		for (const info of this.filteredFiles) {
			if (info.groupId) {
				if (!groupedFiles.has(info.groupId)) {
					groupedFiles.add(info.groupId);
					sourceCount++;
				}
			} else {
				sourceCount++;
			}
		}

		this.createSummaryItem(summaryGrid, '待处理图片', String(this.filteredFiles.length));
		this.createSummaryItem(summaryGrid, '待重命名文件', String(toRename));
		this.createSummaryItem(summaryGrid, '待创建来源', String(sourceCount));
		this.createSummaryItem(summaryGrid, '多页文档分组', String(this.multiPartGroups.size));

		// Warning for low confidence files
		const lowConfidence = this.filteredFiles.filter((f) => f.parsed.confidence === 'low').length;
		if (lowConfidence > 0) {
			const warningSection = container.createDiv({ cls: 'cr-image-wizard__warning-section' });
			const warningIcon = createLucideIcon('alert-triangle', 20);
			warningSection.appendChild(warningIcon);
			const warningText = warningSection.createDiv({ cls: 'cr-image-wizard__warning-text' });
			warningText.createDiv({
				cls: 'cr-image-wizard__warning-title',
				text: `${lowConfidence} 个文件的置信度较低`,
			});
			warningText.createDiv({
				cls: 'cr-image-wizard__warning-desc',
				text: '这些来源笔记将仅包含最基本的元数据。导入后你或许需要手动检查它们。',
			});
		}
	}

	/**
	 * Create a summary item in the grid
	 */
	private createSummaryItem(container: HTMLElement, label: string, value: string): void {
		const item = container.createDiv({ cls: 'cr-image-wizard__summary-item' });
		item.createDiv({ cls: 'cr-image-wizard__summary-label', text: label });
		item.createDiv({ cls: 'cr-image-wizard__summary-value', text: value });
	}

	/**
	 * Step 5: Execute Import
	 */
	private renderExecuteStep(container: HTMLElement): void {
		container.createDiv({
			cls: 'cr-image-wizard__step-header',
			text: this.isExecuting ? '正在导入…' : '导入完成',
		});

		if (this.isExecuting) {
			// Progress bar
			const progressContainer = container.createDiv({ cls: 'cr-image-wizard__progress-container' });
			const progressBar = progressContainer.createDiv({ cls: 'cr-image-wizard__progress-bar' });
			const progressFill = progressBar.createDiv({ cls: 'cr-image-wizard__progress-fill' });
			progressFill.style.width = `${this.executionProgress}%`;

			const progressText = progressContainer.createDiv({ cls: 'cr-image-wizard__progress-text' });
			progressText.createSpan({ text: `${Math.round(this.executionProgress)}%` });

			return;
		}

		// Results summary
		const successCount = this.executionResults.filter((r) => r.success).length;
		const failCount = this.executionResults.filter((r) => !r.success).length;
		const totalImages = this.executionResults.reduce((sum, r) => sum + r.imageCount, 0);

		const resultsGrid = container.createDiv({ cls: 'cr-image-wizard__results-grid' });

		const createResultCard = (value: string, label: string) => {
			const card = resultsGrid.createDiv({ cls: 'cr-image-wizard__result-card' });
			card.createDiv({ cls: 'cr-image-wizard__result-value', text: value });
			card.createDiv({ cls: 'cr-image-wizard__result-label', text: label });
		};

		createResultCard(String(successCount), '已创建来源');
		createResultCard(String(totalImages), '已关联图片');
		if (failCount > 0) {
			createResultCard(String(failCount), '失败');
		}

		// Status log
		const logContainer = container.createDiv({ cls: 'cr-image-wizard__log' });

		for (const result of this.executionResults) {
			const logItem = logContainer.createDiv({
				cls: `cr-image-wizard__log-item ${result.success ? 'cr-image-wizard__log-item--success' : 'cr-image-wizard__log-item--error'}`,
			});

			if (result.success) {
				logItem.createSpan({ text: `✓ 已创建：${result.sourcePath}` });
				if (result.imageCount > 1) {
					logItem.createSpan({ text: `（${result.imageCount} 张图片）`, cls: 'crc-text-muted' });
				}
			} else {
				logItem.createSpan({ text: `✗ 失败：${result.error}` });
			}
		}
	}

	/**
	 * Render navigation buttons
	 */
	private renderNavigationButtons(): void {
		const { contentEl } = this;
		const buttonsEl = contentEl.createDiv({ cls: 'cr-image-wizard__buttons' });

		// Done button on execute step (completed)
		if (this.currentStep === 'execute' && !this.isExecuting) {
			const doneBtn = buttonsEl.createEl('button', {
				text: '完成',
				cls: 'mod-cta',
			});
			doneBtn.addEventListener('click', () => this.close());
			return;
		}

		// Cancel button
		const cancelBtn = buttonsEl.createEl('button', { text: '取消' });
		cancelBtn.addEventListener('click', () => this.close());

		// Back button (not on first step or during execution)
		if (this.currentStep !== 'select' && !this.isExecuting) {
			const backBtn = buttonsEl.createEl('button', { text: '上一步' });
			backBtn.addEventListener('click', () => this.goBack());
		}

		// Next/Start button
		if (this.currentStep === 'configure') {
			const startBtn = buttonsEl.createEl('button', {
				text: '开始导入',
				cls: 'mod-cta',
			});
			startBtn.disabled = !this.canProceed();
			startBtn.addEventListener('click', () => void this.executeImport());
		} else if (this.currentStep !== 'execute') {
			const nextBtn = buttonsEl.createEl('button', {
				text: '下一步',
				cls: 'mod-cta',
			});
			nextBtn.disabled = !this.canProceed();
			nextBtn.addEventListener('click', () => this.goNext());
		}
	}

	/**
	 * Check if we can proceed to the next step
	 */
	private canProceed(): boolean {
		switch (this.currentStep) {
			case 'select':
				return this.filteredFiles.length > 0;
			case 'rename':
				// Always allow proceeding - conflicts are warned but not blocking
				return true;
			case 'review':
				return true;
			case 'configure':
				return this.sourceNotesFolder.length > 0;
			default:
				return false;
		}
	}

	/**
	 * Go to next step
	 */
	private goNext(): void {
		const steps: WizardStep[] = ['select', 'rename', 'review', 'configure', 'execute'];
		const currentIndex = steps.indexOf(this.currentStep);
		if (currentIndex < steps.length - 1) {
			this.currentStep = steps[currentIndex + 1];
			this.render();
		}
	}

	/**
	 * Go back to previous step
	 */
	private goBack(): void {
		const steps: WizardStep[] = ['select', 'rename', 'review', 'configure', 'execute'];
		const currentIndex = steps.indexOf(this.currentStep);
		if (currentIndex > 0) {
			this.currentStep = steps[currentIndex - 1];
			this.render();
		}
	}

	/**
	 * Execute the import process
	 */
	private async executeImport(): Promise<void> {
		this.isExecuting = true;
		this.executionResults = [];
		this.executionProgress = 0;
		this.currentStep = 'execute';
		this.render();

		try {
			// Step 1: Rename files if enabled
			if (this.enableRenaming) {
				await this.executeRenames();
			}

			// Step 2: Create source notes
			await this.createSourceNotes();
		} catch (error) {
			new Notice(`导入失败：${error instanceof Error ? error.message : String(error)}`);
		}

		this.isExecuting = false;
		this.render();
	}

	/**
	 * Execute file renames
	 */
	private async executeRenames(): Promise<void> {
		const toRename = this.filteredFiles.filter(
			(f) => f.includeInRename && f.file.name !== f.proposedName
		);

		for (let i = 0; i < toRename.length; i++) {
			const info = toRename[i];
			try {
				const newPath = info.file.parent
					? `${info.file.parent.path}/${info.proposedName}`
					: info.proposedName;

				await this.app.fileManager.renameFile(info.file, newPath);

				// Update file reference
				const newFile = this.app.vault.getAbstractFileByPath(newPath);
				if (newFile instanceof TFile) {
					info.file = newFile;
				}
			} catch (error) {
				// Continue with original name if rename fails
				console.error(`Failed to rename ${info.file.name}:`, error);
			}

			this.executionProgress = ((i + 1) / toRename.length) * 30; // 30% for renames
			this.render();
		}
	}

	/**
	 * Create source notes for images
	 */
	private async createSourceNotes(): Promise<void> {
		// Group files by groupId (or individual)
		const groups = new Map<string, ImageFileInfo[]>();
		let ungroupedIndex = 0;

		for (const info of this.filteredFiles) {
			const key = info.groupId || `single-${ungroupedIndex++}`;
			const existing = groups.get(key) || [];
			existing.push(info);
			groups.set(key, existing);
		}

		const totalGroups = groups.size;
		let processed = 0;

		for (const [, files] of groups) {
			try {
				const result = await this.createSourceForGroup(files);
				this.executionResults.push(result);
			} catch (error) {
				this.executionResults.push({
					success: false,
					imageCount: files.length,
					error: error instanceof Error ? error.message : String(error),
				});
			}

			processed++;
			this.executionProgress = 30 + (processed / totalGroups) * 70; // 70% for source creation
			this.render();
		}
	}

	/**
	 * Create a source note for a group of files (or single file)
	 */
	private async createSourceForGroup(files: ImageFileInfo[]): Promise<ImportResult> {
		const primary = files[0];

		// Build source data
		const surnames = (primary.editedSurnames ?? primary.parsed.surnames.join(', ')).split(',').map((s) => s.trim());
		const year = primary.editedYear ?? String(primary.parsed.recordYear || primary.parsed.birthYear || '');
		const sourceType = primary.editedType ?? primary.parsed.recordType ?? 'custom';

		// Generate title
		let title = generateSourceTitle(primary.parsed);
		if (primary.editedSurnames || primary.editedYear) {
			// Rebuild title with user edits
			const parts: string[] = [];
			const typeDef = getSourceType(sourceType, this.plugin.settings.customSourceTypes, this.plugin.settings.showBuiltInSourceTypes);
			if (typeDef) {
				parts.push(typeDef.name);
			}
			if (year) {
				parts.push(year);
			}
			if (surnames.length > 0 && surnames[0]) {
				parts.push('-');
				parts.push(surnames.join(' '));
			}
			if (parts.length > 0) {
				title = parts.join(' ');
			}
		}

		// Build media array (wikilinks)
		const media = files.map((f) => `[[${f.file.path}]]`);

		// Ensure folder exists
		const folder = this.app.vault.getAbstractFileByPath(this.sourceNotesFolder);
		if (!folder) {
			await this.app.vault.createFolder(this.sourceNotesFolder);
		}

		// Create source note
		const sourcePath = `${this.sourceNotesFolder}/${title}.md`;

		// Check if file already exists
		let finalPath = sourcePath;
		let counter = 1;
		while (this.app.vault.getAbstractFileByPath(finalPath)) {
			finalPath = `${this.sourceNotesFolder}/${title} (${counter}).md`;
			counter++;
		}

		// Build frontmatter
		const frontmatter: Record<string, unknown> = {
			cr_type: 'source',
			title,
			source_type: sourceType,
		};

		if (year) {
			frontmatter.date = year;
		}

		// Add media fields
		if (media.length > 0) {
			frontmatter.media = media[0];
		}
		for (let i = 1; i < media.length; i++) {
			frontmatter[`media_${i + 1}`] = media[i];
		}

		// Build content
		const frontmatterStr = Object.entries(frontmatter)
			.map(([key, value]) => `${key}: ${typeof value === 'string' && value.includes('[[') ? value : JSON.stringify(value)}`)
			.join('\n');

		const content = `---\n${frontmatterStr}\n---\n\n# ${title}\n`;

		await this.app.vault.create(finalPath, content);

		return {
			success: true,
			sourcePath: finalPath,
			imageCount: files.length,
		};
	}
}