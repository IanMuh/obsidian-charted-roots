/**
 * Source Type Manager Card
 *
 * A card component for the Sources tab that displays all source types
 * with options to customize, hide, and create new types.
 */

import { Notice, Modal, Setting } from 'obsidian';
import type CanvasRootsPlugin from '../../../main';
import type { LucideIconName } from '../../ui/lucide-icons';
import { getContrastColor } from '../../ui/create-person-types';
import { setLucideIcon } from '../../ui/lucide-icons';
import {
	BUILT_IN_SOURCE_TYPES,
	BUILT_IN_SOURCE_CATEGORIES,
	getAllSourceTypesWithCustomizations,
	getAllSourceCategories,
	isBuiltInSourceCategory,
	type SourceTypeDefinition,
	type SourceCategoryDefinition
} from '../types/source-types';
import { SourceTypeEditorModal } from './source-type-editor-modal';

/**
 * Render the Source Type Manager card
 */
export function renderSourceTypeManagerCard(
	container: HTMLElement,
	plugin: CanvasRootsPlugin,
	createCard: (options: { title: string; icon?: LucideIconName; subtitle?: string }) => HTMLElement,
	onRefresh: () => void
): void {
	const card = createCard({
		title: '管理来源类型',
		icon: 'sliders',
		subtitle: '自定义、隐藏或创建来源类型'
	});
	const content = card.querySelector('.crc-card__content') as HTMLElement;

	// Create source type button
	new Setting(content)
		.setName('创建来源类型')
		.setDesc('定义新的自定义来源类型')
		.addButton(button => button
			.setButtonText('创建')
			.setCta()
			.onClick(() => {
				const modal = new SourceTypeEditorModal(plugin.app, plugin, {
					onSave: () => {
						renderTypeList();
						onRefresh();
					}
				});
				modal.open();
			}));

	// Add category button
	new Setting(content)
		.setName('添加分类')
		.setDesc('创建用于组织来源类型的新分类')
		.addButton(button => button
			.setButtonText('添加')
			.onClick(() => {
				openCategoryEditor(plugin, null, false, () => {
					renderTypeList();
					onRefresh();
				});
			}));

	// Toggle built-in types
	new Setting(content)
		.setName('显示内置类型')
		.setDesc('切换默认来源类型的可见性')
		.addToggle(toggle => toggle
			.setValue(plugin.settings.showBuiltInSourceTypes !== false)
			.onChange(async (value) => {
				plugin.settings.showBuiltInSourceTypes = value;
				await plugin.saveSettings();
				renderTypeList();
				onRefresh();
			}));

	// Type list container
	const listContainer = content.createDiv({ cls: 'crc-type-manager-list' });

	// Render the type list as a table
	const renderTypeList = () => {
		listContainer.empty();

		// Get all categories (built-in + custom, with customizations and hiding)
		const categories = getAllSourceCategories(
			plugin.settings.customSourceCategories || [],
			plugin.settings.sourceCategoryCustomizations,
			plugin.settings.hiddenSourceCategories
		);

		// Refresh data
		const types = getAllSourceTypesWithCustomizations(
			plugin.settings.customSourceTypes || [],
			plugin.settings.showBuiltInSourceTypes !== false,
			plugin.settings.sourceTypeCustomizations,
			[] // Show all including hidden
		);

		const hiddenTypes = new Set(plugin.settings.hiddenSourceTypes || []);
		const hiddenCats = new Set(plugin.settings.hiddenSourceCategories || []);
		const customizedIds = new Set(Object.keys(plugin.settings.sourceTypeCustomizations || {}));
		const customizedCatIds = new Set(Object.keys(plugin.settings.sourceCategoryCustomizations || {}));

		// Group by category
		const byCategory: Record<string, SourceTypeDefinition[]> = {};
		for (const cat of categories) {
			byCategory[cat.id] = [];
		}
		for (const type of types) {
			if (!byCategory[type.category]) {
				byCategory[type.category] = [];
			}
			byCategory[type.category].push(type);
		}

		// Render each category as a table section
		for (const category of categories) {
			const categoryTypes = byCategory[category.id] || [];
			const isBuiltIn = isBuiltInSourceCategory(category.id);
			const isCatCustomized = customizedCatIds.has(category.id);

			// Show section even if empty (so user can edit/delete)
			const categorySection = listContainer.createDiv({ cls: 'crc-type-category' });

			// Category header with actions for ALL categories
			const headerRow = categorySection.createDiv({ cls: 'crc-type-category-header' });
			const headingEl = headerRow.createEl('h4', {
				text: category.name,
				cls: 'crc-type-category-heading'
			});

			// Show customized badge for built-in categories
			if (isBuiltIn && isCatCustomized) {
				headingEl.createEl('span', {
					text: '（已自定义）',
					cls: 'crc-text-muted crc-type-category-badge'
				});
			}

			// Add edit/delete buttons for ALL categories
			const actionsContainer = headerRow.createDiv({ cls: 'crc-type-category-actions' });

			const editCatBtn = actionsContainer.createEl('button', {
				text: isBuiltIn ? '自定义' : '编辑',
				cls: 'crc-btn crc-btn--small'
			});
			editCatBtn.addEventListener('click', () => {
				openCategoryEditor(plugin, category, isBuiltIn, () => {
					renderTypeList();
					onRefresh();
				});
			});

			const deleteCatBtn = actionsContainer.createEl('button', {
				text: isBuiltIn ? '隐藏' : '删除',
				cls: 'crc-btn crc-btn--small crc-btn--danger'
			});
			deleteCatBtn.addEventListener('click', () => {
				confirmDeleteCategory(plugin, category, isBuiltIn, categoryTypes.length, () => {
					renderTypeList();
					onRefresh();
				});
			});

			if (categoryTypes.length > 0) {
				// Create table
				const table = categorySection.createEl('table', { cls: 'crc-type-table' });
				const tbody = table.createEl('tbody');

				for (const type of categoryTypes) {
					const isHidden = hiddenTypes.has(type.id);
					const isCustomized = customizedIds.has(type.id);

					renderTypeRow(tbody, type, isHidden, isCustomized, plugin, () => {
						renderTypeList();
						onRefresh();
					});
				}
			} else {
				categorySection.createEl('p', {
					text: '该分类中没有类型',
					cls: 'crc-text-muted crc-type-empty-category'
				});
			}
		}

		// Show hidden categories count (for restoring)
		if (hiddenCats.size > 0) {
			const hiddenCatsInfo = listContainer.createDiv({ cls: 'crc-hidden-types-info' });
			hiddenCatsInfo.createEl('span', {
				text: `已隐藏 ${hiddenCats.size} 个分类`,
				cls: 'crc-text-muted'
			});

			const showAllCatsBtn = hiddenCatsInfo.createEl('button', {
				text: '全部显示',
				cls: 'crc-btn-link'
			});
			showAllCatsBtn.addEventListener('click', () => {
				void (async () => {
					plugin.settings.hiddenSourceCategories = [];
					await plugin.saveSettings();
					renderTypeList();
					onRefresh();
				})();
			});
		}

		// Show hidden types count
		if (hiddenTypes.size > 0) {
			const hiddenInfo = listContainer.createDiv({ cls: 'crc-hidden-types-info' });
			hiddenInfo.createEl('span', {
				text: `已隐藏 ${hiddenTypes.size} 个类型`,
				cls: 'crc-text-muted'
			});

			const showAllBtn = hiddenInfo.createEl('button', {
				text: '全部显示',
				cls: 'crc-btn-link'
			});
			showAllBtn.addEventListener('click', () => {
				void (async () => {
					plugin.settings.hiddenSourceTypes = [];
					await plugin.saveSettings();
					renderTypeList();
					onRefresh();
				})();
			});
		}
	};

	renderTypeList();
	container.appendChild(card);
}

