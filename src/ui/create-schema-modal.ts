/**
 * Create/Edit Schema Modal
 * Modal for creating and editing schema notes for validation
 */

import { App, ButtonComponent, Modal, Setting, TFile, Notice } from 'obsidian';
import { createLucideIcon, setLucideIcon } from './lucide-icons';
import { splitAndTrim } from '../utils/format-utils';
import type CanvasRootsPlugin from '../../main';
import { SchemaService } from '../schemas';
import type {
	SchemaNote,
	PropertyDefinition,
	PropertyType,
	SchemaConstraint,
	SchemaAppliesTo
} from '../schemas';

/**
 * Data structure for schema being edited
 */
interface SchemaFormData {
	crId: string;
	name: string;
	description: string;
	appliesToType: SchemaAppliesTo;
	appliesToValue: string;
	requiredProperties: string[];
	properties: Record<string, PropertyDefinition>;
	constraints: SchemaConstraint[];
}

/**
 * Generate a URL-friendly schema ID from a name
 */
function generateSchemaId(name: string): string {
	return 'schema-' + name
		.toLowerCase()
		.replace(/[^a-z0-9\s-]/g, '')
		.replace(/\s+/g, '-')
		.replace(/-+/g, '-')
		.trim();
}

/**
 * Parse schema data from a SchemaNote
 */
function parseSchemaData(schema: SchemaNote): SchemaFormData {
	return {
		crId: schema.cr_id,
		name: schema.name,
		description: schema.description || '',
		appliesToType: schema.appliesToType,
		appliesToValue: schema.appliesToValue || '',
		requiredProperties: [...schema.definition.requiredProperties],
		properties: { ...schema.definition.properties },
		constraints: [...schema.definition.constraints]
	};
}

/**
 * Modal for creating and editing schema notes
 */
export class CreateSchemaModal extends Modal {
	private plugin: CanvasRootsPlugin;
	private schemaService: SchemaService;
	private formData: SchemaFormData;
	private onCreated?: (file: TFile) => void;
	private onUpdated?: () => void;

	// Edit mode properties
	private editMode: boolean = false;
	private editingSchema?: SchemaNote;

	// UI elements
	private crIdInput?: HTMLInputElement;
	private appliesToValueContainer?: HTMLElement;
	private propertiesContainer?: HTMLElement;
	private constraintsContainer?: HTMLElement;
	private requiredPropsContainer?: HTMLElement;

	constructor(
		app: App,
		plugin: CanvasRootsPlugin,
		options?: {
			onCreated?: (file: TFile) => void;
			onUpdated?: () => void;
			editSchema?: SchemaNote;
		}
	) {
		super(app);
		this.plugin = plugin;
		this.schemaService = new SchemaService(plugin);
		this.onCreated = options?.onCreated;
		this.onUpdated = options?.onUpdated;

		if (options?.editSchema) {
			this.editMode = true;
			this.editingSchema = options.editSchema;
			this.formData = parseSchemaData(options.editSchema);
		} else {
			this.formData = {
				crId: '',
				name: '',
				description: '',
				appliesToType: 'all',
				appliesToValue: '',
				requiredProperties: [],
				properties: {},
				constraints: []
			};
		}
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		this.modalEl.addClass('crc-create-schema-modal');

		// Header
		const header = contentEl.createDiv({ cls: 'crc-modal-header' });
		const titleContainer = header.createDiv({ cls: 'crc-modal-title' });
		const icon = createLucideIcon('clipboard-check', 24);
		titleContainer.appendChild(icon);
		titleContainer.appendText(this.editMode ? '编辑校验架构' : '创建校验架构');

		// Description
		contentEl.createEl('p', {
			text: this.editMode
				? '编辑校验架构配置。'
				: '创建校验架构以对人物笔记强制属性规则。',
			cls: 'crc-modal-description'
		});

		// Form with scrollable content
		const formWrapper = contentEl.createDiv({ cls: 'crc-schema-form-wrapper' });
		const form = formWrapper.createDiv({ cls: 'crc-form' });

		this.renderBasicSettings(form);
		this.renderScopeSettings(form);
		this.renderRequiredProperties(form);
		this.renderPropertyDefinitions(form);
		this.renderConstraints(form);

		// Buttons
		const buttonContainer = contentEl.createDiv({ cls: 'crc-modal-buttons' });

		new ButtonComponent(buttonContainer)
			.setButtonText('取消')
			.onClick(() => this.close());

		new ButtonComponent(buttonContainer)
			.setButtonText(this.editMode ? '保存更改' : '创建校验架构')
			.setCta()
			.onClick(() => {
				if (this.editMode) {
					void this.updateSchema();
				} else {
					void this.createSchema();
				}
			});
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}

