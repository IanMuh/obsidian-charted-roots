/**
 * Date Systems Card Component
 *
 * UI component for managing fictional date systems in Control Center.
 * Displays list of configured systems, add/edit/delete functionality,
 * and a test parsing input for validation.
 */

import { Modal, Setting, Notice, App } from 'obsidian';
import type CanvasRootsPlugin from '../../../main';
import type { FictionalDateSystem, FictionalEra } from '../types/date-types';
import { FictionalDateParser } from '../parser/fictional-date-parser';
import { DEFAULT_DATE_SYSTEMS } from '../constants/default-date-systems';
import { setIcon } from 'obsidian';
import type { LucideIconName } from '../../ui/lucide-icons';
import { getCalendariumBridge } from '../../integrations/calendarium-bridge';

/**
 * Create the date systems card for Control Center
 */
export function createDateSystemsCard(
	container: HTMLElement,
	plugin: CanvasRootsPlugin,
	createCard: (options: { title: string; icon?: LucideIconName }) => HTMLElement
): HTMLElement {
	const card = createCard({
		title: '虚构日期系统',
		icon: 'calendar'
	});

	const content = card.querySelector('.crc-card__content') as HTMLElement;

	// Container for conditional content (everything after the enable toggle)
	const conditionalContainer = content.createDiv({ cls: 'cr-date-systems-conditional' });

	// Helper to render/refresh conditional content
	const refreshConditionalContent = () => {
		conditionalContainer.empty();

		if (!plugin.settings.enableFictionalDates) {
			return; // Don't show anything when disabled
		}

		// Show built-in systems toggle
		new Setting(conditionalContainer)
			.setName('显示内置系统')
			.setDesc('包含预设历法（中土、维斯特洛、星球大战）')
			.addToggle(toggle => toggle
				.setValue(plugin.settings.showBuiltInDateSystems)
				.onChange(async (value) => {
					plugin.settings.showBuiltInDateSystems = value;
					await plugin.saveSettings();
					void renderDateSystemsList(listContainer, plugin, createCard);
				}));

		// Date systems list container
		const listContainer = conditionalContainer.createDiv({ cls: 'cr-date-systems-list' });
		void renderDateSystemsList(listContainer, plugin, createCard);

		// Add button
		new Setting(conditionalContainer)
			.setName('添加日期系统')
			.setDesc('创建新的虚构历法系统')
			.addButton(button => button
				.setButtonText('添加')
				.setCta()
				.onClick(() => {
					new DateSystemModal(plugin.app, plugin, null, async (system) => {
						plugin.settings.fictionalDateSystems.push(system);
						await plugin.saveSettings();
						void renderDateSystemsList(listContainer, plugin, createCard);
						new Notice(`已添加日期系统：${system.name}`);
					}).open();
				}));

		// Test parsing section
		conditionalContainer.createEl('h4', { text: '测试日期解析', cls: 'cr-subsection-heading' });

		const testContainer = conditionalContainer.createDiv({ cls: 'cr-date-test-container' });
		const testInput = testContainer.createEl('input', {
			cls: 'cr-date-test-input',
			attr: { type: 'text', placeholder: '输入日期（例如 "TA 2941"）' }
		});
		const testResult = testContainer.createDiv({ cls: 'cr-date-test-result' });

		testInput.addEventListener('input', () => {
			const value = testInput.value.trim();
			if (!value) {
				testResult.empty();
				testResult.setText('输入日期以测试');
				testResult.removeClass('cr-date-test-result--success', 'cr-date-test-result--error');
				return;
			}

			// Get all active systems
			const activeSystems = getActiveDateSystems(plugin);
			const parser = new FictionalDateParser(activeSystems);
			const result = parser.parse(value);

			if (result.success) {
				testResult.empty();
				testResult.addClass('cr-date-test-result--success');
				testResult.removeClass('cr-date-test-result--error');
				testResult.createEl('div', { text: `${result.date.era.name}，${result.date.year}年` });
				testResult.createEl('div', {
					text: `系统：${result.date.system.name}`,
					cls: 'cr-date-test-result-detail'
				});
				testResult.createEl('div', {
					text: `标准年份：${result.date.canonicalYear}`,
					cls: 'cr-date-test-result-detail'
				});
			} else {
				testResult.empty();
				testResult.addClass('cr-date-test-result--error');
				testResult.removeClass('cr-date-test-result--success');
				testResult.setText(result.error);
			}
		});
	};

	// Enable/disable toggle (always visible)
	new Setting(content)
		.setName('启用虚构日期')
		.setDesc('解析并显示虚构历法日期（例如 "TA 2941"）')
		.addToggle(toggle => toggle
			.setValue(plugin.settings.enableFictionalDates)
			.onChange(async (value) => {
				plugin.settings.enableFictionalDates = value;
				await plugin.saveSettings();
				// Refresh only the conditional content
				refreshConditionalContent();
			}));

	// Initial render of conditional content
	refreshConditionalContent();

	return card;
}

