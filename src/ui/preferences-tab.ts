/**
 * Preferences Tab UI Component
 *
 * Renders the Preferences tab in the Control Center, showing
 * property aliases, folder locations, and other user preferences.
 */

import { Setting, Notice, App, SliderComponent, AbstractInputSuggest, TextComponent, TFolder } from 'obsidian';
import { setIcon } from 'obsidian';

/**
 * Inline suggest for folder paths with autocomplete from existing vault folders
 */
class FolderSuggest extends AbstractInputSuggest<TFolder> {
	private textComponent: TextComponent;
	private onSelectValue: (value: string) => void;

	constructor(app: App, textComponent: TextComponent, onSelectValue: (value: string) => void) {
		super(app, textComponent.inputEl);
		this.textComponent = textComponent;
		this.onSelectValue = onSelectValue;
	}

	getSuggestions(inputStr: string): TFolder[] {
		const lowerInput = inputStr.toLowerCase();
		const folders: TFolder[] = [];

		// Get all folders from the vault
		const rootFolder = this.app.vault.getRoot();
		this.collectFolders(rootFolder, folders);

		// Filter by input
		return folders
			.filter(folder => folder.path.toLowerCase().includes(lowerInput))
			.sort((a, b) => a.path.localeCompare(b.path))
			.slice(0, 20); // Limit results
	}

	private collectFolders(folder: TFolder, result: TFolder[]): void {
		for (const child of folder.children) {
			if (child instanceof TFolder) {
				result.push(child);
				this.collectFolders(child, result);
			}
		}
	}

	renderSuggestion(folder: TFolder, el: HTMLElement): void {
		el.addClass('cr-folder-suggestion');
		const iconSpan = el.createSpan({ cls: 'cr-folder-suggestion-icon' });
		setIcon(iconSpan, 'folder');
		el.createSpan({ text: folder.path });
	}

	selectSuggestion(folder: TFolder): void {
		this.textComponent.setValue(folder.path);
		this.onSelectValue(folder.path);
		this.close();
	}
}
import type CanvasRootsPlugin from '../../main';
import type { LucideIconName } from './lucide-icons';
import type { ArrowStyle, ColorScheme, CanvasGroupingStrategy, SpouseEdgeLabelFormat, SexNormalizationMode, PlaceCategory, PlaceCategoryFolderRule } from '../settings';
import {
	PropertyAliasService,
	type PropertyMetadata,
	PERSON_PROPERTY_METADATA,
	EVENT_PROPERTY_METADATA,
	PLACE_PROPERTY_METADATA,
	SOURCE_PROPERTY_METADATA
} from '../core/property-alias-service';
import {
	ValueAliasService,
	EVENT_TYPE_LABELS,
	SEX_LABELS,
	PLACE_CATEGORY_LABELS,
	NOTE_TYPE_LABELS,
	CANONICAL_EVENT_TYPES,
	CANONICAL_SEX_VALUES,
	CANONICAL_PLACE_CATEGORIES,
	CANONICAL_NOTE_TYPES,
	type ValueAliasField
} from '../core/value-alias-service';
import { createIntegrationsCard } from '../integrations/integrations-settings';
import { getSpouseCompoundLabel } from '../utils/terminology';

/**
 * Render the Preferences tab content
 */
export function renderPreferencesTab(
	container: HTMLElement,
	plugin: CanvasRootsPlugin,
	createCard: (options: { title: string; icon?: LucideIconName; subtitle?: string }) => HTMLElement,
	showTab: (tabId: string) => void,
	closeModal?: () => void
): void {
	const propertyAliasService = new PropertyAliasService(plugin);
	const valueAliasService = new ValueAliasService(plugin);

	// Deprecation notice - these settings have moved to Plugin Settings
	const deprecationNotice = container.createDiv({ cls: 'cr-info-box cr-deprecation-notice' });
	const warningIcon = deprecationNotice.createSpan({ cls: 'cr-info-box-icon' });
	setIcon(warningIcon, 'alert-triangle');
	deprecationNotice.createEl('strong', { text: '此标签页已弃用。' });
	deprecationNotice.appendText(' 所有设置已整合到 ');
	const settingsLink = deprecationNotice.createEl('a', {
		text: '设置 → Charted Roots',
		href: '#'
	});
	settingsLink.addEventListener('click', (e) => {
		e.preventDefault();
		closeModal?.();
		const appWithSettings = plugin.app as App & { setting?: { open: () => void; openTabById: (id: string) => void } };
		appWithSettings.setting?.open();
		appWithSettings.setting?.openTabById('canvas-roots');
	});
	deprecationNotice.appendText('。此标签页将在未来的版本中移除。');

	// Aliases card (property names + property values)
	renderAliasesCard(container, plugin, propertyAliasService, valueAliasService, createCard, showTab);

	// Folder Locations card
	renderFolderLocationsCard(container, plugin, createCard);

	// Place Organization card
	renderPlaceOrganizationCard(container, plugin, createCard);

	// Date Validation card
	renderDateValidationCard(container, plugin, createCard, showTab);

	// Sex Normalization card
	renderSexNormalizationCard(container, plugin, createCard);

	// Inclusive Parent Relationships card
	renderInclusiveParentsCard(container, plugin, createCard);

	// Display Preferences card
	renderDisplayPreferencesCard(container, plugin, createCard);

	// Integrations card (only shows if Calendarium or other integrations are available)
	createIntegrationsCard(container, plugin, createCard);
}

/**
 * Render a collapsible property section with Setting rows for each property
 */
