/**
 * Schemas tab for the Control Center
 *
 * Displays schema validation controls, gallery, violations, and statistics.
 */

import { App, ButtonComponent, Menu, MenuItem, Modal, Notice, Setting, TFile, setIcon } from 'obsidian';
import type CanvasRootsPlugin from '../../../main';
import { setLucideIcon, LucideIconName } from '../../ui/lucide-icons';
import { createStatItem } from '../../ui/shared/card-component';
import { SchemaService } from '../services/schema-service';
import { ValidationService } from '../services/validation-service';
import type { SchemaNote, ValidationResult, ValidationSummary } from '../types/schema-types';
import { SchemaValidationProgressModal } from '../../ui/schema-validation-progress-modal';
import { CreateSchemaModal } from '../../ui/create-schema-modal';
import { getErrorMessage } from '../../core/error-utils';

export interface SchemasTabOptions {
	container: HTMLElement;
	plugin: CanvasRootsPlugin;
	app: App;
	createCard: (options: { title: string; icon?: LucideIconName; subtitle?: string }) => HTMLElement;
	showTab: (tabId: string) => void;
	closeModal: () => void;
}

/** Module-level state: persists across re-renders within the modal lifecycle */
let lastValidationResults: ValidationResult[] = [];
let lastValidationSummary: ValidationSummary | null = null;

