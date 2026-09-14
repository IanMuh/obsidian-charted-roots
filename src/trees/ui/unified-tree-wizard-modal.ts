/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument -- Obsidian API returns any-typed surfaces (frontmatter, file caches, plugin state); project policy accepts these. */
/**
 * Unified Tree Wizard Modal
 *
 * A multi-step wizard that combines canvas tree generation and PDF visual tree
 * generation into a single unified experience. Users select a person, tree type,
 * output format, and format-specific options before generating.
 *
 * Step flow:
 * 1. Person Selection (shared)
 * 2. Tree Type (shared)
 * 3. Output Format (canvas vs PDF)
 * 4a. Canvas Options → 5a. Canvas Preview → 6a. Canvas Output
 * 4b. PDF Options → 5b. PDF Output
 */

import { Modal, Setting, Notice, TFile, setIcon, normalizePath } from 'obsidian';
import type CanvasRootsPlugin from '../../../main';
import { createLucideIcon, setLucideIcon, LucideIconName } from '../../ui/lucide-icons';
import type { PersonInfo } from '../../ui/person-picker';
import { TreePreviewRenderer } from '../../ui/tree-preview';
import { FamilyGraphService, TreeOptions } from '../../core/family-graph';
import { CanvasGenerator, CanvasGenerationOptions } from '../../core/canvas-generator';
import { createPrivacyService } from '../../core/privacy-service';
import type { LayoutOptions } from '../../core/layout-engine';
import type { CanvasColor, ColorScheme, CanvasGroupingStrategy, LayoutType, RecentTreeInfo } from '../../settings';
import { ensureFolderExists } from '../../core/canvas-utils';
import { getLogger } from '../../core/logging';
import { isPersonNote } from '../../utils/note-type-detection';
import { VisualTreeService } from '../services/visual-tree-service';
import { VisualTreeSvgRenderer } from '../services/visual-tree-svg-renderer';
import { PdfReportRenderer } from '../../reports/services/pdf-report-renderer';
import { OdtGenerator } from '../../reports/services/odt-generator';
import type {
	VisualTreeOptions,
	VisualTreePageSize,
	VisualTreeOrientation,
	VisualTreeNodeContent,
	VisualTreeColorScheme,
	LargeTreeHandling,
	TreeSizeAnalysis
} from '../types/visual-tree-types';

import { getSpouseLabel, getSpouseCompoundLabel } from '../../utils/terminology';

const logger = getLogger('unified-tree-wizard');

/**
 * Wizard step identifiers
 */
type WizardStep =
	| 'person'
	| 'tree-type'
	| 'output-format'
	| 'canvas-options'
	| 'canvas-preview'
	| 'canvas-output'
	| 'excalidraw-style'
	| 'pdf-options'
	| 'pdf-output';

/**
 * Step configuration
 */
interface StepConfig {
	id: WizardStep;
	title: string;
	subtitle: string;
}

/**
 * All possible steps - actual flow depends on output format selection
 */
const ALL_STEPS: StepConfig[] = [
	{ id: 'person', title: '选择人物', subtitle: '选择根人物' },
	{ id: 'tree-type', title: '树类型', subtitle: '配置树结构' },
	{ id: 'output-format', title: '输出格式', subtitle: '画布或 PDF' },
	{ id: 'canvas-options', title: '选项', subtitle: '范围与样式设置' },
	{ id: 'canvas-preview', title: '预览', subtitle: '查看你的树' },
	{ id: 'canvas-output', title: '输出', subtitle: '保存位置' },
	{ id: 'excalidraw-style', title: '样式', subtitle: '绘制选项' },
	{ id: 'pdf-options', title: '选项', subtitle: '页面与样式设置' },
	{ id: 'pdf-output', title: '生成', subtitle: '创建 PDF' }
];

/**
 * Tree type options (unified across canvas and PDF)
 */
type TreeType = 'full' | 'ancestors' | 'descendants' | 'fan';

/**
 * Layout algorithm options (canvas only)
 */
type LayoutAlgorithm = 'standard' | 'compact' | 'timeline' | 'hourglass';

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

/**
 * Output format
 */
type OutputFormat = 'canvas' | 'excalidraw' | 'pdf' | 'odt';

/**
 * Unified form data for the wizard
 */
interface UnifiedWizardFormData {
	// Step 1: Person
	rootPerson: PersonInfo | null;

	// Step 2: Tree Type
	treeType: TreeType;
	direction: 'vertical' | 'horizontal';
	maxAncestorGenerations: number;
	maxDescendantGenerations: number;
	includeSpouses: boolean;

	// Step 3: Output Format
	outputFormat: OutputFormat;

	// Canvas-specific (Step 4a)
	includeStepParents: boolean;
	includeAdoptiveParents: boolean;
	collectionFilter: string;
	placeFilter: string;
	placeFilterTypes: Set<'birth' | 'death' | 'marriage' | 'burial'>;
	universeFilter: string;
	colorScheme: ColorScheme;
	parentChildArrowStyle: 'directed' | 'bidirectional' | 'undirected';
	spouseArrowStyle: 'directed' | 'bidirectional' | 'undirected';
	parentChildEdgeColor: CanvasColor;
	spouseEdgeColor: CanvasColor;
	showSpouseEdges: boolean;
	spouseEdgeLabelFormat: 'none' | 'date-only' | 'date-location' | 'full';
	layoutAlgorithm: LayoutAlgorithm;
	canvasGroupingStrategy: CanvasGroupingStrategy;
	applyCanvasPrivacy: boolean;
	canvasPrivacyFormat: 'text' | 'file';

	// PDF-specific (Step 4b)
	pageSize: VisualTreePageSize;
	orientation: VisualTreeOrientation;
	nodeContent: VisualTreeNodeContent;
	pdfColorScheme: VisualTreeColorScheme;
	largeTreeHandling: LargeTreeHandling;

	// Excalidraw-specific
	excalidrawRoughness: 0 | 1 | 2;
	excalidrawFontFamily: 1 | 2 | 3 | 4 | 5 | 6 | 7;
	excalidrawFontSize: number;
	excalidrawStrokeWidth: number;
	excalidrawFillStyle: 'solid' | 'hachure' | 'cross-hatch';
	excalidrawStrokeStyle: 'solid' | 'dashed' | 'dotted';
	excalidrawNodeContent: 'name' | 'name-dates' | 'name-dates-places';

	// Output settings
	canvasName: string;
	saveFolder: string;
	openAfterGenerate: boolean;
	pdfTitle: string;
}

/**
 * Options for opening the unified wizard
 */
export interface UnifiedTreeWizardOptions {
	/** Pre-selected output format */
	outputFormat?: OutputFormat;
	/** Pre-selected tree type */
	treeType?: TreeType;
	/** Pre-selected person CR ID */
	personCrId?: string;
	/** Pre-selected person name */
	personName?: string;
	/** Callback when generation completes */
	onComplete?: (path: string) => void;
}

/**
 * Unified Tree Wizard Modal
 */
export class UnifiedTreeWizardModal extends Modal {
	private plugin: CanvasRootsPlugin;
	private options: UnifiedTreeWizardOptions;
	private currentStepIndex: number = 0;

	// Form data
	private formData: UnifiedWizardFormData;

	// Services
	private graphService: FamilyGraphService;
	private visualTreeService: VisualTreeService;
	private pdfRenderer: PdfReportRenderer;

	// UI elements
	private contentContainer?: HTMLElement;
	private progressContainer?: HTMLElement;
	private previewRenderer?: TreePreviewRenderer;
	private previewContainer?: HTMLElement;

	// Person list for Step 1
	private allPeople: PersonInfo[] = [];
	private filteredPeople: PersonInfo[] = [];
	private searchQuery: string = '';
	private sortOption: PersonSortOption = 'name-asc';
	private filterOptions: PersonFilterOptions = {
		sex: 'all',
		hasConnections: false
	};
	private personListContainer?: HTMLElement;
	private personStepContainer?: HTMLElement;

	// PDF tree size analysis
	private treeSizeAnalysis: TreeSizeAnalysis | null = null;

	// Pre-selected person (resolved in onOpen)
	private preSelectedPersonCrId?: string;

	constructor(plugin: CanvasRootsPlugin, options?: UnifiedTreeWizardOptions) {
		super(plugin.app);
		this.plugin = plugin;
		this.options = options ?? {};

		// Initialize services
		this.graphService = plugin.createFamilyGraphService();

		this.visualTreeService = new VisualTreeService(plugin.app, this.graphService);
		this.pdfRenderer = new PdfReportRenderer();

		// Initialize form data with defaults
		this.formData = {
			rootPerson: null,
			treeType: options?.treeType ?? 'full',
			direction: 'vertical',
			maxAncestorGenerations: 0,
			maxDescendantGenerations: 0,
			includeSpouses: true,
			outputFormat: options?.outputFormat ?? 'canvas',

			// Canvas defaults
			includeStepParents: true,
			includeAdoptiveParents: true,
			collectionFilter: '',
			placeFilter: '',
			placeFilterTypes: new Set(['birth', 'death']),
			universeFilter: '',
			colorScheme: plugin.settings.nodeColorScheme,
			parentChildArrowStyle: plugin.settings.parentChildArrowStyle,
			spouseArrowStyle: plugin.settings.spouseArrowStyle,
			parentChildEdgeColor: plugin.settings.parentChildEdgeColor,
			spouseEdgeColor: plugin.settings.spouseEdgeColor,
			showSpouseEdges: plugin.settings.showSpouseEdges,
			spouseEdgeLabelFormat: plugin.settings.spouseEdgeLabelFormat,
			layoutAlgorithm: plugin.settings.defaultLayoutType as LayoutAlgorithm,
			canvasGroupingStrategy: plugin.settings.canvasGroupingStrategy,
			applyCanvasPrivacy: plugin.settings.enablePrivacyProtection,
			canvasPrivacyFormat: 'text',

			// PDF defaults
			pageSize: 'letter',
			orientation: 'landscape',
			nodeContent: 'name-dates',
			pdfColorScheme: 'gender',
			largeTreeHandling: 'auto-page-size',

			// Excalidraw defaults
			excalidrawRoughness: 1,
			excalidrawFontFamily: 1,
			excalidrawFontSize: 16,
			excalidrawStrokeWidth: 2,
			excalidrawFillStyle: 'solid',
			excalidrawStrokeStyle: 'solid',
			excalidrawNodeContent: 'name-dates-places',

			// Output defaults
			canvasName: 'Family Tree',
			saveFolder: plugin.settings.canvasesFolder || '',
			openAfterGenerate: true,
			pdfTitle: ''
		};

		// Pre-selected person will be resolved in onOpen after loadPeople()
		this.preSelectedPersonCrId = options?.personCrId;
	}