function renderPropertySection(
	container: HTMLElement,
	title: string,
	properties: PropertyMetadata[],
	propertyAliasService: PropertyAliasService,
	showTab: (tabId: string) => void,
	openByDefault: boolean
): void {
	// Count how many properties have aliases configured
	const configuredCount = properties.filter(meta =>
		propertyAliasService.getAlias(meta.canonical)
	).length;

	// Create details element for collapsibility
	const section = container.createEl('details', {
		cls: 'cr-property-section'
	});

	if (openByDefault) {
		section.setAttribute('open', '');
	}

	// Create summary (clickable header)
	const summary = section.createEl('summary', {
		cls: 'cr-property-section-summary'
	});

	summary.createSpan({
		text: title,
		cls: 'cr-property-section-title'
	});

	// Show "X configured" if any are configured, otherwise show total count
	const countText = configuredCount > 0
		? `已配置 ${configuredCount} 项`
		: `${properties.length} 个属性`;
	summary.createSpan({
		text: countText,
		cls: 'cr-property-section-count'
	});

	// Create content container
	const sectionContent = section.createDiv({
		cls: 'cr-property-section-content'
	});

	// Lazy rendering: only render content when section is opened
	let rendered = false;

	const renderContent = () => {
		if (rendered) return;
		rendered = true;

		// Render each property as a Setting
		properties.forEach(meta => {
			const currentAlias = propertyAliasService.getAlias(meta.canonical) || '';

			const setting = new Setting(sectionContent)
				.setName(meta.label)
				.setDesc(meta.description)
				.addText(text => {
					text
						.setPlaceholder(meta.canonical)
						.setValue(currentAlias);

					// Validate and save only on blur (when user finishes typing)
					text.inputEl.addEventListener('blur', () => {
						void (async () => {
							const value = text.inputEl.value;
							const trimmed = value.trim();

							if (trimmed === '') {
								// Empty = remove alias
								if (currentAlias) {
									await propertyAliasService.removeAlias(currentAlias);
									showTab('preferences'); // Refresh
								}
								return;
							}

							// Check if aliasing to itself (warning)
							if (trimmed === meta.canonical) {
								new Notice(`"${trimmed}"已是规范名称`);
								text.inputEl.value = currentAlias; // Restore previous value
								return;
							}

							// Check for duplicate
							const existingMapping = propertyAliasService.aliases[trimmed];
							if (existingMapping && existingMapping !== meta.canonical) {
								new Notice(`"${trimmed}"已映射到"${existingMapping}"`);
								text.inputEl.value = currentAlias; // Restore previous value
								return;
							}

							// Valid - save
							if (trimmed !== currentAlias) {
								await propertyAliasService.setAlias(trimmed, meta.canonical);
								showTab('preferences'); // Refresh
							}
						})();
					});
				})
				.addExtraButton(button => {
					button
						.setIcon('x')
							.setTooltip('清除别名')
							.onClick(async () => {
								if (currentAlias) {
									await propertyAliasService.removeAlias(currentAlias);
									new Notice(`已清除${meta.label}的别名`);
								showTab('preferences'); // Refresh
							}
						});

					// Style clear button based on alias state
					button.extraSettingsEl.addClass(currentAlias ? 'cr-clear-btn--enabled' : 'cr-clear-btn--disabled');
				});

			// Store metadata for search filtering
			setting.settingEl.dataset.canonical = meta.canonical;
			setting.settingEl.dataset.label = meta.label;
			setting.settingEl.dataset.description = meta.description;
		});
	};

	// Render immediately if open by default, otherwise render on first open
	if (openByDefault) {
		renderContent();
	} else {
		section.addEventListener('toggle', () => {
			if (section.open) {
				renderContent();
			}
		}, { once: true });
	}
}

/**
 * Render a value alias section (e.g., Event type values, Sex values)
 */
function renderValueSection(
	container: HTMLElement,
	title: string,
	field: ValueAliasField,
	canonicalValues: readonly string[],
	valueLabels: Record<string, string>,
	valueAliasService: ValueAliasService,
	showTab: (tabId: string) => void,
	openByDefault: boolean
): void {
	// Get aliases for this field
	const aliases = valueAliasService.getAliases(field);
	const aliasCount = Object.keys(aliases).length;

	// Create details element for collapsibility
	const section = container.createEl('details', {
		cls: 'cr-property-section'
	});

	if (openByDefault) {
		section.setAttribute('open', '');
	}

	// Create summary (clickable header)
	const summary = section.createEl('summary', {
		cls: 'cr-property-section-summary'
	});

	summary.createSpan({
		text: title,
		cls: 'cr-property-section-title'
	});

	// Alias count badge
	summary.createSpan({
		text: `${aliasCount} 个别名`,
		cls: 'cr-property-section-count'
	});

	// Create content container
	const sectionContent = section.createDiv({
		cls: 'cr-property-section-content'
	});

	// Lazy rendering: only render content when section is opened
	let rendered = false;

	const renderContent = () => {
		if (rendered) return;
		rendered = true;

		// Render each canonical value with its alias field
		canonicalValues.forEach(canonicalValue => {
			// Find if there's an alias for this canonical value
			const userValue = Object.entries(aliases).find(
				([_, canonical]) => canonical === canonicalValue
			)?.[0] || '';

			const valueLabel = valueLabels[canonicalValue] || canonicalValue;

			const setting = new Setting(sectionContent)
				.setName(valueLabel)
				.setDesc(canonicalValue)
				.addText(text => {
					text
						.setPlaceholder('你的值')
						.setValue(userValue);

					// Validate and save only on blur
					text.inputEl.addEventListener('blur', () => {
						void (async () => {
							const value = text.inputEl.value;
							const trimmed = value.trim();

							if (trimmed === '') {
								// Empty = remove alias if it exists
								if (userValue) {
									await valueAliasService.removeAlias(field, userValue);
									showTab('preferences'); // Refresh
								}
								return;
							}

							// Check if aliasing to itself (warning)
							if (trimmed.toLowerCase() === canonicalValue.toLowerCase()) {
								new Notice(`"${trimmed}"已是规范值`);
								text.inputEl.value = userValue; // Restore previous value
								return;
							}

							// Check for duplicate (mapping to different canonical value)
							const existingMapping = aliases[trimmed.toLowerCase()];
							if (existingMapping && existingMapping !== canonicalValue) {
								new Notice(`"${trimmed}"已映射到"${existingMapping}"`);
								text.inputEl.value = userValue; // Restore previous value
								return;
							}

							// Valid - save
							if (trimmed !== userValue) {
								// Remove old alias if it exists
								if (userValue) {
									await valueAliasService.removeAlias(field, userValue);
								}
								await valueAliasService.setAlias(field, trimmed, canonicalValue);
								showTab('preferences'); // Refresh
							}
						})();
					});
				})
				.addExtraButton(button => {
					button
						.setIcon('x')
						.setTooltip('清除别名')
						.onClick(async () => {
							if (userValue) {
								await valueAliasService.removeAlias(field, userValue);
								new Notice(`已清除${valueLabel}的别名`);
								showTab('preferences'); // Refresh
							}
						});

					// Style clear button based on alias state
					button.extraSettingsEl.addClass(userValue ? 'cr-clear-btn--enabled' : 'cr-clear-btn--disabled');
				});

			// Store metadata for potential filtering later
			setting.settingEl.dataset.canonical = canonicalValue;
			setting.settingEl.dataset.label = valueLabel;
		});
	};

	// Render immediately if open by default, otherwise render on first open
	if (openByDefault) {
		renderContent();
	} else {
		section.addEventListener('toggle', () => {
			if (section.open) {
				renderContent();
			}
		}, { once: true });
	}
}

/**
 * Render the unified property and value configuration card
 */