	/**
	 * Render basic settings (name, ID, description)
	 */
	private renderBasicSettings(form: HTMLElement): void {
		// Name
		new Setting(form)
			.setName('名称')
			.setDesc('校验架构的显示名称')
			.addText(text => text
				.setPlaceholder('例如：House Stark 校验架构')
				.setValue(this.formData.name)
				.onChange(value => {
					this.formData.name = value;
					// Auto-generate ID from name (only in create mode)
					if (!this.editMode && this.crIdInput && !this.crIdInput.dataset.manuallyEdited) {
						const generatedId = generateSchemaId(value);
						this.formData.crId = generatedId;
						this.crIdInput.value = generatedId;
					}
				}));

		// Schema ID
		new Setting(form)
			.setName('校验架构 ID')
			.setDesc(this.editMode
				? '唯一标识符（更改可能破坏引用）'
				: '唯一标识符（根据名称自动生成）')
			.addText(text => {
				this.crIdInput = text.inputEl;
				text.setPlaceholder('例如：schema-house-stark')
					.setValue(this.formData.crId)
					.onChange(value => {
						this.formData.crId = value;
						if (this.crIdInput) {
							this.crIdInput.dataset.manuallyEdited = 'true';
						}
					});
			});

		if (this.editMode && this.crIdInput) {
			this.crIdInput.dataset.manuallyEdited = 'true';
		}

		// Description
		new Setting(form)
			.setName('描述')
			.setDesc('此校验架构用途的可选描述')
			.addTextArea(text => text
				.setPlaceholder('例如：校验 House Stark 的成员……')
				.setValue(this.formData.description)
				.onChange(value => {
					this.formData.description = value;
				}));
	}

	/**
	 * Render scope settings (applies to)
	 */
	private renderScopeSettings(form: HTMLElement): void {
		const scopeSection = form.createDiv({ cls: 'crc-section' });
		scopeSection.createEl('h4', { text: '适用范围', cls: 'crc-section-title' });

		// Applies to type
		new Setting(scopeSection)
			.setName('适用于')
			.setDesc('此校验架构应校验哪些人物笔记？')
			.addDropdown(dropdown => dropdown
				.addOption('all', '所有人物')
				.addOption('collection', '按合集')
				.addOption('folder', '按文件夹')
				.addOption('universe', '按宇宙')
				.setValue(this.formData.appliesToType)
				.onChange(value => {
					this.formData.appliesToType = value as SchemaAppliesTo;
					this.updateAppliesToValueVisibility();
				}));

		// Applies to value container
		this.appliesToValueContainer = scopeSection.createDiv();
		this.renderAppliesToValue();
	}

	/**
	 * Render the applies-to value field
	 */
	private renderAppliesToValue(): void {
		if (!this.appliesToValueContainer) return;
		this.appliesToValueContainer.empty();

		if (this.formData.appliesToType === 'all') {
			return; // No value needed
		}

		const labels: Record<SchemaAppliesTo, string> = {
			all: '',
			collection: '合集名称',
			folder: '文件夹路径',
			universe: '宇宙名称'
		};

		const placeholders: Record<SchemaAppliesTo, string> = {
			all: '',
			collection: '例如：House Stark',
			folder: '例如：People/Westeros',
			universe: '例如：westeros'
		};

		new Setting(this.appliesToValueContainer)
			.setName(labels[this.formData.appliesToType])
			.addText(text => text
				.setPlaceholder(placeholders[this.formData.appliesToType])
				.setValue(this.formData.appliesToValue)
				.onChange(value => {
					this.formData.appliesToValue = value;
				}));
	}

	/**
	 * Update visibility of applies-to value field
	 */
	private updateAppliesToValueVisibility(): void {
		this.renderAppliesToValue();
	}

