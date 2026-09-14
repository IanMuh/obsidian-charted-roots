/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument -- Obsidian API returns any-typed surfaces (frontmatter, file caches, plugin state); project policy accepts these. */
/**
 * Create Person Modal
 * Modal for creating or editing person notes with relationship linking
 */

import { App, ButtonComponent, Modal, Setting, TFile, Notice, normalizePath, setIcon } from 'obsidian';
import { createPersonNote, updatePersonNote, PersonData, DynamicBlockType, addBidirectionalSpouseLink, addChildToParent, addParentToChild } from '../core/person-note-writer';
import { RelationshipManager } from '../core/relationship-manager';
import { createLucideIcon } from './lucide-icons';
import { FamilyGraphService } from '../core/family-graph';
import { PlaceGraphService } from '../core/place-graph';
import { aggregateCollections } from '../core/collections-aggregator';
import { PersonPickerModal, PersonInfo } from './person-picker';
import { PlacePickerModal, SelectedPlaceInfo } from './place-picker';
import { RelationshipContext } from './quick-create-person-modal';
import { generateCrId } from '../core/uuid';
import type { CanvasRootsSettings } from '../settings';
import { getDefaultUniverse } from '../settings';
import type CanvasRootsPlugin from '../../main';
import { getSpouseLabel, getAddSpouseLabel } from '../utils/terminology';
import { extractDisplayLabel } from '../utils/wikilink-resolver';
import { ModalStatePersistence, renderResumePromptBanner } from './modal-state-persistence';
import { ResearchLevel, RESEARCH_LEVELS } from '../types/frontmatter';
import { SourcePickerModal } from '../sources/ui/source-picker-modal';
import { CreateSourceModal } from '../sources/ui/create-source-modal';
import type { EventNote } from '../events/types/event-types';
import { getEventType } from '../events/types/event-types';
import { createValueAliasService } from '../core/value-alias-service';
import { EventPickerModal } from '../events/ui/event-picker-modal';
import { splitAndTrim } from '../utils/format-utils';
import { CreateEventModal } from '../events/ui/create-event-modal';
import { getSourceType, FACT_KEYS, FACT_KEY_LABELS, FACT_KEY_TO_SOURCED_PROPERTY, SOURCED_PROPERTY_NAMES } from '../sources/types/source-types';
import type { FactKey, SourcedPropertyName } from '../sources/types/source-types';
import {
	getContrastColor,
	matchesPersonReference,
} from './create-person-types';
import type {
	RelationshipField,
	MultiRelationshipField,
	MarriageStatus,
	SpouseWithMetadata,
	SpousesFieldData,
	PersonFormData,
} from './create-person-types';
import { MARRIAGE_TYPE_PRESETS } from '../models/marriage-type';

/**
 * Modal for creating or editing person notes
 */
export class CreatePersonModal extends Modal {
	private personData: PersonData;
	private directory: string;
	private onCreated?: (file: TFile) => void;
	private onUpdated?: (file: TFile) => void;
	private familyGraph?: FamilyGraphService;
	private existingCollections: string[] = [];
	private existingUniverses: string[] = [];

	// Relationship fields
	private fatherField: RelationshipField = {};
	private motherField: RelationshipField = {};
	// Spouses (multi-relationship with metadata)
	private spousesField: SpousesFieldData = { spouses: [] };
	// Step and adoptive parents
	private stepfatherField: RelationshipField = {};
	private stepmotherField: RelationshipField = {};
	private adoptiveFatherField: RelationshipField = {};
	private adoptiveMotherField: RelationshipField = {};
	// Gender-neutral parents (multi-relationship)
	private parentsField: MultiRelationshipField = { crIds: [], names: [] };
	// Children (multi-relationship)
	private childrenField: MultiRelationshipField = { crIds: [], names: [] };
	// Place fields
	private birthPlaceField: RelationshipField = {};
	private deathPlaceField: RelationshipField = {};
	private placeGraph?: PlaceGraphService;
	private settings?: CanvasRootsSettings;
	// Sources field (multi-relationship)
	private sourcesField: MultiRelationshipField = { crIds: [], names: [] };
	// Fact-level source tracking (sourced_* properties)
	private sourcedFactsFields: Record<string, string[]> = {};

	// Edit mode properties
	private editMode: boolean = false;
	private editingFile?: TFile;
	private originalName?: string; // Store original name for rename detection
	private propertyAliases: Record<string, string> = {};
	private includeDynamicBlocks: boolean = true;
	private dynamicBlockTypes: DynamicBlockType[] = ['media', 'timeline', 'relationships'];

	// State persistence
	private plugin?: CanvasRootsPlugin;
	private persistence?: ModalStatePersistence<PersonFormData>;
	private savedSuccessfully: boolean = false;
	private resumeBanner?: HTMLElement;

	// Post-create state (for "Add Another" flow)
	private createdFile?: TFile;
	private createdPersonCrId?: string;
	private createdPersonName?: string;

	constructor(
		app: App,
		options?: {
			directory?: string;
			initialName?: string;
			onCreated?: (file: TFile) => void;
			onUpdated?: (file: TFile) => void;
			familyGraph?: FamilyGraphService;
			propertyAliases?: Record<string, string>;
			includeDynamicBlocks?: boolean;
			dynamicBlockTypes?: DynamicBlockType[];
			// Edit mode options
			editFile?: TFile;
			editPersonData?: {
				crId: string;
				name: string;
				personType?: string;
				sex?: string;
				gender?: string; // Kept for backwards compatibility
				pronouns?: string | string[];
				nickname?: string;
				// Name components (#174, #192)
				givenName?: string;
				surnames?: string[];
				maidenName?: string;
				marriedNames?: string[];
				// Name parts (#709)
				namePrefix?: string;
				nameSuffix?: string;
				surnamePrefix?: string;
				// Dates and places
				born?: string;
				died?: string;
				buried?: string;
				birthPlace?: string;
				deathPlace?: string;
				birthPlaceId?: string;
				birthPlaceName?: string;
				deathPlaceId?: string;
				deathPlaceName?: string;
				occupation?: string;
				researchLevel?: ResearchLevel;
				cr_living?: boolean;
				fatherId?: string;
				fatherName?: string;
				motherId?: string;
				motherName?: string;
				spouseIds?: string[];
				spouseNames?: string[];
				spouseMetadata?: SpouseWithMetadata[];
				collection?: string;
				universe?: string;
				// Step and adoptive parents
				stepfatherId?: string;
				stepfatherName?: string;
				stepmotherId?: string;
				stepmotherName?: string;
				adoptiveFatherId?: string;
				adoptiveFatherName?: string;
				adoptiveMotherId?: string;
				adoptiveMotherName?: string;
				// Gender-neutral parents
				parentIds?: string[];
				parentNames?: string[];
				// Children
				childIds?: string[];
				childNames?: string[];
				// Sources
				sourceIds?: string[];
				sourceNames?: string[];
				// DNA tracking fields
				dnaSharedCm?: number;
				dnaTestingCompany?: string;
				dnaKitId?: string;
				dnaMatchType?: string;
				dnaEndogamyFlag?: boolean;
				dnaNotes?: string;
				// Fact-level source tracking
				sourcedFacts?: Record<string, string[]>;
			};
			// Universe options
			existingUniverses?: string[];
			// Place graph for place picker
			placeGraph?: PlaceGraphService;
			settings?: CanvasRootsSettings;
			// Plugin reference for state persistence
			plugin?: CanvasRootsPlugin;
		}
	) {
		super(app);
		this.directory = options?.directory || '';
		this.onCreated = options?.onCreated;
		this.onUpdated = options?.onUpdated;
		this.familyGraph = options?.familyGraph;
		this.propertyAliases = options?.propertyAliases || {};
		this.includeDynamicBlocks = options?.includeDynamicBlocks ?? true;
		this.dynamicBlockTypes = options?.dynamicBlockTypes || ['media', 'timeline', 'relationships'];
		this.existingUniverses = options?.existingUniverses || [];
		this.placeGraph = options?.placeGraph;
		this.settings = options?.settings;
		this.plugin = options?.plugin;

		// Set up persistence (only in create mode)
		if (this.plugin && !options?.editFile) {
			this.persistence = new ModalStatePersistence<PersonFormData>(this.plugin, 'person');
		}

		// Check for edit mode
		if (options?.editFile && options?.editPersonData) {
			this.editMode = true;
			this.editingFile = options.editFile;
			this.originalName = options.editPersonData.name; // Store for rename detection
			const ep = options.editPersonData;
			// Normalize the loaded sex value to the canonical GEDCOM-aligned
			// markers (M/F/X/U) so the dropdown finds a matching option and
			// the save flow writes the canonical form regardless of which
			// shape was on disk. Profile View already writes markers; Edit
			// Person previously wrote word forms (`male` / `female` /
			// `nonbinary`), leading to a divergence where a person saved
			// via one surface displayed as "unrecognized" in the other
			// (#629). The alias service maps both built-in synonyms (`male`
			// -> `M`, `nonbinary` -> `X`, etc.) and any user-defined
			// aliases, so existing data of either shape converts on load.
			const sexAliasService = createValueAliasService(this.plugin!);
			const loadedSex = ep.sex || ep.gender;
			this.personData = {
				name: ep.name,
				crId: ep.crId,
				personType: ep.personType,
				sex: loadedSex ? sexAliasService.resolve('sex', loadedSex) : undefined,
				pronouns: Array.isArray(ep.pronouns) ? ep.pronouns : ep.pronouns ? [ep.pronouns] : undefined,
				nickname: ep.nickname,
				// Name components (#174, #192)
				givenName: ep.givenName,
				surnames: ep.surnames,
				maidenName: ep.maidenName,
				marriedNames: ep.marriedNames,
				// Name parts (#709)
				namePrefix: ep.namePrefix,
				nameSuffix: ep.nameSuffix,
				surnamePrefix: ep.surnamePrefix,
				// Dates and places
				birthDate: ep.born,
				deathDate: ep.died,
				burialDate: ep.buried,
				birthPlace: ep.birthPlace,
				deathPlace: ep.deathPlace,
				occupation: ep.occupation,
				researchLevel: ep.researchLevel,
				cr_living: ep.cr_living,
				collection: ep.collection,
				universe: ep.universe,
				// DNA tracking fields
				dnaSharedCm: ep.dnaSharedCm,
				dnaTestingCompany: ep.dnaTestingCompany,
				dnaKitId: ep.dnaKitId,
				dnaMatchType: ep.dnaMatchType,
				dnaEndogamyFlag: ep.dnaEndogamyFlag,
				dnaNotes: ep.dnaNotes
			};
			// Set up relationship fields
			if (ep.fatherId || ep.fatherName) {
				this.fatherField = { crId: ep.fatherId, name: ep.fatherName };
			}
			if (ep.motherId || ep.motherName) {
				this.motherField = { crId: ep.motherId, name: ep.motherName };
			}
			// Spouses (multi-relationship with metadata)
			if (ep.spouseIds && ep.spouseIds.length > 0) {
				// If we have metadata, use it; otherwise build from arrays
				if (ep.spouseMetadata && ep.spouseMetadata.length > 0) {
					this.spousesField = { spouses: [...ep.spouseMetadata] };
				} else {
					this.spousesField = {
						spouses: ep.spouseIds.map((crId, i) => ({
							crId,
							name: ep.spouseNames?.[i] || crId
						}))
					};
				}
			}
			// Step and adoptive parents
			if (ep.stepfatherId || ep.stepfatherName) {
				this.stepfatherField = { crId: ep.stepfatherId, name: ep.stepfatherName };
			}
			if (ep.stepmotherId || ep.stepmotherName) {
				this.stepmotherField = { crId: ep.stepmotherId, name: ep.stepmotherName };
			}
			if (ep.adoptiveFatherId || ep.adoptiveFatherName) {
				this.adoptiveFatherField = { crId: ep.adoptiveFatherId, name: ep.adoptiveFatherName };
			}
			if (ep.adoptiveMotherId || ep.adoptiveMotherName) {
				this.adoptiveMotherField = { crId: ep.adoptiveMotherId, name: ep.adoptiveMotherName };
			}
			// Place fields
			if (ep.birthPlaceId || ep.birthPlaceName) {
				this.birthPlaceField = { crId: ep.birthPlaceId, name: ep.birthPlaceName };
			}
			if (ep.deathPlaceId || ep.deathPlaceName) {
				this.deathPlaceField = { crId: ep.deathPlaceId, name: ep.deathPlaceName };
			}
			// Gender-neutral parents
			if (ep.parentIds && ep.parentIds.length > 0) {
				this.parentsField = {
					crIds: [...ep.parentIds],
					names: ep.parentNames ? [...ep.parentNames] : []
				};
			}
			// Children
			if (ep.childIds && ep.childIds.length > 0) {
				this.childrenField = {
					crIds: [...ep.childIds],
					names: ep.childNames ? [...ep.childNames] : []
				};
			}
			// Sources
			if (ep.sourceIds && ep.sourceIds.length > 0) {
				this.sourcesField = {
					crIds: [...ep.sourceIds],
					names: ep.sourceNames ? [...ep.sourceNames] : []
				};
			}
			// Fact-level source tracking
			if (ep.sourcedFacts) {
				this.sourcedFactsFields = { ...ep.sourcedFacts };
			}
			// Get directory from file path
			const pathParts = options.editFile.path.split('/');
			pathParts.pop(); // Remove filename
			this.directory = pathParts.join('/');
		} else {
			this.personData = {
				name: options?.initialName || '',
				// Apply the default universe to brand-new people (#751). Many call
				// sites pass `plugin` but not `settings`, so fall back to plugin.settings.
				universe: getDefaultUniverse(this.settings ?? this.plugin?.settings)
			};
		}

		// Gather existing collections from person notes
		this.loadExistingCollections();
	}

