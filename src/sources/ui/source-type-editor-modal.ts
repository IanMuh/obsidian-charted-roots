/**
 * Source Type Editor Modal
 *
 * Modal for creating, editing, and customizing source types.
 * Supports both creating new user-defined types and customizing built-in types.
 */

import { App, Modal, Setting, Notice } from 'obsidian';
import type CanvasRootsPlugin from '../../../main';
import type { SourceTypeDefinition } from '../types/source-types';
import { BUILT_IN_SOURCE_TYPES, getAllSourceCategories } from '../types/source-types';
import type { LucideIconName } from '../../ui/lucide-icons';
import { setLucideIcon } from '../../ui/lucide-icons';

/**
 * Common icons for source types
 */
const ICON_SUGGESTIONS: LucideIconName[] = [
	'file-text', 'file', 'bookmark', 'users', 'church', 'gavel', 'map',
	'scroll', 'shield', 'ship', 'image', 'mail', 'newspaper', 'mic',
	'archive', 'book-open', 'folder', 'file-check',
	'landmark', 'building', 'building-2',
	'globe', 'flag', 'star', 'heart', 'home'
];

/**
 * Color presets for source types
 */
const COLOR_PRESETS: string[] = [
	'#4a90d9', // Blue (vital records)
	'#7c7c7c', // Gray (obituary)
	'#5ba55b', // Green (census)
	'#9b59b6', // Purple (church)
	'#8b4513', // Brown (court)
	'#228b22', // Forest green (land deed)
	'#daa520', // Goldenrod (probate)
	'#2e8b57', // Sea green (military)
	'#4169e1', // Royal blue (immigration)
	'#ff6b6b', // Coral (photo)
	'#ff8c00', // Orange (correspondence)
	'#696969', // Dim gray (newspaper)
	'#e91e63', // Pink (oral history)
	'#808080', // Gray (custom)
	'#3498db', // Light blue
	'#27ae60'  // Emerald
];

interface SourceTypeEditorModalOptions {
	/** Callback after successful save */
	onSave: () => void;
	/** Existing type to edit (for user-created types) */
	editType?: SourceTypeDefinition;
	/** Built-in type to customize (for overriding defaults) */
	customizeBuiltIn?: SourceTypeDefinition;
}

/**
 * Modal for creating, editing, or customizing source types
 */
export class SourceTypeEditorModal extends Modal {
	private plugin: CanvasRootsPlugin;
	private onSave: () => void;
	private editMode: boolean = false;
	private customizeMode: boolean = false;
	private originalId?: string;
	private builtInDefaults?: SourceTypeDefinition;

	// Form fields
	private id: string = '';
	private name: string = '';
	private description: string = '';
	private icon: LucideIconName = 'file';
	private color: string = '#808080';
	private category: string = 'other';

