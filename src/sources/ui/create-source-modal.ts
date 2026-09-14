/**
 * Create/Edit Source Modal
 *
 * Modal for creating new source notes or editing existing ones.
 * Includes person role assignment (#219).
 */

import { App, Modal, Setting, Notice, TFile, FuzzySuggestModal, setIcon, AbstractInputSuggest, TextComponent } from 'obsidian';
import type CanvasRootsPlugin from '../../../main';
import type { SourceConfidence, SourceNote, SourceClassification, InformationClassification, EvidenceClassification } from '../types/source-types';
import {
	getSourceTypesByCategory,
	SOURCE_CATEGORY_NAMES,
	PERSON_ROLE_PROPERTIES,
	PERSON_ROLE_LABELS,
	PERSON_ROLE_DESCRIPTIONS,
	SOURCE_CLASSIFICATION_LABELS,
	INFORMATION_CLASSIFICATION_LABELS,
	EVIDENCE_CLASSIFICATION_LABELS,
	type PersonRoleProperty
} from '../types/source-types';
import { ModalStatePersistence, renderResumePromptBanner } from '../../ui/modal-state-persistence';
import { PersonPickerModal, type PersonInfo } from '../../ui/person-picker';

/**
 * Person role entry for the modal
 */
interface PersonRoleEntry {
	/** Person cr_id */
	crId: string;
	/** Person display name */
	name: string;
	/** Role category */
	role: PersonRoleProperty;
	/** Optional role details */
	details?: string;
}

/**
 * Form data structure for persistence
 */
interface SourceFormData {
	title: string;
	sourceType: string;
	date: string;
	dateAccessed: string;
	repository: string;
	repositoryUrl: string;
	collection: string;
	location: string;
	confidence: SourceConfidence;
	sourceClassification: SourceClassification | '';
	informationClassification: InformationClassification | '';
	evidenceClassification: EvidenceClassification | '';
	transcription: string;
	media: string[];
	personRoles: PersonRoleEntry[];
	sourceParent: string;
	sourceParentId: string;
}

/** Supported media file extensions */
const MEDIA_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'pdf'];

/**
 * Modal for selecting media files from the vault
 */
class MediaFileSuggestModal extends FuzzySuggestModal<TFile> {
	private onSelect: (file: TFile) => void;

	constructor(app: App, onSelect: (file: TFile) => void) {
		super(app);
		this.onSelect = onSelect;
		this.setPlaceholder('选择媒体文件…');
	}

	getItems(): TFile[] {
		return this.app.vault.getFiles().filter(file => {
			const ext = file.extension.toLowerCase();
			return MEDIA_EXTENSIONS.includes(ext);
		});
	}

	getItemText(file: TFile): string {
		return file.path;
	}

	onChooseItem(file: TFile): void {
		this.onSelect(file);
	}
}

/**
 * Inline suggest for location field with autocomplete from existing locations
 */
class LocationSuggest extends AbstractInputSuggest<string> {
	private locations: string[];
	private textComponent: TextComponent;
	private onSelectValue: (value: string) => void;

	constructor(app: App, textComponent: TextComponent, locations: string[], onSelectValue: (value: string) => void) {
		super(app, textComponent.inputEl);
		this.textComponent = textComponent;
		this.locations = locations;
		this.onSelectValue = onSelectValue;
	}

	getSuggestions(inputStr: string): string[] {
		const lowerInput = inputStr.toLowerCase();
		return this.locations.filter(loc =>
			loc.toLowerCase().includes(lowerInput)
		);
	}

	renderSuggestion(location: string, el: HTMLElement): void {
		el.setText(location);
	}

	selectSuggestion(location: string): void {
		this.textComponent.setValue(location);
		this.onSelectValue(location);
		this.close();
	}
}

/**
 * Autocomplete suggest for source notes (#337)
 */
class SourceSuggest extends AbstractInputSuggest<SourceNote> {
	private sources: SourceNote[];
	private textComponent: TextComponent;
	private onSelectSource: (source: SourceNote) => void;

	constructor(app: App, textComponent: TextComponent, sources: SourceNote[], onSelectSource: (source: SourceNote) => void) {
		super(app, textComponent.inputEl);
		this.textComponent = textComponent;
		this.sources = sources;
		this.onSelectSource = onSelectSource;
	}

	getSuggestions(inputStr: string): SourceNote[] {
		const lowerInput = inputStr.toLowerCase();
		return this.sources.filter(s =>
			s.title.toLowerCase().includes(lowerInput)
		);
	}

	renderSuggestion(source: SourceNote, el: HTMLElement): void {
		el.setText(source.title);
	}

	selectSuggestion(source: SourceNote): void {
		this.textComponent.setValue(source.title);
		this.onSelectSource(source);
		this.close();
	}
}

/**
 * Options for opening the source modal
 */