export async function renderSchemasTab(options: SchemasTabOptions): Promise<void> {
	const { container, plugin, app, createCard, showTab, closeModal } = options;

	// Initialize services
	const schemaService = new SchemaService(plugin);
	const validationService = new ValidationService(plugin, schemaService);

	// Card 1: Validation
	const validationCard = createCard({
		title: '校验库',
		icon: 'clipboard-check',
		subtitle: '根据你的 schema 检查人物笔记'
	});

	const validationContent = validationCard.querySelector('.crc-card__content') as HTMLElement;

	// Explanation for users
	const explanation = validationContent.createDiv({ cls: 'crc-info-callout crc-mb-3' });
	explanation.createEl('p', {
		text: 'Schema 校验会根据你定义的规则检查人物笔记。' +
			'用它来确保必填属性已填写、值类型正确，' +
			'并且数据符合你的标准。',
		cls: 'crc-text--small'
	});

	// Check if there are any schemas
	const hasSchemas = await schemaService.getAllSchemas().then(s => s.length > 0);
	if (!hasSchemas) {
		const noSchemasNote = validationContent.createDiv({ cls: 'crc-empty-state crc-compact' });
		setIcon(noSchemasNote.createSpan({ cls: 'crc-empty-icon' }), 'info');
		noSchemasNote.createEl('p', {
			text: '尚未定义 schema。在下方创建 schema 即可开始校验数据。',
			cls: 'crc-text--muted'
		});
		container.appendChild(validationCard);
	}

	// Only show validation controls if schemas exist
	if (hasSchemas) {
		// Show last validation summary if available
		if (lastValidationSummary) {
			const summaryDiv = validationContent.createDiv({ cls: 'crc-validation-summary crc-mb-3' });
			const summary = lastValidationSummary;

			const statsRow = summaryDiv.createDiv({ cls: 'crc-stats-row' });
			statsRow.createEl('span', {
				text: `上次校验：${summary.validatedAt.toLocaleString()}`,
				cls: 'crc-text--muted crc-text--small'
			});

			const statsGrid = summaryDiv.createDiv({ cls: 'crc-stats-grid crc-mt-2' });
			createStatItem(statsGrid, '人物', summary.totalPeopleValidated.toString(), 'users');
			createStatItem(statsGrid, 'Schema', summary.totalSchemas.toString(), 'clipboard-check');
			createStatItem(statsGrid, '错误', summary.totalErrors.toString(), summary.totalErrors > 0 ? 'alert-circle' : 'check');
			createStatItem(statsGrid, '警告', summary.totalWarnings.toString(), 'alert-triangle');
		}

		// Validate vault button
		new Setting(validationContent)
			.setName('运行校验')
			.setDesc('根据你的 schema 检查所有人物笔记')
			.addButton(button => button
				.setButtonText('校验')
				.setCta()
				.onClick(() => void (async () => {
			// Open progress modal
			const progressModal = new SchemaValidationProgressModal(app);
			progressModal.open();

			try {
				// Run validation with progress callback
				lastValidationResults = await validationService.validateVault(
					(progress) => progressModal.updateProgress(progress)
				);
				lastValidationSummary = validationService.getSummary(lastValidationResults);

				// Mark complete and close after a short delay
				progressModal.markComplete(lastValidationSummary);
				window.setTimeout(() => {
					progressModal.close();
					// Refresh the tab to show updated results
					container.empty();
					void renderSchemasTab(options);
				}, 1500);

				const errorCount = lastValidationSummary.totalErrors;
				if (errorCount === 0) {
					new Notice('✓ 校验通过！未发现 schema 违规。');
				} else {
					new Notice(`发现 ${errorCount} 个校验错误`);
				}
			} catch (error) {
				progressModal.close();
				new Notice('校验失败：' + getErrorMessage(error));
			}
		})()));
	}

	container.appendChild(validationCard);

	// Card 2: Schemas Gallery
	const schemasCard = createCard({
		title: 'Schema',
		icon: 'file-check',
		subtitle: '为人物笔记定义校验规则'
	});

	const schemasContent = schemasCard.querySelector('.crc-card__content') as HTMLElement;

	// Create schema button
	new Setting(schemasContent)
		.setName('创建 schema')
		.setDesc('为人物笔记定义新的校验 schema')
		.addButton(button => button
			.setButtonText('创建')
			.setCta()
			.onClick(() => {
				new CreateSchemaModal(app, plugin, {
					onCreated: () => {
						void loadSchemasGallery(app, plugin, schemaService, validationService, schemasGridContainer, closeModal);
					}
				}).open();
			}));

	// Import schema button
	new Setting(schemasContent)
		.setName('导入 schema')
		.setDesc('从 JSON 文件导入 schema')
		.addButton(button => button
			.setButtonText('导入')
			.onClick(() => {
				importSchemaFromJson(app, plugin, schemaService, validationService, schemasGridContainer, closeModal);
			}));

	// Gallery section
	const gallerySection = schemasContent.createDiv({ cls: 'cr-schema-gallery-section' });
	gallerySection.createEl('h4', { text: '图库', cls: 'cr-schema-gallery-heading' });

	const schemasGridContainer = gallerySection.createDiv();
	schemasGridContainer.createEl('p', {
		text: '正在加载 schema…',
		cls: 'crc-text--muted'
	});

	container.appendChild(schemasCard);

	// Load schemas asynchronously
	void loadSchemasGallery(app, plugin, schemaService, validationService, schemasGridContainer, closeModal);

	// Card 3: Recent Violations
	if (lastValidationResults.length > 0) {
		const violationsCard = createCard({
		title: '近期违规',
		icon: 'alert-circle',
		subtitle: '上次校验中发现的问题'
		});

		const violationsContent = violationsCard.querySelector('.crc-card__content') as HTMLElement;
		renderRecentViolations(violationsContent, app, showTab, closeModal);

		container.appendChild(violationsCard);
	}

	// Card 4: Schema Statistics
	const statsCard = createCard({
		title: '统计',
		icon: 'bar-chart',
		subtitle: 'Schema 概览'
	});

	const statsContent = statsCard.querySelector('.crc-card__content') as HTMLElement;
	await renderSchemaStatistics(statsContent, schemaService);

	container.appendChild(statsCard);
}

/**
 * Load schemas into the gallery
 */