/**
 * Render a single type row in the table
 */
function renderTypeRow(
	tbody: HTMLElement,
	type: SourceTypeDefinition,
	isHidden: boolean,
	isCustomized: boolean,
	plugin: CanvasRootsPlugin,
	onUpdate: () => void
): void {
	const row = tbody.createEl('tr', {
		cls: `crc-type-row ${isHidden ? 'is-hidden' : ''}`
	});

	// Icon/color cell
	const iconCell = row.createEl('td', { cls: 'crc-type-cell-icon' });
	const iconContainer = iconCell.createDiv({ cls: 'crc-type-icon-swatch' });
	iconContainer.style.setProperty('background-color', type.color);
	iconContainer.style.setProperty('color', getContrastColor(type.color));
	setLucideIcon(iconContainer, type.icon, 14);

	// Name cell
	const nameCell = row.createEl('td', { cls: 'crc-type-cell-name' });
	nameCell.createEl('span', { text: type.name });

	// Status cell (badges)
	const statusCell = row.createEl('td', { cls: 'crc-type-cell-status' });
	if (isCustomized) {
		statusCell.createEl('span', { text: '已自定义', cls: 'crc-type-badge crc-type-badge--customized' });
	}
	if (isHidden) {
		statusCell.createEl('span', { text: '已隐藏', cls: 'crc-type-badge crc-type-badge--hidden' });
	}

	// Actions cell
	const actionsCell = row.createEl('td', { cls: 'crc-type-cell-actions' });
	const actionsWrapper = actionsCell.createDiv({ cls: 'crc-type-actions-wrapper' });

	// Edit/Customize button
	const editBtn = actionsWrapper.createEl('button', {
		text: type.isBuiltIn ? '自定义' : '编辑',
		cls: 'crc-btn crc-btn--small'
	});
	editBtn.addEventListener('click', (e) => {
		e.stopPropagation();
		if (type.isBuiltIn) {
			const builtIn = BUILT_IN_SOURCE_TYPES.find(t => t.id === type.id);
			if (builtIn) {
				const modal = new SourceTypeEditorModal(plugin.app, plugin, {
					customizeBuiltIn: builtIn,
					onSave: onUpdate
				});
				modal.open();
			}
		} else {
			const modal = new SourceTypeEditorModal(plugin.app, plugin, {
				editType: type,
				onSave: onUpdate
			});
			modal.open();
		}
	});

	// Hide/Show button
	const hideBtn = actionsWrapper.createEl('button', {
		text: isHidden ? '显示' : '隐藏',
		cls: 'crc-btn crc-btn--small crc-btn--danger'
	});
	hideBtn.addEventListener('click', (e) => {
		e.stopPropagation();
		void (async () => {
			const hidden = plugin.settings.hiddenSourceTypes || [];
			if (isHidden) {
				plugin.settings.hiddenSourceTypes = hidden.filter(id => id !== type.id);
			} else {
				hidden.push(type.id);
				plugin.settings.hiddenSourceTypes = hidden;
			}
			await plugin.saveSettings();
			onUpdate();
		})();
	});

	// Reset button for customized built-in types
	if (type.isBuiltIn && isCustomized) {
		const resetBtn = actionsWrapper.createEl('button', {
			text: '重置',
			cls: 'crc-btn crc-btn--small'
		});
		resetBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			void (async () => {
				if (plugin.settings.sourceTypeCustomizations) {
					delete plugin.settings.sourceTypeCustomizations[type.id];
				}
				await plugin.saveSettings();
				onUpdate();
			})();
		});
	}

	// Delete button for custom types
	if (!type.isBuiltIn) {
		const deleteBtn = actionsWrapper.createEl('button', {
			text: '删除',
			cls: 'crc-btn crc-btn--small crc-btn--danger'
		});
		deleteBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			confirmDeleteType(plugin, type, onUpdate);
		});
	}
}