	/**
	 * Load existing collections from person and place notes (#426 — Collections
	 * are cross-entity; the dropdown needs to surface names defined on either
	 * entity type so a collection first created via the Create Place modal
	 * shows up here too).
	 */
	private loadExistingCollections(): void {
		const personCollections = this.familyGraph
			? this.familyGraph.getUserCollections().map(c => ({ name: c.name, count: c.size }))
			: [];
		const placeCollections = this.placeGraph
			? Object.entries(this.placeGraph.calculateStatistics().byCollection).map(
				([name, count]) => ({ name, count })
			)
			: [];

		const aggregated = aggregateCollections(personCollections, placeCollections);

		// Dropdown wants names only, alphabetised for easy scanning.
		this.existingCollections = aggregated.map(c => c.name).sort((a, b) =>
			a.toLowerCase().localeCompare(b.toLowerCase())
		);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		// Add modal class for styling
		this.modalEl.addClass('crc-create-person-modal');

		// Header
		const header = contentEl.createDiv({ cls: 'crc-modal-header' });
		const titleContainer = header.createDiv({ cls: 'crc-modal-title' });
		const icon = createLucideIcon(this.editMode ? 'edit' : 'user-plus', 24);
		titleContainer.appendChild(icon);
		titleContainer.appendText(this.editMode ? '编辑人物笔记' : '创建人物笔记');

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
						this.restoreFromPersistedState(existingState.formData as unknown as PersonFormData);
						this.resumeBanner?.remove();
						this.resumeBanner = undefined;
						// Re-render form with restored data
						this.renderForm(contentEl);
					}
				);
			}
		}

		// Form container
		this.renderForm(contentEl);
	}

	/**
	 * Render the form fields
	 */
	private renderForm(contentEl: HTMLElement): void {
		// Remove existing form if re-rendering
		const existingForm = contentEl.querySelector('.crc-form');
		if (existingForm) {
			existingForm.remove();
		}
		const existingButtons = contentEl.querySelector('.crc-modal-buttons');
		if (existingButtons) {
			existingButtons.remove();
		}

		const form = contentEl.createDiv({ cls: 'crc-form' });

		// Name (required)
		new Setting(form)
			.setName('姓名')
			.setDesc('人物的全名')
			.addText(text => text
				.setPlaceholder('例：张三')
				.setValue(this.personData.name || '')
				.onChange(value => {
					this.personData.name = value;
				}));

		// Extended name options (nickname, name parts, maiden/married names) in a
		// collapsible section so the modal isn't cramped for the common case (#717).
		this.renderExtendedNameSection(form);

		// Sex
		new Setting(form)
			.setName('性别')
			.setDesc('性别（用于关系称谓与显示）')
			.addDropdown(dropdown => dropdown
				.addOption('', '（无）')
				.addOption('M', '男')
				.addOption('F', '女')
				.addOption('X', '非二元')
				.addOption('U', '未知')
				.setValue(this.personData.sex || '')
				.onChange(value => {
					this.personData.sex = value || undefined;
				}));

		// Pronouns (chip-style multi-value input)
		this.renderPronounsField(form);

		// === LIFE EVENTS SECTION (moved higher for better UX) ===
		// Birth date
		new Setting(form)
			.setName('出生日期')
			.setDesc('出生日期（建议 YYYY-MM-DD；可在末尾追加 T HH:MM 以区分双胞胎）')
			.addText(text => text
				.setPlaceholder('例：1888-05-15 或 1888-05-15T03:42')
				.setValue(this.personData.birthDate || '')
				.onChange(value => {
					this.personData.birthDate = value || undefined;
				}));

		// Birth place (link field)
		this.createPlaceField(form, '出生地点', this.birthPlaceField);

		// Death date
		new Setting(form)
			.setName('去世日期')
			.setDesc('去世日期（在世则留空）')
			.addText(text => text
				.setPlaceholder('例：1952-08-20')
				.setValue(this.personData.deathDate || '')
				.onChange(value => {
					this.personData.deathDate = value || undefined;
				}));

		// Death place (link field)
		this.createPlaceField(form, '去世地点', this.deathPlaceField);

		// Burial date (#682)
		new Setting(form)
			.setName('安葬日期')
			.setDesc('安葬或下葬日期')
			.addText(text => text
				.setPlaceholder('例：1952-08-23')
				.setValue(this.personData.burialDate || '')
				.onChange(value => {
					this.personData.burialDate = value || undefined;
				}));

		// Living status (#698). Overrides the automatic living/deceased detection
		// so a person can be marked without hand-editing the `cr_living`
		// frontmatter. Sits directly under the death/burial fields and shows in
		// both create and edit mode.
		new Setting(form)
			.setName('在世状态')
			.setDesc('标记此人在世或已故，覆盖自动判定（也用于导出时的隐私保护）')
			.addDropdown(dropdown => {
				dropdown
					.addOption('', '（自动）')
					.addOption('true', '在世（受保护）')
					.addOption('false', '已故（不受保护）')
					.setValue(this.personData.cr_living === undefined ? '' : String(this.personData.cr_living))
					.onChange(value => {
						if (value === '') {
							this.personData.cr_living = undefined;
						} else {
							this.personData.cr_living = value === 'true';
						}
					});
			});

		// === DNA INFORMATION (inline expansion, only when DNA tracking enabled) ===
		if (this.plugin?.settings.enableDnaTracking) {
			this.renderDnaSection(form);
		}

		// Research level (only shown when Research Tools are enabled)
		if (this.settings?.trackFactSourcing) {
			new Setting(form)
				.setName('研究等级')
				.setDesc('朝向 GPS 合规文档的研究进度')
				.addDropdown(dropdown => {
					dropdown.addOption('', '（未评估）');
					for (const [level, info] of Object.entries(RESEARCH_LEVELS)) {
						dropdown.addOption(level, `${level} - ${info.name}`);
					}
					dropdown
						.setValue(this.personData.researchLevel?.toString() || '')
						.onChange(value => {
							this.personData.researchLevel = value ? parseInt(value) as ResearchLevel : undefined;
						});
				});
		}

		// Events section (only in edit mode - events link TO persons, not FROM them)
		if (this.editMode) {
			this.createEventsField(form);
		}

		// Relationship fields section header
		const relSection = form.createDiv({ cls: 'crc-relationship-section' });
		relSection.createEl('h4', { text: '家族关系', cls: 'crc-section-header' });

		// Father relationship
		this.createRelationshipField(relSection, '父亲', this.fatherField);

		// Mother relationship
		this.createRelationshipField(relSection, '母亲', this.motherField);

		// Spouses section (multi-select, shown in edit mode or if spouses exist)
		if (this.editMode || this.spousesField.spouses.length > 0) {
			this.createSpousesField(relSection);
		} else {
			// In create mode with no spouses, show single spouse picker for simplicity
			this.createSingleSpouseField(relSection);
		}

		// Children section (only in edit mode or if children already exist)
		if (this.editMode || this.childrenField.crIds.length > 0) {
			this.createChildrenField(relSection);
		}

		// === STEP & ADOPTIVE PARENTS (inline expansion) ===
		this.renderStepAdoptiveSection(relSection);

		// === SOURCES (inline expansion) ===
		this.renderSourcesSection(form);

		// === SOURCE TRACKING (inline expansion, only when fact-level tracking enabled) ===
		if (this.settings?.trackFactSourcing) {
			this.renderSourceTrackingSection(form);
		}

		// Collection - dropdown with existing + text for custom
		const collectionSetting = new Setting(form)
			.setName('合集')
			.setDesc('用于组织人物笔记的自定义分组');

		if (this.existingCollections.length > 0) {
			let customInput: HTMLInputElement | null = null;
			let collectionValue: string | undefined = this.personData.collection;

			collectionSetting.addDropdown(dropdown => {
				dropdown
					.addOption('', '（无）')
					.addOption('__custom__', '＋新建合集…');

				for (const coll of this.existingCollections) {
					dropdown.addOption(coll, coll);
				}

				dropdown.setValue(collectionValue || '');
				dropdown.onChange(value => {
					if (value === '__custom__') {
						if (customInput) {
							customInput.removeClass('cr-hidden');
							customInput.focus();
						}
						collectionValue = undefined;
					} else {
						if (customInput) {
							customInput.addClass('cr-hidden');
							customInput.value = '';
						}
						collectionValue = value || undefined;
					}
				});
			});

			// Add text input for custom collection (hidden by default)
			collectionSetting.addText(text => {
				customInput = text.inputEl;
				text.setPlaceholder('输入新合集名称')
					.onChange(value => {
						collectionValue = value || undefined;
					});
				text.inputEl.addClass('cr-hidden');
				text.inputEl.addClass('crc-input--inline');
			});

			// Store the value getter for use when creating
			this.getCollectionValue = () => collectionValue;
		} else {
			let collectionValue: string | undefined = this.personData.collection;
			collectionSetting.addText(text => text
				.setPlaceholder('例：Smith 家族')
				.setValue(collectionValue || '')
				.onChange(value => {
					collectionValue = value || undefined;
				}));
			this.getCollectionValue = () => collectionValue;
		}

		// Universe - dropdown with existing + text for custom
		const universeSetting = new Setting(form)
			.setName('宇宙')
			.setDesc('此人所属的虚构宇宙或世界');

		if (this.existingUniverses.length > 0) {
			let universeCustomInput: HTMLInputElement | null = null;
			let universeValue: string | undefined = this.personData.universe;

			universeSetting.addDropdown(dropdown => {
				dropdown
					.addOption('', '（无）')
					.addOption('__custom__', '＋新建宇宙…');

				for (const univ of this.existingUniverses) {
					dropdown.addOption(univ, univ);
				}

				dropdown.setValue(universeValue || '');
				dropdown.onChange(value => {
					if (value === '__custom__') {
						if (universeCustomInput) {
							universeCustomInput.removeClass('cr-hidden');
							universeCustomInput.focus();
						}
						universeValue = undefined;
					} else {
						if (universeCustomInput) {
							universeCustomInput.addClass('cr-hidden');
							universeCustomInput.value = '';
						}
						universeValue = value || undefined;
					}
				});
			});

			// Add text input for custom universe (hidden by default)
			universeSetting.addText(text => {
				universeCustomInput = text.inputEl;
				text.setPlaceholder('输入新宇宙名称')
					.onChange(value => {
						universeValue = value || undefined;
					});
				text.inputEl.addClass('cr-hidden');
				text.inputEl.addClass('crc-input--inline');
			});

			// Store the value getter for use when creating
			this.getUniverseValue = () => universeValue;
		} else {
			let universeValue: string | undefined = this.personData.universe;
			universeSetting.addText(text => text
				.setPlaceholder('例：Westeros、Middle-earth')
				.setValue(universeValue || '')
				.onChange(value => {
					universeValue = value || undefined;
				}));
			this.getUniverseValue = () => universeValue;
		}

		// Directory setting (only show in create mode)
		if (!this.editMode) {
			new Setting(form)
				.setName('文件夹')
				.setDesc('人物笔记的创建位置')
				.addText(text => text
					.setPlaceholder('例：People')
					.setValue(this.directory)
					.onChange(value => {
						this.directory = value;
					}));

			// Dynamic blocks toggle (only in create mode)
			new Setting(form)
				.setName('包含动态区块')
				.setDesc('添加会自动更新的时间轴、关系和媒体库区块')
				.addToggle(toggle => toggle
					.setValue(this.includeDynamicBlocks)
					.onChange(value => {
						this.includeDynamicBlocks = value;
					}));
		}

		// Buttons (sticky footer)
		const buttonContainer = contentEl.createDiv({ cls: 'crc-modal-buttons crc-modal-buttons--sticky' });

		new ButtonComponent(buttonContainer)
			.setButtonText('取消')
			.onClick(() => {
				this.close();
			});

		new ButtonComponent(buttonContainer)
			.setButtonText(this.editMode ? '保存更改' : '创建人物')
			.setCta()
			.onClick(() => {
				if (this.editMode) {
					void this.updatePerson();
				} else {
					void this.createPerson();
				}
			});
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
	private gatherFormData(): PersonFormData {
		return {
			name: this.personData.name,
			sex: this.personData.sex,
			pronouns: this.personData.pronouns,
			birthDate: this.personData.birthDate,
			deathDate: this.personData.deathDate,
			burialDate: this.personData.burialDate,
			occupation: this.personData.occupation,
			researchLevel: this.personData.researchLevel,
			collection: this.getCollectionValue(),
			universe: this.getUniverseValue(),
			directory: this.directory,
			includeDynamicBlocks: this.includeDynamicBlocks,
			// Relationship fields
			fatherCrId: this.fatherField.crId,
			fatherName: this.fatherField.name,
			motherCrId: this.motherField.crId,
			motherName: this.motherField.name,
			// Spouses (multi-relationship with metadata)
			spouseCrIds: this.spousesField.spouses.length > 0 ? this.spousesField.spouses.map(s => s.crId) : undefined,
			spouseNames: this.spousesField.spouses.length > 0 ? this.spousesField.spouses.map(s => s.name) : undefined,
			spouseMetadata: this.spousesField.spouses.length > 0 ? [...this.spousesField.spouses] : undefined,
			stepfatherCrId: this.stepfatherField.crId,
			stepfatherName: this.stepfatherField.name,
			stepmotherCrId: this.stepmotherField.crId,
			stepmotherName: this.stepmotherField.name,
			adoptiveFatherCrId: this.adoptiveFatherField.crId,
			adoptiveFatherName: this.adoptiveFatherField.name,
			adoptiveMotherCrId: this.adoptiveMotherField.crId,
			adoptiveMotherName: this.adoptiveMotherField.name,
			// Gender-neutral parents
			parentCrIds: this.parentsField.crIds.length > 0 ? [...this.parentsField.crIds] : undefined,
			parentNames: this.parentsField.names.length > 0 ? [...this.parentsField.names] : undefined,
			// Children fields
			childCrIds: this.childrenField.crIds.length > 0 ? [...this.childrenField.crIds] : undefined,
			childNames: this.childrenField.names.length > 0 ? [...this.childrenField.names] : undefined,
			// Place fields
			birthPlaceCrId: this.birthPlaceField.crId,
			birthPlaceName: this.birthPlaceField.name,
			deathPlaceCrId: this.deathPlaceField.crId,
			deathPlaceName: this.deathPlaceField.name,
			// Sources fields
			sourceCrIds: this.sourcesField.crIds.length > 0 ? [...this.sourcesField.crIds] : undefined,
			sourceNames: this.sourcesField.names.length > 0 ? [...this.sourcesField.names] : undefined,
			// Fact-level source tracking
			sourcedFacts: Object.keys(this.sourcedFactsFields).length > 0 ? { ...this.sourcedFactsFields } : undefined
		};
	}

	/**
	 * Restore form state from persisted data
	 */
	private restoreFromPersistedState(formData: PersonFormData): void {
		// Basic fields
		this.personData.name = formData.name || '';
		this.personData.sex = formData.sex;
		this.personData.pronouns = formData.pronouns;
		this.personData.birthDate = formData.birthDate;
		this.personData.deathDate = formData.deathDate;
		this.personData.burialDate = formData.burialDate;
		this.personData.occupation = formData.occupation;
		this.personData.researchLevel = formData.researchLevel;
		this.personData.collection = formData.collection;
		this.personData.universe = formData.universe;
		if (formData.directory) {
			this.directory = formData.directory;
		}
		if (formData.includeDynamicBlocks !== undefined) {
			this.includeDynamicBlocks = formData.includeDynamicBlocks;
		}

		// Relationship fields
		if (formData.fatherCrId || formData.fatherName) {
			this.fatherField = { crId: formData.fatherCrId, name: formData.fatherName };
		}
		if (formData.motherCrId || formData.motherName) {
			this.motherField = { crId: formData.motherCrId, name: formData.motherName };
		}
		// Spouses (multi-relationship with metadata)
		if (formData.spouseMetadata && formData.spouseMetadata.length > 0) {
			this.spousesField = { spouses: [...formData.spouseMetadata] };
		} else if (formData.spouseCrIds && formData.spouseCrIds.length > 0) {
			this.spousesField = {
				spouses: formData.spouseCrIds.map((crId, i) => ({
					crId,
					name: formData.spouseNames?.[i] || crId
				}))
			};
		}
		if (formData.stepfatherCrId || formData.stepfatherName) {
			this.stepfatherField = { crId: formData.stepfatherCrId, name: formData.stepfatherName };
		}
		if (formData.stepmotherCrId || formData.stepmotherName) {
			this.stepmotherField = { crId: formData.stepmotherCrId, name: formData.stepmotherName };
		}
		if (formData.adoptiveFatherCrId || formData.adoptiveFatherName) {
			this.adoptiveFatherField = { crId: formData.adoptiveFatherCrId, name: formData.adoptiveFatherName };
		}
		if (formData.adoptiveMotherCrId || formData.adoptiveMotherName) {
			this.adoptiveMotherField = { crId: formData.adoptiveMotherCrId, name: formData.adoptiveMotherName };
		}

		// Place fields
		if (formData.birthPlaceCrId || formData.birthPlaceName) {
			this.birthPlaceField = { crId: formData.birthPlaceCrId, name: formData.birthPlaceName };
		}
		if (formData.deathPlaceCrId || formData.deathPlaceName) {
			this.deathPlaceField = { crId: formData.deathPlaceCrId, name: formData.deathPlaceName };
		}

		// Gender-neutral parents
		if (formData.parentCrIds && formData.parentCrIds.length > 0) {
			this.parentsField = {
				crIds: [...formData.parentCrIds],
				names: formData.parentNames ? [...formData.parentNames] : []
			};
		}

		// Children fields
		if (formData.childCrIds && formData.childCrIds.length > 0) {
			this.childrenField = {
				crIds: [...formData.childCrIds],
				names: formData.childNames ? [...formData.childNames] : []
			};
		}

		// Sources fields
		if (formData.sourceCrIds && formData.sourceCrIds.length > 0) {
			this.sourcesField = {
				crIds: [...formData.sourceCrIds],
				names: formData.sourceNames ? [...formData.sourceNames] : []
			};
		}

		// Fact-level source tracking
		if (formData.sourcedFacts) {
			this.sourcedFactsFields = { ...formData.sourcedFacts };
		}
	}

	// Collection value getter (set by collection field setup)
	private getCollectionValue: () => string | undefined = () => undefined;

	// Universe value getter (set by universe field setup)
	private getUniverseValue: () => string | undefined = () => undefined;

	/**
	 * Create a relationship field with link/unlink button
	 */
	private createRelationshipField(
		container: HTMLElement,
		label: string,
		fieldData: RelationshipField
	): void {
		// Display the user-facing display name in the modal — strip wikilink
		// brackets, paths, and pipe-aliases from the underlying frontmatter
		// value so users see "Errol Naberrie" rather than e.g. "Errol Naberrie|
		// Charted Roots/People/Errol Naberrie" or path-form residue (#543).
		// fieldData.name itself stays raw — the writer's createSmartWikilink
		// re-canonicalizes on save.
		const displayName = extractDisplayLabel(fieldData.name);
		const setting = new Setting(container)
			.setName(label)
			.setDesc(displayName ? `已关联：${displayName}` : `点击"关联"选择${label}`);

		// Text input (readonly, shows selected person name)
		let inputEl: HTMLInputElement;

		setting.addText(text => {
			inputEl = text.inputEl;
			text.setPlaceholder(`点击"关联"选择${label}`)
				.setValue(displayName);
			text.inputEl.readOnly = true;
			if (fieldData.name) {
				text.inputEl.addClass('crc-input--linked');
			}
		});

		// Link/Unlink button
		setting.addButton(btn => {
			const updateButton = (isLinked: boolean) => {
				btn.buttonEl.empty();
				btn.buttonEl.addClass('crc-btn', 'crc-btn--secondary');
				if (isLinked) {
					const unlinkIcon = createLucideIcon('unlink', 16);
					btn.buttonEl.appendChild(unlinkIcon);
					btn.buttonEl.appendText(' 取消关联');
				} else {
					const linkIcon = createLucideIcon('link', 16);
					btn.buttonEl.appendChild(linkIcon);
					btn.buttonEl.appendText(' 关联');
				}
			};

			updateButton(!!fieldData.name);

			btn.onClick(() => {
				if (fieldData.name) {
					// Unlink
					fieldData.crId = undefined;
					fieldData.name = undefined;
					inputEl.value = '';
					inputEl.removeClass('crc-input--linked');
					setting.setDesc(`点击"关联"选择${label}`);
					updateButton(false);
				} else {
					// Build relationship context for inline creation
					const createContext = this.buildRelationshipContext(label);

					// Open person picker with inline creation support
					const picker = new PersonPickerModal(this.app, (person: PersonInfo) => {
						fieldData.name = person.name;
						fieldData.crId = person.crId;
						inputEl.value = person.name;
						inputEl.addClass('crc-input--linked');
						setting.setDesc(`已关联：${person.name}`);
						updateButton(true);
					}, {
						title: `选择${label}`,
						createContext: createContext,
						onCreateNew: () => {
							// This callback is called when user clicks "Create new"
							// The picker handles opening QuickCreatePersonModal internally
						},
						plugin: this.plugin,
						excludeFiles: this.editingFile ? [this.editingFile] : undefined
					});
					picker.open();
				}
			});
		});
	}

	/**
	 * Build relationship context for inline person creation
	 * Maps field labels to suggested sex values
	 */
	private buildRelationshipContext(label: string): RelationshipContext {
		const labelLower = label.toLowerCase();

		// Map the (localized) field label back to a stable relationship token
		// consumed by the person picker / quick-create modal.
		let relationshipType = labelLower;
		if (label.includes('继父')) relationshipType = 'step-father';
		else if (label.includes('继母')) relationshipType = 'step-mother';
		else if (label.includes('养父')) relationshipType = 'adoptive father';
		else if (label.includes('养母')) relationshipType = 'adoptive mother';
		else if (label.includes('父')) relationshipType = 'father';
		else if (label.includes('母')) relationshipType = 'mother';

		// Determine suggested sex based on relationship type
		let suggestedSex: 'male' | 'female' | undefined;
		if (labelLower.includes('father') || label.includes('父')) {
			suggestedSex = 'male';
		} else if (labelLower.includes('mother') || label.includes('母')) {
			suggestedSex = 'female';
		}
		// Spouse has no suggested sex

		return {
			relationshipType,
			suggestedSex,
			parentCrId: this.personData.crId,
			directory: this.directory
		};
	}

	/**
	 * Create a place field with link/unlink button
	 */
	private createPlaceField(
		container: HTMLElement,
		label: string,
		fieldData: RelationshipField
	): void {
		// Same display-label parsing as relationship fields (#543).
		const displayName = extractDisplayLabel(fieldData.name);
		const setting = new Setting(container)
			.setName(label)
			.setDesc(displayName ? `已关联：${displayName}` : `点击"关联"选择${label}`);

		// Text input (readonly, shows selected place name)
		let inputEl: HTMLInputElement;

		setting.addText(text => {
			inputEl = text.inputEl;
			text.setPlaceholder(`点击"关联"选择${label}`)
				.setValue(displayName);
			text.inputEl.readOnly = true;
			if (fieldData.name) {
				text.inputEl.addClass('crc-input--linked');
			}
		});

		// Link/Unlink button
		setting.addButton(btn => {
			const updateButton = (isLinked: boolean) => {
				btn.buttonEl.empty();
				btn.buttonEl.addClass('crc-btn', 'crc-btn--secondary');
				if (isLinked) {
					const unlinkIcon = createLucideIcon('unlink', 16);
					btn.buttonEl.appendChild(unlinkIcon);
					btn.buttonEl.appendText(' 取消关联');
				} else {
					const linkIcon = createLucideIcon('map-pin', 16);
					btn.buttonEl.appendChild(linkIcon);
					btn.buttonEl.appendText(' 关联');
				}
			};

			updateButton(!!fieldData.name);

			btn.onClick(() => {
				if (fieldData.name) {
					// Unlink
					fieldData.crId = undefined;
					fieldData.name = undefined;
					inputEl.value = '';
					inputEl.removeClass('crc-input--linked');
					setting.setDesc(`点击"关联"选择${label}`);
					updateButton(false);
				} else {
					// Open place picker
					const picker = new PlacePickerModal(this.app, (place: SelectedPlaceInfo) => {
						fieldData.name = place.name;
						fieldData.crId = place.crId;
						inputEl.value = place.name;
						inputEl.addClass('crc-input--linked');
						setting.setDesc(`已关联：${place.name}`);
						updateButton(true);
					}, {
						placeGraph: this.placeGraph,
						settings: this.settings,
						directory: this.directory,
						plugin: this.plugin
					});
					picker.open();
				}
			});
		});
	}

	/**
	 * Create the children multi-select field
	 * Shows a list of currently linked children with ability to add/remove
	 */
	private createChildrenField(container: HTMLElement): void {
		const childrenContainer = container.createDiv({ cls: 'crc-children-field' });

		// Header with label and add button
		const header = childrenContainer.createDiv({ cls: 'crc-children-field__header' });
		header.createSpan({ cls: 'crc-children-field__label', text: '子女' });

		const addBtn = header.createEl('button', {
			cls: 'crc-btn crc-btn--secondary crc-btn--small'
		});
		const addIcon = createLucideIcon('plus', 14);
		addBtn.appendChild(addIcon);
		addBtn.appendText(' 添加子女');

		// List of current children
		const childList = childrenContainer.createDiv({ cls: 'crc-children-field__list' });

		// Render function to update the list
		const renderChildList = () => {
			childList.empty();

			if (this.childrenField.crIds.length === 0) {
				const emptyState = childList.createDiv({ cls: 'crc-children-field__empty' });
				emptyState.setText('未关联子女');
				return;
			}

			for (let i = 0; i < this.childrenField.crIds.length; i++) {
				const crId = this.childrenField.crIds[i];
				const name = this.childrenField.names[i] || crId;

				const childItem = childList.createDiv({ cls: 'crc-children-field__item' });

				// Child name
				const nameSpan = childItem.createSpan({ cls: 'crc-children-field__name' });
				nameSpan.setText(name);

				// Remove button
				const removeBtn = childItem.createEl('button', {
					cls: 'crc-btn crc-btn--icon crc-btn--danger',
					attr: { 'aria-label': `移除${name}` }
				});
				const removeIcon = createLucideIcon('x', 14);
				removeBtn.appendChild(removeIcon);

				removeBtn.addEventListener('click', () => {
					// Remove from arrays
					this.childrenField.crIds.splice(i, 1);
					this.childrenField.names.splice(i, 1);
					renderChildList();
				});
			}
		};

		// Initial render
		renderChildList();

		// Add button handler
		addBtn.addEventListener('click', () => {
			// Build context for inline creation - suggest child relationship
			const createContext: RelationshipContext = {
				relationshipType: 'child',
				parentCrId: this.personData.crId,
				directory: this.directory
			};

			const picker = new PersonPickerModal(this.app, (person: PersonInfo) => {
				// Check if already added
				if (this.childrenField.crIds.includes(person.crId)) {
						new Notice(`${person.name}已关联为子女`);
						return;
					}

				// Add to arrays
				this.childrenField.crIds.push(person.crId);
				this.childrenField.names.push(person.name);
				renderChildList();
				}, {
					title: '选择子女',
					subtitle: '选择已有的人物或新建一个',
				createContext: createContext,
				onCreateNew: () => {
					// This callback signals inline creation support
				},
				plugin: this.plugin,
				excludeFiles: this.editingFile ? [this.editingFile] : undefined
			});
			picker.open();
		});
	}

	/**
	 * Create the gender-neutral parents multi-select field
	 * Shows a list of currently linked parents with ability to add/remove
	 */
	private createParentsField(container: HTMLElement, label: string): void {
		const parentsContainer = container.createDiv({ cls: 'crc-children-field' });

		// Header with label and add button
		const header = parentsContainer.createDiv({ cls: 'crc-children-field__header' });
		header.createSpan({ cls: 'crc-children-field__label', text: label });

		const addBtn = header.createEl('button', {
			cls: 'crc-btn crc-btn--secondary crc-btn--small'
		});
		const addIcon = createLucideIcon('plus', 14);
		addBtn.appendChild(addIcon);
		addBtn.appendText(` 添加${label}`); // "Add parent" from "Parents"

		// List of current parents
		const parentList = parentsContainer.createDiv({ cls: 'crc-children-field__list' });

		// Render function to update the list
		const renderParentList = () => {
			parentList.empty();

			if (this.parentsField.crIds.length === 0) {
				const emptyState = parentList.createDiv({ cls: 'crc-children-field__empty' });
				emptyState.setText(`未关联${label}`);
				return;
			}

			for (let i = 0; i < this.parentsField.crIds.length; i++) {
				const crId = this.parentsField.crIds[i];
				const name = this.parentsField.names[i] || crId;

				const parentItem = parentList.createDiv({ cls: 'crc-children-field__item' });

				// Parent name
				const nameSpan = parentItem.createSpan({ cls: 'crc-children-field__name' });
				nameSpan.setText(name);

				// Remove button
				const removeBtn = parentItem.createEl('button', {
					cls: 'crc-btn crc-btn--icon crc-btn--danger',
					attr: { 'aria-label': `移除${name}` }
				});
				const removeIcon = createLucideIcon('x', 14);
				removeBtn.appendChild(removeIcon);

				removeBtn.addEventListener('click', () => {
					// Remove from arrays
					this.parentsField.crIds.splice(i, 1);
					this.parentsField.names.splice(i, 1);
					renderParentList();
				});
			}
		};

		// Initial render
		renderParentList();

		// Add button handler
		addBtn.addEventListener('click', () => {
			// Build context for inline creation - no suggested sex for gender-neutral parents
			const createContext: RelationshipContext = {
				relationshipType: 'parent',
				parentCrId: undefined, // Not applicable for parent relationship
				directory: this.directory
			};

			const picker = new PersonPickerModal(this.app, (person: PersonInfo) => {
				// Check if already added
				if (this.parentsField.crIds.includes(person.crId)) {
					new Notice(`${person.name}已关联为${label}`);
					return;
				}

				// Add to arrays
				this.parentsField.crIds.push(person.crId);
				this.parentsField.names.push(person.name);
				renderParentList();
			}, {
				title: `选择${label}`,
				subtitle: '选择已有的人物或新建一个',
				createContext: createContext,
				onCreateNew: () => {
					// This callback signals inline creation support
				},
				plugin: this.plugin,
				excludeFiles: this.editingFile ? [this.editingFile] : undefined
			});
			picker.open();
		});
	}

	// =========================================================================
	// INLINE EXPANSION SECTIONS
	// These sections use a Material Design-inspired progressive disclosure pattern
	// =========================================================================

	/**
	 * Check if DNA section has any data
	 */
	private hasDnaData(): boolean {
		return !!(
			this.personData.personType ||
			this.personData.dnaSharedCm ||
			this.personData.dnaTestingCompany ||
			this.personData.dnaKitId ||
			this.personData.dnaMatchType ||
			this.personData.dnaEndogamyFlag ||
			this.personData.dnaNotes
		);
	}

	/**
	 * Check if step/adoptive section has any data
	 */
	private hasStepAdoptiveData(): boolean {
		return !!(
			this.stepfatherField.crId ||
			this.stepmotherField.crId ||
			this.adoptiveFatherField.crId ||
			this.adoptiveMotherField.crId ||
			this.parentsField.crIds.length > 0
		);
	}

	/**
	 * Render the extended name options (nickname, name parts, maiden/married
	 * names) in a collapsible section so the modal isn't cramped for users who
	 * only need the baseline name (#717). Starts expanded when any field already
	 * holds data, so existing values stay visible.
	 */
	private renderExtendedNameSection(container: HTMLElement): void {
		const wrapper = container.createDiv({ cls: 'crc-inline-expand' });

		// Collapsed-state trigger
		const expandLink = wrapper.createDiv({ cls: 'crc-inline-expand__trigger' });
		const linkIcon = expandLink.createSpan({ cls: 'crc-inline-expand__icon' });
		expandLink.createSpan({ text: '扩展姓名选项', cls: 'crc-inline-expand__text' });
		setIcon(linkIcon, 'chevron-down');

		// Expanded content
		const content = wrapper.createDiv({ cls: 'crc-inline-expand__content' });
		const collapseHeader = content.createDiv({ cls: 'crc-inline-expand__header' });
		collapseHeader.createSpan({ text: '扩展姓名选项', cls: 'crc-inline-expand__title' });
		const collapseLink = collapseHeader.createEl('button', {
			cls: 'crc-inline-expand__collapse clickable-icon',
			attr: { 'aria-label': '折叠此区块' }
		});
		setIcon(collapseLink, 'chevron-up');

		// Always start collapsed to keep the modal uncluttered, even when the
		// person already has extended name data (#717).
		expandLink.addEventListener('click', () => {
			wrapper.addClass('crc-inline-expand--expanded');
		});
		collapseLink.addEventListener('click', () => {
			wrapper.removeClass('crc-inline-expand--expanded');
		});

		const fields = content.createDiv({ cls: 'crc-inline-expand__fields' });

		// Nickname (optional)
		new Setting(fields)
			.setName('昵称')
			.setDesc('非正式名称或别名（可选）')
			.addText(text => text
				.setPlaceholder('例：小明、奶奶')
				.setValue(this.personData.nickname || '')
				.onChange(value => {
					this.personData.nickname = value || undefined;
				}));

		// Name components (optional) - for cultures with multiple surnames or explicit name parts
		new Setting(fields)
			.setName('名')
			.setDesc('名（若与全名中显示的不同）')
			.addText(text => text
				.setPlaceholder('例：María José')
				.setValue(this.personData.givenName || '')
				.onChange(value => {
					this.personData.givenName = value || undefined;
				}));

		new Setting(fields)
			.setName('姓氏')
			.setDesc('家族姓氏——多个用逗号分隔（例："García, López"）')
			.addText(text => text
				.setPlaceholder('例：García, López')
				.setValue(this.personData.surnames?.join(', ') || '')
				.onChange(value => {
					if (value) {
						// Split on commas, trim whitespace
						this.personData.surnames = splitAndTrim(value);
					} else {
						this.personData.surnames = undefined;
					}
				}));

		// Name parts (optional) — prefix / suffix / surname particle. Also
		// populated by GEDCOM import; written to name_prefix / name_suffix /
		// surname_prefix (#709).
		new Setting(fields)
			.setName('名前缀')
			.setDesc('头衔或敬称（例：Dr.、Rev.、Dame）')
			.addText(text => text
				.setPlaceholder('例：Dr.')
				.setValue(this.personData.namePrefix || '')
				.onChange(value => {
					this.personData.namePrefix = value || undefined;
				}));

		new Setting(fields)
			.setName('名后缀')
			.setDesc('世代后缀（例：Jr.、III、V）')
			.addText(text => text
				.setPlaceholder('例：Jr.')
				.setValue(this.personData.nameSuffix || '')
				.onChange(value => {
					this.personData.nameSuffix = value || undefined;
				}));

		new Setting(fields)
			.setName('姓氏前缀')
			.setDesc('姓氏助词（例：von、de la）')
			.addText(text => text
				.setPlaceholder('例：von')
				.setValue(this.personData.surnamePrefix || '')
				.onChange(value => {
					this.personData.surnamePrefix = value || undefined;
				}));

		// Maiden/married names - only show in edit mode
		if (this.editMode) {
			new Setting(fields)
				.setName('婚前姓')
				.setDesc('出生时的姓氏（婚前）')
				.addText(text => text
					.setPlaceholder('例：Johnson')
					.setValue(this.personData.maidenName || '')
					.onChange(value => {
						this.personData.maidenName = value || undefined;
					}));

			new Setting(fields)
				.setName('婚后姓')
				.setDesc('婚后的姓氏——多个用逗号分隔')
				.addText(text => text
					.setPlaceholder('例：Smith, Jones')
					.setValue(this.personData.marriedNames?.join(', ') || '')
					.onChange(value => {
						if (value) {
							this.personData.marriedNames = splitAndTrim(value);
						} else {
							this.personData.marriedNames = undefined;
						}
					}));
		}
	}

	/**
	 * Check if sources section has any data
	 */
	private hasSourcesData(): boolean {
		return this.sourcesField.crIds.length > 0;
	}

	/**
	 * Check if source tracking section has any data
	 */
	private hasSourceTrackingData(): boolean {
		return Object.values(this.sourcedFactsFields).some(arr => arr.length > 0);
	}

	/**
	 * Render pronouns field with chip-style multi-value input
	 */
	private renderPronounsField(container: HTMLElement): void {
		const PRESET_PRONOUNS = ['she/her', 'he/him', 'they/them'];

		const setting = new Setting(container)
			.setName('代词')
			.setDesc('人物的代词（可选）');

		const controlEl = setting.controlEl;

		// Chips container for selected pronouns
		const chipsEl = controlEl.createDiv({ cls: 'cr-pronouns-chips' });

		// Text input for custom pronouns
		const inputEl = controlEl.createEl('input', {
			cls: 'cr-pronouns-input',
			attr: { type: 'text', placeholder: '添加自定义…' }
		});

		const renderChips = () => {
			chipsEl.empty();
			const current = this.personData.pronouns || [];
			for (const pronoun of current) {
				const chip = chipsEl.createDiv({ cls: 'cr-pronouns-chip' });
				chip.createSpan({ text: pronoun });
				const removeBtn = chip.createSpan({ cls: 'cr-pronouns-chip__remove', text: '\u00d7' });
				removeBtn.addEventListener('click', () => {
					this.personData.pronouns = current.filter(p => p !== pronoun);
					if (this.personData.pronouns.length === 0) this.personData.pronouns = undefined;
					renderChips();
					renderPresets();
				});
			}
		};

		// Preset suggestion chips
		const presetsEl = controlEl.createDiv({ cls: 'cr-pronouns-presets' });

		const renderPresets = () => {
			presetsEl.empty();
			const current = this.personData.pronouns || [];
			const available = PRESET_PRONOUNS.filter(p => !current.includes(p));
			for (const preset of available) {
				const btn = presetsEl.createEl('button', {
					cls: 'cr-btn cr-btn--ghost cr-btn--small cr-pronouns-preset',
					text: preset
				});
				btn.addEventListener('click', (e) => {
					e.preventDefault();
					if (!this.personData.pronouns) this.personData.pronouns = [];
					this.personData.pronouns.push(preset);
					renderChips();
					renderPresets();
				});
			}
		};

		// Handle custom input via Enter or comma
		inputEl.addEventListener('keydown', (e) => {
			if (e.key === 'Enter' || e.key === ',') {
				e.preventDefault();
				const value = inputEl.value.trim().replace(/,$/, '');
				if (value && !(this.personData.pronouns || []).includes(value)) {
					if (!this.personData.pronouns) this.personData.pronouns = [];
					this.personData.pronouns.push(value);
					renderChips();
					renderPresets();
				}
				inputEl.value = '';
			}
		});

		renderChips();
		renderPresets();
	}

	/**
	 * Render DNA section with inline expansion
	 */
	private renderDnaSection(container: HTMLElement): void {
		const hasData = this.hasDnaData();
		const wrapper = container.createDiv({ cls: 'crc-inline-expand' });

		// Create expansion link (hidden when expanded)
		const expandLink = wrapper.createDiv({ cls: 'crc-inline-expand__trigger' });
		const linkIcon = expandLink.createSpan({ cls: 'crc-inline-expand__icon' });
		expandLink.createSpan({ text: 'DNA 信息', cls: 'crc-inline-expand__text' });
		setIcon(linkIcon, 'chevron-down');

		// Create content container (hidden by default unless has data)
		const content = wrapper.createDiv({ cls: 'crc-inline-expand__content' });

		// Collapse link (shown when expanded)
		const collapseHeader = content.createDiv({ cls: 'crc-inline-expand__header' });
		collapseHeader.createSpan({ text: 'DNA 信息', cls: 'crc-inline-expand__title' });
		const collapseLink = collapseHeader.createEl('button', {
			cls: 'crc-inline-expand__collapse clickable-icon',
			attr: { 'aria-label': '折叠此区块' }
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

		// DNA fields
		const fields = content.createDiv({ cls: 'crc-inline-expand__fields' });

		// Person type
		new Setting(fields)
			.setName('人物类型')
			.setDesc('为此人物分类（用于遗传谱系工作流）')
			.addDropdown(dropdown => dropdown
				.addOption('', '（普通人物）')
				.addOption('DNA Match', 'DNA 匹配')
				.setValue(this.personData.personType || '')
				.onChange(value => {
					this.personData.personType = value || undefined;
				}));

		// Shared cM
		new Setting(fields)
			.setName('共享 cM')
			.setDesc('与此匹配共享的厘摩数')
			.addText(text => text
				.setPlaceholder('例：1847')
				.setValue(this.personData.dnaSharedCm?.toString() || '')
				.onChange(value => {
					const num = parseFloat(value);
					this.personData.dnaSharedCm = isNaN(num) ? undefined : num;
				}));

		// Testing Company
		new Setting(fields)
			.setName('检测公司')
			.setDesc('DNA 检测服务提供商')
			.addDropdown(dropdown => dropdown
				.addOption('', '（未指定）')
				.addOption('AncestryDNA', 'AncestryDNA')
				.addOption('23andMe', '23andMe')
				.addOption('FamilyTreeDNA', 'FamilyTreeDNA')
				.addOption('MyHeritage', 'MyHeritage')
				.addOption('LivingDNA', 'LivingDNA')
				.addOption('GEDmatch', 'GEDmatch')
				.setValue(this.personData.dnaTestingCompany || '')
				.onChange(value => {
					this.personData.dnaTestingCompany = value || undefined;
				}));

		// Kit ID
		new Setting(fields)
			.setName('试剂盒 ID')
			.setDesc('DNA 试剂盒标识符')
			.addText(text => text
				.setPlaceholder('例：ABC123')
				.setValue(this.personData.dnaKitId || '')
				.onChange(value => {
					this.personData.dnaKitId = value || undefined;
				}));

		// Match Type
		new Setting(fields)
			.setName('匹配类型')
			.setDesc('此 DNA 匹配的分类')
			.addDropdown(dropdown => dropdown
				.addOption('', '（未分类）')
				.addOption('BKM', 'BKM（最佳已知匹配）')
				.addOption('BMM', 'BMM（最佳未知匹配）')
				.addOption('confirmed', '已确认关系')
				.addOption('unconfirmed', '未确认')
				.setValue(this.personData.dnaMatchType || '')
				.onChange(value => {
					this.personData.dnaMatchType = value || undefined;
				}));

		// Endogamy Flag — pass the boolean through directly; `value || undefined`
		// would convert a toggled-off `false` to `undefined`, which the writer's
		// `!== undefined` guard then reads as "untouched" (#413).
		new Setting(fields)
			.setName('内婚制标记')
			.setDesc('标记匹配是否可能受内婚制影响（cM 值偏高）')
			.addToggle(toggle => toggle
				.setValue(this.personData.dnaEndogamyFlag || false)
				.onChange(value => {
					this.personData.dnaEndogamyFlag = value;
				}));

		// DNA Notes
		new Setting(fields)
			.setName('DNA 备注')
			.setDesc('关于此 DNA 匹配的补充备注')
			.addTextArea(textarea => textarea
				.setPlaceholder('例：在第7号染色体上匹配')
				.setValue(this.personData.dnaNotes || '')
				.onChange(value => {
					this.personData.dnaNotes = value || undefined;
				}));
	}

	/**
	 * Render step/adoptive parents section with inline expansion
	 */
	private renderStepAdoptiveSection(container: HTMLElement): void {
		const hasData = this.hasStepAdoptiveData();
		const wrapper = container.createDiv({ cls: 'crc-inline-expand' });

		// Create expansion link
		const expandLink = wrapper.createDiv({ cls: 'crc-inline-expand__trigger' });
		const linkIcon = expandLink.createSpan({ cls: 'crc-inline-expand__icon' });
		expandLink.createSpan({ text: '继父母或养父母', cls: 'crc-inline-expand__text' });
		setIcon(linkIcon, 'chevron-down');

		// Create content container
		const content = wrapper.createDiv({ cls: 'crc-inline-expand__content' });

		// Collapse header
		const collapseHeader = content.createDiv({ cls: 'crc-inline-expand__header' });
		collapseHeader.createSpan({ text: '继父母与养父母', cls: 'crc-inline-expand__title' });
		const collapseLink = collapseHeader.createEl('button', {
			cls: 'crc-inline-expand__collapse clickable-icon',
			attr: { 'aria-label': '折叠此区块' }
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

		// Step/adoptive fields
		const fields = content.createDiv({ cls: 'crc-inline-expand__fields' });

		this.createRelationshipField(fields, '继父', this.stepfatherField);
		this.createRelationshipField(fields, '继母', this.stepmotherField);
		this.createRelationshipField(fields, '养父', this.adoptiveFatherField);
		this.createRelationshipField(fields, '养母', this.adoptiveMotherField);

		// Gender-neutral parents (only shown if enabled in settings)
		if (this.plugin?.settings.enableInclusiveParents) {
			const parentsLabel = this.plugin.settings.parentFieldLabel || '父母';
			this.createParentsField(fields, parentsLabel);
		}
	}

	/**
	 * Render sources section with inline expansion
	 */
	private renderSourcesSection(container: HTMLElement): void {
		const hasData = this.hasSourcesData();
		const wrapper = container.createDiv({ cls: 'crc-inline-expand' });

		// Create expansion link
		const expandLink = wrapper.createDiv({ cls: 'crc-inline-expand__trigger' });
		const linkIcon = expandLink.createSpan({ cls: 'crc-inline-expand__icon' });
		expandLink.createSpan({ text: '来源', cls: 'crc-inline-expand__text' });
		setIcon(linkIcon, 'chevron-down');

		// Create content container
		const content = wrapper.createDiv({ cls: 'crc-inline-expand__content' });

		// Collapse header
		const collapseHeader = content.createDiv({ cls: 'crc-inline-expand__header' });
		collapseHeader.createSpan({ text: '来源', cls: 'crc-inline-expand__title' });
		const collapseLink = collapseHeader.createEl('button', {
			cls: 'crc-inline-expand__collapse clickable-icon',
			attr: { 'aria-label': '折叠此区块' }
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

		// Sources field content (reuse existing method)
		const fields = content.createDiv({ cls: 'crc-inline-expand__fields' });
		this.createSourcesField(fields);
	}

	/**
	 * Render source tracking section with inline expansion (#292)
	 * Displays the 10 trackable fact types with per-fact source wikilinks
	 */
	private renderSourceTrackingSection(container: HTMLElement): void {
		const hasData = this.hasSourceTrackingData();
		const wrapper = container.createDiv({ cls: 'crc-inline-expand' });

		// Create expansion link
		const expandLink = wrapper.createDiv({ cls: 'crc-inline-expand__trigger' });
		const linkIcon = expandLink.createSpan({ cls: 'crc-inline-expand__icon' });
		expandLink.createSpan({ text: '事实级来源引文', cls: 'crc-inline-expand__text' });
		setIcon(linkIcon, 'chevron-down');

		// Create content container
		const content = wrapper.createDiv({ cls: 'crc-inline-expand__content' });

		// Collapse header
		const collapseHeader = content.createDiv({ cls: 'crc-inline-expand__header' });
		collapseHeader.createSpan({ text: '来源追踪', cls: 'crc-inline-expand__title' });
		const collapseLink = collapseHeader.createEl('button', {
			cls: 'crc-inline-expand__collapse clickable-icon',
			attr: { 'aria-label': '折叠此区块' }
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

		const fields = content.createDiv({ cls: 'crc-inline-expand__fields' });

		// Description
		fields.createEl('p', {
			text: '追踪哪些来源支持每项关键事实。此数据会用于数据质量报告中的覆盖率得分。',
			cls: 'setting-item-description cr-source-tracking-desc'
		});

		// Render a row for each of the 10 fact types
		for (const factKey of FACT_KEYS) {
			const propName = FACT_KEY_TO_SOURCED_PROPERTY[factKey];
			this.createSourcedFactRow(fields, factKey, propName);
		}
	}

	/**
	 * Create a single sourced-fact row with chip list and add button
	 */
	private createSourcedFactRow(
		container: HTMLElement,
		factKey: FactKey,
		propName: SourcedPropertyName
	): void {
		const row = container.createDiv({ cls: 'cr-sourced-fact-row' });

		const label = row.createDiv({ cls: 'cr-sourced-fact-row__label' });
		label.setText(FACT_KEY_LABELS[factKey]);

		const valueArea = row.createDiv({ cls: 'cr-sourced-fact-row__values' });

		const chipContainer = valueArea.createDiv({ cls: 'cr-sourced-fact-row__chips' });

		const renderChips = () => {
			chipContainer.empty();
			const names = this.sourcedFactsFields[propName] || [];
			for (let i = 0; i < names.length; i++) {
				const chip = chipContainer.createDiv({ cls: 'cr-sourced-fact-chip' });
				chip.createSpan({ text: names[i], cls: 'cr-sourced-fact-chip__name' });
				const removeBtn = chip.createSpan({ cls: 'cr-sourced-fact-chip__remove', text: '\u00d7' });
				removeBtn.addEventListener('click', () => {
					const arr = this.sourcedFactsFields[propName] || [];
					arr.splice(i, 1);
					if (arr.length === 0) {
						delete this.sourcedFactsFields[propName];
					}
					renderChips();
				});
			}
		};

		// Add button
		const addBtn = valueArea.createEl('button', {
			cls: 'cr-sourced-fact-row__add clickable-icon',
			attr: { 'aria-label': `为${FACT_KEY_LABELS[factKey]}添加来源` }
		});
		setIcon(addBtn, 'plus');
		addBtn.addEventListener('click', () => {
			if (!this.plugin) return;
			new SourcePickerModal(this.app, this.plugin, {
				onSelect: (source) => {
					const basename = source.filePath.replace(/\.md$/, '').split('/').pop() || source.title;
					if (!this.sourcedFactsFields[propName]) {
						this.sourcedFactsFields[propName] = [];
					}
					// Avoid duplicates
					if (!this.sourcedFactsFields[propName].includes(basename)) {
						this.sourcedFactsFields[propName].push(basename);
					}
					renderChips();
				},
				allowCreate: false
			}).open();
		});

		renderChips();
	}

	/**
	 * Create the sources multi-select field
	 * Shows a list of currently linked sources with ability to add/remove
	 */
	private createSourcesField(container: HTMLElement): void {
		const sourcesContainer = container.createDiv({ cls: 'crc-sources-field' });

		// Header with label and buttons
		const header = sourcesContainer.createDiv({ cls: 'crc-sources-field__header' });
		header.createSpan({ cls: 'crc-sources-field__label', text: '来源' });

		// Button container for multiple buttons (matching Events pattern)
		const buttonContainer = header.createDiv({ cls: 'crc-sources-field__buttons' });

		const linkBtn = buttonContainer.createEl('button', {
			cls: 'crc-btn crc-btn--secondary crc-btn--small'
		});
		const linkIcon = createLucideIcon('link', 14);
		linkBtn.appendChild(linkIcon);
		linkBtn.appendText(' 关联');

		const createBtn = buttonContainer.createEl('button', {
			cls: 'crc-btn crc-btn--secondary crc-btn--small'
		});
		const createIcon = createLucideIcon('plus', 14);
		createBtn.appendChild(createIcon);
		createBtn.appendText(' 创建');

		// List of current sources
		const sourceList = sourcesContainer.createDiv({ cls: 'crc-sources-field__list' });

		// Render function to update the list
		const renderSourceList = () => {
			sourceList.empty();

			if (this.sourcesField.crIds.length === 0) {
				const emptyState = sourceList.createDiv({ cls: 'crc-sources-field__empty' });
				emptyState.setText('未关联来源');
				return;
			}

			// Get source service for type lookup
			const sourceService = this.plugin ? this.plugin.getSourceService() : null;

			for (let i = 0; i < this.sourcesField.crIds.length; i++) {
				const crId = this.sourcesField.crIds[i];
				const name = this.sourcesField.names[i] || crId;

				const sourceItem = sourceList.createDiv({ cls: 'crc-sources-field__item' });

				// Source info container
				const infoContainer = sourceItem.createDiv({ cls: 'crc-sources-field__info' });

				// Source name
				const nameSpan = infoContainer.createSpan({ cls: 'crc-sources-field__name' });
				nameSpan.setText(name);

				// Source type badge (if we can look it up)
				if (sourceService && this.plugin) {
					const source = sourceService.getSourceById(crId);
					if (source?.sourceType) {
						const typeDef = getSourceType(
							source.sourceType,
							this.plugin.settings.customSourceTypes,
							this.plugin.settings.showBuiltInSourceTypes
						);
						const typeBadge = infoContainer.createSpan({ cls: 'crc-sources-field__type' });
						if (typeDef) {
							typeBadge.setText(typeDef.name);
							if (typeDef.color) {
								typeBadge.style.setProperty('background-color', typeDef.color);
								typeBadge.style.setProperty('color', getContrastColor(typeDef.color));
							}
						} else {
							typeBadge.setText(source.sourceType);
						}
					}
				}

				// Remove button
				const removeBtn = sourceItem.createEl('button', {
					cls: 'crc-btn crc-btn--icon crc-btn--danger',
					attr: { 'aria-label': `移除${name}` }
				});
				const removeIcon = createLucideIcon('x', 14);
				removeBtn.appendChild(removeIcon);

				removeBtn.addEventListener('click', () => {
					// Remove from arrays
					this.sourcesField.crIds.splice(i, 1);
					this.sourcesField.names.splice(i, 1);
					renderSourceList();
				});
			}
		};

		// Initial render
		renderSourceList();

		// Link button handler - open source picker
		linkBtn.addEventListener('click', () => {
			if (!this.plugin) {
				new Notice('插件不可用');
				return;
			}

			new SourcePickerModal(this.app, this.plugin, {
				onSelect: (source) => {
					// Check if already added
					if (this.sourcesField.crIds.includes(source.crId)) {
						new Notice(`${source.title}已关联为来源`);
						return;
					}

					// Add to arrays
					// Use file basename for wikilink (not title, which may differ from filename)
					const basename = source.filePath.replace(/\.md$/, '').split('/').pop() || source.title;
					this.sourcesField.crIds.push(source.crId);
					this.sourcesField.names.push(basename);
					renderSourceList();
				},
				excludeSources: this.sourcesField.crIds,
				allowCreate: false  // Don't show create button in picker since we have separate Create button
			}).open();
		});

		// Create button handler - open create source modal
		createBtn.addEventListener('click', () => {
			if (!this.plugin) {
				new Notice('插件不可用');
				return;
			}

			new CreateSourceModal(this.app, this.plugin, {
				onSuccess: (file) => {
					// After creating, get the source and add it to the list
					if (file) {
						const sourceService = this.plugin!.getSourceService();
						const source = sourceService.getSourceByPath(file.path);
						if (source) {
							// Check if already added (shouldn't happen but safety check)
							if (!this.sourcesField.crIds.includes(source.crId)) {
								// Use file basename for wikilink (not title, which may differ from filename)
								const basename = file.basename;
								this.sourcesField.crIds.push(source.crId);
								this.sourcesField.names.push(basename);
								renderSourceList();
							}
						}
					}
				}
			}).open();
		});
	}

	/**
	 * Create the events field
	 * Shows events that reference this person and allows linking new events
	 */
	private createEventsField(container: HTMLElement): void {
		const eventsContainer = container.createDiv({ cls: 'crc-events-field' });

		// Header with label and add button
		const header = eventsContainer.createDiv({ cls: 'crc-events-field__header' });
		header.createSpan({ cls: 'crc-events-field__label', text: '事件' });

		// Button container for multiple buttons
		const buttonContainer = header.createDiv({ cls: 'crc-events-field__buttons' });

		const linkBtn = buttonContainer.createEl('button', {
			cls: 'crc-btn crc-btn--secondary crc-btn--small'
		});
		const linkIcon = createLucideIcon('link', 14);
		linkBtn.appendChild(linkIcon);
		linkBtn.appendText(' 关联');

		const createBtn = buttonContainer.createEl('button', {
			cls: 'crc-btn crc-btn--secondary crc-btn--small'
		});
		const createIcon = createLucideIcon('plus', 14);
		createBtn.appendChild(createIcon);
		createBtn.appendText(' 创建');

		// List of events referencing this person
		const eventList = eventsContainer.createDiv({ cls: 'crc-events-field__list' });

		// Render function to update the list
		const renderEventList = () => {
			eventList.empty();

			const personEvents = this.getEventsForPerson();

			if (personEvents.length === 0) {
				const emptyState = eventList.createDiv({ cls: 'crc-events-field__empty' });
				emptyState.setText('没有引用此人物的事件');
				return;
			}

			// Render each event
			for (const event of personEvents) {
				const eventItem = eventList.createDiv({ cls: 'crc-events-field__item' });

				// Event info container (clickable to open note)
				const infoContainer = eventItem.createDiv({ cls: 'crc-events-field__info' });

				// Event title
				const titleSpan = infoContainer.createSpan({ cls: 'crc-events-field__title' });
				titleSpan.setText(event.title);

				// Event type badge with color
				if (event.eventType && this.plugin) {
					const typeDef = getEventType(
						event.eventType,
						this.plugin.settings.customEventTypes,
						this.plugin.settings.showBuiltInEventTypes
					);
					const typeBadge = infoContainer.createSpan({ cls: 'crc-events-field__type' });
					if (typeDef) {
						typeBadge.setText(typeDef.name);
						if (typeDef.color) {
							typeBadge.style.setProperty('background-color', typeDef.color);
							typeBadge.style.setProperty('color', getContrastColor(typeDef.color));
						}
					} else {
						typeBadge.setText(event.eventType);
					}
				}

				// Event date
				if (event.date) {
					const dateSpan = infoContainer.createSpan({ cls: 'crc-events-field__date' });
					dateSpan.setText(event.date);
				}

				// Unlink button
				const unlinkBtn = eventItem.createEl('button', {
					cls: 'crc-btn crc-btn--icon crc-btn--danger',
					attr: { 'aria-label': `取消关联${event.title}` }
				});
				const unlinkIcon = createLucideIcon('unlink', 14);
				unlinkBtn.appendChild(unlinkIcon);

				unlinkBtn.addEventListener('click', (e) => {
					e.stopPropagation();
					void (async () => {
						await this.unlinkEventFromPerson(event);
						renderEventList();
					})();
				});

				// Click info area to open event note
				infoContainer.addEventListener('click', () => {
					void this.app.workspace.openLinkText(event.filePath, '', false);
				});
			}
		};

		// Initial render
		renderEventList();

		// Link button handler - open event picker
		linkBtn.addEventListener('click', () => {
			if (!this.plugin) {
				new Notice('插件不可用');
				return;
			}

			// Get currently linked event cr_ids to exclude
			const linkedEvents = this.getEventsForPerson();
			const excludeEvents = linkedEvents.map(e => e.crId);

			new EventPickerModal(this.app, this.plugin, {
				onSelect: async (event) => {
					await this.linkEventToPerson(event);
					renderEventList();
				},
				excludeEvents,
				allowCreate: false
			}).open();
		});

		// Create button handler - open create event modal with person pre-filled
		createBtn.addEventListener('click', () => {
			if (!this.plugin) {
				new Notice('插件不可用');
				return;
			}

			const eventService = this.plugin.getEventService();
			if (!eventService) {
					new Notice('事件服务不可用');
				return;
			}

			new CreateEventModal(
				this.app,
				eventService,
				this.plugin.settings,
				{
					initialPerson: {
						name: this.personData.name || '',
						crId: this.personData.crId || '',
						basename: this.editingFile?.basename
					},
					onCreated: () => {
						// Refresh the event list after creation
						// Need a small delay for the cache to update
						window.setTimeout(() => renderEventList(), 100);
					},
					plugin: this.plugin
				}
			).open();
		});
	}

	/**
	 * Link an event to this person by adding person to event's persons array
	 */
	private async linkEventToPerson(event: EventNote): Promise<void> {
		const personName = this.personData.name;
		if (!personName) {
			new Notice('关联事件需要填写人物姓名');
			return;
		}

		const personWikilink = `[[${personName}]]`;

		try {
			await this.app.fileManager.processFrontMatter(event.file, (frontmatter) => {
				// Initialize persons array if it doesn't exist
				if (!frontmatter.persons) {
					frontmatter.persons = [];
				}

				// Ensure it's an array
				if (!Array.isArray(frontmatter.persons)) {
					frontmatter.persons = [frontmatter.persons];
				}

				// Check if person is already linked
				const alreadyLinked = frontmatter.persons.some((p: string) => {
					const match = p.match(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/);
					const refName = match ? match[1] : p;
					return refName.toLowerCase() === personName.toLowerCase();
				});

				if (!alreadyLinked) {
					frontmatter.persons.push(personWikilink);
				}
			});

			new Notice(`已将"${event.title}"关联到${personName}`);
		} catch (error) {
			console.error('Failed to link event:', error);
			new Notice(`关联事件失败：${error instanceof Error ? error.message : '未知错误'}`);
		}
	}

	/**
	 * Unlink an event from this person by removing person from event's persons array
	 */
	private async unlinkEventFromPerson(event: EventNote): Promise<void> {
		const personName = this.personData.name;
		if (!personName) return;

		try {
			await this.app.fileManager.processFrontMatter(event.file, (frontmatter) => {
				if (!frontmatter.persons || !Array.isArray(frontmatter.persons)) {
					return;
				}

				// Filter out this person
				frontmatter.persons = frontmatter.persons.filter((p: string) => {
					const match = p.match(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/);
					const refName = match ? match[1] : p;
					return refName.toLowerCase() !== personName.toLowerCase();
				});

				// Also check singular person property
				if (frontmatter.person) {
					const match = frontmatter.person.match(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/);
					const refName = match ? match[1] : frontmatter.person;
					if (refName.toLowerCase() === personName.toLowerCase()) {
						delete frontmatter.person;
					}
				}

				// Clean up empty persons array
				if (frontmatter.persons.length === 0) {
					delete frontmatter.persons;
				}
			});

			new Notice(`已取消"${event.title}"与${personName}的关联`);
		} catch (error) {
			console.error('Failed to unlink event:', error);
			new Notice(`取消关联事件失败：${error instanceof Error ? error.message : '未知错误'}`);
		}
	}

	/**
	 * Get events that reference this person
	 * Checks both singular person and plural persons properties
	 */
	private getEventsForPerson(): EventNote[] {
		if (!this.plugin) return [];

		const eventService = this.plugin.getEventService();
		if (!eventService) return [];

		// Get the person's name and cr_id for matching
		const personName = this.personData.name;
		const personCrId = this.personData.crId;

		if (!personName && !personCrId) return [];

		// Get all events and filter to those referencing this person
		const allEvents = eventService.getAllEvents();

		return allEvents.filter(event => {
			// Check singular person property
			if (event.person) {
				const personMatch = matchesPersonReference(event.person, personName, personCrId);
				if (personMatch) return true;
			}

			// Check plural persons property
			if (event.persons && event.persons.length > 0) {
				for (const p of event.persons) {
					if (matchesPersonReference(p, personName, personCrId)) {
						return true;
					}
				}
			}

			return false;
		});
	}

	// matchesPersonReference is imported from create-person-types.ts

	// getContrastColor is imported from create-person-types.ts

	/**
	 * Create single spouse field for create mode (simplified UX)
	 * When a spouse is added, it gets moved to spousesField array
	 */
	private createSingleSpouseField(container: HTMLElement): void {
		const spouseContainer = container.createDiv({ cls: 'crc-spouse-field' });

		const setting = new Setting(spouseContainer)
			.setName(getSpouseLabel(this.plugin?.settings))
			.setDesc('关联已有的人物或新建一个');

		let inputEl: HTMLInputElement;

		setting.addText(text => {
			inputEl = text.inputEl;
			text
				.setPlaceholder('点击关联按钮选择…')
				.setDisabled(true);
		});

		setting.addButton(button => {
			const icon = createLucideIcon('link', 16);
			button.buttonEl.empty();
			button.buttonEl.addClass('crc-btn', 'crc-btn--secondary');
			button.buttonEl.appendChild(icon);
			button.buttonEl.appendText(' 关联');
			button.setTooltip(`关联${getSpouseLabel(this.plugin?.settings, { lowercase: true })}`);

			button.onClick(() => {
				const createContext: RelationshipContext = {
					relationshipType: 'spouse',
					directory: this.directory
				};

				const picker = new PersonPickerModal(this.app, (person: PersonInfo) => {
					// Add to spousesField array
					if (!this.spousesField.spouses.some(s => s.crId === person.crId)) {
						this.spousesField.spouses.push({
							crId: person.crId,
							name: person.name
						});
					}
					inputEl.value = person.name;
					inputEl.addClass('crc-input--linked');
					setting.setDesc(`已关联：${person.name}`);
				}, {
					title: `选择${getSpouseLabel(this.plugin?.settings, { lowercase: true })}`,
					subtitle: '选择已有的人物或新建一个',
					createContext: createContext,
					onCreateNew: () => {
						// Callback signals inline creation support
					},
					plugin: this.plugin,
					excludeFiles: this.editingFile ? [this.editingFile] : undefined
				});
				picker.open();
			});
		});
	}

	/**
	 * Create the spouses multi-select field with per-spouse metadata expansion (#204)
	 * Shows a list of currently linked spouses with ability to add/remove and add marriage details
	 */
	private createSpousesField(container: HTMLElement): void {
		const spousesContainer = container.createDiv({ cls: 'crc-spouses-field' });

		// Header with label and add button
		const header = spousesContainer.createDiv({ cls: 'crc-spouses-field__header' });
		header.createSpan({ cls: 'crc-spouses-field__label', text: getSpouseLabel(this.plugin?.settings, { plural: true }) });

		const addBtn = header.createEl('button', {
			cls: 'crc-btn crc-btn--secondary crc-btn--small'
		});
		const addIcon = createLucideIcon('plus', 14);
		addBtn.appendChild(addIcon);
		addBtn.appendText(` ${getAddSpouseLabel(this.plugin?.settings)}`);

		// List of current spouses
		const spouseList = spousesContainer.createDiv({ cls: 'crc-spouses-field__list' });

		// Render function to update the list
		const renderSpouseList = () => {
			spouseList.empty();

			if (this.spousesField.spouses.length === 0) {
				const emptyState = spouseList.createDiv({ cls: 'crc-spouses-field__empty' });
				emptyState.setText(`未关联${getSpouseLabel(this.plugin?.settings, { plural: true, lowercase: true })}`);
				return;
			}

			for (let i = 0; i < this.spousesField.spouses.length; i++) {
				const spouse = this.spousesField.spouses[i];
				this.renderSpouseItem(spouseList, spouse, i, renderSpouseList);
			}
		};

		// Initial render
		renderSpouseList();

		// Add button handler
		addBtn.addEventListener('click', () => {
			const createContext: RelationshipContext = {
				relationshipType: 'spouse',
				directory: this.directory
			};

			const picker = new PersonPickerModal(this.app, (person: PersonInfo) => {
				// Check if already added
				if (this.spousesField.spouses.some(s => s.crId === person.crId)) {
					new Notice(`${person.name}已关联为${getSpouseLabel(this.plugin?.settings, { lowercase: true })}`);
					return;
				}

				// Add to spouses array
				this.spousesField.spouses.push({
					crId: person.crId,
					name: person.name
				});
				renderSpouseList();
			}, {
				title: `选择${getSpouseLabel(this.plugin?.settings, { lowercase: true })}`,
				subtitle: '选择已有的人物或新建一个',
				createContext: createContext,
				onCreateNew: () => {
					// This callback signals inline creation support
				},
				plugin: this.plugin,
				excludeFiles: this.editingFile ? [this.editingFile] : undefined
			});
			picker.open();
		});
	}

	/**
	 * Render a single spouse item with inline expansion for marriage metadata
	 */
	private renderSpouseItem(
		container: HTMLElement,
		spouse: SpouseWithMetadata,
		index: number,
		onUpdate: () => void
	): void {
		const hasMetadata = !!(spouse.marriageDate || spouse.marriageLocation || spouse.marriageStatus || spouse.divorceDate);
		const spouseItem = container.createDiv({ cls: 'crc-spouse-item' });

		// Display the user-facing display name in the modal — strip wikilink
		// brackets, paths, and pipe-aliases from the underlying value so users
		// see "Rebecca Wilkin" rather than e.g.
		// "Charted Roots/People/Rebecca Wilkin|Rebecca Wilkin" (#543 follow-up).
		// `spouse.name` itself stays raw — the writer re-canonicalizes on save.
		const displayName = extractDisplayLabel(spouse.name);

		// Main row: name + actions
		const mainRow = spouseItem.createDiv({ cls: 'crc-spouse-item__main' });

		// Spouse name
		const nameSpan = mainRow.createSpan({ cls: 'crc-spouse-item__name' });
		nameSpan.setText(displayName);

		// Action buttons container
		const actions = mainRow.createDiv({ cls: 'crc-spouse-item__actions' });

		// Expand/collapse button for metadata (only show if not already expanded)
		const expandBtn = actions.createEl('button', {
			cls: 'crc-btn crc-btn--icon',
			attr: { 'aria-label': '添加婚姻详情' }
		});
		const expandIcon = createLucideIcon(hasMetadata ? 'chevron-down' : 'calendar-plus', 14);
		expandBtn.appendChild(expandIcon);

		// Remove button
		const removeBtn = actions.createEl('button', {
			cls: 'crc-btn crc-btn--icon crc-btn--danger',
			attr: { 'aria-label': `移除${displayName}` }
		});
		const removeIcon = createLucideIcon('x', 14);
		removeBtn.appendChild(removeIcon);

		removeBtn.addEventListener('click', () => {
			this.spousesField.spouses.splice(index, 1);
			onUpdate();
		});

		// Metadata expansion content (hidden by default unless has data)
		const metadataContent = spouseItem.createDiv({ cls: 'crc-spouse-item__metadata' });

		// Helper to render metadata fields
		const renderMetadataFields = () => {
			metadataContent.empty();

			// Marriage date
			new Setting(metadataContent)
				.setName('结婚日期')
				.addText(text => text
					.setPlaceholder('YYYY-MM-DD')
					.setValue(spouse.marriageDate || '')
					.onChange(value => {
						spouse.marriageDate = value || undefined;
					}));

			// Marriage location (with place picker if placeGraph available)
			const locationSetting = new Setting(metadataContent)
				.setName('结婚地点');

			// Same display-label cleanup as the spouse name (#543 follow-up):
			// strip brackets, paths, and pipe-aliases for display so users
			// see "Kaelorin" rather than "[[Kaelorin]]" or
			// "Charted Roots/Places/Kaelorin|Kaelorin". Underlying
			// `spouse.marriageLocation` stays raw.
			const locationDisplay = extractDisplayLabel(spouse.marriageLocation);

			if (this.placeGraph) {
				let locationInput: HTMLInputElement;
				locationSetting.addText(text => {
					locationInput = text.inputEl;
					text
						.setPlaceholder('点击关联进行选择…')
						.setValue(locationDisplay)
						.setDisabled(true);
				});
				locationSetting.addButton(button => {
					// Toggle Link/Unlink like the birth/death place field, so a
					// linked marriage location can be removed via the modal (#724).
					const renderButton = () => {
						button.buttonEl.empty();
						button.buttonEl.addClass('crc-btn', 'crc-btn--secondary', 'crc-btn--small');
						if (spouse.marriageLocation) {
							button.buttonEl.appendChild(createLucideIcon('unlink', 14));
							button.buttonEl.appendText(' 取消关联');
						} else {
							button.buttonEl.appendChild(createLucideIcon('link', 14));
						}
					};
					renderButton();
					button.onClick(() => {
						if (spouse.marriageLocation) {
							// Unlink — clearing both fields lets the writer's
							// pre-loop drop spouse{n}_marriage_location(+_id).
							spouse.marriageLocation = undefined;
							spouse.marriageLocationCrId = undefined;
							locationInput.value = '';
							renderButton();
							return;
						}
						const picker = new PlacePickerModal(
							this.app,
							(place: SelectedPlaceInfo) => {
								spouse.marriageLocation = place.name;
								spouse.marriageLocationCrId = place.crId;
								locationInput.value = extractDisplayLabel(place.name);
								renderButton();
							},
							{
								plugin: this.plugin
							}
						);
						picker.open();
					});
				});
			} else {
				// No placeGraph available — fall back to a free-text input.
				// Show the raw value so any edit preserves the underlying
				// wikilink shape (the readonly placeGraph path above strips
				// for display only).
					locationSetting.addText(text => text
						.setPlaceholder('例：圣玛丽教堂，伦敦')
					.setValue(spouse.marriageLocation || '')
					.onChange(value => {
						spouse.marriageLocation = value || undefined;
					}));
			}

			// Marriage status
			new Setting(metadataContent)
				.setName('状态')
				.addDropdown(dropdown => dropdown
					.addOption('', '（未指定）')
					.addOption('current', '存续')
					.addOption('divorced', '离婚')
					.addOption('widowed', '丧偶')
					.addOption('separated', '分居')
					.addOption('annulled', '婚姻无效')
					.setValue(spouse.marriageStatus || '')
					.onChange(value => {
						spouse.marriageStatus = (value as MarriageStatus) || undefined;
					}));

			// Marriage type (#628) — preset dropdown + free-text custom
			{
					const marriageTypeSetting = new Setting(metadataContent)
						.setName('婚姻类型');
				let typeCustomInput: HTMLInputElement | null = null;
				const presetList = MARRIAGE_TYPE_PRESETS as readonly string[];
				const startsCustom = !!spouse.marriageType && !presetList.includes(spouse.marriageType);

				marriageTypeSetting.addDropdown(dropdown => {
					dropdown.addOption('', '（未指定）');
					for (const preset of MARRIAGE_TYPE_PRESETS) {
						dropdown.addOption(preset, preset);
					}
					dropdown.addOption('__custom__', '自定义…');
					dropdown.setValue(startsCustom ? '__custom__' : (spouse.marriageType || ''));
					dropdown.onChange(value => {
						if (value === '__custom__') {
							if (typeCustomInput) {
								typeCustomInput.removeClass('cr-hidden');
								typeCustomInput.focus();
							}
							spouse.marriageType = typeCustomInput?.value || undefined;
						} else {
							if (typeCustomInput) {
								typeCustomInput.addClass('cr-hidden');
								typeCustomInput.value = '';
							}
							spouse.marriageType = value || undefined;
						}
					});
				});

				// Free-text input for custom marriage type (hidden unless "Custom..." is chosen)
				marriageTypeSetting.addText(text => {
					typeCustomInput = text.inputEl;
					text.setPlaceholder('例：Handfasting')
						.setValue(startsCustom ? (spouse.marriageType || '') : '')
						.onChange(value => {
							spouse.marriageType = value || undefined;
						});
					text.inputEl.addClass('crc-input--inline');
					if (!startsCustom) {
						text.inputEl.addClass('cr-hidden');
					}
				});
			}

			// Divorce date (only shown if status indicates it might be relevant)
			new Setting(metadataContent)
				.setName('离婚日期')
				.addText(text => text
					.setPlaceholder('YYYY-MM-DD')
					.setValue(spouse.divorceDate || '')
					.onChange(value => {
						spouse.divorceDate = value || undefined;
					}));

			// Collapse link
			const collapseRow = metadataContent.createDiv({ cls: 'crc-spouse-item__collapse-row' });
			const collapseLink = collapseRow.createEl('button', {
				cls: 'crc-btn crc-btn--small',
				text: '收起'
			});
			collapseLink.addEventListener('click', () => {
				spouseItem.removeClass('crc-spouse-item--expanded');
			});
		};

		// Start expanded if has metadata
		if (hasMetadata) {
			spouseItem.addClass('crc-spouse-item--expanded');
			renderMetadataFields();
		}

		// Expand button handler
		expandBtn.addEventListener('click', () => {
			const isExpanded = spouseItem.hasClass('crc-spouse-item--expanded');
			if (isExpanded) {
				spouseItem.removeClass('crc-spouse-item--expanded');
			} else {
				spouseItem.addClass('crc-spouse-item--expanded');
				renderMetadataFields();
			}
		});
	}

	/**
	 * Render post-create actions panel (for "Add Another" flow)
	 * Shows quick action buttons to continue building family after person creation
	 */
	private renderPostCreateActions(contentEl: HTMLElement): void {
		// Clear existing content
		contentEl.empty();

		// Success header
		const header = contentEl.createDiv({ cls: 'crc-modal-header' });
		const titleContainer = header.createDiv({ cls: 'crc-modal-title crc-modal-title--success' });
		const icon = createLucideIcon('check-circle', 24);
		titleContainer.appendChild(icon);
		titleContainer.appendText('人物已创建！');

		// Created person info
		const infoSection = contentEl.createDiv({ cls: 'crc-post-create-info' });
		infoSection.createDiv({
			cls: 'crc-post-create-info__name',
			text: this.createdPersonName || '未知'
		});
		infoSection.createDiv({
			cls: 'crc-post-create-info__hint',
			text: '继续完善家族信息，或关闭此对话框'
		});

		// Action buttons
		const actionsSection = contentEl.createDiv({ cls: 'crc-post-create-actions' });
		actionsSection.createEl('h4', {
			text: '为此人物添加：',
			cls: 'crc-post-create-actions__header'
		});

		const actionsGrid = actionsSection.createDiv({ cls: 'crc-post-create-actions__grid' });

		// Add spouse button
		this.createActionButton(actionsGrid, 'heart', getAddSpouseLabel(this.plugin?.settings), () => {
			this.openPostCreatePicker('spouse');
		});

		// Add child button
		this.createActionButton(actionsGrid, 'baby', '添加子女', () => {
			this.openPostCreatePicker('child');
		});

		// Add parent button
		this.createActionButton(actionsGrid, 'users', '添加父母', () => {
			this.openPostCreatePicker('parent');
		});

		// Done button (closes modal)
		const buttonContainer = contentEl.createDiv({ cls: 'crc-modal-buttons' });
		new ButtonComponent(buttonContainer)
			.setButtonText('完成')
			.setCta()
			.onClick(() => {
				this.close();
			});
	}

	/**
	 * Create an action button for post-create actions
	 */
	private createActionButton(
		container: HTMLElement,
		iconName: 'heart' | 'baby' | 'users',
		label: string,
		onClick: () => void
	): void {
		const btn = container.createEl('button', {
			cls: 'crc-post-create-action-btn'
		});
		const icon = createLucideIcon(iconName, 20);
		btn.appendChild(icon);
		btn.createSpan({ text: label });
		btn.addEventListener('click', onClick);
	}

	/**
	 * Open a person picker for post-create relationship addition
	 */
	private openPostCreatePicker(relationshipType: 'spouse' | 'child' | 'parent'): void {
		if (!this.createdPersonCrId || !this.createdFile) {
			new Notice('错误：没有可用的人物上下文');
			return;
		}

		// Determine context based on relationship type
		let suggestedSex: 'male' | 'female' | undefined;
		let pickerTitle: string;
		let relationshipLabel: string;

		if (relationshipType === 'parent') {
			// For parent, we'll show two options (father and mother)
			// First, ask which parent type
			this.showParentTypeSelector();
			return;
		} else if (relationshipType === 'spouse') {
			pickerTitle = `选择${getSpouseLabel(this.plugin?.settings, { lowercase: true })}`;
			relationshipLabel = getSpouseLabel(this.plugin?.settings, { lowercase: true });
		} else {
			pickerTitle = '选择子女';
			relationshipLabel = 'child';
		}

		const createContext: RelationshipContext = {
			relationshipType: relationshipLabel,
			suggestedSex,
			parentCrId: this.createdPersonCrId,
			directory: this.directory
		};

		const picker = new PersonPickerModal(this.app, (person: PersonInfo) => {
			void this.addRelationshipToCreatedPerson(relationshipType, person).then(() => {
				// Return to post-create actions after adding relationship
				this.renderPostCreateActions(this.contentEl);
			});
		}, {
			title: pickerTitle,
			subtitle: '选择已有的人物或新建一个',
			createContext: createContext,
			onCreateNew: () => {
				// Callback signals inline creation support
			},
			plugin: this.plugin,
			excludeFiles: this.createdFile ? [this.createdFile] : undefined
		});
		picker.open();
	}

	/**
	 * Show selector for parent type (father/mother)
	 */
	private showParentTypeSelector(): void {
		// Create a simple modal-like overlay within our modal
		const { contentEl } = this;

		contentEl.empty();

		const header = contentEl.createDiv({ cls: 'crc-modal-header' });
		const titleContainer = header.createDiv({ cls: 'crc-modal-title' });
		const icon = createLucideIcon('users', 24);
		titleContainer.appendChild(icon);
		titleContainer.appendText('添加父母');

		const choiceSection = contentEl.createDiv({ cls: 'crc-parent-type-choice' });
		choiceSection.createDiv({
			cls: 'crc-parent-type-choice__hint',
			text: '要添加哪一位父母？'
		});

		const choiceGrid = choiceSection.createDiv({ cls: 'crc-parent-type-choice__grid' });

		// Father button
		const fatherBtn = choiceGrid.createEl('button', {
			cls: 'crc-parent-type-btn'
		});
		const fatherIcon = createLucideIcon('user', 20);
		fatherBtn.appendChild(fatherIcon);
		fatherBtn.createSpan({ text: '父亲' });
		fatherBtn.addEventListener('click', () => {
			this.openParentPicker('father');
		});

		// Mother button
		const motherBtn = choiceGrid.createEl('button', {
			cls: 'crc-parent-type-btn'
		});
		const motherIcon = createLucideIcon('user', 20);
		motherBtn.appendChild(motherIcon);
		motherBtn.createSpan({ text: '母亲' });
		motherBtn.addEventListener('click', () => {
			this.openParentPicker('mother');
		});

		// Back button
		const buttonContainer = contentEl.createDiv({ cls: 'crc-modal-buttons' });
		new ButtonComponent(buttonContainer)
			.setButtonText('上一步')
			.onClick(() => {
				this.renderPostCreateActions(contentEl);
			});
	}

	/**
	 * Open parent picker for specific parent type
	 */
	private openParentPicker(parentType: 'father' | 'mother'): void {
		const suggestedSex = parentType === 'father' ? 'male' : 'female';

		const createContext: RelationshipContext = {
			relationshipType: parentType,
			suggestedSex,
			parentCrId: this.createdPersonCrId,
			directory: this.directory
		};

		const picker = new PersonPickerModal(this.app, (person: PersonInfo) => {
			void this.addRelationshipToCreatedPerson(parentType, person).then(() => {
				// Return to post-create actions after adding parent
				this.renderPostCreateActions(this.contentEl);
			});
		}, {
			title: `选择${parentType === 'father' ? '父亲' : '母亲'}`,
			subtitle: '选择已有的人物或新建一个',
			createContext: createContext,
			onCreateNew: () => {
				// Callback signals inline creation support
			},
			plugin: this.plugin,
			excludeFiles: this.createdFile ? [this.createdFile] : undefined
		});
		picker.open();
	}

	/**
	 * Add a relationship to the created person's note
	 * Handles bidirectional linking for parent-child and spouse relationships
	 */
	private async addRelationshipToCreatedPerson(
		relationshipType: 'spouse' | 'child' | 'father' | 'mother',
		person: PersonInfo
	): Promise<void> {
		if (!this.createdFile) {
			new Notice('错误：没有可更新的文件');
			return;
		}

		try {
			const data: Partial<PersonData> = {};
			const cache = this.app.metadataCache.getFileCache(this.createdFile);
			const createdPersonCrId = cache?.frontmatter?.cr_id;
			const createdPersonName = cache?.frontmatter?.name || this.createdFile.basename;
			const createdPersonSex = cache?.frontmatter?.sex;

			if (!createdPersonCrId) {
				new Notice('错误：找不到所创建人物的 cr_id');
				return;
			}

			if (relationshipType === 'spouse') {
				// Add to spouse array
				const existingSpouseIds = cache?.frontmatter?.spouse_id || [];
				const existingSpouseNames = cache?.frontmatter?.spouse || [];

				// Normalize to arrays
				const spouseIds = Array.isArray(existingSpouseIds) ? [...existingSpouseIds] : existingSpouseIds ? [existingSpouseIds] : [];
				const spouseNames = Array.isArray(existingSpouseNames) ? [...existingSpouseNames] : existingSpouseNames ? [existingSpouseNames] : [];

				// Add new spouse if not already present
				if (!spouseIds.includes(person.crId)) {
					spouseIds.push(person.crId);
					spouseNames.push(person.name);
				}

				data.spouseCrId = spouseIds;
				data.spouseName = spouseNames;

				// Bidirectional: add created person to the spouse's spouse array
				await addBidirectionalSpouseLink(this.app, person.crId, createdPersonCrId, createdPersonName, this.directory);
			} else if (relationshipType === 'child') {
				// Add to child array
				const existingChildIds = cache?.frontmatter?.children_id || [];
				const existingChildNames = cache?.frontmatter?.children || [];

				// Normalize to arrays
				const childIds = Array.isArray(existingChildIds) ? [...existingChildIds] : existingChildIds ? [existingChildIds] : [];
				const childNames = Array.isArray(existingChildNames) ? [...existingChildNames] : existingChildNames ? [existingChildNames] : [];

				// Add new child if not already present
				if (!childIds.includes(person.crId)) {
					childIds.push(person.crId);
					childNames.push(person.name);
				}

				data.childCrId = childIds;
				data.childName = childNames;
			} else if (relationshipType === 'father') {
				data.fatherCrId = person.crId;
				data.fatherName = person.name;
			} else if (relationshipType === 'mother') {
				data.motherCrId = person.crId;
				data.motherName = person.name;
			}

			// Suspend bidirectional linker to prevent interference
			const wasSuspended = this.plugin?.bidirectionalLinker?.['suspended'];
			if (this.plugin?.bidirectionalLinker && !wasSuspended) {
				this.plugin.bidirectionalLinker.suspend();
			}

			try {
				// Update the created person's note first
				await updatePersonNote(this.app, this.createdFile, data);

				// Wait a bit for Obsidian to update metadata cache
				await new Promise(resolve => window.setTimeout(resolve, 100));

				// Then do bidirectional linking (needs to happen AFTER update so cache is fresh)
				if (relationshipType === 'child') {
					// Bidirectional: add created person as parent to the child
					await addParentToChild(this.app, person.crId, createdPersonCrId, createdPersonName, createdPersonSex, this.directory);
				} else if (relationshipType === 'father') {
					// Bidirectional: add created person as child to the father
					await addChildToParent(this.app, person.crId, createdPersonCrId, createdPersonName, this.directory);
				} else if (relationshipType === 'mother') {
					// Bidirectional: add created person as child to the mother
					await addChildToParent(this.app, person.crId, createdPersonCrId, createdPersonName, this.directory);
				}
			} finally {
				// Resume bidirectional linker if we suspended it
				if (this.plugin?.bidirectionalLinker && !wasSuspended) {
					this.plugin.bidirectionalLinker.resume();
				}
			}
			new Notice(`已添加${relationshipType === 'spouse' ? '配偶' : relationshipType === 'child' ? '子女' : relationshipType === 'father' ? '父亲' : '母亲'}：${person.name}`);
		} catch (error) {
			console.error(`Failed to add ${relationshipType}:`, error);
			new Notice(`添加${relationshipType === 'spouse' ? '配偶' : relationshipType === 'child' ? '子女' : relationshipType === 'father' ? '父亲' : '母亲'}失败：${error instanceof Error ? error.message : '未知错误'}`);
		}
	}

	/**
	 * Create the person note
	 */
	private async createPerson(): Promise<void> {
		try {
			// Ensure directory exists
			if (this.directory) {
				const normalizedDir = normalizePath(this.directory);
				const folder = this.app.vault.getAbstractFileByPath(normalizedDir);
				if (!folder) {
					await this.app.vault.createFolder(normalizedDir);
				}
			}

			// Build person data with relationships
			const data: PersonData = {
				...this.personData
			};

			// Add father relationship
			if (this.fatherField.crId && this.fatherField.name) {
				data.fatherCrId = this.fatherField.crId;
				data.fatherName = this.fatherField.name;
			}

			// Add mother relationship
			if (this.motherField.crId && this.motherField.name) {
				data.motherCrId = this.motherField.crId;
				data.motherName = this.motherField.name;
			}

			// Add spouse relationships (with metadata for #204)
			if (this.spousesField.spouses.length > 0) {
				data.spouseCrId = this.spousesField.spouses.map(s => s.crId);
				data.spouseName = this.spousesField.spouses.map(s => s.name);
				data.spouseMetadata = this.spousesField.spouses;
			}

			// Add step-father relationship
			if (this.stepfatherField.crId && this.stepfatherField.name) {
				data.stepfatherCrId = [this.stepfatherField.crId];
				data.stepfatherName = [this.stepfatherField.name];
			}

			// Add step-mother relationship
			if (this.stepmotherField.crId && this.stepmotherField.name) {
				data.stepmotherCrId = [this.stepmotherField.crId];
				data.stepmotherName = [this.stepmotherField.name];
			}

			// Add adoptive father relationship
			if (this.adoptiveFatherField.crId && this.adoptiveFatherField.name) {
				data.adoptiveFatherCrId = this.adoptiveFatherField.crId;
				data.adoptiveFatherName = this.adoptiveFatherField.name;
			}

			// Add adoptive mother relationship
			if (this.adoptiveMotherField.crId && this.adoptiveMotherField.name) {
				data.adoptiveMotherCrId = this.adoptiveMotherField.crId;
				data.adoptiveMotherName = this.adoptiveMotherField.name;
			}

			// Add gender-neutral parents
			if (this.parentsField.crIds.length > 0) {
				data.parentCrId = [...this.parentsField.crIds];
				data.parentName = [...this.parentsField.names];
			}

			// Add children
			if (this.childrenField.crIds.length > 0) {
				data.childCrId = [...this.childrenField.crIds];
				data.childName = [...this.childrenField.names];
			}

			// Add birth place
			if (this.birthPlaceField.crId && this.birthPlaceField.name) {
				data.birthPlaceCrId = this.birthPlaceField.crId;
				data.birthPlaceName = this.birthPlaceField.name;
			}

			// Add death place
			if (this.deathPlaceField.crId && this.deathPlaceField.name) {
				data.deathPlaceCrId = this.deathPlaceField.crId;
				data.deathPlaceName = this.deathPlaceField.name;
			}

			// Add sources
			if (this.sourcesField.crIds.length > 0) {
				data.sourceCrIds = [...this.sourcesField.crIds];
				data.sourceNames = [...this.sourcesField.names];
			}

			// Add fact-level source tracking
			if (Object.keys(this.sourcedFactsFields).length > 0) {
				data.sourcedFacts = { ...this.sourcedFactsFields };
			}

			// Add collection and universe
			data.collection = this.getCollectionValue();
			data.universe = this.getUniverseValue();

			// Generate the cr_id upfront so post-create actions have person
			// context immediately, without waiting on the metadata cache to
			// catch up after the file is written (#757). createPersonNote would
			// otherwise generate its own id internally and not return it here.
			if (!data.crId) {
				data.crId = generateCrId();
			}

			const file = await createPersonNote(this.app, data, {
				directory: this.directory,
				openAfterCreate: true,
				propertyAliases: this.propertyAliases,
				includeDynamicBlocks: this.includeDynamicBlocks,
				dynamicBlockTypes: this.dynamicBlockTypes
			});

			new Notice(`已创建人物笔记：${file.basename}`);

			// Mark as saved successfully and clear persisted state
			this.savedSuccessfully = true;
			if (this.persistence) {
				void this.persistence.clear();
			}

			if (this.onCreated) {
				this.onCreated(file);
			}

			// Store created person info for post-create actions
			this.createdFile = file;
			this.createdPersonName = this.personData.name;
			// Get cr_id from the file's frontmatter
			const cache = this.app.metadataCache.getFileCache(file);
			this.createdPersonCrId = cache?.frontmatter?.cr_id || data.crId;

			// Show post-create actions instead of closing
			this.renderPostCreateActions(this.contentEl);
		} catch (error) {
			console.error('Failed to create person note:', error);
			new Notice(`创建人物笔记失败：${error instanceof Error ? error.message : '未知错误'}`);
		}
	}

	/**
	 * Update the existing person note
	 */
	private async updatePerson(): Promise<void> {
		if (!this.editingFile) {
			new Notice('没有要更新的文件');
			return;
		}

		try {
			// Build person data with relationships.
			// String fields use `?? ''` so clearing an optional field through
			// the modal actually clears the frontmatter value — `undefined` is
			// read by the writer's outer guard as "untouched" and silently
			// no-ops the clear (#406, same class as #322 and #405). Array
			// fields use `?? []` for the same reason (pronouns).
			const data: Partial<PersonData> = {
				name: this.personData.name,
				personType: this.personData.personType ?? '',
				birthDate: this.personData.birthDate ?? '',
				deathDate: this.personData.deathDate ?? '',
				burialDate: this.personData.burialDate ?? '',
				sex: this.personData.sex ?? '',
				pronouns: this.personData.pronouns ?? [],
				nickname: this.personData.nickname ?? '',
				cr_living: this.personData.cr_living,
				occupation: this.personData.occupation ?? '',
				researchLevel: this.personData.researchLevel,
				// Name components (#174, #192)
				givenName: this.personData.givenName ?? '',
				surnames: this.personData.surnames,
				maidenName: this.personData.maidenName ?? '',
				marriedNames: this.personData.marriedNames,
				// Name parts (#709)
				namePrefix: this.personData.namePrefix ?? '',
				nameSuffix: this.personData.nameSuffix ?? '',
				surnamePrefix: this.personData.surnamePrefix ?? '',
				// DNA tracking fields
				dnaSharedCm: this.personData.dnaSharedCm,
				dnaTestingCompany: this.personData.dnaTestingCompany ?? '',
				dnaKitId: this.personData.dnaKitId ?? '',
				dnaMatchType: this.personData.dnaMatchType ?? '',
				dnaEndogamyFlag: this.personData.dnaEndogamyFlag,
				dnaNotes: this.personData.dnaNotes ?? ''
			};

			// Add father relationship. Use '' (not undefined) for "cleared" so
			// updatePersonNote's clear path actually fires — undefined reads as
			// "untouched" through its outer `!== undefined` guard (#405, same
			// class as #322's date/occupation fix).
			if (this.fatherField.crId || this.fatherField.name) {
				data.fatherCrId = this.fatherField.crId;
				data.fatherName = this.fatherField.name;
			} else {
				data.fatherCrId = '';
				data.fatherName = '';
			}

			// Add mother relationship
			if (this.motherField.crId || this.motherField.name) {
				data.motherCrId = this.motherField.crId;
				data.motherName = this.motherField.name;
			} else {
				data.motherCrId = '';
				data.motherName = '';
			}

			// Add spouse relationships (with metadata for #204)
			if (this.spousesField.spouses.length > 0) {
				data.spouseCrId = this.spousesField.spouses.map(s => s.crId);
				data.spouseName = this.spousesField.spouses.map(s => s.name);
				data.spouseMetadata = this.spousesField.spouses;
			} else {
				// Explicitly clear spouses if all removed
				data.spouseCrId = [];
				data.spouseName = [];
				data.spouseMetadata = [];
			}

			// Add step-father relationship
			if (this.stepfatherField.crId || this.stepfatherField.name) {
				data.stepfatherCrId = this.stepfatherField.crId ? [this.stepfatherField.crId] : undefined;
				data.stepfatherName = this.stepfatherField.name ? [this.stepfatherField.name] : undefined;
			} else {
				data.stepfatherCrId = [];
				data.stepfatherName = [];
			}

			// Add step-mother relationship
			if (this.stepmotherField.crId || this.stepmotherField.name) {
				data.stepmotherCrId = this.stepmotherField.crId ? [this.stepmotherField.crId] : undefined;
				data.stepmotherName = this.stepmotherField.name ? [this.stepmotherField.name] : undefined;
			} else {
				data.stepmotherCrId = [];
				data.stepmotherName = [];
			}

			// Add adoptive father relationship ('' clears, see father comment above)
			if (this.adoptiveFatherField.crId || this.adoptiveFatherField.name) {
				data.adoptiveFatherCrId = this.adoptiveFatherField.crId;
				data.adoptiveFatherName = this.adoptiveFatherField.name;
			} else {
				data.adoptiveFatherCrId = '';
				data.adoptiveFatherName = '';
			}

			// Add adoptive mother relationship
			if (this.adoptiveMotherField.crId || this.adoptiveMotherField.name) {
				data.adoptiveMotherCrId = this.adoptiveMotherField.crId;
				data.adoptiveMotherName = this.adoptiveMotherField.name;
			} else {
				data.adoptiveMotherCrId = '';
				data.adoptiveMotherName = '';
			}

			// Add gender-neutral parents
			if (this.parentsField.crIds.length > 0) {
				data.parentCrId = [...this.parentsField.crIds];
				data.parentName = [...this.parentsField.names];
			} else {
				// Explicitly clear parents if all removed
				data.parentCrId = [];
				data.parentName = [];
			}

			// Add children
			if (this.childrenField.crIds.length > 0) {
				data.childCrId = [...this.childrenField.crIds];
				data.childName = [...this.childrenField.names];
			} else {
				// Explicitly clear children if all removed
				data.childCrId = [];
				data.childName = [];
			}

			// Add birth place
			if (this.birthPlaceField.crId || this.birthPlaceField.name) {
				data.birthPlaceCrId = this.birthPlaceField.crId;
				data.birthPlaceName = this.birthPlaceField.name;
			} else {
				// Explicitly clear birth place if unlinked. Empty string (not
				// undefined) is the "clear this property" signal the writer acts
				// on; undefined means "leave unchanged" (#680), matching father/mother.
				data.birthPlaceCrId = '';
				data.birthPlaceName = '';
			}

			// Add death place
			if (this.deathPlaceField.crId || this.deathPlaceField.name) {
				data.deathPlaceCrId = this.deathPlaceField.crId;
				data.deathPlaceName = this.deathPlaceField.name;
			} else {
				// Explicitly clear death place if unlinked (empty string, see above; #680).
				data.deathPlaceCrId = '';
				data.deathPlaceName = '';
			}

			// Add sources
			if (this.sourcesField.crIds.length > 0) {
				data.sourceCrIds = [...this.sourcesField.crIds];
				data.sourceNames = [...this.sourcesField.names];
			} else {
				// Explicitly clear sources if all removed
				data.sourceCrIds = [];
				data.sourceNames = [];
			}

			// Add fact-level source tracking (always include so cleared facts are removed)
			const sourcedFacts: Record<string, string[]> = {};
			for (const prop of SOURCED_PROPERTY_NAMES) {
				sourcedFacts[prop] = this.sourcedFactsFields[prop] || [];
			}
			data.sourcedFacts = sourcedFacts;

			// Add collection and universe — `?? ''` so clearing via the "(None)"
			// dropdown option actually clears the frontmatter (#406).
			data.collection = this.getCollectionValue() ?? '';
			data.universe = this.getUniverseValue() ?? '';

			await updatePersonNote(this.app, this.editingFile, data);

			// Reciprocal parent link: when children are created or linked through
			// this (the parent's) Edit Person modal, write father/mother onto each
			// child too — listing the child on the parent isn't enough, the child
			// also needs the reverse link (#697). addParentToChild is idempotent,
			// so children already linked are no-ops; this mirrors how the create
			// flow and the post-create "Add child" flow reciprocate. Done
			// explicitly because the BidirectionalLinker doesn't heal it reliably
			// (it skips when the parent's sex is unknown), so a user shouldn't have
			// to run the Data Quality "Fix bidirectional relationship
			// inconsistencies" tool after adding children.
			if (this.personData.crId && data.childCrId) {
				for (const childCrId of data.childCrId) {
					if (childCrId) {
						await addParentToChild(this.app, childCrId, this.personData.crId, data.name || '', data.sex, this.directory);
					}
				}
			}

			// Check if name changed and offer to rename file
			let renamedFile: TFile | undefined;
			const currentName = this.personData.name || '';
			if (this.originalName && currentName !== this.originalName) {
				const shouldRename = await this.showRenameConfirmation(this.originalName, currentName);
				if (shouldRename) {
					// Get folder from current file path
					const folder = this.editingFile.parent?.path || '';
					const newPath = this.generateUniqueFilename(folder, currentName || '未命名人物');

					try {
						// Get cr_id before rename for updating relationships
						const cache = this.app.metadataCache.getFileCache(this.editingFile);
						const personCrId = cache?.frontmatter?.cr_id;

						await this.app.vault.rename(this.editingFile, newPath);
						// Get the renamed file reference
						const newFile = this.app.vault.getAbstractFileByPath(newPath);
						if (newFile instanceof TFile) {
							renamedFile = newFile;
								new Notice(`文件已重命名为：${newFile.basename}`);

							// Update relationship wikilinks in other notes
							if (personCrId && currentName) {
								const relationshipManager = new RelationshipManager(this.app);
								await relationshipManager.updateRelationshipWikilinks(
									personCrId,
									this.originalName,
									currentName,
									newFile
								);
							}
						}
					} catch (renameError) {
						console.error('Failed to rename file:', renameError);
						new Notice(`重命名文件失败：${renameError instanceof Error ? renameError.message : '未知错误'}`);
					}
				}
			}

			new Notice(`已更新人物笔记：${(renamedFile || this.editingFile).basename}`);

			if (this.onUpdated) {
				this.onUpdated(renamedFile || this.editingFile);
			}

			this.close();
		} catch (error) {
			console.error('Failed to update person note:', error);
			new Notice(`更新人物笔记失败：${error instanceof Error ? error.message : '未知错误'}`);
		}
	}

	/**
	 * Show a confirmation dialog for renaming the file after name change
	 */
	private showRenameConfirmation(oldName: string, newName: string): Promise<boolean> {
		return new Promise((resolve) => {
			const modal = new Modal(this.app);
			modal.titleEl.setText('重命名文件？');

			modal.contentEl.createEl('p', {
				text: `你将人物姓名从"${oldName}"改为"${newName}"。`
			});
			modal.contentEl.createEl('p', {
				text: '是否要将笔记文件重命名以保持一致？'
			});

			const buttonContainer = modal.contentEl.createDiv({ cls: 'modal-button-container' });

			buttonContainer.createEl('button', { text: '保留原文件名' })
				.addEventListener('click', () => {
					modal.close();
					resolve(false);
				});

			const renameBtn = buttonContainer.createEl('button', {
				text: '重命名文件',
				cls: 'mod-cta'
			});
			renameBtn.addEventListener('click', () => {
				modal.close();
				resolve(true);
			});

			modal.open();
		});
	}

	/**
	 * Generate a unique filename by appending a number if the file already exists
	 */
	private generateUniqueFilename(folder: string, baseName: string): string {
		let newPath = normalizePath(`${folder}/${baseName}.md`);

		// Check if file already exists (and it's not our current file)
		let counter = 1;
		while (this.app.vault.getAbstractFileByPath(newPath) &&
			   this.app.vault.getAbstractFileByPath(newPath) !== this.editingFile) {
			newPath = normalizePath(`${folder}/${baseName} ${counter}.md`);
			counter++;
		}

		return newPath;
	}
}

/* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument -- Match scope of file-level disable at top. */
