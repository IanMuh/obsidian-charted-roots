/**
 * Relationship Type Manager Card
 *
 * A card component for the Relationships tab that displays all relationship types
 * with options to customize, hide, and create new types.
 */

import { Notice, Modal, Setting } from 'obsidian';
import type CanvasRootsPlugin from '../../../main';
import type { LucideIconName } from '../../ui/lucide-icons';
import {
	DEFAULT_RELATIONSHIP_TYPES,
	BUILT_IN_RELATIONSHIP_CATEGORIES,
	getAllRelationshipTypesWithCustomizations,
	getAllRelationshipCategories,
	isBuiltInRelationshipCategory
} from '../constants/default-relationship-types';
import type { RelationshipTypeDefinition, RelationshipCategoryDefinition } from '../types/relationship-types';
import { RelationshipTypeEditorModal } from './relationship-type-editor-modal';

/**
 * Render the Relationship Type Manager card
 */
export function renderRelationshipTypeManagerCard(
	container: HTMLElement,
	plugin: CanvasRootsPlugin,
	createCard: (options: { title: string; icon?: LucideIconName; subtitle?: string }) => HTMLElement,
	onRefresh: () => void
): void {
	const card = createCard({
		title: '管理关系类型',
		icon: 'sliders',
		subtitle: '自定义、隐藏或创建关系类型'
	});
	const content = card.querySelector('.crc-card__content') as HTMLElement;

	// Create relationship type button
	new Setting(content)
		.setName('创建关系类型')
		.setDesc('定义新的自定义关系类型')
		.addButton(button => button
			.setButtonText('创建')
			.setCta()
			.onClick(() => {
				const modal = new RelationshipTypeEditorModal(plugin.app, plugin, {
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
		.setDesc('创建用于组织关系类型的新分类')
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
		.setDesc('切换默认关系类型的可见性')
		.addToggle(toggle => toggle
			.setValue(plugin.settings.showBuiltInRelationshipTypes !== false)
			.onChange(async (value) => {
				plugin.settings.showBuiltInRelationshipTypes = value;
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
		const categories = getAllRelationshipCategories(
			plugin.settings.customRelationshipCategories || [],
			plugin.settings.relationshipCategoryCustomizations,
			plugin.settings.hiddenRelationshipCategories
		);

		// Refresh data
		const types = getAllRelationshipTypesWithCustomizations(
			plugin.settings.customRelationshipTypes || [],
			plugin.settings.showBuiltInRelationshipTypes !== false,
			plugin.settings.relationshipTypeCustomizations,
			[] // Show all including hidden
		);

		const hiddenTypes = new Set(plugin.settings.hiddenRelationshipTypes || []);
		const hiddenCats = new Set(plugin.settings.hiddenRelationshipCategories || []);
		const customizedIds = new Set(Object.keys(plugin.settings.relationshipTypeCustomizations || {}));
		const customizedCatIds = new Set(Object.keys(plugin.settings.relationshipCategoryCustomizations || {}));

		// Group by category
		const byCategory: Record<string, RelationshipTypeDefinition[]> = {};
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
			const isBuiltIn = isBuiltInRelationshipCategory(category.id);
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
					text: '此分类中没有类型',
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
					plugin.settings.hiddenRelationshipCategories = [];
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
					plugin.settings.hiddenRelationshipTypes = [];
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
	type: RelationshipTypeDefinition,
	isHidden: boolean,
	isCustomized: boolean,
	plugin: CanvasRootsPlugin,
	onUpdate: () => void
): void {
	const row = tbody.createEl('tr', {
		cls: `crc-type-row ${isHidden ? 'is-hidden' : ''}`
	});

	// Color swatch cell
	const swatchCell = row.createEl('td', { cls: 'crc-type-cell-icon' });
	const swatchContainer = swatchCell.createDiv({ cls: 'crc-type-color-swatch' });
	swatchContainer.style.setProperty('background-color', type.color);

	// Name cell
	const nameCell = row.createEl('td', { cls: 'crc-type-cell-name' });
	nameCell.createEl('span', { text: type.name });

	// Line style cell
	const styleCell = row.createEl('td', { cls: 'crc-type-cell-style' });
	styleCell.createEl('span', {
		text: type.lineStyle,
		cls: 'crc-text-muted'
	});

	// Inverse/symmetric cell
	const inverseCell = row.createEl('td', { cls: 'crc-type-cell-inverse' });
	if (type.symmetric) {
		inverseCell.createEl('span', { text: '对称', cls: 'crc-text-muted' });
	} else if (type.inverse) {
		inverseCell.createEl('span', { text: `→ ${type.inverse}`, cls: 'crc-text-muted' });
	}

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
		text: type.builtIn ? '自定义' : '编辑',
		cls: 'crc-btn crc-btn--small'
	});
	editBtn.addEventListener('click', (e) => {
		e.stopPropagation();
		if (type.builtIn) {
			const builtIn = DEFAULT_RELATIONSHIP_TYPES.find(t => t.id === type.id);
			if (builtIn) {
				const modal = new RelationshipTypeEditorModal(plugin.app, plugin, {
					customizeBuiltIn: builtIn,
					onSave: onUpdate
				});
				modal.open();
			}
		} else {
			const modal = new RelationshipTypeEditorModal(plugin.app, plugin, {
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
			const hidden = plugin.settings.hiddenRelationshipTypes || [];
			if (isHidden) {
				plugin.settings.hiddenRelationshipTypes = hidden.filter(id => id !== type.id);
			} else {
				hidden.push(type.id);
				plugin.settings.hiddenRelationshipTypes = hidden;
			}
			await plugin.saveSettings();
			onUpdate();
		})();
	});

	// Reset button for customized built-in types
	if (type.builtIn && isCustomized) {
		const resetBtn = actionsWrapper.createEl('button', {
			text: '重置',
			cls: 'crc-btn crc-btn--small'
		});
		resetBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			void (async () => {
				if (plugin.settings.relationshipTypeCustomizations) {
					delete plugin.settings.relationshipTypeCustomizations[type.id];
				}
				await plugin.saveSettings();
				onUpdate();
			})();
		});
	}

	// Delete button for custom types
	if (!type.builtIn) {
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
	type: RelationshipTypeDefinition,
	onUpdate: () => void
): void {
	const modal = new Modal(plugin.app);
	modal.titleEl.setText('删除关系类型');
	modal.contentEl.createEl('p', {
		text: `确定要删除"${type.name}"吗？使用此类型的现有笔记仍可正常工作，但该类型将不再出现在下拉菜单中。`
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
			plugin.settings.customRelationshipTypes = plugin.settings.customRelationshipTypes.filter(
				t => t.id !== type.id
			);
			// Also remove from hidden if it was hidden
			plugin.settings.hiddenRelationshipTypes = (plugin.settings.hiddenRelationshipTypes || []).filter(
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
	category: RelationshipCategoryDefinition | null,
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
			text: '自定义此内置分类。你可以重命名它或更改其位置。',
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
		placeholder: '例如：历史'
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
		value: String(category?.sortOrder ?? (plugin.settings.customRelationshipCategories?.length || 0) + 5)
	});
	orderInput.addClass('crc-form-input');

	// Buttons
	const buttonContainer = modal.contentEl.createDiv({ cls: 'modal-button-container' });

	// Reset button for built-in categories
	if (isBuiltIn && category) {
		const hasCustomization = plugin.settings.relationshipCategoryCustomizations?.[category.id];
		if (hasCustomization) {
			const resetBtn = buttonContainer.createEl('button', { text: '重置为默认' });
			resetBtn.addEventListener('click', () => {
				void (async () => {
					if (plugin.settings.relationshipCategoryCustomizations) {
						delete plugin.settings.relationshipCategoryCustomizations[category.id];
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
				new Notice('请输入分类名称');
				return;
			}

			const sortOrder = parseInt(orderInput.value) || 0;

			if (isBuiltIn && category) {
				// Save as customization of built-in category
				if (!plugin.settings.relationshipCategoryCustomizations) {
					plugin.settings.relationshipCategoryCustomizations = {};
				}

				// Get the original built-in definition
				const builtInDef = BUILT_IN_RELATIONSHIP_CATEGORIES.find(c => c.id === category.id);
				const customization: Partial<RelationshipCategoryDefinition> = {};

				// Only store properties that differ from built-in defaults
				if (builtInDef && name !== builtInDef.name) customization.name = name;
				if (builtInDef && sortOrder !== builtInDef.sortOrder) customization.sortOrder = sortOrder;

				if (Object.keys(customization).length > 0) {
					plugin.settings.relationshipCategoryCustomizations[category.id] = customization;
				} else {
					// No customizations - remove any existing
					delete plugin.settings.relationshipCategoryCustomizations[category.id];
				}

				await plugin.saveSettings();
				modal.close();
				new Notice('已自定义分类');
				onSave();
			} else if (isEditing && category) {
				// Update existing custom category
				const existing = plugin.settings.customRelationshipCategories || [];
				plugin.settings.customRelationshipCategories = existing.map(c =>
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
				const existing = plugin.settings.customRelationshipCategories || [];
				const builtInConflict = BUILT_IN_RELATIONSHIP_CATEGORIES.some(c => c.id === id);
				if (builtInConflict || existing.some(c => c.id === id)) {
					new Notice('已存在使用此 ID 的分类');
					return;
				}

				plugin.settings.customRelationshipCategories = [...existing, { id, name, sortOrder }];
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
	category: RelationshipCategoryDefinition,
	isBuiltIn: boolean,
	typeCount: number,
	onDelete: () => void
): void {
	const modal = new Modal(plugin.app);
	modal.titleEl.setText(isBuiltIn ? '隐藏分类' : '删除分类');

	if (typeCount > 0) {
		modal.contentEl.createEl('p', {
			text: `此分类包含 ${typeCount} 个类型。${isBuiltIn ? '隐藏' : '删除'}该分类前，必须先移动或删除所有类型。`
		});

		const buttonContainer = modal.contentEl.createDiv({ cls: 'modal-button-container' });
		const okBtn = buttonContainer.createEl('button', { text: '确定', cls: 'mod-cta' });
		okBtn.addEventListener('click', () => modal.close());
	} else {
		if (isBuiltIn) {
			modal.contentEl.createEl('p', {
				text: `确定要隐藏分类"${category.name}"吗？之后可以在设置中恢复。`
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
					// Hide built-in category by adding to hiddenRelationshipCategories
					if (!plugin.settings.hiddenRelationshipCategories) {
						plugin.settings.hiddenRelationshipCategories = [];
					}
					if (!plugin.settings.hiddenRelationshipCategories.includes(category.id)) {
						plugin.settings.hiddenRelationshipCategories.push(category.id);
					}
				} else {
					// Delete custom category
					plugin.settings.customRelationshipCategories = (plugin.settings.customRelationshipCategories || [])
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