	constructor(app: App, plugin: CanvasRootsPlugin, options: SourceTypeEditorModalOptions) {
		super(app);
		this.plugin = plugin;
		this.onSave = options.onSave;

		if (options.editType) {
			// Editing an existing user-created type
			this.editMode = true;
			this.originalId = options.editType.id;
			this.id = options.editType.id;
			this.name = options.editType.name;
			this.description = options.editType.description;
			this.icon = options.editType.icon;
			this.color = options.editType.color;
			this.category = options.editType.category;
		} else if (options.customizeBuiltIn) {
			// Customizing a built-in type
			this.customizeMode = true;
			this.builtInDefaults = options.customizeBuiltIn;
			this.originalId = options.customizeBuiltIn.id;
			this.id = options.customizeBuiltIn.id;

			// Check for existing customization
			const existing = this.plugin.settings.sourceTypeCustomizations?.[this.id];
			if (existing) {
				this.name = existing.name ?? options.customizeBuiltIn.name;
				this.description = existing.description ?? options.customizeBuiltIn.description;
				this.icon = existing.icon ?? options.customizeBuiltIn.icon;
				this.color = existing.color ?? options.customizeBuiltIn.color;
				this.category = existing.category ?? options.customizeBuiltIn.category;
			} else {
				this.name = options.customizeBuiltIn.name;
				this.description = options.customizeBuiltIn.description;
				this.icon = options.customizeBuiltIn.icon;
				this.color = options.customizeBuiltIn.color;
				this.category = options.customizeBuiltIn.category;
			}
		}
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('cr-event-type-editor-modal');

		const title = this.customizeMode
			? `自定义"${this.builtInDefaults?.name}"`
			: this.editMode
				? '编辑来源类型'
				: '创建来源类型';
		contentEl.createEl('h2', { text: title });

		if (this.customizeMode) {
			const info = contentEl.createDiv({ cls: 'cr-modal-info' });
			info.createEl('p', {
				text: '自定义该内置类型。更改仅影响显示；现有笔记仍可正常工作。',
				cls: 'crc-text-muted'
			});
		}

		// Name
		new Setting(contentEl)
			.setName('名称')
			.setDesc('该来源类型的显示名称')
			.addText(text => text
				.setPlaceholder('例如：税务记录')
				.setValue(this.name)
				.onChange(value => {
					this.name = value;
					// Auto-generate ID from name if creating new
					if (!this.editMode && !this.customizeMode) {
						this.id = this.slugify(value);
					}
					updateColorPreview();
				}));

		// ID (only for new types, not editable for existing or customizations)
		if (!this.editMode && !this.customizeMode) {
			new Setting(contentEl)
				.setName('ID')
				.setDesc('唯一标识符（用于 frontmatter）')
				.addText(text => text
					.setPlaceholder('tax_record')
					.setValue(this.id)
					.onChange(value => this.id = this.slugify(value)));
		}

		// Description
		new Setting(contentEl)
			.setName('描述')
			.setDesc('该来源类型的简要描述')
			.addText(text => text
				.setPlaceholder('例如：财产税与所得税记录')
				.setValue(this.description)
				.onChange(value => this.description = value));

		// Category (only for new types and editing user types)
		if (!this.customizeMode) {
			new Setting(contentEl)
				.setName('分类')
				.setDesc('将该类型与相似的来源归为一组')
				.addDropdown(dropdown => {
					// Get all categories (built-in + custom, with customizations and hiding)
					const categories = getAllSourceCategories(
						this.plugin.settings.customSourceCategories || [],
						this.plugin.settings.sourceCategoryCustomizations,
						this.plugin.settings.hiddenSourceCategories
					);
					categories.forEach(cat => {
						dropdown.addOption(cat.id, cat.name);
					});
					dropdown.setValue(this.category);
					dropdown.onChange(value => {
						this.category = value;
					});
				});
		}

		// Color picker
		const colorSetting = new Setting(contentEl)
			.setName('颜色')
			.setDesc('该来源类型的徽章颜色');

		const colorContainer = colorSetting.controlEl.createDiv({ cls: 'cr-color-picker' });

		// Color input
		const colorInput = colorContainer.createEl('input', {
			type: 'color',
			value: this.color,
			cls: 'cr-color-input'
		});
		colorInput.addEventListener('input', (e) => {
			this.color = (e.target as HTMLInputElement).value;
			updateColorPreview();
		});

		// Color presets
		const presetsContainer = colorContainer.createDiv({ cls: 'cr-color-presets' });
		COLOR_PRESETS.forEach(preset => {
			const presetBtn = presetsContainer.createEl('button', { cls: 'cr-color-preset' });
			presetBtn.style.setProperty('background-color', preset);
			presetBtn.addEventListener('click', (e) => {
				e.preventDefault();
				this.color = preset;
				colorInput.value = preset;
				updateColorPreview();
			});
		});

		// Color preview
		const colorPreview = colorContainer.createDiv({ cls: 'cr-color-preview' });
		const updateColorPreview = () => {
			colorPreview.style.setProperty('background-color', this.color);
			colorPreview.style.setProperty('color', this.getContrastColor(this.color));
			colorPreview.textContent = this.name || '预览';
		};
		updateColorPreview();

		// Icon picker
		const iconSetting = new Setting(contentEl)
			.setName('图标')
			.setDesc('与该来源类型一起显示的图标');

		const iconContainer = iconSetting.controlEl.createDiv({ cls: 'cr-icon-picker' });

		// Current icon preview
		const currentIconContainer = iconContainer.createDiv({ cls: 'cr-current-icon' });
		const iconPreview = currentIconContainer.createSpan({ cls: 'cr-icon-preview' });
		setLucideIcon(iconPreview, this.icon);

		// Icon grid
		const iconGrid = iconContainer.createDiv({ cls: 'cr-icon-grid' });
		ICON_SUGGESTIONS.forEach(iconName => {
			const iconBtn = iconGrid.createEl('button', { cls: 'cr-icon-option' });
			setLucideIcon(iconBtn, iconName);
			iconBtn.setAttribute('title', iconName);
			if (iconName === this.icon) {
				iconBtn.addClass('is-selected');
			}
			iconBtn.addEventListener('click', (e) => {
				e.preventDefault();
				this.icon = iconName;
				// Update selection
				iconGrid.querySelectorAll('.cr-icon-option').forEach(btn => {
					btn.removeClass('is-selected');
				});
				iconBtn.addClass('is-selected');
				iconPreview.empty();
				setLucideIcon(iconPreview, iconName);
			});
		});

		// Buttons
		const buttonContainer = contentEl.createDiv({ cls: 'cr-modal-buttons' });

		// Reset button for customizations
		if (this.customizeMode) {
			const resetBtn = buttonContainer.createEl('button', { text: '重置为默认' });
			resetBtn.addEventListener('click', () => void this.resetToDefault());
		}

		const cancelBtn = buttonContainer.createEl('button', { text: '取消' });
		cancelBtn.addEventListener('click', () => this.close());

		const saveBtn = buttonContainer.createEl('button', {
			text: this.customizeMode ? '保存自定义' : this.editMode ? '保存更改' : '创建类型',
			cls: 'mod-cta'
		});
		saveBtn.addEventListener('click', () => void this.saveType());
	}