/**
 * Render fictional date systems management into a settings container (#358)
 * Used by Settings > Dates & validation section.
 */
export function renderDateSystemsSettings(
	container: HTMLElement,
	plugin: CanvasRootsPlugin
): void {
	// Enable/disable toggle
	new Setting(container)
		.setName('启用虚构日期')
		.setDesc('解析并显示虚构历法日期（例如 "TA 2941"、"DE 1200"）')
		.addToggle(toggle => toggle
			.setValue(plugin.settings.enableFictionalDates)
			.onChange(async (value) => {
				plugin.settings.enableFictionalDates = value;
				await plugin.saveSettings();
				refreshContent();
			}));

	const conditionalContainer = container.createDiv();

	const refreshContent = () => {
		conditionalContainer.empty();
		if (!plugin.settings.enableFictionalDates) return;

		// Built-in systems subsection
		new Setting(conditionalContainer)
			.setName('显示内置系统')
			.setDesc('包含预设历法（中土、维斯特洛、星球大战）')
			.addToggle(toggle => toggle
				.setValue(plugin.settings.showBuiltInDateSystems)
				.onChange(async (value) => {
					plugin.settings.showBuiltInDateSystems = value;
					await plugin.saveSettings();
					refreshContent();
				}));

		if (plugin.settings.showBuiltInDateSystems && DEFAULT_DATE_SYSTEMS.length > 0) {
			const builtInTable = conditionalContainer.createEl('table', { cls: 'cr-date-systems-table' });
			const thead = builtInTable.createEl('thead');
			const headerRow = thead.createEl('tr');
			headerRow.createEl('th', { text: '名称' });
			headerRow.createEl('th', { text: '纪元' });
			headerRow.createEl('th', { text: '宇宙' });
			headerRow.createEl('th', { text: '', cls: 'cr-date-systems-table__actions' });

			const tbody = builtInTable.createEl('tbody');
			for (const system of DEFAULT_DATE_SYSTEMS) {
				const row = tbody.createEl('tr');
				row.createEl('td', { text: system.name });
				row.createEl('td', { text: system.eras.map(e => e.abbrev).join(', ') });
				row.createEl('td', { text: system.universe || '—' });
				const actionsCell = row.createEl('td', { cls: 'cr-date-systems-table__actions' });
				const viewBtn = actionsCell.createEl('button', {
					cls: 'cr-btn-icon',
					attr: { 'aria-label': '查看详情' }
				});
				setIcon(viewBtn, 'eye');
				viewBtn.addEventListener('click', () => {
					new DateSystemModal(plugin.app, plugin, system, async () => {}, true).open();
				});
			}
		}

		// Custom systems list
		const customSystems = plugin.settings.fictionalDateSystems;
		if (customSystems.length > 0) {
			conditionalContainer.createEl('h4', { text: '自定义系统', cls: 'cr-subsection-heading' });
			for (const system of customSystems) {
				new Setting(conditionalContainer)
					.setName(system.name)
					.setDesc(`前缀：${system.eras?.[0]?.abbrev || '（无）'} · ${system.eras?.length || 0} 个纪元`)
					.addButton(btn => btn
						.setButtonText('编辑')
						.onClick(() => {
							new DateSystemModal(plugin.app, plugin, system, async (updated) => {
								const idx = plugin.settings.fictionalDateSystems.indexOf(system);
								if (idx >= 0) {
									plugin.settings.fictionalDateSystems[idx] = updated;
									await plugin.saveSettings();
									refreshContent();
								}
							}).open();
						}))
					.addButton(btn => btn
						.setButtonText('删除')
						.onClick(async () => {
							plugin.settings.fictionalDateSystems = plugin.settings.fictionalDateSystems.filter(s => s !== system);
							await plugin.saveSettings();
							refreshContent();
							new Notice(`已移除日期系统：${system.name}`);
						}));
			}
		}

		// Add button
		new Setting(conditionalContainer)
			.setName('添加日期系统')
			.setDesc('创建新的虚构历法系统')
			.addButton(button => button
				.setButtonText('添加')
				.setCta()
				.onClick(() => {
					new DateSystemModal(plugin.app, plugin, null, async (system) => {
						plugin.settings.fictionalDateSystems.push(system);
						await plugin.saveSettings();
						refreshContent();
						new Notice(`已添加日期系统：${system.name}`);
					}).open();
				}));
	};

	refreshContent();
}