async function loadSchemasGallery(
	app: App,
	plugin: CanvasRootsPlugin,
	schemaService: SchemaService,
	validationService: ValidationService,
	container: HTMLElement,
	closeModal: () => void
): Promise<void> {
	container.empty();

	const schemas = await schemaService.getAllSchemas();

	if (schemas.length === 0) {
		const emptyState = container.createDiv({ cls: 'crc-empty-state' });
		emptyState.createEl('p', {
			text: '未找到 schema。',
			cls: 'crc-text--muted'
		});
		emptyState.createEl('p', {
			text: '创建 schema 以为人物笔记定义校验规则。',
			cls: 'crc-text--muted crc-text--small'
		});
		return;
	}

	// Create list of schemas
	const list = container.createEl('ul', { cls: 'crc-schema-list' });

	for (const schema of schemas) {
		const item = list.createEl('li', { cls: 'crc-schema-list-item' });

		// Schema info
		const info = item.createDiv({ cls: 'crc-schema-info' });
		const nameRow = info.createDiv({ cls: 'crc-schema-name-row' });

		nameRow.createEl('span', { text: schema.name, cls: 'crc-schema-name' });

		// Scope badge
		nameRow.createEl('span', {
			text: formatSchemaScope(schema),
			cls: 'crc-badge crc-badge--muted'
		});

		if (schema.description) {
			info.createEl('div', { text: schema.description, cls: 'crc-schema-desc crc-text--muted crc-text--small' });
		}

		// Properties count
		const propCount = Object.keys(schema.definition.properties).length;
		const reqCount = schema.definition.requiredProperties.length;
		const constraintCount = schema.definition.constraints.length;
		info.createEl('div', {
			text: `${propCount} 个属性，${reqCount} 个必填，${constraintCount} 个约束`,
			cls: 'crc-text--muted crc-text--small'
		});

		// Action buttons
		const actions = item.createDiv({ cls: 'crc-schema-actions' });

		// Edit button
		const editBtn = actions.createEl('button', {
			cls: 'crc-btn crc-btn--icon',
			attr: { 'aria-label': '编辑 schema' }
		});
		setLucideIcon(editBtn, 'edit', 14);
		editBtn.addEventListener('click', () => {
			new CreateSchemaModal(app, plugin, {
				editSchema: schema,
				onUpdated: () => {
					void loadSchemasGallery(app, plugin, schemaService, validationService, container, closeModal);
				}
			}).open();
		});

		// More options button
		const moreBtn = actions.createEl('button', {
			cls: 'crc-btn crc-btn--icon',
			attr: { 'aria-label': '更多选项' }
		});
		setLucideIcon(moreBtn, 'more-vertical', 14);
		moreBtn.addEventListener('click', (e) => {
			showSchemaContextMenu(app, plugin, schema, schemaService, validationService, container, closeModal, e);
		});

		// Click to open note
		item.addEventListener('click', (e) => {
			if ((e.target as HTMLElement).closest('.crc-schema-actions')) return;
			const file = app.vault.getAbstractFileByPath(schema.filePath);
			if (file instanceof TFile) {
				void app.workspace.getLeaf(false).openFile(file);
				closeModal();
			}
		});
	}
}

/**
 * Format schema scope for display
 */
function formatSchemaScope(schema: SchemaNote): string {
	switch (schema.appliesToType) {
		case 'all':
			return '所有人物';
		case 'collection':
			return `合集：${schema.appliesToValue}`;
		case 'folder':
			return `文件夹：${schema.appliesToValue}`;
		case 'universe':
			return `宇宙：${schema.appliesToValue}`;
		default:
			return schema.appliesToType;
	}
}

/**
 * Show context menu for a schema
 */
function showSchemaContextMenu(
	app: App,
	plugin: CanvasRootsPlugin,
	schema: SchemaNote,
	schemaService: SchemaService,
	validationService: ValidationService,
	galleryContainer: HTMLElement,
	closeModal: () => void,
	event: MouseEvent
): void {
	const menu = new Menu();

	menu.addItem((item: MenuItem) => {
		item
			.setTitle('编辑 schema')
			.setIcon('edit')
			.onClick(() => {
				new CreateSchemaModal(app, plugin, {
					editSchema: schema,
					onUpdated: () => {
						void loadSchemasGallery(app, plugin, schemaService, validationService, galleryContainer, closeModal);
					}
				}).open();
			});
	});

	menu.addItem((item: MenuItem) => {
		item
			.setTitle('校验匹配的笔记')
			.setIcon('play')
			.onClick(async () => {
				const progressModal = new SchemaValidationProgressModal(app);
				progressModal.open();

				try {
					const results = await validationService.validateForSchema(
						schema,
						(progress) => progressModal.updateProgress(progress)
					);
					const summary = validationService.getSummary(results);

					// Update module-level state so violations tab shows results
					lastValidationResults = results;
					lastValidationSummary = summary;

					progressModal.markComplete(summary);

					const errorCount = summary.totalErrors;
					if (errorCount === 0) {
						new Notice(`Schema"${schema.name}"：未发现违规。`);
					} else {
						new Notice(`Schema"${schema.name}"：发现 ${errorCount} 个错误。`);
					}
				} catch (error) {
					progressModal.close();
					new Notice('校验失败：' + getErrorMessage(error));
				}
			});
	});

	menu.addItem((item: MenuItem) => {
		item
			.setTitle('复制 schema')
			.setIcon('copy')
			.onClick(async () => {
				try {
					await schemaService.duplicateSchema(schema.cr_id);
					new Notice(`已复制 schema：${schema.name}（副本）`);
					void loadSchemasGallery(app, plugin, schemaService, validationService, galleryContainer, closeModal);
				} catch (error) {
					new Notice('复制 schema 失败：' + getErrorMessage(error));
				}
			});
	});

	menu.addItem((item: MenuItem) => {
		item
			.setTitle('导出为 JSON')
			.setIcon('download')
			.onClick(async () => {
				try {
					const json = await schemaService.exportSchemaAsJson(schema.cr_id);
					await navigator.clipboard.writeText(json);
					new Notice('Schema JSON 已复制到剪贴板');
				} catch (error) {
					new Notice('导出 schema 失败：' + getErrorMessage(error));
				}
			});
	});

	menu.addSeparator();

	menu.addItem((item: MenuItem) => {
		item
			.setTitle('打开笔记')
			.setIcon('file-text')
			.onClick(async () => {
				const file = app.vault.getAbstractFileByPath(schema.filePath);
				if (file instanceof TFile) {
					await app.workspace.getLeaf(false).openFile(file);
					closeModal();
				}
			});
	});

	menu.addItem((item: MenuItem) => {
		item
			.setTitle('删除 schema')
			.setIcon('trash')
			.onClick(async () => {
				const confirmed = await confirmSchemaDelete(app, schema.name);
				if (confirmed) {
					try {
						await schemaService.deleteSchema(schema.cr_id);
						new Notice(`已删除 schema：${schema.name}`);
						void loadSchemasGallery(app, plugin, schemaService, validationService, galleryContainer, closeModal);
					} catch (error) {
						new Notice('删除 schema 失败：' + getErrorMessage(error));
					}
				}
			});
	});

	menu.showAtMouseEvent(event);
}

