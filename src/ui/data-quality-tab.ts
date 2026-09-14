/**
 * Data Quality tab for the Control Center
 *
 * Extracted from control-center.ts to reduce file size. Contains the main
 * Data Quality tab rendering, research gaps sections, vault-wide analysis,
 * batch operations (cross-domain and person-specific), and all supporting
 * helper functions.
 */

import { App, ButtonComponent, Notice, Setting, TFile, setIcon } from 'obsidian';
import type CanvasRootsPlugin from '../../main';
import type { LucideIconName } from './lucide-icons';
import { setButtonDestructive } from './button-helpers';
import { createLucideIcon } from './lucide-icons';
import { FamilyGraphService } from '../core/family-graph';
import { FolderFilterService } from '../core/folder-filter';
import { DataQualityService } from '../core/data-quality';
import type { DataQualityReport, DataQualityIssue, IssueSeverity, IssueCategory, BatchOperationResult } from '../core/data-quality';
import { EventService } from '../events/services/event-service';
import { PlaceGeneratorModal } from '../enhancement/ui/place-generator-modal';
import { FlattenNestedPropertiesModal } from './flatten-nested-properties-modal';
import { FixMistypedValuesModal } from './fix-mistyped-values-modal';
import { BulkMediaLinkModal } from '../core/ui/bulk-media-link-modal';
import { TemplateSnippetsModal } from './template-snippets-modal';
import { getErrorMessage } from '../core/error-utils';
import {
	EvidenceService,
	FACT_KEY_LABELS,
	FACT_KEYS,
	CreateProofModal
} from '../sources';
import type {
	FactKey,
	ResearchGapsSummary,
	PersonResearchCoverage,
	ProofSummaryNote
} from '../sources';
import { BatchPreviewModal } from './data-quality-modals';
import { previewRepairMisalignedChildren, repairMisalignedChildren } from './data-quality-batch-ops';

// ---------------------------------------------------------------------------
// Options interface
// ---------------------------------------------------------------------------

export interface DataQualityTabOptions {
	container: HTMLElement;
	plugin: CanvasRootsPlugin;
	app: App;
	createCard: (options: { title: string; icon?: LucideIconName; subtitle?: string }) => HTMLElement;
	showTab: (tabId: string) => void;
	closeModal: () => void;
	getCachedFamilyGraph: () => FamilyGraphService;
	invalidateCaches: () => void;
}

// ---------------------------------------------------------------------------
// Dockable view types
// ---------------------------------------------------------------------------

export type DataQualityFilter = 'all' | 'errors' | 'warnings' | 'info';

