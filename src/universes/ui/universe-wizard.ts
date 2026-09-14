/**
 * Universe Setup Wizard
 *
 * Multi-step wizard for creating new universes with optional
 * calendar, map, and schema configuration.
 */

import { Modal, Setting, Notice, TFile, setIcon } from 'obsidian';
import type CanvasRootsPlugin from '../../../main';
import { UniverseService, createUniverseService } from '../services/universe-service';
import type { UniverseStatus, CreateUniverseData } from '../types/universe-types';
import type { FictionalDateSystem, FictionalEra } from '../../dates/types/date-types';
import { DEFAULT_DATE_SYSTEMS } from '../../dates/constants/default-date-systems';
import { suggestBuiltinForUniverseName } from './calendar-suggest';
import { createLucideIcon, setLucideIcon } from '../../ui/lucide-icons';

/** Mode of calendar setup chosen on wizard step 2 (#432) */
type CalendarMode = 'none' | 'builtin' | 'custom';

/**
 * Wizard step identifiers
 */
type WizardStep = 'universe' | 'calendar' | 'map' | 'schema' | 'summary';

/**
 * Step configuration
 */
interface StepConfig {
	id: WizardStep;
	title: string;
	subtitle: string;
	skippable: boolean;
}

const WIZARD_STEPS: StepConfig[] = [
	{ id: 'universe', title: '创建宇宙', subtitle: '基本信息', skippable: false },
	{ id: 'calendar', title: '自定义历法', subtitle: '可选', skippable: true },
	{ id: 'map', title: '自定义地图', subtitle: '可选', skippable: true },
	{ id: 'schema', title: '验证规则', subtitle: '可选', skippable: true },
	{ id: 'summary', title: '摘要', subtitle: '审阅并创建', skippable: false }
];

/** Human-readable genre labels for the wizard's genre slug values (display only). */
const GENRE_LABELS: Record<string, string> = {
	fantasy: '奇幻',
	'sci-fi': '科幻',
	historical: '历史小说',
	horror: '恐怖',
	mystery: '悬疑',
	romance: '爱情',
	other: '其他'
};

/**
 * Form data for universe creation
 */
interface UniverseFormData {
	name: string;
	description: string;
	author: string;
	genre: string;
	status: UniverseStatus;
	/** In-world "current date" for aging living characters in statistics (#749). */
	currentDate: string;
}

/**
 * Form data for calendar step. `mode` selects between no calendar link,
 * a built-in calendar id pointer, and a custom calendar definition.
 */
interface CalendarFormData {
	mode: CalendarMode;
	/** Built-in calendar id (set when mode === 'builtin') */
	builtinId: string;
	/** Whether the user has manually changed the built-in selection;
	 * suppresses the slug-match preselect from overriding a deliberate pick. */
	builtinManuallySet: boolean;
	/** Custom calendar fields (used when mode === 'custom') */
	name: string;
	eras: FictionalEra[];
	defaultEra: string;
}

/**
 * Form data for map step
 */
interface MapFormData {
	enabled: boolean;
	name: string;
	imagePath: string;
	coordinateSystem: 'geographic' | 'pixel';
	boundsNorth: number;
	boundsSouth: number;
	boundsEast: number;
	boundsWest: number;
	imageWidth: number;
	imageHeight: number;
}

/**
 * Form data for schema step
 */
interface SchemaFormData {
	enabled: boolean;
	name: string;
	requiredProperties: string[];
}

/**
 * Created entities tracking
 */
interface CreatedEntities {
	universe?: TFile;
	calendar?: boolean;
	map?: TFile;
	schema?: TFile;
}

/**
 * Universe Setup Wizard Modal
 */
export class UniverseWizardModal extends Modal {
	private plugin: CanvasRootsPlugin;
	private universeService: UniverseService;
	private currentStep: number = 0;
	private onComplete?: (universeFile: TFile) => void;

	// Form data
	private universeData: UniverseFormData;
	private calendarData: CalendarFormData;
	private mapData: MapFormData;
	private schemaData: SchemaFormData;

	// Created entities
	private created: CreatedEntities = {};

	// UI elements
	private contentContainer?: HTMLElement;
	private progressContainer?: HTMLElement;

	constructor(
		plugin: CanvasRootsPlugin,
		options?: {
			onComplete?: (universeFile: TFile) => void;
		}
	) {
		super(plugin.app);
		this.plugin = plugin;
		this.universeService = createUniverseService(plugin);
		this.onComplete = options?.onComplete;

		// Initialize form data with defaults
		this.universeData = {
			name: '',
			description: '',
			author: '',
			genre: '',
			status: 'active',
			currentDate: ''
		};

		this.calendarData = {
			mode: 'none',
			builtinId: '',
			builtinManuallySet: false,
			name: '',
			eras: [],
			defaultEra: ''
		};

		this.mapData = {
			enabled: false,
			name: '',
			imagePath: '',
			coordinateSystem: 'pixel',
			boundsNorth: 100,
			boundsSouth: -100,
			boundsEast: 100,
			boundsWest: -100,
			imageWidth: 0,
			imageHeight: 0
		};

		this.schemaData = {
			enabled: false,
			name: '',
			requiredProperties: []
		};
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		this.modalEl.addClass('cr-universe-wizard');

		// Header
		const header = contentEl.createDiv({ cls: 'cr-wizard-header' });
		const titleContainer = header.createDiv({ cls: 'cr-wizard-title' });
		const icon = createLucideIcon('globe', 24);
		titleContainer.appendChild(icon);
		titleContainer.appendText('宇宙设置向导');

		// Progress indicator
		this.progressContainer = contentEl.createDiv({ cls: 'cr-wizard-progress' });
		this.renderProgress();

		// Content area
		this.contentContainer = contentEl.createDiv({ cls: 'cr-wizard-content' });
		this.renderCurrentStep();
	}