/**
 * Get all active date systems (built-in + Calendarium + custom)
 * Async version that properly initializes the Calendarium bridge
 */
async function getActiveDateSystemsAsync(plugin: CanvasRootsPlugin): Promise<FictionalDateSystem[]> {
	const systems: FictionalDateSystem[] = [];

	if (plugin.settings.showBuiltInDateSystems) {
		systems.push(...DEFAULT_DATE_SYSTEMS);
	}

	// Add Calendarium calendars if integration is enabled
	if (plugin.settings.calendariumIntegration === 'read') {
		const bridge = getCalendariumBridge(plugin.app);
		if (bridge.isAvailable()) {
			await bridge.initialize();
			const calendariumSystems = bridge.importCalendars();
			systems.push(...calendariumSystems);
		}
	}

	systems.push(...plugin.settings.fictionalDateSystems);

	return systems;
}

/**
 * Get all active date systems (built-in + Calendarium + custom)
 * Synchronous version - Calendarium systems may not be included if bridge not yet initialized
 */
function getActiveDateSystems(plugin: CanvasRootsPlugin): FictionalDateSystem[] {
	const systems: FictionalDateSystem[] = [];

	if (plugin.settings.showBuiltInDateSystems) {
		systems.push(...DEFAULT_DATE_SYSTEMS);
	}

	// Add Calendarium calendars if integration is enabled
	if (plugin.settings.calendariumIntegration === 'read') {
		const bridge = getCalendariumBridge(plugin.app);
		if (bridge.isAvailable()) {
			const calendariumSystems = bridge.importCalendars();
			systems.push(...calendariumSystems);
		}
	}

	systems.push(...plugin.settings.fictionalDateSystems);

	return systems;
}

/**
 * Render the list of date systems
 */
async function renderDateSystemsList(
	container: HTMLElement,
	plugin: CanvasRootsPlugin,
	createCard: (options: { title: string; icon?: LucideIconName }) => HTMLElement
): Promise<void> {
	container.empty();

	const systems = await getActiveDateSystemsAsync(plugin);

	if (systems.length === 0) {
		container.createEl('p', {
			text: '未配置任何日期系统。请添加一个或启用内置系统。',
			cls: 'cr-empty-state'
		});
		return;
	}

	// Group by source: built-in, calendarium, custom
	const builtIn = systems.filter(s => s.builtIn);
	const calendarium = systems.filter(s => s.source === 'calendarium');
	const custom = systems.filter(s => !s.builtIn && s.source !== 'calendarium');

	// Built-in systems as table
	if (builtIn.length > 0) {
		const builtInSection = container.createDiv({ cls: 'cr-date-systems-section' });
		builtInSection.createEl('h4', { text: '内置系统', cls: 'cr-subsection-heading' });

		renderDateSystemsTable(builtInSection, builtIn, plugin);
	}

	// Calendarium systems as table (view-only)
	if (calendarium.length > 0) {
		const calendariumSection = container.createDiv({ cls: 'cr-date-systems-section' });
		calendariumSection.createEl('h4', { text: '来自 Calendarium', cls: 'cr-subsection-heading' });

		renderDateSystemsTable(calendariumSection, calendarium, plugin);
	}

	// Custom systems (keep card style for edit/delete actions)
	if (custom.length > 0) {
		const customSection = container.createDiv({ cls: 'cr-date-systems-section' });
		customSection.createEl('h4', { text: '自定义系统', cls: 'cr-subsection-heading' });

		for (const system of custom) {
			createSystemItem(customSection, system, plugin, false, container, createCard);
		}
	}
}