export interface DataQualityDashboardOptions {
	container: HTMLElement;
	plugin: CanvasRootsPlugin;
	initialFilter?: DataQualityFilter;
	initialSearch?: string;
	onStateChange?: (filter: DataQualityFilter, search: string) => void;
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Render the Data Quality tab
 */
export function renderDataQualityTab(options: DataQualityTabOptions): void {
	const { container, plugin, app } = options;
	container.empty();

	// Quick Start Guidance Card
	const quickStartCard = options.createCard({
		title: '快速开始',
		icon: 'info',
		subtitle: '在哪里找到数据质量工具'
	});
	const quickStartContent = quickStartCard.querySelector('.crc-card__content') as HTMLElement;

	const guidanceText = quickStartContent.createEl('p', {
		cls: 'crc-text-muted'
	});
	guidanceText.appendText('数据质量工具按实体类型组织以便使用。此标签页提供全库分析和跨域操作。');

	// Domain-specific links
	const linksList = quickStartContent.createEl('ul', { cls: 'crc-text-muted' });

	const peopleItem = linksList.createEl('li');
	peopleItem.appendText('人物专属的批量操作，请参阅 ');
	const peopleLink = peopleItem.createEl('a', {
		text: '人物标签页',
		href: '#',
		cls: 'crc-text-link'
	});
	peopleLink.addEventListener('click', (e) => {
		e.preventDefault();
		options.showTab('people');
	});

	const placesItem = linksList.createEl('li');
	placesItem.appendText('地点专属的数据质量，请参阅 ');
	const placesLink = placesItem.createEl('a', {
		text: '地点标签页',
		href: '#',
		cls: 'crc-text-link'
	});
	placesLink.addEventListener('click', (e) => {
		e.preventDefault();
		options.showTab('places');
	});

	const schemasItem = linksList.createEl('li');
	schemasItem.appendText('架构验证，请参阅 ');
	const schemasLink = schemasItem.createEl('a', {
		text: '架构标签页',
		href: '#',
		cls: 'crc-text-link'
	});
	schemasLink.addEventListener('click', (e) => {
		e.preventDefault();
		options.showTab('schemas');
	});

	// Cleanup Wizard button
	const wizardSection = quickStartContent.createDiv({ cls: 'crc-mt-3' });
	const wizardBtn = new ButtonComponent(wizardSection)
		.setCta()
		.onClick(() => {
			options.closeModal();
			void import('./cleanup-wizard-modal').then(({ CleanupWizardModal }) => {
				new CleanupWizardModal(app, plugin).open();
			});
		});
	const wizardIcon = wizardBtn.buttonEl.createSpan({ cls: 'crc-btn-icon' });
	setIcon(wizardIcon, 'sparkles');
	wizardBtn.buttonEl.createSpan({ text: '运行清理向导' });

	container.appendChild(quickStartCard);

	// Research Needed Section (always show - independent of trackFactSourcing)
	try {
		renderResearchNeededSection(container, options);
	} catch (error) {
		console.error('[Charted Roots] Error rendering Research Needed section:', error);
	}

	// Research Gaps Section (only when fact-level tracking is enabled)
	if (plugin.settings.trackFactSourcing) {
		try {
			renderResearchGapsSection(container, options);
		} catch (error) {
			console.error('[Charted Roots] Error rendering Research Gaps section:', error);
		}

		// Source Conflicts Section
		try {
			renderSourceConflictsSection(container, options);
		} catch (error) {
			console.error('[Charted Roots] Error rendering Source Conflicts section:', error);
		}
	}

	// === VAULT-WIDE ANALYSIS ===
	const analysisCard = options.createCard({
		title: '全库分析',
		icon: 'search',
		subtitle: '跨所有实体的全面数据质量报告'
	});
	const analysisContent = analysisCard.querySelector('.crc-card__content') as HTMLElement;

	// Explanation
	const analysisExplanation = analysisContent.createDiv({ cls: 'crc-info-callout crc-mb-3' });
	analysisExplanation.createEl('p', {
		text: '扫描你的谱系数据，识别缺失日期、无效值、' +
			'循环关系、孤立父母引用等数据问题。',
		cls: 'crc-text--small'
	});

	let selectedScope: 'all' | 'staging' | 'folder' = 'all';
	const selectedFolder = '';

	new Setting(analysisContent)
		.setName('分析范围')
		.setDesc('选择要分析的记录')
		.addDropdown(dropdown => dropdown
			.addOption('all', '所有记录（主树）')
			.addOption('staging', '仅暂存文件夹')
			.setValue(selectedScope)
			.onChange(value => {
				selectedScope = value as 'all' | 'staging' | 'folder';
			})
		);

	// Results container (initially empty)
	const resultsContainer = analysisContent.createDiv({ cls: 'crc-data-quality-results' });

	// Run analysis button
	new Setting(analysisContent)
		.setName('运行分析')
		.setDesc('扫描记录以查找数据质量问题')
		.addButton(button => button
			.setButtonText('分析')
			.setCta()
			.onClick(() => {
				runDataQualityAnalysis(resultsContainer, selectedScope, selectedFolder, options);
			}));

	addDataQualityDockButton(analysisCard, plugin);
	container.appendChild(analysisCard);

	// === CROSS-DOMAIN BATCH OPERATIONS ===
	const batchCard = options.createCard({
		title: '跨域批量操作',
		icon: 'zap',
		subtitle: '跨所有实体类型的标准化操作'
	});
	const batchContent = batchCard.querySelector('.crc-card__content') as HTMLElement;

	// Explanation
	const batchExplanation = batchContent.createDiv({ cls: 'crc-info-callout crc-mb-3' });
	batchExplanation.createEl('p', {
		text: '这些操作作用于人物、地点、事件和来源。应用前请使用预览查看将要更改的内容。实体专属操作请参阅各领域标签页（人物、地点等）。',
		cls: 'crc-text--small'
	});

	// Normalize dates
	new Setting(batchContent)
		.setName('规范化日期格式')
		.setDesc('将日期转换为标准的 YYYY-MM-DD 格式')
		.addButton(btn => btn
			.setButtonText('预览')
			.onClick(() => {
				void previewBatchOperation('dates', selectedScope, selectedFolder, options);
			})
		)
		.addButton(btn => btn
			.setButtonText('应用')
			.setCta()
			.onClick(() => void runBatchOperation('dates', selectedScope, selectedFolder, options))
		);

	// Normalize sex
	new Setting(batchContent)
		.setName('规范化性别值')
		.setDesc('标准化为 M/F 格式。使用生理性别以匹配历史记录和 GEDCOM 标准。')
		.addButton(btn => btn
			.setButtonText('预览')
			.onClick(() => void previewBatchOperation('sex', selectedScope, selectedFolder, options))
		)
		.addButton(btn => btn
			.setButtonText('应用')
			.setCta()
			.onClick(() => void runBatchOperation('sex', selectedScope, selectedFolder, options))
		);

	// Clear orphan references
	new Setting(batchContent)
		.setName('清除孤立引用')
		.setDesc('移除指向不存在记录的父母引用')
		.addButton(btn => btn
			.setButtonText('预览')
			.onClick(() => void previewBatchOperation('orphans', selectedScope, selectedFolder, options))
		)
		.addButton(btn => setButtonDestructive(btn.setButtonText('应用'))
			.onClick(() => void runBatchOperation('orphans', selectedScope, selectedFolder, options))
		);

	// Repair missing relationship IDs
	new Setting(batchContent)
		.setName('修复缺失的关系 ID')
		.setDesc('从可解析的 wikilink 填充 _id 字段（例：从 father 填充 father_id）')
		.addButton(btn => btn
			.setButtonText('预览')
			.onClick(() => void previewBatchOperation('missing_ids', selectedScope, selectedFolder, options))
		)
		.addButton(btn => btn
			.setButtonText('应用')
			.setCta()
			.onClick(() => void runBatchOperation('missing_ids', selectedScope, selectedFolder, options))
		);

	// Repair misaligned children arrays
	new Setting(batchContent)
		.setName('修复错位的子女数组')
		.setDesc('重建错位的 children 和 children_id 数组，从父母链接中恢复丢失的子女')
		.addButton(btn => btn
			.setButtonText('预览')
			.onClick(() => void previewRepairMisalignedChildren(options.plugin, options.app, options.showTab))
		)
		.addButton(btn => setButtonDestructive(btn.setButtonText('应用'))
			.onClick(() => void repairMisalignedChildren(options.plugin, options.app, options.showTab))
		);

	// Migrate legacy type property (only show if cr_type is the primary)
	if (plugin.settings.noteTypeDetection?.primaryTypeProperty === 'cr_type') {
		new Setting(batchContent)
			.setName('迁移旧版 type 属性')
			.setDesc('将所有 Charted Roots 笔记的 type 转换为 cr_type')
			.addButton(btn => btn
				.setButtonText('预览')
				.onClick(() => void previewBatchOperation('legacy_type', selectedScope, selectedFolder, options))
			)
			.addButton(btn => btn
				.setButtonText('应用')
				.setCta()
				.onClick(() => void runBatchOperation('legacy_type', selectedScope, selectedFolder, options))
			);
	}

	// Flatten nested properties
	new Setting(batchContent)
		.setName('扁平化嵌套属性')
		.setDesc('将嵌套 YAML（例：coordinates: { lat, long }）转换为扁平属性')
		.addButton(btn => btn
			.setButtonText('打开')
			.setCta()
			.onClick(() => {
				new FlattenNestedPropertiesModal(app).open();
			})
		);

	// Fix mistyped property values (#758)
	new Setting(batchContent)
		.setName('修复类型错误的属性值')
		.setDesc('将以数字或日期存储的类型字段（例：event_type: 1850）转换回文本')
		.addButton(btn => btn
			.setButtonText('打开')
			.setCta()
			.onClick(() => {
				new FixMistypedValuesModal(app).open();
			})
		);

	container.appendChild(batchCard);

	// === DATA ENHANCEMENT ===
	// Data Enhancement card
	const enhancementCard = options.createCard({
		title: '数据增强',
		icon: 'sparkles',
		subtitle: '基于现有数据创建缺失的笔记'
	});
	const enhancementContent = enhancementCard.querySelector('.crc-card__content') as HTMLElement;

	// Explanation
	const enhancementExplanation = enhancementContent.createDiv({ cls: 'crc-info-callout crc-mb-3' });
	enhancementExplanation.createEl('p', {
		text: '通过从人物和事件笔记中的地点字符串生成地点笔记来增强你的笔记。' +
			'对于从 CSV 导入的数据、手动录入的记录，或在不支持地点笔记之前创建的库很有用。',
		cls: 'crc-text--small'
	});

	// Generate place notes
	new Setting(enhancementContent)
		.setName('生成地点笔记')
		.setDesc('从地点字符串创建地点笔记，并更新引用以使用 wikilink')
		.addButton(btn => btn
			.setButtonText('打开')
			.setCta()
			.onClick(() => {
				new PlaceGeneratorModal(app, plugin.settings, {}, plugin.createPlaceGraphService()).open();
			})
		);

	container.appendChild(enhancementCard);

	// Data Tools card
	const toolsCard = options.createCard({
		title: '数据工具',
		icon: 'sliders',
		subtitle: '管理数据的实用工具'
	});
	const toolsContent = toolsCard.querySelector('.crc-card__content') as HTMLElement;

	// Explanation
	const toolsExplanation = toolsContent.createDiv({ cls: 'crc-info-callout crc-mb-3' });
	toolsExplanation.createEl('p', {
		text: '创建 Obsidian Bases，以类似电子表格的表视图查看和管理数据。',
		cls: 'crc-text--small'
	});

	const baseTypes = [
		{ value: 'people', label: '人物', command: 'charted-roots:create-base-template' },
		{ value: 'places', label: '地点', command: 'charted-roots:create-places-base-template' },
		{ value: 'events', label: '事件', command: 'charted-roots:create-events-base-template' },
		{ value: 'organizations', label: '组织', command: 'charted-roots:create-organizations-base-template' },
		{ value: 'sources', label: '来源', command: 'charted-roots:create-sources-base-template' },
		{ value: 'universes', label: '宇宙', command: 'charted-roots:create-universes-base-template' },
		{ value: 'research', label: '研究', command: 'charted-roots:create-research-base-template' }
	];

	let selectedBaseType = baseTypes[0];

	new Setting(toolsContent)
		.setName('创建 base')
		.setDesc('创建 Obsidian Base 以便用表格视图管理数据')
		.addDropdown(dropdown => dropdown
			.addOptions(Object.fromEntries(baseTypes.map(t => [t.value, t.label])))
			.setValue(selectedBaseType.value)
			.onChange(value => {
				selectedBaseType = baseTypes.find(t => t.value === value) || baseTypes[0];
			})
		)
		.addButton(btn => btn
			.setButtonText('创建')
			.setCta()
			.onClick(() => {
				options.closeModal();
				app.commands.executeCommandById(selectedBaseType.command);
			})
		);

	// Bulk media linking
	new Setting(toolsContent)
		.setName('批量关联媒体')
		.setDesc('一次将媒体文件关联到多个实体（人物、事件、地点等）')
		.addButton(btn => btn
			.setButtonText('打开')
			.onClick(() => {
				new BulkMediaLinkModal(app, plugin).open();
			})
		);

	container.appendChild(toolsCard);
}

// ---------------------------------------------------------------------------
// Research Needed Section
// ---------------------------------------------------------------------------

interface ResearchNeededItem {
	name: string;
	file: TFile;
	type: 'person' | 'event' | 'place';
	questions: string[];
}

function parseResearchQuestions(value: unknown): string[] {
	if (Array.isArray(value)) {
		return value.map(String).filter(s => s.trim().length > 0);
	}
	if (typeof value === 'string' && value.trim().length > 0) {
		return [value];
	}
	return [];
}

function renderResearchNeededSection(container: HTMLElement, options: DataQualityTabOptions): void {
	const { plugin, app } = options;

	// Query all entities with needs_research property
	const items: ResearchNeededItem[] = [];

	// Query people
	const familyGraph = options.getCachedFamilyGraph();
	const allPeople = familyGraph.getAllPeople();
	for (const person of allPeople) {
		const cache = app.metadataCache.getFileCache(person.file);
		const questions = parseResearchQuestions(cache?.frontmatter?.needs_research);
		if (questions.length > 0) {
			items.push({
				name: person.name,
				file: person.file,
				type: 'person',
				questions
			});
		}
	}

	// Query events
	const eventService = new EventService(app, plugin.settings);
	const allEvents = eventService.getAllEvents();
	for (const event of allEvents) {
		const cache = app.metadataCache.getFileCache(event.file);
		const questions = parseResearchQuestions(cache?.frontmatter?.needs_research);
		if (questions.length > 0) {
			items.push({
				name: event.title,
				file: event.file,
				type: 'event',
				questions
			});
		}
	}

	// Query places
	// PlaceNode has filePath (string) rather than file (TFile), so resolve it
	const placeGraph = plugin.createPlaceGraphService();
	const allPlaces = placeGraph.getAllPlaces();
	for (const place of allPlaces) {
		const placeFile = app.vault.getAbstractFileByPath(place.filePath);
		if (!(placeFile instanceof TFile)) continue;
		const cache = app.metadataCache.getFileCache(placeFile);
		const questions = parseResearchQuestions(cache?.frontmatter?.needs_research);
		if (questions.length > 0) {
			items.push({
				name: place.name,
				file: placeFile,
				type: 'place',
				questions
			});
		}
	}

	// Don't render card if no items
	if (items.length === 0) {
		return;
	}

	// Create card
	const card = options.createCard({
		title: '待研究',
		icon: 'help-circle',
		subtitle: '已标记需进一步研究的实体'
	});
	const section = card.querySelector('.crc-card__content') as HTMLElement;
	section.addClass('crc-research-needed-section');

	// Summary stats
	const statsRow = section.createDiv({ cls: 'crc-schema-summary-row' });

	// Total entities
	const totalStat = statsRow.createDiv({ cls: 'crc-schema-stat' });
	setIcon(totalStat.createSpan({ cls: 'crc-schema-stat-icon' }), 'flag');
	totalStat.createSpan({
		text: `${items.length} 个实体`,
		cls: 'crc-schema-stat-text'
	});

	// Total questions
	const totalQuestions = items.reduce((sum, item) => sum + item.questions.length, 0);
	const questionsStat = statsRow.createDiv({ cls: 'crc-schema-stat crc-schema-stat-warning' });
	setIcon(questionsStat.createSpan({ cls: 'crc-schema-stat-icon' }), 'help-circle');
	questionsStat.createSpan({
		text: `${totalQuestions} 个问题`,
		cls: 'crc-schema-stat-text'
	});

	// Count by type
	const personCount = items.filter(i => i.type === 'person').length;
	const eventCount = items.filter(i => i.type === 'event').length;
	const placeCount = items.filter(i => i.type === 'place').length;

	if (personCount > 0) {
		const personStat = statsRow.createDiv({ cls: 'crc-schema-stat' });
		setIcon(personStat.createSpan({ cls: 'crc-schema-stat-icon' }), 'user');
		personStat.createSpan({
			text: `${personCount} 位人物`,
			cls: 'crc-schema-stat-text'
		});
	}
	if (eventCount > 0) {
		const eventStat = statsRow.createDiv({ cls: 'crc-schema-stat' });
		setIcon(eventStat.createSpan({ cls: 'crc-schema-stat-icon' }), 'calendar');
		eventStat.createSpan({
			text: `${eventCount} 个事件`,
			cls: 'crc-schema-stat-text'
		});
	}
	if (placeCount > 0) {
		const placeStat = statsRow.createDiv({ cls: 'crc-schema-stat' });
		setIcon(placeStat.createSpan({ cls: 'crc-schema-stat-icon' }), 'map-pin');
		placeStat.createSpan({
			text: `${placeCount} 个地点`,
			cls: 'crc-schema-stat-text'
		});
	}

	// List of items
	const list = section.createDiv({ cls: 'crc-research-needed-list' });

	for (const item of items) {
		const itemEl = list.createDiv({ cls: 'crc-research-needed-item' });

		// Icon by type
		const iconEl = itemEl.createSpan({ cls: 'crc-research-needed-icon' });
		const iconName = item.type === 'person' ? 'user' : item.type === 'event' ? 'calendar' : 'map-pin';
		setIcon(iconEl, iconName);

		// Content
		const contentEl = itemEl.createDiv({ cls: 'crc-research-needed-content' });

		// Clickable name
		const nameLink = contentEl.createEl('a', {
			text: item.name,
			cls: 'crc-link',
			href: '#'
		});
		nameLink.addEventListener('click', (e) => {
			e.preventDefault();
			options.closeModal();
			void app.workspace.openLinkText(item.file.path, '', false);
		});

		// Questions as badges
		const questionsEl = contentEl.createDiv({ cls: 'crc-research-needed-questions' });
		for (const question of item.questions) {
			const badge = questionsEl.createSpan({
				cls: 'crc-research-needed-question',
				text: question
			});
			badge.setAttribute('title', question);
		}
	}

	container.appendChild(card);
}

// ---------------------------------------------------------------------------
// Research Gaps Section
// ---------------------------------------------------------------------------

function renderResearchGapsSection(container: HTMLElement, options: DataQualityTabOptions): void {
	const { plugin, app } = options;

	// Create card for Research Gaps
	const card = options.createCard({
		title: '研究缺口',
		icon: 'search',
		subtitle: '追踪无来源和来源薄弱的事实'
	});
	const section = card.querySelector('.crc-card__content') as HTMLElement;
	section.addClass('crc-research-gaps-section');

	// Explanation
	const explanation = section.createDiv({ cls: 'crc-info-callout crc-mb-3' });
	explanation.createEl('p', {
		text: '识别需要来源或更强证据的事实。将研究精力集中在文档的缺口上。',
		cls: 'crc-text--small'
	});

	// Header actions
	const header = section.createDiv({ cls: 'crc-section-header' });

	const headerActions = header.createDiv({ cls: 'crc-section-header-actions' });

	// Export button
	const exportBtn = headerActions.createEl('button', {
		cls: 'crc-icon-button',
		attr: { 'aria-label': '将研究缺口导出为 CSV' }
	});
	setIcon(exportBtn, 'download');
	exportBtn.addEventListener('click', () => {
		exportResearchGapsToCSV(app, plugin);
	});

	const sourcesLink = headerActions.createEl('button', {
		cls: 'crc-link-button',
		text: '打开来源标签页'
	});
	setIcon(sourcesLink.createSpan({ cls: 'crc-button-icon-right' }), 'external-link');
	sourcesLink.addEventListener('click', () => {
		options.showTab('sources');
	});

	// Get research gaps data
	const evidenceService = new EvidenceService(app, plugin.settings);
	const gaps = evidenceService.getResearchGaps(10);

	// Summary stats
	const statsRow = section.createDiv({ cls: 'crc-schema-summary-row' });

	// People tracked
	const trackedStat = statsRow.createDiv({ cls: 'crc-schema-stat' });
	setIcon(trackedStat.createSpan({ cls: 'crc-schema-stat-icon' }), 'users');
	trackedStat.createSpan({
		text: `${gaps.totalPeopleTracked} 位已追踪`,
		cls: 'crc-schema-stat-text'
	});

	// Count total unsourced
	const totalUnsourced = Object.values(gaps.unsourcedByFact).reduce((a, b) => a + b, 0);
	const unsourcedStat = statsRow.createDiv({ cls: 'crc-schema-stat crc-schema-stat-warning' });
	setIcon(unsourcedStat.createSpan({ cls: 'crc-schema-stat-icon' }), 'alert-triangle');
	unsourcedStat.createSpan({
		text: `${totalUnsourced} 项无来源事实`,
		cls: 'crc-schema-stat-text'
	});

	// Count weakly sourced
	const totalWeakly = Object.values(gaps.weaklySourcedByFact).reduce((a, b) => a + b, 0);
	const weaklyStat = statsRow.createDiv({ cls: 'crc-schema-stat crc-schema-stat-info' });
	setIcon(weaklyStat.createSpan({ cls: 'crc-schema-stat-icon' }), 'info');
	weaklyStat.createSpan({
		text: `${totalWeakly} 项来源薄弱`,
		cls: 'crc-schema-stat-text'
	});

	// Quality filter dropdown
	const filterRow = section.createDiv({ cls: 'crc-filter-row' });
	filterRow.createSpan({ text: '筛选依据：', cls: 'crc-filter-label' });
	const qualityFilter = filterRow.createEl('select', { cls: 'dropdown crc-filter-select' });
	qualityFilter.createEl('option', { value: 'all', text: '所有研究缺口' });
	qualityFilter.createEl('option', { value: 'unsourced', text: '仅无来源' });
	qualityFilter.createEl('option', { value: 'weakly-sourced', text: '仅来源薄弱' });
	qualityFilter.createEl('option', { value: 'needs-primary', text: '需要一手来源' });

	// Store current filter state
	let currentQualityFilter = 'all';

	// Re-render function for when filter changes
	const rerenderBreakdown = (): void => {
		// Remove existing breakdown and people sections
		section.querySelectorAll('.crc-research-gaps-breakdown, .crc-research-gaps-lowest').forEach(el => el.remove());

		// Filter data based on selection
		const filteredGaps = filterResearchGapsByQuality(gaps, currentQualityFilter);

		// Render breakdown
		renderResearchGapsBreakdown(section, filteredGaps, currentQualityFilter);

		// Render lowest coverage people
		renderLowestCoveragePeople(section, filteredGaps.lowestCoverage, evidenceService, currentQualityFilter, app);
	};

	qualityFilter.addEventListener('change', () => {
		currentQualityFilter = qualityFilter.value;
		rerenderBreakdown();
	});

	// If no tracking data, show empty state
	if (gaps.totalPeopleTracked === 0 && gaps.totalPeopleUntracked > 0) {
		const emptyState = section.createDiv({ cls: 'crc-empty-state crc-compact' });
		setIcon(emptyState.createSpan({ cls: 'crc-empty-icon' }), 'file-search');
			emptyState.createEl('p', {
				text: `未找到事实级来源追踪数据。请向人物笔记添加 sourced_* 属性以追踪研究覆盖率。`
			});
		container.appendChild(card);
		return;
	}

	// Render initial breakdown and people list
	renderResearchGapsBreakdown(section, gaps, 'all');
	renderLowestCoveragePeople(section, gaps.lowestCoverage, evidenceService, 'all', app);

	container.appendChild(card);
}

// ---------------------------------------------------------------------------
// Source Conflicts Section
// ---------------------------------------------------------------------------

function renderSourceConflictsSection(container: HTMLElement, options: DataQualityTabOptions): void {
	const { plugin, app } = options;

	const proofService = plugin.getProofSummaryService();
	const conflictedProofs = proofService.getProofsByStatus('conflicted');

	// Create card for Source Conflicts
	const card = options.createCard({
		title: '来源冲突',
		icon: 'scale',
		subtitle: '解决研究中的冲突证据'
	});
	const section = card.querySelector('.crc-card__content') as HTMLElement;
	section.addClass('crc-conflicts-section');

	// Explanation
	const explanation = section.createDiv({ cls: 'crc-info-callout crc-mb-3' });
	explanation.createEl('p', {
		text: '追踪并解决多个来源对同一事实提供冲突信息的情况。',
		cls: 'crc-text--small'
	});

	// Summary stats
	const statsRow = section.createDiv({ cls: 'crc-schema-summary-row' });

	// Count of conflicted proofs
	const conflictStat = statsRow.createDiv({
		cls: `crc-schema-stat ${conflictedProofs.length > 0 ? 'crc-schema-stat-warning' : ''}`
	});
	const conflictIcon = conflictStat.createSpan({ cls: 'crc-schema-stat-icon' });
	setIcon(conflictIcon, conflictedProofs.length > 0 ? 'alert-triangle' : 'check');
	conflictStat.createSpan({
		text: `${conflictedProofs.length} 个未解决的冲突`,
		cls: 'crc-schema-stat-text'
	});

	// Total proofs
	const allProofs = proofService.getAllProofs();
	const proofStat = statsRow.createDiv({ cls: 'crc-schema-stat' });
	const proofIcon = proofStat.createSpan({ cls: 'crc-schema-stat-icon' });
	setIcon(proofIcon, 'scale');
	proofStat.createSpan({
		text: `${allProofs.length} 份证明摘要`,
		cls: 'crc-schema-stat-text'
	});

	// Empty state if no proofs
	if (allProofs.length === 0) {
		const emptyState = section.createDiv({ cls: 'crc-empty-state crc-compact' });
		const emptyIcon = emptyState.createSpan({ cls: 'crc-empty-icon' });
		setIcon(emptyIcon, 'scale');
		emptyState.createEl('p', {
			text: '尚未创建证明摘要。使用证明摘要记录你的研究推理并解决冲突证据。'
		});

		// Buttons container
		const buttonRow = emptyState.createDiv({ cls: 'crc-empty-state-buttons' });

		// Create proof button
		new ButtonComponent(buttonRow)
			.setButtonText('创建证明摘要')
			.setCta()
			.onClick(() => {
				new CreateProofModal(app, plugin, {
					onSuccess: () => {
						renderDataQualityTab(options);
					}
				}).open();
			});

		// View templates button
		const templateBtn = buttonRow.createEl('button', {
			cls: 'crc-btn',
			text: '查看模板'
		});
		const templateIcon = createLucideIcon('file-code', 14);
		templateBtn.insertBefore(templateIcon, templateBtn.firstChild);
		templateBtn.addEventListener('click', () => {
			new TemplateSnippetsModal(app, 'proof', plugin.settings.propertyAliases).open();
		});

		container.appendChild(card);
		return;
	}

	// If no conflicts, show success state
	if (conflictedProofs.length === 0) {
		const successState = section.createDiv({ cls: 'crc-dq-no-issues' });
		const successIcon = successState.createDiv({ cls: 'crc-dq-no-issues-icon' });
		setIcon(successIcon, 'check');
		successState.createSpan({ text: '没有未解决的来源冲突' });
		container.appendChild(card);
		return;
	}

	// Show conflicted proofs
	const conflictList = section.createDiv({ cls: 'crc-conflicts-list' });

	for (const proof of conflictedProofs) {
		renderConflictItem(conflictList, proof, app);
	}

	container.appendChild(card);
}

// ---------------------------------------------------------------------------
// Conflict Item Rendering
// ---------------------------------------------------------------------------

function renderConflictItem(container: HTMLElement, proof: ProofSummaryNote, app: App): void {
	const item = container.createDiv({ cls: 'crc-conflict-item' });

	// Header with alert icon
	const header = item.createDiv({ cls: 'crc-conflict-item-header' });
	const alertIcon = header.createSpan({ cls: 'crc-conflict-icon' });
	setIcon(alertIcon, 'alert-triangle');

	// Title (clickable)
	const title = header.createSpan({ cls: 'crc-conflict-title', text: proof.title });
	title.addEventListener('click', () => {
		void app.workspace.openLinkText(proof.filePath, '', true);
	});

	// Fact type badge
	header.createSpan({
		cls: 'crc-proof-badge',
		text: FACT_KEY_LABELS[proof.factType]
	});

	// Subject person
	const personRow = item.createDiv({ cls: 'crc-conflict-person' });
	const personIcon = personRow.createSpan();
	setIcon(personIcon, 'user');
	personRow.createSpan({ text: proof.subjectPerson.replace(/\[\[|\]\]/g, '') });

	// Conflicting evidence
	const evidenceSection = item.createDiv({ cls: 'crc-conflict-evidence' });
	evidenceSection.createSpan({ cls: 'crc-conflict-evidence-label', text: '冲突证据：' });

	const evidenceList = evidenceSection.createDiv({ cls: 'crc-conflict-evidence-list' });

	for (const ev of proof.evidence) {
		const evItem = evidenceList.createDiv({
			cls: `crc-conflict-evidence-item ${ev.supports === 'conflicts' ? 'crc-conflict-evidence-item--conflicts' : ''}`
		});

		// Support indicator
		const supportIcon = evItem.createSpan({ cls: 'crc-conflict-support-icon' });
		if (ev.supports === 'conflicts') {
			setIcon(supportIcon, 'x');
		} else {
			setIcon(supportIcon, 'check');
		}

		// Source name
		evItem.createSpan({
			cls: 'crc-conflict-source',
			text: ev.source.replace(/\[\[|\]\]/g, '')
		});

		// Information (claim)
		if (ev.information) {
			evItem.createSpan({
				cls: 'crc-conflict-claim',
				text: `: "${ev.information}"`
			});
		}
	}

	// Resolve button
	const actions = item.createDiv({ cls: 'crc-conflict-actions' });
	const resolveBtn = actions.createEl('button', {
		cls: 'crc-btn crc-btn--small',
		text: '打开以解决'
	});
	resolveBtn.addEventListener('click', () => {
		void app.workspace.openLinkText(proof.filePath, '', true);
	});
}

// ---------------------------------------------------------------------------
// Research Gaps helpers
// ---------------------------------------------------------------------------

function filterResearchGapsByQuality(
	gaps: ResearchGapsSummary,
	filter: string
): ResearchGapsSummary {
	if (filter === 'all') {
		return gaps;
	}

	// Create filtered copy
	const filtered: ResearchGapsSummary = {
		totalPeopleTracked: gaps.totalPeopleTracked,
		totalPeopleUntracked: gaps.totalPeopleUntracked,
		unsourcedByFact: { ...gaps.unsourcedByFact },
		weaklySourcedByFact: { ...gaps.weaklySourcedByFact },
		lowestCoverage: []
	};

	// Filter the people list based on selected criteria
	for (const person of gaps.lowestCoverage) {
		const hasMatchingGap = person.facts.some(fact => {
			switch (filter) {
				case 'unsourced':
					return fact.status === 'unsourced';
				case 'weakly-sourced':
					return fact.status === 'weakly-sourced';
				case 'needs-primary':
					// Any fact that doesn't have a primary source
					return fact.bestQuality !== 'primary';
				default:
					return true;
			}
		});

		if (hasMatchingGap) {
			filtered.lowestCoverage.push(person);
		}
	}

	return filtered;
}

function renderResearchGapsBreakdown(
	container: HTMLElement,
	gaps: ResearchGapsSummary,
	filter: string
): void {
	// Determine which counts to show based on filter
	let factCounts: Record<FactKey, number>;
	let title: string;

	switch (filter) {
		case 'unsourced':
			factCounts = gaps.unsourcedByFact;
			title = '按类型统计的无来源事实';
			break;
		case 'weakly-sourced':
			factCounts = gaps.weaklySourcedByFact;
			title = '按类型统计的来源薄弱事实';
			break;
		case 'needs-primary':
			// Combine unsourced + weakly sourced for "needs primary"
			factCounts = {} as Record<FactKey, number>;
			for (const key of FACT_KEYS) {
				factCounts[key] = (gaps.unsourcedByFact[key] || 0) + (gaps.weaklySourcedByFact[key] || 0);
			}
			title = '需要一手来源的事实';
			break;
		default: // 'all'
			factCounts = gaps.unsourcedByFact;
			title = '按类型统计的无来源事实';
	}

	const totalCount = Object.values(factCounts).reduce((a, b) => a + b, 0);
	if (totalCount === 0) return;

	const breakdownSection = container.createDiv({ cls: 'crc-research-gaps-breakdown' });
	breakdownSection.createEl('h4', { text: title, cls: 'crc-section-subtitle' });

	const grid = breakdownSection.createDiv({ cls: 'crc-schema-error-grid' });

	// Sort by count descending
	const sortedFacts = (Object.entries(factCounts) as [FactKey, number][])
		.filter(([, count]) => count > 0)
		.sort((a, b) => b[1] - a[1]);

	for (const [factKey, count] of sortedFacts) {
		const item = grid.createDiv({ cls: 'crc-schema-error-item' });
		item.createSpan({ text: FACT_KEY_LABELS[factKey], cls: 'crc-schema-error-label' });
		item.createSpan({ text: String(count), cls: 'crc-schema-error-count' });
	}
}

function renderLowestCoveragePeople(
	container: HTMLElement,
	people: PersonResearchCoverage[],
	_evidenceService: EvidenceService,
	filter: string,
	app: App
): void {
	if (people.length === 0) {
		const emptySection = container.createDiv({ cls: 'crc-research-gaps-lowest' });
		emptySection.createEl('p', {
			text: `没有符合"${filter}"筛选条件的人物。`,
			cls: 'crc-text--muted'
		});
		return;
	}

	const lowestSection = container.createDiv({ cls: 'crc-research-gaps-lowest' });
	lowestSection.createEl('h4', { text: '研究覆盖率最低', cls: 'crc-section-subtitle' });

	const list = lowestSection.createDiv({ cls: 'crc-research-gaps-list' });

	for (const person of people.slice(0, 5)) {
		const item = list.createDiv({ cls: 'crc-research-gaps-person' });

		// Progress bar
		const progressBar = item.createDiv({ cls: 'crc-progress-bar crc-progress-bar--small' });
		const progressFill = progressBar.createDiv({ cls: 'crc-progress-bar__fill' });
		progressFill.style.setProperty('width', `${person.coveragePercent}%`);

		// Adjust color based on coverage
		if (person.coveragePercent < 25) {
			progressFill.addClass('crc-progress-bar__fill--danger');
		} else if (person.coveragePercent < 50) {
			progressFill.addClass('crc-progress-bar__fill--warning');
		}

		// Name and stats
		const info = item.createDiv({ cls: 'crc-research-gaps-info' });
		const nameLink = info.createEl('a', {
			text: person.personName,
			cls: 'crc-link',
			href: '#'
		});
		nameLink.addEventListener('click', (e) => {
			e.preventDefault();
			const file = app.vault.getAbstractFileByPath(person.filePath);
			if (file instanceof TFile) {
				void app.workspace.openLinkText(file.path, '', false);
			}
		});

		info.createSpan({
			text: `${person.coveragePercent}%（${person.sourcedFactCount}/${person.totalFactCount} 项事实）`,
			cls: 'crc-text-muted crc-text-small'
		});
	}
}

function exportResearchGapsToCSV(app: App, plugin: CanvasRootsPlugin): void {
	const evidenceService = new EvidenceService(app, plugin.settings);
	const gaps = evidenceService.getResearchGaps(1000); // Get all, not just top 10

	if (gaps.lowestCoverage.length === 0) {
		new Notice('没有可导出的研究覆盖率数据');
		return;
	}

	// Build CSV with headers
	const headers = ['Name', 'File Path', 'Coverage %', 'Sourced Facts', 'Total Facts', ...FACT_KEYS.map(k => FACT_KEY_LABELS[k])];
	const rows: string[][] = [];

	for (const person of gaps.lowestCoverage) {
		const row: string[] = [
			`"${person.personName.replace(/"/g, '""')}"`,
			`"${person.filePath.replace(/"/g, '""')}"`,
			String(person.coveragePercent),
			String(person.sourcedFactCount),
			String(person.totalFactCount)
		];

		// Add status for each fact type
		for (const factKey of FACT_KEYS) {
			const fact = person.facts.find(f => f.factKey === factKey);
			if (fact) {
				row.push(fact.status);
			} else {
				row.push('unsourced');
			}
		}

		rows.push(row);
	}

	const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');

	void navigator.clipboard.writeText(csv).then(() => {
		new Notice(`研究缺口已导出：${gaps.lowestCoverage.length} 位人物已作为 CSV 复制到剪贴板`);
	}).catch(() => {
		new Notice('复制到剪贴板失败');
	});
}

// ---------------------------------------------------------------------------
// Vault-wide analysis
// ---------------------------------------------------------------------------

function runDataQualityAnalysis(
	container: HTMLElement,
	scope: 'all' | 'staging' | 'folder',
	folderPath: string | undefined,
	options: DataQualityTabOptions
): void {
	const { plugin, app } = options;
	container.empty();

	// Show loading
	const loadingEl = container.createDiv({ cls: 'crc-loading' });
	loadingEl.createSpan({ text: '正在分析数据质量…' });

	// Create service and run analysis
	const familyGraph = plugin.createFamilyGraphService();
	const folderFilter = new FolderFilterService(plugin.settings);

	const dataQualityService = new DataQualityService(
		app,
		plugin.settings,
		familyGraph,
		folderFilter,
		plugin
	);
	if (plugin.personIndex) {
		dataQualityService.setPersonIndex(plugin.personIndex);
	}

	// Run analysis (synchronous)
	const report = dataQualityService.analyze({
		scope,
		folderPath,
	});

	// Clear loading and show results
	container.empty();
	renderDataQualityReport(container, report, options);
}

function renderDataQualityReport(
	container: HTMLElement,
	report: DataQualityReport,
	options: DataQualityTabOptions
): void {
	const { summary, issues } = report;

	// Summary section
	const summarySection = container.createDiv({ cls: 'crc-dq-summary' });

	// Quality score
	const scoreEl = summarySection.createDiv({ cls: 'crc-dq-score' });
	const scoreValue = scoreEl.createDiv({ cls: 'crc-dq-score-value' });
	scoreValue.setText(String(summary.qualityScore));

	// Color based on score
	if (summary.qualityScore >= 80) {
		scoreValue.addClass('crc-dq-score--good');
	} else if (summary.qualityScore >= 50) {
		scoreValue.addClass('crc-dq-score--warning');
	} else {
		scoreValue.addClass('crc-dq-score--poor');
	}

	scoreEl.createDiv({ cls: 'crc-dq-score-label', text: '质量得分' });

	// Stats grid
	const statsGrid = summarySection.createDiv({ cls: 'crc-dq-stats-grid' });

	renderDqStatCard(statsGrid, '已分析人物', String(summary.totalPeople), 'users');
	renderDqStatCard(statsGrid, '问题总数', String(summary.totalIssues), 'alert-circle');
	renderDqStatCard(statsGrid, '错误', String(summary.bySeverity.error), 'alert-triangle');
	renderDqStatCard(statsGrid, '警告', String(summary.bySeverity.warning), 'alert-circle');

	// Completeness metrics
	const completenessSection = container.createDiv({ cls: 'crc-section' });
	completenessSection.createEl('h3', { text: '数据完整度' });

	const completenessGrid = completenessSection.createDiv({ cls: 'crc-dq-completeness-grid' });

	const total = summary.totalPeople || 1; // Avoid division by zero
	renderCompletenessBar(completenessGrid, '出生日期', summary.completeness.withBirthDate, total);
	renderCompletenessBar(completenessGrid, '去世日期', summary.completeness.withDeathDate, total);
	renderCompletenessBar(completenessGrid, '性别', summary.completeness.withGender, total);
	renderCompletenessBar(completenessGrid, '父母双全', summary.completeness.withBothParents, total);
	renderCompletenessBar(completenessGrid, '至少一位父母', summary.completeness.withAtLeastOneParent, total);
	renderCompletenessBar(completenessGrid, '有配偶', summary.completeness.withSpouse, total);
	renderCompletenessBar(completenessGrid, '有子女', summary.completeness.withChildren, total);

	// Issues by category
	if (issues.length > 0) {
		const issuesSection = container.createDiv({ cls: 'crc-section' });
		issuesSection.createEl('h3', { text: '发现的问题' });

		// Category filter
		const filterRow = issuesSection.createDiv({ cls: 'crc-dq-filter-row' });
		let selectedCategory: IssueCategory | 'all' = 'all';
		let selectedSeverity: IssueSeverity | 'all' = 'all';

		new Setting(filterRow)
			.setName('分类')
			.addDropdown(dropdown => dropdown
				.addOption('all', '所有分类')
				.addOption('date_inconsistency', '日期问题')
				.addOption('relationship_inconsistency', '关系问题')
				.addOption('missing_data', '缺失数据')
				.addOption('data_format', '格式问题')
				.addOption('orphan_reference', '孤立引用')
				.addOption('nested_property', '嵌套属性')
				.setValue(selectedCategory)
				.onChange(value => {
					selectedCategory = value as IssueCategory | 'all';
					renderIssuesList(issuesList, issues, selectedCategory, selectedSeverity, options);
				})
			);

		new Setting(filterRow)
			.setName('严重程度')
			.addDropdown(dropdown => dropdown
				.addOption('all', '所有级别')
				.addOption('error', '仅错误')
				.addOption('warning', '仅警告')
				.addOption('info', '仅信息')
				.setValue(selectedSeverity)
				.onChange(value => {
					selectedSeverity = value as IssueSeverity | 'all';
					renderIssuesList(issuesList, issues, selectedCategory, selectedSeverity, options);
				})
			);

		const issuesList = issuesSection.createDiv({ cls: 'crc-dq-issues-list' });
		renderIssuesList(issuesList, issues, selectedCategory, selectedSeverity, options);
	} else {
		const noIssuesEl = container.createDiv({ cls: 'crc-dq-no-issues' });
		setIcon(noIssuesEl.createSpan({ cls: 'crc-dq-no-issues-icon' }), 'check');
		noIssuesEl.createSpan({ text: '未发现问题！你的数据看起来很好。' });
	}
}

function renderDqStatCard(
	container: HTMLElement,
	label: string,
	value: string,
	icon: LucideIconName
): void {
	const card = container.createDiv({ cls: 'crc-dq-stat-card' });
	const iconEl = card.createDiv({ cls: 'crc-dq-stat-icon' });
	setIcon(iconEl, icon);
	card.createDiv({ cls: 'crc-dq-stat-value', text: value });
	card.createDiv({ cls: 'crc-dq-stat-label', text: label });
}

function renderCompletenessBar(
	container: HTMLElement,
	label: string,
	count: number,
	total: number
): void {
	const percent = Math.round((count / total) * 100);
	const row = container.createDiv({ cls: 'crc-dq-completeness-row' });

	row.createDiv({ cls: 'crc-dq-completeness-label', text: label });

	const barContainer = row.createDiv({ cls: 'crc-dq-completeness-bar-container' });
	const bar = barContainer.createDiv({ cls: 'crc-dq-completeness-bar' });
	bar.style.setProperty('width', `${percent}%`);

	// Color based on percentage
	if (percent >= 80) {
		bar.addClass('crc-dq-completeness-bar--good');
	} else if (percent >= 50) {
		bar.addClass('crc-dq-completeness-bar--warning');
	} else {
		bar.addClass('crc-dq-completeness-bar--poor');
	}

	row.createDiv({ cls: 'crc-dq-completeness-value', text: `${count}/${total} (${percent}%)` });
}

function renderIssuesList(
	container: HTMLElement,
	issues: DataQualityIssue[],
	category: IssueCategory | 'all',
	severity: IssueSeverity | 'all',
	options: DataQualityTabOptions
): void {
	container.empty();

	const filtered = issues.filter(issue => {
		if (category !== 'all' && issue.category !== category) return false;
		if (severity !== 'all' && issue.severity !== severity) return false;
		return true;
	});

	if (filtered.length === 0) {
		container.createDiv({
			cls: 'crc-dq-no-matches',
			text: '没有符合所选筛选条件的问题。'
		});
		return;
	}

	// Show count
	container.createDiv({
		cls: 'crc-dq-issues-count',
		text: `显示 ${filtered.length} 个问题`
	});

	// Render issues (limit to first 100 for performance)
	const displayIssues = filtered.slice(0, 100);
	for (const issue of displayIssues) {
		renderIssueItem(container, issue, options);
	}

	if (filtered.length > 100) {
		container.createDiv({
			cls: 'crc-dq-more-issues',
			text: `… 另有 ${filtered.length - 100} 个问题`
		});
	}
}

function renderIssueItem(container: HTMLElement, issue: DataQualityIssue, options: DataQualityTabOptions): void {
	const item = container.createDiv({ cls: `crc-dq-issue crc-dq-issue--${issue.severity}` });

	// Severity icon
	const iconEl = item.createDiv({ cls: 'crc-dq-issue-icon' });
	const iconName = issue.severity === 'error' ? 'alert-triangle' :
		issue.severity === 'warning' ? 'alert-circle' : 'info';
	setIcon(iconEl, iconName);

	// Content
	const content = item.createDiv({ cls: 'crc-dq-issue-content' });

	// Person name as clickable link
	const personLink = content.createEl('a', {
		cls: 'crc-dq-issue-person',
		text: issue.person.name
	});
	personLink.addEventListener('click', (e) => {
		e.preventDefault();
		// Open the person's file
		const file = issue.person.file;
		if (file) {
			void options.app.workspace.openLinkText(file.path, '', false);
			options.closeModal();
		}
	});

	// Issue message
	content.createDiv({ cls: 'crc-dq-issue-message', text: issue.message });

	// Category badge
	const badge = item.createDiv({ cls: 'crc-dq-issue-badge' });
	badge.setText(formatCategoryName(issue.category));
}

function formatCategoryName(category: IssueCategory): string {
	const names: Record<IssueCategory, string> = {
		date_inconsistency: '日期',
		relationship_inconsistency: '关系',
		missing_data: '缺失数据',
		data_format: '格式',
		orphan_reference: '孤立引用',
		nested_property: '嵌套',
		legacy_type_property: '旧版 type',
		legacy_membership: '旧版成员关系',
	};
	return names[category] || category;
}

// ---------------------------------------------------------------------------
// Dock button
// ---------------------------------------------------------------------------

function addDataQualityDockButton(card: HTMLElement, plugin: CanvasRootsPlugin): void {
	const header = card.querySelector('.crc-card__header');
	if (!header) return;

	const dockBtn = activeDocument.createElement('button');
	dockBtn.className = 'crc-card__dock-btn clickable-icon';
	dockBtn.setAttribute('aria-label', '在侧边栏中打开');
	setIcon(dockBtn, 'panel-right');
	dockBtn.addEventListener('click', (e) => {
		e.stopPropagation();
		void plugin.activateDataQualityView();
	});
	header.appendChild(dockBtn);
}

// ---------------------------------------------------------------------------
// Dockable dashboard renderer
// ---------------------------------------------------------------------------

/**
 * Render a read-only Data Quality dashboard for the dockable view.
 *
 * Shows Research Gaps, Source Conflicts, and Vault-wide Analysis results.
 * Management features (batch ops, wizards, data tools) remain modal-only.
 */
export function renderDataQualityDashboard(options: DataQualityDashboardOptions): void {
	const { container, plugin } = options;
	const app = plugin.app;
	container.empty();

	let currentFilter: DataQualityFilter = options.initialFilter ?? 'all';
	let currentSearch = options.initialSearch ?? '';

	const notifyStateChange = (): void => {
		options.onStateChange?.(currentFilter, currentSearch);
	};

	// --- Section 1: Research Gaps (conditional) ---
	if (plugin.settings.trackFactSourcing) {
		const gapsSection = container.createDiv({ cls: 'cr-dqv-section' });
		gapsSection.createEl('h3', { text: '研究缺口', cls: 'cr-dqv-section-title' });

		const evidenceService = new EvidenceService(app, plugin.settings);
		const gaps = evidenceService.getResearchGaps(10);

		if (gaps.totalPeopleTracked === 0 && gaps.totalPeopleUntracked > 0) {
			const emptyState = gapsSection.createDiv({ cls: 'crc-empty-state crc-compact' });
			setIcon(emptyState.createSpan({ cls: 'crc-empty-icon' }), 'file-search');
			emptyState.createEl('p', {
				text: '未找到事实级来源追踪数据。请向人物笔记添加 sourced_* 属性以追踪研究覆盖率。'
			});
		} else {
			// Summary stats
			const statsRow = gapsSection.createDiv({ cls: 'crc-schema-summary-row' });

			const trackedStat = statsRow.createDiv({ cls: 'crc-schema-stat' });
			setIcon(trackedStat.createSpan({ cls: 'crc-schema-stat-icon' }), 'users');
			trackedStat.createSpan({
				text: `${gaps.totalPeopleTracked} 位已追踪`,
				cls: 'crc-schema-stat-text'
			});

			const totalUnsourced = Object.values(gaps.unsourcedByFact).reduce((a, b) => a + b, 0);
			const unsourcedStat = statsRow.createDiv({ cls: 'crc-schema-stat crc-schema-stat-warning' });
			setIcon(unsourcedStat.createSpan({ cls: 'crc-schema-stat-icon' }), 'alert-triangle');
			unsourcedStat.createSpan({
				text: `${totalUnsourced} 项无来源事实`,
				cls: 'crc-schema-stat-text'
			});

			const totalWeakly = Object.values(gaps.weaklySourcedByFact).reduce((a, b) => a + b, 0);
			const weaklyStat = statsRow.createDiv({ cls: 'crc-schema-stat crc-schema-stat-info' });
			setIcon(weaklyStat.createSpan({ cls: 'crc-schema-stat-icon' }), 'info');
			weaklyStat.createSpan({
				text: `${totalWeakly} 项来源薄弱`,
				cls: 'crc-schema-stat-text'
			});

			// Breakdown and lowest coverage
			renderResearchGapsBreakdown(gapsSection, gaps, 'all');
			renderLowestCoveragePeople(gapsSection, gaps.lowestCoverage, evidenceService, 'all', app);
		}

		// --- Section 2: Source Conflicts (conditional, same gate) ---
		const conflictsSection = container.createDiv({ cls: 'cr-dqv-section' });
		conflictsSection.createEl('h3', { text: '来源冲突', cls: 'cr-dqv-section-title' });

		const proofService = plugin.getProofSummaryService();
		const conflictedProofs = proofService.getProofsByStatus('conflicted');
		const allProofs = proofService.getAllProofs();

		// Summary
		const conflictStatsRow = conflictsSection.createDiv({ cls: 'crc-schema-summary-row' });

		const conflictStat = conflictStatsRow.createDiv({
			cls: `crc-schema-stat ${conflictedProofs.length > 0 ? 'crc-schema-stat-warning' : ''}`
		});
		setIcon(conflictStat.createSpan({ cls: 'crc-schema-stat-icon' }),
			conflictedProofs.length > 0 ? 'alert-triangle' : 'check');
		conflictStat.createSpan({
			text: `${conflictedProofs.length} 个未解决的冲突`,
			cls: 'crc-schema-stat-text'
		});

		const proofStat = conflictStatsRow.createDiv({ cls: 'crc-schema-stat' });
		setIcon(proofStat.createSpan({ cls: 'crc-schema-stat-icon' }), 'scale');
		proofStat.createSpan({
			text: `${allProofs.length} 份证明摘要`,
			cls: 'crc-schema-stat-text'
		});

		if (conflictedProofs.length === 0) {
			const successState = conflictsSection.createDiv({ cls: 'crc-dq-no-issues' });
			setIcon(successState.createDiv({ cls: 'crc-dq-no-issues-icon' }), 'check');
			successState.createSpan({ text: '没有未解决的来源冲突' });
		} else {
			const conflictList = conflictsSection.createDiv({ cls: 'crc-conflicts-list' });
			for (const proof of conflictedProofs) {
				renderConflictItem(conflictList, proof, app);
			}
		}
	}

	// --- Section 3: Vault-wide Analysis (always shown, auto-run) ---
	const analysisSection = container.createDiv({ cls: 'cr-dqv-section' });
	analysisSection.createEl('h3', { text: '全库分析', cls: 'cr-dqv-section-title' });

	const resultsContainer = analysisSection.createDiv({ cls: 'crc-data-quality-results' });

	// Auto-run analysis
	const loadingEl = resultsContainer.createDiv({ cls: 'crc-loading' });
	loadingEl.createSpan({ text: '正在分析数据质量…' });

	const familyGraph = plugin.createFamilyGraphService();
	const folderFilter = new FolderFilterService(plugin.settings);

	const dataQualityService = new DataQualityService(
		app,
		plugin.settings,
		familyGraph,
		folderFilter,
		plugin
	);
	if (plugin.personIndex) {
		dataQualityService.setPersonIndex(plugin.personIndex);
	}

	const report = dataQualityService.analyze({ scope: 'all' });
	resultsContainer.empty();

	const { summary, issues } = report;

	// Quality score
	const summaryDiv = resultsContainer.createDiv({ cls: 'crc-dq-summary' });
	const scoreEl = summaryDiv.createDiv({ cls: 'crc-dq-score' });
	const scoreValue = scoreEl.createDiv({ cls: 'crc-dq-score-value' });
	scoreValue.setText(String(summary.qualityScore));

	if (summary.qualityScore >= 80) {
		scoreValue.addClass('crc-dq-score--good');
	} else if (summary.qualityScore >= 50) {
		scoreValue.addClass('crc-dq-score--warning');
	} else {
		scoreValue.addClass('crc-dq-score--poor');
	}

	scoreEl.createDiv({ cls: 'crc-dq-score-label', text: '质量得分' });

	// Stats grid
	const statsGrid = summaryDiv.createDiv({ cls: 'crc-dq-stats-grid' });
	renderDqStatCard(statsGrid, '已分析人物', String(summary.totalPeople), 'users');
	renderDqStatCard(statsGrid, '问题总数', String(summary.totalIssues), 'alert-circle');
	renderDqStatCard(statsGrid, '错误', String(summary.bySeverity.error), 'alert-triangle');
	renderDqStatCard(statsGrid, '警告', String(summary.bySeverity.warning), 'alert-circle');

	// Completeness metrics
	const completenessDiv = resultsContainer.createDiv({ cls: 'crc-section' });
	completenessDiv.createEl('h3', { text: '数据完整度' });

	const completenessGrid = completenessDiv.createDiv({ cls: 'crc-dq-completeness-grid' });
	const total = summary.totalPeople || 1;
	renderCompletenessBar(completenessGrid, '出生日期', summary.completeness.withBirthDate, total);
	renderCompletenessBar(completenessGrid, '去世日期', summary.completeness.withDeathDate, total);
	renderCompletenessBar(completenessGrid, '性别', summary.completeness.withGender, total);
	renderCompletenessBar(completenessGrid, '父母双全', summary.completeness.withBothParents, total);
	renderCompletenessBar(completenessGrid, '至少一位父母', summary.completeness.withAtLeastOneParent, total);
	renderCompletenessBar(completenessGrid, '有配偶', summary.completeness.withSpouse, total);
	renderCompletenessBar(completenessGrid, '有子女', summary.completeness.withChildren, total);

	// Issues section
	if (issues.length > 0) {
		const issuesDiv = resultsContainer.createDiv({ cls: 'crc-section' });
		issuesDiv.createEl('h3', { text: '发现的问题' });

		// Filter row: severity filter + search
		const filterRow = issuesDiv.createDiv({ cls: 'crc-dq-filter-row' });

		const severitySelect = filterRow.createEl('select', { cls: 'dropdown crc-filter-select' });
		severitySelect.createEl('option', { value: 'all', text: '所有级别' });
		severitySelect.createEl('option', { value: 'errors', text: '仅错误' });
		severitySelect.createEl('option', { value: 'warnings', text: '仅警告' });
		severitySelect.createEl('option', { value: 'info', text: '仅信息' });
		severitySelect.value = currentFilter;

		const searchInput = filterRow.createEl('input', {
			cls: 'crc-filter-search',
			type: 'search',
			placeholder: '搜索问题…',
			value: currentSearch
		});

		const issuesList = issuesDiv.createDiv({ cls: 'crc-dq-issues-list' });

		const rerenderIssues = (): void => {
			issuesList.empty();

			const filtered = issues.filter(issue => {
				// Severity filter
				if (currentFilter === 'errors' && issue.severity !== 'error') return false;
				if (currentFilter === 'warnings' && issue.severity !== 'warning') return false;
				if (currentFilter === 'info' && issue.severity !== 'info') return false;

				// Search filter
				if (currentSearch) {
					const search = currentSearch.toLowerCase();
					const matchesName = issue.person.name.toLowerCase().includes(search);
					const matchesMessage = issue.message.toLowerCase().includes(search);
					if (!matchesName && !matchesMessage) return false;
				}

				return true;
			});

			if (filtered.length === 0) {
				issuesList.createDiv({
					cls: 'crc-dq-no-matches',
					text: '没有符合所选筛选条件的问题。'
				});
				return;
			}

			issuesList.createDiv({
				cls: 'crc-dq-issues-count',
				text: `显示 ${filtered.length} 个问题`
			});

			const displayIssues = filtered.slice(0, 100);
			for (const issue of displayIssues) {
				renderDashboardIssueItem(issuesList, issue, app);
			}

			if (filtered.length > 100) {
				issuesList.createDiv({
					cls: 'crc-dq-more-issues',
					text: `… 另有 ${filtered.length - 100} 个问题`
				});
			}
		};

		severitySelect.addEventListener('change', () => {
			currentFilter = severitySelect.value as DataQualityFilter;
			notifyStateChange();
			rerenderIssues();
		});

		searchInput.addEventListener('input', () => {
			currentSearch = searchInput.value;
			notifyStateChange();
			rerenderIssues();
		});

		rerenderIssues();
	} else {
		const noIssuesEl = resultsContainer.createDiv({ cls: 'crc-dq-no-issues' });
		setIcon(noIssuesEl.createSpan({ cls: 'crc-dq-no-issues-icon' }), 'check');
		noIssuesEl.createSpan({ text: '未发现问题！你的数据看起来很好。' });
	}
}

/**
 * Render a single issue item for the dockable dashboard.
 * Unlike renderIssueItem(), this does not close a modal when clicking a person.
 */
function renderDashboardIssueItem(container: HTMLElement, issue: DataQualityIssue, app: App): void {
	const item = container.createDiv({ cls: `crc-dq-issue crc-dq-issue--${issue.severity}` });

	// Severity icon
	const iconEl = item.createDiv({ cls: 'crc-dq-issue-icon' });
	const iconName = issue.severity === 'error' ? 'alert-triangle' :
		issue.severity === 'warning' ? 'alert-circle' : 'info';
	setIcon(iconEl, iconName);

	// Content
	const content = item.createDiv({ cls: 'crc-dq-issue-content' });

	// Person name as clickable link (opens note without closing modal)
	const personLink = content.createEl('a', {
		cls: 'crc-dq-issue-person',
		text: issue.person.name
	});
	personLink.addEventListener('click', (e) => {
		e.preventDefault();
		const file = issue.person.file;
		if (file) {
			void app.workspace.openLinkText(file.path, '', false);
		}
	});

	// Issue message
	content.createDiv({ cls: 'crc-dq-issue-message', text: issue.message });

	// Category badge
	const badge = item.createDiv({ cls: 'crc-dq-issue-badge' });
	badge.setText(formatCategoryName(issue.category));
}

// ---------------------------------------------------------------------------
// Cross-domain batch operations
// ---------------------------------------------------------------------------

async function previewBatchOperation(
	operation: 'dates' | 'sex' | 'orphans' | 'legacy_type' | 'missing_ids',
	scope: 'all' | 'staging' | 'folder',
	folderPath: string | undefined,
	options: DataQualityTabOptions
): Promise<void> {
	const { plugin, app } = options;

	// Create service
	const familyGraph = plugin.createFamilyGraphService();
	const folderFilter = new FolderFilterService(plugin.settings);

	const dataQualityService = new DataQualityService(
		app,
		plugin.settings,
		familyGraph,
		folderFilter,
		plugin
	);
	if (plugin.personIndex) {
		dataQualityService.setPersonIndex(plugin.personIndex);
	}

	// Get preview
	const preview = await dataQualityService.previewNormalization({ scope, folderPath });

	// Check if sex normalization is disabled
	const sexNormalizationDisabled = operation === 'sex' &&
		plugin.settings.sexNormalizationMode === 'disabled';

	// Show preview modal
	const modal = new BatchPreviewModal(
		app,
		operation,
		preview,
		async () => await runBatchOperation(operation, scope, folderPath, options),
		sexNormalizationDisabled
	);
	modal.open();
}

async function runBatchOperation(
	operation: 'dates' | 'sex' | 'orphans' | 'legacy_type' | 'missing_ids',
	scope: 'all' | 'staging' | 'folder',
	folderPath: string | undefined,
	options: DataQualityTabOptions
): Promise<void> {
	const { plugin, app } = options;

	// Create service
	const familyGraph = plugin.createFamilyGraphService();
	const folderFilter = new FolderFilterService(plugin.settings);

	const dataQualityService = new DataQualityService(
		app,
		plugin.settings,
		familyGraph,
		folderFilter,
		plugin
	);
	if (plugin.personIndex) {
		dataQualityService.setPersonIndex(plugin.personIndex);
	}

	let result: BatchOperationResult | undefined;
	let operationName: string;

	try {
		switch (operation) {
			case 'dates':
				operationName = '日期规范化';
				result = await dataQualityService.normalizeDateFormats({ scope, folderPath });
				break;
			case 'sex':
				operationName = '性别规范化';
				result = await dataQualityService.normalizeGenderValues({ scope, folderPath });
				break;
			case 'orphans':
				operationName = '孤立引用清除';
				result = await dataQualityService.clearOrphanReferences({ scope, folderPath });
				break;
			case 'legacy_type':
				operationName = '旧版 type 迁移';
				result = await dataQualityService.migrateLegacyTypeProperty({ scope, folderPath });
				break;
			case 'missing_ids':
				operationName = '缺失 ID 修复';
				result = await dataQualityService.repairMissingIds({ scope, folderPath });
				break;
		}

		if (!result) {
			new Notice(`${operation}：不支持的操作`);
			return;
		}

		// Show result
		if (result.modified > 0) {
			new Notice(`${operationName}：已修改 ${result.processed} 个文件中的 ${result.modified} 个`);
		} else {
			new Notice(`${operationName}：无需更改`);
		}

		if (result.errors.length > 0) {
			new Notice(`发生 ${result.errors.length} 个错误。详情请查看控制台。`);
			console.error('Batch operation errors:', result.errors);
		}

		// Refresh the family graph cache. The reload awaits each modified
		// file's metadata-cache refresh so reads after this point see the
		// just-written state (#547).
		await familyGraph.reloadCache(result.modifiedFiles);

	} catch (error) {
		new Notice(`${operation} 失败：${getErrorMessage(error)}`);
	}
}

// ---------------------------------------------------------------------------
// Person-specific batch operations (called from People tab)
// ---------------------------------------------------------------------------