	onClose(): void {
		const { contentEl } = this;
		contentEl.empty();
	}

	private async saveType(): Promise<void> {
		// Validation
		if (!this.name.trim()) {
			new Notice('请输入名称');
			return;
		}

		if (!this.customizeMode && !this.id.trim()) {
			new Notice('请输入 ID');
			return;
		}

		try {
			if (this.customizeMode) {
				// Save as customization of built-in type
				await this.saveCustomization();
			} else if (this.editMode) {
				// Update existing user type
				await this.updateUserType();
			} else {
				// Create new user type
				await this.createUserType();
			}

			this.close();
			this.onSave();
		} catch (error) {
			new Notice(`保存来源类型失败：${error}`);
		}
	}

	private async saveCustomization(): Promise<void> {
		// Initialize customizations if needed
		if (!this.plugin.settings.sourceTypeCustomizations) {
			this.plugin.settings.sourceTypeCustomizations = {};
		}

		const builtIn = this.builtInDefaults!;
		const customization: Partial<SourceTypeDefinition> = {};

		// Only store properties that differ from built-in defaults
		if (this.name !== builtIn.name) customization.name = this.name.trim();
		if (this.description !== builtIn.description) customization.description = this.description.trim();
		if (this.icon !== builtIn.icon) customization.icon = this.icon;
		if (this.color !== builtIn.color) customization.color = this.color;

		if (Object.keys(customization).length > 0) {
			this.plugin.settings.sourceTypeCustomizations[this.id] = customization;
		} else {
			// No customizations - remove any existing
			delete this.plugin.settings.sourceTypeCustomizations[this.id];
		}

		await this.plugin.saveSettings();
		new Notice('来源类型已自定义');
	}

	private async updateUserType(): Promise<void> {
		const existingTypes = this.plugin.settings.customSourceTypes;
		const index = existingTypes.findIndex(t => t.id === this.originalId);

		if (index !== -1) {
			existingTypes[index] = {
				id: this.id,
				name: this.name.trim(),
				description: this.description.trim(),
				icon: this.icon,
				color: this.color,
				category: this.category,
				isBuiltIn: false
			};
		}

		await this.plugin.saveSettings();
		new Notice('来源类型已更新');
	}

	private async createUserType(): Promise<void> {
		// Check for ID conflicts
		const existingTypes = this.plugin.settings.customSourceTypes;
		const builtInConflict = BUILT_IN_SOURCE_TYPES.find(t => t.id === this.id);
		const customConflict = existingTypes.find(t => t.id === this.id);

		if (builtInConflict || customConflict) {
			new Notice('已存在使用该 ID 的来源类型');
			return;
		}

		const typeDef: SourceTypeDefinition = {
			id: this.id,
			name: this.name.trim(),
			description: this.description.trim(),
			icon: this.icon,
			color: this.color,
			category: this.category,
			isBuiltIn: false
		};

		existingTypes.push(typeDef);
		await this.plugin.saveSettings();
		new Notice('来源类型已创建');
	}

	private async resetToDefault(): Promise<void> {
		if (!this.customizeMode || !this.builtInDefaults) return;

		// Remove customization
		if (this.plugin.settings.sourceTypeCustomizations) {
			delete this.plugin.settings.sourceTypeCustomizations[this.id];
		}

		await this.plugin.saveSettings();
		new Notice('已重置为默认');
		this.close();
		this.onSave();
	}

	private slugify(text: string): string {
		return text
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '_')
			.replace(/^_+|_+$/g, '')
			.substring(0, 50);
	}

	private getContrastColor(hexColor: string): string {
		const hex = hexColor.replace('#', '');
		const r = parseInt(hex.substring(0, 2), 16);
		const g = parseInt(hex.substring(2, 4), 16);
		const b = parseInt(hex.substring(4, 6), 16);
		const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
		return luminance > 0.5 ? '#000000' : '#ffffff';
	}
}