	onClose(): void {
		this.contentEl.empty();
	}

	/**
	 * Render the progress indicator
	 */
	private renderProgress(): void {
		if (!this.progressContainer) return;
		this.progressContainer.empty();

		const stepsContainer = this.progressContainer.createDiv({ cls: 'cr-wizard-steps' });

		for (let i = 0; i < WIZARD_STEPS.length; i++) {
			const step = WIZARD_STEPS[i];
			const stepEl = stepsContainer.createDiv({
				cls: `cr-wizard-step ${i === this.currentStep ? 'cr-wizard-step--active' : ''} ${i < this.currentStep ? 'cr-wizard-step--completed' : ''}`
			});

			const stepNumber = stepEl.createDiv({ cls: 'cr-wizard-step-number' });
			if (i < this.currentStep) {
				setLucideIcon(stepNumber, 'check', 14);
			} else {
				stepNumber.setText(String(i + 1));
			}

			const stepInfo = stepEl.createDiv({ cls: 'cr-wizard-step-info' });
			stepInfo.createDiv({ cls: 'cr-wizard-step-title', text: step.title });

			// Add connector line (except for last step)
			if (i < WIZARD_STEPS.length - 1) {
				stepsContainer.createDiv({
					cls: `cr-wizard-connector ${i < this.currentStep ? 'cr-wizard-connector--completed' : ''}`
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

		const step = WIZARD_STEPS[this.currentStep];

		// Step header
		const stepHeader = this.contentContainer.createDiv({ cls: 'cr-wizard-step-header' });
		stepHeader.createEl('h3', { text: step.title, cls: 'cr-wizard-step-heading' });
		stepHeader.createEl('p', { text: `第 ${this.currentStep + 1} 步，共 ${WIZARD_STEPS.length} 步`, cls: 'cr-wizard-step-counter' });

		// Step content
		const stepContent = this.contentContainer.createDiv({ cls: 'cr-wizard-step-content' });

		switch (step.id) {
			case 'universe':
				this.renderUniverseStep(stepContent);
				break;
			case 'calendar':
				this.renderCalendarStep(stepContent);
				break;
			case 'map':
				this.renderMapStep(stepContent);
				break;
			case 'schema':
				this.renderSchemaStep(stepContent);
				break;
			case 'summary':
				this.renderSummaryStep(stepContent);
				break;
		}

		// Navigation buttons
		this.renderNavigation();
	}

	/**
	 * Render Step 1: Universe basic info
	 */
	private renderUniverseStep(container: HTMLElement): void {
		container.createEl('p', {
			text: '输入虚构宇宙的基本信息。',
			cls: 'cr-wizard-step-desc'
		});

		const form = container.createDiv({ cls: 'cr-wizard-form' });

		// Name (required)
		new Setting(form)
			.setName('宇宙名称')
			.setDesc('你的虚构世界的名称')
			.addText(text => text
				.setPlaceholder('例如：中土世界、维斯特洛')
				.setValue(this.universeData.name)
				.onChange(value => {
					this.universeData.name = value;
					// Auto-fill related names if empty
					if (!this.calendarData.name) {
						this.calendarData.name = `${value}历法`;
					}
					if (!this.mapData.name) {
						this.mapData.name = `${value}地图`;
					}
					if (!this.schemaData.name) {
						this.schemaData.name = `${value}架构`;
					}
				}));

		// Description
		new Setting(form)
			.setName('描述')
			.setDesc('宇宙的简要描述')
			.addTextArea(text => {
				text.setPlaceholder('一个奇幻世界，在那里…')
					.setValue(this.universeData.description)
					.onChange(value => {
						this.universeData.description = value;
					});
				text.inputEl.rows = 3;
			});

		// Collapsible additional details
		const detailsContainer = form.createDiv({ cls: 'cr-wizard-details' });
		const detailsHeader = detailsContainer.createDiv({ cls: 'cr-wizard-details-header' });
		const detailsToggle = detailsHeader.createEl('button', {
			cls: 'cr-wizard-details-toggle',
			attr: { type: 'button' }
		});
		const toggleIcon = createLucideIcon('chevron-right', 16);
		detailsToggle.appendChild(toggleIcon);
		detailsToggle.createSpan({ text: '附加详情（可选）' });

		const detailsContent = detailsContainer.createDiv({ cls: 'cr-wizard-details-content cr-hidden' });

		detailsToggle.addEventListener('click', () => {
			const isHidden = detailsContent.hasClass('cr-hidden');
			detailsContent.toggleClass('cr-hidden', !isHidden);
			// Update the icon
			toggleIcon.empty();
			setIcon(toggleIcon, isHidden ? 'chevron-down' : 'chevron-right');
		});

		// Author
		new Setting(detailsContent)
			.setName('作者')
			.setDesc('虚构世界的创作者')
			.addText(text => text
				.setPlaceholder('例如：J.R.R. 托尔金')
				.setValue(this.universeData.author)
				.onChange(value => {
					this.universeData.author = value;
				}));

		// Genre
		new Setting(detailsContent)
			.setName('题材')
			.setDesc('题材或分类')
			.addDropdown(dropdown => dropdown
				.addOption('', '选择题材…')
				.addOption('fantasy', '奇幻')
				.addOption('sci-fi', '科幻')
				.addOption('historical', '历史小说')
				.addOption('horror', '恐怖')
				.addOption('mystery', '悬疑')
				.addOption('romance', '爱情')
				.addOption('other', '其他')
				.setValue(this.universeData.genre)
				.onChange(value => {
					this.universeData.genre = value;
				}));

		// Status
		new Setting(detailsContent)
			.setName('状态')
			.setDesc('宇宙状态')
			.addDropdown(dropdown => dropdown
				.addOption('active', '活跃')
				.addOption('draft', '草稿')
				.addOption('archived', '已归档')
				.setValue(this.universeData.status)
				.onChange(value => {
					this.universeData.status = value as UniverseStatus;
				}));

		// Current date: the universe's in-world "now", used to age living
		// characters for record superlatives (#749). Optional — can be set later
		// from the Edit Universe dialog once a calendar and history exist.
		new Setting(detailsContent)
			.setName('当前日期')
			.setDesc('宇宙自身的"现在"，采用其自身历法（例如 "342 AE"）。用于在统计中计算在世人物的年龄。可选。')
			.addText(text => text
				.setPlaceholder('e.g. 342 AE')
				.setValue(this.universeData.currentDate)
				.onChange(value => {
					this.universeData.currentDate = value;
				}));
	}

	/**
	 * Render Step 2: Calendar setup. Three modes — `none` (no link),
	 * `builtin` (point at a built-in like Galactic Standard), or
	 * `custom` (define a new calendar). Built-in mode preselects a system
	 * whose `universe` field matches the universe name's slug (#432).
	 */
	private renderCalendarStep(container: HTMLElement): void {
		container.createEl('p', {
			text: `是否要为 ${this.universeData.name || '此宇宙'}关联一个历法？`,
			cls: 'cr-wizard-step-desc'
		});

		container.createEl('p', {
			text: '历法让你可以使用"22 BBY"或"第三纪元 3019"这样的虚构日期，与现实世界日期并用。',
			cls: 'cr-wizard-step-hint'
		});

		// Slug-match preselect: if the user hasn't manually set a built-in,
		// suggest one based on the universe name. Re-runs each render so the
		// suggestion updates when the user edits step 1's name field.
		if (!this.calendarData.builtinManuallySet) {
			const suggested = suggestBuiltinForUniverseName(this.universeData.name);
			if (suggested) {
				this.calendarData.builtinId = suggested.id;
			} else if (this.calendarData.mode !== 'builtin') {
				this.calendarData.builtinId = '';
			}
		}

		const form = container.createDiv({ cls: 'cr-wizard-form' });

		// Mode picker — three radio options
		new Setting(form)
			.setName('历法')
			.setDesc('选择此宇宙处理日期的方式')
			.addDropdown(dropdown => dropdown
				.addOption('none', '无——不关联历法')
				.addOption('builtin', '内置历法')
				.addOption('custom', '自定义历法')
				.setValue(this.calendarData.mode)
				.onChange(value => {
					this.calendarData.mode = value as CalendarMode;
					this.renderCurrentStep();
				}));

		if (this.calendarData.mode === 'builtin') {
			this.renderBuiltinCalendarPicker(form);
			return;
		}

		if (this.calendarData.mode !== 'custom') {
			return;
		}

		// Calendar name
		new Setting(form)
			.setName('历法名称')
			.setDesc('历法系统的显示名称')
			.addText(text => text
				.setPlaceholder('例如：夏尔历法')
				.setValue(this.calendarData.name)
				.onChange(value => {
					this.calendarData.name = value;
				}));

		// Eras section
		form.createEl('h4', { text: '纪元', cls: 'cr-wizard-subsection' });
		form.createEl('p', {
			text: '定义你的历法中使用的时期（纪元）。',
			cls: 'cr-wizard-hint'
		});

		const erasContainer = form.createDiv({ cls: 'cr-wizard-eras' });
		this.renderEras(erasContainer);

		const addEraBtn = form.createEl('button', {
			text: '添加纪元',
			cls: 'cr-btn cr-btn--secondary cr-btn--small'
		});
		addEraBtn.prepend(createLucideIcon('plus', 14));
		addEraBtn.addEventListener('click', () => {
			this.calendarData.eras.push({
				id: `era_${this.calendarData.eras.length + 1}`,
				name: '',
				abbrev: '',
				epoch: 0,
				direction: 'forward'
			});
			this.renderEras(erasContainer);
		});
	}

	/**
	 * Render the built-in calendar picker (used when mode === 'builtin').
	 * Shows a dropdown of `DEFAULT_DATE_SYSTEMS` plus a description of the
	 * currently selected calendar's eras for confirmation.
	 */
	private renderBuiltinCalendarPicker(form: HTMLElement): void {
		const dropdown = new Setting(form)
			.setName('内置历法')
			.setDesc('为此宇宙选择一个内置历法系统');

		dropdown.addDropdown(dd => {
			if (!this.calendarData.builtinId) {
				dd.addOption('', '选择历法…');
			}
			for (const sys of DEFAULT_DATE_SYSTEMS) {
				dd.addOption(sys.id, sys.name);
			}
			dd.setValue(this.calendarData.builtinId);
			dd.onChange(value => {
				this.calendarData.builtinId = value;
				this.calendarData.builtinManuallySet = true;
				this.renderCurrentStep();
			});
		});

		const selected = DEFAULT_DATE_SYSTEMS.find(s => s.id === this.calendarData.builtinId);
		if (selected) {
			const eraSummary = selected.eras
				.map(e => e.abbrev ? `${e.name} (${e.abbrev})` : e.name)
				.join(', ');
			form.createEl('p', {
				text: `纪元：${eraSummary}`,
				cls: 'cr-wizard-hint'
			});
		}
	}

	/**
	 * Render eras list
	 */
	private renderEras(container: HTMLElement): void {
		container.empty();

		if (this.calendarData.eras.length === 0) {
			container.createEl('p', {
				text: '未定义纪元。请至少为该历法添加一个纪元。',
				cls: 'cr-wizard-empty'
			});
			return;
		}

		const table = container.createEl('table', { cls: 'cr-wizard-era-table' });
		const thead = table.createEl('thead');
		const headerRow = thead.createEl('tr');
		headerRow.createEl('th', { text: '名称' });
		headerRow.createEl('th', { text: '缩写' });
		headerRow.createEl('th', { text: '纪元起点' });
		headerRow.createEl('th', { text: '' });

		const tbody = table.createEl('tbody');

		for (let i = 0; i < this.calendarData.eras.length; i++) {
			const era = this.calendarData.eras[i];
			const row = tbody.createEl('tr');

			// Name
			const nameCell = row.createEl('td');
			const nameInput = nameCell.createEl('input', {
				type: 'text',
				cls: 'cr-wizard-input',
				value: era.name,
				attr: { placeholder: '例如：第三纪元' }
			});
			nameInput.addEventListener('input', () => {
				era.name = nameInput.value;
				era.id = nameInput.value.toLowerCase().replace(/[^a-z0-9]+/g, '_');
			});

			// Abbreviation
			const abbrevCell = row.createEl('td');
			const abbrevInput = abbrevCell.createEl('input', {
				type: 'text',
				cls: 'cr-wizard-input cr-wizard-input--short',
				value: era.abbrev,
				attr: { placeholder: 'TA' }
			});
			abbrevInput.addEventListener('input', () => {
				era.abbrev = abbrevInput.value;
			});

			// Epoch
			const epochCell = row.createEl('td');
			const epochInput = epochCell.createEl('input', {
				type: 'number',
				cls: 'cr-wizard-input cr-wizard-input--short',
				value: String(era.epoch),
				attr: { placeholder: '0' }
			});
			epochInput.addEventListener('input', () => {
				era.epoch = parseInt(epochInput.value) || 0;
			});

			// Remove button
			const actionsCell = row.createEl('td');
			const removeBtn = actionsCell.createEl('button', {
				cls: 'cr-btn cr-btn--icon cr-btn--danger',
				attr: { 'aria-label': '移除纪元' }
			});
			setLucideIcon(removeBtn, 'x', 14);
			removeBtn.addEventListener('click', () => {
				this.calendarData.eras.splice(i, 1);
				this.renderEras(container);
			});
		}
	}

	/**
	 * Render Step 3: Custom map
	 */
	private renderMapStep(container: HTMLElement): void {
		container.createEl('p', {
			text: `是否要为 ${this.universeData.name || '此宇宙'}创建自定义地图？`,
			cls: 'cr-wizard-step-desc'
		});

		container.createEl('p', {
			text: '自定义地图让你可以在虚构世界地图上可视化地点。',
			cls: 'cr-wizard-step-hint'
		});

		const form = container.createDiv({ cls: 'cr-wizard-form' });

		// Enable toggle
		new Setting(form)
			.setName('创建自定义地图')
			.setDesc('为此宇宙设置虚构世界地图')
			.addToggle(toggle => toggle
				.setValue(this.mapData.enabled)
				.onChange(value => {
					this.mapData.enabled = value;
					this.renderCurrentStep();
				}));

		if (!this.mapData.enabled) {
			return;
		}

		// Map name
		new Setting(form)
			.setName('地图名称')
			.setDesc('地图的显示名称')
			.addText(text => text
				.setPlaceholder('例如：中土世界地图')
				.setValue(this.mapData.name)
				.onChange(value => {
					this.mapData.name = value;
				}));

		// Image path
		const imagePathSetting = new Setting(form)
			.setName('图片路径')
			.setDesc('库中地图图像文件的路径');

		imagePathSetting.addText(text => text
			.setPlaceholder('例如：assets/maps/world-map.jpg')
			.setValue(this.mapData.imagePath)
			.onChange(value => {
				this.mapData.imagePath = value;
				void this.loadImageDimensions(value);
			}));

		imagePathSetting.addButton(btn => {
			btn.setButtonText('浏览')
				.onClick(() => {
					this.browseForImage();
				});
		});

		// Note about configuring bounds later
		form.createEl('p', {
			text: '创建后你可以通过编辑地图笔记来配置地图边界和坐标。',
			cls: 'cr-wizard-hint'
		});
	}

	/**
	 * Browse for an image file
	 */
	private browseForImage(): void {
		const imageExtensions = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'];
		const allFiles = this.app.vault.getFiles();
		const imageFiles = allFiles.filter(f =>
			imageExtensions.includes(f.extension.toLowerCase())
		);

		if (imageFiles.length === 0) {
			new Notice('库中未找到图像文件');
			return;
		}

		// Create a simple file picker modal
		const picker = new ImagePickerModal(this.app, imageFiles, (selectedPath) => {
			this.mapData.imagePath = selectedPath;
			void this.loadImageDimensions(selectedPath);
			this.renderCurrentStep();
		});
		picker.open();
	}

	/**
	 * Load image dimensions from the vault file
	 */
	private async loadImageDimensions(imagePath: string): Promise<void> {
		if (!imagePath) return;

		const file = this.app.vault.getAbstractFileByPath(imagePath);
		if (!file || !(file instanceof TFile)) return;

		try {
			const resourcePath = this.app.vault.getResourcePath(file);
			const img = new Image();
			await new Promise<void>((resolve, reject) => {
				img.onload = () => {
					this.mapData.imageWidth = img.naturalWidth;
					this.mapData.imageHeight = img.naturalHeight;
					resolve();
				};
				img.onerror = reject;
				img.src = resourcePath;
			});
		} catch {
			// Ignore load errors
		}
	}

	/**
	 * Render Step 4: Validation schema
	 */
	private renderSchemaStep(container: HTMLElement): void {
		container.createEl('p', {
			text: `是否要为 ${this.universeData.name || '此宇宙'}设置验证规则？`,
			cls: 'cr-wizard-step-desc'
		});

		container.createEl('p', {
			text: '架构用于验证实体笔记是否具有必需的属性以及正确的数据类型。',
			cls: 'cr-wizard-step-hint'
		});

		const form = container.createDiv({ cls: 'cr-wizard-form' });

		// Enable toggle
		new Setting(form)
			.setName('创建验证架构')
			.setDesc('为此宇宙中的实体设置验证规则')
			.addToggle(toggle => toggle
				.setValue(this.schemaData.enabled)
				.onChange(value => {
					this.schemaData.enabled = value;
					this.renderCurrentStep();
				}));

		if (!this.schemaData.enabled) {
			return;
		}

		// Schema name
		new Setting(form)
			.setName('架构名称')
			.setDesc('架构的显示名称')
			.addText(text => text
				.setPlaceholder('例如：中土世界架构')
				.setValue(this.schemaData.name)
				.onChange(value => {
					this.schemaData.name = value;
				}));

		// Required properties
		form.createEl('h4', { text: '必需属性', cls: 'cr-wizard-subsection' });
		form.createEl('p', {
			text: '此宇宙中所有人物都必须具有的属性。',
			cls: 'cr-wizard-hint'
		});

		const propsContainer = form.createDiv({ cls: 'cr-wizard-props' });
		this.renderRequiredProps(propsContainer);

		const addPropBtn = form.createEl('button', {
			text: '添加属性',
			cls: 'cr-btn cr-btn--secondary cr-btn--small'
		});
		addPropBtn.prepend(createLucideIcon('plus', 14));
		addPropBtn.addEventListener('click', () => {
			this.schemaData.requiredProperties.push('');
			this.renderRequiredProps(propsContainer);
		});

		// Note about advanced configuration
		form.createEl('p', {
			text: '创建后你可以通过编辑架构笔记来添加更复杂的验证规则。',
			cls: 'cr-wizard-hint cr-mt-2'
		});
	}

	/**
	 * Render required properties list
	 */
	private renderRequiredProps(container: HTMLElement): void {
		container.empty();

		if (this.schemaData.requiredProperties.length === 0) {
			container.createEl('p', {
				text: '没有必需属性。请添加所有实体都必须具有的属性。',
				cls: 'cr-wizard-empty'
			});
			return;
		}

		for (let i = 0; i < this.schemaData.requiredProperties.length; i++) {
			const propRow = container.createDiv({ cls: 'cr-wizard-prop-row' });

			const input = propRow.createEl('input', {
				type: 'text',
				cls: 'cr-wizard-input',
				value: this.schemaData.requiredProperties[i],
				attr: { placeholder: '例如：allegiance、house' }
			});
			input.addEventListener('input', () => {
				this.schemaData.requiredProperties[i] = input.value;
			});

			const removeBtn = propRow.createEl('button', {
				cls: 'cr-btn cr-btn--icon cr-btn--danger',
				attr: { 'aria-label': '移除' }
			});
			setLucideIcon(removeBtn, 'x', 14);
			removeBtn.addEventListener('click', () => {
				this.schemaData.requiredProperties.splice(i, 1);
				this.renderRequiredProps(container);
			});
		}
	}

	/**
	 * Render Step 5: Summary
	 */
	private renderSummaryStep(container: HTMLElement): void {
		container.createEl('p', {
			text: '创建前请审阅你的宇宙配置。',
			cls: 'cr-wizard-step-desc'
		});

		const summary = container.createDiv({ cls: 'cr-wizard-summary' });

		// Universe info
		const universeCard = summary.createDiv({ cls: 'cr-wizard-summary-card' });
		const universeHeader = universeCard.createDiv({ cls: 'cr-wizard-summary-header' });
		universeHeader.appendChild(createLucideIcon('globe', 18));
		universeHeader.createSpan({ text: '宇宙' });
		universeCard.createDiv({ cls: 'cr-wizard-summary-item', text: `名称：${this.universeData.name}` });
		if (this.universeData.description) {
			universeCard.createDiv({ cls: 'cr-wizard-summary-item cr-wizard-summary-item--desc', text: this.universeData.description });
		}
		if (this.universeData.author) {
			universeCard.createDiv({ cls: 'cr-wizard-summary-item', text: `作者：${this.universeData.author}` });
		}
		if (this.universeData.genre) {
			universeCard.createDiv({ cls: 'cr-wizard-summary-item', text: `题材：${GENRE_LABELS[this.universeData.genre] ?? this.universeData.genre}` });
		}

		// Calendar
		const calendarCard = summary.createDiv({ cls: 'cr-wizard-summary-card' });
		const calendarHeader = calendarCard.createDiv({ cls: 'cr-wizard-summary-header' });
		calendarHeader.appendChild(createLucideIcon('calendar', 18));
		calendarHeader.createSpan({ text: '历法' });
		if (this.calendarData.mode === 'builtin') {
			const sys = DEFAULT_DATE_SYSTEMS.find(s => s.id === this.calendarData.builtinId);
			calendarCard.createDiv({
				cls: 'cr-wizard-summary-item',
				text: `内置：${sys?.name ?? this.calendarData.builtinId}`
			});
		} else if (this.calendarData.mode === 'custom') {
			calendarCard.createDiv({ cls: 'cr-wizard-summary-item', text: `自定义：${this.calendarData.name}` });
			const erasText = this.calendarData.eras.map(e => e.abbrev || e.name).filter(Boolean).join('，');
			if (erasText) {
				calendarCard.createDiv({ cls: 'cr-wizard-summary-item', text: `纪元：${erasText}` });
			}
		} else {
			calendarCard.createDiv({ cls: 'cr-wizard-summary-item cr-wizard-summary-item--skipped', text: '无历法' });
		}

		// Map
		const mapCard = summary.createDiv({ cls: 'cr-wizard-summary-card' });
		const mapHeader = mapCard.createDiv({ cls: 'cr-wizard-summary-header' });
		mapHeader.appendChild(createLucideIcon('map', 18));
		mapHeader.createSpan({ text: '地图' });
		if (this.mapData.enabled) {
			mapCard.createDiv({ cls: 'cr-wizard-summary-item', text: `名称：${this.mapData.name}` });
			if (this.mapData.imagePath) {
				mapCard.createDiv({ cls: 'cr-wizard-summary-item', text: `图片：${this.mapData.imagePath}` });
			}
		} else {
			mapCard.createDiv({ cls: 'cr-wizard-summary-item cr-wizard-summary-item--skipped', text: '已跳过' });
		}

		// Schema
		const schemaCard = summary.createDiv({ cls: 'cr-wizard-summary-card' });
		const schemaHeader = schemaCard.createDiv({ cls: 'cr-wizard-summary-header' });
		schemaHeader.appendChild(createLucideIcon('clipboard-check', 18));
		schemaHeader.createSpan({ text: '架构' });
		if (this.schemaData.enabled) {
			schemaCard.createDiv({ cls: 'cr-wizard-summary-item', text: `名称：${this.schemaData.name}` });
			const validProps = this.schemaData.requiredProperties.filter(p => p.trim());
			if (validProps.length > 0) {
				schemaCard.createDiv({ cls: 'cr-wizard-summary-item', text: `必需：${validProps.join('，')}` });
			}
		} else {
			schemaCard.createDiv({ cls: 'cr-wizard-summary-item cr-wizard-summary-item--skipped', text: '已跳过' });
		}
	}

	/**
	 * Render navigation buttons
	 */
	private renderNavigation(): void {
		if (!this.contentContainer) return;

		const nav = this.contentContainer.createDiv({ cls: 'cr-wizard-nav' });
		const step = WIZARD_STEPS[this.currentStep];

		// Cancel/Back button
		if (this.currentStep === 0) {
			const cancelBtn = nav.createEl('button', {
				text: '取消',
				cls: 'cr-btn'
			});
			cancelBtn.addEventListener('click', () => this.close());
		} else {
			const backBtn = nav.createEl('button', {
				text: '上一步',
				cls: 'cr-btn'
			});
			backBtn.prepend(createLucideIcon('chevron-left', 16));
			backBtn.addEventListener('click', () => this.goBack());
		}

		// Right side buttons
		const rightBtns = nav.createDiv({ cls: 'cr-wizard-nav-right' });

		// Skip button (for skippable steps)
		if (step.skippable && this.currentStep < WIZARD_STEPS.length - 1) {
			const skipBtn = rightBtns.createEl('button', {
				text: '跳过',
				cls: 'cr-btn cr-btn--secondary'
			});
			skipBtn.addEventListener('click', () => this.goNext(true));
		}

		// Next/Create button
		if (this.currentStep < WIZARD_STEPS.length - 1) {
			const nextBtn = rightBtns.createEl('button', {
				text: '下一步',
				cls: 'cr-btn cr-btn--primary'
			});
			nextBtn.appendChild(createLucideIcon('arrow-right', 16));
			nextBtn.addEventListener('click', () => this.goNext(false));
		} else {
			const createBtn = rightBtns.createEl('button', {
				text: '创建宇宙',
				cls: 'cr-btn cr-btn--primary'
			});
			createBtn.prepend(createLucideIcon('check', 16));
			createBtn.addEventListener('click', () => void this.createUniverse());
		}
	}

	/**
	 * Go to next step
	 */
	private goNext(skip: boolean): void {
		const step = WIZARD_STEPS[this.currentStep];

		// Validate current step if not skipping
		if (!skip && !this.validateCurrentStep()) {
			return;
		}

		// If skipping, disable the feature for this step
		if (skip) {
			switch (step.id) {
				case 'calendar':
					this.calendarData.mode = 'none';
					break;
				case 'map':
					this.mapData.enabled = false;
					break;
				case 'schema':
					this.schemaData.enabled = false;
					break;
			}
		}

		if (this.currentStep < WIZARD_STEPS.length - 1) {
			this.currentStep++;
			this.renderProgress();
			this.renderCurrentStep();
		}
	}

	/**
	 * Go to previous step
	 */
	private goBack(): void {
		if (this.currentStep > 0) {
			this.currentStep--;
			this.renderProgress();
			this.renderCurrentStep();
		}
	}

	/**
	 * Validate current step
	 */
	private validateCurrentStep(): boolean {
		const step = WIZARD_STEPS[this.currentStep];

		switch (step.id) {
			case 'universe': {
				if (!this.universeData.name.trim()) {
					new Notice('请输入宇宙名称');
					return false;
				}
				// Check for duplicate name
				const existing = this.universeService.getUniverseByName(this.universeData.name);
				if (existing) {
					new Notice(`名为"${this.universeData.name}"的宇宙已存在`);
					return false;
				}
				return true;
			}

			case 'calendar':
				if (this.calendarData.mode === 'builtin') {
					if (!this.calendarData.builtinId) {
						new Notice('请选择内置历法');
						return false;
					}
				} else if (this.calendarData.mode === 'custom') {
					if (!this.calendarData.name.trim()) {
						new Notice('请输入历法名称');
						return false;
					}
					const validEras = this.calendarData.eras.filter(e => e.name && e.abbrev);
					if (validEras.length === 0) {
						new Notice('请至少添加一个包含名称和缩写的纪元');
						return false;
					}
				}
				return true;

			case 'map':
				if (this.mapData.enabled) {
					if (!this.mapData.name.trim()) {
						new Notice('请输入地图名称');
						return false;
					}
				}
				return true;

			case 'schema':
				if (this.schemaData.enabled) {
					if (!this.schemaData.name.trim()) {
						new Notice('请输入架构名称');
						return false;
					}
				}
				return true;

			default:
				return true;
		}
	}

	/**
	 * Create the universe and all associated entities
	 */
	private async createUniverse(): Promise<void> {
		try {
			// Resolve the calendar id we'll write into the universe note's
			// `default_calendar` field. Built-in mode points at the built-in's
			// id directly; custom mode pre-computes the same slug the
			// settings-side calendar create will use, so the two stay in sync
			// without a second write pass after creation (#432).
			const customCalendarId = this.calendarData.mode === 'custom'
				? this.calendarData.name.toLowerCase().replace(/[^a-z0-9]+/g, '_')
				: '';
			const defaultCalendarId = this.calendarData.mode === 'builtin'
				? this.calendarData.builtinId
				: this.calendarData.mode === 'custom'
					? customCalendarId
					: undefined;

			// Create universe note
			const universeData: CreateUniverseData = {
				name: this.universeData.name,
				description: this.universeData.description || undefined,
				author: this.universeData.author || undefined,
				genre: this.universeData.genre || undefined,
				status: this.universeData.status,
				defaultCalendar: defaultCalendarId || undefined,
				currentDate: this.universeData.currentDate.trim() || undefined
			};

			const universeFile = await this.universeService.createUniverse(universeData);
			this.created.universe = universeFile;

			// Get the actual cr_id from the created universe file
			// Need to wait for metadata cache to update
			await new Promise(resolve => window.setTimeout(resolve, 100));
			const cache = this.app.metadataCache.getFileCache(universeFile);
			const universeCrId = cache?.frontmatter?.cr_id as string | undefined;

			if (!universeCrId) {
				throw new Error('Failed to get universe cr_id from created file');
			}

			// Create custom calendar if chosen (built-in mode requires no
			// calendar artifact — only the universe-side pointer).
			if (this.calendarData.mode === 'custom') {
				await this.createCalendar(universeCrId);
			}

			// Create map if enabled
			if (this.mapData.enabled) {
				await this.createMap(universeCrId);
			}

			// Create schema if enabled
			if (this.schemaData.enabled) {
				await this.createSchema(universeCrId);
			}

			// Show success and close
			this.showSuccess(universeFile);

		} catch (error) {
			console.error('Failed to create universe:', error);
			new Notice(`创建宇宙失败：${error instanceof Error ? error.message : '未知错误'}`);
		}
	}

	/**
	 * Create the calendar date system
	 */
	private async createCalendar(universeId: string): Promise<void> {
		const validEras = this.calendarData.eras.filter(e => e.name && e.abbrev);

		const dateSystem: FictionalDateSystem = {
			id: this.calendarData.name.toLowerCase().replace(/[^a-z0-9]+/g, '_'),
			name: this.calendarData.name,
			universe: universeId,
			eras: validEras,
			defaultEra: validEras.length > 0 ? validEras[0].id : undefined,
			builtIn: false
		};

		// Add to plugin settings
		this.plugin.settings.fictionalDateSystems.push(dateSystem);
		await this.plugin.saveSettings();

		this.created.calendar = true;
		new Notice(`已创建历法：${this.calendarData.name}`);
	}

	/**
	 * Create the map note
	 */
	private async createMap(universeId: string): Promise<void> {
		const mapId = this.mapData.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
		const folder = this.plugin.settings.mapsFolder || '';

		// Build frontmatter
		const frontmatterLines = [
			'---',
			'cr_type: map',
			`map_id: ${mapId}`,
			`name: "${this.mapData.name}"`,
			`universe: ${universeId}`,
			`coordinate_system: ${this.mapData.coordinateSystem}`
		];

		if (this.mapData.imagePath) {
			frontmatterLines.push(`image: ${this.mapData.imagePath}`);
		}

		if (this.mapData.coordinateSystem === 'geographic') {
			frontmatterLines.push(`bounds_north: ${this.mapData.boundsNorth}`);
			frontmatterLines.push(`bounds_south: ${this.mapData.boundsSouth}`);
			frontmatterLines.push(`bounds_east: ${this.mapData.boundsEast}`);
			frontmatterLines.push(`bounds_west: ${this.mapData.boundsWest}`);
		} else if (this.mapData.coordinateSystem === 'pixel') {
			if (this.mapData.imageWidth > 0 && this.mapData.imageHeight > 0) {
				frontmatterLines.push(`image_width: ${this.mapData.imageWidth}`);
				frontmatterLines.push(`image_height: ${this.mapData.imageHeight}`);
			}
			frontmatterLines.push('default_zoom: 1');
		}

		frontmatterLines.push('---');
		frontmatterLines.push('');
		frontmatterLines.push(`# ${this.mapData.name}`);
		frontmatterLines.push('');
		frontmatterLines.push(`A custom map for ${this.universeData.name}.`);

		const content = frontmatterLines.join('\n');

		// Ensure folder exists
		if (folder) {
			const folderExists = this.app.vault.getAbstractFileByPath(folder);
			if (!folderExists) {
				await this.app.vault.createFolder(folder);
			}
		}

		// Create file
		const filename = `${this.mapData.name}.md`;
		const filepath = folder ? `${folder}/${filename}` : filename;
		const file = await this.app.vault.create(filepath, content);

		this.created.map = file;
		new Notice(`已创建地图：${this.mapData.name}`);
	}

	/**
	 * Create the schema note
	 */
	private async createSchema(universeId: string): Promise<void> {
		const schemaId = `schema-${this.schemaData.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
		const folder = this.plugin.settings.schemasFolder || '';

		const validProps = this.schemaData.requiredProperties.filter(p => p.trim());

		// Build frontmatter
		const frontmatterLines = [
			'---',
			'cr_type: schema',
			`cr_id: ${schemaId}`,
			`name: "${this.schemaData.name}"`,
			`description: "Validation schema for ${this.universeData.name}"`,
			'applies_to_type: universe',
			`applies_to_value: ${universeId}`
		];

		if (validProps.length > 0) {
			frontmatterLines.push('definition:');
			frontmatterLines.push('  required_properties:');
			for (const prop of validProps) {
				frontmatterLines.push(`    - ${prop}`);
			}
			frontmatterLines.push('  properties: {}');
			frontmatterLines.push('  constraints: []');
		}

		frontmatterLines.push('---');
		frontmatterLines.push('');
		frontmatterLines.push(`# ${this.schemaData.name}`);
		frontmatterLines.push('');
		frontmatterLines.push(`Validation schema for entities in ${this.universeData.name}.`);

		const content = frontmatterLines.join('\n');

		// Ensure folder exists
		if (folder) {
			const folderExists = this.app.vault.getAbstractFileByPath(folder);
			if (!folderExists) {
				await this.app.vault.createFolder(folder);
			}
		}

		// Create file
		const filename = `${this.schemaData.name}.md`;
		const filepath = folder ? `${folder}/${filename}` : filename;
		const file = await this.app.vault.create(filepath, content);

		this.created.schema = file;
		new Notice(`已创建架构：${this.schemaData.name}`);
	}

	/**
	 * Show success message and options
	 */
	private showSuccess(universeFile: TFile): void {
		if (!this.contentContainer) return;
		this.contentContainer.empty();

		const success = this.contentContainer.createDiv({ cls: 'cr-wizard-success' });

		const icon = success.createDiv({ cls: 'cr-wizard-success-icon' });
		setLucideIcon(icon, 'check-circle', 48);

		success.createEl('h3', { text: '宇宙创建成功！' });
		success.createEl('p', { text: this.universeData.name, cls: 'cr-wizard-success-name' });

		// Created entities list
		const entitiesList = success.createDiv({ cls: 'cr-wizard-success-entities' });
		entitiesList.createEl('p', { text: '已创建的实体：', cls: 'cr-wizard-success-label' });

		const list = entitiesList.createEl('ul');
		list.createEl('li', { text: `✓ 宇宙笔记：${universeFile.basename}` });

		if (this.created.calendar) {
			list.createEl('li', { text: `✓ 日期系统：${this.calendarData.name}` });
		} else {
			list.createEl('li', { text: '○ 历法：已跳过', cls: 'cr-wizard-skipped' });
		}

		if (this.created.map) {
			list.createEl('li', { text: `✓ 地图笔记：${this.created.map.basename}` });
		} else {
			list.createEl('li', { text: '○ 地图：已跳过', cls: 'cr-wizard-skipped' });
		}

		if (this.created.schema) {
			list.createEl('li', { text: `✓ 架构笔记：${this.created.schema.basename}` });
		} else {
			list.createEl('li', { text: '○ 架构：已跳过', cls: 'cr-wizard-skipped' });
		}

		// What's next
		const nextSteps = success.createDiv({ cls: 'cr-wizard-next-steps' });
		nextSteps.createEl('p', { text: '接下来做什么？', cls: 'cr-wizard-success-label' });
		const stepsList = nextSteps.createEl('ul');
		stepsList.createEl('li', { text: '向你的宇宙添加人物、地点和事件' });
		stepsList.createEl('li', { text: '打开宇宙笔记以添加你自己的文档' });

		// Buttons
		const buttons = success.createDiv({ cls: 'cr-wizard-success-buttons' });

		const openBtn = buttons.createEl('button', {
			text: '打开宇宙笔记',
			cls: 'cr-btn cr-btn--primary'
		});
		openBtn.addEventListener('click', () => {
			void this.app.workspace.getLeaf(false).openFile(universeFile);
			this.close();
		});

		const doneBtn = buttons.createEl('button', {
			text: '完成',
			cls: 'cr-btn'
		});
		doneBtn.addEventListener('click', () => {
			this.close();
			if (this.onComplete) {
				this.onComplete(universeFile);
			}
		});
	}
}

/**
 * Simple image picker modal
 */
class ImagePickerModal extends Modal {
	private files: TFile[];
	private onSelect: (path: string) => void;
	private searchInput?: HTMLInputElement;
	private listContainer?: HTMLElement;

	constructor(app: InstanceType<typeof Modal>['app'], files: TFile[], onSelect: (path: string) => void) {
		super(app);
		this.files = files;
		this.onSelect = onSelect;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('cr-image-picker-modal');

		contentEl.createEl('h3', { text: '选择地图图像' });

		const searchContainer = contentEl.createDiv({ cls: 'cr-search-container' });
		this.searchInput = searchContainer.createEl('input', {
			type: 'text',
			placeholder: '搜索图像…',
			cls: 'cr-search-input'
		});
		this.searchInput.addEventListener('input', () => this.filterFiles());

		this.listContainer = contentEl.createDiv({ cls: 'cr-file-list' });
		this.renderFiles(this.files);

		this.searchInput.focus();
	}

	onClose() {
		this.contentEl.empty();
	}

	private filterFiles(): void {
		const query = this.searchInput?.value.toLowerCase() || '';
		const filtered = this.files.filter(f =>
			f.path.toLowerCase().includes(query) ||
			f.basename.toLowerCase().includes(query)
		);
		this.renderFiles(filtered);
	}

	private renderFiles(files: TFile[]): void {
		if (!this.listContainer) return;
		this.listContainer.empty();

		if (files.length === 0) {
			this.listContainer.createEl('p', {
				text: '未找到匹配的图像',
				cls: 'cr-no-results'
			});
			return;
		}

		for (const file of files.slice(0, 50)) {
			const item = this.listContainer.createDiv({ cls: 'cr-file-item' });
			item.createSpan({ text: file.basename, cls: 'cr-file-name' });
			item.createSpan({ text: file.path, cls: 'cr-file-path' });

			item.addEventListener('click', () => {
				this.onSelect(file.path);
				this.close();
			});
		}

		if (files.length > 50) {
			this.listContainer.createEl('p', {
				text: `显示 ${files.length} 个结果中的前 50 个。请细化搜索条件。`,
				cls: 'cr-more-results'
			});
		}
	}
}