	/**
	 * Find a person file by cr_id
	 */
	private findPersonFileByCrId(crId: string): TFile | null {
		const files = this.app.vault.getMarkdownFiles();
		for (const file of files) {
			const cache = this.app.metadataCache.getFileCache(file);
			if (cache?.frontmatter?.cr_id === crId) {
				return file;
			}
		}
		return null;
	}

	/**
	 * Get the current step flow based on output format
	 */
	private getStepFlow(): StepConfig[] {
		const baseSteps = ALL_STEPS.filter(s => ['person', 'tree-type', 'output-format'].includes(s.id));

		if (this.formData.outputFormat === 'excalidraw') {
			// Excalidraw has an extra style step
			return [
				...baseSteps,
				ALL_STEPS.find(s => s.id === 'canvas-options')!,
				ALL_STEPS.find(s => s.id === 'canvas-preview')!,
				ALL_STEPS.find(s => s.id === 'excalidraw-style')!,
				ALL_STEPS.find(s => s.id === 'canvas-output')!
			];
		} else if (this.formData.outputFormat === 'canvas') {
			// Canvas flow
			return [
				...baseSteps,
				ALL_STEPS.find(s => s.id === 'canvas-options')!,
				ALL_STEPS.find(s => s.id === 'canvas-preview')!,
				ALL_STEPS.find(s => s.id === 'canvas-output')!
			];
		} else {
			// PDF and ODT share the same options step
			return [
				...baseSteps,
				ALL_STEPS.find(s => s.id === 'pdf-options')!,
				ALL_STEPS.find(s => s.id === 'pdf-output')!
			];
		}
	}

	/**
	 * Get the current step config
	 */
	private getCurrentStep(): StepConfig {
		const flow = this.getStepFlow();
		return flow[this.currentStepIndex];
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		this.modalEl.addClass('crc-tree-wizard');
		this.modalEl.addClass('crc-unified-wizard');

		// Header
		const header = contentEl.createDiv({ cls: 'cr-wizard-header' });
		const titleContainer = header.createDiv({ cls: 'cr-wizard-title' });
		const icon = createLucideIcon('git-branch', 24);
		titleContainer.appendChild(icon);
		titleContainer.appendText('生成家谱');

		// Progress indicator
		this.progressContainer = contentEl.createDiv({ cls: 'cr-wizard-progress' });
		this.renderProgress();

		// Content area
		this.contentContainer = contentEl.createDiv({ cls: 'cr-wizard-content' });

		// Load people for Step 1
		this.loadPeople();

		// Apply pre-selected person if provided
		if (this.preSelectedPersonCrId) {
			const person = this.allPeople.find(p => p.crId === this.preSelectedPersonCrId);
			if (person) {
				this.formData.rootPerson = person;
			}
		}

		this.renderCurrentStep();
	}

	onClose(): void {
		this.contentEl.empty();
		if (this.previewRenderer) {
			this.previewRenderer = undefined;
		}
	}

	/**
	 * Load all people from the vault
	 */
	private loadPeople(): void {
		const files = this.app.vault.getMarkdownFiles();
		this.allPeople = [];

		for (const file of files) {
			const cache = this.app.metadataCache.getFileCache(file);
			if (!cache?.frontmatter?.cr_id) continue;

			const fm = cache.frontmatter;

			if (!isPersonNote(fm, cache)) {
				continue;
			}

			const rawName = fm.name;
			const name = typeof rawName === 'string' ? rawName : (Array.isArray(rawName) ? rawName.join(' ') : file.basename);

			// Note: Frontmatter uses 'born'/'died' properties
			const birthDate = fm.born instanceof Date ? fm.born.toISOString().split('T')[0] : fm.born;
			const deathDate = fm.died instanceof Date ? fm.died.toISOString().split('T')[0] : fm.died;

			this.allPeople.push({
				name,
				crId: fm.cr_id,
				birthDate,
				deathDate,
				sex: fm.sex,
				file
			});
		}

		this.applyFiltersAndSort();
	}

	/**
	 * Render the progress indicator
	 */
	private renderProgress(): void {
		if (!this.progressContainer) return;
		this.progressContainer.empty();

		const flow = this.getStepFlow();
		const stepsContainer = this.progressContainer.createDiv({ cls: 'cr-wizard-steps' });

		for (let i = 0; i < flow.length; i++) {
			const step = flow[i];
			const stepEl = stepsContainer.createDiv({
				cls: `cr-wizard-step ${i === this.currentStepIndex ? 'cr-wizard-step--active' : ''} ${i < this.currentStepIndex ? 'cr-wizard-step--completed' : ''}`
			});

			const stepNumber = stepEl.createDiv({ cls: 'cr-wizard-step-number' });
			if (i < this.currentStepIndex) {
				setLucideIcon(stepNumber, 'check', 14);
			} else {
				stepNumber.setText(String(i + 1));
			}

			const stepInfo = stepEl.createDiv({ cls: 'cr-wizard-step-info' });
			stepInfo.createDiv({ cls: 'cr-wizard-step-title', text: step.title });

			if (i < flow.length - 1) {
				stepsContainer.createDiv({
					cls: `cr-wizard-connector ${i < this.currentStepIndex ? 'cr-wizard-connector--completed' : ''}`
				});
			}
		}
	}

	/**
	 * Render the current step content
	 */
	private renderCurrentStep(): void {
		if (!this.contentContainer) return;
		this.contentContainer.empty();

		const step = this.getCurrentStep();
		const flow = this.getStepFlow();

		// Step header
		const stepHeader = this.contentContainer.createDiv({ cls: 'cr-wizard-step-header' });

		// Show badges for selections made in previous steps
		const badgeContainer = stepHeader.createDiv({ cls: 'cr-wizard-step-badges' });

		// Show tree type badge after step 2 (tree-type)
		if (this.currentStepIndex >= 2) {
			const treeTypeBadge = badgeContainer.createDiv({ cls: 'crc-wizard-chart-badge' });
			treeTypeBadge.createSpan({
				text: this.formData.outputFormat === 'pdf'
					? this.getPdfChartTypeLabel()
					: this.getTreeTypeLabel()
			});
		}

		// Show output format badge after step 3 (output-format)
		if (this.currentStepIndex >= 3) {
			const formatBadge = badgeContainer.createDiv({ cls: 'crc-wizard-chart-badge crc-wizard-chart-badge--secondary' });
			formatBadge.createSpan({
				text: this.getOutputFormatLabel()
			});
		}

		stepHeader.createEl('h3', { text: step.title, cls: 'cr-wizard-step-heading' });
		stepHeader.createEl('p', { text: `第${this.currentStepIndex + 1}步，共${flow.length}步`, cls: 'cr-wizard-step-counter' });

		// Step content
		const stepContent = this.contentContainer.createDiv({ cls: 'cr-wizard-step-content' });

		switch (step.id) {
			case 'person':
				this.renderPersonStep(stepContent);
				break;
			case 'tree-type':
				this.renderTreeTypeStep(stepContent);
				break;
			case 'output-format':
				this.renderOutputFormatStep(stepContent);
				break;
			case 'canvas-options':
				this.renderCanvasOptionsStep(stepContent);
				break;
			case 'canvas-preview':
				this.renderCanvasPreviewStep(stepContent);
				break;
			case 'canvas-output':
				this.renderCanvasOutputStep(stepContent);
				break;
			case 'excalidraw-style':
				this.renderExcalidrawStyleStep(stepContent);
				break;
			case 'pdf-options':
				this.renderPdfOptionsStep(stepContent);
				break;
			case 'pdf-output':
				this.renderPdfOutputStep(stepContent);
				break;
		}

		this.renderNavigation();
	}

	// ========== STEP 1: PERSON SELECTION ==========

	private renderPersonStep(container: HTMLElement): void {
		container.createEl('p', {
			text: '选择将位于家谱中心的人物。',
			cls: 'cr-wizard-step-desc'
		});

		// Selected person display
		if (this.formData.rootPerson) {
			const selectedContainer = container.createDiv({ cls: 'crc-wizard-selected-person' });
			this.renderSelectedPerson(selectedContainer);
		}

		// Store container reference for use by event handlers after re-renders
		this.personStepContainer = container;

		// Toolbar row
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

		// Store list container reference as instance property
		this.personListContainer = container.createDiv({ cls: 'crc-wizard-person-results' });

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

		// Filter row
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
		connectionsLabel.appendText('有家族关联');

		connectionsCheckbox.addEventListener('change', () => {
			this.filterOptions.hasConnections = connectionsCheckbox.checked;
			this.applyFiltersAndSort();
			this.refreshPersonList();
		});

		// Results count
		const resultsCount = container.createDiv({ cls: 'crc-wizard-results-count' });
		resultsCount.createSpan({ text: `${this.filteredPeople.length} / ${this.allPeople.length} 人` });

		this.renderPersonList(this.personListContainer);
	}

	/**
	 * Refresh the person list using instance property references
	 * This ensures we always use the current DOM elements after re-renders
	 */
	private refreshPersonList(): void {
		if (this.personListContainer) {
			this.renderPersonList(this.personListContainer);
		}
		if (this.personStepContainer) {
			this.updateResultsCount(this.personStepContainer);
		}
	}

	/**
	 * Update the results count display
	 */
	private updateResultsCount(container: HTMLElement): void {
		const resultsDiv = container.querySelector('.crc-wizard-results-count');
		if (resultsDiv) {
			resultsDiv.empty();
			resultsDiv.createSpan({ text: `${this.filteredPeople.length} / ${this.allPeople.length} 人` });
		}
	}

	private renderSelectedPerson(container: HTMLElement): void {
		container.empty();
		const person = this.formData.rootPerson;
		if (!person) return;

		const card = container.createDiv({ cls: 'crc-wizard-selected-card' });
		card.appendChild(createLucideIcon('user', 20));

		const info = card.createDiv({ cls: 'crc-wizard-selected-info' });
		info.createDiv({ cls: 'crc-wizard-selected-name', text: person.name });

		const dates = this.formatDates(person.birthDate, person.deathDate);
		if (dates) {
			info.createDiv({ cls: 'crc-wizard-selected-dates', text: dates });
		}

		const clearBtn = card.createEl('button', {
			cls: 'crc-wizard-clear-btn',
			attr: { type: 'button', 'aria-label': '清除选择' }
		});
		setLucideIcon(clearBtn, 'x', 16);
		clearBtn.addEventListener('click', () => {
			this.formData.rootPerson = null;
			this.formData.canvasName = '';
			this.formData.pdfTitle = '';
			this.renderCurrentStep();
		});
	}