/**
 * Confirm schema deletion
 */
async function confirmSchemaDelete(app: App, schemaName: string): Promise<boolean> {
	return new Promise((resolve) => {
		const modal = new Modal(app);
		modal.titleEl.setText('删除 schema？');

		modal.contentEl.createEl('p', {
			text: `确定要删除 schema"${schemaName}"吗？`
		});
		modal.contentEl.createEl('p', {
			text: '这将删除 schema 笔记文件。此操作无法撤销。',
			cls: 'crc-text--muted'
		});

		const buttonContainer = modal.contentEl.createDiv({ cls: 'crc-button-row crc-mt-3' });

		new ButtonComponent(buttonContainer)
			.setButtonText('取消')
			.onClick(() => {
				modal.close();
				resolve(false);
			});

		const deleteBtn = buttonContainer.createEl('button', {
			text: '删除',
			cls: 'mod-warning'
		});
		deleteBtn.addEventListener('click', () => {
			modal.close();
			resolve(true);
		});

		modal.open();
	});
}

/**
 * Import a schema from JSON
 */
function importSchemaFromJson(
	app: App,
	plugin: CanvasRootsPlugin,
	schemaService: SchemaService,
	validationService: ValidationService,
	galleryContainer: HTMLElement,
	closeModal: () => void
): void {
	const modal = new Modal(app);
	modal.titleEl.setText('从 JSON 导入 schema');

	const textarea = modal.contentEl.createEl('textarea', {
		cls: 'crc-form-textarea crc-form-textarea--code',
		attr: {
			placeholder: '在此粘贴 schema JSON…',
			rows: '10'
		}
	});

	const buttonContainer = modal.contentEl.createDiv({ cls: 'crc-button-row crc-mt-3' });

	new ButtonComponent(buttonContainer)
		.setButtonText('取消')
		.onClick(() => modal.close());

	new ButtonComponent(buttonContainer)
		.setButtonText('导入')
		.setCta()
		.onClick(() => void (async () => {
			const json = textarea.value.trim();
			if (!json) {
				new Notice('请粘贴 schema JSON');
				return;
			}

			try {
				await schemaService.importSchemaFromJson(json);
				new Notice('Schema 导入成功');
				modal.close();
				void loadSchemasGallery(app, plugin, schemaService, validationService, galleryContainer, closeModal);
			} catch (error) {
				new Notice('导入 schema 失败：' + getErrorMessage(error));
			}
		})());

	modal.open();
}

/**
 * Render recent validation violations
 */