/**
 * Render a table of date systems (used for built-in and Calendarium systems)
 */
function renderDateSystemsTable(
	container: HTMLElement,
	systems: FictionalDateSystem[],
	plugin: CanvasRootsPlugin
): void {
	const table = container.createEl('table', { cls: 'cr-date-systems-table' });
	const thead = table.createEl('thead');
	const headerRow = thead.createEl('tr');
	headerRow.createEl('th', { text: '名称' });
	headerRow.createEl('th', { text: '纪元' });
	headerRow.createEl('th', { text: '宇宙' });
	headerRow.createEl('th', { text: '', cls: 'cr-date-systems-table__actions' });

	const tbody = table.createEl('tbody');
	for (const system of systems) {
		const row = tbody.createEl('tr');
		row.createEl('td', { text: system.name });
		row.createEl('td', { text: system.eras.map(e => e.abbrev).join(', ') });
		row.createEl('td', { text: system.universe || '—' });

		// View button
		const actionsCell = row.createEl('td', { cls: 'cr-date-systems-table__actions' });
		const viewBtn = actionsCell.createEl('button', {
			cls: 'cr-btn-icon',
			attr: { 'aria-label': '查看详情' }
		});
		setIcon(viewBtn, 'eye');
		viewBtn.addEventListener('click', () => {
			new DateSystemModal(plugin.app, plugin, system, async () => {
				// No-op for view-only
			}, true).open();
		});
	}
}

/**
 * Create a single date system item in the list
 */
function createSystemItem(
	container: HTMLElement,
	system: FictionalDateSystem,
	plugin: CanvasRootsPlugin,
	isBuiltIn: boolean,
	listContainer: HTMLElement,
	createCard: (options: { title: string; icon?: LucideIconName }) => HTMLElement
): void {
	const item = container.createDiv({ cls: 'cr-date-system-item' });

	// Icon and name
	const header = item.createDiv({ cls: 'cr-date-system-item-header' });
	const iconEl = header.createSpan({ cls: 'cr-date-system-item-icon' });
	setIcon(iconEl, 'calendar');

	const nameEl = header.createSpan({ cls: 'cr-date-system-item-name', text: system.name });
	if (isBuiltIn) {
		nameEl.createSpan({ cls: 'cr-ds-badge cr-ds-badge--muted', text: '内置' });
	}

	// Eras list
	const erasText = system.eras.map(e => e.abbrev).join(', ');
	item.createDiv({ cls: 'cr-date-system-item-eras', text: `纪元：${erasText}` });

	// Universe
	if (system.universe) {
		item.createDiv({ cls: 'cr-date-system-item-universe', text: `宇宙：${system.universe}` });
	}

	// Actions
	const actions = item.createDiv({ cls: 'cr-date-system-item-actions' });

	if (!isBuiltIn) {
		// Edit button
		const editBtn = actions.createEl('button', { cls: 'cr-btn-icon', attr: { 'aria-label': '编辑' } });
		setIcon(editBtn, 'edit');
		editBtn.addEventListener('click', () => {
			new DateSystemModal(plugin.app, plugin, system, async (updated) => {
				const index = plugin.settings.fictionalDateSystems.findIndex(s => s.id === system.id);
				if (index >= 0) {
					plugin.settings.fictionalDateSystems[index] = updated;
					await plugin.saveSettings();
					void renderDateSystemsList(listContainer, plugin, createCard);
					new Notice(`已更新日期系统：${updated.name}`);
				}
			}).open();
		});

		// Delete button
		const deleteBtn = actions.createEl('button', { cls: 'cr-btn-icon cr-btn-icon--danger', attr: { 'aria-label': '删除' } });
		setIcon(deleteBtn, 'trash');
		deleteBtn.addEventListener('click', () => {
			void (async () => {
				const confirm = await confirmDelete(plugin.app, system.name);
				if (confirm) {
					plugin.settings.fictionalDateSystems = plugin.settings.fictionalDateSystems.filter(
						s => s.id !== system.id
					);
					await plugin.saveSettings();
					void renderDateSystemsList(listContainer, plugin, createCard);
					new Notice(`已删除日期系统：${system.name}`);
				}
			})();
		});
	} else {
		// View-only indicator for built-in
		const viewBtn = actions.createEl('button', { cls: 'cr-btn-icon', attr: { 'aria-label': '查看详情' } });
		setIcon(viewBtn, 'eye');
		viewBtn.addEventListener('click', () => {
			new DateSystemModal(plugin.app, plugin, system, async () => {
				// No-op for view-only
			}, true).open();
		});
	}
}