export interface SourceModalOptions {
	/** Callback after successful create/update. Receives the file for create mode. */
	onSuccess?: (file?: TFile) => void;
	/** For edit mode: the file to edit */
	editFile?: TFile;
	/** For edit mode: the source data to edit */
	editSource?: SourceNote;
}

/**
 * Modal for creating or editing source notes
 */
export class CreateSourceModal extends Modal {
	private plugin: CanvasRootsPlugin;
	private onSuccess: (file?: TFile) => void;

	// Edit mode
	private editMode: boolean = false;
	private editingFile?: TFile;

	// Form fields
	private title: string = '';
	private sourceType: string = 'vital_record';
	private date: string = '';
	private dateAccessed: string = '';
	private repository: string = '';
	private repositoryUrl: string = '';
	private collection: string = '';
	private location: string = '';
	private confidence: SourceConfidence = 'unknown';
	private sourceClassification: SourceClassification | '' = '';
	private informationClassification: InformationClassification | '' = '';
	private evidenceClassification: EvidenceClassification | '' = '';
	private transcription: string = '';
	private media: string[] = [];

	// Source hierarchy (#337)
	private sourceParent: string = '';
	private sourceParentId: string = '';

	// Person roles (#219)
	private personRoles: PersonRoleEntry[] = [];

	// UI state
	private mediaListContainer: HTMLElement | null = null;
	private personRolesListContainer: HTMLElement | null = null;

	// State persistence
	private persistence?: ModalStatePersistence<SourceFormData>;
	private savedSuccessfully: boolean = false;
	private resumeBanner?: HTMLElement;

	constructor(app: App, plugin: CanvasRootsPlugin, optionsOrCallback?: SourceModalOptions | (() => void)) {
		super(app);
		this.plugin = plugin;

		// Handle both old callback style and new options object
		if (typeof optionsOrCallback === 'function') {
			this.onSuccess = optionsOrCallback;
		} else if (optionsOrCallback) {
			this.onSuccess = optionsOrCallback.onSuccess || (() => {});

			// Check for edit mode
			if (optionsOrCallback.editFile && optionsOrCallback.editSource) {
				this.editMode = true;
				this.editingFile = optionsOrCallback.editFile;
				const source = optionsOrCallback.editSource;

				// Populate form fields from existing source
				this.title = source.title;
				this.sourceType = source.sourceType;
				this.date = source.date || '';
				this.dateAccessed = source.dateAccessed || '';
				this.repository = source.repository || '';
				this.repositoryUrl = source.repositoryUrl || '';
				this.collection = source.collection || '';
				this.location = source.location || '';
				this.confidence = source.confidence;
				this.sourceClassification = source.sourceClassification || '';
				this.informationClassification = source.informationClassification || '';
				this.evidenceClassification = source.evidenceClassification || '';
				this.media = [...source.media];

				// Load source hierarchy (#337)
				this.sourceParent = source.sourceParent || '';
				this.sourceParentId = source.sourceParentId || '';

				// Load existing person roles (#219)
				this.loadPersonRolesFromSource(source);
			}
		} else {
			this.onSuccess = () => {};
		}

		// Set up persistence (only in create mode)
		if (!this.editMode) {
			this.persistence = new ModalStatePersistence<SourceFormData>(this.plugin, 'source');
		}
	}

	/**
	 * Load person roles from existing source note (#219)
	 */
	private loadPersonRolesFromSource(source: SourceNote): void {
		// Build a map of cr_id to person name for resolution
		const familyGraph = this.plugin.createFamilyGraphService();
		familyGraph.ensureCacheLoaded();

		const peopleMap = new Map<string, string>();
		for (const person of familyGraph.getAllPeople()) {
			peopleMap.set(person.crId, person.name);
		}

		// Parse each role array
		for (const prop of PERSON_ROLE_PROPERTIES) {
			const entries = source[prop];
			if (!entries || entries.length === 0) continue;

			for (const raw of entries) {
				// Parse wikilink: [[target]] or [[target|display]]
				const wikilinkMatch = raw.match(/^\[\[([^\]|]+)(?:\|([^\]]+))?\]\]$/);
				if (!wikilinkMatch) continue;

				const linkTarget = wikilinkMatch[1].trim();
				const displayText = wikilinkMatch[2]?.trim();

				// Try to find person by link target (could be file path or name)
				let personCrId: string | undefined;
				let personName: string | undefined;

				// Check if link target matches a person's file path or name
				for (const person of familyGraph.getAllPeople()) {
					const fileName = person.file.basename;
					if (linkTarget === fileName || linkTarget === person.file.path || linkTarget === person.name) {
						personCrId = person.crId;
						personName = person.name;
						break;
					}
				}

				if (!personCrId) {
					// Couldn't resolve - use link target as name
					personName = linkTarget;
					personCrId = linkTarget; // Use as pseudo-id
				}

				// Extract details from display text if present
				let details: string | undefined;
				if (displayText) {
					const detailsMatch = displayText.match(/^.+?\s*\(([^)]+)\)$/);
					if (detailsMatch) {
						details = detailsMatch[1].trim();
					}
				}