/**
 * Confirm and delete a user-defined type
 */
function confirmDeleteType(
	plugin: CanvasRootsPlugin,
	type: SourceTypeDefinition,
	onUpdate: () => void
): void {
	const modal = new Modal(plugin.app);
	modal.titleEl.setText('删除来源类型');
	modal.contentEl.createEl('p', {
		text: `确定要删除"${type.name}"吗？使用该类型的现有来源笔记仍可正常工作，但该类型将不再出现在下拉列表中。`
	});

	const buttonContainer = modal.contentEl.createDiv({ cls: 'modal-button-container' });

	const cancelBtn = buttonContainer.createEl('button', { text: '取消' });
	cancelBtn.addEventListener('click', () => modal.close());

	const deleteBtn = buttonContainer.createEl('button', {
		text: '删除',
		cls: 'mod-warning'
	});
	deleteBtn.addEventListener('click', () => {
		void (async () => {
			plugin.settings.customSourceTypes = plugin.settings.customSourceTypes.filter(
				t => t.id !== type.id
			);
			// Also remove from hidden if it was hidden
			plugin.settings.hiddenSourceTypes = (plugin.settings.hiddenSourceTypes || []).filter(
				id => id !== type.id
			);
			await plugin.saveSettings();
			modal.close();
			new Notice(`已删除"${type.name}"`);
			onUpdate();
		})();
	});

	modal.open();
}