	/**
	 * Render required properties section
	 */
	private renderRequiredProperties(form: HTMLElement): void {
		const section = form.createDiv({ cls: 'crc-section' });
		section.createEl('h4', { text: '必填属性', cls: 'crc-section-title' });
		section.createEl('p', {
			text: '所有匹配的人物笔记中必须存在的属性。',
			cls: 'crc-section-desc crc-text--muted'
		});

		this.requiredPropsContainer = section.createDiv({ cls: 'crc-required-props' });
		this.renderRequiredPropsList();

		// Add button
		const addBtn = section.createEl('button', {
			text: '添加必填属性',
			cls: 'crc-btn crc-btn--secondary crc-btn--small'
		});
		addBtn.prepend(createLucideIcon('plus', 14));
		addBtn.addEventListener('click', () => {
			this.formData.requiredProperties.push('');
			this.renderRequiredPropsList();
		});
	}

	/**
	 * Render the list of required properties
	 */
	private renderRequiredPropsList(): void {
		if (!this.requiredPropsContainer) return;
		this.requiredPropsContainer.empty();

		if (this.formData.requiredProperties.length === 0) {
			this.requiredPropsContainer.createEl('p', {
				text: '未定义必填属性。',
				cls: 'crc-text--muted crc-text--small'
			});
			return;
		}

		for (let i = 0; i < this.formData.requiredProperties.length; i++) {
			const propRow = this.requiredPropsContainer.createDiv({ cls: 'crc-prop-row' });

			const input = propRow.createEl('input', {
				type: 'text',
				cls: 'crc-form-input',
				value: this.formData.requiredProperties[i],
				attr: { placeholder: '例如：allegiance' }
			});
			input.addEventListener('input', (e) => {
				this.formData.requiredProperties[i] = (e.target as HTMLInputElement).value;
			});

			const removeBtn = propRow.createEl('button', {
				cls: 'crc-btn crc-btn--icon crc-btn--danger',
				attr: { 'aria-label': '移除' }
			});
			setLucideIcon(removeBtn, 'x', 14);
			removeBtn.addEventListener('click', () => {
				this.formData.requiredProperties.splice(i, 1);
				this.renderRequiredPropsList();
			});
		}
	}

	/**
	 * Render property definitions section
	 */
	private renderPropertyDefinitions(form: HTMLElement): void {
		const section = form.createDiv({ cls: 'crc-section' });
		section.createEl('h4', { text: '属性定义', cls: 'crc-section-title' });
		section.createEl('p', {
			text: '为特定属性定义校验规则。',
			cls: 'crc-section-desc crc-text--muted'
		});

		this.propertiesContainer = section.createDiv({ cls: 'crc-properties-list' });
		this.renderPropertiesList();

		// Add button
		const addBtn = section.createEl('button', {
			text: '添加属性定义',
			cls: 'crc-btn crc-btn--secondary crc-btn--small'
		});
		addBtn.prepend(createLucideIcon('plus', 14));
		addBtn.addEventListener('click', () => {
			const propName = `property_${Object.keys(this.formData.properties).length + 1}`;
			this.formData.properties[propName] = { type: 'string' };
			this.renderPropertiesList();
		});
	}

