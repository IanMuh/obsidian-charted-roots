/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call -- Obsidian API returns any-typed surfaces (frontmatter, file caches, plugin state); project policy accepts these. */
/**
 * Import Wizard Modal
 *
 * A 7-step wizard for importing genealogical data.
 *
 * Step 1: Format — Select import format (GEDCOM, GEDCOM X, Gramps, CSV)
 * Step 2: File — Drag-and-drop file picker
 * Step 3: Options — Entity types, target folder, conflict handling
 * Step 4: Preview — Entity counts, duplicate warnings
 * Step 5: Import — Progress with real-time log
 * Step 6: Numbering — Optional reference numbering
 * Step 7: Complete — Summary with actions
 */

import { App, ButtonComponent, Modal, Notice, setIcon } from 'obsidian';
import type CanvasRootsPlugin from '../../main';
import { GedcomImporterV2 } from '../gedcom/gedcom-importer-v2';
import { collectDateWarnings, summarizeDateInterpretations } from '../gedcom/gedcom-date-warnings';
import type { DateInterpretationSummary } from '../gedcom/gedcom-date-warnings';
import type { GedcomDateInterpretation } from '../gedcom/gedcom-parser';
import type { GedcomDataV2, GedcomImportOptionsV2, GedcomImportResultV2 } from '../gedcom/gedcom-types';
import { ReferenceNumberingService, type NumberingSystem as RefNumberingSystem, type NumberingStats } from '../core/reference-numbering';
import { PersonPickerModal, type PersonInfo } from './person-picker';
import { GrampsParser } from '../gramps/gramps-parser';
import { extractGpkg, type GpkgExtractionResult } from '../gramps/gpkg-extractor';
import { GrampsImporter, type GrampsImportOptions, type GrampsImportResult } from '../gramps/gramps-importer';
import { readFileWithDecompression } from '../core/compression-utils';
import { estimateImportSize } from '../core/import-size-estimate';
import { PrivacyNoticeModal } from './privacy-notice-modal';

/**
 * Import format types
 */
export type ImportFormat = 'gedcom' | 'gedcomx' | 'gramps' | 'csv';

/**
 * Numbering system types
 */
export type NumberingSystem = 'ahnentafel' | 'daboville' | 'henry' | 'generation' | 'none';

/**
 * Conflict handling options
 */
export type ConflictHandling = 'skip' | 'overwrite' | 'rename';

/**
 * Import wizard form data
 */
interface ImportWizardFormData {
	// Step 1: Format
	format: ImportFormat;

	// Step 2: File
	file: File | null;
	fileName: string;
	fileSize: number;

	// Step 3: Options
	importPeople: boolean;
	importPlaces: boolean;
	importSources: boolean;
	importEvents: boolean;
	importMedia: boolean;
	importNotes: boolean;  // Import notes attached to entities (GEDCOM and Gramps)
	createSeparateNoteFiles: boolean;  // Create separate note files instead of embedding (GEDCOM and Gramps)
	mediaPathPrefix: string;  // External media path prefix to strip (GEDCOM only)
	mediaFolder: string;
	preserveMediaFolderStructure: boolean;
	includeDynamicBlocks: boolean;
	targetFolder: string;
	conflictHandling: ConflictHandling;
	largeImportMode: boolean;  // Suspend sync-on-modify during import for better performance

	// Step 4: Preview (populated after parsing)
	previewCounts: {
		people: number;
		places: number;
		sources: number;
		events: number;
		media: number;
	};
	duplicateCount: number;
	fileContent: string | null;
	parsedData: GedcomDataV2 | null;
	parseErrors: string[];
	parseWarnings: string[];
	// Date interpretation (#718): per-category choices for ambiguous/non-standard
	// dates, surfaced in the preview with counts from dateSummary.
	dateSlashOrder: 'day-month' | 'month-day';
	dateEventLabel: 'import' | 'skip';
	dateSummary: DateInterpretationSummary | null;
	gpkgExtractionResult: GpkgExtractionResult | null;
	previewParsed: boolean;  // Track if preview parsing has been attempted

	// Step 5: Import (progress)
	importedCount: number;
	totalCount: number;
	importLog: string[];
	importResult: GedcomImportResultV2 | GrampsImportResult | null;

	// Step 6: Numbering
	numberingSystem: NumberingSystem;
	rootPersonCrId: string | null;
	rootPersonName: string | null;
	numberingStats: NumberingStats | null;
	isAssigningNumbers: boolean;

	// Step 7: Complete
	importComplete: boolean;
	skippedCount: number;
	privacyNoticeShown: boolean;
}

/**
 * Format configuration
 */
interface FormatConfig {
	id: ImportFormat;
	name: string;
	description: string;
	extension: string;
	icon: string;
}

const IMPORT_FORMATS: FormatConfig[] = [
	{
		id: 'gedcom',
		name: 'GEDCOM 5.5.1',
		description: '标准家谱格式（.ged）',
		extension: '.ged',
		icon: 'file-text'
	},
	{
		id: 'gedcomx',
		name: 'GEDCOM X (JSON)',
		description: '现代 JSON 格式',
		extension: '.json',
		icon: 'file-json'
	},
	{
		id: 'gramps',
		name: 'Gramps XML/.gpkg',
		description: 'Gramps 软件（.gpkg 包含媒体）',
		extension: '.gpkg,.gramps',
		icon: 'file-archive'
	},
	{
		id: 'csv',
		name: 'CSV',
		description: '电子表格数据（.csv）',
		extension: '.csv',
		icon: 'table'
	}
];

/**
 * Import Wizard Modal
 */
export class ImportWizardModal extends Modal {
	private plugin: CanvasRootsPlugin;
	private currentStep: number = 0;
	private formData: ImportWizardFormData;
	private contentContainer: HTMLElement | null = null;
	private progressContainer: HTMLElement | null = null;
	private importer: GedcomImporterV2;
	private isImporting: boolean = false;
	private isParsing: boolean = false;

	// Step definitions
	private readonly steps = [
		{ number: 1, title: '格式', description: '选择导入格式' },
		{ number: 2, title: '文件', description: '选择要导入的文件' },
		{ number: 3, title: '选项', description: '配置导入选项' },
		{ number: 4, title: '预览', description: '导入前确认' },
		{ number: 5, title: '导入', description: '正在导入数据……' },
		{ number: 6, title: '编号', description: '分配参考编号' },
		{ number: 7, title: '完成', description: '导入完成' }
	];

	constructor(app: App, plugin: CanvasRootsPlugin) {
		super(app);
		this.plugin = plugin;
		this.formData = this.getDefaultFormData();
		this.importer = new GedcomImporterV2(app, plugin);
	}

	/**
	 * Get default form data
	 */
	private getDefaultFormData(): ImportWizardFormData {
		return {
			// Step 1
			format: 'gedcom',

			// Step 2
			file: null,
			fileName: '',
			fileSize: 0,

			// Step 3
			importPeople: true,
			importPlaces: true,
			importSources: true,
			importEvents: true,
			importMedia: true,
			importNotes: true,  // Default: import notes (GEDCOM and Gramps)
			createSeparateNoteFiles: false,  // Default: embed notes (GEDCOM and Gramps)
			mediaPathPrefix: '',  // Default: no prefix stripping
			mediaFolder: this.plugin?.settings?.mediaFolders?.[0] || 'Charted Roots/Media',
			preserveMediaFolderStructure: false,
			includeDynamicBlocks: true,
			targetFolder: this.plugin?.settings?.peopleFolder || 'People',
			conflictHandling: 'skip',
			largeImportMode: false,  // Default: off (user must opt-in for large imports)

			// Step 4
			previewCounts: {
				people: 0,
				places: 0,
				sources: 0,
				events: 0,
				media: 0
			},
			duplicateCount: 0,
			fileContent: null,
			parsedData: null,
			parseErrors: [],
			parseWarnings: [],
			dateSlashOrder: 'day-month',
			dateEventLabel: 'import',
			dateSummary: null,
			gpkgExtractionResult: null,
			previewParsed: false,

			// Step 5
			importedCount: 0,
			totalCount: 0,
			importLog: [],
			importResult: null,

			// Step 6
			numberingSystem: 'none',
			rootPersonCrId: null,
			rootPersonName: null,
			numberingStats: null,
			isAssigningNumbers: false,

			// Step 7
			importComplete: false,
			skippedCount: 0,
			privacyNoticeShown: false
		};
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('crc-import-wizard');
		this.modalEl.addClass('crc-import-wizard-sized');

		// Modal header with icon and title
		const header = contentEl.createDiv({ cls: 'crc-import-wizard-header' });

		const titleRow = header.createDiv({ cls: 'crc-wizard-title' });
		const iconEl = titleRow.createDiv({ cls: 'crc-wizard-title-icon' });
		setIcon(iconEl, 'download');
		titleRow.createSpan({ text: '导入数据' });

		// Step progress indicator
		this.renderStepProgress(contentEl);

		// Content container
		this.contentContainer = contentEl.createDiv({ cls: 'crc-import-wizard-content' });

		// Render current step
		this.renderCurrentStep();
	}

	onClose(): void {
		const { contentEl } = this;
		contentEl.empty();
	}

	/**
	 * Render the step progress indicator
	 */
	private renderStepProgress(container: HTMLElement): void {
		this.progressContainer = container.createDiv({ cls: 'crc-wizard-progress' });
		this.updateStepProgress();
	}

