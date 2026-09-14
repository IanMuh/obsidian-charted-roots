/* eslint-disable @typescript-eslint/no-unsafe-assignment -- Obsidian API returns any-typed surfaces (frontmatter, file caches, plugin state); project policy accepts these. */
/**
 * Report Wizard Modal
 *
 * A four-step wizard for generating genealogical reports.
 *
 * Step 1: Select — Report type and subject (person/place)
 * Step 2: Format — Output format selection (Vault, PDF, ODT, MD)
 * Step 3: Customize — Content options, format-specific settings
 * Step 4: Generate — Filename, estimate panel, and generate button
 *
 * Design inspired by FamilyChartExportWizard for consistency.
 */

import { Modal, Notice, setIcon, FuzzySuggestModal } from 'obsidian';
import type CanvasRootsPlugin from '../../../main';
import { createLucideIcon, setLucideIcon, LucideIconName } from '../../ui/lucide-icons';
import type { PersonInfo } from '../../ui/person-picker';
import { PlacePickerModal, SelectedPlaceInfo } from '../../ui/place-picker';
import { isPersonNote } from '../../utils/note-type-detection';
import { createUniverseService } from '../../universes/services/universe-service';

/**
 * Sort options for person list
 */
type PersonSortOption = 'name-asc' | 'name-desc' | 'birth-asc' | 'birth-desc';

/**
 * Filter options for person list
 */
interface PersonFilterOptions {
	sex: 'all' | 'male' | 'female' | 'unknown';
	hasConnections: boolean;
}
import { ReportGenerationService } from '../services/report-generation-service';
import { PdfReportRenderer } from '../services/pdf-report-renderer';
import { OdtGenerator } from '../services/odt-generator';
import {
	ReportType,
	ReportCategory,
	REPORT_METADATA,
	getReportsByCategory,
	ReportOptions,
	ReportResult,
	FamilyGroupSheetResult,
	IndividualSummaryResult,
	AhnentafelResult,
	GapsReportResult,
	RegisterReportResult,
	PedigreeChartResult,
	DescendantChartResult,
	SourceSummaryResult,
	TimelineReportResult,
	PlaceSummaryResult,
	MediaInventoryResult,
	UniverseOverviewResult,
	CollectionOverviewResult,
	ResearchReportExportResult,
	BrickWallReportResult,
	BrickWallSortOrder,
	UnconnectedPeopleResult,
	KinshipReportResult,
	KinshipSortOrder,
	TimelineExportFormat,
	TimelineLayoutStyle,
	TimelineColorScheme
} from '../types/report-types';
import { UnifiedTreeWizardModal } from '../../trees/ui/unified-tree-wizard-modal';

/**
 * Union of all specific report result types (for PDF/ODT rendering)
 */
type SpecificReportResult =
	| FamilyGroupSheetResult
	| IndividualSummaryResult
	| AhnentafelResult
	| GapsReportResult
	| RegisterReportResult
	| PedigreeChartResult
	| DescendantChartResult
	| SourceSummaryResult
	| TimelineReportResult
	| PlaceSummaryResult
	| MediaInventoryResult
	| UniverseOverviewResult
	| CollectionOverviewResult
	| ResearchReportExportResult
	| BrickWallReportResult
	| UnconnectedPeopleResult
	| KinshipReportResult;

/**
 * Output format types
 */
type OutputFormat = 'vault' | 'pdf' | 'odt' | 'md';

/**
 * Category display info with report count
 */
interface CategoryInfo {
	category: ReportCategory;
	name: string;
	icon: string;
	reportCount: number;
	/** Single report categories go directly to report selection */
	directReport?: ReportType;
}

/**
 * Category definitions for the wizard
 */
const WIZARD_CATEGORIES: CategoryInfo[] = [
	{
		category: 'genealogical',
		name: '谱系',
		icon: 'users',
		reportCount: 7
	},
	{
		category: 'research',
		name: '研究',
		icon: 'search',
		reportCount: 6
	},
	{
		category: 'timeline',
		name: '时间轴',
		icon: 'calendar',
		reportCount: 1,
		directReport: 'timeline-report'
	},
	{
		category: 'geographic',
		name: '地理',
		icon: 'map-pin',
		reportCount: 1,
		directReport: 'place-summary'
	},
	{
		category: 'summary',
		name: '摘要',
		icon: 'bar-chart-2',
		reportCount: 2
	},
	{
		category: 'visual-trees',
		name: '可视化树',
		icon: 'git-branch',
		reportCount: 4
	}
];

/**
 * Form data for wizard state
 */
/**
 * Options for opening the report wizard with pre-selected values
 */
export interface ReportWizardOptions {
	/** Pre-select a report type */
	reportType?: ReportType;
	/** Pre-select a person subject */
	personCrId?: string;
	personName?: string;
}

interface WizardFormData {
	// Step 1: Quick Generate
	selectedCategory: ReportCategory | null;
	reportType: ReportType | null;
	subject: {
		personCrId?: string;
		personName?: string;
		placeCrId?: string;
		placeName?: string;
		universeCrId?: string;
		universeName?: string;
		collectionId?: string;
		collectionName?: string;
		notePath?: string;
		noteName?: string;
	};
	outputFormat: OutputFormat;
	filename: string;

	// Step 2: Customize - Content Options
	includeSpouses: boolean;
	includeSources: boolean;
	includeDetails: boolean;
	includeChildren: boolean;
	maxGenerations: number;
	brickWallSortBy: BrickWallSortOrder;
	kinshipSortBy: KinshipSortOrder;
	kinshipMaxDegree: number;

	// Gaps report options
	gapsFieldsToCheck: {
		birthDate: boolean;
		deathDate: boolean;
		parents: boolean;
		sources: boolean;
	};
	gapsMaxItemsPerCategory: number;
	gapsResearchLevelMax: number | undefined;
	gapsIncludeUnassessed: boolean;
	gapsSortByResearchLevel: boolean;

	// Step 3: PDF Options
	pdfPageSize: 'A4' | 'LETTER';
	pdfDateFormat: 'mdy' | 'dmy' | 'ymd';
	pdfIncludeCoverPage: boolean;
	pdfCoverTitle: string;
	pdfCoverSubtitle: string;
	pdfCoverNotes: string;
	pdfTableKeepRowsTogether: boolean;
	pdfTableRepeatHeaders: boolean;

	// Step 3: ODT Options
	odtIncludeCoverPage: boolean;
	odtCoverTitle: string;
	odtCoverSubtitle: string;
	odtCoverNotes: string;

	// Step 2: Vault Options
	outputFolder: string;

	// Timeline-specific options
	timelineFormat: TimelineExportFormat;
	timelineGrouping: 'none' | 'by_year' | 'by_decade' | 'by_person' | 'by_place';
	timelineIncludeDescriptions: boolean;
	// Timeline: Canvas/Excalidraw options
	timelineLayoutStyle: TimelineLayoutStyle;
	timelineColorScheme: TimelineColorScheme;
	timelineIncludeOrderingEdges: boolean;
	// Timeline: Excalidraw-specific options
	excalidrawDrawingStyle: 'architect' | 'artist' | 'cartoonist';
	excalidrawFontFamily: string;
	excalidrawStrokeWidth: 'thin' | 'normal' | 'bold' | 'extra-bold';
	// Timeline: Callout options
	timelineCalloutType: string;
	// Timeline: Filters
	timelineDateFrom: string;
	timelineDateTo: string;
	timelineEventTypes: string[];
	timelinePersonFilter: string[];
	timelinePlaceFilter: string[];
	timelineIncludeChildPlaces: boolean;
	timelineGroupFilter: string;
}

/**
 * Report Wizard Modal
 */
export class ReportWizardModal extends Modal {
	private plugin: CanvasRootsPlugin;
	private reportService: ReportGenerationService;
	private pdfRenderer: PdfReportRenderer;
	private odtGenerator: OdtGenerator;

	// Current step (0 = Quick Generate, 1 = Customize)
	private currentStep: number = 0;

	// Form data
	private formData: WizardFormData;

	// UI containers
	private contentContainer?: HTMLElement;
	private progressContainer?: HTMLElement;
	private personListContainer?: HTMLElement;
	private personSectionContainer?: HTMLElement;

	// Person list state
	private allPeople: PersonInfo[] = [];
	private filteredPeople: PersonInfo[] = [];
	private searchQuery: string = '';
	private sortOption: PersonSortOption = 'name-asc';
	private filterOptions: PersonFilterOptions = { sex: 'all', hasConnections: false };
	private peopleLoaded: boolean = false;

	// Step definitions
	private readonly steps = [
		{ number: 1, title: '选择', description: '选择报告类型与对象' },
		{ number: 2, title: '格式', description: '选择输出格式' },
		{ number: 3, title: '自定义', description: '微调报告选项' },
		{ number: 4, title: '生成', description: '确认并生成' }
	];

	constructor(plugin: CanvasRootsPlugin, options?: ReportWizardOptions) {
		super(plugin.app);
		this.plugin = plugin;
		this.reportService = new ReportGenerationService(plugin.app, plugin.settings);
		this.pdfRenderer = new PdfReportRenderer();
		this.odtGenerator = new OdtGenerator();

		// Initialize form data with defaults
		this.formData = this.getDefaultFormData();

		// Apply any pre-selected options
		if (options?.reportType) {
			this.formData.reportType = options.reportType;
			// Set the category based on the report type
			const reportMeta = REPORT_METADATA[options.reportType];
			if (reportMeta) {
				this.formData.selectedCategory = reportMeta.category;
			}
			// Sync output format for timeline reports
			if (options.reportType === 'timeline-report') {
				this.syncOutputFormatFromTimeline();
			}
			this.updateFilename();
		}

		if (options?.personCrId) {
			this.formData.subject.personCrId = options.personCrId;
			this.formData.subject.personName = options.personName;
			this.updateFilename();
		}
	}

	/**
	 * Get default form data
	 */
	private getDefaultFormData(): WizardFormData {
		const date = new Date().toISOString().split('T')[0];

		return {
			selectedCategory: null,
			reportType: null,
			subject: {},
			outputFormat: 'pdf',
			filename: `report-${date}`,

			// Content options
			includeSpouses: true,
			includeSources: true,
			includeDetails: true,
			includeChildren: true,
			maxGenerations: 5,
			brickWallSortBy: 'generation' as BrickWallSortOrder,
			kinshipSortBy: 'degree' as KinshipSortOrder,
			kinshipMaxDegree: 20,

			// Gaps report options
			gapsFieldsToCheck: {
				birthDate: true,
				deathDate: true,
				parents: true,
				sources: true
			},
			gapsMaxItemsPerCategory: 50,
			gapsResearchLevelMax: undefined,
			gapsIncludeUnassessed: true,
			gapsSortByResearchLevel: false,

			// PDF options
			pdfPageSize: 'A4',
			pdfDateFormat: 'mdy',
			pdfIncludeCoverPage: false,
			pdfCoverTitle: '',
			pdfCoverSubtitle: '',
			pdfCoverNotes: '',
			pdfTableKeepRowsTogether: true,
			pdfTableRepeatHeaders: true,

			// ODT options
			odtIncludeCoverPage: false,
			odtCoverTitle: '',
			odtCoverSubtitle: '',
			odtCoverNotes: '',

			// Vault options
			outputFolder: this.plugin.settings.reportsFolder || '',

			// Timeline-specific options
			timelineFormat: 'markdown_table',
			timelineGrouping: 'by_year',
			timelineIncludeDescriptions: true,
			// Timeline: Canvas/Excalidraw options
			timelineLayoutStyle: 'horizontal',
			timelineColorScheme: 'event_type',
			timelineIncludeOrderingEdges: false,
			// Timeline: Excalidraw-specific options
			excalidrawDrawingStyle: 'artist',
			excalidrawFontFamily: 'Virgil',
			excalidrawStrokeWidth: 'normal',
			// Timeline: Callout options
			timelineCalloutType: 'cr-timeline',
			// Timeline: Filters
			timelineDateFrom: '',
			timelineDateTo: '',
			timelineEventTypes: [],
			timelinePersonFilter: [],
			timelinePlaceFilter: [],
			timelineIncludeChildPlaces: true,
			timelineGroupFilter: ''
		};
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('cr-report-wizard');

		// Modal header with icon and title
		const header = contentEl.createDiv({ cls: 'cr-report-wizard-header' });

		const titleRow = header.createDiv({ cls: 'cr-wizard-title' });
		titleRow.appendChild(createLucideIcon('file-text', 24));
		titleRow.createSpan({ text: '生成报告' });

		// Step progress indicator
		this.renderStepProgress(contentEl);

		// Content container
		this.contentContainer = contentEl.createDiv({ cls: 'cr-report-wizard-content' });

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
		this.progressContainer = container.createDiv({ cls: 'cr-wizard-progress' });
		this.updateStepProgress();
	}