/**
 * Confirm deletion dialog
 */
async function confirmDelete(app: App, systemName: string): Promise<boolean> {
	return new Promise((resolve) => {
		const modal = new Modal(app);
		modal.titleEl.setText('删除日期系统');
		modal.contentEl.createEl('p', {
			text: `确定要删除「${systemName}」吗？此操作无法撤销。`
		});

		const buttonContainer = modal.contentEl.createDiv({ cls: 'modal-button-container' });

		const cancelBtn = buttonContainer.createEl('button', { text: '取消' });
		cancelBtn.addEventListener('click', () => {
			modal.close();
			resolve(false);
		});

		const deleteBtn = buttonContainer.createEl('button', { cls: 'mod-warning', text: '删除' });
		deleteBtn.addEventListener('click', () => {
			modal.close();
			resolve(true);
		});

		modal.open();
	});
}

/**
 * Modal for adding/editing a date system
 */
class DateSystemModal extends Modal {
	private plugin: CanvasRootsPlugin;
	private system: FictionalDateSystem | null;
	private onSave: (system: FictionalDateSystem) => Promise<void>;
	private viewOnly: boolean;

	// Form state
	private formData: {
		id: string;
		name: string;
		universe: string;
		eras: FictionalEra[];
		defaultEra: string;
	};