function renderAliasesCard(
	container: HTMLElement,
	plugin: CanvasRootsPlugin,
	propertyAliasService: PropertyAliasService,
	valueAliasService: ValueAliasService,
	createCard: (options: { title: string; icon?: LucideIconName; subtitle?: string }) => HTMLElement,
	showTab: (tabId: string) => void
): void {
	const card = createCard({
		title: '属性与值配置',
		icon: 'hash',
		subtitle: '配置自定义属性名称和值'
	});
	const content = card.querySelector('.crc-card__content') as HTMLElement;

	// Description
	content.createEl('p', {
		cls: 'crc-text-muted',
		text: '使用你自己的属性名称和值——Charted Roots 会识别它们，而不会重写你的文件。'
	});

	// Base files note (prominent position)
	const baseNote = content.createDiv({ cls: 'cr-info-box' });
	const baseNoteIcon = baseNote.createSpan({ cls: 'cr-info-box-icon' });
	setIcon(baseNoteIcon, 'info');
	baseNote.createSpan({
		text: '别名变更时，现有的 Bases 文件不会自动更新。请删除并重新创建 base 文件以应用新别名。'
	});

	// ===== SEARCH BOX =====
	const searchContainer = content.createDiv({ cls: 'cr-property-search' });
	let currentSearchQuery = '';

	new Setting(searchContainer)
		.addSearch(search => {
			search
				.setPlaceholder('搜索属性…')
				.onChange((query) => {
					currentSearchQuery = query;
					filterProperties(query);
				});
		});

	// ===== PROPERTY SECTIONS =====
	const sectionsContainer = content.createDiv({ cls: 'cr-property-sections' });

	// Person properties section
	renderPropertySection(
		sectionsContainer,
		'人物属性',
		PERSON_PROPERTY_METADATA,
		propertyAliasService,
		showTab,
		false // closed by default
	);

	// Event properties section
	renderPropertySection(
		sectionsContainer,
		'事件属性',
		EVENT_PROPERTY_METADATA,
		propertyAliasService,
		showTab,
		false // closed by default
	);

	// Place properties section
	renderPropertySection(
		sectionsContainer,
		'地点属性',
		PLACE_PROPERTY_METADATA,
		propertyAliasService,
		showTab,
		false // closed by default
	);

	// Source properties section
	renderPropertySection(
		sectionsContainer,
		'来源属性',
		SOURCE_PROPERTY_METADATA,
		propertyAliasService,
		showTab,
		false // closed by default
	);

	// Filter function for search
	function filterProperties(query: string): void {
		const sections = sectionsContainer.querySelectorAll('.cr-property-section');
		const normalized = query.toLowerCase().trim();

		if (!normalized) {
			// Show all
			sections.forEach(section => {
				const settingItems = section.querySelectorAll('.setting-item');
				settingItems.forEach(item => {
					(item as HTMLElement).removeClass('crc-hidden');
				});
				updateSectionCount(section as HTMLElement, settingItems.length, settingItems.length);
			});
			return;
		}

		// Filter each section
		sections.forEach(section => {
			const settingItems = section.querySelectorAll('.setting-item');
			let visibleCount = 0;

			settingItems.forEach(item => {
				const settingItem = item as HTMLElement;
				const canonical = settingItem.dataset.canonical || '';
				const label = settingItem.dataset.label || '';
				const description = settingItem.dataset.description || '';

				const matches = canonical.toLowerCase().includes(normalized) ||
					label.toLowerCase().includes(normalized) ||
					description.toLowerCase().includes(normalized);

				settingItem.toggleClass('crc-hidden', !matches);
				if (matches) visibleCount++;
			});

			updateSectionCount(section as HTMLElement, visibleCount, settingItems.length);
		});
	}

	function updateSectionCount(section: HTMLElement, visible: number, total: number): void {
		const countEl = section.querySelector('.cr-property-section-count');
		if (countEl) {
			if (currentSearchQuery && visible < total) {
				countEl.textContent = `（${visible} / ${total}）`;
			} else {
				countEl.textContent = `（${total}）`;
			}
		}
	}

	// ===== DIVIDER =====
	content.createEl('hr', { cls: 'cr-property-divider' });

	// ===== VALUE ALIASES SECTION =====
	content.createEl('h4', {
		text: '值别名',
		cls: 'cr-aliases-section-title'
	});

	content.createEl('p', {
		cls: 'crc-text-muted',
		text: '将你的自定义值映射到 Charted Roots 的规范值。例如，将"nameday"映射到"birth"事件类型。'
	});

	// Value sections container
	const valueSectionsContainer = content.createDiv({ cls: 'cr-property-sections' });

	// Event type values
	renderValueSection(
		valueSectionsContainer,
		'事件类型值',
		'eventType',
		CANONICAL_EVENT_TYPES,
		EVENT_TYPE_LABELS,
		valueAliasService,
		showTab,
		false
	);

	// Sex values
	renderValueSection(
		valueSectionsContainer,
		'性别值',
		'sex',
		CANONICAL_SEX_VALUES,
		SEX_LABELS,
		valueAliasService,
		showTab,
		false
	);

	// Place category values
	renderValueSection(
		valueSectionsContainer,
		'地点分类值',
		'placeCategory',
		CANONICAL_PLACE_CATEGORIES,
		PLACE_CATEGORY_LABELS,
		valueAliasService,
		showTab,
		false
	);

	// Note type values
	renderValueSection(
		valueSectionsContainer,
		'笔记类型值（cr_type）',
		'noteType',
		CANONICAL_NOTE_TYPES,
		NOTE_TYPE_LABELS,
		valueAliasService,
		showTab,
		false
	);

	// ===== INFO BOXES =====
	// Tip about canonical values
	const tipContainer = content.createDiv({ cls: 'cr-info-box' });
	const tipIcon = tipContainer.createSpan({ cls: 'cr-info-box-icon' });
	setIcon(tipIcon, 'info');
	tipContainer.createSpan({
		text: '规范值优先于别名。未知事件类型会被视为"custom"。'
	});

	container.appendChild(card);
}

/**
 * Render the Folder Locations card
 */