	private applyFiltersAndSort(): void {
		const query = this.searchQuery.toLowerCase().trim();
		let result = [...this.allPeople];

		if (query) {
			result = result.filter(p => p.name.toLowerCase().includes(query));
		}

		if (this.filterOptions.sex !== 'all') {
			result = result.filter(p => {
				const sex = p.sex?.toLowerCase();
				if (this.filterOptions.sex === 'male') return sex === 'm' || sex === 'male';
				if (this.filterOptions.sex === 'female') return sex === 'f' || sex === 'female';
				if (this.filterOptions.sex === 'unknown') return !sex || (sex !== 'm' && sex !== 'male' && sex !== 'f' && sex !== 'female');
				return true;
			});
		}

		if (this.filterOptions.hasConnections) {
			result = result.filter(p => {
				const cache = this.app.metadataCache.getFileCache(p.file);
				const fm = cache?.frontmatter;
				if (!fm) return false;
				return fm.father || fm.mother || fm.spouse || fm.spouses || fm.children || fm.siblings || fm.partners;
			});
		}

		result.sort((a, b) => {
			switch (this.sortOption) {
				case 'name-asc': return a.name.localeCompare(b.name);
				case 'name-desc': return b.name.localeCompare(a.name);
				case 'birth-asc': return this.compareDates(a.birthDate, b.birthDate, true);
				case 'birth-desc': return this.compareDates(a.birthDate, b.birthDate, false);
				default: return 0;
			}
		});

		this.filteredPeople = result;
	}

	private compareDates(dateA?: string, dateB?: string, ascending: boolean = true): number {
		if (!dateA && !dateB) return 0;
		if (!dateA) return 1;
		if (!dateB) return -1;

		const yearA = this.extractYear(dateA);
		const yearB = this.extractYear(dateB);

		if (yearA === null && yearB === null) return 0;
		if (yearA === null) return 1;
		if (yearB === null) return -1;

		return ascending ? yearA - yearB : yearB - yearA;
	}

	private extractYear(date: string): number | null {
		const match = date.match(/(\d{4})/);
		return match ? parseInt(match[1], 10) : null;
	}