	constructor(
		app: App,
		plugin: CanvasRootsPlugin,
		system: FictionalDateSystem | null,
		onSave: (system: FictionalDateSystem) => Promise<void>,
		viewOnly = false
	) {
		super(app);
		this.plugin = plugin;
		this.system = system;
		this.onSave = onSave;
		this.viewOnly = viewOnly;

		// Initialize form data
		this.formData = system ? {
			id: system.id,
			name: system.name,
			universe: system.universe || '',
			eras: [...system.eras],
			defaultEra: system.defaultEra || ''
		} : {
			id: '',
			name: '',
			universe: '',
			eras: [],
			defaultEra: ''
		};
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('cr-date-system-modal');

		// Title
		const title = this.system
			? (this.viewOnly ? `查看：${this.system.name}` : `编辑：${this.system.name}`)
			: '添加日期系统';
		this.titleEl.setText(title);

		// Form
		const form = contentEl.createDiv({ cls: 'cr-date-system-form' });

		// Name
		new Setting(form)
			.setName('名称')
			.setDesc('此历法系统的显示名称')
			.addText(text => text
				.setPlaceholder('中土历法')
				.setValue(this.formData.name)
				.setDisabled(this.viewOnly)
				.onChange(value => {
					this.formData.name = value;
					// Auto-generate ID if creating new
					if (!this.system) {
						this.formData.id = value.toLowerCase().replace(/[^a-z0-9]+/g, '_');
					}
				}));

		// ID (read-only for existing systems)
		new Setting(form)
			.setName('ID')
			.setDesc('唯一标识符（由名称自动生成）')
			.addText(text => text
				.setPlaceholder('middle_earth')
				.setValue(this.formData.id)
				.setDisabled(!!this.system || this.viewOnly)
				.onChange(value => {
					this.formData.id = value;
				}));

		// Universe
		new Setting(form)
			.setName('宇宙')
			.setDesc('可选：将此历法限定到特定宇宙')
			.addText(text => text
				.setPlaceholder('Middle-earth')
				.setValue(this.formData.universe)
				.setDisabled(this.viewOnly)
				.onChange(value => {
					this.formData.universe = value;
				}));

		// Eras section
		form.createEl('h4', { text: '纪元', cls: 'cr-subsection-heading' });
		const erasContainer = form.createDiv({ cls: 'cr-eras-container' });
		this.renderEras(erasContainer);

		if (!this.viewOnly) {
			const addEraBtn = form.createEl('button', {
				cls: 'cr-add-era-btn',
				text: '+ 添加纪元'
			});
			addEraBtn.addEventListener('click', () => {
				this.formData.eras.push({
					id: `era_${this.formData.eras.length + 1}`,
					name: '',
					abbrev: '',
					epoch: 0,
					direction: 'forward'
				});
				this.renderEras(erasContainer);
			});
		}

		// Default era dropdown
		const defaultEraSetting = new Setting(form)
			.setName('默认纪元')
			.setDesc('创建新日期时使用的纪元');

		if (!this.viewOnly) {
			defaultEraSetting.addDropdown(dropdown => {
				dropdown.addOption('', '（无）');
				for (const era of this.formData.eras) {
					if (era.id && era.name) {
						dropdown.addOption(era.id, era.name);
					}
				}
				dropdown.setValue(this.formData.defaultEra);
				dropdown.onChange(value => {
					this.formData.defaultEra = value;
				});
			});
		} else {
			const defaultEra = this.formData.eras.find(e => e.id === this.formData.defaultEra);
			defaultEraSetting.setDesc(defaultEra?.name || '（无）');
		}

		// Buttons
		const buttonContainer = contentEl.createDiv({ cls: 'modal-button-container' });

		if (this.viewOnly) {
			const closeBtn = buttonContainer.createEl('button', { text: '关闭' });
			closeBtn.addEventListener('click', () => this.close());
		} else {
			const cancelBtn = buttonContainer.createEl('button', { text: '取消' });
			cancelBtn.addEventListener('click', () => this.close());

			const saveBtn = buttonContainer.createEl('button', { cls: 'mod-cta', text: '保存' });
			saveBtn.addEventListener('click', () => {
				if (this.validate()) {
					const system: FictionalDateSystem = {
						id: this.formData.id,
						name: this.formData.name,
						universe: this.formData.universe || undefined,
						eras: this.formData.eras.filter(e => e.name && e.abbrev),
						defaultEra: this.formData.defaultEra || undefined,
						builtIn: false
					};
					void this.onSave(system).then(() => this.close());
				}
			});
		}
	}