function renderFolderLocationsCard(
	container: HTMLElement,
	plugin: CanvasRootsPlugin,
	createCard: (options: { title: string; icon?: LucideIconName; subtitle?: string }) => HTMLElement
): void {
	const card = createCard({
		title: '文件夹位置',
		icon: 'folder',
		subtitle: '配置 Charted Roots 存储和查找笔记的位置'
	});
	card.id = 'cr-folder-locations-card';
	const content = card.querySelector('.crc-card__content') as HTMLElement;

	// Folder explanation
	content.createEl('p', {
		cls: 'crc-text-muted',
		text: '这些文件夹决定导入时以及使用"新建"操作时新笔记的创建位置。Charted Roots 通过属性（cr_type）而非位置来识别笔记——你的笔记可以放在库中的任何位置。'
	});

	// Helper to create folder setting with autocomplete
	const createFolderSetting = (
		name: string,
		desc: string,
		placeholder: string,
		getValue: () => string,
		setValue: (v: string) => void
	) => {
		new Setting(content)
			.setName(name)
			.setDesc(desc)
			.addText(text => {
				text
					.setPlaceholder(placeholder)
					.setValue(getValue())
					.onChange(async (value) => {
						setValue(value);
						await plugin.saveSettings();
					});

				// Attach folder autocomplete
				new FolderSuggest(plugin.app, text, (value) => {
					void (async () => {
						setValue(value);
						await plugin.saveSettings();
					})();
				});
			});
	};

	// People folder
	createFolderSetting(
		'人物文件夹',
		'人物笔记的默认文件夹',
		'Charted Roots/People',
		() => plugin.settings.peopleFolder,
		(v) => { plugin.settings.peopleFolder = v; }
	);

	// Places folder
	createFolderSetting(
		'地点文件夹',
		'地点笔记的默认文件夹',
		'Charted Roots/Places',
		() => plugin.settings.placesFolder,
		(v) => { plugin.settings.placesFolder = v; }
	);

	// Map notes folder
	createFolderSetting(
		'地图笔记文件夹',
		'地图笔记的默认文件夹',
		'Charted Roots/Places/Maps',
		() => plugin.settings.mapsFolder,
		(v) => { plugin.settings.mapsFolder = v; }
	);

	// Organizations folder
	createFolderSetting(
		'组织文件夹',
		'组织笔记的默认文件夹',
		'Charted Roots/Organizations',
		() => plugin.settings.organizationsFolder,
		(v) => { plugin.settings.organizationsFolder = v; }
	);

	// Sources folder
	createFolderSetting(
		'来源文件夹',
		'来源笔记的默认文件夹',
		'Charted Roots/Sources',
		() => plugin.settings.sourcesFolder,
		(v) => { plugin.settings.sourcesFolder = v; }
	);

	// Events folder
	createFolderSetting(
		'事件文件夹',
		'事件笔记的默认文件夹',
		'Charted Roots/Events',
		() => plugin.settings.eventsFolder,
		(v) => { plugin.settings.eventsFolder = v; }
	);

	// Timelines folder
	createFolderSetting(
		'时间轴文件夹',
		'时间轴笔记的默认文件夹（用于分组事件）',
		'Charted Roots/Timelines',
		() => plugin.settings.timelinesFolder,
		(v) => { plugin.settings.timelinesFolder = v; }
	);

	// Bases folder
	createFolderSetting(
		'Bases 文件夹',
		'Obsidian Bases 文件的默认文件夹',
		'Charted Roots/Bases',
		() => plugin.settings.basesFolder,
		(v) => { plugin.settings.basesFolder = v; }
	);

	// Schemas folder
	createFolderSetting(
		'架构文件夹',
		'验证架构的默认文件夹',
		'Charted Roots/Schemas',
		() => plugin.settings.schemasFolder,
		(v) => { plugin.settings.schemasFolder = v; }
	);

	// Universes folder
	createFolderSetting(
		'宇宙文件夹',
		'宇宙笔记（虚构世界）的默认文件夹',
		'Charted Roots/Universes',
		() => plugin.settings.universesFolder,
		(v) => { plugin.settings.universesFolder = v; }
	);

	// Canvases folder
	createFolderSetting(
		'画布文件夹',
		'生成的画布文件的默认文件夹',
		'Charted Roots/Canvases',
		() => plugin.settings.canvasesFolder,
		(v) => { plugin.settings.canvasesFolder = v; }
	);

	// Reports folder
	createFolderSetting(
		'报告文件夹',
		'生成的报告（个人摘要、家族群组表等）的默认文件夹',
		'Charted Roots/Reports',
		() => plugin.settings.reportsFolder,
		(v) => { plugin.settings.reportsFolder = v; }
	);

	// Staging folder
	createFolderSetting(
		'导入暂存文件夹',
		'导入暂存用的文件夹（处理期间与主库隔离）',
		'Charted Roots/Staging',
		() => plugin.settings.stagingFolder,
		(v) => { plugin.settings.stagingFolder = v; }
	);

	// Staging isolation toggle (only show if staging folder is configured)
	if (plugin.settings.stagingFolder) {
		new Setting(content)
			.setName('启用暂存隔离')
			.setDesc('在常规操作（统计、家族图表等）中排除暂存文件夹')
			.addToggle(toggle => toggle
				.setValue(plugin.settings.enableStagingIsolation)
				.onChange(async (value) => {
					plugin.settings.enableStagingIsolation = value;
					await plugin.saveSettings();
				}));
	}

	// Section: Media Folders
	content.createEl('h4', {
		text: '媒体文件夹筛选',
		cls: 'cr-aliases-section-title'
	});

	content.createEl('p', {
		cls: 'crc-text-muted',
		text: '将媒体发现范围限定在特定文件夹。这会影响查找未关联项、媒体管理器统计和媒体选择器——但不影响已关联的媒体或浏览图库。'
	});

	// Enable media folder filter toggle
	new Setting(content)
		.setName('将媒体扫描限定在指定文件夹')
		.setDesc('启用后，仅在下列文件夹中扫描媒体文件')
		.addToggle(toggle => toggle
			.setValue(plugin.settings.enableMediaFolderFilter)
			.onChange(async (value) => {
				plugin.settings.enableMediaFolderFilter = value;
				await plugin.saveSettings();
			}));

	// Media folders list
	const mediaFoldersContainer = content.createDiv({ cls: 'cr-media-folders-list' });
	renderMediaFoldersList(mediaFoldersContainer, plugin);

	// Note about advanced settings
	const advancedNote = content.createDiv({ cls: 'cr-info-box cr-info-box--muted' });
	const advancedIcon = advancedNote.createSpan({ cls: 'cr-info-box-icon' });
	setIcon(advancedIcon, 'settings');
	advancedNote.createSpan({
		text: '有关文件夹筛选选项（从发现中纳入/排除文件夹），请参阅设置 → Charted Roots → 高级。'
	});

	container.appendChild(card);
}

/**
 * Place category options for dropdown
 */
const PLACE_CATEGORIES: { value: PlaceCategory; label: string }[] = [
	{ value: 'real', label: '真实' },
	{ value: 'historical', label: '历史' },
	{ value: 'disputed', label: '有争议' },
	{ value: 'legendary', label: '传说' },
	{ value: 'mythological', label: '神话' },
	{ value: 'fictional', label: '虚构' }
];

/**
 * Render the Place Organization card (#163)
 * Configures category-based subfolder organization for places
 */