function renderRecentViolations(
	container: HTMLElement,
	app: App,
	showTab: (tabId: string) => void,
	closeModal: () => void
): void {
	const invalidResults = lastValidationResults.filter(r => !r.isValid);

	if (invalidResults.length === 0) {
		container.createEl('p', {
			text: '上次校验未发现违规。',
			cls: 'crc-text--muted'
		});
		return;
	}

	// Show top 10 violations
	const topViolations = invalidResults.slice(0, 10);
	const list = container.createEl('ul', { cls: 'crc-violations-list' });

	for (const result of topViolations) {
		const item = list.createEl('li', { cls: 'crc-violation-item crc-clickable' });

		const header = item.createDiv({ cls: 'crc-violation-header' });
		header.createEl('span', { text: result.personName, cls: 'crc-violation-person' });
		header.createEl('span', {
			text: `(${result.schemaName})`,
			cls: 'crc-text--muted crc-text--small'
		});

		const errorList = item.createEl('ul', { cls: 'crc-error-list' });
		for (const error of result.errors.slice(0, 3)) {
			errorList.createEl('li', {
				text: error.message,
				cls: 'crc-text--error crc-text--small'
			});
		}

		if (result.errors.length > 3) {
			errorList.createEl('li', {
				text: `…另有 ${result.errors.length - 3} 条`,
				cls: 'crc-text--muted crc-text--small'
			});
		}

		// Click to open person note
		item.addEventListener('click', () => {
			const file = app.vault.getAbstractFileByPath(result.filePath);
			if (file instanceof TFile) {
				void app.workspace.getLeaf(false).openFile(file);
				closeModal();
			}
		});
	}

	if (invalidResults.length > 10) {
		container.createEl('p', {
			text: `…另有 ${invalidResults.length - 10} 条违规`,
			cls: 'crc-text--muted crc-mt-2'
		});
	}

	// Link to Data Quality tab
	const linkDiv = container.createDiv({ cls: 'crc-mt-2' });
	const viewAllLink = linkDiv.createEl('a', {
		text: '在数据质量中查看全部 →',
		cls: 'crc-link'
	});
	viewAllLink.addEventListener('click', () => {
		showTab('data-quality');
	});
}

/**
 * Render schema statistics
 */
async function renderSchemaStatistics(container: HTMLElement, schemaService: SchemaService): Promise<void> {
	const stats = await schemaService.getStats();

	const statsGrid = container.createDiv({ cls: 'crc-stats-grid' });

	createStatItem(statsGrid, 'Schema 总数', stats.totalSchemas.toString(), 'clipboard-check');
	createStatItem(statsGrid, '全局（全部）', stats.byScope.all.toString(), 'globe');
	createStatItem(statsGrid, '按合集', stats.byScope.collection.toString(), 'folder');
	createStatItem(statsGrid, '按文件夹', stats.byScope.folder.toString(), 'folder');
	createStatItem(statsGrid, '按宇宙', stats.byScope.universe.toString(), 'globe');

	// Error breakdown from last validation
	if (lastValidationSummary && lastValidationSummary.totalErrors > 0) {
		container.createEl('h4', { text: '上次校验的错误类型', cls: 'crc-section-title crc-mt-3' });

		const errorGrid = container.createDiv({ cls: 'crc-stats-grid' });
		const errorsByType = lastValidationSummary.errorsByType;

		if (errorsByType.missing_required > 0) {
			createStatItem(errorGrid, '缺少必填项', errorsByType.missing_required.toString(), 'alert-circle');
		}
		if (errorsByType.invalid_type > 0) {
			createStatItem(errorGrid, '类型无效', errorsByType.invalid_type.toString(), 'alert-circle');
		}
		if (errorsByType.invalid_enum > 0) {
			createStatItem(errorGrid, '枚举值无效', errorsByType.invalid_enum.toString(), 'alert-circle');
		}
		if (errorsByType.out_of_range > 0) {
			createStatItem(errorGrid, '超出范围', errorsByType.out_of_range.toString(), 'alert-circle');
		}
		if (errorsByType.constraint_failed > 0) {
			createStatItem(errorGrid, '约束失败', errorsByType.constraint_failed.toString(), 'alert-circle');
		}
		if (errorsByType.conditional_required > 0) {
			createStatItem(errorGrid, '条件必填', errorsByType.conditional_required.toString(), 'alert-circle');
		}
		if (errorsByType.invalid_wikilink_target > 0) {
			createStatItem(errorGrid, 'wikilink 无效', errorsByType.invalid_wikilink_target.toString(), 'alert-circle');
		}
	}
}