	/**
	 * Update the step progress indicator
	 */
	private updateStepProgress(): void {
		if (!this.progressContainer) return;
		this.progressContainer.empty();

		const stepsRow = this.progressContainer.createDiv({ cls: 'crc-wizard-steps' });

		// Only show 5 step circles (steps 1-5) to keep UI compact
		// Steps 6 and 7 are conditional/post-import
		const visibleSteps = this.steps.slice(0, 5);

		visibleSteps.forEach((step, index) => {
			// Step circle with number
			const stepEl = stepsRow.createDiv({ cls: 'crc-wizard-step' });

			// Map currentStep to visible step index
			const effectiveStep = Math.min(this.currentStep, 4);

			// Mark active or completed
			if (index === effectiveStep) {
				stepEl.addClass('crc-wizard-step--active');
			} else if (index < effectiveStep) {
				stepEl.addClass('crc-wizard-step--completed');
			}

			// Step number circle
			const numberEl = stepEl.createDiv({ cls: 'crc-wizard-step-number' });
			if (index < effectiveStep) {
				// Show checkmark for completed steps
				setIcon(numberEl, 'check');
			} else {
				numberEl.textContent = String(step.number);
			}

			// Add connector between steps (except after last visible step)
			if (index < visibleSteps.length - 1) {
				const connector = stepsRow.createDiv({ cls: 'crc-wizard-connector' });
				if (index < effectiveStep) {
					connector.addClass('crc-wizard-connector--completed');
				}
			}
		});
	}

	/**
	 * Render the current step
	 */
	private renderCurrentStep(): void {
		if (!this.contentContainer) return;
		this.contentContainer.empty();

		// Update step progress indicator
		this.updateStepProgress();

		switch (this.currentStep) {
			case 0:
				this.renderStep1Format(this.contentContainer);
				break;
			case 1:
				this.renderStep2File(this.contentContainer);
				break;
			case 2:
				this.renderStep3Options(this.contentContainer);
				break;
			case 3:
				this.renderStep4Preview(this.contentContainer);
				break;
			case 4:
				this.renderStep5Import(this.contentContainer);
				break;
			case 5:
				this.renderStep6Numbering(this.contentContainer);
				break;
			case 6:
				this.renderStep7Complete(this.contentContainer);
				break;
		}

		// Render footer with navigation buttons
		this.renderFooter(this.contentContainer);
	}

	/**
	 * Step 1: Format Selection
	 */
	private renderStep1Format(container: HTMLElement): void {
		const section = container.createDiv({ cls: 'crc-import-section' });
		section.createEl('h3', { text: '选择导入格式', cls: 'crc-import-section-title' });

		const formatGrid = section.createDiv({ cls: 'crc-import-format-grid' });

		for (const format of IMPORT_FORMATS) {
			const card = formatGrid.createDiv({ cls: 'crc-import-format-card' });
			if (this.formData.format === format.id) {
				card.addClass('crc-import-format-card--selected');
			}

			const cardHeader = card.createDiv({ cls: 'crc-import-format-card-header' });
			const iconEl = cardHeader.createDiv({ cls: 'crc-import-format-card-icon' });
			setIcon(iconEl, format.icon);
			cardHeader.createDiv({ cls: 'crc-import-format-card-title', text: format.name });

			card.createDiv({ cls: 'crc-import-format-card-description', text: format.description });

			card.addEventListener('click', () => {
				this.formData.format = format.id;
				this.renderCurrentStep();
			});
		}
	}