function renderPlaceOrganizationCard(
	container: HTMLElement,
	plugin: CanvasRootsPlugin,
	createCard: (options: { title: string; icon?: LucideIconName; subtitle?: string }) => HTMLElement
): void {
	const card = createCard({
		title: '地点组织',
		icon: 'map-pin',
		subtitle: '按分类将地点归入子文件夹'
	});
	const content = card.querySelector('.crc-card__content') as HTMLElement;

	// Explanation
	content.createEl('p', {
		cls: 'crc-text-muted',
		text: '启用后，新地点会自动存入基于分类的子文件夹（例如历史地点会存入 Places/Historical/）。你也可以为特定分类定义自定义文件夹映射。'
	});

	// Main toggle for category subfolders
	new Setting(content)
		.setName('使用基于分类的子文件夹')
		.setDesc('根据分类自动将新地点归入子文件夹')
		.addToggle(toggle => toggle
			.setValue(plugin.settings.useCategorySubfolders)
			.onChange(async (value) => {
				plugin.settings.useCategorySubfolders = value;
				await plugin.saveSettings();
				// Refresh the card to show/hide the rules section
				renderPlaceOrganizationCard(container, plugin, createCard);
			}));

	// Show category folder rules section if enabled
	if (plugin.settings.useCategorySubfolders) {
		content.createEl('h4', {
			text: '分类文件夹覆盖',
			cls: 'cr-aliases-section-title'
		});

		content.createEl('p', {
			cls: 'crc-text-muted',
			text: '覆盖特定分类的默认子文件夹名称。留空则使用首字母大写的分类名（例如"Historical"）。'
		});

		// Container for existing rules
		const rulesContainer = content.createDiv({ cls: 'cr-category-folder-rules' });
		renderCategoryFolderRules(rulesContainer, plugin, content);
	}

	// Info note about imports
	const importNote = content.createDiv({ cls: 'cr-info-box cr-info-box--muted' });
	const importIcon = importNote.createSpan({ cls: 'cr-info-box-icon' });
	setIcon(importIcon, 'info');
	importNote.createSpan({
		text: '导入（GEDCOM、Gramps）始终在基础文件夹中创建地点。之后可使用数据质量 → "不在分类文件夹中的地点"来整理它们。'
	});

	// Replace any existing card with the same title
	const existingCard = container.querySelector('.crc-card__title')?.parentElement?.parentElement;
	if (existingCard && existingCard.querySelector('.crc-card__title')?.textContent?.includes('Place organization')) {
		existingCard.remove();
	}

	container.appendChild(card);
}

/**
 * Render the category folder rules list with add/remove functionality
 */
function renderCategoryFolderRules(
	container: HTMLElement,
	plugin: CanvasRootsPlugin,
	cardContent: HTMLElement
): void {
	container.empty();

	const rules = plugin.settings.placeCategoryFolderRules || [];

	// Get categories that already have rules
	const usedCategories = new Set(rules.map(r => r.category));

	// Render existing rules
	for (let i = 0; i < rules.length; i++) {
		const rule = rules[i];
		const ruleRow = container.createDiv({ cls: 'cr-category-folder-rule' });

		// Category label
		const categoryLabel = PLACE_CATEGORIES.find(c => c.value === rule.category)?.label || rule.category;
		ruleRow.createSpan({ cls: 'cr-category-folder-rule-category', text: categoryLabel });

		// Arrow
		ruleRow.createSpan({ cls: 'cr-category-folder-rule-arrow', text: '→' });

		// Folder path (editable)
		const folderInput = ruleRow.createEl('input', {
			cls: 'cr-category-folder-rule-folder',
			attr: {
				type: 'text',
				value: rule.folder,
				placeholder: categoryLabel
			}
		});

		folderInput.addEventListener('change', () => {
			void (async () => {
				const newFolder = folderInput.value.trim();
				if (newFolder) {
					plugin.settings.placeCategoryFolderRules[i].folder = newFolder;
				} else {
					// Remove rule if folder is cleared
					plugin.settings.placeCategoryFolderRules.splice(i, 1);
				}
				await plugin.saveSettings();
				renderCategoryFolderRules(container, plugin, cardContent);
			})();
		});

		// Remove button
		const removeBtn = ruleRow.createSpan({ cls: 'cr-category-folder-rule-remove' });
		setIcon(removeBtn, 'x');
		removeBtn.setAttribute('aria-label', '移除覆盖');

		removeBtn.addEventListener('click', () => {
			void (async () => {
				plugin.settings.placeCategoryFolderRules.splice(i, 1);
				await plugin.saveSettings();
				renderCategoryFolderRules(container, plugin, cardContent);
			})();
		});
	}

	// Add new rule row (only show if there are unused categories)
	const availableCategories = PLACE_CATEGORIES.filter(c => !usedCategories.has(c.value));

	if (availableCategories.length > 0) {
		const addRow = container.createDiv({ cls: 'cr-category-folder-rule cr-category-folder-rule--add' });

		// Category dropdown
		const categorySelect = addRow.createEl('select', { cls: 'cr-category-folder-rule-select' });
		categorySelect.createEl('option', { value: '', text: '添加覆盖…' });
		for (const cat of availableCategories) {
			categorySelect.createEl('option', { value: cat.value, text: cat.label });
		}

		// Arrow (hidden initially)
		const arrow = addRow.createSpan({ cls: 'cr-category-folder-rule-arrow crc-hidden', text: '→' });

		// Folder input (hidden initially)
		const folderInput = addRow.createEl('input', {
			cls: 'cr-category-folder-rule-folder crc-hidden',
			attr: {
				type: 'text',
				placeholder: '子文件夹路径'
			}
		});

		// Show folder input when category is selected
		categorySelect.addEventListener('change', () => {
			const selectedCategory = categorySelect.value as PlaceCategory;
			if (selectedCategory) {
				arrow.removeClass('crc-hidden');
				folderInput.removeClass('crc-hidden');
				// Set placeholder to default folder name
				const categoryLabel = PLACE_CATEGORIES.find(c => c.value === selectedCategory)?.label || selectedCategory;
				folderInput.placeholder = categoryLabel;
				folderInput.focus();
			} else {
				arrow.addClass('crc-hidden');
				folderInput.addClass('crc-hidden');
			}
		});

		// Add rule when folder is entered
		folderInput.addEventListener('keydown', (e) => {
			if (e.key === 'Enter') {
				const selectedCategory = categorySelect.value as PlaceCategory;
				const folder = folderInput.value.trim();
				if (selectedCategory && folder) {
					void (async () => {
						const newRule: PlaceCategoryFolderRule = {
							category: selectedCategory,
							folder: folder
						};
						plugin.settings.placeCategoryFolderRules.push(newRule);
						await plugin.saveSettings();
						renderCategoryFolderRules(container, plugin, cardContent);
					})();
				}
			}
		});

		// Also add on blur if there's a value
		folderInput.addEventListener('blur', () => {
			const selectedCategory = categorySelect.value as PlaceCategory;
			const folder = folderInput.value.trim();
			if (selectedCategory && folder) {
				void (async () => {
					const newRule: PlaceCategoryFolderRule = {
						category: selectedCategory,
						folder: folder
					};
					plugin.settings.placeCategoryFolderRules.push(newRule);
					await plugin.saveSettings();
					renderCategoryFolderRules(container, plugin, cardContent);
				})();
			}
		});
	}
}

