/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access -- Obsidian API returns any-typed surfaces (frontmatter, file caches, plugin state); project policy accepts these. */
/**
 * Base Template Methods
 *
 * Extracted from main.ts — creates .base template files for different entity types.
 * Each method follows the same pattern: check availability, resolve path, create file.
 */

import { Notice, TFile, TFolder, Modal } from 'obsidian';
import type CanvasRootsPlugin from '../../main';
import { getLogger } from '../core/logging';
import { getErrorMessage } from '../core/error-utils';
import { generatePeopleBaseTemplate } from '../constants/base-template';
import { generatePlacesBaseTemplate } from '../constants/places-base-template';
import { ORGANIZATIONS_BASE_TEMPLATE } from '../constants/organizations-base-template';
import { SOURCES_BASE_TEMPLATE } from '../constants/sources-base-template';
import { UNIVERSES_BASE_TEMPLATE } from '../constants/universes-base-template';
import { NOTES_BASE_TEMPLATE } from '../constants/notes-base-template';
import { RESEARCH_BASE_TEMPLATE } from '../constants/research-base-template';
import { generateEventsBaseTemplate } from '../constants/events-base-template';

const logger = getLogger('BaseTemplates');

/**
 * Check if Bases feature is available in Obsidian
 */
function isBasesAvailable(plugin: CanvasRootsPlugin): boolean {
	const baseFiles = plugin.app.vault.getFiles().filter(f => f.extension === 'base');
	// @ts-expect-error - accessing internal plugins
	const basesInternalPlugin = plugin.app.internalPlugins?.plugins?.['bases'];
	return baseFiles.length > 0 || (basesInternalPlugin?.enabled === true);
}

/**
 * Confirm base creation if Bases plugin may not be installed
 */
function confirmBaseCreation(plugin: CanvasRootsPlugin): Promise<boolean> {
	return new Promise((resolve) => {
		const modal = new Modal(plugin.app);
		modal.titleEl.setText('未检测到 Bases 插件');

		modal.contentEl.createEl('p', {
			text: '似乎未安装 Obsidian Bases 插件。将创建 .base 文件，但你需要安装 Bases 插件才能使用它。'
		});

		modal.contentEl.createEl('p', {
			text: '仍要创建该模板吗？',
			cls: 'cr-confirm-text'
		});

		const buttonContainer = modal.contentEl.createDiv({ cls: 'cr-prompt-buttons' });

		const createBtn = buttonContainer.createEl('button', {
			text: '仍然创建',
			cls: 'mod-cta'
		});
		createBtn.addEventListener('click', () => {
			modal.close();
			resolve(true);
		});

		const cancelBtn = buttonContainer.createEl('button', {
			text: '取消'
		});
		cancelBtn.addEventListener('click', () => {
			modal.close();
			resolve(false);
		});

		modal.open();
	});
}

/**
 * Helper to resolve the target path for a base template, creating the folder if needed
 */
async function resolveBasePath(
	plugin: CanvasRootsPlugin,
	fileName: string,
	folder?: TFolder
): Promise<{ path: string; existing: TFile | null } | null> {
	// Check availability and confirm if needed
	if (!isBasesAvailable(plugin)) {
		const proceed = await confirmBaseCreation(plugin);
		if (!proceed) return null;
	}

	const targetFolder = plugin.settings.basesFolder || (folder ? folder.path : '');
	const folderPath = targetFolder ? targetFolder + '/' : '';
	const defaultPath = folderPath + fileName;

	// Create the bases folder if it doesn't exist
	if (plugin.settings.basesFolder && !plugin.app.vault.getAbstractFileByPath(plugin.settings.basesFolder)) {
		await plugin.app.vault.createFolder(plugin.settings.basesFolder);
	}

	const existingFile = plugin.app.vault.getAbstractFileByPath(defaultPath);
	if (existingFile instanceof TFile) {
		return { path: defaultPath, existing: existingFile };
	}

	return { path: defaultPath, existing: null };
}

/**
 * Create a base template file, opening it if it already exists
 */
async function createBaseFile(
	plugin: CanvasRootsPlugin,
	fileName: string,
	templateContent: string,
	displayName: string,
	viewCount: string,
	folder?: TFolder
): Promise<void> {
	try {
		const resolved = await resolveBasePath(plugin, fileName, folder);
		if (!resolved) return;

		if (resolved.existing) {
			new Notice(`${displayName} base 模板已存在于 ${resolved.path}`);
			const leaf = plugin.app.workspace.getLeaf(false);
			await leaf.openFile(resolved.existing);
			return;
		}

		const file = await plugin.app.vault.create(resolved.path, templateContent);
		new Notice(`${displayName} base 模板已创建，包含 ${viewCount} 个预配置视图！`);
		logger.info('base-template', `Created ${displayName.toLowerCase()} base template at ${resolved.path}`);

		const leaf = plugin.app.workspace.getLeaf(false);
		await leaf.openFile(file);
	} catch (error: unknown) {
		const errorMsg = getErrorMessage(error);
		logger.error('base-template', `Failed to create ${displayName.toLowerCase()} base template`, error);

		if (errorMsg.includes('already exists')) {
			new Notice('已存在同名文件。');
		} else if (errorMsg.includes('permission') || errorMsg.includes('EACCES')) {
			new Notice('权限被拒绝。请检查文件系统权限。');
		} else if (errorMsg.includes('ENOSPC')) {
			new Notice('磁盘已满。请释放空间后重试。');
		} else {
			new Notice(`创建 ${displayName} base 模板失败：${errorMsg}`);
		}
	}
}