	/**
	 * Render the list of property definitions
	 */
	private renderPropertiesList(): void {
		if (!this.propertiesContainer) return;
		this.propertiesContainer.empty();

		const propNames = Object.keys(this.formData.properties);

		if (propNames.length === 0) {
			this.propertiesContainer.createEl('p', {
				text: '无属性定义。添加一个以校验特定属性。',
				cls: 'crc-text--muted crc-text--small'
			});
			return;
		}

		for (const propName of propNames) {
			const propDef = this.formData.properties[propName];
			const card = this.propertiesContainer.createDiv({ cls: 'crc-property-card' });

			// Header with property name and remove button
			const header = card.createDiv({ cls: 'crc-property-card-header' });

			const nameInput = header.createEl('input', {
				type: 'text',
				cls: 'crc-form-input crc-property-name-input',
				value: propName,
				attr: { placeholder: '属性名称' }
			});
			nameInput.addEventListener('change', (e) => {
				const newName = (e.target as HTMLInputElement).value;
				if (newName && newName !== propName) {
					this.formData.properties[newName] = this.formData.properties[propName];
					delete this.formData.properties[propName];
					this.renderPropertiesList();
				}
			});

			const removeBtn = header.createEl('button', {
				cls: 'crc-btn crc-btn--icon crc-btn--danger',
				attr: { 'aria-label': '移除属性' }
			});
			setLucideIcon(removeBtn, 'trash', 14);
			removeBtn.addEventListener('click', () => {
				delete this.formData.properties[propName];
				this.renderPropertiesList();
			});

			// Property settings
			const settings = card.createDiv({ cls: 'crc-property-settings' });

			// Type dropdown
			new Setting(settings)
				.setName('类型')
				.addDropdown(dropdown => dropdown
					.addOption('string', '字符串')
					.addOption('number', '数字')
					.addOption('boolean', '布尔值')
					.addOption('date', '日期')
					.addOption('wikilink', 'Wiki 链接')
					.addOption('array', '数组')
					.addOption('enum', '枚举')
					.addOption('sourced_facts', '来源事实')
					.setValue(propDef.type)
					.onChange(value => {
						propDef.type = value as PropertyType;
						this.renderPropertiesList();
					}));

			// Type-specific settings
			if (propDef.type === 'enum') {
				new Setting(settings)
					.setName('允许的值')
					.setDesc('逗号分隔的列表')
					.addText(text => text
						.setPlaceholder('例如：male, female, other')
						.setValue(propDef.values?.join(', ') || '')
						.onChange(value => {
							propDef.values = splitAndTrim(value);
						}));
			}

			if (propDef.type === 'number') {
				const rangeRow = settings.createDiv({ cls: 'crc-range-row' });
				new Setting(rangeRow)
					.setName('最小值')
					.addText(text => text
						.setPlaceholder('0')
						.setValue(propDef.min?.toString() || '')
						.onChange(value => {
							propDef.min = value ? parseFloat(value) : undefined;
						}));
				new Setting(rangeRow)
					.setName('最大值')
					.addText(text => text
						.setPlaceholder('100')
						.setValue(propDef.max?.toString() || '')
						.onChange(value => {
							propDef.max = value ? parseFloat(value) : undefined;
						}));
			}

			if (propDef.type === 'wikilink') {
				new Setting(settings)
					.setName('目标类型')
					.setDesc('可选：限制为特定笔记类型')
					.addDropdown(dropdown => dropdown
						.addOption('', '任意')
						.addOption('person', '人物')
						.addOption('place', '地点')
						.addOption('map', '地图')
						.setValue(propDef.targetType || '')
						.onChange(value => {
							propDef.targetType = value || undefined;
						}));
			}

			if (propDef.type === 'sourced_facts') {
				settings.createEl('p', {
					text: '校验事实级来源追踪结构。预期格式：{ birth_date: { sources: ["[[Source]]"] }, ... }',
					cls: 'crc-text--muted crc-text--small crc-mt-1'
				});
			}

			// Description
			new Setting(settings)
				.setName('描述')
				.addText(text => text
					.setPlaceholder('可选描述')
					.setValue(propDef.description || '')
					.onChange(value => {
						propDef.description = value || undefined;
					}));
		}
	}

	/**
	 * Render constraints section
	 */
	private renderConstraints(form: HTMLElement): void {
		const section = form.createDiv({ cls: 'crc-section' });
		section.createEl('h4', { text: '约束', cls: 'crc-section-title' });
		section.createEl('p', {
			text: '使用 JavaScript 表达式的跨属性校验规则。',
			cls: 'crc-section-desc crc-text--muted'
		});

		this.constraintsContainer = section.createDiv({ cls: 'crc-constraints-list' });
		this.renderConstraintsList();

		// Add button
		const addBtn = section.createEl('button', {
			text: '添加约束',
			cls: 'crc-btn crc-btn--secondary crc-btn--small'
		});
		addBtn.prepend(createLucideIcon('plus', 14));
		addBtn.addEventListener('click', () => {
			this.formData.constraints.push({ rule: '', message: '' });
			this.renderConstraintsList();
		});

		// Help text
		const helpDiv = section.createDiv({ cls: 'crc-help-text crc-mt-2' });
		helpDiv.createEl('p', {
			text: '示例：',
			cls: 'crc-text--muted crc-text--small'
		});
		const examples = helpDiv.createEl('ul', { cls: 'crc-text--muted crc-text--small' });
		examples.createEl('li', { text: '!died || born —「没有出生不能有死亡」' });
		examples.createEl('li', { text: 'age >= 0 && age <= 200 —「年龄必须在0到200之间」' });
	}