/**
 * Render the media folders list with add/remove functionality
 */
function renderMediaFoldersList(
	container: HTMLElement,
	plugin: CanvasRootsPlugin
): void {
	container.empty();

	const folders = plugin.settings.mediaFolders;

	// State for drag and drop
	let draggedIndex = -1;

	// Render existing folders
	for (let i = 0; i < folders.length; i++) {
		const folder = folders[i];
		const row = container.createDiv({ cls: 'cr-media-folder-row' });

		// Make row draggable
		row.setAttribute('draggable', 'true');

		// Drag handle
		const dragHandle = row.createSpan({ cls: 'cr-media-folder-handle' });
		setIcon(dragHandle, 'grip-vertical');

		// Folder icon
		const iconEl = row.createSpan({ cls: 'cr-media-folder-icon' });
		setIcon(iconEl, 'folder');

		// Folder path text
		row.createSpan({ cls: 'cr-media-folder-path', text: folder });

		// Remove button
		const removeBtn = row.createSpan({ cls: 'cr-media-folder-remove' });
		setIcon(removeBtn, 'x');
		removeBtn.setAttribute('aria-label', '移除文件夹');

		removeBtn.addEventListener('click', () => {
			plugin.settings.mediaFolders = folders.filter((_, idx) => idx !== i);
			void plugin.saveSettings().then(() => {
				renderMediaFoldersList(container, plugin);
			});
		});

		// Drag and drop event handlers
		row.addEventListener('dragstart', (e: DragEvent) => {
			draggedIndex = i;
			row.addClass('cr-media-folder-row--dragging');
			if (e.dataTransfer) {
				e.dataTransfer.effectAllowed = 'move';
				e.dataTransfer.setData('text/plain', i.toString());
			}
		});

		row.addEventListener('dragend', () => {
			row.removeClass('cr-media-folder-row--dragging');
			// Remove drag-over indicators from all rows
			container.querySelectorAll('.cr-media-folder-row').forEach(r => {
				r.removeClass('cr-media-folder-row--drag-over');
			});
		});

		row.addEventListener('dragover', (e: DragEvent) => {
			e.preventDefault();
			if (e.dataTransfer) {
				e.dataTransfer.dropEffect = 'move';
			}
		});

		row.addEventListener('dragenter', (e: DragEvent) => {
			e.preventDefault();
			if (i !== draggedIndex) {
				row.addClass('cr-media-folder-row--drag-over');
			}
		});

		row.addEventListener('dragleave', (e: DragEvent) => {
			// Only remove class if we're actually leaving the row
			const relatedTarget = e.relatedTarget as HTMLElement;
			if (!row.contains(relatedTarget)) {
				row.removeClass('cr-media-folder-row--drag-over');
			}
		});

		row.addEventListener('drop', (e: DragEvent) => {
			e.preventDefault();

			if (draggedIndex === -1 || draggedIndex === i) {
				return;
			}

			// Reorder the folders array
			const newFolders = [...folders];
			const [movedFolder] = newFolders.splice(draggedIndex, 1);
			newFolders.splice(i, 0, movedFolder);

			plugin.settings.mediaFolders = newFolders;
			void plugin.saveSettings().then(() => {
				renderMediaFoldersList(container, plugin);
			});
		});
	}

	// Add folder row
	const addRow = container.createDiv({ cls: 'cr-media-folder-add-row' });

	// Create a wrapper for the text input with folder suggest
	const inputWrapper = addRow.createDiv({ cls: 'cr-media-folder-input-wrapper' });

	const addSetting = new Setting(inputWrapper)
		.addText(text => {
			text.setPlaceholder('添加媒体文件夹…');

			// Attach folder autocomplete
			new FolderSuggest(plugin.app, text, (value) => {
				if (value.trim() && !folders.includes(value.trim())) {
					plugin.settings.mediaFolders = [...folders, value.trim()];
					void plugin.saveSettings().then(() => {
						renderMediaFoldersList(container, plugin);
					});
				}
			});

			// Also handle Enter key
			text.inputEl.addEventListener('keydown', (e) => {
				if (e.key === 'Enter') {
					const value = text.inputEl.value.trim();
					if (value && !folders.includes(value)) {
						plugin.settings.mediaFolders = [...folders, value];
						void plugin.saveSettings().then(() => {
							renderMediaFoldersList(container, plugin);
						});
					}
				}
			});
		});

	// Remove the default styling from the Setting
	addSetting.settingEl.addClass('cr-media-folder-add-setting');
}

/**
 * Render the Canvas Layout card
 */
export function renderCanvasLayoutCard(
	container: HTMLElement,
	plugin: CanvasRootsPlugin,
	createCard: (options: { title: string; icon?: LucideIconName; subtitle?: string }) => HTMLElement
): void {
	const card = createCard({
		title: '画布布局',
		icon: 'layout',
		subtitle: '树生成时的节点尺寸与间距'
	});
	const content = card.querySelector('.crc-card__content') as HTMLElement;

	// Info text
	content.createEl('p', {
		cls: 'crc-text-muted crc-mb-2',
		text: '更改会作用于新生成的树。要更新现有画布，请右键单击画布文件并选择"重新布局家族树"。'
	});

	// Helper to create a slider setting with reset button
	const createSliderSetting = (
		name: string,
		desc: string,
		min: number,
		max: number,
		step: number,
		defaultValue: number,
		getValue: () => number,
		setValue: (v: number) => void
	) => {
		let sliderComponent: SliderComponent;

		new Setting(content)
			.setName(name)
			.setDesc(desc)
			.addSlider(slider => {
				sliderComponent = slider;
				slider
					.setLimits(min, max, step)
					.setValue(getValue())
					.onChange(async (value) => {
						setValue(value);
						await plugin.saveSettings();
					});
			})
			.addExtraButton(button => button
				.setIcon('rotate-ccw')
				.setTooltip(`重置为默认值（${defaultValue}）`)
				.onClick(async () => {
					setValue(defaultValue);
					await plugin.saveSettings();
					sliderComponent.setValue(defaultValue);
				}));
	};

	// Horizontal Spacing
	createSliderSetting(
		'水平间距',
		'节点之间的水平间距',
		100, 1000, 50, 400,
		() => plugin.settings.horizontalSpacing,
		(v) => { plugin.settings.horizontalSpacing = v; }
	);

	// Vertical Spacing
	createSliderSetting(
		'垂直间距',
		'世代之间的垂直间距',
		100, 1000, 50, 250,
		() => plugin.settings.verticalSpacing,
		(v) => { plugin.settings.verticalSpacing = v; }
	);

	// Node Width
	createSliderSetting(
		'节点宽度',
		'人物节点的宽度',
		100, 500, 25, 200,
		() => plugin.settings.defaultNodeWidth,
		(v) => { plugin.settings.defaultNodeWidth = v; }
	);

	// Node Height
	createSliderSetting(
		'节点高度',
		'人物节点的高度',
		50, 300, 25, 100,
		() => plugin.settings.defaultNodeHeight,
		(v) => { plugin.settings.defaultNodeHeight = v; }
	);

	container.appendChild(card);
}