	/**
	 * Step 2: File Selection
	 */
	private renderStep2File(container: HTMLElement): void {
		const section = container.createDiv({ cls: 'crc-import-section' });
		const selectedFormat = IMPORT_FORMATS.find(f => f.id === this.formData.format);
		section.createEl('h3', { text: `选择 ${selectedFormat?.name || ''} 文件`, cls: 'crc-import-section-title' });

		// File dropzone
		const dropzone = section.createDiv({ cls: 'crc-import-dropzone' });

		if (this.formData.file) {
			dropzone.addClass('crc-import-dropzone--has-file');

			const fileInfo = dropzone.createDiv({ cls: 'crc-import-file-info' });
			const fileIcon = fileInfo.createDiv({ cls: 'crc-import-file-icon' });
			setIcon(fileIcon, 'file');

			const fileDetails = fileInfo.createDiv({ cls: 'crc-import-file-details' });
			fileDetails.createDiv({ cls: 'crc-import-file-name', text: this.formData.fileName });
			fileDetails.createDiv({
				cls: 'crc-import-file-size',
				text: this.formatFileSize(this.formData.fileSize)
			});

			const removeBtn = fileInfo.createDiv({ cls: 'crc-import-file-remove' });
			setIcon(removeBtn, 'x');
			removeBtn.addEventListener('click', (e) => {
				e.stopPropagation();
				this.formData.file = null;
				this.formData.fileName = '';
				this.formData.fileSize = 0;
				this.renderCurrentStep();
			});
		} else {
			const dropzoneContent = dropzone.createDiv({ cls: 'crc-import-dropzone-content' });
			const dropzoneIcon = dropzoneContent.createDiv({ cls: 'crc-import-dropzone-icon' });
			setIcon(dropzoneIcon, 'upload');

			dropzoneContent.createDiv({
				cls: 'crc-import-dropzone-text',
				text: '将文件拖放到此处'
			});
			dropzoneContent.createDiv({
				cls: 'crc-import-dropzone-subtext',
				text: '或点击浏览'
			});
		}

		// Hidden file input
		const fileInput = section.createEl('input', {
			type: 'file',
			cls: 'crc-import-file-input'
		});
		fileInput.accept = selectedFormat?.extension || '*';
		fileInput.setCssProps({ display: 'none' });

		fileInput.addEventListener('change', () => {
			if (fileInput.files && fileInput.files.length > 0) {
				const file = fileInput.files[0];
				this.formData.file = file;
				this.formData.fileName = file.name;
				this.formData.fileSize = file.size;
				this.renderCurrentStep();
			}
		});

		dropzone.addEventListener('click', () => {
			fileInput.click();
		});

		// Drag and drop handlers
		dropzone.addEventListener('dragover', (e) => {
			e.preventDefault();
			dropzone.addClass('crc-import-dropzone--dragover');
		});

		dropzone.addEventListener('dragleave', () => {
			dropzone.removeClass('crc-import-dropzone--dragover');
		});

		dropzone.addEventListener('drop', (e) => {
			e.preventDefault();
			dropzone.removeClass('crc-import-dropzone--dragover');

			if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
				const file = e.dataTransfer.files[0];
				this.formData.file = file;
				this.formData.fileName = file.name;
				this.formData.fileSize = file.size;
				this.renderCurrentStep();
			}
		});
	}

	/**
	 * Step 3: Options
	 */
	private renderStep3Options(container: HTMLElement): void {
		const section = container.createDiv({ cls: 'crc-import-section' });

		// Entity types
		section.createEl('h4', { text: '要导入的实体类型', cls: 'crc-import-options-title' });

		const entityOptions = section.createDiv({ cls: 'crc-import-options-grid' });

		this.renderToggleOption(entityOptions, '人物', '个人与家族记录', this.formData.importPeople, (val) => {
			this.formData.importPeople = val;
		});

		this.renderToggleOption(entityOptions, '地点', '地点记录', this.formData.importPlaces, (val) => {
			this.formData.importPlaces = val;
		});

		this.renderToggleOption(entityOptions, '来源', '来源引文', this.formData.importSources, (val) => {
			this.formData.importSources = val;
		});

		this.renderToggleOption(entityOptions, '事件', '历史事件', this.formData.importEvents, (val) => {
			this.formData.importEvents = val;
		});

		// Notes and Media toggles for GEDCOM format
		if (this.formData.format === 'gedcom') {
			this.renderToggleOption(entityOptions, '笔记', '将 GEDCOM 笔记追加到人物内容', this.formData.importNotes, (val) => {
				this.formData.importNotes = val;
				// Refresh to show/hide dependent option
				this.renderCurrentStep();
			});

			// Show separate note files option only when Notes is enabled
			if (this.formData.importNotes) {
				this.renderToggleOption(entityOptions, '创建单独的笔记文件', '创建独立的笔记文件而非嵌入内容', this.formData.createSeparateNoteFiles, (val) => {
					this.formData.createSeparateNoteFiles = val;
				});
			}

			// Media toggle for GEDCOM
			this.renderToggleOption(entityOptions, '媒体引用', '将 OBJE 媒体引用链接为 Wiki 链接', this.formData.importMedia, (val) => {
				this.formData.importMedia = val;
				// Refresh to show/hide path prefix field
				this.renderCurrentStep();
			});

			// Show media path prefix option when Media is enabled
			if (this.formData.importMedia) {
				const prefixRow = entityOptions.createDiv({ cls: 'crc-import-option-row crc-mt-1' });
				prefixRow.createEl('label', {
					text: '要剥离的外部媒体路径前缀',
					cls: 'crc-import-option-label'
				});
				const prefixInput = prefixRow.createEl('input', {
					type: 'text',
					cls: 'crc-import-input',
					value: this.formData.mediaPathPrefix,
					placeholder: '例如：/media/photos/ancestors'
				});

				// Container for preview (will update dynamically)
				const previewContainer = entityOptions.createDiv({ cls: 'crc-media-preview-container crc-mt-1' });

				// Function to update the preview
				const updateMediaPreview = () => {
					previewContainer.empty();
					if (!this.formData.parsedData || this.formData.parsedData.media.size === 0) {
						return;
					}

					// Get sample media paths (up to 3)
					const mediaEntries = Array.from(this.formData.parsedData.media.values());
					const samplesToShow = Math.min(3, mediaEntries.length);

					if (samplesToShow > 0) {
						const previewEl = previewContainer.createDiv({ cls: 'crc-media-preview' });
						previewEl.createEl('div', {
							text: '预览：',
							cls: 'crc-media-preview-label'
						});

						const listEl = previewEl.createEl('ul', { cls: 'crc-media-preview-list' });
						for (let i = 0; i < samplesToShow; i++) {
							const media = mediaEntries[i];
							const originalPath = media.filePath || '';
							let resolvedFilename = originalPath;

							// Strip prefix if configured
							if (this.formData.mediaPathPrefix) {
								const normalizedPath = originalPath.replace(/\\/g, '/');
								const normalizedPrefix = this.formData.mediaPathPrefix.replace(/\\/g, '/').replace(/\/$/, '');
								if (normalizedPath.startsWith(normalizedPrefix)) {
									resolvedFilename = normalizedPath.substring(normalizedPrefix.length);
									if (resolvedFilename.startsWith('/')) {
										resolvedFilename = resolvedFilename.substring(1);
									}
								}
							}

							// Extract filename
							const filename = resolvedFilename.split('/').pop() || resolvedFilename.split('\\').pop() || resolvedFilename;

							const itemEl = listEl.createEl('li', { cls: 'crc-media-preview-item' });
							// Show truncated original path → wikilink
							const truncatedPath = originalPath.length > 40
								? '...' + originalPath.slice(-37)
								: originalPath;
							itemEl.createEl('span', {
								text: truncatedPath,
								cls: 'crc-media-path-original',
								attr: { title: originalPath }
							});
							itemEl.createEl('span', { text: ' → ', cls: 'crc-media-path-arrow' });
							itemEl.createEl('span', {
								text: `[[${filename}]]`,
								cls: 'crc-media-path-wikilink'
							});
						}

						if (mediaEntries.length > samplesToShow) {
							previewEl.createEl('div', {
								text: `……以及另外 ${mediaEntries.length - samplesToShow} 个`,
								cls: 'crc-media-preview-more'
							});
						}
					}
				};

				// Update preview on input change
				prefixInput.addEventListener('input', () => {
					this.formData.mediaPathPrefix = prefixInput.value;
					updateMediaPreview();
				});

				// Initial preview render
				updateMediaPreview();

				// Add hint text
				const hintEl = entityOptions.createDiv({ cls: 'crc-import-option-hint crc-mt-1' });
				hintEl.textContent = '如果你的 GEDCOM 包含「/media/photos/ancestors/smith/photo.jpg」这样的完整路径，请输入要剥离的前缀。将只使用文件名作为 Wiki 链接。';
			}
		}

		if (this.formData.format === 'gramps') {
			this.renderToggleOption(entityOptions, '媒体', '附加的媒体文件', this.formData.importMedia, (val) => {
				this.formData.importMedia = val;
			});

			this.renderToggleOption(entityOptions, '笔记', '将 Gramps 笔记追加到实体内容', this.formData.importNotes, (val) => {
				this.formData.importNotes = val;
				// Refresh to show/hide dependent option
				this.renderCurrentStep();
			});

			// Show separate note files option only when Notes is enabled
			if (this.formData.importNotes) {
				this.renderToggleOption(entityOptions, '创建单独的笔记文件', '创建独立的笔记文件而非嵌入内容', this.formData.createSeparateNoteFiles, (val) => {
					this.formData.createSeparateNoteFiles = val;
				});
			}
		}

		this.renderToggleOption(entityOptions, '动态块', '笔记中的时间轴、关系和媒体渲染器', this.formData.includeDynamicBlocks, (val) => {
			this.formData.includeDynamicBlocks = val;
		});

		// Target folder
		section.createEl('h4', { text: '目标文件夹', cls: 'crc-import-options-title crc-mt-3' });

		const folderRow = section.createDiv({ cls: 'crc-import-option-row' });
		const folderInput = folderRow.createEl('input', {
			type: 'text',
			cls: 'crc-import-input',
			value: this.formData.targetFolder,
			placeholder: 'People'
		});
		folderInput.addEventListener('input', () => {
			this.formData.targetFolder = folderInput.value;
		});

		// Conflict handling
		section.createEl('h4', { text: '重复处理', cls: 'crc-import-options-title crc-mt-3' });

		const conflictOptions = section.createDiv({ cls: 'crc-import-conflict-options' });

		const conflictChoices: Array<{ id: ConflictHandling; label: string; description: string }> = [
			{ id: 'skip', label: '跳过重复项', description: '保留现有笔记，跳过 cr_id 相同的新笔记' },
			{ id: 'overwrite', label: '覆盖', description: '用导入的数据替换现有笔记' },
			{ id: 'rename', label: '创建新笔记', description: '以不同名称导入为新笔记' }
		];

		for (const choice of conflictChoices) {
			const optionEl = conflictOptions.createDiv({ cls: 'crc-import-conflict-option' });
			if (this.formData.conflictHandling === choice.id) {
				optionEl.addClass('crc-import-conflict-option--selected');
			}

			optionEl.createDiv({ cls: 'crc-import-radio' });
			const radioContent = optionEl.createDiv({ cls: 'crc-import-radio-content' });
			radioContent.createDiv({ cls: 'crc-import-radio-label', text: choice.label });
			radioContent.createDiv({ cls: 'crc-import-radio-description', text: choice.description });

			optionEl.addEventListener('click', () => {
				this.formData.conflictHandling = choice.id;
				this.renderCurrentStep();
			});
		}

		// Large Import Mode (advanced option)
		section.createEl('h4', { text: '性能', cls: 'crc-import-options-title crc-mt-3' });

		this.renderToggleOption(
			section,
			'大型导入模式',
			'导入期间暂停关系同步以防止超时。建议用于 500 人以上的导入。',
			this.formData.largeImportMode,
			(val) => {
				this.formData.largeImportMode = val;
			}
		);
	}

	/**
	 * Step 4: Preview
	 */
	private renderStep4Preview(container: HTMLElement): void {
		const section = container.createDiv({ cls: 'crc-import-section' });
		section.createEl('h3', { text: '预览', cls: 'crc-import-section-title' });

		// File info
		const fileCard = section.createDiv({ cls: 'crc-import-preview-card' });
		const fileHeader = fileCard.createDiv({ cls: 'crc-import-preview-header' });
		const fileIcon = fileHeader.createDiv({ cls: 'crc-import-preview-icon' });
		setIcon(fileIcon, 'file');
		fileHeader.createDiv({ cls: 'crc-import-preview-filename', text: this.formData.fileName });

		// Check if file needs parsing (GEDCOM or Gramps format)
		// Use previewParsed flag - once we've attempted parsing, don't re-parse
		// This works for both GEDCOM (which sets parsedData) and Gramps (which doesn't)
		const needsParsing = (this.formData.format === 'gedcom' || this.formData.format === 'gramps')
			&& !this.formData.previewParsed  // Already parsed? Don't parse again
			&& this.formData.file
			&& !this.isParsing;  // Don't parse if already parsing

		if (needsParsing) {
			// Set parsing flag BEFORE showing loading state to prevent race conditions
			this.isParsing = true;
			// Mark that we've attempted parsing - this persists even if parsing fails
			this.formData.previewParsed = true;

			// Show loading state
			const loadingEl = section.createDiv({ cls: 'crc-import-preview-loading' });
			loadingEl.textContent = '正在解析文件……';

			// Parse the file asynchronously
			void this.parseFileForPreview();
			return;
		}

		// Show loading state if parsing is in progress
		if (this.isParsing) {
			const loadingEl = section.createDiv({ cls: 'crc-import-preview-loading' });
			loadingEl.textContent = '正在解析文件……';
			return;
		}

		// Show counts from parsed data
		const counts = section.createDiv({ cls: 'crc-import-preview-counts' });

		const { previewCounts } = this.formData;
		const countItems = [
			{ label: '人物', count: previewCounts.people, icon: 'users', enabled: this.formData.importPeople },
			{ label: '地点', count: previewCounts.places, icon: 'map-pin', enabled: this.formData.importPlaces },
			{ label: '来源', count: previewCounts.sources, icon: 'archive', enabled: this.formData.importSources },
			{ label: '事件', count: previewCounts.events, icon: 'calendar', enabled: this.formData.importEvents }
		];

		for (const item of countItems) {
			if (item.enabled) {
				const countEl = counts.createDiv({ cls: 'crc-import-preview-count' });
				const countIcon = countEl.createDiv({ cls: 'crc-import-preview-count-icon' });
				setIcon(countIcon, item.icon);
				countEl.createDiv({ cls: 'crc-import-preview-count-value', text: String(item.count) });
				countEl.createDiv({ cls: 'crc-import-preview-count-label', text: item.label });
			}
		}

		// Projected total + large-import warning (#688). Surfaces how many notes
		// the import will create across the enabled entity types, and warns when
		// that total is large enough to noticeably degrade Obsidian — before any
		// notes are written, so the user can scope their file down first. Shown
		// for every import format, since vault size degrades the app regardless
		// of source. Reuses the existing parse-warning styling (no new CSS).
		const sizeEstimate = estimateImportSize({
			people: previewCounts.people,
			places: previewCounts.places,
			sources: previewCounts.sources,
			events: previewCounts.events,
			importPeople: this.formData.importPeople,
			importPlaces: this.formData.importPlaces,
			importSources: this.formData.importSources,
			importEvents: this.formData.importEvents
		});

		const totalEl = counts.createDiv({ cls: 'crc-import-preview-count' });
		const totalIcon = totalEl.createDiv({ cls: 'crc-import-preview-count-icon' });
		setIcon(totalIcon, 'layers');
		totalEl.createDiv({ cls: 'crc-import-preview-count-value', text: sizeEstimate.totalNotes.toLocaleString() });
		totalEl.createDiv({ cls: 'crc-import-preview-count-label', text: '笔记总数' });

		if (sizeEstimate.isLarge) {
			const sizeWarn = section.createDiv({ cls: 'crc-import-preview-warning' });
			const sizeWarnHeader = sizeWarn.createDiv({ cls: 'crc-import-preview-warning-header' });
			const sizeWarnIcon = sizeWarnHeader.createDiv({ cls: 'crc-import-preview-warning-icon' });
			setIcon(sizeWarnIcon, 'alert-triangle');
			sizeWarnHeader.createDiv({
				cls: 'crc-import-preview-warning-text',
				text: `大型导入：约 ${sizeEstimate.totalNotes.toLocaleString()} 个笔记`
			});
			sizeWarn.createDiv({
				cls: 'crc-import-preview-warning-details',
				text: '如此规模的库可能明显拖慢 Obsidian——通常笔记数量达到低四位数时就会开始卡顿。建议在导入前缩小文件范围（例如仅保留你的直系血脉加上少数几个世代）。'
			});
		}

		// Media folder selection (only show for Gramps with media files)
		if (this.formData.format === 'gramps' &&
			this.formData.importMedia &&
			this.formData.gpkgExtractionResult &&
			this.formData.gpkgExtractionResult.mediaFiles.size > 0) {

			const mediaCount = this.formData.gpkgExtractionResult.mediaFiles.size;
			const mediaFolderSection = section.createDiv({ cls: 'crc-import-media-folder-section crc-mt-3' });
			mediaFolderSection.createEl('h4', {
				text: `媒体目标（${mediaCount} 个文件）`,
				cls: 'crc-import-options-title'
			});

			const mediaFolderRow = mediaFolderSection.createDiv({ cls: 'crc-import-option-row' });
			const mediaFolderSelect = mediaFolderRow.createEl('select', { cls: 'crc-import-select' });

			// Build folder options
			const settings = this.plugin?.settings;
			const configuredFolders = settings?.mediaFolders?.filter((f: string) => f.trim()) || [];
			const defaultFolder = 'Charted Roots/Media';

			// Option 1: Configured folders from settings
			for (const folder of configuredFolders) {
				const option = mediaFolderSelect.createEl('option', { value: folder, text: folder });
				if (this.formData.mediaFolder === folder) {
					option.selected = true;
				}
			}

			// Option 2: Default folder (if not in configured list)
			if (!configuredFolders.includes(defaultFolder)) {
				const option = mediaFolderSelect.createEl('option', {
					value: defaultFolder,
					text: `${defaultFolder}（默认）`
				});
				if (this.formData.mediaFolder === defaultFolder) {
					option.selected = true;
				}
			}

			// Option 3: Custom folder
			const customOption = mediaFolderSelect.createEl('option', { value: '__custom__', text: '自定义文件夹……' });
			const isCustom = !configuredFolders.includes(this.formData.mediaFolder) &&
				this.formData.mediaFolder !== defaultFolder;
			if (isCustom) {
				customOption.selected = true;
			}

			// Custom folder input (hidden by default)
			const customFolderRow = mediaFolderSection.createDiv({ cls: `crc-import-option-row crc-mt-1${isCustom ? '' : ' crc-hidden'}` });
			const customFolderInput = customFolderRow.createEl('input', {
				type: 'text',
				cls: 'crc-import-input',
				placeholder: '输入自定义文件夹路径',
				value: isCustom ? this.formData.mediaFolder : ''
			});

			mediaFolderSelect.addEventListener('change', () => {
				if (mediaFolderSelect.value === '__custom__') {
					customFolderRow.removeClass('crc-hidden');
					customFolderInput.focus();
				} else {
					customFolderRow.addClass('crc-hidden');
					this.formData.mediaFolder = mediaFolderSelect.value;
				}
			});

			customFolderInput.addEventListener('input', () => {
				this.formData.mediaFolder = customFolderInput.value || defaultFolder;
			});

			// Checkbox to preserve folder structure from .gpkg
			const preserveStructureRow = mediaFolderSection.createDiv({ cls: 'crc-import-option-row crc-mt-2' });
			const preserveCheckbox = preserveStructureRow.createEl('input', {
				type: 'checkbox',
				cls: 'crc-import-checkbox'
			});
			preserveCheckbox.id = 'preserve-media-structure';
			preserveCheckbox.checked = this.formData.preserveMediaFolderStructure;

			const preserveLabel = preserveStructureRow.createEl('label', {
				cls: 'crc-import-checkbox-label',
				text: '保留包中的文件夹结构'
			});
			preserveLabel.setAttribute('for', 'preserve-media-structure');

			// Show example of original paths
			const examplePaths = Array.from(this.formData.gpkgExtractionResult.mediaFiles.keys()).slice(0, 2);
			if (examplePaths.length > 0) {
				const exampleEl = mediaFolderSection.createDiv({ cls: 'crc-import-option-hint crc-mt-1' });
				const firstPath = examplePaths[0];
				const pathParts = firstPath.split('/');
				if (pathParts.length > 1) {
					const folderPath = pathParts.slice(0, -1).join('/');
					exampleEl.textContent = `例如：${this.formData.mediaFolder}/${folderPath}/……`;
				}
			}

			preserveCheckbox.addEventListener('change', () => {
				this.formData.preserveMediaFolderStructure = preserveCheckbox.checked;
			});
		}

		// Date interpretation controls (#718): per-category choices for ambiguous
		// slash dates and event-label dates, shown only when such dates exist.
		this.renderDateInterpretationControls(section);

		// Merge the base parser warnings with the date warnings for the current
		// interpretation, so the list reflects what the import will actually do.
		const dateWarnings = this.formData.parsedData
			? collectDateWarnings(this.formData.parsedData, this.getDateInterpretation())
			: [];
		const warnings = [...this.formData.parseWarnings, ...dateWarnings];

		// Show warnings if any
		if (warnings.length > 0) {
			const warningEl = section.createDiv({ cls: 'crc-import-preview-warning' });
			const warningHeader = warningEl.createDiv({ cls: 'crc-import-preview-warning-header' });
			const warningIcon = warningHeader.createDiv({ cls: 'crc-import-preview-warning-icon' });
			setIcon(warningIcon, 'alert-triangle');
			warningHeader.createDiv({
				cls: 'crc-import-preview-warning-text',
				text: `解析时发现 ${warnings.length} 个警告`
			});
			const expandIcon = warningHeader.createDiv({ cls: 'crc-import-preview-warning-expand' });
			setIcon(expandIcon, 'chevron-down');

			// Create collapsible details container
			const warningDetails = warningEl.createDiv({ cls: 'crc-import-preview-warning-details crc-hidden' });
			for (const warning of warnings.slice(0, 10)) {
				warningDetails.createDiv({ cls: 'crc-import-preview-warning-detail', text: warning });
			}
			if (warnings.length > 10) {
				warningDetails.createDiv({
					cls: 'crc-import-preview-warning-more',
					text: `……以及另外 ${warnings.length - 10} 个`
				});
			}

			// Toggle expansion on click
			warningHeader.addClass('crc-clickable');
			warningHeader.addEventListener('click', () => {
				const isExpanded = !warningDetails.hasClass('crc-hidden');
				warningDetails.toggleClass('crc-hidden', isExpanded);
				setIcon(expandIcon, isExpanded ? 'chevron-down' : 'chevron-up');
			});
		}

		// Show errors if any
		if (this.formData.parseErrors.length > 0) {
			const errorEl = section.createDiv({ cls: 'crc-import-preview-error' });
			const errorIcon = errorEl.createDiv({ cls: 'crc-import-preview-error-icon' });
			setIcon(errorIcon, 'x-circle');
			errorEl.createDiv({
				cls: 'crc-import-preview-error-text',
				text: `发现 ${this.formData.parseErrors.length} 个错误。导入可能失败。`
			});
			for (const error of this.formData.parseErrors.slice(0, 3)) {
				errorEl.createDiv({ cls: 'crc-import-preview-error-detail', text: error });
			}
		}

		// Ready message
		if (this.formData.parseErrors.length === 0) {
			const readyEl = section.createDiv({ cls: 'crc-import-preview-ready' });
			readyEl.createSpan({ text: '可以导入了。点击「下一步」继续。' });
		}
	}

	/**
	 * Parse file for preview counts
	 */
	private async parseFileForPreview(): Promise<void> {
		if (!this.formData.file) return;

		// Note: isParsing is set by renderStep4Preview before calling this method
		// to prevent race conditions. We don't need to set it here.

		try {
			// Small delay to ensure "Parsing file..." message is rendered before heavy processing
			await new Promise(resolve => window.requestAnimationFrame(() =>
				window.requestAnimationFrame(() => resolve(undefined))
			));

			// Parse based on format
			if (this.formData.format === 'gedcom') {
				// Read file content as text
				const content = await this.formData.file.text();
				this.formData.fileContent = content;

				// Use async parseContent which handles preprocessing and parsing in one pass
				// This avoids processing the file twice (once for analyze, once for parse)
				const parseResult = await this.importer.parseContentAsync(content);
				this.formData.parseErrors = parseResult.errors;
				this.formData.parseWarnings = parseResult.warnings;

				if (parseResult.valid && parseResult.data) {
					this.formData.parsedData = parseResult.data;

					// Tally ambiguous/non-standard dates so the preview can offer
					// per-category interpretation controls with counts (#718). The
					// per-date warnings themselves are computed at render time from
					// the chosen interpretation (see renderStep4Preview).
					this.formData.dateSummary = summarizeDateInterpretations(parseResult.data);

					// Compute preview counts from parsed data
					const data = parseResult.data;
					let eventCount = 0;
					const places = new Set<string>();

					for (const individual of data.individuals.values()) {
						eventCount += individual.events.length;
						if (individual.birthPlace) places.add(individual.birthPlace.toLowerCase());
						if (individual.deathPlace) places.add(individual.deathPlace.toLowerCase());
						for (const event of individual.events) {
							if (event.place) places.add(event.place.toLowerCase());
						}
					}
					for (const family of data.families.values()) {
						eventCount += family.events.length;
						if (family.marriagePlace) places.add(family.marriagePlace.toLowerCase());
						for (const event of family.events) {
							if (event.place) places.add(event.place.toLowerCase());
						}
					}

					this.formData.previewCounts = {
						people: data.individuals.size,
						places: places.size,
						sources: data.sources.size,
						events: eventCount,
						media: 0 // GEDCOM doesn't include media count
					};
				} else {
					// Parsing failed, set zero counts
					this.formData.previewCounts = {
						people: 0,
						places: 0,
						sources: 0,
						events: 0,
						media: 0
					};
				}
			} else if (this.formData.format === 'gramps') {
				// Read file as ArrayBuffer for .gpkg extraction
				const arrayBuffer = await this.formData.file.arrayBuffer();
				const fileName = this.formData.fileName.toLowerCase();

				let grampsXml: string;
				let mediaCount = 0;

				if (fileName.endsWith('.gpkg')) {
					// Extract XML from .gpkg package (ZIP or gzip-compressed tar)
					const extraction = await extractGpkg(arrayBuffer, this.formData.fileName);
					grampsXml = extraction.grampsXml;
					mediaCount = extraction.mediaFiles.size;

					// Store extraction result for use during import
					this.formData.gpkgExtractionResult = extraction;
				} else {
					// Plain .gramps XML file - may be gzip-compressed
					grampsXml = await readFileWithDecompression(this.formData.file);
				}

				// Store the extracted/read XML content
				this.formData.fileContent = grampsXml;

				// Validate and get counts
				const validation = GrampsParser.validate(grampsXml);

				this.formData.previewCounts = {
					people: validation.stats.personCount,
					places: validation.stats.placeCount,
					sources: validation.stats.sourceCount,
					events: validation.stats.eventCount,
					media: mediaCount
				};

				// Convert validation errors and warnings
				this.formData.parseErrors = validation.errors.map(e => e.message);
				this.formData.parseWarnings = validation.warnings.map(w => w.message);
			}
		} catch (error) {
			this.formData.parseErrors = [`读取文件失败：${error instanceof Error ? error.message : '未知错误'}`];
		} finally {
			// Clear the parsing flag before re-rendering
			this.isParsing = false;
			// Re-render to show results
			this.renderCurrentStep();
		}
	}

	/**
	 * Step 5: Import Progress
	 */
	private renderStep5Import(container: HTMLElement): void {
		const section = container.createDiv({ cls: 'crc-import-section' });
		section.createEl('h3', { text: '正在导入……', cls: 'crc-import-section-title' });

		// Progress bar
		const progressBar = section.createDiv({ cls: 'crc-import-progress-bar' });
		const progressFill = progressBar.createDiv({ cls: 'crc-import-progress-fill' });
		progressFill.setCssProps({ width: '0%' });

		// Status text
		const statusEl = section.createDiv({ cls: 'crc-import-progress-status' });
		statusEl.textContent = '正在开始导入……';

		// Log area
		const logArea = section.createDiv({ cls: 'crc-import-log' });

		// Start import if not already running
		if (!this.isImporting) {
			void this.runImport(progressFill, statusEl, logArea);
		}
	}

	/**
	 * Run the actual import
	 */
	private async runImport(
		progressFill: HTMLElement,
		statusEl: HTMLElement,
		logArea: HTMLElement
	): Promise<void> {
		if (this.isImporting) return;
		this.isImporting = true;

		const addLogEntry = (message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info') => {
			const entry = logArea.createDiv({ cls: `crc-import-log-entry crc-import-log-entry--${type}` });
			entry.textContent = message;
			logArea.scrollTop = logArea.scrollHeight;
			this.formData.importLog.push(message);
		};

		try {
			if (this.formData.format === 'gedcom') {
				addLogEntry('正在开始 GEDCOM 导入……');

				if (!this.formData.fileContent) {
					throw new Error('No file content available');
				}

				// Always suspend bidirectional sync during GEDCOM import to prevent
				// the file watcher from adding duplicate relationships. During Phase 1,
				// wikilinks for duplicate names (e.g., "William Hurst") initially resolve
				// to the first created file. The bidirectional linker would then add children
				// to the wrong parent before Phase 2 corrects the wikilinks.
				if (this.formData.largeImportMode) {
					addLogEntry('已启用大型导入模式 - 暂停关系同步');
					new Notice('大型导入模式：关系同步已暂停');
				}
				this.plugin.disableBidirectionalSync();
				this.plugin.bidirectionalLinker?.suspend();

				try {
					// Build import options
					const settings = this.plugin.settings;
					const options: GedcomImportOptionsV2 = {
						peopleFolder: this.formData.targetFolder || settings.peopleFolder,
						eventsFolder: settings.eventsFolder,
						sourcesFolder: settings.sourcesFolder,
						placesFolder: settings.placesFolder,
						overwriteExisting: this.formData.conflictHandling === 'overwrite',
						fileName: this.formData.fileName,
						createPeopleNotes: this.formData.importPeople,
						createEventNotes: this.formData.importEvents,
						createSourceNotes: this.formData.importSources,
						createPlaceNotes: this.formData.importPlaces,
						importNotes: this.formData.importNotes,
						createSeparateNoteFiles: this.formData.createSeparateNoteFiles,
						notesFolder: settings.notesFolder,
						importMedia: this.formData.importMedia,
						mediaPathPrefix: this.formData.mediaPathPrefix || undefined,
						includeDynamicBlocks: this.formData.includeDynamicBlocks,
						dynamicBlockTypes: ['media', 'timeline', 'relationships'],
						compatibilityMode: settings.gedcomCompatibilityMode,
						dateInterpretation: this.getDateInterpretation(),
						onProgress: (progress) => {
							// Update UI based on progress
							const percent = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;
							progressFill.setCssProps({ width: `${percent}%` });
							statusEl.textContent = progress.message || `${progress.phase}: ${progress.current}/${progress.total}`;

							if (progress.message) {
								addLogEntry(progress.message);
							}
						}
					};

					// Run import
					const result = await this.importer.importFile(
						this.formData.fileContent,
						options,
						this.formData.parsedData || undefined
					);

					this.formData.importResult = result;
					this.formData.importedCount = result.individualsImported;

					// Calculate total notes created
					const totalCreated = result.individualsImported + result.eventsCreated + result.sourcesCreated + result.placesCreated;

					if (result.success) {
						progressFill.setCssProps({ width: '100%' });
						addLogEntry(`导入完成！已导入 ${result.individualsImported} 位人物。`, 'success');

						if (result.eventsCreated > 0) {
							addLogEntry(`已创建 ${result.eventsCreated} 个事件笔记。`, 'success');
						}
						if (result.sourcesCreated > 0) {
							addLogEntry(`已创建 ${result.sourcesCreated} 个来源笔记。`, 'success');
						}
						if (result.placesCreated > 0) {
							addLogEntry(`已创建 ${result.placesCreated} 个地点笔记。`, 'success');
						}
						if (result.separateNoteFilesCreated && result.separateNoteFilesCreated > 0) {
							addLogEntry(`已创建 ${result.separateNoteFilesCreated} 个单独的笔记文件。`, 'success');
						}

						// Show any warnings (cap the log, but never hide the count -
						// a silent cap would defeat the point of surfacing dropped
						// or ambiguous dates, #716).
						const WARNING_LOG_CAP = 15;
						for (const warning of result.warnings.slice(0, WARNING_LOG_CAP)) {
							addLogEntry(warning, 'warning');
						}
						if (result.warnings.length > WARNING_LOG_CAP) {
							addLogEntry(
								`……以及另外 ${result.warnings.length - WARNING_LOG_CAP} 个警告（共 ${result.warnings.length} 个）。`,
								'warning'
							);
						}

						// Auto-advance to numbering step after a short delay
						window.setTimeout(() => {
							this.currentStep = 5; // Numbering step
							this.isImporting = false;
							this.renderCurrentStep();
						}, 1500);
					} else {
						addLogEntry('导入失败！', 'error');
						for (const error of result.errors) {
							addLogEntry(error, 'error');
						}
						this.isImporting = false;
					}

					// Auto-create bases for imported note types (even if some errors occurred)
					if (totalCreated > 0) {
						void this.plugin.createAllBases({ silent: true });
					}
				} finally {
					// Re-enable relationship sync after import completes
					this.plugin.enableBidirectionalSync();
					this.plugin.bidirectionalLinker?.resume();
					if (this.formData.largeImportMode) {
						addLogEntry('大型导入模式已完成 - 关系同步已恢复');
						new Notice('导入完成：关系同步已恢复');
					}
				}
			} else if (this.formData.format === 'gramps') {
				addLogEntry('正在开始 Gramps 导入……');

				if (!this.formData.fileContent) {
					throw new Error('No file content available');
				}

				// Gramps always suspends bidirectional sync during import to prevent duplicate relationships.
				// The file watcher would otherwise trigger syncRelationships before Phase 2 replaces Gramps handles with cr_ids.
				// Show notice if user explicitly enabled Large Import Mode.
				if (this.formData.largeImportMode) {
					addLogEntry('已启用大型导入模式 - 暂停关系同步');
					new Notice('大型导入模式：关系同步已暂停');
				}
				this.plugin.disableBidirectionalSync();
				this.plugin.bidirectionalLinker?.suspend();

				try {
					// Build import options
					const settings = this.plugin.settings;
					const options: GrampsImportOptions = {
						peopleFolder: this.formData.targetFolder || settings.peopleFolder,
						overwriteExisting: this.formData.conflictHandling === 'overwrite',
						fileName: this.formData.fileName,
						createSourceNotes: this.formData.importSources,
						sourcesFolder: settings.sourcesFolder,
						createPlaceNotes: this.formData.importPlaces,
						placesFolder: settings.placesFolder,
						createEventNotes: this.formData.importEvents,
						eventsFolder: settings.eventsFolder,
						propertyAliases: settings.propertyAliases,
						includeDynamicBlocks: this.formData.includeDynamicBlocks,
						dynamicBlockTypes: ['media', 'timeline', 'relationships'],
						// Pass media files from .gpkg extraction if available
						mediaFiles: this.formData.gpkgExtractionResult?.mediaFiles,
						mediaFolder: this.formData.mediaFolder,
						preserveMediaFolderStructure: this.formData.preserveMediaFolderStructure,
						extractMedia: this.formData.importMedia && this.formData.gpkgExtractionResult !== null,
						importNotes: this.formData.importNotes,
						createSeparateNoteFiles: this.formData.createSeparateNoteFiles,
						notesFolder: settings.notesFolder,
						onProgress: (progress) => {
							// Update UI based on progress
							const percent = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;
							progressFill.setCssProps({ width: `${percent}%` });
							statusEl.textContent = progress.message || `${progress.phase}: ${progress.current}/${progress.total}`;

							if (progress.message) {
								addLogEntry(progress.message);
							}
						}
					};

					// Run import
					const grampsImporter = new GrampsImporter(this.app);
					const result = await grampsImporter.importFile(
						this.formData.fileContent,
						options
					);

					this.formData.importResult = result;
					this.formData.importedCount = result.individualsImported;

					// Calculate total notes created
					const grampsTotal = result.individualsImported +
						(result.placeNotesCreated || 0) +
						(result.sourceNotesCreated || 0) +
						(result.eventNotesCreated || 0);

					if (result.success) {
						progressFill.setCssProps({ width: '100%' });
						addLogEntry(`导入完成！已导入 ${result.individualsImported} 位人物。`, 'success');

						if (result.mediaFilesExtracted && result.mediaFilesExtracted > 0) {
							addLogEntry(`已提取 ${result.mediaFilesExtracted} 个媒体文件。`, 'success');
						}
						if (result.placeNotesCreated && result.placeNotesCreated > 0) {
							addLogEntry(`已创建 ${result.placeNotesCreated} 个地点笔记。`, 'success');
						}
						if (result.sourceNotesCreated && result.sourceNotesCreated > 0) {
							addLogEntry(`已创建 ${result.sourceNotesCreated} 个来源笔记。`, 'success');
						}
						if (result.eventNotesCreated && result.eventNotesCreated > 0) {
							addLogEntry(`已创建 ${result.eventNotesCreated} 个事件笔记。`, 'success');
						}
						if (result.duplicateEventsSkipped && result.duplicateEventsSkipped > 0) {
							addLogEntry(`跳过了源文件中 ${result.duplicateEventsSkipped} 个重复事件。`, 'warning');
						}

						// Show any errors as warnings
						for (const error of result.errors.slice(0, 5)) {
							addLogEntry(error, 'warning');
						}

						// Auto-advance to numbering step after a short delay
						window.setTimeout(() => {
							this.currentStep = 5; // Numbering step
							this.isImporting = false;
							this.renderCurrentStep();
						}, 1500);
					} else {
						addLogEntry('导入失败！', 'error');
						for (const error of result.errors) {
							addLogEntry(error, 'error');
						}
						this.isImporting = false;
					}

					// Auto-create bases for imported note types (even if some errors occurred)
					if (grampsTotal > 0) {
						void this.plugin.createAllBases({ silent: true });
					}
				} finally {
					// Re-enable bidirectional sync after import completes (success or failure)
					this.plugin.enableBidirectionalSync();
					this.plugin.bidirectionalLinker?.resume();
					// Show completion notice if Large Import Mode was enabled
					if (this.formData.largeImportMode) {
						addLogEntry('大型导入模式已完成 - 关系同步已恢复');
						new Notice('导入完成：关系同步已恢复');
					}
				}
			} else {
				// Other formats not yet implemented
				addLogEntry(`导入格式「${this.formData.format}」尚不支持。`, 'warning');
				this.isImporting = false;
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : '未知错误';
			addLogEntry(`导入失败：${message}`, 'error');
			this.isImporting = false;
		}
	}

	/**
	 * Step 6: Reference Numbering
	 */
	private renderStep6Numbering(container: HTMLElement): void {
		const section = container.createDiv({ cls: 'crc-import-section' });

		// Success message
		const successEl = section.createDiv({ cls: 'crc-import-success' });
		const successIcon = successEl.createDiv({ cls: 'crc-import-success-icon' });
		setIcon(successIcon, 'check-circle');
		successEl.createDiv({ cls: 'crc-import-success-text', text: '导入成功！' });
		successEl.createDiv({ cls: 'crc-import-success-count', text: `已导入 ${this.formData.importedCount} 位人物` });

		section.createEl('h3', { text: '是否分配参考编号？', cls: 'crc-import-section-title crc-mt-3' });

		const helpText = section.createDiv({ cls: 'crc-import-help-text' });
		helpText.textContent = '参考编号有助于在树中组织和引用个人。你也可以稍后从上下文菜单执行此操作。';

		// Numbering system options
		section.createEl('h4', { text: '编号系统', cls: 'crc-import-options-title crc-mt-3' });

		const numberingOptions = section.createDiv({ cls: 'crc-import-numbering-options' });

		const systems: Array<{ id: NumberingSystem; label: string; description: string }> = [
			{ id: 'ahnentafel', label: 'Ahnentafel', description: '祖先编号：自己=1，父亲=2，母亲=3，祖父=4，等等。' },
			{ id: 'daboville', label: "d'Aboville", description: '带点号的后代编号：1、1.1、1.2、1.1.1，等等。' },
			{ id: 'henry', label: 'Henry', description: '紧凑的后代编号：1、11、12、111，等等。' },
			{ id: 'generation', label: '世代', description: '相对世代深度：0=自己，-1=父母，+1=子女' }
		];

		for (const system of systems) {
			const optionEl = numberingOptions.createDiv({ cls: 'crc-import-numbering-option' });
			if (this.formData.numberingSystem === system.id) {
				optionEl.addClass('crc-import-numbering-option--selected');
			}

			optionEl.createDiv({ cls: 'crc-import-radio' });
			const radioContent = optionEl.createDiv({ cls: 'crc-import-radio-content' });
			radioContent.createDiv({ cls: 'crc-import-radio-label', text: system.label });
			radioContent.createDiv({ cls: 'crc-import-radio-description', text: system.description });

			optionEl.addEventListener('click', () => {
				this.formData.numberingSystem = system.id;
				this.renderCurrentStep();
			});
		}

		// Root person picker (if a numbering system is selected)
		if (this.formData.numberingSystem !== 'none') {
			section.createEl('h4', { text: '根人物', cls: 'crc-import-options-title crc-mt-3' });

			const rootPersonNote = section.createDiv({ cls: 'crc-import-help-text' });
			rootPersonNote.textContent = '编号将相对于此人物进行分配。';

			// Person picker button
			const pickerContainer = section.createDiv({ cls: 'crc-import-person-picker' });

			if (this.formData.rootPersonName) {
				// Show selected person
				const selectedPerson = pickerContainer.createDiv({ cls: 'crc-import-selected-person' });
				const personIcon = selectedPerson.createDiv({ cls: 'crc-import-selected-person-icon' });
				setIcon(personIcon, 'user');
				selectedPerson.createDiv({ cls: 'crc-import-selected-person-name', text: this.formData.rootPersonName });

				const changeBtn = selectedPerson.createEl('button', {
					cls: 'crc-btn crc-btn--small crc-btn--secondary',
					text: '更改'
				});
				changeBtn.addEventListener('click', () => this.openPersonPicker());
			} else {
				// Show picker button
				const pickerBtn = pickerContainer.createEl('button', {
					cls: 'crc-btn crc-btn--secondary'
				});
				const btnIcon = pickerBtn.createSpan({ cls: 'crc-btn-icon' });
				setIcon(btnIcon, 'user-plus');
				pickerBtn.createSpan({ text: '选择根人物' });

				pickerBtn.addEventListener('click', () => this.openPersonPicker());
			}
		}
	}

	/**
	 * Open the person picker modal
	 */
	private openPersonPicker(): void {
		const picker = new PersonPickerModal(
			this.app,
			(person: PersonInfo) => {
				this.formData.rootPersonCrId = person.crId;
				this.formData.rootPersonName = person.name;
				this.renderCurrentStep();
			},
			{
				title: '选择根人物',
				subtitle: '选择用作编号起点的人物'
			}
		);
		picker.open();
	}

	/**
	 * Assign reference numbers using the selected system
	 */
	private async assignReferenceNumbers(): Promise<void> {
		if (!this.formData.rootPersonCrId || this.formData.numberingSystem === 'none') {
			return;
		}

		this.formData.isAssigningNumbers = true;
		this.renderCurrentStep();

		try {
			const numberingService = new ReferenceNumberingService(this.app);
			let stats: NumberingStats;

			// Map our NumberingSystem to RefNumberingSystem (they're the same values except 'none')
			const system = this.formData.numberingSystem as RefNumberingSystem;

			switch (system) {
				case 'ahnentafel':
					stats = await numberingService.assignAhnentafel(this.formData.rootPersonCrId);
					break;
				case 'daboville':
					stats = await numberingService.assignDAboville(this.formData.rootPersonCrId);
					break;
				case 'henry':
					stats = await numberingService.assignHenry(this.formData.rootPersonCrId);
					break;
				case 'generation':
					stats = await numberingService.assignGeneration(this.formData.rootPersonCrId);
					break;
				default:
					throw new Error(`Unknown numbering system: ${String(system)}`);
			}

			this.formData.numberingStats = stats;
			new Notice(`已分配 ${stats.totalAssigned} 个${this.getNumberingSystemName()}编号`);

			// Advance to complete step
			this.formData.isAssigningNumbers = false;
			this.currentStep = 6;
			this.renderCurrentStep();
		} catch (error) {
			const message = error instanceof Error ? error.message : '未知错误';
			new Notice(`分配编号失败：${message}`);
			this.formData.isAssigningNumbers = false;
			this.renderCurrentStep();
		}
	}

	/**
	 * Step 7: Complete
	 */
	private renderStep7Complete(container: HTMLElement): void {
		const section = container.createDiv({ cls: 'crc-import-section' });

		// Completion message
		const completeEl = section.createDiv({ cls: 'crc-import-complete' });
		const completeIcon = completeEl.createDiv({ cls: 'crc-import-complete-icon' });
		setIcon(completeIcon, 'check-circle');
		completeEl.createDiv({ cls: 'crc-import-complete-title', text: '导入完成！' });
		completeEl.createDiv({ cls: 'crc-import-complete-message', text: '你的数据已成功导入。' });

		// Summary stats - use actual imported counts from result, not file preview counts
		const stats = section.createDiv({ cls: 'crc-import-complete-stats' });

		// Get actual counts from import result, falling back to 0 if entity type wasn't imported
		const result = this.formData.importResult;
		const actualPeople = this.formData.importPeople ? (result?.individualsImported ?? 0) : 0;
		const actualPlaces = this.formData.importPlaces ? (this.getImportedPlaceCount() ?? 0) : 0;
		const actualSources = this.formData.importSources ? (this.getImportedSourceCount() ?? 0) : 0;
		const actualEvents = this.formData.importEvents ? (this.getImportedEventCount() ?? 0) : 0;

		const statItems = [
			{ label: '人物', value: actualPeople, color: 'blue', enabled: this.formData.importPeople },
			{ label: '地点', value: actualPlaces, color: 'green', enabled: this.formData.importPlaces },
			{ label: '来源', value: actualSources, color: 'purple', enabled: this.formData.importSources },
			{ label: '事件', value: actualEvents, color: 'orange', enabled: this.formData.importEvents }
		];

		for (const stat of statItems) {
			// Only show stats for entity types that were selected for import
			if (stat.enabled && stat.value > 0) {
				const statEl = stats.createDiv({ cls: 'crc-import-complete-stat' });
				statEl.createDiv({ cls: `crc-import-complete-stat-value crc-import-complete-stat-value--${stat.color}`, text: String(stat.value) });
				statEl.createDiv({ cls: 'crc-import-complete-stat-label', text: stat.label });
			}
		}

		// Preprocessing info (MyHeritage compatibility fixes) - only for GEDCOM imports
		const gedcomResult = result as GedcomImportResultV2 | undefined;
		if (gedcomResult?.preprocessingApplied && gedcomResult.preprocessingFixes) {
			const preprocessingEl = section.createDiv({ cls: 'crc-import-preprocessing-info' });
			const preprocessingTitle = preprocessingEl.createDiv({ cls: 'crc-import-preprocessing-title' });
			const preprocessingIcon = preprocessingTitle.createSpan({ cls: 'crc-import-preprocessing-icon' });
			setIcon(preprocessingIcon, 'wrench');
			preprocessingTitle.createSpan({ text: '已应用兼容性修复' });

			const fixesList = preprocessingEl.createEl('ul', { cls: 'crc-import-preprocessing-fixes' });

			if (gedcomResult.preprocessingFixes.bomRemoved) {
				fixesList.createEl('li', { text: '已移除 UTF-8 字节顺序标记（BOM）' });
			}

			if (gedcomResult.preprocessingFixes.concFieldsNormalized > 0) {
				fixesList.createEl('li', {
					text: `修复了 ${gedcomResult.preprocessingFixes.concFieldsNormalized} 个存在 HTML 编码问题的字段`
				});
			}

			const preprocessingNote = preprocessingEl.createDiv({ cls: 'crc-import-preprocessing-note' });
			preprocessingNote.createSpan({ text: 'MyHeritage GEDCOM 问题已自动修正。你的原始文件未被修改。' });
		}

		// Skipped/duplicates info
		if (this.formData.skippedCount > 0) {
			const skippedEl = section.createDiv({ cls: 'crc-import-complete-skipped' });
			skippedEl.textContent = `已跳过 ${this.formData.skippedCount} 个重复项。`;
		}

		// Numbering result
		if (this.formData.numberingStats) {
			const numberingEl = section.createDiv({ cls: 'crc-import-complete-numbering' });
			const checkIcon = numberingEl.createSpan({ cls: 'crc-import-complete-numbering-icon' });
			setIcon(checkIcon, 'check');
			numberingEl.createSpan({
				text: `已为来自 ${this.formData.rootPersonName} 的 ${this.formData.numberingStats.totalAssigned} 位人物分配${this.getNumberingSystemName()}编号`
			});
		}

		// Cleanup Wizard prompt
		const cleanupSection = section.createDiv({ cls: 'crc-import-cleanup-prompt crc-mt-3' });
		const cleanupNote = cleanupSection.createDiv({ cls: 'crc-import-cleanup-note' });
		const infoIcon = cleanupNote.createSpan({ cls: 'crc-import-cleanup-note-icon' });
		setIcon(infoIcon, 'info');
		cleanupNote.createSpan({
			text: '运行清理向导以修复数据质量问题，例如日期格式、缺失关系和地点标准化。'
		});

		const cleanupBtn = cleanupSection.createEl('button', {
			cls: 'crc-btn crc-btn--secondary crc-mt-2'
		});
		const cleanupBtnIcon = cleanupBtn.createSpan({ cls: 'crc-btn-icon' });
		setIcon(cleanupBtnIcon, 'sparkles');
		cleanupBtn.createSpan({ text: '运行清理向导' });
		cleanupBtn.addEventListener('click', () => {
			this.close();
			void import('./cleanup-wizard-modal').then(({ CleanupWizardModal }) => {
				new CleanupWizardModal(this.app, this.plugin).open();
			});
		});

		// Staging Manager prompt (show when imported to staging folder)
		if (this.isImportedToStaging()) {
			const stagingSection = section.createDiv({ cls: 'crc-import-staging-prompt crc-mt-3' });
			const stagingNote = stagingSection.createDiv({ cls: 'crc-import-staging-note' });
			const stagingInfoIcon = stagingNote.createSpan({ cls: 'crc-import-staging-note-icon' });
			setIcon(stagingInfoIcon, 'archive');
			stagingNote.createSpan({
				text: '数据已导入到暂存区。准备就绪后请审核并提升到主树。'
			});

			const stagingBtn = stagingSection.createEl('button', {
				cls: 'crc-btn crc-btn--secondary crc-mt-2'
			});
			const stagingBtnIcon = stagingBtn.createSpan({ cls: 'crc-btn-icon' });
			setIcon(stagingBtnIcon, 'archive');
			stagingBtn.createSpan({ text: '管理暂存区' });
			stagingBtn.addEventListener('click', () => {
				this.close();
				void import('./staging-management-modal').then(({ StagingManagementModal }) => {
					new StagingManagementModal(this.app, this.plugin).open();
				});
			});
		}

		// Check for privacy notice (after first import with living persons)
		void this.checkPrivacyNotice();
	}

	/**
	 * Check if we should show the privacy notice after import.
	 * Shows notice when:
	 * - Privacy protection is not enabled
	 * - User hasn't dismissed the notice
	 * - People were imported (potential living persons)
	 */
	private async checkPrivacyNotice(): Promise<void> {
		// Don't show if already shown this session
		if (this.formData.privacyNoticeShown) {
			return;
		}

		// Don't show if user has permanently dismissed
		if (this.plugin.settings.privacyNoticeDismissed) {
			return;
		}

		// Don't show if privacy protection is already enabled
		if (this.plugin.settings.enablePrivacyProtection) {
			return;
		}

		// Don't show if no people were imported
		const result = this.formData.importResult;
		if (!result || result.individualsImported === 0) {
			return;
		}

		// Count potential living persons using the threshold logic
		const livingCount = this.countPotentialLivingPersons();
		if (livingCount === 0) {
			return;
		}

		// Mark as shown for this session
		this.formData.privacyNoticeShown = true;

		// Show the privacy notice modal
		const modal = new PrivacyNoticeModal(this.app, livingCount);
		const decision = await modal.waitForDecision();

		if (decision === 'configure') {
			// Open plugin settings (privacy section)
			// @ts-expect-error - Obsidian internal API for opening plugin settings
			this.app.setting?.open();
			// @ts-expect-error - Navigate to plugin tab
			this.app.setting?.openTabById?.(this.plugin.manifest.id);
		} else if (decision === 'dismiss') {
			// Remember not to show again
			this.plugin.settings.privacyNoticeDismissed = true;
			await this.plugin.saveSettings();
		}
		// 'later' - do nothing, notice will show again next import
	}

	/**
	 * Count people who might be living based on birth/death data.
	 * Uses same logic as privacy service but without requiring privacy to be enabled.
	 */
	private countPotentialLivingPersons(): number {
		const currentYear = new Date().getFullYear();
		const threshold = this.plugin.settings.livingPersonAgeThreshold;
		let count = 0;

		// Get all people from cache
		const files = this.app.vault.getMarkdownFiles();
		const peopleFolder = this.plugin.settings.peopleFolder;

		for (const file of files) {
			// Only check files in people folder
			if (!file.path.startsWith(peopleFolder)) {
				continue;
			}

			const cache = this.app.metadataCache.getFileCache(file);
			const fm = cache?.frontmatter;
			if (!fm) continue;

			// Check if person has entity type marker
			if (fm.cr_type !== 'person' && !fm.cr_id) continue;

			// Has death date = not living
			if (fm.death_date || fm.deathDate) continue;

			// Check birth date
			const birthDate = fm.birth_date || fm.birthDate;
			if (birthDate) {
				const birthYear = this.extractBirthYear(String(birthDate));
				if (birthYear && (currentYear - birthYear) < threshold) {
					count++;
				}
			}
		}

		return count;
	}

	/**
	 * Extract year from a date string
	 */
	private extractBirthYear(dateStr: string): number | null {
		const match = dateStr.match(/\b(1[89]\d{2}|20\d{2})\b/);
		return match ? parseInt(match[1], 10) : null;
	}

	/**
	 * Render footer with navigation buttons
	 */
	private renderFooter(container: HTMLElement): void {
		const footer = container.createDiv({ cls: 'crc-import-footer' });

		// Left side: Cancel or Back
		const leftBtns = footer.createDiv({ cls: 'crc-import-footer-left' });

		if (this.currentStep === 0) {
			// Step 0: Show Cancel button
			new ButtonComponent(leftBtns)
				.setButtonText('取消')
				.onClick(() => this.close());
		} else if (this.currentStep < 4) {
			// Steps 1-3: Show Back button
			new ButtonComponent(leftBtns)
				.setButtonText('上一步')
				.onClick(() => {
					this.currentStep--;
					this.renderCurrentStep();
				});
		} else if (this.currentStep === 5) {
			// Step 5 (Numbering): Show Skip button
			new ButtonComponent(leftBtns)
				.setButtonText('跳过')
				.onClick(() => {
					this.formData.numberingSystem = 'none';
					this.currentStep = 6;
					this.renderCurrentStep();
				});
		}

		// Right side: Next or action buttons
		const rightBtns = footer.createDiv({ cls: 'crc-import-footer-right' });

		if (this.currentStep < 3) {
			// Steps 0-2: Show Next button
			const nextBtn = new ButtonComponent(rightBtns)
				.setButtonText('下一步')
				.setCta()
				.onClick(() => {
					if (this.canProceedToNextStep()) {
						this.currentStep++;
						this.renderCurrentStep();
					}
				});

			// Disable if requirements not met
			if (!this.canProceedToNextStep()) {
				nextBtn.setDisabled(true);
				nextBtn.buttonEl.addClass('crc-btn--disabled');
			}
		} else if (this.currentStep === 3) {
			// Step 3: Show Import button
			new ButtonComponent(rightBtns)
				.setButtonText('导入')
				.setCta()
				.onClick(() => {
					this.currentStep = 4;
					this.renderCurrentStep();
					// TODO: Start actual import
				});
		} else if (this.currentStep === 5) {
			// Step 5 (Numbering): Show Assign Numbers button
			const assignBtn = new ButtonComponent(rightBtns)
				.setButtonText(this.formData.isAssigningNumbers ? '正在分配……' : '分配编号')
				.setCta()
				.onClick(() => {
					void this.assignReferenceNumbers();
				});

			if (this.formData.numberingSystem === 'none' || !this.formData.rootPersonCrId || this.formData.isAssigningNumbers) {
				assignBtn.setDisabled(true);
				assignBtn.buttonEl.addClass('crc-btn--disabled');
			}
		} else if (this.currentStep === 6) {
			// Step 6 (Complete): Show Done and Import Another buttons
			new ButtonComponent(rightBtns)
				.setButtonText('再导入一个')
				.onClick(() => {
					this.formData = this.getDefaultFormData();
					this.currentStep = 0;
					this.renderCurrentStep();
				});

			new ButtonComponent(rightBtns)
				.setButtonText('完成')
				.setCta()
				.onClick(() => this.close());
		}
	}

	/**
	 * Check if we can proceed to the next step
	 */
	private canProceedToNextStep(): boolean {
		switch (this.currentStep) {
			case 0:
				// Step 1: Format - always can proceed
				return true;
			case 1:
				// Step 2: File - need file selected
				return this.formData.file !== null;
			case 2:
				// Step 3: Options - always can proceed
				return true;
			default:
				return true;
		}
	}

	/**
	 * Render a toggle option
	 */
	private renderToggleOption(
		container: HTMLElement,
		label: string,
		description: string,
		value: boolean,
		onChange: (value: boolean) => void
	): void {
		const row = container.createDiv({ cls: 'crc-import-toggle-row' });

		const labelEl = row.createDiv({ cls: 'crc-import-toggle-label' });
		labelEl.createSpan({ text: label });
		labelEl.createEl('small', { text: description });

		const toggle = row.createDiv({ cls: 'crc-import-toggle' });
		if (value) {
			toggle.addClass('crc-import-toggle--on');
		}

		toggle.addEventListener('click', () => {
			// Check current state from the DOM class, not the captured initial value
			const isCurrentlyOn = toggle.hasClass('crc-import-toggle--on');
			toggle.toggleClass('crc-import-toggle--on', !isCurrentlyOn);
			onChange(!isCurrentlyOn);
		});
	}

	/** Build the date interpretation from the current preview choices (#718). */
	private getDateInterpretation(): GedcomDateInterpretation {
		return {
			slashOrder: this.formData.dateSlashOrder,
			eventLabel: this.formData.dateEventLabel
		};
	}

	/**
	 * Render per-category date interpretation controls (#718) in the preview.
	 * Only categories with affected dates appear, each with a count so the user
	 * sees the scale of what the choice affects. Changing a choice re-renders the
	 * preview so the warning list reflects the new behavior; counts are stable.
	 */
	private renderDateInterpretationControls(section: HTMLElement): void {
		const summary = this.formData.dateSummary;
		if (!summary) return;
		if (summary.ambiguousSlashCount === 0 && summary.eventLabelCount === 0 && summary.unparsedCount === 0) {
			return;
		}

		const box = section.createDiv({ cls: 'crc-import-date-interpretation' });
		box.createEl('div', { cls: 'crc-import-options-title crc-mt-3', text: '日期解读' });
		box.createEl('small', {
			cls: 'crc-text-muted',
			text: '有些日期可以有多种解读方式。请选择如何处理；默认值符合非美国文件。'
		});

		// Ambiguous slash dates: read as day/month (default) or month/day.
		if (summary.ambiguousSlashCount > 0) {
			const row = box.createDiv({ cls: 'crc-import-toggle-row' });
			const labelEl = row.createDiv({ cls: 'crc-import-toggle-label' });
			labelEl.createSpan({
				text: `${summary.ambiguousSlashCount} 个有歧义的斜杠日期`
			});
			labelEl.createEl('small', { text: '例如 05/06/1990 — 哪部分是日？' });
			const select = row.createEl('select', { cls: 'dropdown' });
			select.createEl('option', { value: 'day-month', text: '日/月（DD/MM）' });
			select.createEl('option', { value: 'month-day', text: '月/日（MM/DD）' });
			select.value = this.formData.dateSlashOrder;
			select.addEventListener('change', () => {
				this.formData.dateSlashOrder = select.value === 'month-day' ? 'month-day' : 'day-month';
				this.renderCurrentStep();
			});
		}

		// Event-label dates: import the recovered date (default) or skip it.
		if (summary.eventLabelCount > 0) {
			const breakdown = Object.entries(summary.eventLabelByFamily)
				.map(([family, count]) => `${count} ${family}`)
				.join(', ');
			const row = box.createDiv({ cls: 'crc-import-toggle-row' });
			const labelEl = row.createDiv({ cls: 'crc-import-toggle-label' });
			labelEl.createSpan({
				text: `${summary.eventLabelCount} 个事件标签日期`
			});
			labelEl.createEl('small', {
				text: breakdown
					? `${breakdown} — 带有「Bapt」或「Buried」等标签的日期`
					: '带有「Bapt」或「Buried」等标签的日期'
			});
			const select = row.createEl('select', { cls: 'dropdown' });
			select.createEl('option', { value: 'import', text: '导入该日期' });
			select.createEl('option', { value: 'skip', text: '跳过（留空）' });
			select.value = this.formData.dateEventLabel;
			select.addEventListener('change', () => {
				this.formData.dateEventLabel = select.value === 'skip' ? 'skip' : 'import';
				this.renderCurrentStep();
			});
		}

		// Unparsed dates: informational only — there's no interpretation to pick.
		if (summary.unparsedCount > 0) {
			box.createEl('small', {
				cls: 'crc-text-muted',
				text: `${summary.unparsedCount} 个日期无法解析，将留空。`
			});
		}
	}

	/**
	 * Format file size for display
	 */
	private formatFileSize(bytes: number): string {
		if (bytes < 1024) return `${bytes} 字节`;
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	}

	/**
	 * Get numbering system display name
	 */
	private getNumberingSystemName(): string {
		switch (this.formData.numberingSystem) {
			case 'ahnentafel': return 'Ahnentafel';
			case 'daboville': return "d'Aboville";
			case 'henry': return 'Henry';
			case 'generation': return '世代';
			default: return '';
		}
	}

	/**
	 * Check if the import was to the staging folder
	 */
	private isImportedToStaging(): boolean {
		const stagingFolder = this.plugin.settings.stagingFolder;
		if (!stagingFolder || !this.plugin.settings.enableStagingIsolation) {
			return false;
		}

		const targetFolder = this.formData.targetFolder.toLowerCase().replace(/^\/|\/$/g, '');
		const normalizedStaging = stagingFolder.toLowerCase().replace(/^\/|\/$/g, '');

		// Check if target is the staging folder or a subfolder of it
		return targetFolder === normalizedStaging || targetFolder.startsWith(normalizedStaging + '/');
	}

	/**
	 * Get imported place count from result (handles both GEDCOM and Gramps result types)
	 */
	private getImportedPlaceCount(): number {
		const result = this.formData.importResult;
		if (!result) return 0;

		// GEDCOM result uses 'placesCreated', Gramps uses 'placeNotesCreated'
		if ('placesCreated' in result) {
			return result.placesCreated;
		}
		if ('placeNotesCreated' in result) {
			return result.placeNotesCreated ?? 0;
		}
		return 0;
	}

	/**
	 * Get imported source count from result (handles both GEDCOM and Gramps result types)
	 */
	private getImportedSourceCount(): number {
		const result = this.formData.importResult;
		if (!result) return 0;

		// GEDCOM result uses 'sourcesCreated', Gramps uses 'sourceNotesCreated'
		if ('sourcesCreated' in result) {
			return result.sourcesCreated;
		}
		if ('sourceNotesCreated' in result) {
			return result.sourceNotesCreated ?? 0;
		}
		return 0;
	}

	/**
	 * Get imported event count from result (handles both GEDCOM and Gramps result types)
	 */
	private getImportedEventCount(): number {
		const result = this.formData.importResult;
		if (!result) return 0;

		// GEDCOM result uses 'eventsCreated', Gramps uses 'eventNotesCreated'
		if ('eventsCreated' in result) {
			return result.eventsCreated;
		}
		if ('eventNotesCreated' in result) {
			return result.eventNotesCreated ?? 0;
		}
		return 0;
	}
}

/* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call -- Match scope of file-level disable at top. */