/**
 * Open category editor modal
 * Supports editing both custom and built-in categories
 */
function openCategoryEditor(
	plugin: CanvasRootsPlugin,
	category: SourceCategoryDefinition | null,
	isBuiltIn: boolean,
	onSave: () => void
): void {
	const modal = new Modal(plugin.app);
	const isEditing = category !== null;

	modal.titleEl.setText(
		isBuiltIn
			? `自定义"${category?.name}"`
			: isEditing
				? '编辑分类'
				: '创建分类'
	);

	if (isBuiltIn) {
		const info = modal.contentEl.createDiv({ cls: 'cr-modal-info' });
		info.createEl('p', {
			text: '自定义该内置分类。你可以重命名它或更改其位置。',
			cls: 'crc-text-muted'
		});
	}

	// Name field
	const nameRow = modal.contentEl.createDiv({ cls: 'setting-item' });
	nameRow.createDiv({ cls: 'setting-item-info' }).createDiv({
		cls: 'setting-item-name',
		text: '名称'
	});
	const nameInput = nameRow.createDiv({ cls: 'setting-item-control' }).createEl('input', {
		type: 'text',
		value: category?.name || '',
		placeholder: '例如：政府档案'
	});
	nameInput.addClass('crc-form-input');

	// Sort order field
	const orderRow = modal.contentEl.createDiv({ cls: 'setting-item' });
	orderRow.createDiv({ cls: 'setting-item-info' }).createDiv({
		cls: 'setting-item-name',
		text: '排序顺序'
	});
	const orderInput = orderRow.createDiv({ cls: 'setting-item-control' }).createEl('input', {
		type: 'number',
		value: String(category?.sortOrder ?? (plugin.settings.customSourceCategories?.length || 0) + 7)
	});
	orderInput.addClass('crc-form-input');

	// Buttons
	const buttonContainer = modal.contentEl.createDiv({ cls: 'modal-button-container' });

	// Reset button for built-in categories
	if (isBuiltIn && category) {
		const hasCustomization = plugin.settings.sourceCategoryCustomizations?.[category.id];
		if (hasCustomization) {
			const resetBtn = buttonContainer.createEl('button', { text: '重置为默认' });
			resetBtn.addEventListener('click', () => {
				void (async () => {
					if (plugin.settings.sourceCategoryCustomizations) {
						delete plugin.settings.sourceCategoryCustomizations[category.id];
					}
					await plugin.saveSettings();
					modal.close();
					new Notice('已重置为默认');
					onSave();
				})();
			});
		}
	}

	const cancelBtn = buttonContainer.createEl('button', { text: '取消' });
	cancelBtn.addEventListener('click', () => modal.close());

	const saveBtn = buttonContainer.createEl('button', {
		text: isBuiltIn ? '保存自定义' : isEditing ? '保存' : '创建',
		cls: 'mod-cta'
	});
	saveBtn.addEventListener('click', () => {
		void (async () => {
			const name = nameInput.value.trim();
			if (!name) {
				new Notice('分类名称为必填项');
				return;
			}

			const sortOrder = parseInt(orderInput.value) || 0;

			if (isBuiltIn && category) {
				// Save as customization of built-in category
				if (!plugin.settings.sourceCategoryCustomizations) {
					plugin.settings.sourceCategoryCustomizations = {};
				}

				// Get the original built-in definition
				const builtInDef = BUILT_IN_SOURCE_CATEGORIES.find(c => c.id === category.id);
				const customization: Partial<SourceCategoryDefinition> = {};

				// Only store properties that differ from built-in defaults
				if (builtInDef && name !== builtInDef.name) customization.name = name;
				if (builtInDef && sortOrder !== builtInDef.sortOrder) customization.sortOrder = sortOrder;

				if (Object.keys(customization).length > 0) {
					plugin.settings.sourceCategoryCustomizations[category.id] = customization;
				} else {
					// No customizations - remove any existing
					delete plugin.settings.sourceCategoryCustomizations[category.id];
				}

				await plugin.saveSettings();
				modal.close();
				new Notice('分类已自定义');
				onSave();
			} else if (isEditing && category) {
				// Update existing custom category
				const existing = plugin.settings.customSourceCategories || [];
				plugin.settings.customSourceCategories = existing.map(c =>
					c.id === category.id ? { id: c.id, name, sortOrder } : c
				);
				await plugin.saveSettings();
				modal.close();
				new Notice(`已更新"${name}"`);
				onSave();
			} else {
				// Create new custom category
				const id = name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');

				// Check for duplicate ID
				const existing = plugin.settings.customSourceCategories || [];
				const builtInConflict = BUILT_IN_SOURCE_CATEGORIES.some(c => c.id === id);
				if (builtInConflict || existing.some(c => c.id === id)) {
					new Notice('已存在使用该 ID 的分类');
					return;
				}

				plugin.settings.customSourceCategories = [...existing, { id, name, sortOrder }];
				await plugin.saveSettings();
				modal.close();
				new Notice(`已创建"${name}"`);
				onSave();
			}
		})();
	});

	modal.open();
}