/**
 * Render the Canvas Styling card
 */
export function renderCanvasStylingCard(
	container: HTMLElement,
	plugin: CanvasRootsPlugin,
	createCard: (options: { title: string; icon?: LucideIconName; subtitle?: string }) => HTMLElement
): void {
	const card = createCard({
		title: '画布样式',
		icon: 'settings',
		subtitle: '箭头样式与节点着色选项'
	});
	const content = card.querySelector('.crc-card__content') as HTMLElement;

	// Node Color Scheme
	new Setting(content)
		.setName('配色方案')
		.setDesc('如何为家族树中的人物节点着色')
		.addDropdown(dropdown => dropdown
			.addOption('sex', '性别——男性绿色，女性紫色')
			.addOption('generation', '世代——按世代层级着色')
			.addOption('collection', '合集——每个合集使用不同颜色')
			.addOption('monochrome', '单色——不着色')
			.setValue(plugin.settings.nodeColorScheme)
			.onChange(async (value) => {
				plugin.settings.nodeColorScheme = value as ColorScheme;
				await plugin.saveSettings();
				new Notice('节点配色方案已更新');
			}));

	// Canvas Grouping Strategy
	new Setting(content)
		.setName('画布分组')
		.setDesc('用可视分组在画布上组织相关节点')
		.addDropdown(dropdown => dropdown
			.addOption('none', '无——不分组（默认）')
			.addOption('generation', '按世代——按世代层级对节点分组')
			.addOption('nuclear-family', '按伴侣——对共同育有子女的父母配对分组')
			.addOption('collection', '按合集——按家族合集分组')
			.setValue(plugin.settings.canvasGroupingStrategy)
			.onChange(async (value) => {
				plugin.settings.canvasGroupingStrategy = value as CanvasGroupingStrategy;
				await plugin.saveSettings();
				new Notice('画布分组策略已更新');
			}));

	// Section: Arrow Styling
	content.createEl('h4', {
		text: '箭头样式',
		cls: 'cr-aliases-section-title'
	});

	// Parent-Child Arrow Style
	new Setting(content)
		.setName('父母 → 子女箭头')
		.setDesc('父母子女关系的箭头样式')
		.addDropdown(dropdown => dropdown
			.addOption('directed', '有向（→）——指向子女的单箭头')
			.addOption('bidirectional', '双向（↔）——两端都有箭头')
			.addOption('undirected', '无向（—）——无箭头')
			.setValue(plugin.settings.parentChildArrowStyle)
			.onChange(async (value) => {
				plugin.settings.parentChildArrowStyle = value as ArrowStyle;
				await plugin.saveSettings();
				new Notice('父母子女箭头样式已更新');
			}));

	// Spouse Arrow Style
	new Setting(content)
		.setName(getSpouseCompoundLabel(plugin.settings, 'arrows'))
		.setDesc('配偶/伴侣关系的箭头样式')
		.addDropdown(dropdown => dropdown
			.addOption('directed', '有向（→）——单箭头')
			.addOption('bidirectional', '双向（↔）——两端都有箭头')
			.addOption('undirected', '无向（—）——无箭头')
			.setValue(plugin.settings.spouseArrowStyle)
			.onChange(async (value) => {
				plugin.settings.spouseArrowStyle = value as ArrowStyle;
				await plugin.saveSettings();
				new Notice(`${getSpouseCompoundLabel(plugin.settings, 'arrow style')}已更新`);
			}));

	// Section: Spouse Edges
	content.createEl('h4', {
		text: getSpouseCompoundLabel(plugin.settings, 'edge display'),
		cls: 'cr-aliases-section-title'
	});

	// Show Spouse Edges Toggle
	new Setting(content)
		.setName(`显示${getSpouseCompoundLabel(plugin.settings, 'edges')}`)
		.setDesc('显示配偶/伴侣之间带有婚姻元数据的连线。禁用时（默认），配偶仅通过位置进行可视分组。')
		.addToggle(toggle => toggle
			.setValue(plugin.settings.showSpouseEdges)
			.onChange(async (value) => {
				plugin.settings.showSpouseEdges = value;
				await plugin.saveSettings();
				new Notice(`${getSpouseCompoundLabel(plugin.settings, 'edge display')}已更新`);
			}));

	// Spouse Edge Label Format
	new Setting(content)
		.setName(getSpouseCompoundLabel(plugin.settings, 'edge label format'))
		.setDesc(`如何在${getSpouseCompoundLabel(plugin.settings, 'edges')}上显示婚姻信息（仅在启用连线时适用）`)
		.addDropdown(dropdown => dropdown
			.addOption('none', '无——不显示标签')
			.addOption('date-only', '仅日期——例："m. 1985"')
			.addOption('date-location', '日期和地点——例："m. 1985 | Boston, MA"')
			.addOption('full', '完整详情——例："m. 1985 | Boston, MA | div. 1992"')
			.setValue(plugin.settings.spouseEdgeLabelFormat)
			.onChange(async (value) => {
				plugin.settings.spouseEdgeLabelFormat = value as SpouseEdgeLabelFormat;
				await plugin.saveSettings();
				new Notice(`${getSpouseCompoundLabel(plugin.settings, 'edge label format')}已更新`);
			}));

	container.appendChild(card);
}

/**
 * Render the Date Validation card
 */