	/**
	 * Update the step progress indicator
	 */
	private updateStepProgress(): void {
		if (!this.progressContainer) return;
		this.progressContainer.empty();

		const stepsRow = this.progressContainer.createDiv({ cls: 'cr-wizard-steps' });

		this.steps.forEach((step, index) => {
			// Step circle with number
			const stepEl = stepsRow.createDiv({ cls: 'cr-wizard-step' });

			// Mark active or completed
			if (index === this.currentStep) {
				stepEl.addClass('cr-wizard-step--active');
			} else if (index < this.currentStep) {
				stepEl.addClass('cr-wizard-step--completed');
			}

			// Step number circle
			const numberEl = stepEl.createDiv({ cls: 'cr-wizard-step-number' });
			if (index < this.currentStep) {
				// Show checkmark for completed steps
				setIcon(numberEl, 'check');
			} else {
				numberEl.textContent = String(step.number);
			}

			// Step info (title shown only for active step)
			const infoEl = stepEl.createDiv({ cls: 'cr-wizard-step-info' });
			infoEl.createDiv({ cls: 'cr-wizard-step-title', text: step.title });

			// Add connector between steps (except after last step)
			if (index < this.steps.length - 1) {
				const connector = stepsRow.createDiv({ cls: 'cr-wizard-connector' });
				if (index < this.currentStep) {
					connector.addClass('cr-wizard-connector--completed');
				}
			}
		});

		// Step counter and description below the circles
		const stepInfo = this.progressContainer.createDiv({ cls: 'cr-report-step-info' });
		const currentStepData = this.steps[this.currentStep];

		stepInfo.createDiv({
			cls: 'cr-report-step-counter',
			text: `第 ${this.currentStep + 1} 步，共 ${this.steps.length} 步`
		});

		stepInfo.createDiv({
			cls: 'cr-report-step-description',
			text: currentStepData.description
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
				this.renderStep1(this.contentContainer);
				break;
			case 1:
				this.renderStep2(this.contentContainer);
				break;
			case 2:
				this.renderStep3(this.contentContainer);
				break;
			case 3:
				this.renderStep4(this.contentContainer);
				break;
		}

		this.renderFooter(this.contentContainer);
	}

	// ========== STEP 1: SELECT (Report Type & Subject) ==========

	private renderStep1(container: HTMLElement): void {
		// Report Type section with dropdown
		const reportSection = container.createDiv({ cls: 'cr-report-section' });
		reportSection.createEl('h3', { text: '报告类型', cls: 'cr-report-section-title' });

		this.renderReportTypeDropdown(reportSection);

		// Subject section (shown when a report type is selected)
		if (this.formData.reportType) {
			container.createEl('hr', { cls: 'cr-report-separator' });
			this.renderSubjectSection(container);
		}
	}

	// ========== STEP 2: FORMAT ==========

	private renderStep2(container: HTMLElement): void {
		// Format section
		const formatSection = container.createDiv({ cls: 'cr-report-section' });
		formatSection.createEl('h3', { text: '输出格式', cls: 'cr-report-section-title' });

		// Timeline reports have special format selection
		if (this.isTimelineReport()) {
			this.renderTimelineFormatSection(formatSection);
		} else {
			this.renderFormatSection(formatSection);
		}
	}

	/**
	 * Render report type dropdown with optgroups by category
	 */
	private renderReportTypeDropdown(container: HTMLElement): void {
		const selectRow = container.createDiv({ cls: 'cr-report-dropdown-row' });

		const select = selectRow.createEl('select', { cls: 'cr-report-dropdown' });

		// Default option
		const defaultOption = select.createEl('option', {
			value: '',
			text: '选择报告类型…'
		});
		defaultOption.disabled = true;
		if (!this.formData.reportType) {
			defaultOption.selected = true;
		}

		// Group reports by category
		for (const categoryInfo of WIZARD_CATEGORIES) {
			const reports = getReportsByCategory(categoryInfo.category);
			if (reports.length === 0) continue;

			const optgroup = select.createEl('optgroup');
			optgroup.label = categoryInfo.name;

			for (const report of reports) {
				const option = optgroup.createEl('option', {
					value: report.type,
					text: report.name
				});
				if (this.formData.reportType === report.type) {
					option.selected = true;
				}
			}
		}

		select.addEventListener('change', () => {
			const selectedType = select.value as ReportType;
			if (selectedType) {
				this.formData.reportType = selectedType;
				// Find and set the category
				const reportMeta = REPORT_METADATA[selectedType];
				this.formData.selectedCategory = reportMeta.category;
				// Reset subject when changing report type
				this.formData.subject = {};
				// Sync output format for timeline reports
				if (selectedType === 'timeline-report') {
					this.syncOutputFormatFromTimeline();
				}
				this.updateFilename();
				this.renderCurrentStep();
			}
		});

		// Show description for selected report
		if (this.formData.reportType) {
			const reportMeta = REPORT_METADATA[this.formData.reportType];
			const descEl = container.createDiv({ cls: 'cr-report-dropdown-desc' });
			descEl.createSpan({ text: reportMeta.description });
		}

		// Book Builder link
		const bookBuilderRow = container.createDiv({ cls: 'cr-report-book-builder-link' });
		const bookIcon = createLucideIcon('book-open', 16);
		bookBuilderRow.appendChild(bookIcon);
		const bookLink = bookBuilderRow.createEl('a', {
			text: '将多份报告汇编成一本书',
			href: '#'
		});
		bookLink.addEventListener('click', (e) => {
			e.preventDefault();
			this.close();
			void (async () => {
				const { BookBuilderModal } = await import('../../book/ui/book-builder-modal');
				new BookBuilderModal(this.plugin).open();
			})();
		});
	}

	/**
	 * Render subject selection section
	 */
	private renderSubjectSection(container: HTMLElement): void {
		const reportMeta = this.formData.reportType ? REPORT_METADATA[this.formData.reportType] : null;
		if (!reportMeta) return;

		const section = container.createDiv({ cls: 'cr-report-section' });
		section.createEl('h3', { text: '对象', cls: 'cr-report-section-title' });

		if (!reportMeta.requiresPerson) {
			// Special case for research-report-export: needs a note picker
			if (this.formData.reportType === 'research-report-export') {
				this.renderNotePickerSection(section);
				return;
			}
			// No subject needed
			section.createDiv({
				cls: 'cr-report-no-subject',
				text: '该报告将分析整个库。'
			});
			return;
		}

		// For person entities, render inline person picker
		if (reportMeta.entityType === 'person') {
			this.renderInlinePersonPicker(section);
			return;
		}

		// For other entity types, use button picker (place, universe, collection)
		const pickerRow = section.createDiv({ cls: 'cr-report-subject-picker' });

		const subjectName = this.getSubjectDisplayName();
		const placeholder = this.getSubjectPlaceholder(reportMeta.entityType);

		const pickerButton = pickerRow.createEl('button', {
			cls: 'cr-report-subject-button',
			text: subjectName || placeholder
		});

		if (subjectName) {
			pickerButton.addClass('cr-report-subject-button--selected');
		}

		// Icon
		const iconName = this.getSubjectIcon(reportMeta.entityType);
		const icon = createLucideIcon(iconName, 16);
		pickerButton.insertBefore(icon, pickerButton.firstChild);

		pickerButton.addEventListener('click', () => {
			void this.openSubjectPicker(reportMeta.entityType);
		});
	}

	// ========== RESEARCH REPORT NOTE PICKER ==========

	/**
	 * Render note picker section for research report export
	 */
	private renderNotePickerSection(container: HTMLElement): void {
		const pickerContainer = container.createDiv({ cls: 'cr-report-note-picker' });

		// Description
		pickerContainer.createDiv({
			cls: 'cr-report-note-picker-desc',
			text: '选择要导出的研究报告笔记：'
		});

		// Selected note display or picker button
		const pickerRow = pickerContainer.createDiv({ cls: 'cr-report-subject-picker' });

		const noteName = this.formData.subject.noteName;
		const placeholder = '选择研究报告…';

		const pickerButton = pickerRow.createEl('button', {
			cls: 'cr-report-subject-button',
			text: noteName || placeholder
		});

		if (noteName) {
			pickerButton.addClass('cr-report-subject-button--selected');
		}

		// Icon
		const icon = createLucideIcon('file-text', 16);
		pickerButton.insertBefore(icon, pickerButton.firstChild);

		pickerButton.addEventListener('click', () => {
			this.openResearchReportPicker();
		});
	}

	/**
	 * Open research report note picker modal
	 */
	private openResearchReportPicker(): void {
		// Find all notes with cr_type: research_report
		const researchReports: { path: string; name: string }[] = [];

		for (const file of this.app.vault.getMarkdownFiles()) {
			const cache = this.app.metadataCache.getFileCache(file);
			const frontmatter = cache?.frontmatter;
			if (frontmatter?.cr_type === 'research_report') {
				researchReports.push({
					path: file.path,
					name: frontmatter.title || file.basename
				});
			}
		}

		if (researchReports.length === 0) {
			new Notice('未找到研究报告笔记。请创建一份 frontmatter 含 cr_type: research_report 的笔记。');
			return;
		}

		// Sort by name
		researchReports.sort((a, b) => a.name.localeCompare(b.name));

		// Create a simple picker modal
		const picker = new ResearchReportPickerModal(
			this.app,
			researchReports,
			(selected) => {
				this.formData.subject = {
					notePath: selected.path,
					noteName: selected.name
				};
				this.updateFilename();
				this.renderCurrentStep();
			}
		);
		picker.open();
	}

	// ========== INLINE PERSON PICKER ==========

	/**
	 * Render inline person picker with search and filters
	 */
	private renderInlinePersonPicker(container: HTMLElement): void {
		this.personSectionContainer = container;

		// Selected person display (if any)
		if (this.formData.subject.personCrId) {
			const selectedContainer = container.createDiv({ cls: 'crc-wizard-selected-person' });
			this.renderSelectedPerson(selectedContainer);
		}

		// Toolbar row with search and sort
		const toolbarRow = container.createDiv({ cls: 'crc-wizard-toolbar' });

		// Search input
		const searchWrapper = toolbarRow.createDiv({ cls: 'crc-wizard-search-wrapper' });
		searchWrapper.appendChild(createLucideIcon('search', 16));

		const searchInput = searchWrapper.createEl('input', {
			type: 'text',
			placeholder: '按名称搜索…',
			cls: 'crc-wizard-search-input'
		});
		searchInput.value = this.searchQuery;

		searchInput.addEventListener('input', (e) => {
			this.searchQuery = (e.target as HTMLInputElement).value;
			this.applyFiltersAndSort();
			this.refreshPersonList();
		});

		// Sort dropdown
		const sortContainer = toolbarRow.createDiv({ cls: 'crc-wizard-sort' });
		const sortSelect = sortContainer.createEl('select', { cls: 'crc-wizard-select' });

		const sortOptions: { value: PersonSortOption; label: string }[] = [
			{ value: 'name-asc', label: '名称 A-Z' },
			{ value: 'name-desc', label: '名称 Z-A' },
			{ value: 'birth-asc', label: '出生（最早）' },
			{ value: 'birth-desc', label: '出生（最晚）' }
		];

		for (const opt of sortOptions) {
			const option = sortSelect.createEl('option', { value: opt.value, text: opt.label });
			if (opt.value === this.sortOption) option.selected = true;
		}

		sortSelect.addEventListener('change', () => {
			this.sortOption = sortSelect.value as PersonSortOption;
			this.applyFiltersAndSort();
			this.refreshPersonList();
		});

		// Results count
		const resultsCount = container.createDiv({ cls: 'crc-wizard-results-count' });
		resultsCount.createSpan({ text: `${this.allPeople.length} 位人物中的 ${this.filteredPeople.length} 位` });

		// Person list container
		this.personListContainer = container.createDiv({ cls: 'crc-wizard-person-results' });

		// Load people if not already loaded
		if (!this.peopleLoaded) {
			void this.loadPeople();
		} else {
			this.renderPersonList(this.personListContainer);
		}

		// Filter row (below the person list)
		const filterRow = container.createDiv({ cls: 'crc-wizard-filters' });

		// Sex filter
		const sexFilter = filterRow.createDiv({ cls: 'crc-wizard-filter-group' });
		sexFilter.createSpan({ text: '性别：', cls: 'crc-wizard-filter-label' });

		const sexOptions: { value: 'all' | 'male' | 'female' | 'unknown'; label: string }[] = [
			{ value: 'all', label: '全部' },
			{ value: 'male', label: '男' },
			{ value: 'female', label: '女' },
			{ value: 'unknown', label: '未知' }
		];

		for (const opt of sexOptions) {
			const chip = sexFilter.createEl('button', {
				text: opt.label,
				cls: `crc-wizard-filter-chip ${this.filterOptions.sex === opt.value ? 'crc-wizard-filter-chip--active' : ''}`
			});
			chip.addEventListener('click', () => {
				this.filterOptions.sex = opt.value;
				// Update active state on all chips
				sexFilter.querySelectorAll('.crc-wizard-filter-chip').forEach(c => {
					c.removeClass('crc-wizard-filter-chip--active');
				});
				chip.addClass('crc-wizard-filter-chip--active');
				this.applyFiltersAndSort();
				this.refreshPersonList();
			});
		}

		// Has connections filter
		const connectionsFilter = filterRow.createDiv({ cls: 'crc-wizard-filter-group' });
		const connectionsLabel = connectionsFilter.createEl('label', { cls: 'crc-wizard-filter-toggle' });
		const connectionsCheckbox = connectionsLabel.createEl('input', { type: 'checkbox' });
		connectionsCheckbox.checked = this.filterOptions.hasConnections;
		connectionsLabel.appendText('有家族关系');

		connectionsCheckbox.addEventListener('change', () => {
			this.filterOptions.hasConnections = connectionsCheckbox.checked;
			this.applyFiltersAndSort();
			this.refreshPersonList();
		});
	}

	/**
	 * Render selected person card with clear button
	 */
	private renderSelectedPerson(container: HTMLElement): void {
		container.empty();
		const { subject } = this.formData;
		if (!subject.personCrId) return;

		const card = container.createDiv({ cls: 'crc-wizard-selected-card' });
		card.appendChild(createLucideIcon('user', 20));

		const info = card.createDiv({ cls: 'crc-wizard-selected-info' });
		info.createDiv({ cls: 'crc-wizard-selected-name', text: subject.personName || '未知' });

		// Try to find birth/death dates from the person info
		const person = this.allPeople.find(p => p.crId === subject.personCrId);
		if (person) {
			const dates = this.formatDates(person.birthDate, person.deathDate);
			if (dates) {
				info.createDiv({ cls: 'crc-wizard-selected-dates', text: dates });
			}
		}

		const clearBtn = card.createEl('button', {
			cls: 'crc-wizard-clear-btn',
			attr: { type: 'button', 'aria-label': '清除选择' }
		});
		setLucideIcon(clearBtn, 'x', 16);
		clearBtn.addEventListener('click', () => {
			this.formData.subject = {};
			this.updateFilename();
			this.renderCurrentStep();
		});
	}

	/**
	 * Load all people from the vault
	 */
	private loadPeople(): void {
		const files = this.app.vault.getMarkdownFiles();
		const people: PersonInfo[] = [];

		for (const file of files) {
			const cache = this.app.metadataCache.getFileCache(file);
			if (!cache?.frontmatter) continue;

			if (isPersonNote(cache.frontmatter, cache)) {
				const fm = cache.frontmatter;
				people.push({
					crId: fm.cr_id as string || file.basename,
					name: fm.cr_full_name as string || file.basename,
					birthDate: fm.cr_birth_date as string | undefined,
					deathDate: fm.cr_death_date as string | undefined,
					sex: fm.cr_sex as string | undefined,
					file: file
				});
			}
		}

		this.allPeople = people;
		this.peopleLoaded = true;
		this.applyFiltersAndSort();
		this.refreshPersonList();
	}

	/**
	 * Apply filters and sorting to the person list
	 */
	private applyFiltersAndSort(): void {
		const query = this.searchQuery.toLowerCase().trim();
		let result = [...this.allPeople];

		// Apply search filter
		if (query) {
			result = result.filter(p => p.name.toLowerCase().includes(query));
		}

		// Apply sex filter
		if (this.filterOptions.sex !== 'all') {
			result = result.filter(p => {
				const sex = p.sex?.toLowerCase();
				if (this.filterOptions.sex === 'male') return sex === 'm' || sex === 'male';
				if (this.filterOptions.sex === 'female') return sex === 'f' || sex === 'female';
				if (this.filterOptions.sex === 'unknown') return !sex || (sex !== 'm' && sex !== 'male' && sex !== 'f' && sex !== 'female');
				return true;
			});
		}

		// Apply sorting
		result.sort((a, b) => {
			switch (this.sortOption) {
				case 'name-asc':
					return a.name.localeCompare(b.name);
				case 'name-desc':
					return b.name.localeCompare(a.name);
				case 'birth-asc':
					return (a.birthDate || '9999').localeCompare(b.birthDate || '9999');
				case 'birth-desc':
					return (b.birthDate || '0000').localeCompare(a.birthDate || '0000');
				default:
					return 0;
			}
		});

		this.filteredPeople = result;
	}

	/**
	 * Refresh the person list UI
	 */
	private refreshPersonList(): void {
		if (this.personListContainer) {
			this.renderPersonList(this.personListContainer);
		}
		if (this.personSectionContainer) {
			this.updateResultsCount(this.personSectionContainer);
		}
	}

	/**
	 * Update the results count display
	 */
	private updateResultsCount(container: HTMLElement): void {
		const resultsDiv = container.querySelector('.crc-wizard-results-count');
		if (resultsDiv) {
			resultsDiv.empty();
			(resultsDiv as HTMLElement).createSpan({ text: `${this.allPeople.length} 位人物中的 ${this.filteredPeople.length} 位` });
		}
	}

	/**
	 * Render the person list
	 */
	private renderPersonList(container: HTMLElement): void {
		container.empty();

		if (!this.peopleLoaded) {
			container.createDiv({
				cls: 'crc-wizard-empty',
				text: '正在加载人物…'
			});
			return;
		}

		if (this.filteredPeople.length === 0) {
			container.createDiv({
				cls: 'crc-wizard-empty',
				text: this.searchQuery ? '没有匹配的人物。' : '库中未找到人物。'
			});
			return;
		}

		const displayLimit = 50;
		const displayPeople = this.filteredPeople.slice(0, displayLimit);

		for (const person of displayPeople) {
			const isSelected = this.formData.subject.personCrId === person.crId;
			const row = container.createDiv({
				cls: `crc-wizard-person-row ${isSelected ? 'crc-wizard-person-row--selected' : ''}`
			});

			row.createEl('input', {
				type: 'radio',
				attr: {
					name: 'root-person',
					value: person.crId,
					...(isSelected ? { checked: 'true' } : {})
				}
			});

			const info = row.createDiv({ cls: 'crc-wizard-person-info' });
			info.createDiv({ cls: 'crc-wizard-person-name', text: person.name });

			const dates = this.formatDates(person.birthDate, person.deathDate);
			if (dates) {
				info.createDiv({ cls: 'crc-wizard-person-dates', text: dates });
			}

			row.addEventListener('click', () => {
				this.formData.subject = {
					personCrId: person.crId,
					personName: person.name
				};
				this.updateFilename();
				this.renderCurrentStep();
			});
		}

		if (this.filteredPeople.length > displayLimit) {
			container.createDiv({
				cls: 'crc-wizard-more',
				text: `已显示 ${this.filteredPeople.length} 位人物中的 ${displayLimit} 位。请细化搜索以查看更多。`
			});
		}
	}

	/**
	 * Format birth/death dates for display
	 */
	private formatDates(birthDate?: string, deathDate?: string): string | null {
		if (!birthDate && !deathDate) return null;
		const birth = birthDate ? birthDate.substring(0, 4) : '?';
		const death = deathDate ? deathDate.substring(0, 4) : '?';
		return `${birth} – ${death}`;
	}

	/**
	 * Get display name for current subject
	 */
	private getSubjectDisplayName(): string | null {
		const { subject } = this.formData;
		return subject.personName || subject.placeName || subject.universeName || subject.collectionName || null;
	}

	/**
	 * Get placeholder text for subject picker
	 */
	private getSubjectPlaceholder(entityType?: string): string {
		switch (entityType) {
			case 'person': return '选择人物…';
			case 'place': return '选择地点…';
			case 'universe': return '选择宇宙…';
			case 'collection': return '选择合集…';
			default: return '选择…';
		}
	}

	/**
	 * Get icon for subject type
	 */
	private getSubjectIcon(entityType?: string): LucideIconName {
		switch (entityType) {
			case 'person': return 'user';
			case 'place': return 'map-pin';
			case 'universe': return 'globe';
			case 'collection': return 'folder';
			default: return 'search';
		}
	}

	/**
	 * Open appropriate subject picker (for non-person entities)
	 */
	private async openSubjectPicker(entityType?: string): Promise<void> {
		switch (entityType) {
			case 'place':
				await this.openPlacePicker();
				break;
			case 'universe':
				await this.openUniversePicker();
				break;
			case 'collection':
				await this.openCollectionPicker();
				break;
		}
	}

	/**
	 * Open place picker modal
	 */
	private async openPlacePicker(): Promise<void> {
		return new Promise((resolve) => {
			const picker = new PlacePickerModal(
				this.app,
				(place: SelectedPlaceInfo) => {
					this.formData.subject = {
						placeCrId: place.crId,
						placeName: place.name
					};
					this.updateFilename();
					this.renderCurrentStep();
					resolve();
				},
				{
					plugin: this.plugin
				}
			);
			picker.open();
		});
	}

	/**
	 * Open universe picker modal (#369)
	 */
	private async openUniversePicker(): Promise<void> {
		const universeService = createUniverseService(this.plugin);
		const universes = universeService.getAllUniverses();

		if (universes.length === 0) {
			new Notice('未找到宇宙。请先创建一个宇宙。');
			return;
		}

		return new Promise((resolve) => {
			const modal = new UniversePickerModal(
				this.app,
				universes.map(u => ({ crId: u.crId, name: u.name })),
				(selected) => {
					this.formData.subject = {
						universeCrId: selected.crId,
						universeName: selected.name
					};
					this.updateFilename();
					this.renderCurrentStep();
					resolve();
				}
			);
			modal.open();
		});
	}

	/**
	 * Open collection picker modal (#369)
	 */
	private async openCollectionPicker(): Promise<void> {
		// Gather unique collection names from person notes
		const collections = new Set<string>();
		const noteTypeSettings = this.plugin.settings.noteTypeDetection;

		for (const file of this.app.vault.getMarkdownFiles()) {
			const cache = this.app.metadataCache.getFileCache(file);
			if (cache?.frontmatter && isPersonNote(cache.frontmatter, cache, noteTypeSettings)) {
				const collection = cache.frontmatter.collection as string | undefined;
				if (collection) {
					collections.add(collection);
				}
			}
		}

		if (collections.size === 0) {
			new Notice('未找到合集。请先在人物笔记上设置合集。');
			return;
		}

		return new Promise((resolve) => {
			const modal = new CollectionPickerModal(
				this.app,
				Array.from(collections).sort(),
				(selected) => {
					this.formData.subject = {
						collectionId: selected,
						collectionName: selected
					};
					this.updateFilename();
					this.renderCurrentStep();
					resolve();
				}
			);
			modal.open();
		});
	}

	/**
	 * Check if subject selection is complete
	 */
	private isSubjectComplete(): boolean {
		if (!this.formData.reportType) return false;

		const reportMeta = REPORT_METADATA[this.formData.reportType];

		// Special case for research-report-export: requires a note selection
		if (this.formData.reportType === 'research-report-export') {
			return !!this.formData.subject.notePath;
		}

		if (!reportMeta.requiresPerson) return true;

		const { subject } = this.formData;
		switch (reportMeta.entityType) {
			case 'person': return !!subject.personCrId;
			case 'place': return !!subject.placeCrId;
			case 'universe': return !!subject.universeCrId;
			case 'collection': return !!subject.collectionId;
			default: return true;
		}
	}

	/**
	 * Render format selection section
	 */
	private renderFormatSection(container: HTMLElement): void {
		const section = container.createDiv({ cls: 'cr-report-section' });
		section.createEl('h3', { text: '格式', cls: 'cr-report-section-title' });

		const formatGrid = section.createDiv({ cls: 'cr-report-format-grid' });

		const formats: { id: OutputFormat; label: string; icon: string; desc: string }[] = [
			{ id: 'vault', label: '库', icon: 'file', desc: '保存为 Markdown' },
			{ id: 'pdf', label: 'PDF', icon: 'file-text', desc: '下载 PDF' },
			{ id: 'odt', label: 'ODT', icon: 'file', desc: '可编辑文档' },
			{ id: 'md', label: 'MD', icon: 'download', desc: '下载 Markdown' }
		];

		for (const format of formats) {
			const isSelected = this.formData.outputFormat === format.id;
			const tile = formatGrid.createDiv({
				cls: `cr-report-format-tile ${isSelected ? 'cr-report-format-tile--selected' : ''}`
			});

			const iconEl = tile.createDiv({ cls: 'cr-report-tile-icon' });
			setIcon(iconEl, format.icon);

			tile.createDiv({ cls: 'cr-report-tile-label', text: format.label });

			tile.addEventListener('click', () => {
				this.formData.outputFormat = format.id;
				this.updateFilename();
				this.renderCurrentStep();
			});
		}
	}

	/**
	 * Render timeline-specific format selection with categories
	 */
	private renderTimelineFormatSection(container: HTMLElement): void {
		// Visual Exports category
		this.renderTimelineFormatCategory(container, '可视化导出', [
			{
				id: 'canvas' as TimelineExportFormat,
				label: 'Canvas',
				icon: 'layout-grid',
				desc: '带链接节点的交互式 Obsidian 画布'
			},
			{
				id: 'excalidraw' as TimelineExportFormat,
				label: 'Excalidraw',
				icon: 'pencil',
				desc: '手绘风格图示（需要 Excalidraw）'
			}
		]);

		// Documents category
		this.renderTimelineFormatCategory(container, '文档', [
			{
				id: 'pdf' as TimelineExportFormat,
				label: 'PDF',
				icon: 'file-text',
				desc: '适合打印/分享的专业文档'
			},
			{
				id: 'odt' as TimelineExportFormat,
				label: 'ODT',
				icon: 'file',
				desc: '可编辑文档（LibreOffice、Word）'
			}
		]);

		// Markdown category
		this.renderTimelineFormatCategory(container, 'Markdown', [
			{
				id: 'markdown_callout' as TimelineExportFormat,
				label: '垂直时间轴',
				icon: 'list',
				desc: '带年份分栏的样式化 callout（插件样式）'
			},
			{
				id: 'markdown_table' as TimelineExportFormat,
				label: '表格',
				icon: 'table',
				desc: '紧凑的数据表格'
			},
			{
				id: 'markdown_list' as TimelineExportFormat,
				label: '简单列表',
				icon: 'list-minus',
				desc: '兼容性最佳，无需样式'
			},
			{
				id: 'markdown_dataview' as TimelineExportFormat,
				label: 'Dataview 查询',
				icon: 'database',
				desc: '动态自动更新（需要 Dataview）'
			}
		]);
	}

	/**
	 * Render a category of timeline format options as tiles
	 */
	private renderTimelineFormatCategory(
		container: HTMLElement,
		categoryName: string,
		formats: { id: TimelineExportFormat; label: string; icon: string; desc: string }[]
	): void {
		const categorySection = container.createDiv({ cls: 'cr-timeline-format-category' });
		categorySection.createEl('h4', { text: categoryName, cls: 'cr-timeline-format-category-title' });

		const tileGrid = categorySection.createDiv({ cls: 'cr-timeline-format-grid' });

		for (const format of formats) {
			const isSelected = this.formData.timelineFormat === format.id;
			const tile = tileGrid.createDiv({
				cls: `cr-timeline-format-tile ${isSelected ? 'cr-timeline-format-tile--selected' : ''}`
			});

			// Icon container
			const iconContainer = tile.createDiv({ cls: 'cr-timeline-format-tile-icon' });
			setLucideIcon(iconContainer, format.icon as LucideIconName, 24);

			// Label
			tile.createDiv({ cls: 'cr-timeline-format-tile-label', text: format.label });

			// Tooltip with description
			tile.setAttribute('title', format.desc);
			tile.setAttribute('aria-label', `${format.label}: ${format.desc}`);

			// Click handler
			tile.addEventListener('click', () => {
				this.formData.timelineFormat = format.id;
				this.syncOutputFormatFromTimeline();
				this.updateFilename();
				this.renderCurrentStep();
			});

			// Keyboard accessibility
			tile.setAttribute('tabindex', '0');
			tile.setAttribute('role', 'radio');
			tile.setAttribute('aria-checked', isSelected ? 'true' : 'false');
			tile.addEventListener('keydown', (e) => {
				if (e.key === 'Enter' || e.key === ' ') {
					e.preventDefault();
					this.formData.timelineFormat = format.id;
					this.syncOutputFormatFromTimeline();
					this.updateFilename();
					this.renderCurrentStep();
				}
			});
		}
	}

	/**
	 * Sync the generic outputFormat from timeline format selection
	 */
	private syncOutputFormatFromTimeline(): void {
		switch (this.formData.timelineFormat) {
			case 'pdf':
				this.formData.outputFormat = 'pdf';
				break;
			case 'odt':
				this.formData.outputFormat = 'odt';
				break;
			case 'canvas':
			case 'excalidraw':
				// Visual exports go to vault
				this.formData.outputFormat = 'vault';
				break;
			default:
				// Markdown formats
				this.formData.outputFormat = 'vault';
				break;
		}
	}

	/**
	 * Render filename section
	 */
	private renderFilenameSection(container: HTMLElement): void {
		const section = container.createDiv({ cls: 'cr-report-section' });
		section.createEl('h3', { text: '文件名', cls: 'cr-report-section-title' });

		const filenameRow = section.createDiv({ cls: 'cr-report-filename-row' });

		const filenameInput = filenameRow.createEl('input', {
			type: 'text',
			cls: 'cr-report-filename-input',
			value: this.formData.filename
		});

		filenameInput.addEventListener('input', (e) => {
			this.formData.filename = (e.target as HTMLInputElement).value;
		});

		const ext = this.getFileExtension();
		filenameRow.createSpan({ cls: 'cr-report-filename-ext', text: `.${ext}` });
	}

	/**
	 * Get file extension based on output format
	 */
	private getFileExtension(): string {
		// For timeline reports, use timeline-specific format
		if (this.isTimelineReport()) {
			switch (this.formData.timelineFormat) {
				case 'pdf': return 'pdf';
				case 'odt': return 'odt';
				case 'canvas': return 'canvas';
				case 'excalidraw': return 'excalidraw.md';
				default: return 'md';
			}
		}
		// For other reports, use generic output format
		switch (this.formData.outputFormat) {
			case 'pdf': return 'pdf';
			case 'odt': return 'odt';
			case 'vault':
			case 'md':
			default: return 'md';
		}
	}

	/**
	 * Update filename based on selections
	 */
	private updateFilename(): void {
		const parts: string[] = [];

		if (this.formData.reportType) {
			const reportMeta = REPORT_METADATA[this.formData.reportType];
			parts.push(reportMeta.name.toLowerCase().replace(/\s+/g, '-'));
		}

		const subjectName = this.getSubjectDisplayName();
		if (subjectName) {
			const sanitized = subjectName
				.replace(/[<>:"/\\|?*]/g, '')
				.replace(/\s+/g, '-')
				.toLowerCase();
			parts.push(sanitized);
		}

		const date = new Date().toISOString().split('T')[0];
		parts.push(date);

		this.formData.filename = parts.join('-');
	}

	// ========== STEP 3: CUSTOMIZE ==========

	private renderStep3(container: HTMLElement): void {
		// Timeline reports have different customization options
		if (this.isTimelineReport()) {
			this.renderTimelineOptionsStep(container);
			return;
		}

		// Content Options section
		this.renderContentOptionsSection(container);

		// Format-specific options
		container.createEl('hr', { cls: 'cr-report-separator' });
		this.renderFormatSpecificOptions(container);
	}

	/**
	 * Render timeline-specific options for Step 3
	 */
	private renderTimelineOptionsStep(container: HTMLElement): void {
		const format = this.formData.timelineFormat;

		// Canvas/Excalidraw options
		if (format === 'canvas' || format === 'excalidraw') {
			this.renderTimelineVisualOptions(container);
			if (format === 'excalidraw') {
				container.createEl('hr', { cls: 'cr-report-separator' });
				this.renderExcalidrawStyleOptions(container);
			}
		}
		// PDF/ODT options
		else if (format === 'pdf' || format === 'odt') {
			this.renderPdfOptions(container);
		}
		// Markdown options
		else {
			this.renderTimelineMarkdownOptions(container);
			if (format === 'markdown_callout') {
				container.createEl('hr', { cls: 'cr-report-separator' });
				this.renderTimelineCalloutOptions(container);
			}
		}
	}

	/**
	 * Render Canvas/Excalidraw visual options
	 */
	private renderTimelineVisualOptions(container: HTMLElement): void {
		const section = container.createDiv({ cls: 'cr-report-section' });
		section.createEl('h3', { text: '可视化选项', cls: 'cr-report-section-title' });

		// Layout style
		const layoutRow = section.createDiv({ cls: 'cr-report-option-row' });
		layoutRow.createSpan({ text: '布局：', cls: 'cr-report-option-label' });

		const layoutSelect = layoutRow.createEl('select', { cls: 'cr-report-select' });
		const layoutOptions: { value: TimelineLayoutStyle; label: string }[] = [
			{ value: 'horizontal', label: '水平' },
			{ value: 'vertical', label: '垂直' },
			{ value: 'gantt', label: '甘特图（按日期与人物）' }
		];
		for (const opt of layoutOptions) {
			const option = layoutSelect.createEl('option', { value: opt.value, text: opt.label });
			if (opt.value === this.formData.timelineLayoutStyle) option.selected = true;
		}
		layoutSelect.addEventListener('change', () => {
			this.formData.timelineLayoutStyle = layoutSelect.value as TimelineLayoutStyle;
		});

		// Color scheme
		const colorRow = section.createDiv({ cls: 'cr-report-option-row' });
		colorRow.createSpan({ text: '配色方案：', cls: 'cr-report-option-label' });

		const colorSelect = colorRow.createEl('select', { cls: 'cr-report-select' });
		const colorOptions: { value: TimelineColorScheme; label: string }[] = [
			{ value: 'event_type', label: '按事件类型' },
			{ value: 'category', label: '按分类' },
			{ value: 'confidence', label: '按置信度' },
			{ value: 'monochrome', label: '单色' }
		];
		for (const opt of colorOptions) {
			const option = colorSelect.createEl('option', { value: opt.value, text: opt.label });
			if (opt.value === this.formData.timelineColorScheme) option.selected = true;
		}
		colorSelect.addEventListener('change', () => {
			this.formData.timelineColorScheme = colorSelect.value as TimelineColorScheme;
		});

		// Grouping
		const groupingRow = section.createDiv({ cls: 'cr-report-option-row' });
		groupingRow.createSpan({ text: '分组方式：', cls: 'cr-report-option-label' });

		const groupingSelect = groupingRow.createEl('select', { cls: 'cr-report-select' });
		const groupingOptions: { value: typeof this.formData.timelineGrouping; label: string }[] = [
			{ value: 'none', label: '无（平铺时间轴）' },
			{ value: 'by_year', label: '按年' },
			{ value: 'by_decade', label: '按年代' },
			{ value: 'by_person', label: '按人物（泳道）' },
			{ value: 'by_place', label: '按地点' }
		];
		for (const opt of groupingOptions) {
			const option = groupingSelect.createEl('option', { value: opt.value, text: opt.label });
			if (opt.value === this.formData.timelineGrouping) option.selected = true;
		}
		groupingSelect.addEventListener('change', () => {
			this.formData.timelineGrouping = groupingSelect.value as typeof this.formData.timelineGrouping;
		});

		// Include ordering edges toggle
		this.renderToggleOption(section, '包含排序连线（前后关系）',
			this.formData.timelineIncludeOrderingEdges, (value) => {
				this.formData.timelineIncludeOrderingEdges = value;
			});
	}

	/**
	 * Render Excalidraw-specific style options
	 */
	private renderExcalidrawStyleOptions(container: HTMLElement): void {
		const section = container.createDiv({ cls: 'cr-report-section' });
		section.createEl('h3', { text: 'Excalidraw 样式', cls: 'cr-report-section-title' });

		// Drawing style
		const styleRow = section.createDiv({ cls: 'cr-report-option-row' });
		styleRow.createSpan({ text: '绘制风格：', cls: 'cr-report-option-label' });

		const styleSelect = styleRow.createEl('select', { cls: 'cr-report-select' });
		const styleOptions: { value: typeof this.formData.excalidrawDrawingStyle; label: string }[] = [
			{ value: 'architect', label: '建筑师（整洁）' },
			{ value: 'artist', label: '艺术家（自然）' },
			{ value: 'cartoonist', label: '漫画家（粗犷）' }
		];
		for (const opt of styleOptions) {
			const option = styleSelect.createEl('option', { value: opt.value, text: opt.label });
			if (opt.value === this.formData.excalidrawDrawingStyle) option.selected = true;
		}
		styleSelect.addEventListener('change', () => {
			this.formData.excalidrawDrawingStyle = styleSelect.value as typeof this.formData.excalidrawDrawingStyle;
		});

		// Font family
		const fontRow = section.createDiv({ cls: 'cr-report-option-row' });
		fontRow.createSpan({ text: '字体：', cls: 'cr-report-option-label' });

		const fontSelect = fontRow.createEl('select', { cls: 'cr-report-select' });
		const fontOptions = ['Virgil', 'Excalifont', 'Comic Shanns', 'Helvetica', 'Nunito', 'Lilita One', 'Cascadia'];
		for (const font of fontOptions) {
			const option = fontSelect.createEl('option', { value: font, text: font });
			if (font === this.formData.excalidrawFontFamily) option.selected = true;
		}
		fontSelect.addEventListener('change', () => {
			this.formData.excalidrawFontFamily = fontSelect.value;
		});

		// Stroke width
		const strokeRow = section.createDiv({ cls: 'cr-report-option-row' });
		strokeRow.createSpan({ text: '线条粗细：', cls: 'cr-report-option-label' });

		const strokeSelect = strokeRow.createEl('select', { cls: 'cr-report-select' });
		const strokeOptions: { value: typeof this.formData.excalidrawStrokeWidth; label: string }[] = [
			{ value: 'thin', label: '细' },
			{ value: 'normal', label: '正常' },
			{ value: 'bold', label: '粗' },
			{ value: 'extra-bold', label: '特粗' }
		];
		for (const opt of strokeOptions) {
			const option = strokeSelect.createEl('option', { value: opt.value, text: opt.label });
			if (opt.value === this.formData.excalidrawStrokeWidth) option.selected = true;
		}
		strokeSelect.addEventListener('change', () => {
			this.formData.excalidrawStrokeWidth = strokeSelect.value as typeof this.formData.excalidrawStrokeWidth;
		});
	}

	/**
	 * Render markdown format options for timeline
	 */
	private renderTimelineMarkdownOptions(container: HTMLElement): void {
		const section = container.createDiv({ cls: 'cr-report-section' });
		section.createEl('h3', { text: 'Markdown 选项', cls: 'cr-report-section-title' });

		// Grouping
		const groupingRow = section.createDiv({ cls: 'cr-report-option-row' });
		groupingRow.createSpan({ text: '分组方式：', cls: 'cr-report-option-label' });

		const groupingSelect = groupingRow.createEl('select', { cls: 'cr-report-select' });
		const groupingOptions: { value: typeof this.formData.timelineGrouping; label: string }[] = [
			{ value: 'none', label: '无（平铺列表）' },
			{ value: 'by_year', label: '按年' },
			{ value: 'by_decade', label: '按年代' },
			{ value: 'by_person', label: '按人物' },
			{ value: 'by_place', label: '按地点' }
		];
		for (const opt of groupingOptions) {
			const option = groupingSelect.createEl('option', { value: opt.value, text: opt.label });
			if (opt.value === this.formData.timelineGrouping) option.selected = true;
		}
		groupingSelect.addEventListener('change', () => {
			this.formData.timelineGrouping = groupingSelect.value as typeof this.formData.timelineGrouping;
		});

		// Include descriptions toggle
		this.renderToggleOption(section, '包含事件描述',
			this.formData.timelineIncludeDescriptions, (value) => {
				this.formData.timelineIncludeDescriptions = value;
			});

		// Include sources toggle
		this.renderToggleOption(section, '包含来源',
			this.formData.includeSources, (value) => {
				this.formData.includeSources = value;
			});
	}

	/**
	 * Render callout-specific options
	 */
	private renderTimelineCalloutOptions(container: HTMLElement): void {
		const section = container.createDiv({ cls: 'cr-report-section' });
		section.createEl('h3', { text: 'Callout 样式', cls: 'cr-report-section-title' });

		// Callout type selector
		const calloutRow = section.createDiv({ cls: 'cr-report-option-row' });
		calloutRow.createSpan({ text: 'Callout 类型：', cls: 'cr-report-option-label' });

		const calloutSelect = calloutRow.createEl('select', { cls: 'cr-report-select' });
		const calloutOptions = [
			{ value: 'cr-timeline', label: 'cr-timeline（插件默认）' },
			{ value: 'timeline', label: 'timeline' },
			{ value: 'event', label: 'event' },
			{ value: 'note', label: 'note（Obsidian 内置）' },
			{ value: 'custom', label: '自定义…' }
		];
		for (const opt of calloutOptions) {
			const option = calloutSelect.createEl('option', { value: opt.value, text: opt.label });
			if (opt.value === this.formData.timelineCalloutType ||
				(opt.value === 'custom' && !calloutOptions.slice(0, -1).some(o => o.value === this.formData.timelineCalloutType))) {
				option.selected = true;
			}
		}

		// Custom input (hidden by default)
		const customInputRow = section.createDiv({ cls: 'cr-report-option-row cr-report-custom-callout' });
		customInputRow.createSpan({ text: '自定义名称：', cls: 'cr-report-option-label' });
		const customInput = customInputRow.createEl('input', {
			type: 'text',
			cls: 'cr-report-input',
			placeholder: '输入 callout 类型名称',
			value: calloutOptions.slice(0, -1).some(o => o.value === this.formData.timelineCalloutType)
				? '' : this.formData.timelineCalloutType
		});

		// Show/hide custom input based on selection
		const updateCustomVisibility = () => {
			customInputRow.style.display = calloutSelect.value === 'custom' ? 'flex' : 'none';
		};
		updateCustomVisibility();

		calloutSelect.addEventListener('change', () => {
			if (calloutSelect.value !== 'custom') {
				this.formData.timelineCalloutType = calloutSelect.value;
			}
			updateCustomVisibility();
		});

		customInput.addEventListener('input', () => {
			this.formData.timelineCalloutType = customInput.value || 'cr-timeline';
		});
	}

	// ========== STEP 4: GENERATE ==========

	private renderStep4(container: HTMLElement): void {
		// Estimate panel (summary of what will be generated)
		if (this.isTimelineReport()) {
			this.renderTimelineEstimatePanel(container);
		} else {
			this.renderEstimatePanel(container);
		}

		container.createEl('hr', { cls: 'cr-report-separator' });

		// Filename section
		const filenameSection = container.createDiv({ cls: 'cr-report-section' });
		filenameSection.createEl('h3', { text: '文件名', cls: 'cr-report-section-title' });
		this.renderFilenameSection(filenameSection);
	}

	/**
	 * Render timeline-specific estimate panel with data quality insights
	 */
	private renderTimelineEstimatePanel(container: HTMLElement): void {
		const section = container.createDiv({ cls: 'cr-report-section' });
		section.createEl('h3', { text: '摘要', cls: 'cr-report-section-title' });

		const panel = section.createDiv({ cls: 'cr-report-estimate-panel' });

		// Format
		const formatRow = panel.createDiv({ cls: 'cr-report-estimate-row' });
		formatRow.createSpan({ cls: 'cr-report-estimate-label', text: '格式：' });
		formatRow.createSpan({ cls: 'cr-report-estimate-value', text: this.getFormatDisplayName() });

		// Grouping
		const groupingRow = panel.createDiv({ cls: 'cr-report-estimate-row' });
		groupingRow.createSpan({ cls: 'cr-report-estimate-label', text: '分组：' });
		const groupingLabels: Record<string, string> = {
			'none': '无',
			'by_year': '按年',
			'by_decade': '按年代',
			'by_person': '按人物',
			'by_place': '按地点'
		};
		groupingRow.createSpan({
			cls: 'cr-report-estimate-value',
			text: groupingLabels[this.formData.timelineGrouping] || '无'
		});

		// Filters summary (if any filters are set)
		const hasFilters = this.formData.timelineDateFrom || this.formData.timelineDateTo ||
			this.formData.timelineEventTypes.length > 0 || this.formData.timelinePersonFilter.length > 0 ||
			this.formData.timelinePlaceFilter.length > 0;
		if (hasFilters) {
			const filtersRow = panel.createDiv({ cls: 'cr-report-estimate-row' });
			filtersRow.createSpan({ cls: 'cr-report-estimate-label', text: '筛选：' });
			const filterParts: string[] = [];
			if (this.formData.timelineDateFrom || this.formData.timelineDateTo) {
				const from = this.formData.timelineDateFrom || '...';
				const to = this.formData.timelineDateTo || '...';
				filterParts.push(`${from} 至 ${to}`);
			}
			if (this.formData.timelineEventTypes.length > 0) {
				filterParts.push(`${this.formData.timelineEventTypes.length} 种事件类型`);
			}
			if (this.formData.timelinePersonFilter.length > 0) {
				filterParts.push(`${this.formData.timelinePersonFilter.length} 位人物`);
			}
			if (this.formData.timelinePlaceFilter.length > 0) {
				filterParts.push(`${this.formData.timelinePlaceFilter.length} 个地点`);
			}
			filtersRow.createSpan({ cls: 'cr-report-estimate-value', text: filterParts.join(', ') });
		}

		// Data quality insights (collapsible section)
		this.renderTimelineDataQualitySection(section);
	}

	/**
	 * Render data quality insights section for timeline reports
	 */
	private renderTimelineDataQualitySection(container: HTMLElement): void {
		const detailsEl = container.createEl('details', { cls: 'cr-report-data-quality' });

		const summary = detailsEl.createEl('summary', { cls: 'cr-report-data-quality-summary' });
		summary.appendChild(createLucideIcon('alert-triangle', 16));
		summary.createSpan({ text: '数据质量洞察' });

		const content = detailsEl.createDiv({ cls: 'cr-report-data-quality-content' });

		// Note: In a full implementation, these would be calculated from actual data
		// For now, we show placeholder guidance text
		const placeholderMsg = content.createDiv({ cls: 'cr-report-data-quality-placeholder' });
		placeholderMsg.createEl('p', {
			text: '数据质量洞察将在生成时计算。'
		});
		placeholderMsg.createEl('p', {
			text: '报告将包含以下警告：',
			cls: 'cr-report-data-quality-subtitle'
		});

		const list = placeholderMsg.createEl('ul', { cls: 'cr-report-data-quality-list' });
		list.createEl('li', { text: '时间轴空白（连续 5 年以上无事件）' });
		list.createEl('li', { text: '无来源事件（缺少引文的事件）' });
		list.createEl('li', { text: '孤立事件（未关联任何人物的事件）' });
	}

	/**
	 * Render estimate panel showing summary of report to be generated
	 */
	private renderEstimatePanel(container: HTMLElement): void {
		const section = container.createDiv({ cls: 'cr-report-section' });
		section.createEl('h3', { text: '摘要', cls: 'cr-report-section-title' });

		const panel = section.createDiv({ cls: 'cr-report-estimate-panel' });

		// Report type
		const reportMeta = this.formData.reportType ? REPORT_METADATA[this.formData.reportType] : null;
		if (reportMeta) {
			const reportRow = panel.createDiv({ cls: 'cr-report-estimate-row' });
			reportRow.createSpan({ cls: 'cr-report-estimate-label', text: '报告：' });
			reportRow.createSpan({ cls: 'cr-report-estimate-value', text: reportMeta.name });
		}

		// Subject
		const subjectName = this.getSubjectDisplayName();
		if (subjectName) {
			const subjectRow = panel.createDiv({ cls: 'cr-report-estimate-row' });
			subjectRow.createSpan({ cls: 'cr-report-estimate-label', text: '对象：' });
			subjectRow.createSpan({ cls: 'cr-report-estimate-value', text: subjectName });
		}

		// Format
		const formatRow = panel.createDiv({ cls: 'cr-report-estimate-row' });
		formatRow.createSpan({ cls: 'cr-report-estimate-label', text: '格式：' });
		formatRow.createSpan({ cls: 'cr-report-estimate-value', text: this.getFormatDisplayName() });

		// Generations (if applicable)
		if (this.shouldShowOption('generations')) {
			const genRow = panel.createDiv({ cls: 'cr-report-estimate-row' });
			genRow.createSpan({ cls: 'cr-report-estimate-label', text: '世代：' });
			genRow.createSpan({ cls: 'cr-report-estimate-value', text: String(this.formData.maxGenerations) });
		}

		// Estimated people count (placeholder - can be enhanced later)
		const countRow = panel.createDiv({ cls: 'cr-report-estimate-row' });
		countRow.createSpan({ cls: 'cr-report-estimate-label', text: '预计人物数：' });
		const estimatedPeople = this.estimatePeopleCount();
		countRow.createSpan({ cls: 'cr-report-estimate-value', text: estimatedPeople });
	}

	/**
	 * Get display name for current output format
	 */
	private getFormatDisplayName(): string {
		// For timeline reports, use timeline-specific format names
		if (this.isTimelineReport()) {
			switch (this.formData.timelineFormat) {
				case 'canvas': return 'Canvas';
				case 'excalidraw': return 'Excalidraw';
				case 'pdf': return 'PDF 文档';
				case 'odt': return 'ODT 文档';
				case 'markdown_callout': return '垂直时间轴（Callout）';
				case 'markdown_table': return 'Markdown 表格';
				case 'markdown_list': return '简单列表';
				case 'markdown_dataview': return 'Dataview 查询';
			}
		}
		switch (this.formData.outputFormat) {
			case 'vault': return '保存到库';
			case 'pdf': return 'PDF 文档';
			case 'odt': return 'ODT 文档';
			case 'md': return 'Markdown 文件';
		}
	}

	/**
	 * Estimate people count for the report (placeholder implementation)
	 */
	private estimatePeopleCount(): string {
		const gens = this.formData.maxGenerations;
		const type = this.formData.reportType;

		if (!type) return '—';

		// Rough estimates based on report type
		if (type === 'ahnentafel' || type === 'pedigree-chart') {
			// Ancestors: 2^n - 1 max, but typically 60-70% filled
			const maxAncestors = Math.pow(2, gens) - 1;
			const estimated = Math.round(maxAncestors * 0.65);
			return `~${estimated}`;
		} else if (type === 'descendant-chart' || type === 'register-report') {
			// Descendants vary widely, rough estimate
			const estimated = Math.round(gens * 8);
			return `~${estimated}`;
		} else if (type === 'family-group-sheet') {
			return '2-15';
		}

		return '—';
	}

	/**
	 * Render content options section
	 */
	private renderContentOptionsSection(container: HTMLElement): void {
		const section = container.createDiv({ cls: 'cr-report-section' });
		section.createEl('h3', { text: '内容选项', cls: 'cr-report-section-title' });

		const optionsGrid = section.createDiv({ cls: 'cr-report-options-grid' });

		// Include spouses (for applicable reports)
		if (this.shouldShowOption('spouses')) {
			this.renderToggleOption(optionsGrid, '包含配偶', this.formData.includeSpouses, (value) => {
				this.formData.includeSpouses = value;
			});
		}

		// Include sources
		this.renderToggleOption(optionsGrid, '包含来源', this.formData.includeSources, (value) => {
			this.formData.includeSources = value;
		});

		// Include details
		if (this.shouldShowOption('details')) {
			this.renderToggleOption(optionsGrid, '包含详细信息', this.formData.includeDetails, (value) => {
				this.formData.includeDetails = value;
			});
		}

		// Include children (for family group sheet)
		if (this.shouldShowOption('children')) {
			this.renderToggleOption(optionsGrid, '包含子女', this.formData.includeChildren, (value) => {
				this.formData.includeChildren = value;
			});
		}

		// Generations (for ancestor/descendant reports)
		if (this.shouldShowOption('generations')) {
			const genRow = section.createDiv({ cls: 'cr-report-option-row' });
			genRow.createSpan({ text: '世代：', cls: 'cr-report-option-label' });

			const genInput = genRow.createEl('input', {
				cls: 'cr-report-input',
				type: 'number',
				attr: { min: '1', step: '1' },
				value: String(this.formData.maxGenerations)
			});

			genInput.addEventListener('change', () => {
				const val = parseInt(genInput.value);
				if (!isNaN(val) && val >= 1) {
					this.formData.maxGenerations = val;
				} else {
					genInput.value = String(this.formData.maxGenerations);
				}
			});
		}

		// Sort order (for brick wall report)
		if (this.formData.reportType === 'brick-wall-report') {
			const sortRow = section.createDiv({ cls: 'cr-report-option-row' });
			sortRow.createSpan({ text: '排序方式：', cls: 'cr-report-option-label' });

			const sortSelect = sortRow.createEl('select', { cls: 'cr-report-select' });
			const sortOptions: { value: BrickWallSortOrder; label: string }[] = [
				{ value: 'generation', label: '世代（由近及远）' },
				{ value: 'name', label: '名称（字母顺序）' },
				{ value: 'research_level', label: '研究等级（研究最少在前）' }
			];
			for (const opt of sortOptions) {
				const option = sortSelect.createEl('option', { value: opt.value, text: opt.label });
				if (opt.value === this.formData.brickWallSortBy) option.selected = true;
			}
			sortSelect.addEventListener('change', () => {
				this.formData.brickWallSortBy = sortSelect.value as BrickWallSortOrder;
			});
		}

		// Kinship report options
		if (this.formData.reportType === 'kinship-report') {
			// Max degree
			const degreeRow = section.createDiv({ cls: 'cr-report-option-row' });
			degreeRow.createSpan({ text: '最大度数：', cls: 'cr-report-option-label' });

			const degreeInput = degreeRow.createEl('input', {
				cls: 'cr-report-input',
				type: 'number',
				attr: { min: '1', step: '1' },
				value: String(this.formData.kinshipMaxDegree)
			});
			degreeInput.addEventListener('change', () => {
				const val = parseInt(degreeInput.value);
				if (!isNaN(val) && val >= 1) {
					this.formData.kinshipMaxDegree = val;
				} else {
					degreeInput.value = String(this.formData.kinshipMaxDegree);
				}
			});

			// Sort order
			const sortRow = section.createDiv({ cls: 'cr-report-option-row' });
			sortRow.createSpan({ text: '排序方式：', cls: 'cr-report-option-label' });

			const sortSelect = sortRow.createEl('select', { cls: 'cr-report-select' });
			const kinshipSortOptions: { value: KinshipSortOrder; label: string }[] = [
				{ value: 'degree', label: '亲等（最近在前）' },
				{ value: 'name', label: '名称（字母顺序）' },
				{ value: 'relationship', label: '关系类型' }
			];
			for (const opt of kinshipSortOptions) {
				const option = sortSelect.createEl('option', { value: opt.value, text: opt.label });
				if (opt.value === this.formData.kinshipSortBy) option.selected = true;
			}
			sortSelect.addEventListener('change', () => {
				this.formData.kinshipSortBy = sortSelect.value as KinshipSortOrder;
			});
		}

		// Gaps report options
		if (this.formData.reportType === 'gaps-report') {
			// Fields to check
			const fieldsSection = section.createDiv({ cls: 'cr-report-subsection' });
			fieldsSection.createEl('h4', { text: '要检查的字段', cls: 'cr-report-subsection-title' });

			this.renderToggleOption(fieldsSection, '缺失的出生日期', this.formData.gapsFieldsToCheck.birthDate, (value) => {
				this.formData.gapsFieldsToCheck.birthDate = value;
			});
			this.renderToggleOption(fieldsSection, '缺失的去世日期', this.formData.gapsFieldsToCheck.deathDate, (value) => {
				this.formData.gapsFieldsToCheck.deathDate = value;
			});
			this.renderToggleOption(fieldsSection, '缺失的父母', this.formData.gapsFieldsToCheck.parents, (value) => {
				this.formData.gapsFieldsToCheck.parents = value;
			});
			this.renderToggleOption(fieldsSection, '无来源的人物', this.formData.gapsFieldsToCheck.sources, (value) => {
				this.formData.gapsFieldsToCheck.sources = value;
			});

			// Max items per category
			const maxItemsRow = section.createDiv({ cls: 'cr-report-option-row' });
			maxItemsRow.createSpan({ text: '每类最大条目数：', cls: 'cr-report-option-label' });

			const maxItemsInput = maxItemsRow.createEl('input', {
				cls: 'cr-report-input',
				type: 'number',
				attr: { min: '10', max: '200', step: '10' },
				value: String(this.formData.gapsMaxItemsPerCategory)
			});
			maxItemsInput.addEventListener('change', () => {
				const val = parseInt(maxItemsInput.value);
				if (!isNaN(val) && val >= 10 && val <= 200) {
					this.formData.gapsMaxItemsPerCategory = val;
				} else {
					maxItemsInput.value = String(this.formData.gapsMaxItemsPerCategory);
				}
			});

			// Research level filter
			const researchRow = section.createDiv({ cls: 'cr-report-option-row' });
			researchRow.createSpan({ text: '研究等级筛选：', cls: 'cr-report-option-label' });

			const researchSelect = researchRow.createEl('select', { cls: 'cr-report-select' });
			const researchOptions: { value: string; label: string }[] = [
				{ value: '', label: '全部等级' },
				{ value: '0', label: '仅等级 0（未识别）' },
				{ value: '1', label: '等级 0–1（信息极少）' },
				{ value: '2', label: '等级 0–2（基础）' },
				{ value: '3', label: '等级 0–3（中等）' },
				{ value: '4', label: '等级 0–4（详细）' },
				{ value: '5', label: '等级 0–5（全面）' }
			];
			for (const opt of researchOptions) {
				const option = researchSelect.createEl('option', { value: opt.value, text: opt.label });
				if (opt.value === (this.formData.gapsResearchLevelMax?.toString() ?? '')) option.selected = true;
			}
			researchSelect.addEventListener('change', () => {
				this.formData.gapsResearchLevelMax = researchSelect.value ? parseInt(researchSelect.value) : undefined;
			});

			// Include unassessed
			this.renderToggleOption(section, '包含未评估者', this.formData.gapsIncludeUnassessed, (value) => {
				this.formData.gapsIncludeUnassessed = value;
			});

			// Sort by research level
			this.renderToggleOption(section, '按研究等级排序', this.formData.gapsSortByResearchLevel, (value) => {
				this.formData.gapsSortByResearchLevel = value;
			});
		}
	}

	/**
	 * Check if an option should be shown for current report type
	 */
	private shouldShowOption(option: string): boolean {
		const type = this.formData.reportType;
		if (!type) return false;

		switch (option) {
			case 'spouses':
				return ['register-report', 'descendant-chart'].includes(type);
			case 'details':
				return ['ahnentafel', 'pedigree-chart', 'descendant-chart', 'register-report', 'brick-wall-report'].includes(type);
			case 'children':
				return type === 'family-group-sheet';
			case 'generations':
				return ['ahnentafel', 'register-report', 'pedigree-chart', 'descendant-chart', 'brick-wall-report'].includes(type);
			default:
				return false;
		}
	}

	/**
	 * Render a toggle option
	 */
	private renderToggleOption(
		container: HTMLElement,
		label: string,
		checked: boolean,
		onChange: (value: boolean) => void
	): void {
		const row = container.createDiv({ cls: 'cr-report-toggle-row' });

		const checkbox = row.createEl('input', {
			type: 'checkbox',
			cls: 'cr-report-checkbox'
		});
		checkbox.checked = checked;

		row.createEl('label', { text: label, cls: 'cr-report-toggle-label' });

		checkbox.addEventListener('change', () => {
			onChange(checkbox.checked);
		});
	}

	/**
	 * Render format-specific options
	 */
	private renderFormatSpecificOptions(container: HTMLElement): void {
		switch (this.formData.outputFormat) {
			case 'pdf':
				this.renderPdfOptions(container);
				break;
			case 'odt':
				this.renderOdtOptions(container);
				break;
			case 'vault':
				this.renderVaultOptions(container);
				break;
			// MD has no additional options for now
		}
	}

	/**
	 * Render PDF-specific options
	 */
	private renderPdfOptions(container: HTMLElement): void {
		const section = container.createDiv({ cls: 'cr-report-section' });
		section.createEl('h3', { text: 'PDF 选项', cls: 'cr-report-section-title' });

		// Page size
		const pageSizeRow = section.createDiv({ cls: 'cr-report-option-row' });
		pageSizeRow.createSpan({ text: '页面大小：', cls: 'cr-report-option-label' });

		const pageSizeSelect = pageSizeRow.createEl('select', { cls: 'cr-report-select' });
		for (const size of ['A4', 'LETTER']) {
			const option = pageSizeSelect.createEl('option', {
				value: size,
				text: size
			});
			if (size === this.formData.pdfPageSize) option.selected = true;
		}

		pageSizeSelect.addEventListener('change', () => {
			this.formData.pdfPageSize = pageSizeSelect.value as 'A4' | 'LETTER';
		});

		// Date format
		const dateFormatRow = section.createDiv({ cls: 'cr-report-option-row' });
		dateFormatRow.createSpan({ text: '日期格式：', cls: 'cr-report-option-label' });

		const dateFormatSelect = dateFormatRow.createEl('select', { cls: 'cr-report-select' });
		const dateFormats: { value: 'mdy' | 'dmy' | 'ymd'; label: string }[] = [
			{ value: 'mdy', label: 'MM/DD/YYYY' },
			{ value: 'dmy', label: 'DD/MM/YYYY' },
			{ value: 'ymd', label: 'YYYY-MM-DD' }
		];
		for (const format of dateFormats) {
			const option = dateFormatSelect.createEl('option', {
				value: format.value,
				text: format.label
			});
			if (format.value === this.formData.pdfDateFormat) option.selected = true;
		}

		dateFormatSelect.addEventListener('change', () => {
			this.formData.pdfDateFormat = dateFormatSelect.value as 'mdy' | 'dmy' | 'ymd';
		});

		// Cover page
		this.renderToggleOption(section, '包含封面', this.formData.pdfIncludeCoverPage, (value) => {
			this.formData.pdfIncludeCoverPage = value;
			this.renderCurrentStep();
		});

		// Cover page details (if enabled)
		if (this.formData.pdfIncludeCoverPage) {
			const titleRow = section.createDiv({ cls: 'cr-report-option-row' });
			titleRow.createSpan({ text: '标题：', cls: 'cr-report-option-label' });

			const titleInput = titleRow.createEl('input', {
				type: 'text',
				cls: 'cr-report-input',
				value: this.formData.pdfCoverTitle,
				placeholder: this.getDefaultCoverTitle()
			});

			titleInput.addEventListener('input', (e) => {
				this.formData.pdfCoverTitle = (e.target as HTMLInputElement).value;
			});

			const subtitleRow = section.createDiv({ cls: 'cr-report-option-row' });
			subtitleRow.createSpan({ text: '副标题：', cls: 'cr-report-option-label' });

			const subtitleInput = subtitleRow.createEl('input', {
				type: 'text',
				cls: 'cr-report-input',
				value: this.formData.pdfCoverSubtitle,
				placeholder: '可选'
			});

			subtitleInput.addEventListener('input', (e) => {
				this.formData.pdfCoverSubtitle = (e.target as HTMLInputElement).value;
			});

			// Cover notes textarea
			const notesRow = section.createDiv({ cls: 'cr-report-option-row cr-report-option-row--vertical' });
			notesRow.createSpan({ text: '封面说明：', cls: 'cr-report-option-label' });

			const notesTextarea = notesRow.createEl('textarea', {
				cls: 'cr-report-textarea',
				value: this.formData.pdfCoverNotes,
				placeholder: '可选的献词、序言或说明…',
				attr: { rows: '3' }
			});
			notesTextarea.value = this.formData.pdfCoverNotes;

			notesTextarea.addEventListener('input', (e) => {
				this.formData.pdfCoverNotes = (e.target as HTMLTextAreaElement).value;
			});
		}

		// Table formatting options
		const tableSection = container.createDiv({ cls: 'cr-report-section' });
		tableSection.createEl('h4', { text: '表格格式', cls: 'cr-report-subsection-title' });

		this.renderToggleOption(
			tableSection,
			'保持表格行不拆分',
			this.formData.pdfTableKeepRowsTogether,
			(value) => {
				this.formData.pdfTableKeepRowsTogether = value;
			}
		);

		this.renderToggleOption(
			tableSection,
			'重复表格表头',
			this.formData.pdfTableRepeatHeaders,
			(value) => {
				this.formData.pdfTableRepeatHeaders = value;
			}
		);
	}

	/**
	 * Get default cover title
	 */
	private getDefaultCoverTitle(): string {
		if (!this.formData.reportType) return '报告';
		const reportMeta = REPORT_METADATA[this.formData.reportType];
		const subjectName = this.getSubjectDisplayName();
		if (subjectName) {
			return `${reportMeta.name}: ${subjectName}`;
		}
		return reportMeta.name;
	}

	/**
	 * Render ODT-specific options
	 */
	private renderOdtOptions(container: HTMLElement): void {
		const section = container.createDiv({ cls: 'cr-report-section' });
		section.createEl('h3', { text: 'ODT 选项', cls: 'cr-report-section-title' });

		// Cover page toggle
		this.renderToggleOption(section, '包含封面', this.formData.odtIncludeCoverPage, (value) => {
			this.formData.odtIncludeCoverPage = value;
			this.renderCurrentStep();
		});

		// Cover page details (if enabled)
		if (this.formData.odtIncludeCoverPage) {
			const titleRow = section.createDiv({ cls: 'cr-report-option-row' });
			titleRow.createSpan({ text: '标题：', cls: 'cr-report-option-label' });

			const titleInput = titleRow.createEl('input', {
				type: 'text',
				cls: 'cr-report-input',
				value: this.formData.odtCoverTitle,
				placeholder: this.getDefaultCoverTitle()
			});

			titleInput.addEventListener('input', (e) => {
				this.formData.odtCoverTitle = (e.target as HTMLInputElement).value;
			});

			const subtitleRow = section.createDiv({ cls: 'cr-report-option-row' });
			subtitleRow.createSpan({ text: '副标题：', cls: 'cr-report-option-label' });

			const subtitleInput = subtitleRow.createEl('input', {
				type: 'text',
				cls: 'cr-report-input',
				value: this.formData.odtCoverSubtitle,
				placeholder: '可选'
			});

			subtitleInput.addEventListener('input', (e) => {
				this.formData.odtCoverSubtitle = (e.target as HTMLInputElement).value;
			});

			// Cover notes textarea
			const notesRow = section.createDiv({ cls: 'cr-report-option-row cr-report-option-row--vertical' });
			notesRow.createSpan({ text: '封面说明：', cls: 'cr-report-option-label' });

			const notesTextarea = notesRow.createEl('textarea', {
				cls: 'cr-report-textarea',
				value: this.formData.odtCoverNotes,
				placeholder: '可选的献词、序言或说明…',
				attr: { rows: '3' }
			});
			notesTextarea.value = this.formData.odtCoverNotes;

			notesTextarea.addEventListener('input', (e) => {
				this.formData.odtCoverNotes = (e.target as HTMLTextAreaElement).value;
			});
		}
	}

	/**
	 * Render vault-specific options
	 */
	private renderVaultOptions(container: HTMLElement): void {
		const section = container.createDiv({ cls: 'cr-report-section' });
		section.createEl('h3', { text: '库选项', cls: 'cr-report-section-title' });

		const folderRow = section.createDiv({ cls: 'cr-report-option-row' });
		folderRow.createSpan({ text: '输出文件夹：', cls: 'cr-report-option-label' });

		const folderInput = folderRow.createEl('input', {
			type: 'text',
			cls: 'cr-report-input',
			value: this.formData.outputFolder,
			placeholder: '库根目录'
		});

		folderInput.addEventListener('input', (e) => {
			this.formData.outputFolder = (e.target as HTMLInputElement).value;
		});
	}

	// ========== FOOTER ==========

	/**
	 * Render the footer with navigation buttons
	 */
	private renderFooter(container: HTMLElement): void {
		const footer = container.createDiv({ cls: 'cr-report-wizard-footer' });

		// Left side: Cancel (step 0) or Back (steps 1-3)
		if (this.currentStep === 0) {
			const cancelBtn = footer.createEl('button', {
				cls: 'cr-btn',
				text: '取消'
			});
			cancelBtn.addEventListener('click', () => this.close());
		} else {
			const backBtn = footer.createEl('button', {
				cls: 'cr-btn'
			});
			backBtn.appendChild(createLucideIcon('chevron-left', 16));
			backBtn.appendText('上一步');
			backBtn.addEventListener('click', () => {
				this.currentStep--;
				this.renderCurrentStep();
			});
		}

		// Right side: Next or Generate
		const rightBtns = footer.createDiv({ cls: 'cr-report-footer-right' });

		if (this.currentStep < 3) {
			// Steps 0-2: Show Next button
			const nextBtn = rightBtns.createEl('button', {
				cls: 'cr-btn cr-btn--primary'
			});
			nextBtn.appendText('下一步');
			nextBtn.appendChild(createLucideIcon('arrow-right', 16));

			// Determine if Next should be enabled
			const canProceed = this.canProceedToNextStep();
			if (!canProceed) {
				nextBtn.addClass('cr-btn--disabled');
			} else {
				nextBtn.addEventListener('click', () => {
					this.currentStep++;
					this.renderCurrentStep();
				});
			}
		} else {
			// Step 3: Show Generate button
			const generateBtn = rightBtns.createEl('button', {
				cls: 'cr-btn cr-btn--primary'
			});
			generateBtn.appendText('生成');
			generateBtn.appendChild(createLucideIcon('file-text', 16));
			generateBtn.addEventListener('click', () => { void this.doGenerate(); });
		}
	}

	/**
	 * Check if we can proceed to the next step
	 */
	private canProceedToNextStep(): boolean {
		switch (this.currentStep) {
			case 0:
				// Step 1: Need report type and subject (if required)
				return this.formData.reportType !== null && this.isSubjectComplete();
			case 1:
				// Step 2: Format is always selected (has default)
				return true;
			case 2:
				// Step 3: Customize options are always valid
				return true;
			default:
				return false;
		}
	}

	/**
	 * Check if we can generate the report
	 */
	private canGenerate(): boolean {
		return this.formData.reportType !== null && this.isSubjectComplete();
	}

	/**
	 * Generate the report
	 */
	private async doGenerate(): Promise<void> {
		if (!this.formData.reportType) {
			new Notice('请选择报告类型');
			return;
		}

		// Check if this is a visual tree type - delegate to unified tree wizard
		if (this.isVisualTreeType(this.formData.reportType)) {
			this.close();
			this.openTreeWizard();
			return;
		}

		// Check if this is a timeline visual export (canvas/excalidraw)
		if (this.isTimelineReport() && this.isTimelineVisualFormat()) {
			await this.handleTimelineVisualExport();
			return;
		}

		try {
			// Build report options dynamically based on form data
			// The options object is built to match the specific report type's requirements
			const options = this.buildReportOptions();

			// Generate the report
			// Type assertion is safe because buildReportOptions constructs valid options for the selected report type
			const result = await this.reportService.generateReport(
				this.formData.reportType,
				options as unknown as Parameters<ReportGenerationService['generateReport']>[1]
			);

			if (!result.success) {
				new Notice(`报告生成失败：${result.error}`);
				return;
			}

			// Handle output based on format
			await this.handleOutput(result);

			// Close the wizard
			this.close();

			// Show success notice
			const formatName = this.formData.outputFormat.toUpperCase();
			new Notice(`${formatName} 报告生成成功`);

		} catch (error) {
			console.error('Report generation failed:', error);
			new Notice(`报告生成失败：${error instanceof Error ? error.message : '未知错误'}`);
		}
	}

	/**
	 * Check if current timeline format is a visual format (canvas/excalidraw)
	 */
	private isTimelineVisualFormat(): boolean {
		return this.formData.timelineFormat === 'canvas' ||
			this.formData.timelineFormat === 'excalidraw';
	}

	/**
	 * Handle visual timeline exports (Canvas/Excalidraw)
	 * These bypass the normal markdown generation and use dedicated exporters
	 */
	private async handleTimelineVisualExport(): Promise<void> {
		try {
			const options = this.buildReportOptions();

			let result: { success: boolean; path?: string; error?: string; warnings?: string[] };

			if (this.formData.timelineFormat === 'canvas') {
				result = await this.reportService.exportTimelineToCanvas(
					options as unknown as Parameters<ReportGenerationService['exportTimelineToCanvas']>[0]
				);
			} else {
				result = await this.reportService.exportTimelineToExcalidraw(
					options as unknown as Parameters<ReportGenerationService['exportTimelineToExcalidraw']>[0]
				);
			}

			if (!result.success) {
				new Notice(`导出失败：${result.error || '未知错误'}`);
				return;
			}

			// Show any warnings
			if (result.warnings?.length) {
				for (const warning of result.warnings) {
					new Notice(warning, 8000);
				}
			}

			// Close the wizard
			this.close();

			// Show success notice
			const formatName = this.formData.timelineFormat === 'canvas' ? 'Canvas' : 'Excalidraw';
			new Notice(`${formatName} 时间轴已导出到 ${result.path}`);

			// Open the created file
			if (result.path) {
				const file = this.plugin.app.vault.getAbstractFileByPath(result.path);
				if (file) {
					void this.plugin.app.workspace.getLeaf(false).openFile(file as import('obsidian').TFile);
				}
			}

		} catch (error) {
			console.error('Visual timeline export failed:', error);
			new Notice(`导出失败：${error instanceof Error ? error.message : '未知错误'}`);
		}
	}

	/**
	 * Check if report type is a visual tree
	 */
	private isVisualTreeType(reportType: ReportType): boolean {
		return reportType === 'pedigree-tree-pdf' ||
			reportType === 'descendant-tree-pdf' ||
			reportType === 'hourglass-tree-pdf' ||
			reportType === 'fan-chart-pdf';
	}

	/**
	 * Check if current report type is a timeline report
	 */
	private isTimelineReport(): boolean {
		return this.formData.reportType === 'timeline-report';
	}

	/**
	 * Open the tree wizard for visual tree reports
	 */
	private openTreeWizard(): void {
		// Map report types to UnifiedTreeWizardModal tree types
		const treeTypeMap: Record<string, 'full' | 'ancestors' | 'descendants' | 'fan'> = {
			'pedigree-tree-pdf': 'ancestors',
			'descendant-tree-pdf': 'descendants',
			'hourglass-tree-pdf': 'full',
			'fan-chart-pdf': 'fan'
		};

		const wizard = new UnifiedTreeWizardModal(this.plugin, {
			outputFormat: 'pdf',
			treeType: treeTypeMap[this.formData.reportType!],
			personCrId: this.formData.subject.personCrId,
			personName: this.formData.subject.personName
		});
		wizard.open();
	}

	/**
	 * Build report options from form data
	 * Returns ReportOptions with additional properties based on report type
	 */
	private buildReportOptions(): ReportOptions & Record<string, unknown> {
		const options: ReportOptions & Record<string, unknown> = {
			outputMethod: this.formData.outputFormat === 'md' ? 'download' : this.formData.outputFormat,
			outputFolder: this.formData.outputFolder,
			filename: this.formData.filename,
			includeSources: this.formData.includeSources
		};

		// Add subject based on report type
		const reportMeta = REPORT_METADATA[this.formData.reportType!];

		// Special case for research-report-export
		if (this.formData.reportType === 'research-report-export') {
			options.notePath = this.formData.subject.notePath;
		} else {
			switch (reportMeta.entityType) {
				case 'person':
					options.personCrId = this.formData.subject.personCrId;
					options.rootPersonCrId = this.formData.subject.personCrId;
					break;
				case 'place':
					options.placeCrId = this.formData.subject.placeCrId;
					break;
				case 'universe':
					options.universeCrId = this.formData.subject.universeCrId;
					break;
				case 'collection':
					options.collectionId = this.formData.subject.collectionId;
					break;
			}
		}

		// Add report-specific options
		options.includeSpouses = this.formData.includeSpouses;
		options.includeDetails = this.formData.includeDetails;
		options.includeChildren = this.formData.includeChildren;
		options.maxGenerations = this.formData.maxGenerations;

		// Add brick-wall-specific options
		if (this.formData.reportType === 'brick-wall-report') {
			options.sortBy = this.formData.brickWallSortBy;
		}

		// Add kinship-specific options
		if (this.formData.reportType === 'kinship-report') {
			options.maxDegree = this.formData.kinshipMaxDegree;
			options.sortBy = this.formData.kinshipSortBy;
		}

		// Add gaps-report-specific options
		if (this.formData.reportType === 'gaps-report') {
			options.fieldsToCheck = this.formData.gapsFieldsToCheck;
			options.maxItemsPerCategory = this.formData.gapsMaxItemsPerCategory;
			options.researchLevelMax = this.formData.gapsResearchLevelMax;
			options.includeUnassessed = this.formData.gapsIncludeUnassessed;
			options.sortByResearchLevel = this.formData.gapsSortByResearchLevel;
		}

		// Add timeline-specific options
		if (this.isTimelineReport()) {
			this.addTimelineOptions(options);
		}

		return options;
	}

	/**
	 * Add timeline-specific options to report options
	 */
	private addTimelineOptions(options: ReportOptions & Record<string, unknown>): void {
		// Core timeline options
		options.format = this.formData.timelineFormat;
		options.grouping = this.formData.timelineGrouping;
		options.includeDescriptions = this.formData.timelineIncludeDescriptions;

		// Filters
		if (this.formData.timelineDateFrom) {
			options.dateFrom = this.formData.timelineDateFrom;
		}
		if (this.formData.timelineDateTo) {
			options.dateTo = this.formData.timelineDateTo;
		}
		if (this.formData.timelineEventTypes.length > 0) {
			options.eventTypes = this.formData.timelineEventTypes;
		} else {
			options.eventTypes = [];
		}
		if (this.formData.timelinePersonFilter.length > 0) {
			options.personFilter = this.formData.timelinePersonFilter;
		} else {
			options.personFilter = [];
		}
		if (this.formData.timelinePlaceFilter.length > 0) {
			options.placeFilter = this.formData.timelinePlaceFilter;
		} else {
			options.placeFilter = [];
		}
		options.includeChildPlaces = this.formData.timelineIncludeChildPlaces;
		if (this.formData.timelineGroupFilter) {
			options.groupFilter = this.formData.timelineGroupFilter;
		}

		// Canvas/Excalidraw options
		if (this.formData.timelineFormat === 'canvas' || this.formData.timelineFormat === 'excalidraw') {
			options.canvasOptions = {
				layoutStyle: this.formData.timelineLayoutStyle,
				colorScheme: this.formData.timelineColorScheme,
				includeOrderingEdges: this.formData.timelineIncludeOrderingEdges
			};
		}

		// Excalidraw-specific options
		if (this.formData.timelineFormat === 'excalidraw') {
			options.excalidrawOptions = {
				layoutStyle: this.formData.timelineLayoutStyle,
				colorScheme: this.formData.timelineColorScheme,
				includeOrderingEdges: this.formData.timelineIncludeOrderingEdges,
				drawingStyle: this.formData.excalidrawDrawingStyle,
				fontFamily: this.formData.excalidrawFontFamily,
				strokeWidth: this.formData.excalidrawStrokeWidth
			};
		}

		// Callout options
		if (this.formData.timelineFormat === 'markdown_callout') {
			options.calloutOptions = {
				calloutType: this.formData.timelineCalloutType
			};
		}
	}

	/**
	 * Handle output based on format
	 */
	private async handleOutput(result: ReportResult): Promise<void> {
		const filename = `${this.formData.filename}.${this.getFileExtension()}`;

		switch (this.formData.outputFormat) {
			case 'pdf':
				// Cast to specific result type for PDF rendering
				await this.generatePdf(result as SpecificReportResult);
				break;

			case 'odt':
				// Cast to specific result type for ODT rendering
				await this.generateOdt(result as SpecificReportResult);
				break;

			case 'md':
				this.reportService.downloadReport(result.content, filename);
				break;

			case 'vault':
				// Already saved by report service
				break;
		}
	}

	/**
	 * Generate PDF from result
	 */
	private async generatePdf(result: SpecificReportResult): Promise<void> {
		const pdfOptions = {
			pageSize: this.formData.pdfPageSize,
			fontStyle: 'serif' as const,
			dateFormat: this.formData.pdfDateFormat,
			includeCoverPage: this.formData.pdfIncludeCoverPage,
			customTitle: this.formData.pdfCoverTitle || undefined,
			customSubtitle: this.formData.pdfCoverSubtitle || undefined,
			coverNotes: this.formData.pdfCoverNotes || undefined,
			tableKeepRowsTogether: this.formData.pdfTableKeepRowsTogether,
			tableRepeatHeaders: this.formData.pdfTableRepeatHeaders
		};

		// Use appropriate renderer based on report type
		switch (this.formData.reportType) {
			case 'family-group-sheet':
				await this.pdfRenderer.renderFamilyGroupSheet(result as FamilyGroupSheetResult, pdfOptions);
				break;
			case 'individual-summary':
				await this.pdfRenderer.renderIndividualSummary(result as IndividualSummaryResult, pdfOptions);
				break;
			case 'ahnentafel':
				await this.pdfRenderer.renderAhnentafel(result as AhnentafelResult, pdfOptions);
				break;
			case 'gaps-report':
				await this.pdfRenderer.renderGapsReport(result as GapsReportResult, pdfOptions);
				break;
			case 'register-report':
				await this.pdfRenderer.renderRegisterReport(result as RegisterReportResult, pdfOptions);
				break;
			case 'pedigree-chart':
				await this.pdfRenderer.renderPedigreeChart(result as PedigreeChartResult, pdfOptions);
				break;
			case 'descendant-chart':
				await this.pdfRenderer.renderDescendantChart(result as DescendantChartResult, pdfOptions);
				break;
			case 'source-summary':
				await this.pdfRenderer.renderSourceSummary(result as SourceSummaryResult, pdfOptions);
				break;
			case 'timeline-report':
				await this.pdfRenderer.renderTimelineReport(result as TimelineReportResult, pdfOptions);
				break;
			case 'place-summary':
				await this.pdfRenderer.renderPlaceSummary(result as PlaceSummaryResult, pdfOptions);
				break;
			case 'media-inventory':
				await this.pdfRenderer.renderMediaInventory(result as MediaInventoryResult, pdfOptions);
				break;
			case 'universe-overview':
				await this.pdfRenderer.renderUniverseOverview(result as UniverseOverviewResult, pdfOptions);
				break;
			case 'collection-overview':
				await this.pdfRenderer.renderCollectionOverview(result as CollectionOverviewResult, pdfOptions);
				break;
			case 'research-report-export':
				await this.pdfRenderer.renderResearchReport(
					result as ResearchReportExportResult,
					result.content,
					pdfOptions
				);
				break;
			case 'brick-wall-report':
				await this.pdfRenderer.renderBrickWallReport(result as BrickWallReportResult, pdfOptions);
				break;
			case 'unconnected-people':
				await this.pdfRenderer.renderUnconnectedPeople(result as UnconnectedPeopleResult, pdfOptions);
				break;
			case 'kinship-report':
				await this.pdfRenderer.renderKinshipReport(result as KinshipReportResult, pdfOptions);
				break;
			default:
				throw new Error(`PDF rendering not supported for report type: ${this.formData.reportType}`);
		}
	}

	/**
	 * Generate ODT from result
	 */
	private async generateOdt(result: SpecificReportResult): Promise<void> {
		const odtOptions = {
			title: this.formData.odtCoverTitle || this.getDefaultCoverTitle(),
			subtitle: this.formData.odtCoverSubtitle || (this.formData.subject.personName
				? `Report for ${this.formData.subject.personName}`
				: undefined),
			includeCoverPage: this.formData.odtIncludeCoverPage,
			coverNotes: this.formData.odtCoverNotes || undefined
		};

		const blob = await this.odtGenerator.generate(result.content, odtOptions);
		OdtGenerator.download(blob, `${this.formData.filename}.odt`);
	}
}

/**
 * Simple picker modal for research report notes
 */
class ResearchReportPickerModal extends Modal {
	private reports: { path: string; name: string }[];
	private onSelect: (report: { path: string; name: string }) => void;
	private searchQuery: string = '';
	private filteredReports: { path: string; name: string }[] = [];
	private listContainer?: HTMLElement;

	constructor(
		app: import('obsidian').App,
		reports: { path: string; name: string }[],
		onSelect: (report: { path: string; name: string }) => void
	) {
		super(app);
		this.reports = reports;
		this.filteredReports = [...reports];
		this.onSelect = onSelect;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('cr-research-report-picker');

		// Header
		const header = contentEl.createDiv({ cls: 'cr-report-picker-header' });
		header.createEl('h3', { text: '选择研究报告' });

		// Search
		const searchRow = contentEl.createDiv({ cls: 'cr-report-picker-search' });
		const searchInput = searchRow.createEl('input', {
			type: 'text',
			placeholder: '搜索报告…',
			cls: 'cr-report-picker-search-input'
		});
		searchInput.addEventListener('input', (e) => {
			this.searchQuery = (e.target as HTMLInputElement).value.toLowerCase();
			this.filterReports();
			this.renderList();
		});

		// List container
		this.listContainer = contentEl.createDiv({ cls: 'cr-report-picker-list' });
		this.renderList();
	}

	private filterReports(): void {
		if (!this.searchQuery) {
			this.filteredReports = [...this.reports];
			return;
		}
		this.filteredReports = this.reports.filter(r =>
			r.name.toLowerCase().includes(this.searchQuery) ||
			r.path.toLowerCase().includes(this.searchQuery)
		);
	}

	private renderList(): void {
		if (!this.listContainer) return;
		this.listContainer.empty();

		if (this.filteredReports.length === 0) {
			this.listContainer.createDiv({
				cls: 'cr-report-picker-empty',
				text: this.searchQuery ? '未找到匹配的报告' : '暂无研究报告'
			});
			return;
		}

		for (const report of this.filteredReports) {
			const item = this.listContainer.createDiv({ cls: 'cr-report-picker-item' });

			const icon = createLucideIcon('file-text', 16);
			item.appendChild(icon);

			const textContainer = item.createDiv({ cls: 'cr-report-picker-item-text' });
			textContainer.createDiv({ cls: 'cr-report-picker-item-name', text: report.name });
			textContainer.createDiv({ cls: 'cr-report-picker-item-path', text: report.path });

			item.addEventListener('click', () => {
				this.onSelect(report);
				this.close();
			});
		}
	}

	onClose(): void {
		const { contentEl } = this;
		contentEl.empty();
	}
}

/**
 * Simple fuzzy picker for universes (#369)
 */
class UniversePickerModal extends FuzzySuggestModal<{ crId: string; name: string }> {
	private items: { crId: string; name: string }[];
	private onChoose: (item: { crId: string; name: string }) => void;

	constructor(
		app: import('obsidian').App,
		items: { crId: string; name: string }[],
		onChoose: (item: { crId: string; name: string }) => void
	) {
		super(app);
		this.items = items;
		this.onChoose = onChoose;
		this.setPlaceholder('选择宇宙');
	}

	getItems(): { crId: string; name: string }[] {
		return this.items;
	}

	getItemText(item: { crId: string; name: string }): string {
		return item.name;
	}

	onChooseItem(item: { crId: string; name: string }): void {
		this.onChoose(item);
	}
}

/**
 * Simple fuzzy picker for collections (#369)
 */
class CollectionPickerModal extends FuzzySuggestModal<string> {
	private items: string[];
	private onChoose: (item: string) => void;

	constructor(
		app: import('obsidian').App,
		items: string[],
		onChoose: (item: string) => void
	) {
		super(app);
		this.items = items;
		this.onChoose = onChoose;
		this.setPlaceholder('选择合集');
	}

	getItems(): string[] {
		return this.items;
	}

	getItemText(item: string): string {
		return item;
	}

	onChooseItem(item: string): void {
		this.onChoose(item);
	}
}

/* eslint-enable @typescript-eslint/no-unsafe-assignment -- Match scope of file-level disable at top. */