export async function createBaseTemplate(plugin: CanvasRootsPlugin, folder?: TFolder): Promise<void> {
	const templateContent = generatePeopleBaseTemplate({
		aliases: plugin.settings.propertyAliases,
		maxLivingAge: plugin.settings.livingPersonAgeThreshold
	});
	await createBaseFile(plugin, 'people.base', templateContent, '人物', '22', folder);
}

export async function createPlacesBaseTemplate(plugin: CanvasRootsPlugin, folder?: TFolder): Promise<void> {
	const templateContent = generatePlacesBaseTemplate(plugin.settings.propertyAliases);
	await createBaseFile(plugin, 'places.base', templateContent, '地点', '14', folder);
}

export async function createOrganizationsBaseTemplate(plugin: CanvasRootsPlugin, folder?: TFolder): Promise<void> {
	await createBaseFile(plugin, 'organizations.base', ORGANIZATIONS_BASE_TEMPLATE, '组织', '17', folder);
}

export async function createSourcesBaseTemplate(plugin: CanvasRootsPlugin, folder?: TFolder): Promise<void> {
	await createBaseFile(plugin, 'sources.base', SOURCES_BASE_TEMPLATE, '来源', '18', folder);
}

export async function createUniversesBaseTemplate(plugin: CanvasRootsPlugin, folder?: TFolder): Promise<void> {
	await createBaseFile(plugin, 'universes.base', UNIVERSES_BASE_TEMPLATE, '宇宙', '12', folder);
}

export async function createNotesBaseTemplate(plugin: CanvasRootsPlugin, folder?: TFolder): Promise<void> {
	await createBaseFile(plugin, 'notes.base', NOTES_BASE_TEMPLATE, '笔记', '11', folder);
}

export async function createResearchBaseTemplate(plugin: CanvasRootsPlugin, folder?: TFolder): Promise<void> {
	await createBaseFile(plugin, 'research.base', RESEARCH_BASE_TEMPLATE, '研究', '12', folder);
}

export async function createEventsBaseTemplate(plugin: CanvasRootsPlugin, folder?: TFolder): Promise<void> {
	const templateContent = generateEventsBaseTemplate(plugin.settings.propertyAliases);
	await createBaseFile(plugin, 'events.base', templateContent, '事件', '20', folder);
}

/**
 * Create all base templates at once
 * Silently skips bases that already exist
 */
export async function createAllBases(
	plugin: CanvasRootsPlugin,
	options?: { silent?: boolean }
): Promise<{ created: string[]; skipped: string[] }> {
	const created: string[] = [];
	const skipped: string[] = [];
	const silent = options?.silent ?? false;

	// In interactive mode, confirm with user if Bases feature isn't already in use
	if (!silent && !isBasesAvailable(plugin)) {
		const proceed = await confirmBaseCreation(plugin);
		if (!proceed) return { created, skipped };
	}

	// Determine the target folder
	const targetFolder = plugin.settings.basesFolder || '';
	const folderPath = targetFolder ? targetFolder + '/' : '';

	// Create the bases folder if it doesn't exist
	if (plugin.settings.basesFolder && !plugin.app.vault.getAbstractFileByPath(plugin.settings.basesFolder)) {
		await plugin.app.vault.createFolder(plugin.settings.basesFolder);
	}

	// Define all base types with their templates
	const baseTypes = [
		{ name: 'people', file: 'people.base', generator: () => generatePeopleBaseTemplate(plugin.settings.propertyAliases) },
		{ name: 'places', file: 'places.base', generator: () => generatePlacesBaseTemplate(plugin.settings.propertyAliases) },
		{ name: 'events', file: 'events.base', generator: () => generateEventsBaseTemplate(plugin.settings.propertyAliases) },
		{ name: 'organizations', file: 'organizations.base', generator: () => ORGANIZATIONS_BASE_TEMPLATE },
		{ name: 'sources', file: 'sources.base', generator: () => SOURCES_BASE_TEMPLATE },
		{ name: 'research', file: 'research.base', generator: () => RESEARCH_BASE_TEMPLATE },
	];

	for (const baseType of baseTypes) {
		const filePath = folderPath + baseType.file;
		const existingFile = plugin.app.vault.getAbstractFileByPath(filePath);

		if (existingFile) {
			skipped.push(baseType.name);
		} else {
			try {
				const content = baseType.generator();
				await plugin.app.vault.create(filePath, content);
				created.push(baseType.name);
			} catch (error: unknown) {
				logger.error('create-all-bases', `Failed to create ${baseType.name} base`, error);
				skipped.push(baseType.name);
			}
		}
	}

	if (!silent) {
		if (created.length > 0) {
			new Notice(`已创建 ${created.length} 个 base：${created.join(', ')}`);
		}
		if (skipped.length > 0 && created.length === 0) {
			new Notice('所有 base 均已存在');
		}
	}

	logger.info('create-all-bases', `Created: ${created.join(', ') || 'none'}, Skipped: ${skipped.join(', ') || 'none'}`);
	return { created, skipped };
}

/* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access -- Match scope of file-level disable at top. */