	private renderPersonList(container: HTMLElement): void {
		container.empty();

		if (this.filteredPeople.length === 0) {
			container.createDiv({
				cls: 'crc-wizard-empty',
				text: this.searchQuery ? '没有人物匹配你的搜索。' : '库中未找到人物。'
			});
			return;
		}

		const displayLimit = 50;
		const displayPeople = this.filteredPeople.slice(0, displayLimit);

		for (const person of displayPeople) {
			const isSelected = this.formData.rootPerson?.crId === person.crId;
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
				this.formData.rootPerson = person;
				// Auto-populate canvas name if it's empty or still the default
				if (!this.formData.canvasName || this.formData.canvasName === 'Family Tree') {
					this.formData.canvasName = `${person.name} - Family Tree`;
				}
				if (!this.formData.pdfTitle) {
					this.formData.pdfTitle = `${person.name} - ${this.getTreeTypeLabel()}`;
				}
				this.renderCurrentStep();
			});
		}

		if (this.filteredPeople.length > displayLimit) {
			container.createDiv({
				cls: 'crc-wizard-more',
				text: `显示${displayLimit} / ${this.filteredPeople.length} 人。优化搜索以查看更多。`
			});
		}
	}

	// ========== STEP 2: TREE TYPE ==========

	private renderTreeTypeStep(container: HTMLElement): void {
		container.createEl('p', {
			text: '选择家谱的组织结构。',
			cls: 'cr-wizard-step-desc'
		});

		const form = container.createDiv({ cls: 'cr-wizard-form' });

		// Tree type selection
		form.createEl('div', { cls: 'cr-wizard-subsection', text: '树类型' });

		const treeTypeContainer = form.createDiv({ cls: 'crc-wizard-tree-types' });

		const treeTypes: { id: TreeType; label: string; desc: string; icon: LucideIconName; pdfOnly?: boolean }[] = [
			{ id: 'full', label: '完整树', desc: '祖先与后代', icon: 'cr-hourglass-tree' as LucideIconName },
			{ id: 'ancestors', label: '祖先', desc: '父母、祖父母等', icon: 'cr-pedigree-tree' as LucideIconName },
			{ id: 'descendants', label: '后代', desc: '子女、孙辈等', icon: 'cr-descendant-tree' as LucideIconName },
			{ id: 'fan', label: '扇形图', desc: '半圆形谱系', icon: 'cr-fan-chart' as LucideIconName, pdfOnly: true }
		];

		for (const type of treeTypes) {
			const isDisabled = type.pdfOnly && this.formData.outputFormat === 'canvas';
			const card = treeTypeContainer.createDiv({
				cls: `crc-wizard-type-card ${this.formData.treeType === type.id ? 'crc-wizard-type-card--selected' : ''} ${isDisabled ? 'crc-wizard-type-card--disabled' : ''}`
			});

			card.appendChild(createLucideIcon(type.icon, 24));

			const info = card.createDiv({ cls: 'crc-wizard-type-info' });
			info.createDiv({ cls: 'crc-wizard-type-label', text: type.label });
			info.createDiv({ cls: 'crc-wizard-type-desc', text: type.desc });

			if (type.pdfOnly) {
				info.createDiv({ cls: 'crc-wizard-type-badge', text: '仅 PDF' });
			}

			if (!isDisabled) {
				card.addEventListener('click', () => {
					this.formData.treeType = type.id;
					this.renderCurrentStep();
				});
			}
		}

		// Direction - only show for canvas, or for PDF pedigree/descendant (not hourglass/fan)
		const showDirection = this.formData.outputFormat === 'canvas' ||
			(this.formData.outputFormat === 'pdf' &&
				this.formData.treeType !== 'full' &&
				this.formData.treeType !== 'fan');

		if (showDirection) {
			new Setting(form)
				.setName('方向')
				.setDesc('树的主要延伸方向')
				.addDropdown(dropdown => dropdown
					.addOption('vertical', '垂直（从上到下）')
					.addOption('horizontal', '水平（从左到右）')
					.setValue(this.formData.direction)
					.onChange(value => {
						this.formData.direction = value as 'vertical' | 'horizontal';
					}));
		}

		// Generation limits
		if (this.formData.treeType !== 'descendants') {
			new Setting(form)
				.setName('祖先世代')
				.setDesc('最多祖先世代（0 = 不限）')
				.addSlider(slider => slider
					.setLimits(0, 10, 1)
					.setValue(this.formData.maxAncestorGenerations)
					.onChange(value => {
						this.formData.maxAncestorGenerations = value;
					}));
		}

		if (this.formData.treeType !== 'ancestors' && this.formData.treeType !== 'fan') {
			new Setting(form)
				.setName('后代世代')
				.setDesc('最多后代世代（0 = 不限）')
				.addSlider(slider => slider
					.setLimits(0, 10, 1)
					.setValue(this.formData.maxDescendantGenerations)
					.onChange(value => {
						this.formData.maxDescendantGenerations = value;
					}));
		}

		// Include spouses
		new Setting(form)
			.setName(`包含${getSpouseLabel(this.plugin.settings, { plural: true, lowercase: true })}`)
			.setDesc(`在每个人物旁显示${getSpouseLabel(this.plugin.settings, { lowercase: true })}节点`)
			.addToggle(toggle => toggle
				.setValue(this.formData.includeSpouses)
				.onChange(value => {
					this.formData.includeSpouses = value;
				}));
	}

	// ========== STEP 3: OUTPUT FORMAT ==========

	private renderOutputFormatStep(container: HTMLElement): void {
		container.createEl('p', {
			text: '选择家谱的输出方式。',
			cls: 'cr-wizard-step-desc'
		});

		const formatContainer = container.createDiv({ cls: 'crc-wizard-output-formats' });

		// Canvas card
		const canvasCard = formatContainer.createDiv({
			cls: `crc-wizard-format-card ${this.formData.outputFormat === 'canvas' ? 'crc-wizard-format-card--selected' : ''}`
		});

		const canvasIcon = canvasCard.createDiv({ cls: 'crc-wizard-format-icon' });
		canvasIcon.appendChild(createLucideIcon('layout-dashboard', 20));

		const canvasInfo = canvasCard.createDiv({ cls: 'crc-wizard-format-info' });
		canvasInfo.createDiv({ cls: 'crc-wizard-format-title', text: 'Obsidian 画布' });
		canvasInfo.createDiv({ cls: 'crc-wizard-format-desc', text: '可编辑和浏览的交互式树' });

		const canvasFeatures = canvasInfo.createEl('ul', { cls: 'crc-wizard-format-features' });
		canvasFeatures.createEl('li', { text: '点击节点打开笔记' });
		canvasFeatures.createEl('li', { text: '平移、缩放并编辑布局' });

		canvasCard.addEventListener('click', () => {
			this.formData.outputFormat = 'canvas';
			// Reset fan chart if selected (canvas doesn't support it)
			if (this.formData.treeType === 'fan') {
				this.formData.treeType = 'ancestors';
			}
			this.renderProgress();
			this.renderCurrentStep();
		});

		// Excalidraw card
		const excalidrawCard = formatContainer.createDiv({
			cls: `crc-wizard-format-card ${this.formData.outputFormat === 'excalidraw' ? 'crc-wizard-format-card--selected' : ''}`
		});

		const excalidrawIcon = excalidrawCard.createDiv({ cls: 'crc-wizard-format-icon' });
		excalidrawIcon.appendChild(createLucideIcon('edit', 20));

		const excalidrawInfo = excalidrawCard.createDiv({ cls: 'crc-wizard-format-info' });
		excalidrawInfo.createDiv({ cls: 'crc-wizard-format-title', text: 'Excalidraw' });
		excalidrawInfo.createDiv({ cls: 'crc-wizard-format-desc', text: '用于批注的手绘风格图' });

		const excalidrawFeatures = excalidrawInfo.createEl('ul', { cls: 'crc-wizard-format-features' });
		excalidrawFeatures.createEl('li', { text: '用绘图和文字添加批注' });
		excalidrawFeatures.createEl('li', { text: '导出为 SVG 或 PNG' });

		excalidrawCard.addEventListener('click', () => {
			this.formData.outputFormat = 'excalidraw';
			// Reset fan chart if selected (excalidraw doesn't support it)
			if (this.formData.treeType === 'fan') {
				this.formData.treeType = 'ancestors';
			}
			this.renderProgress();
			this.renderCurrentStep();
		});

		// PDF card
		const pdfCard = formatContainer.createDiv({
			cls: `crc-wizard-format-card ${this.formData.outputFormat === 'pdf' ? 'crc-wizard-format-card--selected' : ''}`
		});

		const pdfIcon = pdfCard.createDiv({ cls: 'crc-wizard-format-icon' });
		pdfIcon.appendChild(createLucideIcon('file-image', 20));

		const pdfInfo = pdfCard.createDiv({ cls: 'crc-wizard-format-info' });
		pdfInfo.createDiv({ cls: 'crc-wizard-format-title', text: 'PDF 文档' });
		pdfInfo.createDiv({ cls: 'crc-wizard-format-desc', text: '可分享的可打印树图' });

		const pdfFeatures = pdfInfo.createEl('ul', { cls: 'crc-wizard-format-features' });
		pdfFeatures.createEl('li', { text: '可打印至最大 24×36 英寸的纸张' });
		pdfFeatures.createEl('li', { text: '提供多种页面尺寸' });

		pdfCard.addEventListener('click', () => {
			this.formData.outputFormat = 'pdf';
			this.renderProgress();
			this.renderCurrentStep();
		});

		// ODT card
		const odtCard = formatContainer.createDiv({
			cls: `crc-wizard-format-card ${this.formData.outputFormat === 'odt' ? 'crc-wizard-format-card--selected' : ''}`
		});

		const odtIcon = odtCard.createDiv({ cls: 'crc-wizard-format-icon' });
		odtIcon.appendChild(createLucideIcon('file-text', 20));

		const odtInfo = odtCard.createDiv({ cls: 'crc-wizard-format-info' });
		odtInfo.createDiv({ cls: 'crc-wizard-format-title', text: 'ODT 文档' });
		odtInfo.createDiv({ cls: 'crc-wizard-format-desc', text: '供文字处理软件使用的可编辑文档' });

		const odtFeatures = odtInfo.createEl('ul', { cls: 'crc-wizard-format-features' });
		odtFeatures.createEl('li', { text: '可在 LibreOffice 或 Word 中打开' });
		odtFeatures.createEl('li', { text: '打印前可添加文字' });

		odtCard.addEventListener('click', () => {
			this.formData.outputFormat = 'odt';
			this.renderProgress();
			this.renderCurrentStep();
		});
	}

	// ========== CANVAS OPTIONS STEP ==========

	private renderCanvasOptionsStep(container: HTMLElement): void {
		container.createEl('p', {
			text: '配置额外的范围与样式选项。',
			cls: 'cr-wizard-step-desc'
		});

		const form = container.createDiv({ cls: 'cr-wizard-form crc-wizard-options-form' });

		// Scope section
		const scopeDetails = form.createEl('details', { cls: 'crc-wizard-details' });
		scopeDetails.open = true;
		const scopeSummary = scopeDetails.createEl('summary', { cls: 'crc-wizard-details-summary' });
		scopeSummary.createSpan({ text: '范围选项', cls: 'crc-wizard-details-title' });

		const scopeContent = scopeDetails.createDiv({ cls: 'crc-wizard-details-content' });

		new Setting(scopeContent)
			.setName('包含继父母')
			.setDesc('以虚线显示继父母关系')
			.addToggle(toggle => toggle
				.setValue(this.formData.includeStepParents)
				.onChange(value => { this.formData.includeStepParents = value; }));

		new Setting(scopeContent)
			.setName('包含养父母')
			.setDesc('以点线显示养父母关系')
			.addToggle(toggle => toggle
				.setValue(this.formData.includeAdoptiveParents)
				.onChange(value => { this.formData.includeAdoptiveParents = value; }));

		const collections = this.graphService.getUserCollections();
		if (collections.length > 0) {
			new Setting(scopeContent)
				.setName('按合集筛选')
				.setDesc('将树限制为特定合集中的人物')
				.addDropdown(dropdown => {
					dropdown.addOption('', '所有合集（不筛选）');
					for (const collection of collections) {
						dropdown.addOption(collection.name, collection.name);
					}
					dropdown.setValue(this.formData.collectionFilter);
					dropdown.onChange(value => { this.formData.collectionFilter = value; });
				});
		}

		new Setting(scopeContent)
				.setName('按地点筛选')
				.setDesc('将树限制为与特定地点相关的人物')
				.addText(text => text
					.setPlaceholder('例如：伦敦，英格兰')
				.setValue(this.formData.placeFilter)
				.onChange(value => { this.formData.placeFilter = value; }));

		// Privacy section
		const privacyDetails = form.createEl('details', { cls: 'crc-wizard-details' });
		privacyDetails.open = false;
		const privacySummary = privacyDetails.createEl('summary', { cls: 'crc-wizard-details-summary' });
		privacySummary.createSpan({ text: '隐私选项', cls: 'crc-wizard-details-title' });
		if (this.formData.applyCanvasPrivacy) {
			privacySummary.createSpan({ text: '（已启用隐私保护）', cls: 'crc-wizard-details-hint' });
		}

		const privacyContent = privacyDetails.createDiv({ cls: 'crc-wizard-details-content' });

		new Setting(privacyContent)
			.setName('应用隐私保护')
			.setDesc('对在世人物混淆姓名并隐藏详情')
			.addToggle(toggle => toggle
				.setValue(this.formData.applyCanvasPrivacy)
				.onChange(value => {
					this.formData.applyCanvasPrivacy = value;
					// Re-render to update hint
					this.renderCurrentStep();
				}));

		if (this.formData.applyCanvasPrivacy) {
			new Setting(privacyContent)
				.setName('隐私格式')
				.setDesc('受保护人物在画布上的显示方式')
				.addDropdown(dropdown => dropdown
					.addOption('text', '文本节点（无文件链接）')
					.addOption('file', '文件节点（保留链接）')
					.setValue(this.formData.canvasPrivacyFormat)
					.onChange(value => { this.formData.canvasPrivacyFormat = value as 'text' | 'file'; }));
		}

		// Style section
		const styleDetails = form.createEl('details', { cls: 'crc-wizard-details' });
		styleDetails.open = false;
		const styleSummary = styleDetails.createEl('summary', { cls: 'crc-wizard-details-summary' });
		styleSummary.createSpan({ text: '样式选项', cls: 'crc-wizard-details-title' });
		styleSummary.createSpan({ text: '（默认使用全局设置）', cls: 'crc-wizard-details-hint' });

		const styleContent = styleDetails.createDiv({ cls: 'crc-wizard-details-content' });

		new Setting(styleContent)
			.setName('布局算法')
			.setDesc('节点在画布上的排列方式')
			.addDropdown(dropdown => dropdown
				.addOption('standard', '标准')
				.addOption('compact', '紧凑')
				.addOption('timeline', '时间轴（按时间顺序）')
				.addOption('hourglass', '沙漏')
				.setValue(this.formData.layoutAlgorithm)
				.onChange(value => { this.formData.layoutAlgorithm = value as LayoutAlgorithm; }));

		new Setting(styleContent)
			.setName('画布分组')
			.setDesc('用于组织相关节点的视觉分组')
			.addDropdown(dropdown => dropdown
				.addOption('none', '无')
				.addOption('generation', '按世代')
				.addOption('nuclear-family', '按夫妻')
				.addOption('collection', '按合集')
				.setValue(this.formData.canvasGroupingStrategy)
				.onChange(value => { this.formData.canvasGroupingStrategy = value as CanvasGroupingStrategy; }));

		new Setting(styleContent)
			.setName('节点着色')
			.setDesc('画布上节点的着色方式')
			.addDropdown(dropdown => dropdown
				.addOption('sex', '按性别（绿/紫）')
				.addOption('generation', '按世代（渐变）')
				.addOption('collection', '按合集')
				.addOption('monochrome', '单色（中性）')
				.setValue(this.formData.colorScheme)
				.onChange(value => { this.formData.colorScheme = value as ColorScheme; }));

		new Setting(styleContent)
			.setName('父母-子女箭头')
			.addDropdown(dropdown => dropdown
				.addOption('directed', '单向（箭头）')
				.addOption('bidirectional', '双向（双箭头）')
				.addOption('undirected', '无向（连线）')
				.setValue(this.formData.parentChildArrowStyle)
				.onChange(value => { this.formData.parentChildArrowStyle = value as 'directed' | 'bidirectional' | 'undirected'; }));

		new Setting(styleContent)
			.setName(getSpouseCompoundLabel(this.plugin.settings, 'arrows'))
			.addDropdown(dropdown => dropdown
				.addOption('directed', '单向（箭头）')
				.addOption('bidirectional', '双向（双箭头）')
				.addOption('undirected', '无向（连线）')
				.setValue(this.formData.spouseArrowStyle)
				.onChange(value => { this.formData.spouseArrowStyle = value as 'directed' | 'bidirectional' | 'undirected'; }));

		new Setting(styleContent)
			.setName(`显示${getSpouseCompoundLabel(this.plugin.settings, 'edges')}`)
			.setDesc('显示婚姻/伴侣关系连线')
			.addToggle(toggle => toggle
				.setValue(this.formData.showSpouseEdges)
				.onChange(value => { this.formData.showSpouseEdges = value; }));
	}

	// ========== CANVAS PREVIEW STEP ==========

	private renderCanvasPreviewStep(container: HTMLElement): void {
		const person = this.formData.rootPerson;
		if (!person) {
			container.createEl('p', {
				text: '未选择根人物。请返回第1步。',
				cls: 'cr-wizard-step-desc'
			});
			return;
		}

		container.createEl('p', {
			text: '生成前预览你的树。平移和缩放以浏览。',
			cls: 'cr-wizard-step-desc'
		});

		this.previewContainer = container.createDiv({ cls: 'crc-wizard-preview-container' });

		const controls = container.createDiv({ cls: 'crc-wizard-preview-controls' });

		const zoomInBtn = controls.createEl('button', { cls: 'cr-btn cr-btn--small cr-btn--icon' });
		setIcon(zoomInBtn, 'zoom-in');
		zoomInBtn.addEventListener('click', () => this.previewRenderer?.zoomIn());

		const zoomOutBtn = controls.createEl('button', { cls: 'cr-btn cr-btn--small cr-btn--icon' });
		setIcon(zoomOutBtn, 'zoom-out');
		zoomOutBtn.addEventListener('click', () => this.previewRenderer?.zoomOut());

		const resetBtn = controls.createEl('button', { cls: 'cr-btn cr-btn--small cr-btn--icon' });
		setIcon(resetBtn, 'maximize-2');
		resetBtn.addEventListener('click', () => this.previewRenderer?.resetView());

		const summary = container.createDiv({ cls: 'crc-wizard-preview-summary' });

		this.buildCanvasPreview(summary);
	}

	private buildCanvasPreview(summaryContainer: HTMLElement): void {
		if (!this.previewContainer || !this.formData.rootPerson) return;

		this.previewContainer.empty();
		const loading = this.previewContainer.createDiv({ cls: 'crc-wizard-loading' });
		loading.createSpan({ text: '正在构建树…' });

		try {
			const treeOptions = this.buildTreeOptions();
			const familyTree = this.graphService.generateTree(treeOptions);

			if (!familyTree || familyTree.nodes.size === 0) {
				this.previewContainer.empty();
				this.previewContainer.createDiv({
					cls: 'crc-wizard-empty',
					text: '未找到此人的家族关联。'
				});
				return;
			}

			const nodeCount = familyTree.nodes.size;

			summaryContainer.empty();
			summaryContainer.createSpan({ text: `树中有${nodeCount}人` });

			// Show living persons count if privacy is enabled
			if (this.formData.applyCanvasPrivacy) {
				const privacyService = createPrivacyService({
					enablePrivacyProtection: true,
					livingPersonAgeThreshold: this.plugin.settings.livingPersonAgeThreshold,
					privacyDisplayFormat: this.plugin.settings.privacyDisplayFormat,
					hideDetailsForLiving: this.plugin.settings.hideDetailsForLiving
				});

				let livingCount = 0;
				for (const person of familyTree.nodes.values()) {
					if (privacyService.isLikelyLiving({
						name: person.name,
						birthDate: person.birthDate,
						deathDate: person.deathDate,
						cr_living: person.cr_living
					})) {
						livingCount++;
					}
				}

				if (livingCount > 0) {
					summaryContainer.createSpan({ text: ' · ' });
					summaryContainer.createSpan({
						text: `${livingCount} 人受隐私保护`,
						cls: 'crc-wizard-privacy-count'
					});
				}
			}

			if (nodeCount > 200) {
				this.previewContainer.empty();
				this.previewContainer.createDiv({
					cls: 'crc-wizard-warning',
					text: `树中有${nodeCount}人——对预览而言过大。画布仍会正确生成。`
				});
				return;
			}

			this.previewContainer.empty();
			this.previewRenderer = new TreePreviewRenderer(this.previewContainer);
			this.previewRenderer.setColorScheme(this.formData.colorScheme);

			const layoutOptions: LayoutOptions = {
				direction: this.formData.direction,
				nodeWidth: this.plugin.settings.defaultNodeWidth,
				nodeHeight: this.plugin.settings.defaultNodeHeight,
				nodeSpacingX: this.plugin.settings.horizontalSpacing,
				nodeSpacingY: this.plugin.settings.verticalSpacing,
				layoutType: this.formData.layoutAlgorithm
			};

			this.previewRenderer.renderPreview(familyTree, layoutOptions);

		} catch (error) {
			console.error('Error building preview:', error);
			this.previewContainer.empty();
			this.previewContainer.createDiv({
				cls: 'crc-wizard-error',
				text: '构建预览时出错。请查看控制台了解详情。'
			});
		}
	}

	// ========== CANVAS OUTPUT STEP ==========

	private renderCanvasOutputStep(container: HTMLElement): void {
		container.createEl('p', {
			text: '配置画布树的保存位置和方式。',
			cls: 'cr-wizard-step-desc'
		});

		const form = container.createDiv({ cls: 'cr-wizard-form' });

		new Setting(form)
			.setName('画布名称')
			.setDesc('生成的画布文件的名称')
			.addText(text => text
				.setPlaceholder('家谱')
				.setValue(this.formData.canvasName)
				.onChange(value => {
					this.formData.canvasName = value;
					// Re-render navigation to update generate button state
					this.renderNavigation();
				}));

		new Setting(form)
			.setName('保存位置')
			.setDesc('画布将会保存到的文件夹')
			.addText(text => {
				text.setPlaceholder('/')
					.setValue(this.formData.saveFolder)
					.onChange(value => { this.formData.saveFolder = value; });
			});

		new Setting(form)
			.setName('生成后打开')
			.setDesc('创建后自动打开画布')
			.addToggle(toggle => toggle
				.setValue(this.formData.openAfterGenerate)
				.onChange(value => { this.formData.openAfterGenerate = value; }));

		// Summary
		const summarySection = form.createDiv({ cls: 'crc-wizard-output-summary' });
		summarySection.createEl('h4', { text: '概要', cls: 'cr-wizard-subsection' });

		const summaryList = summarySection.createEl('ul', { cls: 'crc-wizard-summary-items' });
		summaryList.createEl('li', { text: `根人物：${this.formData.rootPerson?.name || '未选择'}` });
		summaryList.createEl('li', { text: `树类型：${this.getTreeTypeLabel()}` });
		summaryList.createEl('li', { text: `布局：${this.getLayoutAlgorithmLabel(this.formData.layoutAlgorithm)}, ${this.getDirectionLabel(this.formData.direction)}` });
		summaryList.createEl('li', { text: `${getSpouseLabel(this.plugin.settings, { plural: true })}：${this.formData.includeSpouses ? '已包含' : '未包含'}` });
	}

	// ========== EXCALIDRAW STYLE STEP ==========

	private renderExcalidrawStyleStep(container: HTMLElement): void {
		container.createEl('p', {
			text: '配置 Excalidraw 树的绘制样式。',
			cls: 'cr-wizard-step-desc'
		});

		const form = container.createDiv({ cls: 'cr-wizard-form' });

		// Node content level
		new Setting(form)
			.setName('节点内容')
			.setDesc('每个人物框中显示的信息')
			.addDropdown(dropdown => dropdown
				.addOption('name', '仅名称')
				.addOption('name-dates', '名称和日期')
				.addOption('name-dates-places', '名称、日期和地点')
				.setValue(this.formData.excalidrawNodeContent)
				.onChange(value => {
					this.formData.excalidrawNodeContent = value as 'name' | 'name-dates' | 'name-dates-places';
				}));

		// Drawing style (roughness)
		const roughnessDescriptions: Record<number, string> = {
			0: '干净、精确的线条',
			1: '自然的手绘效果',
			2: '表现力强的卡通风格'
		};
		const roughnessSetting = new Setting(form)
			.setName('绘制样式')
			.setDesc(roughnessDescriptions[this.formData.excalidrawRoughness])
			.addDropdown(dropdown => dropdown
				.addOption('0', '建筑师（干净）')
				.addOption('1', '艺术家（自然）')
				.addOption('2', '漫画家（粗糙）')
				.setValue(String(this.formData.excalidrawRoughness))
				.onChange(value => {
					this.formData.excalidrawRoughness = parseInt(value) as 0 | 1 | 2;
					roughnessSetting.setDesc(roughnessDescriptions[this.formData.excalidrawRoughness]);
				}));

		// Font family
		new Setting(form)
			.setName('字体')
			.setDesc('文字标签的字体样式')
			.addDropdown(dropdown => dropdown
				.addOption('1', 'Virgil（手绘）')
				.addOption('5', 'Excalifont（手绘）')
				.addOption('4', 'Comic Shanns（漫画）')
				.addOption('2', 'Helvetica（简洁）')
				.addOption('6', 'Nunito（圆润）')
				.addOption('7', 'Lilita One（展示）')
				.addOption('3', 'Cascadia（等宽）')
				.setValue(String(this.formData.excalidrawFontFamily))
				.onChange(value => {
					this.formData.excalidrawFontFamily = parseInt(value) as 1 | 2 | 3 | 4 | 5 | 6 | 7;
				}));

		// Font size
		new Setting(form)
			.setName('字号')
			.setDesc('文字标签的大小')
			.addSlider(slider => slider
				.setLimits(10, 32, 2)
				.setValue(this.formData.excalidrawFontSize)
				.onChange(value => { this.formData.excalidrawFontSize = value; }));

		// Fill style
		new Setting(form)
			.setName('填充样式')
			.setDesc('形状的填充方式')
			.addDropdown(dropdown => dropdown
				.addOption('solid', '实心')
				.addOption('hachure', '斜线填充')
				.addOption('cross-hatch', '交叉影线')
				.setValue(this.formData.excalidrawFillStyle)
				.onChange(value => {
					this.formData.excalidrawFillStyle = value as 'solid' | 'hachure' | 'cross-hatch';
				}));
	}

	// ========== PDF OPTIONS STEP ==========

	private renderPdfOptionsStep(container: HTMLElement): void {
		container.createEl('p', {
			text: '配置 PDF 的页面与样式设置。',
			cls: 'cr-wizard-step-desc'
		});

		const form = container.createDiv({ cls: 'cr-wizard-form' });

		new Setting(form)
			.setName('页面尺寸')
			.addDropdown(dropdown => dropdown
				.addOption('letter', 'Letter（8.5 x 11 英寸）')
				.addOption('a4', 'A4（210 x 297 毫米）')
				.addOption('legal', 'Legal（8.5 x 14 英寸）')
				.addOption('tabloid', 'Tabloid（11 x 17 英寸）')
				.addOption('a3', 'A3（297 x 420 毫米）')
				.addOption('arch-d', 'Arch D（24 x 36 英寸）')
				.setValue(this.formData.pageSize)
				.onChange(value => {
					this.formData.pageSize = value as VisualTreePageSize;
					this.analyzeTreeAndUpdateWarning(form);
				}));

		new Setting(form)
			.setName('方向')
			.addDropdown(dropdown => dropdown
				.addOption('landscape', '横向')
				.addOption('portrait', '纵向')
				.setValue(this.formData.orientation)
				.onChange(value => {
					this.formData.orientation = value as VisualTreeOrientation;
					this.analyzeTreeAndUpdateWarning(form);
				}));

		new Setting(form)
			.setName('节点内容')
			.setDesc('每个框中显示的内容')
			.addDropdown(dropdown => dropdown
				.addOption('name', '仅名称')
				.addOption('name-dates', '名称 + 日期')
				.addOption('name-dates-places', '名称 + 日期 + 地点')
				.setValue(this.formData.nodeContent)
				.onChange(value => { this.formData.nodeContent = value as VisualTreeNodeContent; }));

		new Setting(form)
			.setName('配色方案')
			.addDropdown(dropdown => dropdown
				.addOption('default', '默认（主题颜色）')
				.addOption('gender', '按性别（蓝/粉）')
				.addOption('generation', '按世代（彩虹色）')
				.addOption('grayscale', '灰度（用于打印）')
				.setValue(this.formData.pdfColorScheme)
				.onChange(value => { this.formData.pdfColorScheme = value as VisualTreeColorScheme; }));

		// Large tree warning placeholder (hidden by default via CSS)
		const warningContainer = form.createDiv({ cls: 'cr-large-tree-warning cr-hidden' });
		warningContainer.setAttribute('data-warning-container', 'true');

		// Run initial analysis
		if (this.formData.rootPerson) {
			this.analyzeTreeAndUpdateWarning(form);
		}
	}

	private analyzeTreeAndUpdateWarning(form: HTMLElement): void {
		if (!this.formData.rootPerson) return;

		const warningContainer = form.querySelector('[data-warning-container]') as HTMLElement;
		if (!warningContainer) return;

		const maxGenerations = this.formData.treeType === 'ancestors' || this.formData.treeType === 'fan'
			? this.formData.maxAncestorGenerations || 5
			: this.formData.maxDescendantGenerations || 5;

		const options: VisualTreeOptions = {
			rootPersonCrId: this.formData.rootPerson.crId,
			chartType: this.formData.treeType === 'full' ? 'hourglass' :
				this.formData.treeType === 'ancestors' ? 'pedigree' :
					this.formData.treeType === 'descendants' ? 'descendant' : 'fan',
			maxGenerations,
			pageSize: this.formData.pageSize,
			orientation: this.formData.orientation,
			nodeContent: this.formData.nodeContent,
			colorScheme: this.formData.pdfColorScheme
		};

		this.treeSizeAnalysis = this.visualTreeService.analyzeTreeSize(options);

		if (!this.treeSizeAnalysis || !this.treeSizeAnalysis.isLarge) {
			warningContainer.addClass('cr-hidden');
			return;
		}

		warningContainer.removeClass('cr-hidden');
		warningContainer.empty();

		const analysis = this.treeSizeAnalysis;

		const header = warningContainer.createDiv({ cls: 'cr-large-tree-warning-header' });
		header.appendChild(createLucideIcon('alert-triangle', 16));
		header.createSpan({ text: '检测到大树' });

		const info = warningContainer.createDiv({ cls: 'cr-large-tree-warning-info' });
		info.createEl('p', {
			text: `此树有${analysis.generationsCount}个世代，最宽的世代有多达${analysis.maxNodesInGeneration}人。`
		});

		const optionsDiv = warningContainer.createDiv({ cls: 'cr-large-tree-warning-options' });
		optionsDiv.createEl('p', { text: '选择处理方式：' });

		// Auto page size option
		const autoSizeOption = optionsDiv.createDiv({ cls: 'cr-large-tree-option' });
		const autoSizeRadio = autoSizeOption.createEl('input', {
			type: 'radio',
			attr: { name: 'largeTreeHandling', value: 'auto-page-size', id: 'largeTree-autoSize' }
		});
		if (this.formData.largeTreeHandling === 'auto-page-size') autoSizeRadio.checked = true;
		autoSizeRadio.addEventListener('change', () => { this.formData.largeTreeHandling = 'auto-page-size'; });

		const autoSizeLabel = autoSizeOption.createEl('label', { attr: { for: 'largeTree-autoSize' } });
		autoSizeLabel.createEl('strong', { text: '使用更大的页面尺寸' });
		if (analysis.canFitOnSinglePage && analysis.recommendedPageSize) {
			autoSizeLabel.createEl('span', {
				text: ` - 将使用 ${this.getPageSizeLabel(analysis.recommendedPageSize)} 以适配单页`
			});
		} else {
			autoSizeLabel.createEl('span', { text: ' - 树太大，无法放入任何单页' });
		}

		// Multi-page option
		const multiPageOption = optionsDiv.createDiv({ cls: 'cr-large-tree-option' });
		const multiPageRadio = multiPageOption.createEl('input', {
			type: 'radio',
			attr: { name: 'largeTreeHandling', value: 'multi-page', id: 'largeTree-multiPage' }
		});
		if (this.formData.largeTreeHandling === 'multi-page') multiPageRadio.checked = true;
		multiPageRadio.addEventListener('change', () => { this.formData.largeTreeHandling = 'multi-page'; });

		const multiPageLabel = multiPageOption.createEl('label', { attr: { for: 'largeTree-multiPage' } });
		multiPageLabel.createEl('strong', { text: '拆分到多页' });
		multiPageLabel.createEl('span', {
			text: ` - 将创建 ${analysis.pagesNeededForMultiPage} 页，每页显示4个世代`
		});
	}

	// ========== PDF OUTPUT STEP ==========

	private renderPdfOutputStep(container: HTMLElement): void {
		const formatName = this.formData.outputFormat === 'odt' ? 'ODT' : 'PDF';
		container.createEl('p', {
			text: `检查你的设置并生成 ${formatName}。`,
			cls: 'cr-wizard-step-desc'
		});

		const form = container.createDiv({ cls: 'cr-wizard-form' });

		new Setting(form)
			.setName('标题')
			.setDesc(`${formatName} 的自定义标题（可选）`)
			.addText(text => text
				.setPlaceholder('留空以自动生成标题')
				.setValue(this.formData.pdfTitle)
				.onChange(value => { this.formData.pdfTitle = value; }));

		// Summary
		const summarySection = form.createDiv({ cls: 'crc-wizard-output-summary' });
		summarySection.createEl('h4', { text: '概要', cls: 'cr-wizard-subsection' });

		const summaryList = summarySection.createEl('ul', { cls: 'crc-wizard-summary-items' });
		summaryList.createEl('li', { text: `根人物：${this.formData.rootPerson?.name || '未选择'}` });
		summaryList.createEl('li', { text: `图表类型：${this.getPdfChartTypeLabel()}` });

		// Show effective page size (may be overridden by large tree handling)
		const effectivePageSize = this.treeSizeAnalysis?.isLarge &&
			this.formData.largeTreeHandling === 'auto-page-size' &&
			this.treeSizeAnalysis.recommendedPageSize
			? this.treeSizeAnalysis.recommendedPageSize
			: this.formData.pageSize;
		summaryList.createEl('li', { text: `页面：${this.getPageSizeLabel(effectivePageSize)}, ${this.getOrientationLabel(this.formData.orientation)}` });

		summaryList.createEl('li', { text: `内容：${this.getNodeContentLabel(this.formData.nodeContent)}` });
		summaryList.createEl('li', { text: `颜色：${this.getColorSchemeLabel(this.formData.pdfColorScheme)}` });
	}

	// ========== NAVIGATION ==========

	private renderNavigation(): void {
		if (!this.contentContainer) return;

		// Remove existing nav if present (for reactivity updates)
		const existingNav = this.contentContainer.querySelector('.cr-wizard-nav');
		if (existingNav) {
			existingNav.remove();
		}

		const nav = this.contentContainer.createDiv({ cls: 'cr-wizard-nav' });
		const flow = this.getStepFlow();

		// Back/Cancel button
		if (this.currentStepIndex === 0) {
			const cancelBtn = nav.createEl('button', { text: '取消', cls: 'cr-btn' });
			cancelBtn.addEventListener('click', () => this.close());
		} else {
			const backBtn = nav.createEl('button', { text: '上一步', cls: 'cr-btn' });
			backBtn.prepend(createLucideIcon('chevron-left', 16));
			backBtn.addEventListener('click', () => this.goBack());
		}

		const rightBtns = nav.createDiv({ cls: 'cr-wizard-nav-right' });

		// Next/Generate button
		const isLastStep = this.currentStepIndex === flow.length - 1;

		if (!isLastStep) {
			const nextBtn = rightBtns.createEl('button', { text: '下一步', cls: 'cr-btn cr-btn--primary' });
			nextBtn.appendChild(createLucideIcon('arrow-right', 16));

			// Disable if requirements not met
			if (this.currentStepIndex === 0 && !this.formData.rootPerson) {
				nextBtn.disabled = true;
				nextBtn.addClass('cr-btn--disabled');
			}

			nextBtn.addEventListener('click', () => this.goNext());
		} else {
			const buttonText = this.formData.outputFormat === 'canvas' ? '生成画布' :
				this.formData.outputFormat === 'excalidraw' ? '生成 Excalidraw' :
				this.formData.outputFormat === 'pdf' ? '生成 PDF' : '生成 ODT';
			const generateBtn = rightBtns.createEl('button', {
				text: buttonText,
				cls: 'cr-btn cr-btn--primary'
			});
			generateBtn.prepend(createLucideIcon('sparkles', 16));

			// Disable if requirements not met
			if ((this.formData.outputFormat === 'canvas' || this.formData.outputFormat === 'excalidraw') && !this.formData.canvasName.trim()) {
				generateBtn.disabled = true;
				generateBtn.addClass('cr-btn--disabled');
			}

			generateBtn.addEventListener('click', () => {
				if (this.formData.outputFormat === 'canvas') {
					void this.generateCanvas();
				} else if (this.formData.outputFormat === 'excalidraw') {
					void this.generateExcalidraw();
				} else if (this.formData.outputFormat === 'pdf') {
					void this.generatePdf();
				} else {
					void this.generateOdt();
				}
			});
		}
	}

	private goNext(): void {
		const flow = this.getStepFlow();
		if (this.currentStepIndex < flow.length - 1) {
			this.currentStepIndex++;
			this.renderProgress();
			this.renderCurrentStep();
		}
	}

	private goBack(): void {
		if (this.currentStepIndex > 0) {
			this.currentStepIndex--;
			this.renderProgress();
			this.renderCurrentStep();
		}
	}

	// ========== GENERATION LOGIC ==========

	private buildTreeOptions(): TreeOptions {
		if (!this.formData.rootPerson) {
			throw new Error('Root person not selected');
		}

		const treeType = this.formData.treeType === 'fan' ? 'ancestors' : this.formData.treeType;

		const options: TreeOptions = {
			rootCrId: this.formData.rootPerson.crId,
			treeType,
			maxGenerations: treeType === 'ancestors'
				? this.formData.maxAncestorGenerations || undefined
				: treeType === 'descendants'
					? this.formData.maxDescendantGenerations || undefined
					: undefined,
			includeSpouses: this.formData.includeSpouses,
			includeStepParents: this.formData.includeStepParents,
			includeAdoptiveParents: this.formData.includeAdoptiveParents
		};

		if (this.formData.collectionFilter) {
			options.collectionFilter = this.formData.collectionFilter;
		}

		if (this.formData.placeFilter) {
			options.placeFilter = {
				placeName: this.formData.placeFilter,
				types: Array.from(this.formData.placeFilterTypes)
			};
		}

		return options;
	}

	private async generateCanvas(): Promise<void> {
		if (!this.formData.rootPerson || !this.formData.canvasName.trim()) {
			new Notice('请选择根人物并输入画布名称。');
			return;
		}

		try {
			new Notice('正在生成画布…');

			const treeOptions = this.buildTreeOptions();
			logger.info('unified-wizard', 'Starting canvas generation', treeOptions);

			const familyTree = this.graphService.generateTree(treeOptions);

			if (!familyTree) {
				new Notice('生成树失败：未找到根人物');
				return;
			}

			logger.info('unified-wizard', 'Family tree generated', {
				rootPerson: familyTree.root.name,
				totalNodes: familyTree.nodes.size,
				totalEdges: familyTree.edges.length
			});

			const canvasOptions: CanvasGenerationOptions = {
				direction: this.formData.direction,
				nodeSpacingX: this.plugin.settings.horizontalSpacing,
				nodeSpacingY: this.plugin.settings.verticalSpacing,
				layoutType: this.formData.layoutAlgorithm as LayoutType,
				nodeColorScheme: this.formData.colorScheme,
				showLabels: true,
				useFamilyChartLayout: true,
				parentChildArrowStyle: this.formData.parentChildArrowStyle,
				spouseArrowStyle: this.formData.spouseArrowStyle,
				parentChildEdgeColor: this.formData.parentChildEdgeColor,
				spouseEdgeColor: this.formData.spouseEdgeColor,
				showSpouseEdges: this.formData.showSpouseEdges,
				spouseEdgeLabelFormat: this.formData.spouseEdgeLabelFormat,
				showSourceIndicators: this.plugin.settings.showSourceIndicators,
				showResearchCoverage: this.plugin.settings.trackFactSourcing,
				canvasGroupingStrategy: this.formData.canvasGroupingStrategy,
				applyCanvasPrivacy: this.formData.applyCanvasPrivacy,
				canvasPrivacyFormat: this.formData.canvasPrivacyFormat,
				customRelationshipTypes: this.plugin.settings.customRelationshipTypes,
				canvasRootsMetadata: {
					plugin: 'charted-roots',
					generation: {
						rootCrId: this.formData.rootPerson.crId,
						rootPersonName: this.formData.rootPerson.name,
						treeType: this.formData.treeType === 'fan' ? 'ancestors' : this.formData.treeType,
						maxGenerations: treeOptions.maxGenerations || 0,
						includeSpouses: this.formData.includeSpouses,
						direction: this.formData.direction,
						timestamp: Date.now()
					},
					layout: {
						nodeWidth: this.plugin.settings.defaultNodeWidth,
						nodeHeight: this.plugin.settings.defaultNodeHeight,
						nodeSpacingX: this.plugin.settings.horizontalSpacing,
						nodeSpacingY: this.plugin.settings.verticalSpacing,
						layoutType: this.formData.layoutAlgorithm as LayoutType
					}
				}
			};

			const canvasGenerator = new CanvasGenerator();

			// Set up privacy service if privacy protection is enabled
			if (this.formData.applyCanvasPrivacy) {
				const privacyService = createPrivacyService({
					enablePrivacyProtection: true,
					livingPersonAgeThreshold: this.plugin.settings.livingPersonAgeThreshold,
					privacyDisplayFormat: this.plugin.settings.privacyDisplayFormat,
					hideDetailsForLiving: this.plugin.settings.hideDetailsForLiving
				});
				canvasGenerator.setPrivacyService(privacyService);
			}

			const canvasData = canvasGenerator.generateCanvas(familyTree, canvasOptions);

			logger.info('unified-wizard', 'Canvas data generated', {
				nodeCount: canvasData.nodes.length,
				edgeCount: canvasData.edges.length
			});

			let fileName = this.formData.canvasName.trim();
			if (!fileName.endsWith('.canvas')) {
				fileName += '.canvas';
			}

			const folder = this.formData.saveFolder.trim() ||
				this.plugin.settings.canvasesFolder ||
				'Charted Roots/Canvases';

			await ensureFolderExists(this.app, folder);
			const filePath = normalizePath(`${folder}/${fileName}`);

			const canvasContent = this.formatCanvasJson(canvasData);

			let file: TFile;
			const existingFile = this.app.vault.getAbstractFileByPath(filePath);
			if (existingFile instanceof TFile) {
				await this.app.vault.modify(existingFile, canvasContent);
				file = existingFile;
				new Notice(`已更新现有画布：${fileName}`);
			} else {
				file = await this.app.vault.create(filePath, canvasContent);
				new Notice(`已创建画布：${fileName}`);
			}

			await new Promise(resolve => window.setTimeout(resolve, 100));

			// Save to recent trees
			const treeInfo: RecentTreeInfo = {
				canvasPath: file.path,
				canvasName: fileName,
				peopleCount: canvasData.nodes.length,
				edgeCount: canvasData.edges.length,
				rootPerson: this.formData.rootPerson.name,
				timestamp: Date.now()
			};

			if (!this.plugin.settings.recentTrees) {
				this.plugin.settings.recentTrees = [];
			}

			this.plugin.settings.recentTrees = this.plugin.settings.recentTrees.filter(
				t => t.canvasPath !== file.path
			);

			this.plugin.settings.recentTrees.unshift(treeInfo);

			if (this.plugin.settings.recentTrees.length > 10) {
				this.plugin.settings.recentTrees = this.plugin.settings.recentTrees.slice(0, 10);
			}

			await this.plugin.saveSettings();

			if (this.formData.openAfterGenerate) {
				const leaf = this.app.workspace.getLeaf(false);
				await leaf.openFile(file);
			}

			this.options.onComplete?.(file.path);
			this.close();

		} catch (error) {
			console.error('Error generating canvas:', error);
			new Notice('生成画布时出错。请查看控制台了解详情。');
		}
	}

	private async generateExcalidraw(): Promise<void> {
		if (!this.formData.rootPerson || !this.formData.canvasName.trim()) {
			new Notice('请选择根人物并输入名称。');
			return;
		}

		try {
			new Notice('正在生成 Excalidraw…');

			const treeOptions = this.buildTreeOptions();
			logger.info('unified-wizard', 'Starting Excalidraw generation', treeOptions);

			const familyTree = this.graphService.generateTree(treeOptions);

			if (!familyTree) {
				new Notice('生成树失败：未找到根人物');
				return;
			}

			// First generate as canvas
			// For Excalidraw export, always include spouse edges so they can be styled differently
			const canvasOptions: CanvasGenerationOptions = {
				direction: this.formData.direction,
				nodeSpacingX: this.plugin.settings.horizontalSpacing,
				nodeSpacingY: this.plugin.settings.verticalSpacing,
				layoutType: this.formData.layoutAlgorithm as LayoutType,
				nodeColorScheme: this.formData.colorScheme,
				showLabels: true,
				useFamilyChartLayout: true,
				parentChildArrowStyle: this.formData.parentChildArrowStyle,
				spouseArrowStyle: this.formData.spouseArrowStyle,
				parentChildEdgeColor: this.formData.parentChildEdgeColor,
				spouseEdgeColor: this.formData.spouseEdgeColor,
				showSpouseEdges: true, // Always include spouse edges for Excalidraw (enables dashed styling)
				spouseEdgeLabelFormat: this.formData.spouseEdgeLabelFormat,
				showSourceIndicators: this.plugin.settings.showSourceIndicators,
				showResearchCoverage: this.plugin.settings.trackFactSourcing,
				canvasGroupingStrategy: this.formData.canvasGroupingStrategy,
				applyCanvasPrivacy: this.formData.applyCanvasPrivacy,
				canvasPrivacyFormat: this.formData.canvasPrivacyFormat,
				customRelationshipTypes: this.plugin.settings.customRelationshipTypes
			};

			const canvasGenerator = new CanvasGenerator();

			// Set up privacy service if privacy protection is enabled
			if (this.formData.applyCanvasPrivacy) {
				const privacyService = createPrivacyService({
					enablePrivacyProtection: true,
					livingPersonAgeThreshold: this.plugin.settings.livingPersonAgeThreshold,
					privacyDisplayFormat: this.plugin.settings.privacyDisplayFormat,
					hideDetailsForLiving: this.plugin.settings.hideDetailsForLiving
				});
				canvasGenerator.setPrivacyService(privacyService);
			}

			const canvasData = canvasGenerator.generateCanvas(familyTree, canvasOptions);

			// Create temporary canvas file
			let fileName = this.formData.canvasName.trim();
			if (!fileName.endsWith('.canvas')) {
				fileName += '.canvas';
			}

			const folder = this.formData.saveFolder.trim() ||
				this.plugin.settings.canvasesFolder ||
				'Charted Roots/Canvases';

			await ensureFolderExists(this.app, folder);
			const canvasPath = normalizePath(`${folder}/${fileName}`);
			const canvasContent = this.formatCanvasJson(canvasData);

			// Create or update canvas file
			let canvasFile: TFile;
			const existingCanvas = this.app.vault.getAbstractFileByPath(canvasPath);
			if (existingCanvas instanceof TFile) {
				await this.app.vault.modify(existingCanvas, canvasContent);
				canvasFile = existingCanvas;
			} else {
				canvasFile = await this.app.vault.create(canvasPath, canvasContent);
			}

			// Convert to Excalidraw
			const { ExcalidrawExporter } = await import('../../excalidraw/excalidraw-exporter');
			const excalidrawExporter = new ExcalidrawExporter(this.app);

			const excalidrawResult = await excalidrawExporter.exportToExcalidraw({
				canvasFile,
				fileName: fileName.replace('.canvas', ''),
				preserveColors: true,
				// Pass Excalidraw style options from wizard
				roughness: this.formData.excalidrawRoughness,
				fontFamily: this.formData.excalidrawFontFamily,
				fontSize: this.formData.excalidrawFontSize,
				strokeWidth: this.formData.excalidrawStrokeWidth,
				fillStyle: this.formData.excalidrawFillStyle,
				strokeStyle: this.formData.excalidrawStrokeStyle,
				nodeContent: this.formData.excalidrawNodeContent
			});

			if (excalidrawResult.success && excalidrawResult.excalidrawContent) {
				const excalidrawPath = canvasPath.replace('.canvas', '.excalidraw.md');

				// Create or update excalidraw file
				const existingExcalidraw = this.app.vault.getAbstractFileByPath(excalidrawPath);
				let excalidrawFile: TFile;
				if (existingExcalidraw instanceof TFile) {
					await this.app.vault.modify(existingExcalidraw, excalidrawResult.excalidrawContent);
					excalidrawFile = existingExcalidraw;
					new Notice(`已更新 Excalidraw：${excalidrawPath}`);
				} else {
					excalidrawFile = await this.app.vault.create(excalidrawPath, excalidrawResult.excalidrawContent);
					new Notice(`已创建 Excalidraw：${excalidrawPath}`);
				}

				// Delete the temporary canvas file (we only needed it for the export)
				await this.app.fileManager.trashFile(canvasFile);

				if (this.formData.openAfterGenerate) {
					const leaf = this.app.workspace.getLeaf(false);
					await leaf.openFile(excalidrawFile);
				}

				this.options.onComplete?.(excalidrawFile.path);
				this.close();
			} else {
				// Clean up temporary canvas file even on failure
				await this.app.fileManager.trashFile(canvasFile);
				new Notice(`Excalidraw 导出失败：${excalidrawResult.errors?.join(', ') || '未知错误'}`);
			}

		} catch (error) {
			console.error('Error generating Excalidraw:', error);
			new Notice('生成 Excalidraw 时出错。请查看控制台了解详情。');
		}
	}

	private async generatePdf(): Promise<void> {
		if (!this.formData.rootPerson) {
			new Notice('请选择根人物。');
			return;
		}

		const maxGenerations = this.formData.treeType === 'ancestors' || this.formData.treeType === 'fan'
			? this.formData.maxAncestorGenerations || 5
			: this.formData.maxDescendantGenerations || 5;

		const chartType = this.formData.treeType === 'full' ? 'hourglass' :
			this.formData.treeType === 'ancestors' ? 'pedigree' :
				this.formData.treeType === 'descendants' ? 'descendant' : 'fan';

		const options: VisualTreeOptions = {
			rootPersonCrId: this.formData.rootPerson.crId,
			chartType,
			maxGenerations,
			pageSize: this.formData.pageSize,
			orientation: this.formData.orientation,
			nodeContent: this.formData.nodeContent,
			colorScheme: this.formData.pdfColorScheme,
			includeSpouses: this.formData.includeSpouses,
			title: this.formData.pdfTitle || `${this.formData.rootPerson.name} - ${this.getTreeTypeLabel()}`,
			largeTreeHandling: this.treeSizeAnalysis?.isLarge ? this.formData.largeTreeHandling : undefined
		};

		try {
			new Notice('正在生成 PDF…');

			const layouts = this.visualTreeService.buildLayouts(options);

			if (layouts.length === 0) {
				new Notice('生成树布局失败。此人可能没有任何祖先。');
				return;
			}

			await this.pdfRenderer.renderVisualTrees(layouts, options);

			const totalPeople = layouts.reduce((sum, l) => sum + l.stats.peopleCount, 0);

			if (layouts.length > 1) {
				new Notice(`PDF 已生成，包含 ${totalPeople} 人，共 ${layouts.length} 页。`);
			} else {
				new Notice(`PDF 已生成，包含 ${layouts[0].stats.peopleCount} 人，共 ${layouts[0].stats.generationsCount} 个世代。`);
			}

			this.close();

		} catch (error) {
			console.error('Error generating PDF:', error);
			new Notice('生成 PDF 时出错。请查看控制台了解详情。');
		}
	}

	private async generateOdt(): Promise<void> {
		if (!this.formData.rootPerson) {
			new Notice('请选择根人物。');
			return;
		}

		const maxGenerations = this.formData.treeType === 'ancestors' || this.formData.treeType === 'fan'
			? this.formData.maxAncestorGenerations || 5
			: this.formData.maxDescendantGenerations || 5;

		const chartType = this.formData.treeType === 'full' ? 'hourglass' :
			this.formData.treeType === 'ancestors' ? 'pedigree' :
				this.formData.treeType === 'descendants' ? 'descendant' : 'fan';

		const options: VisualTreeOptions = {
			rootPersonCrId: this.formData.rootPerson.crId,
			chartType,
			maxGenerations,
			pageSize: this.formData.pageSize,
			orientation: this.formData.orientation,
			nodeContent: this.formData.nodeContent,
			colorScheme: this.formData.pdfColorScheme,
			includeSpouses: this.formData.includeSpouses,
			title: this.formData.pdfTitle || `${this.formData.rootPerson.name} - ${this.getTreeTypeLabel()}`,
			largeTreeHandling: this.treeSizeAnalysis?.isLarge ? this.formData.largeTreeHandling : undefined
		};

		try {
			new Notice('正在生成 ODT…');

			const layouts = this.visualTreeService.buildLayouts(options);

			if (layouts.length === 0) {
				new Notice('生成树布局失败。此人可能没有任何祖先。');
				return;
			}

			// Use first layout for now (multi-page ODT could be added later)
			const layout = layouts[0];

			// Render to SVG
			const svgRenderer = new VisualTreeSvgRenderer();
			const svgString = svgRenderer.renderToSvg(layout, options);

			// Convert to PNG data URL
			const imageDataUrl = await svgRenderer.svgToDataUrl(svgString, layout.page.width, layout.page.height);

			// Calculate image dimensions in cm for ODT (assuming 72 DPI)
			// A4 is 21cm wide, Letter is 21.59cm wide. Use ~18cm for margins
			const maxWidthCm = 18;
			const aspectRatio = layout.page.height / layout.page.width;
			const imageWidthCm = maxWidthCm;
			const imageHeightCm = maxWidthCm * aspectRatio;

			// Generate ODT with embedded image
			const odtGenerator = new OdtGenerator();
			const title = options.title || `${this.formData.rootPerson.name} Family Tree`;

			const odtBlob = await odtGenerator.generate('', {
				title,
				includeCoverPage: false,
				embedImage: {
					data: imageDataUrl,
					width: imageWidthCm,
					height: imageHeightCm
				}
			});

			// Download the ODT file - use the title for the filename
			const fileName = `${title.replace(/[^a-zA-Z0-9]/g, '_')}.odt`;
			const url = URL.createObjectURL(odtBlob);
			const a = activeDocument.createElement('a');
			a.href = url;
			a.download = fileName;
			activeDocument.body.appendChild(a);
			a.click();
			activeDocument.body.removeChild(a);
			URL.revokeObjectURL(url);

			new Notice(`ODT 已生成，包含 ${layout.stats.peopleCount} 人，共 ${layout.stats.generationsCount} 个世代。`);
			this.close();

		} catch (error) {
			console.error('Error generating ODT:', error);
			new Notice('生成 ODT 时出错。请查看控制台了解详情。');
		}
	}

	private formatCanvasJson(data: { nodes: unknown[]; edges: unknown[]; metadata?: unknown }): string {
		const safeStringify = (obj: unknown): string => {
			const seen = new WeakSet();
			return JSON.stringify(obj, (_key, value) => {
				if (typeof value === 'object' && value !== null) {
					if (seen.has(value)) return '[Circular]';
					seen.add(value);
				}
				return value;
			});
		};

		const lines: string[] = ['{'];

		lines.push('\t"nodes":[');
		data.nodes.forEach((node, index) => {
			const compact = safeStringify(node);
			const suffix = index < data.nodes.length - 1 ? ',' : '';
			lines.push(`\t\t${compact}${suffix}`);
		});
		lines.push('\t],');

		lines.push('\t"edges":[');
		data.edges.forEach((edge, index) => {
			const compact = safeStringify(edge);
			const suffix = index < data.edges.length - 1 ? ',' : '';
			lines.push(`\t\t${compact}${suffix}`);
		});
		lines.push('\t]');

		if (data.metadata) {
			lines[lines.length - 1] = '\t],';
			lines.push(`\t"metadata":${safeStringify(data.metadata)}`);
		}

		lines.push('}');
		return lines.join('\n');
	}

	// ========== UTILITIES ==========

	private formatDates(birthDate?: string, deathDate?: string): string {
		if (!birthDate && !deathDate) return '';
		const birth = birthDate || '?';
		const death = deathDate || '';
		return death ? `(${birth} - ${death})` : `(生于 ${birth})`;
	}

	private getTreeTypeLabel(): string {
		switch (this.formData.treeType) {
			case 'full': return '完整树';
			case 'ancestors': return '祖先图';
			case 'descendants': return '后代图';
			case 'fan': return '扇形图';
		}
	}

	/**
	 * Get the PDF chart type label (more specific for PDF output)
	 */
	private getPdfChartTypeLabel(): string {
		switch (this.formData.treeType) {
			case 'full': return '沙漏图';
			case 'ancestors': return '祖先图';
			case 'descendants': return '后代图';
			case 'fan': return '扇形图';
		}
	}

	/**
	 * Get human-readable output format label
	 */
	private getOutputFormatLabel(): string {
		switch (this.formData.outputFormat) {
			case 'canvas': return '画布';
			case 'excalidraw': return 'Excalidraw';
			case 'pdf': return 'PDF';
			case 'odt': return 'ODT';
		}
	}

	/**
	 * Get human-readable layout algorithm label
	 */
	private getLayoutAlgorithmLabel(algorithm: LayoutAlgorithm): string {
		switch (algorithm) {
			case 'standard': return '标准';
			case 'compact': return '紧凑';
			case 'timeline': return '时间轴';
			case 'hourglass': return '沙漏';
		}
	}

	/**
	 * Get human-readable direction label
	 */
	private getDirectionLabel(direction: 'vertical' | 'horizontal'): string {
		return direction === 'horizontal' ? '水平' : '垂直';
	}

	/**
	 * Get human-readable page size label
	 */
	private getPageSizeLabel(pageSize: VisualTreePageSize): string {
		switch (pageSize) {
			case 'letter': return 'Letter';
			case 'a4': return 'A4';
			case 'legal': return 'Legal';
			case 'tabloid': return 'Tabloid';
			case 'a3': return 'A3';
			case 'arch-d': return 'Arch D';
		}
	}

	/**
	 * Get human-readable page orientation label
	 */
	private getOrientationLabel(orientation: VisualTreeOrientation): string {
		return orientation === 'portrait' ? '纵向' : '横向';
	}

	/**
	 * Get human-readable node content label
	 */
	private getNodeContentLabel(content: VisualTreeNodeContent): string {
		switch (content) {
			case 'name': return '仅名称';
			case 'name-dates': return '名称 + 日期';
			case 'name-dates-places': return '名称 + 日期 + 地点';
		}
	}

	/**
	 * Get human-readable PDF color scheme label
	 */
	private getColorSchemeLabel(scheme: VisualTreeColorScheme): string {
		switch (scheme) {
			case 'default': return '默认';
			case 'gender': return '按性别';
			case 'generation': return '按世代';
			case 'grayscale': return '灰度';
		}
	}
}

/* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument -- Match scope of file-level disable at top. */