function renderDateValidationCard(
	container: HTMLElement,
	plugin: CanvasRootsPlugin,
	createCard: (options: { title: string; icon?: LucideIconName; subtitle?: string }) => HTMLElement,
	showTab: (tabId: string) => void
): void {
	const card = createCard({
		title: '日期验证',
		icon: 'calendar',
		subtitle: '配置批量验证的日期格式标准'
	});
	const content = card.querySelector('.crc-card__content') as HTMLElement;

	// Info text with link to Events tab
	const infoText = content.createEl('p', {
		cls: 'crc-text-muted'
	});
	infoText.appendText('这些设置控制"验证日期格式"批量操作中如何验证日期。虚构日期（带有 fc-calendar 属性）会自动跳过。 ');

	const link = infoText.createEl('a', {
		text: '虚构日期系统在"事件"标签页中定义',
		href: '#',
		cls: 'crc-text-link'
	});
	link.addEventListener('click', (e) => {
		e.preventDefault();
		showTab('events');
	});
	infoText.appendText('。');

	// Date Format Standard
	new Setting(content)
		.setName('日期格式标准')
		.setDesc('验证时首选的日期格式标准')
		.addDropdown(dropdown => dropdown
			.addOption('iso8601', 'ISO 8601——严格的 YYYY-MM-DD 格式')
			.addOption('GEDCOM', 'GEDCOM——DD MMM YYYY（例：15 JAN 1920）')
			.addOption('flexible', '灵活——允许多种格式')
			.setValue(plugin.settings.dateFormatStandard)
			.onChange(async (value) => {
				plugin.settings.dateFormatStandard = value as 'iso8601' | 'gedcom' | 'flexible';
				await plugin.saveSettings();
			}));

	// Allow Partial Dates
	new Setting(content)
		.setName('允许部分日期')
		.setDesc('接受缺少日或月的日期（例："1920-05"或"1920"）')
		.addToggle(toggle => toggle
			.setValue(plugin.settings.allowPartialDates)
			.onChange(async (value) => {
				plugin.settings.allowPartialDates = value;
				await plugin.saveSettings();
			}));

	// Allow Circa Dates
	new Setting(content)
		.setName('允许约略日期')
		.setDesc('接受带"c."、"ca."、"circa"或"~"前缀的近似日期（例："c. 1850"）')
		.addToggle(toggle => toggle
			.setValue(plugin.settings.allowCircaDates)
			.onChange(async (value) => {
				plugin.settings.allowCircaDates = value;
				await plugin.saveSettings();
			}));

	// Allow Date Ranges
	new Setting(content)
		.setName('允许日期范围')
		.setDesc('接受用连字符或"to"表示的日期范围（例："1850-1920"或"1850 to 1920"）')
		.addToggle(toggle => toggle
			.setValue(plugin.settings.allowDateRanges)
			.onChange(async (value) => {
				plugin.settings.allowDateRanges = value;
				await plugin.saveSettings();
			}));

	// Require Leading Zeros
	new Setting(content)
		.setName('要求前导零')
		.setDesc('要求月和日用零补齐（例："1920-05-01"而非"1920-5-1"）')
		.addToggle(toggle => toggle
			.setValue(plugin.settings.requireLeadingZeros)
			.onChange(async (value) => {
				plugin.settings.requireLeadingZeros = value;
				await plugin.saveSettings();
			}));

	container.appendChild(card);
}

/**
 * Render the sex value normalization card
 */
function renderSexNormalizationCard(
	container: HTMLElement,
	plugin: CanvasRootsPlugin,
	createCard: (options: { title: string; icon?: LucideIconName; subtitle?: string }) => HTMLElement
): void {
	const card = createCard({
		title: '性别值规范化',
		icon: 'sliders',
		subtitle: '配置性别值的批量规范化行为'
	});
	const content = card.querySelector('.crc-card__content') as HTMLElement;

	// Info text
	content.createEl('p', {
		cls: 'crc-text-muted',
		text: '控制数据质量中"规范化性别值"批量操作的行为。标准模式将所有值规范化为 GEDCOM 的 M/F，而架构感知模式会遵循定义了自定义性别值的架构。'
	});

	// Normalization Mode dropdown
	new Setting(content)
		.setName('规范化模式')
		.setDesc('批量操作中如何规范化性别值')
		.addDropdown(dropdown => dropdown
			.addOption('standard', '标准——规范化为 GEDCOM M/F')
			.addOption('schema-aware', '架构感知——跳过使用自定义架构的笔记')
			.addOption('disabled', '禁用——从不规范化性别值')
			.setValue(plugin.settings.sexNormalizationMode)
			.onChange(async (value) => {
				plugin.settings.sexNormalizationMode = value as SexNormalizationMode;
				await plugin.saveSettings();
			}));

	container.appendChild(card);
}

/**
 * Render the inclusive parent relationships card
 */
function renderInclusiveParentsCard(
	container: HTMLElement,
	plugin: CanvasRootsPlugin,
	createCard: (options: { title: string; icon?: LucideIconName; subtitle?: string }) => HTMLElement
): void {
	const card = createCard({
		title: '包容性父母关系',
		icon: 'users',
		subtitle: '可选启用性别中立的父母称谓'
	});
	const content = card.querySelector('.crc-card__content') as HTMLElement;

	// Info text
	content.createEl('p', {
		cls: 'crc-text-muted',
		text: '为有非二元父母或偏好包容性称谓的用户，在创建/编辑人物模态框中添加性别中立的"父母"属性。此设置为可选，并与现有父母属性并存。'
	});

	// Parent field label container (conditionally shown)
	const labelContainer = content.createDiv();

	// Function to render label setting
	const renderLabelSetting = (show: boolean) => {
		labelContainer.empty();
		if (show) {
			new Setting(labelContainer)
				.setName('父母属性标签')
				.setDesc('自定义性别中立父母属性的界面标签')
				.addText(text => text
					.setPlaceholder('父母')
					.setValue(plugin.settings.parentFieldLabel)
					.onChange(async (value) => {
						plugin.settings.parentFieldLabel = value || '父母';
						await plugin.saveSettings();
					}));

			// Examples
			const examplesDiv = labelContainer.createDiv({ cls: 'cr-info-box' });
			const examplesIcon = examplesDiv.createSpan({ cls: 'cr-info-box-icon' });
			setIcon(examplesIcon, 'lightbulb');
			examplesDiv.createEl('strong', { text: '标签示例：' });
			examplesDiv.appendText(' 父母（默认）、监护人、生育者，或任何自定义术语');
		}
	};

	// Enable toggle
	new Setting(content)
		.setName('启用性别中立父母属性')
		.setDesc('在人物模态框中显示"父母"属性（使用 parents/parents_id 属性）')
		.addToggle(toggle => toggle
			.setValue(plugin.settings.enableInclusiveParents)
			.onChange(async (value) => {
				plugin.settings.enableInclusiveParents = value;
				await plugin.saveSettings();
				// Show/hide the label setting
				renderLabelSetting(value);
			}));

	// Initial render of label setting
	renderLabelSetting(plugin.settings.enableInclusiveParents);

	container.appendChild(card);
}

/**
 * Render the display preferences card
 */
function renderDisplayPreferencesCard(
	container: HTMLElement,
	plugin: CanvasRootsPlugin,
	createCard: (options: { title: string; icon?: LucideIconName; subtitle?: string }) => HTMLElement
): void {
	const card = createCard({
		title: '显示偏好',
		icon: 'eye',
		subtitle: '配置人物信息的显示方式'
	});
	const content = card.querySelector('.crc-card__content') as HTMLElement;

	// Info text
	content.createEl('p', {
		cls: 'crc-text-muted',
		text: '控制人物选择器及插件各处显示中展示哪些信息。'
	});

	// Show pronouns toggle
	new Setting(content)
		.setName('显示代词')
		.setDesc('在人物选择器和卡片中显示代词（来自"pronouns"属性）')
		.addToggle(toggle => toggle
			.setValue(plugin.settings.showPronouns)
			.onChange(async (value) => {
				plugin.settings.showPronouns = value;
				await plugin.saveSettings();
			}));

	container.appendChild(card);
}