	private renderEras(container: HTMLElement): void {
		container.empty();

		if (this.formData.eras.length === 0) {
			container.createEl('p', {
				text: '尚未定义纪元。请至少添加一个纪元。',
				cls: 'cr-empty-state'
			});
			return;
		}

		// Table header
		const table = container.createEl('table', { cls: 'cr-eras-table' });
		const thead = table.createEl('thead');
		const headerRow = thead.createEl('tr');
		headerRow.createEl('th', { text: '名称' });
		headerRow.createEl('th', { text: '缩写' });
		headerRow.createEl('th', { text: '纪元起点' });
		headerRow.createEl('th', { text: '方向' });
		if (!this.viewOnly) {
			headerRow.createEl('th', { text: '' }); // Actions column
		}

		const tbody = table.createEl('tbody');

		for (let i = 0; i < this.formData.eras.length; i++) {
			const era = this.formData.eras[i];
			const row = tbody.createEl('tr');

			// Name
			const nameCell = row.createEl('td');
			if (this.viewOnly) {
				nameCell.setText(era.name);
			} else {
				const nameInput = nameCell.createEl('input', {
					cls: 'cr-era-input',
					attr: { type: 'text', placeholder: '第三纪元' }
				});
				nameInput.value = era.name;
				nameInput.addEventListener('input', () => {
					era.name = nameInput.value;
					// Auto-generate ID
					era.id = nameInput.value.toLowerCase().replace(/[^a-z0-9]+/g, '_');
				});
			}

			// Abbreviation
			const abbrevCell = row.createEl('td');
			if (this.viewOnly) {
				abbrevCell.setText(era.abbrev);
			} else {
				const abbrevInput = abbrevCell.createEl('input', {
					cls: 'cr-era-input cr-era-input--short',
					attr: { type: 'text', placeholder: 'TA' }
				});
				abbrevInput.value = era.abbrev;
				abbrevInput.addEventListener('input', () => {
					era.abbrev = abbrevInput.value;
				});
			}

			// Epoch
			const epochCell = row.createEl('td');
			if (this.viewOnly) {
				epochCell.setText(String(era.epoch));
			} else {
				const epochInput = epochCell.createEl('input', {
					cls: 'cr-era-input cr-era-input--short',
					attr: { type: 'number', placeholder: '0' }
				});
				epochInput.value = String(era.epoch);
				epochInput.addEventListener('input', () => {
					era.epoch = parseInt(epochInput.value) || 0;
				});
			}

			// Direction
			const directionCell = row.createEl('td');
			if (this.viewOnly) {
				directionCell.setText(era.direction || 'forward');
			} else {
				const directionSelect = directionCell.createEl('select', { cls: 'cr-era-select' });
				directionSelect.createEl('option', { text: '正向', attr: { value: 'forward' } });
				directionSelect.createEl('option', { text: '反向', attr: { value: 'backward' } });
				directionSelect.value = era.direction || 'forward';
				directionSelect.addEventListener('change', () => {
					era.direction = directionSelect.value as 'forward' | 'backward';
				});
			}

			// Actions
			if (!this.viewOnly) {
				const actionsCell = row.createEl('td');
				const deleteBtn = actionsCell.createEl('button', {
					cls: 'cr-btn-icon cr-btn-icon--danger cr-btn-icon--small',
					attr: { 'aria-label': '移除纪元' }
				});
				setIcon(deleteBtn, 'x');
				deleteBtn.addEventListener('click', () => {
					this.formData.eras.splice(i, 1);
					this.renderEras(container);
				});
			}
		}
	}

	private validate(): boolean {
		if (!this.formData.name.trim()) {
			new Notice('请输入日期系统的名称');
			return false;
		}

		if (!this.formData.id.trim()) {
			new Notice('请输入日期系统的 ID');
			return false;
		}

		// Check for duplicate ID
		const existingIds = this.plugin.settings.fictionalDateSystems
			.filter(s => s.id !== this.system?.id)
			.map(s => s.id);
		if (existingIds.includes(this.formData.id)) {
			new Notice(`ID 为 "${this.formData.id}" 的日期系统已存在`);
			return false;
		}

		// Must have at least one era
		const validEras = this.formData.eras.filter(e => e.name && e.abbrev);
		if (validEras.length === 0) {
			new Notice('请至少添加一个包含名称和缩写的纪元');
			return false;
		}

		// Check for duplicate abbreviations
		const abbrevs = validEras.map(e => e.abbrev.toUpperCase());
		const uniqueAbbrevs = new Set(abbrevs);
		if (abbrevs.length !== uniqueAbbrevs.size) {
			new Notice('纪元缩写必须唯一');
			return false;
		}

		return true;
	}

	onClose(): void {
		this.contentEl.empty();
	}
}