				this.personRoles.push({
					crId: personCrId,
					name: personName ?? '',
					role: prop,
					details
				});
			}
		}
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('cr-create-source-modal');

		contentEl.createEl('h2', { text: this.editMode ? '编辑来源' : '创建来源' });

		// Check for persisted state (only in create mode)
		if (this.persistence && !this.editMode) {
			const existingState = this.persistence.getValidState();
			if (existingState) {
				const timeAgo = this.persistence.getTimeAgoString(existingState);
				this.resumeBanner = renderResumePromptBanner(
					contentEl,
					timeAgo,
					() => {
						// Discard - clear state and remove banner
						void this.persistence?.clear();
						this.resumeBanner?.remove();
						this.resumeBanner = undefined;
					},
					() => {
						// Restore - populate form with saved data
						this.restoreFromPersistedState(existingState.formData as unknown as SourceFormData);
						this.resumeBanner?.remove();
						this.resumeBanner = undefined;
						// Re-render form with restored data
						contentEl.empty();
						this.onOpen();
					}
				);
			}
		}

		// Title (required)
		new Setting(contentEl)
			.setName('标题')
			.setDesc('来源的描述性标题')
			.addText(text => text
				.setPlaceholder('例如：1900 年美国人口普查 - 史密斯家族')
				.setValue(this.title)
				.onChange(value => this.title = value));

		// Source type (required)
		new Setting(contentEl)
			.setName('来源类型')
			.setDesc('文献证据的类型')
			.addDropdown(dropdown => {
				// Group by category
				const groupedTypes = getSourceTypesByCategory(
					this.plugin.settings.customSourceTypes,
					this.plugin.settings.showBuiltInSourceTypes
				);

				for (const [categoryId, types] of Object.entries(groupedTypes)) {
					const categoryName = SOURCE_CATEGORY_NAMES[categoryId] || categoryId;
					// Add category as optgroup-like separator
					for (const typeDef of types) {
						dropdown.addOption(typeDef.id, `${categoryName}: ${typeDef.name}`);
					}
				}
				dropdown.setValue(this.sourceType);
				dropdown.onChange(value => this.sourceType = value);
			});

		// Date of document
		new Setting(contentEl)
			.setName('文件日期')
			.setDesc('原始文件的日期')
			.addText(text => text
				.setPlaceholder('例如：1900-06-01')
				.setValue(this.date)
				.onChange(value => this.date = value));

		// Repository
		new Setting(contentEl)
			.setName('保管机构')
			.setDesc('存放来源的档案馆或网站')
			.addText(text => text
				.setPlaceholder('例如：Ancestry.com、FamilySearch、国家档案馆')
				.setValue(this.repository)
				.onChange(value => this.repository = value));

		// Confidence
		new Setting(contentEl)
			.setName('置信度')
			.setDesc('该来源的可靠程度如何？')
			.addDropdown(dropdown => {
				dropdown.addOption('high', '高 - 原始来源，直接证据');
				dropdown.addOption('medium', '中 - 二手来源或间接证据');
				dropdown.addOption('low', '低 - 未经核实或存疑');
				dropdown.addOption('unknown', '未知 - 尚未评估');
				dropdown.setValue(this.confidence);
				dropdown.onChange(value => this.confidence = value as SourceConfidence);
			});

		// Source classification section (Mills #276, inline-expand pattern)
		this.renderClassificationSection(contentEl);

		// Additional details section (inline-expand pattern)
		this.renderAdditionalDetailsSection(contentEl);

		// Person roles section (inline-expand pattern) (#219)
		this.renderPersonRolesSection(contentEl);

		// Buttons
		const buttonContainer = contentEl.createDiv({ cls: 'cr-modal-buttons' });

		const cancelBtn = buttonContainer.createEl('button', { text: '取消' });
		cancelBtn.addEventListener('click', () => this.close());

		const actionBtn = buttonContainer.createEl('button', {
			text: this.editMode ? '保存更改' : '创建来源',
			cls: 'mod-cta'
		});
		actionBtn.addEventListener('click', () => void this.saveSource());
	}

	/**
	 * Check if classification section has any data
	 */
	private hasClassificationData(): boolean {
		return !!(this.sourceClassification || this.informationClassification || this.evidenceClassification);
	}

	/**
	 * Render source classification section (Mills #276, inline-expand pattern)
	 */
	private renderClassificationSection(container: HTMLElement): void {
		const hasData = this.hasClassificationData();
		const wrapper = container.createDiv({ cls: 'crc-inline-expand' });

		// Create expansion link (hidden when expanded)
		const expandLink = wrapper.createDiv({ cls: 'crc-inline-expand__trigger' });
		const linkIcon = expandLink.createSpan({ cls: 'crc-inline-expand__icon' });
		expandLink.createSpan({ text: '来源分类', cls: 'crc-inline-expand__text' });
		setIcon(linkIcon, 'chevron-down');

		// Create content container (hidden by default unless has data)
		const content = wrapper.createDiv({ cls: 'crc-inline-expand__content' });

		// Collapse link (shown when expanded)
		const collapseHeader = content.createDiv({ cls: 'crc-inline-expand__header' });
		collapseHeader.createSpan({ text: '来源分类（Mills）', cls: 'crc-inline-expand__title' });
		const collapseLink = collapseHeader.createEl('button', {
			cls: 'crc-inline-expand__collapse clickable-icon',
			attr: { 'aria-label': '折叠区块' }
		});
		setIcon(collapseLink, 'chevron-up');

		// If has data, start expanded
		if (hasData) {
			wrapper.addClass('crc-inline-expand--expanded');
		}

		// Toggle handlers
		expandLink.addEventListener('click', () => {
			wrapper.addClass('crc-inline-expand--expanded');
		});
		collapseLink.addEventListener('click', () => {
			wrapper.removeClass('crc-inline-expand--expanded');
		});

		// Fields container
		const fields = content.createDiv({ cls: 'crc-inline-expand__fields' });

		fields.createEl('p', {
			text: '使用 Evidence Explained 框架对本来源进行分类（均可选）。',
			cls: 'setting-item-description'
		});

		// Source classification dropdown
		new Setting(fields)
			.setName('来源分类')
			.setDesc('文件本身属于哪一类？')
			.addDropdown(dropdown => {
				dropdown.addOption('', '未设置');
				for (const [value, info] of Object.entries(SOURCE_CLASSIFICATION_LABELS)) {
					dropdown.addOption(value, `${info.label} — ${info.description}`);
				}
				dropdown.setValue(this.sourceClassification);
				dropdown.onChange(value => this.sourceClassification = value as SourceClassification | '');
			});

		// Information classification dropdown
		new Setting(fields)
			.setName('信息分类')
			.setDesc('信息由谁提供？')
			.addDropdown(dropdown => {
				dropdown.addOption('', '未设置');
				for (const [value, info] of Object.entries(INFORMATION_CLASSIFICATION_LABELS)) {
					dropdown.addOption(value, `${info.label} — ${info.description}`);
				}
				dropdown.setValue(this.informationClassification);
				dropdown.onChange(value => this.informationClassification = value as InformationClassification | '');
			});

		// Evidence classification dropdown
		new Setting(fields)
			.setName('证据分类')
			.setDesc('信息与研究问题有何关联？')
			.addDropdown(dropdown => {
				dropdown.addOption('', '未设置');
				for (const [value, info] of Object.entries(EVIDENCE_CLASSIFICATION_LABELS)) {
					dropdown.addOption(value, `${info.label} — ${info.description}`);
				}
				dropdown.setValue(this.evidenceClassification);
				dropdown.onChange(value => this.evidenceClassification = value as EvidenceClassification | '');
			});
	}

	/**
	 * Check if additional details section has any data
	 */
	private hasAdditionalDetailsData(): boolean {
		return !!(
			this.dateAccessed ||
			this.repositoryUrl ||
			this.collection ||
			this.location ||
			this.media.length > 0 ||
			this.transcription
		);
	}

	/**
	 * Render additional details section with inline expansion
	 */
	private renderAdditionalDetailsSection(container: HTMLElement): void {
		const hasData = this.hasAdditionalDetailsData();
		const wrapper = container.createDiv({ cls: 'crc-inline-expand' });

		// Create expansion link (hidden when expanded)
		const expandLink = wrapper.createDiv({ cls: 'crc-inline-expand__trigger' });
		const linkIcon = expandLink.createSpan({ cls: 'crc-inline-expand__icon' });
		expandLink.createSpan({ text: '更多详情', cls: 'crc-inline-expand__text' });
		setIcon(linkIcon, 'chevron-down');

		// Create content container (hidden by default unless has data)
		const content = wrapper.createDiv({ cls: 'crc-inline-expand__content' });

		// Collapse link (shown when expanded)
		const collapseHeader = content.createDiv({ cls: 'crc-inline-expand__header' });
		collapseHeader.createSpan({ text: '更多详情', cls: 'crc-inline-expand__title' });
		const collapseLink = collapseHeader.createEl('button', {
			cls: 'crc-inline-expand__collapse clickable-icon',
			attr: { 'aria-label': '折叠区块' }
		});
		setIcon(collapseLink, 'chevron-up');

		// If has data, start expanded
		if (hasData) {
			wrapper.addClass('crc-inline-expand--expanded');
		}

		// Toggle handlers
		expandLink.addEventListener('click', () => {
			wrapper.addClass('crc-inline-expand--expanded');
		});
		collapseLink.addEventListener('click', () => {
			wrapper.removeClass('crc-inline-expand--expanded');
		});

		// Fields container
		const fields = content.createDiv({ cls: 'crc-inline-expand__fields' });

		// Date accessed
		new Setting(fields)
			.setName('访问日期')
			.setDesc('你访问该来源的时间')
			.addText(text => text
				.setPlaceholder('例如：2024-03-15')
				.setValue(this.dateAccessed)
				.onChange(value => this.dateAccessed = value));

		// Repository URL
		new Setting(fields)
			.setName('保管机构 URL')
			.setDesc('在线来源的直接链接')
			.addText(text => text
				.setPlaceholder('https://...')
				.setValue(this.repositoryUrl)
				.onChange(value => this.repositoryUrl = value));

		// Collection
		new Setting(fields)
			.setName('合集')
			.setDesc('档案群或合集名称')
			.addText(text => text
				.setPlaceholder('例如：1900 年美国联邦人口普查')
				.setValue(this.collection)
				.onChange(value => this.collection = value));

		// Location (with autocomplete from existing locations)
		const sourceService = this.plugin.getSourceService();
		const existingLocations = sourceService.getUniqueLocations();

		new Setting(fields)
			.setName('地点')
			.setDesc('记录的地理位置')
			.addText(text => {
				text.setPlaceholder('例如：纽约州，金斯县，布鲁克林')
					.setValue(this.location)
					.onChange(value => this.location = value);

				// Attach autocomplete suggest if there are existing locations
				if (existingLocations.length > 0) {
					new LocationSuggest(
						this.app,
						text,
						existingLocations,
						(value) => this.location = value
					);
				}
			});

		// Parent source (#337)
		const allSources = sourceService.getAllSources();
		// Exclude the current source (in edit mode) from the parent picker
		const availableParents = this.editMode && this.editingFile
			? allSources.filter(s => s.filePath !== this.editingFile!.path)
			: allSources;

		new Setting(fields)
			.setName('父来源')
			.setDesc('父级文件（例如：遗嘱认证档案、档案群）')
			.addText(text => {
				const displayValue = this.sourceParent
					? this.sourceParent.replace(/^\[\[|\]\]$/g, '')
					: '';
				text.setPlaceholder('例如：Hardwick 遗嘱认证档案')
					.setValue(displayValue)
					.onChange(value => {
						if (!value.trim()) {
							this.sourceParent = '';
							this.sourceParentId = '';
							return;
						}
						// Try to match to an existing source
						const match = availableParents.find(s =>
							s.title.toLowerCase() === value.trim().toLowerCase()
						);
						if (match) {
							this.sourceParent = `[[${match.title}]]`;
							this.sourceParentId = match.crId;
						} else {
							// Allow freeform wikilink
							this.sourceParent = `[[${value.trim()}]]`;
							this.sourceParentId = '';
						}
					});

				if (availableParents.length > 0) {
					new SourceSuggest(
						this.app,
						text,
						availableParents,
						(source) => {
							this.sourceParent = `[[${source.title}]]`;
							this.sourceParentId = source.crId;
							text.setValue(source.title);
						}
					);
				}
			});

		// Media files section
		const mediaSetting = new Setting(fields)
			.setName('媒体文件')
			.setDesc('附加到该来源的图片或文档');

		// Add button
		mediaSetting.addButton(btn => btn
			.setButtonText('添加媒体')
			.setIcon('plus')
			.onClick(() => {
				new MediaFileSuggestModal(this.app, (file) => {
					const wikilink = `[[${file.path}]]`;
					if (!this.media.includes(wikilink)) {
						this.media.push(wikilink);
						this.renderMediaList();
					}
				}).open();
			}));

		// Media list container
		this.mediaListContainer = fields.createDiv({ cls: 'cr-media-picker-list' });
		this.renderMediaList();

		// Transcription (only for create mode - editing note body is complex)
		if (!this.editMode) {
			new Setting(fields)
				.setName('初始转录')
				.setDesc('可选的来源内容转录')
				.addTextArea(textArea => textArea
					.setPlaceholder('输入转录或笔记…')
					.setValue(this.transcription)
					.onChange(value => this.transcription = value));
		}
	}

	/**
	 * Check if person roles section has any data
	 */
	private hasPersonRolesData(): boolean {
		return this.personRoles.length > 0;
	}

	/**
	 * Render person roles section with inline expansion (#219)
	 */
	private renderPersonRolesSection(container: HTMLElement): void {
		const hasData = this.hasPersonRolesData();
		const wrapper = container.createDiv({ cls: 'crc-inline-expand' });

		// Create expansion link (hidden when expanded)
		const expandLink = wrapper.createDiv({ cls: 'crc-inline-expand__trigger' });
		const linkIcon = expandLink.createSpan({ cls: 'crc-inline-expand__icon' });
		expandLink.createSpan({ text: '人物角色', cls: 'crc-inline-expand__text' });
		setIcon(linkIcon, 'chevron-down');

		// Create content container (hidden by default unless has data)
		const content = wrapper.createDiv({ cls: 'crc-inline-expand__content' });

		// Collapse link (shown when expanded)
		const collapseHeader = content.createDiv({ cls: 'crc-inline-expand__header' });
		collapseHeader.createSpan({ text: '人物角色', cls: 'crc-inline-expand__title' });
		const collapseLink = collapseHeader.createEl('button', {
			cls: 'crc-inline-expand__collapse clickable-icon',
			attr: { 'aria-label': '折叠区块' }
		});
		setIcon(collapseLink, 'chevron-up');

		// If has data, start expanded
		if (hasData) {
			wrapper.addClass('crc-inline-expand--expanded');
		}

		// Toggle handlers
		expandLink.addEventListener('click', () => {
			wrapper.addClass('crc-inline-expand--expanded');
		});
		collapseLink.addEventListener('click', () => {
			wrapper.removeClass('crc-inline-expand--expanded');
		});

		// Fields container
		const fields = content.createDiv({ cls: 'crc-inline-expand__fields' });

		// Description
		fields.createEl('p', {
			text: '记录本来源中提及的人物及其角色（证人、告密者等）。',
			cls: 'setting-item-description cr-person-roles-desc'
		});

		// Add person button
		const addSetting = new Setting(fields)
			.setName('添加人物')
			.setDesc('选择一个人物并指定其在该来源中的角色');

		addSetting.addButton(btn => btn
			.setButtonText('添加人物')
			.setIcon('user-plus')
			.onClick(() => {
				this.openAddPersonRoleModal();
			}));

		// Person roles list container
		this.personRolesListContainer = fields.createDiv({ cls: 'cr-person-roles-list' });
		this.renderPersonRolesList();
	}

	/**
	 * Open modal to add a person with role
	 */
	private openAddPersonRoleModal(): void {
		// Get family graph for person picker
		const familyGraph = this.plugin.createFamilyGraphService();
		familyGraph.ensureCacheLoaded();
		const folderFilter = this.plugin.getFolderFilter();

		// Open person picker with correct signature: (app, onSelect, options?)
		new PersonPickerModal(
			this.app,
			(person: PersonInfo) => {
				// After selecting person, show role selection
				this.showRoleSelectionForPerson(person);
			},
			{
				folderFilter: folderFilter ?? undefined,
				familyGraph,
				plugin: this.plugin
			}
		).open();
	}

	/**
	 * Show role selection modal for a selected person
	 */
	private showRoleSelectionForPerson(person: PersonInfo): void {
		// Create a simple modal for role selection
		const modal = new Modal(this.app);
		modal.titleEl.setText('选择角色');

		const { contentEl } = modal;
		contentEl.empty();
		contentEl.addClass('cr-role-selection-modal');

		contentEl.createEl('p', {
			text: `为该来源中的 ${person.name} 选择角色：`
		});

		// Role dropdown
		let selectedRole: PersonRoleProperty = 'principals';
		new Setting(contentEl)
			.setName('角色')
			.addDropdown(dropdown => {
				for (const prop of PERSON_ROLE_PROPERTIES) {
					dropdown.addOption(prop, PERSON_ROLE_LABELS[prop]);
				}
				dropdown.setValue(selectedRole);
				dropdown.onChange(value => {
					selectedRole = value as PersonRoleProperty;
					// Update description
					descEl.textContent = PERSON_ROLE_DESCRIPTIONS[selectedRole];
				});
			});

		// Role description
		const descEl = contentEl.createEl('p', {
			text: PERSON_ROLE_DESCRIPTIONS[selectedRole],
			cls: 'setting-item-description'
		});

		// Optional details
		let details = '';
		new Setting(contentEl)
			.setName('详情（可选）')
			.setDesc('例如："被继承人"、"证人"、"遗产管理人"')
			.addText(text => text
				.setPlaceholder('例如：被继承人')
				.onChange(value => details = value));

		// Buttons
		const buttonContainer = contentEl.createDiv({ cls: 'cr-modal-buttons' });

		const cancelBtn = buttonContainer.createEl('button', { text: '取消' });
		cancelBtn.addEventListener('click', () => modal.close());

		const addBtn = buttonContainer.createEl('button', {
			text: '添加',
			cls: 'mod-cta'
		});
		addBtn.addEventListener('click', () => {
			// Add the role entry
			this.personRoles.push({
				crId: person.crId,
				name: person.name,
				role: selectedRole,
				details: details.trim() || undefined
			});
			this.renderPersonRolesList();
			modal.close();
		});

		modal.open();
	}

	/**
	 * Render the list of person roles
	 */
	private renderPersonRolesList(): void {
		if (!this.personRolesListContainer) return;

		this.personRolesListContainer.empty();

		if (this.personRoles.length === 0) {
			this.personRolesListContainer.createSpan({
				text: '未添加人物角色',
				cls: 'crc-text-muted'
			});
			return;
		}

		// Group by role for display
		const byRole = new Map<PersonRoleProperty, PersonRoleEntry[]>();
		for (const entry of this.personRoles) {
			const existing = byRole.get(entry.role) || [];
			existing.push(entry);
			byRole.set(entry.role, existing);
		}

		// Render each role group
		for (const prop of PERSON_ROLE_PROPERTIES) {
			const entries = byRole.get(prop);
			if (!entries || entries.length === 0) continue;

			const roleGroup = this.personRolesListContainer.createDiv({ cls: 'cr-person-roles-group' });
			roleGroup.createEl('h5', {
				text: PERSON_ROLE_LABELS[prop],
				cls: 'cr-person-roles-group__title'
			});

			for (const entry of entries) {
				const item = roleGroup.createDiv({ cls: 'cr-person-roles-item' });

				// Person icon and name
				const nameContainer = item.createDiv({ cls: 'cr-person-roles-item__name' });
				const iconEl = nameContainer.createSpan({ cls: 'cr-person-roles-item__icon' });
				setIcon(iconEl, 'user');
				nameContainer.createSpan({ text: entry.name });

				// Details if present
				if (entry.details) {
					item.createSpan({
						text: `(${entry.details})`,
						cls: 'cr-person-roles-item__details'
					});
				}

				// Remove button
				const removeBtn = item.createEl('button', {
					cls: 'cr-person-roles-item__remove clickable-icon',
					attr: { 'aria-label': '移除' }
				});
				setIcon(removeBtn, 'x');
				removeBtn.addEventListener('click', () => {
					const idx = this.personRoles.indexOf(entry);
					if (idx >= 0) {
						this.personRoles.splice(idx, 1);
						this.renderPersonRolesList();
					}
				});
			}
		}
	}

	onClose() {
		const { contentEl } = this;

		// Persist state if not saved successfully and we have persistence enabled
		if (this.persistence && !this.editMode && !this.savedSuccessfully) {
			const formData = this.gatherFormData();
			if (this.persistence.hasContent(formData)) {
				void this.persistence.persist(formData);
			}
		}

		contentEl.empty();
	}

	/**
	 * Gather current form data for persistence
	 */
	private gatherFormData(): SourceFormData {
		return {
			title: this.title,
			sourceType: this.sourceType,
			date: this.date,
			dateAccessed: this.dateAccessed,
			repository: this.repository,
			repositoryUrl: this.repositoryUrl,
			collection: this.collection,
			location: this.location,
			confidence: this.confidence,
			sourceClassification: this.sourceClassification,
			informationClassification: this.informationClassification,
			evidenceClassification: this.evidenceClassification,
			transcription: this.transcription,
			media: [...this.media],
			personRoles: [...this.personRoles],
			sourceParent: this.sourceParent,
			sourceParentId: this.sourceParentId
		};
	}

	/**
	 * Restore form state from persisted data
	 */
	private restoreFromPersistedState(formData: SourceFormData): void {
		this.title = formData.title || '';
		this.sourceType = formData.sourceType || 'vital_record';
		this.date = formData.date || '';
		this.dateAccessed = formData.dateAccessed || '';
		this.repository = formData.repository || '';
		this.repositoryUrl = formData.repositoryUrl || '';
		this.collection = formData.collection || '';
		this.location = formData.location || '';
		this.confidence = formData.confidence || 'unknown';
		this.sourceClassification = formData.sourceClassification || '';
		this.informationClassification = formData.informationClassification || '';
		this.evidenceClassification = formData.evidenceClassification || '';
		this.transcription = formData.transcription || '';
		this.media = formData.media ? [...formData.media] : [];
		this.personRoles = formData.personRoles ? [...formData.personRoles] : [];
		this.sourceParent = formData.sourceParent || '';
		this.sourceParentId = formData.sourceParentId || '';
	}

	/**
	 * Render the list of attached media files
	 */
	private renderMediaList(): void {
		if (!this.mediaListContainer) return;

		this.mediaListContainer.empty();

		if (this.media.length === 0) {
			this.mediaListContainer.createSpan({
				text: '未附加媒体文件',
				cls: 'crc-text-muted'
			});
			return;
		}

		for (let i = 0; i < this.media.length; i++) {
			const mediaPath = this.media[i];
			const item = this.mediaListContainer.createDiv({ cls: 'cr-media-picker-item' });

			// Extract filename from wikilink
			const match = mediaPath.match(/\[\[(.+?)\]\]/);
			const filePath = match ? match[1] : mediaPath;
			const fileName = filePath.split('/').pop() || filePath;

			// Thumbnail preview for images
			const ext = fileName.split('.').pop()?.toLowerCase() || '';
			const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'].includes(ext);

			if (isImage) {
				const file = this.app.vault.getAbstractFileByPath(filePath);
				if (file instanceof TFile) {
					const thumb = item.createDiv({ cls: 'cr-media-picker-thumb' });
					const img = thumb.createEl('img');
					img.src = this.app.vault.getResourcePath(file);
				}
			} else {
				// PDF or other - show icon
				const iconEl = item.createDiv({ cls: 'cr-media-picker-icon' });
				setIcon(iconEl, 'file-text');
			}

			// Filename
			item.createSpan({ text: fileName, cls: 'cr-media-picker-name' });

			// Remove button
			const removeBtn = item.createEl('button', {
				cls: 'cr-media-picker-remove clickable-icon',
				attr: { 'aria-label': '移除' }
			});
			setIcon(removeBtn, 'x');
			removeBtn.addEventListener('click', () => {
				this.media.splice(i, 1);
				this.renderMediaList();
			});
		}
	}

	/**
	 * Convert person roles to frontmatter format (#219)
	 * Returns a map of role property to array of wikilink strings
	 */
	private personRolesToFrontmatter(): Partial<Record<PersonRoleProperty, string[]>> {
		const result: Partial<Record<PersonRoleProperty, string[]>> = {};

		for (const entry of this.personRoles) {
			// Build wikilink with optional display text containing details
			let wikilink: string;
			if (entry.details) {
				// [[Name|Name (Details)]]
				wikilink = `[[${entry.name}|${entry.name} (${entry.details})]]`;
			} else {
				// [[Name]]
				wikilink = `[[${entry.name}]]`;
			}

			// Add to appropriate role array
			if (!result[entry.role]) {
				result[entry.role] = [];
			}
			result[entry.role]!.push(wikilink);
		}

		return result;
	}

	private async saveSource(): Promise<void> {
		if (!this.title.trim()) {
			new Notice('请输入标题');
			return;
		}

		try {
			const sourceService = this.plugin.getSourceService();

			// Convert person roles to frontmatter format
			const roleArrays = this.personRolesToFrontmatter();

			if (this.editMode && this.editingFile) {
				// Update existing source
				await sourceService.updateSource(this.editingFile, {
					title: this.title.trim(),
					sourceType: this.sourceType,
					date: this.date.trim() || undefined,
					dateAccessed: this.dateAccessed.trim() || undefined,
					repository: this.repository.trim() || undefined,
					repositoryUrl: this.repositoryUrl.trim() || undefined,
					collection: this.collection.trim() || undefined,
					location: this.location.trim() || undefined,
					confidence: this.confidence,
					sourceClassification: this.sourceClassification || undefined,
					informationClassification: this.informationClassification || undefined,
					evidenceClassification: this.evidenceClassification || undefined,
					media: this.media.length > 0 ? this.media : undefined,
					// Source hierarchy (#337)
					sourceParent: this.sourceParent.trim() || undefined,
					sourceParentId: this.sourceParentId.trim() || undefined,
					// Person roles (#219)
					...roleArrays
				});

				new Notice('来源已更新');
			} else {
				// Create new source
				const file = await sourceService.createSource({
					title: this.title.trim(),
					sourceType: this.sourceType,
					date: this.date.trim() || undefined,
					dateAccessed: this.dateAccessed.trim() || undefined,
					repository: this.repository.trim() || undefined,
					repositoryUrl: this.repositoryUrl.trim() || undefined,
					collection: this.collection.trim() || undefined,
					location: this.location.trim() || undefined,
					confidence: this.confidence,
					sourceClassification: this.sourceClassification || undefined,
					informationClassification: this.informationClassification || undefined,
					evidenceClassification: this.evidenceClassification || undefined,
					media: this.media.length > 0 ? this.media : undefined,
					transcription: this.transcription.trim() || undefined,
					// Source hierarchy (#337)
					sourceParent: this.sourceParent.trim() || undefined,
					sourceParentId: this.sourceParentId.trim() || undefined,
					// Person roles (#219)
					...roleArrays
				});

				// Mark as saved successfully and clear persisted state
				this.savedSuccessfully = true;
				if (this.persistence) {
					void this.persistence.clear();
				}

				// Open the newly created file
				await this.app.workspace.openLinkText(file.path, '');

				this.close();
				this.onSuccess(file);
				return;
			}

			this.close();
			this.onSuccess();
		} catch (error) {
			new Notice(`无法${this.editMode ? '更新' : '创建'}来源：${error}`);
		}
	}
}