/**
 * Confirm and delete a category
 * Supports both custom and built-in categories
 */
function confirmDeleteCategory(
	plugin: CanvasRootsPlugin,
	category: SourceCategoryDefinition,
	isBuiltIn: boolean,
	typeCount: number,
	onDelete: () => void
): void {
	const modal = new Modal(plugin.app);
	modal.titleEl.setText(isBuiltIn ? '隐藏分类' : '删除分类');

	if (typeCount > 0) {
		modal.contentEl.createEl('p', {
			text: `该分类包含 ${typeCount} 个类型。你必须先移动或删除所有类型，才能${isBuiltIn ? '隐藏' : '删除'}该分类。`
		});

		const buttonContainer = modal.contentEl.createDiv({ cls: 'modal-button-container' });
		const okBtn = buttonContainer.createEl('button', { text: '确定', cls: 'mod-cta' });
		okBtn.addEventListener('click', () => modal.close());
	} else {
		if (isBuiltIn) {
			modal.contentEl.createEl('p', {
				text: `确定要隐藏分类"${category.name}"吗？之后你可以在设置中恢复它。`
			});
		} else {
			modal.contentEl.createEl('p', {
				text: `确定要删除分类"${category.name}"吗？`
			});
		}

		const buttonContainer = modal.contentEl.createDiv({ cls: 'modal-button-container' });

		const cancelBtn = buttonContainer.createEl('button', { text: '取消' });
		cancelBtn.addEventListener('click', () => modal.close());

		const deleteBtn = buttonContainer.createEl('button', {
			text: isBuiltIn ? '隐藏' : '删除',
			cls: 'mod-warning'
		});
		deleteBtn.addEventListener('click', () => {
			void (async () => {
				if (isBuiltIn) {
					// Hide built-in category by adding to hiddenSourceCategories
					if (!plugin.settings.hiddenSourceCategories) {
						plugin.settings.hiddenSourceCategories = [];
					}
					if (!plugin.settings.hiddenSourceCategories.includes(category.id)) {
						plugin.settings.hiddenSourceCategories.push(category.id);
					}
				} else {
					// Delete custom category
					plugin.settings.customSourceCategories = (plugin.settings.customSourceCategories || [])
						.filter(c => c.id !== category.id);
				}
				await plugin.saveSettings();
				modal.close();
				new Notice(isBuiltIn ? `已隐藏"${category.name}"` : `已删除"${category.name}"`);
				onDelete();
			})();
		});
	}

	modal.open();
}