	/**
	 * Render the list of constraints
	 */
	private renderConstraintsList(): void {
		if (!this.constraintsContainer) return;
		this.constraintsContainer.empty();

		if (this.formData.constraints.length === 0) {
			this.constraintsContainer.createEl('p', {
				text: '未定义约束。',
				cls: 'crc-text--muted crc-text--small'
			});
			return;
		}

		for (let i = 0; i < this.formData.constraints.length; i++) {
			const constraint = this.formData.constraints[i];
			const card = this.constraintsContainer.createDiv({ cls: 'crc-constraint-card' });

			// Header with remove button
			const header = card.createDiv({ cls: 'crc-constraint-header' });
			header.createEl('span', { text: `约束${i + 1}`, cls: 'crc-constraint-label' });

			const removeBtn = header.createEl('button', {
				cls: 'crc-btn crc-btn--icon crc-btn--danger',
				attr: { 'aria-label': '移除约束' }
			});
			setLucideIcon(removeBtn, 'x', 14);
			removeBtn.addEventListener('click', () => {
				this.formData.constraints.splice(i, 1);
				this.renderConstraintsList();
			});

			// Rule input
			new Setting(card)
				.setName('规则')
				.setDesc('JavaScript 表达式')
				.addText(text => text
					.setPlaceholder('例如：!died || born')
					.setValue(constraint.rule)
					.onChange(value => {
						constraint.rule = value;
					}));

			// Message input
			new Setting(card)
				.setName('错误消息')
				.addText(text => text
					.setPlaceholder('例如：没有出生日期不能有去世日期')
					.setValue(constraint.message)
					.onChange(value => {
						constraint.message = value;
					}));
		}
	}

	/**
	 * Validate form data
	 */
	private validate(): boolean {
		if (!this.formData.name.trim()) {
			new Notice('请输入校验架构名称');
			return false;
		}

		if (!this.formData.crId.trim()) {
			new Notice('请输入校验架构 ID');
			return false;
		}

		if (this.formData.appliesToType !== 'all' && !this.formData.appliesToValue.trim()) {
			new Notice(`请输入「${this.formData.appliesToType}」的值`);
			return false;
		}

		// Validate constraints have both rule and message
		for (let i = 0; i < this.formData.constraints.length; i++) {
			const c = this.formData.constraints[i];
			if (!c.rule.trim() || !c.message.trim()) {
				new Notice(`约束${i + 1}必须同时包含规则和错误消息`);
				return false;
			}
		}

		return true;
	}

	/**
	 * Create a new schema
	 */
	private async createSchema(): Promise<void> {
		if (!this.validate()) return;

		try {
			// Check for duplicate ID
			const existing = await this.schemaService.getSchemaById(this.formData.crId);
			if (existing) {
				new Notice(`ID 为「${this.formData.crId}」的校验架构已存在`);
				return;
			}

			const schemaData: Omit<SchemaNote, 'filePath'> = {
				cr_id: this.formData.crId,
				name: this.formData.name,
				description: this.formData.description || undefined,
				appliesToType: this.formData.appliesToType,
				appliesToValue: this.formData.appliesToType !== 'all' ? this.formData.appliesToValue : undefined,
				definition: {
					requiredProperties: this.formData.requiredProperties.filter(p => p.trim()),
					properties: this.formData.properties,
					constraints: this.formData.constraints
				}
			};

			const file = await this.schemaService.createSchema(schemaData);

			new Notice(`已创建校验架构：${this.formData.name}`);

			if (this.onCreated) {
				this.onCreated(file);
			}

			this.close();
		} catch (error) {
			console.error('Failed to create schema:', error);
			new Notice(`创建校验架构失败：${error instanceof Error ? error.message : '未知错误'}`);
		}
	}

	/**
	 * Update an existing schema
	 */
	private async updateSchema(): Promise<void> {
		if (!this.validate()) return;

		if (!this.editingSchema) {
			new Notice('没有可更新的校验架构');
			return;
		}

		try {
			await this.schemaService.updateSchema(this.editingSchema.cr_id, {
				name: this.formData.name,
				description: this.formData.description || undefined,
				appliesToType: this.formData.appliesToType,
				appliesToValue: this.formData.appliesToType !== 'all' ? this.formData.appliesToValue : undefined,
				definition: {
					requiredProperties: this.formData.requiredProperties.filter(p => p.trim()),
					properties: this.formData.properties,
					constraints: this.formData.constraints
				}
			});

			new Notice(`已更新校验架构：${this.formData.name}`);

			if (this.onUpdated) {
				this.onUpdated();
			}

			this.close();
		} catch (error) {
			console.error('Failed to update schema:', error);
			new Notice(`更新校验架构失败：${error instanceof Error ? error.message : '未知错误'}`);
		}
	}
}