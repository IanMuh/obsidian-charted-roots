/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument -- Obsidian API returns any-typed surfaces (frontmatter, file caches, plugin state); project policy accepts these. */
import { Notice, TFile, TFolder, Modal } from 'obsidian';
import type CanvasRootsPlugin from '../../main';
import { FolderStatisticsModal } from '../ui/folder-statistics-modal';
import { getErrorMessage } from '../core/error-utils';
import { ExcalidrawExporter } from '../excalidraw/excalidraw-exporter';
import { generateCrId } from '../core/uuid';
import { ReferenceNumberingService } from '../core/reference-numbering';
import type { NumberingSystem } from '../core/reference-numbering';
import { LineageTrackingService } from '../core/lineage-tracking';
import type { LineageType } from '../core/lineage-tracking';
import { TreePreviewRenderer } from '../ui/tree-preview';
import { extractWikilinkPath } from '../utils/wikilink-resolver';
import { GeocodingService } from '../maps/services/geocoding-service';
import { SourcePickerModal, CreateSourceModal, CitationGeneratorModal } from '../sources';
import { createUniverseService, EditUniverseModal } from '../universes';
import { MediaManageModal } from '../core/ui/media-manage-modal';
import { createSmartWikilink } from '../core/person-note-writer';
import { getLogger } from '../core/logging';

const logger = getLogger('context-menu-helpers');

export async function confirmDeleteEvent(plugin: CanvasRootsPlugin, eventTitle: string): Promise<boolean> {
	return new Promise((resolve) => {
		const modal = new Modal(plugin.app);
		modal.titleEl.setText('删除事件');
		modal.contentEl.createEl('p', {
			text: `确定要删除「${eventTitle}」吗？此操作无法撤销。`
		});

		const buttonContainer = modal.contentEl.createDiv({ cls: 'modal-button-container' });

		const cancelBtn = buttonContainer.createEl('button', { text: '取消' });
		cancelBtn.addEventListener('click', () => {
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

export async function confirmDeleteUniverse(plugin: CanvasRootsPlugin, universeName: string): Promise<boolean> {
	return new Promise((resolve) => {
		const modal = new Modal(plugin.app);
		modal.titleEl.setText('删除宇宙');
		modal.contentEl.createEl('p', {
			text: `确定要删除「${universeName}」吗？此操作无法撤销。`
		});
		modal.contentEl.createEl('p', {
			text: '注意：这不会删除与此宇宙关联的实体。',
			cls: 'mod-warning'
		});

		const buttonContainer = modal.contentEl.createDiv({ cls: 'modal-button-container' });

		const cancelBtn = buttonContainer.createEl('button', { text: '取消' });
		cancelBtn.addEventListener('click', () => {
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

export async function promptParentType(plugin: CanvasRootsPlugin): Promise<'father' | 'mother' | null> {
	return new Promise((resolve) => {
		const modal = new Modal(plugin.app);
		modal.titleEl.setText('选择父母类型');

		modal.contentEl.createEl('p', {
			text: '此人是父亲还是母亲？'
		});

		const buttonContainer = modal.contentEl.createDiv({ cls: 'cr-prompt-buttons' });

		const fatherBtn = buttonContainer.createEl('button', {
			text: '父亲',
			cls: 'mod-cta'
		});
		fatherBtn.addEventListener('click', () => {
			modal.close();
			resolve('father');
		});

		const motherBtn = buttonContainer.createEl('button', {
			text: '母亲',
			cls: 'mod-cta'
		});
		motherBtn.addEventListener('click', () => {
			modal.close();
			resolve('mother');
		});

		const cancelBtn = buttonContainer.createEl('button', {
			text: '取消'
		});
		cancelBtn.addEventListener('click', () => {
			modal.close();
			resolve(null);
		});

		modal.open();
	});
}

export async function promptSetCollectionName(plugin: CanvasRootsPlugin, file: TFile): Promise<void> {
	// Get current group_name if it exists
	const cache = plugin.app.metadataCache.getFileCache(file);
	const currentCollectionName = cache?.frontmatter?.group_name || '';

	return new Promise((resolve) => {
		const modal = new Modal(plugin.app);
		modal.titleEl.setText('设置分组名称');

		modal.contentEl.createEl('p', {
			text: '为此关联分组输入名称（家族、派系、组织等）：'
		});

		const inputContainer = modal.contentEl.createDiv({ cls: 'setting-item-control' });
		const input = inputContainer.createEl('input', {
			type: 'text',
			placeholder: '例如 "Smith 家族"、"Stark 家族"、"议会"',
			value: currentCollectionName,
			cls: 'cr-prompt-input'
		});

		modal.contentEl.createEl('p', {
			text: '留空以移除分组名称。',
			cls: 'cr-help-text'
		});

		const buttonContainer = modal.contentEl.createDiv({ cls: 'cr-prompt-buttons' });

		const saveBtn = buttonContainer.createEl('button', {
			text: '保存',
			cls: 'mod-cta'
		});
		saveBtn.addEventListener('click', () => {
			void (async () => {
				const collectionName = input.value.trim();

				// Update or remove group_name in frontmatter
				await plugin.app.fileManager.processFrontMatter(file, (frontmatter) => {
					if (collectionName) {
						frontmatter.group_name = collectionName;
					} else {
						delete frontmatter.group_name;
					}
				});

				new Notice(collectionName
					? `分组名称已设置为「${collectionName}」`
					: '分组名称已移除'
				);

				modal.close();
				resolve();
			})();
		});

		const cancelBtn = buttonContainer.createEl('button', {
			text: '取消'
		});
		cancelBtn.addEventListener('click', () => {
			modal.close();
			resolve();
		});

		// Allow Enter key to save
		input.addEventListener('keydown', (e) => {
			if (e.key === 'Enter') {
				saveBtn.click();
			} else if (e.key === 'Escape') {
				cancelBtn.click();
			}
		});

		modal.open();

		// Focus the input
		window.setTimeout(() => {
			input.focus();
			input.select();
		}, 50);
	});
}

export async function promptSetCollection(plugin: CanvasRootsPlugin, file: TFile): Promise<void> {
	// Get current collection if it exists
	const cache = plugin.app.metadataCache.getFileCache(file);
	const currentCollection = cache?.frontmatter?.collection || '';

	return new Promise((resolve) => {
		const modal = new Modal(plugin.app);
		modal.titleEl.setText('设置合集');

		modal.contentEl.createEl('p', {
			text: '输入一个合集以组织此人物（例如 "父系血脉"、"Stark 家族"、"1800 年代分支"）：'
		});

		const inputContainer = modal.contentEl.createDiv({ cls: 'setting-item-control' });
		const input = inputContainer.createEl('input', {
			type: 'text',
			placeholder: '例如 "父系血脉"、"母系分支"',
			value: currentCollection,
			cls: 'cr-prompt-input'
		});

		modal.contentEl.createEl('p', {
			text: '合集可让你跨家族分组组织人物。留空以移除。',
			cls: 'cr-help-text'
		});

		const buttonContainer = modal.contentEl.createDiv({ cls: 'cr-prompt-buttons' });

		const saveBtn = buttonContainer.createEl('button', {
			text: '保存',
			cls: 'mod-cta'
		});
		saveBtn.addEventListener('click', () => {
			void (async () => {
				const collection = input.value.trim();

				// Update or remove collection in frontmatter
				await plugin.app.fileManager.processFrontMatter(file, (frontmatter) => {
					if (collection) {
						frontmatter.collection = collection;
					} else {
						delete frontmatter.collection;
					}
				});

				new Notice(collection
					? `合集已设置为「${collection}」`
					: '合集已移除'
				);

				modal.close();
				resolve();
			})();
		});

		const cancelBtn = buttonContainer.createEl('button', {
			text: '取消'
		});
		cancelBtn.addEventListener('click', () => {
			modal.close();
			resolve();
		});

		// Allow Enter key to save
		input.addEventListener('keydown', (e) => {
			if (e.key === 'Enter') {
				saveBtn.click();
			} else if (e.key === 'Escape') {
				cancelBtn.click();
			}
		});

		modal.open();

		// Focus the input
		window.setTimeout(() => {
			input.focus();
			input.select();
		}, 50);
	});
}

export async function linkEntityToEvent(plugin: CanvasRootsPlugin, entityName: string,
	event: import('../events/types/event-types').EventNote,
	fieldName: 'persons' | 'sources'): Promise<void> {
	const wikilink = `[[${entityName}]]`;

	try {
		await plugin.app.fileManager.processFrontMatter(event.file, (frontmatter) => {
			if (!frontmatter[fieldName]) {
				frontmatter[fieldName] = [];
			}
			if (!Array.isArray(frontmatter[fieldName])) {
				frontmatter[fieldName] = [frontmatter[fieldName]];
			}

			const alreadyLinked = frontmatter[fieldName].some((entry: string) => {
				const refName = extractWikilinkPath(entry);
				return refName.toLowerCase() === entityName.toLowerCase();
			});

			if (!alreadyLinked) {
				frontmatter[fieldName].push(wikilink);
					new Notice(`已将 ${entityName} 链接到 ${event.title || event.file.basename}`);
				} else {
					new Notice(`${entityName} 已链接到此事件`);
				}
			});
		} catch (err) {
			new Notice(`将 ${entityName} 链接到事件失败`);
		console.error('linkEntityToEvent error:', err);
	}
}

export async function linkPersonToEvent(plugin: CanvasRootsPlugin, personFile: TFile, personName: string, event: import('../events/types/event-types').EventNote): Promise<void> {
	await linkEntityToEvent(plugin, personName, event, 'persons');
}

export async function linkSourceToEvent(plugin: CanvasRootsPlugin, sourceFile: TFile, event: import('../events/types/event-types').EventNote): Promise<void> {
	await linkEntityToEvent(plugin, sourceFile.basename, event, 'sources');
}

export function addSourceToPersonNote(plugin: CanvasRootsPlugin, file: TFile): void {
	new SourcePickerModal(plugin.app, plugin, {
		onSelect: async (source) => {
			// Write the canonical person-level source shape: two index-aligned
			// arrays, `sources` (wikilinks for display) and `sources_id`
			// (cr_ids for resolution) — exactly what the Edit Person modal
			// reads and writes. Earlier builds of this action wrote a divergent
			// `source` / `source_2` indexed-scalar shape that nothing else in
			// the plugin read, so context-menu-added sources were invisible to
			// the Edit Person modal and re-linking there produced duplicates
			// across multiple fields (#653). Read, dedupe, and append inside
			// processFrontMatter so we act on the live frontmatter rather than a
			// possibly-stale metadata-cache snapshot.
			let alreadyLinked = false;
			await plugin.app.fileManager.processFrontMatter(file, (fm) => {
				const existingIds: string[] = fm.sources_id
					? (Array.isArray(fm.sources_id) ? fm.sources_id.map(String) : [String(fm.sources_id)])
					: [];

				// Dedupe by cr_id (the reliable resolver).
				if (existingIds.includes(source.crId)) {
					alreadyLinked = true;
					return;
				}

				const existingLinks: string[] = fm.sources
					? (Array.isArray(fm.sources) ? fm.sources.map(String) : [String(fm.sources)])
					: [];

				fm.sources = [...existingLinks, createSmartWikilink(source.title, plugin.app, source.crId, 'source')];
				fm.sources_id = [...existingIds, source.crId];
			});

			new Notice(alreadyLinked
				? `来源「${source.title}」已链接到此人物`
				: `已链接来源：${source.title}`);
		}
	}).open();
}

export function openManageMediaModal(plugin: CanvasRootsPlugin, file: TFile, entityType: string, entityName: string): void {
	const mediaService = plugin.getMediaService();
	if (!mediaService) {
		new Notice('媒体服务不可用');
		return;
	}

	// Get existing media from frontmatter
	const cache = plugin.app.metadataCache.getFileCache(file);
	const existingMedia = mediaService.parseMediaProperty(cache?.frontmatter || {});

	new MediaManageModal(
		plugin.app,
		mediaService,
		file,
		existingMedia,
		async (updatedMediaRefs) => {
			await mediaService.updateMediaProperty(file, updatedMediaRefs);
		},
		() => {
			// Re-open the link media modal when "Add media" is clicked
			plugin.openLinkMediaModal(file, entityType, entityName);
		},
		{
			entityName,
			entityType
		}
	).open();
}

export async function geocodeSinglePlace(plugin: CanvasRootsPlugin, file: TFile): Promise<void> {
	const cache = plugin.app.metadataCache.getFileCache(file);
	const fm = cache?.frontmatter;

	if (!fm) {
		new Notice('无法读取地点 frontmatter');
		return;
	}

	// Check if already has coordinates
	if (fm.latitude && fm.longitude) {
		new Notice('地点已有坐标');
		return;
	}

	// Get the place name - prefer full_name, fall back to title or name
	const placeName = fm.full_name || fm.title || fm.name || file.basename;

	if (!placeName) {
		new Notice('无法确定用于地理编码的地点名称');
		return;
	}

	// Get parent place name if available
	let parentName: string | undefined;
	if (fm.parent) {
		const placeGraph = plugin.createPlaceGraphService();
		void placeGraph.reloadCache();
		const parentPlace = placeGraph.getPlaceByCrId(fm.parent);
		parentName = parentPlace?.name;
	}

	new Notice(`正在对「${placeName}」进行地理编码…`);

	const geocodingService = new GeocodingService(plugin.app);
	const result = await geocodingService.geocodeSingle(placeName, parentName);

	if (result.success && result.coordinates) {
		// Update the file with coordinates
		await geocodingService.updatePlaceCoordinates(file, result.coordinates);
		new Notice(`已找到坐标：${result.coordinates.lat.toFixed(4)}, ${result.coordinates.long.toFixed(4)}`);
	} else {
		new Notice(result.error || '找不到此地的坐标');
	}
}

export function openEditSourceModal(plugin: CanvasRootsPlugin, file: TFile): void {
	// Get source data from frontmatter
	const cache = plugin.app.metadataCache.getFileCache(file);
	const fm = cache?.frontmatter;

	if (!fm?.cr_id) {
		new Notice('来源笔记没有 cr_id');
		return;
	}

	// Get source from service
	const sourceService = plugin.getSourceService();
	const source = sourceService.getSourceByPath(file.path);

	if (!source) {
		new Notice('找不到来源数据');
		return;
	}

	// Open the modal in edit mode
	new CreateSourceModal(plugin.app, plugin, {
		editFile: file,
		editSource: source,
		onSuccess: () => {
			new Notice('来源已更新');
		}
	}).open();
}

export function openCitationGenerator(plugin: CanvasRootsPlugin, file: TFile): void {
	// Get source data from frontmatter
	const cache = plugin.app.metadataCache.getFileCache(file);
	const fm = cache?.frontmatter;

	if (!fm?.cr_id) {
		new Notice('来源笔记没有 cr_id');
		return;
	}

	// Get source from service
	const sourceService = plugin.getSourceService();
	const source = sourceService.getSourceByPath(file.path);

	if (!source) {
		new Notice('找不到来源数据');
		return;
	}

	// Open the citation generator modal
	new CitationGeneratorModal(plugin.app, plugin, source).open();
}

export function openEditUniverseModal(plugin: CanvasRootsPlugin, file: TFile): void {
	const cache = plugin.app.metadataCache.getFileCache(file);
	const fm = cache?.frontmatter;

	if (!fm?.cr_id) {
		new Notice('宇宙笔记没有 cr_id');
		return;
	}

	// Get universe from service
	const universeService = createUniverseService(plugin);
	const universe = universeService.getUniverseByFile(file);

	if (!universe) {
		new Notice('找不到宇宙数据');
		return;
	}

	// Open the edit modal
	new EditUniverseModal(plugin.app, plugin, {
		universe,
		file,
		onUpdated: () => {
			new Notice('宇宙已更新');
		}
	}).open();
}

export async function toggleRootPerson(plugin: CanvasRootsPlugin, file: TFile): Promise<void> {
	// Get current root_person status
	const cache = plugin.app.metadataCache.getFileCache(file);
	const isRootPerson = cache?.frontmatter?.root_person === true;

	if (isRootPerson) {
		// Unmarking this person
		await plugin.app.fileManager.processFrontMatter(file, (frontmatter) => {
			delete frontmatter.root_person;
		});
		new Notice('已取消根人物标记');
	} else {
		// Marking this person - first unmark any existing root person
		const familyGraph = plugin.createFamilyGraphService();
		const { allMarked } = familyGraph.getMarkedRootPerson();

		for (const existingRoot of allMarked) {
			if (existingRoot.file.path !== file.path) {
				await plugin.app.fileManager.processFrontMatter(existingRoot.file, (frontmatter) => {
					delete frontmatter.root_person;
				});
			}
		}

		// Now mark the new root person
		await plugin.app.fileManager.processFrontMatter(file, (frontmatter) => {
			frontmatter.root_person = true;
		});

		if (allMarked.length > 0 && allMarked.some(p => p.file.path !== file.path)) {
			new Notice('已标记为根人物（之前的根人物已取消标记）');
		} else {
			new Notice('已标记为根人物');
		}
	}
}

export async function assignReferenceNumbersFromPerson(plugin: CanvasRootsPlugin, file: TFile, system: NumberingSystem): Promise<void> {
	const cache = plugin.app.metadataCache.getFileCache(file);
	const crId = cache?.frontmatter?.cr_id;
	const personName = cache?.frontmatter?.name || file.basename;

	if (!crId) {
		new Notice('无效的人物笔记：缺少 cr_id');
		return;
	}

	try {
		const service = new ReferenceNumberingService(plugin.app);
		let stats;

		new Notice(`正在从 ${personName} 分配 ${system} 编号…`);

		switch (system) {
			case 'ahnentafel':
				stats = await service.assignAhnentafel(crId);
				break;
			case 'daboville':
				stats = await service.assignDAboville(crId);
				break;
			case 'henry':
				stats = await service.assignHenry(crId);
				break;
			case 'generation':
				stats = await service.assignGeneration(crId);
				break;
		}

		new Notice(`已从 ${stats.rootPerson} 分配 ${stats.totalAssigned} 个 ${system} 编号`);
	} catch (error) {
		logger.error('reference-numbering', `Failed to assign ${system} numbers`, error);
		new Notice(`分配编号失败：${getErrorMessage(error)}`);
	}
}

export async function assignLineageFromPerson(plugin: CanvasRootsPlugin, file: TFile, type: LineageType): Promise<void> {
	const cache = plugin.app.metadataCache.getFileCache(file);
	const crId = cache?.frontmatter?.cr_id;
	const personName = cache?.frontmatter?.name || file.basename;

	if (!crId) {
		new Notice('无效的人物笔记：缺少 cr_id');
		return;
	}

	// Prompt for lineage name
	const lineageName = await promptLineageName(plugin, personName);
	if (!lineageName) return;

	try {
		const service = new LineageTrackingService(plugin.app);
		new Notice(`正在从 ${personName} 分配「${lineageName}」世系…`);

		const stats = await service.assignLineage({
			name: lineageName,
			rootCrId: crId,
			type: type
		});

		new Notice(`已将「${lineageName}」分配给 ${stats.totalMembers} 名后代（${stats.maxGeneration} 个世代）`);
	} catch (error) {
		logger.error('lineage-tracking', 'Failed to assign lineage', error);
		new Notice(`分配世系失败：${getErrorMessage(error)}`);
	}
}

export async function showCreatePlaceNotesForPerson(plugin: CanvasRootsPlugin, file: TFile): Promise<void> {
	const cache = plugin.app.metadataCache.getFileCache(file);
	const fm = cache?.frontmatter;

	if (!fm) {
		new Notice('此笔记中没有 frontmatter');
		return;
	}

	// Collect all place references from this person
	const placeFields: string[] = [];

	// Birth/death/burial places
	if (fm.birth_place && typeof fm.birth_place === 'string') {
		placeFields.push(fm.birth_place);
	}
	if (fm.death_place && typeof fm.death_place === 'string') {
		placeFields.push(fm.death_place);
	}
	if (fm.burial_place && typeof fm.burial_place === 'string') {
		placeFields.push(fm.burial_place);
	}

	// Spouse marriage locations
	let spouseIndex = 1;
	while (fm[`spouse${spouseIndex}`] || fm[`spouse${spouseIndex}_id`]) {
		const marriageLocation = fm[`spouse${spouseIndex}_marriage_location`];
		if (marriageLocation && typeof marriageLocation === 'string') {
			placeFields.push(marriageLocation);
		}
		spouseIndex++;
	}

	// Deduplicate and filter out wikilinks (already linked to place notes)
	const uniquePlaces = [...new Set(placeFields)]
		.map(p => p.trim())
		.filter(p => p && !p.startsWith('[['));

	if (uniquePlaces.length === 0) {
		new Notice('此人物笔记中未找到未链接的地点引用');
		return;
	}

	// Check which places already have notes
	const placeGraph = plugin.createPlaceGraphService();
	void placeGraph.reloadCache();

	const missingPlaces: string[] = [];
	for (const placeName of uniquePlaces) {
		const existingPlace = placeGraph.getPlaceByName(placeName);
		if (!existingPlace) {
			missingPlaces.push(placeName);
		}
	}

	if (missingPlaces.length === 0) {
		new Notice('所有地点引用都已有对应的地点笔记');
		return;
	}

	// Show modal to select which places to create
	const { CreateMissingPlacesModal } = await import('../ui/create-missing-places-modal');

	const modal = new CreateMissingPlacesModal(
		plugin.app,
		missingPlaces.map(name => ({ name, count: 1 })),
		{
			directory: plugin.settings.peopleFolder || '',
			placeGraph, // Reuse the placeGraph from earlier in plugin function
			onComplete: (created: number) => {
				if (created > 0) {
					new Notice(`已创建 ${created} 个地点笔记`);
				}
			}
		}
	);
	modal.open();
}

export async function promptLineageName(plugin: CanvasRootsPlugin, suggestedName: string): Promise<string | null> {
	// Extract surname for suggestion
	const nameParts = suggestedName.trim().split(/\s+/);
	const surname = nameParts.length > 1 ? nameParts[nameParts.length - 1] : suggestedName;
	const suggestion = `${surname} Line`;

	return new Promise((resolve) => {
		const modal = new Modal(plugin.app);
		modal.titleEl.setText('输入世系名称');

		modal.contentEl.createEl('p', {
			text: '为此世系输入名称（例如 "Smith 血脉"、"都铎王朝"）：'
		});

		const inputContainer = modal.contentEl.createDiv({ cls: 'setting-item-control' });
		const input = inputContainer.createEl('input', {
			type: 'text',
			placeholder: '例如 "Smith 血脉"、"都铎王朝"',
			value: suggestion,
			cls: 'cr-prompt-input'
		});

		const buttonContainer = modal.contentEl.createDiv({ cls: 'cr-prompt-buttons' });

		const saveBtn = buttonContainer.createEl('button', {
			text: '分配',
			cls: 'mod-cta'
		});
		saveBtn.addEventListener('click', () => {
			const lineageName = input.value.trim();
			if (lineageName) {
				modal.close();
				resolve(lineageName);
			} else {
				new Notice('请输入世系名称');
			}
		});

		const cancelBtn = buttonContainer.createEl('button', {
			text: '取消'
		});
		cancelBtn.addEventListener('click', () => {
			modal.close();
			resolve(null);
		});

		// Allow Enter key to save
		input.addEventListener('keydown', (e) => {
			if (e.key === 'Enter') {
				saveBtn.click();
			} else if (e.key === 'Escape') {
				cancelBtn.click();
			}
		});

		modal.open();

		// Focus the input
		window.setTimeout(() => {
			input.focus();
			input.select();
		}, 50);
	});
}

export async function regenerateTimelineCanvas(plugin: CanvasRootsPlugin, canvasFile: TFile): Promise<void> {
	try {
		new Notice('正在重新生成时间轴…');

		// Get event service
		const eventService = plugin.getEventService();
		if (!eventService) {
			new Notice('事件服务不可用');
			return;
		}

		// Get all events
		const events = eventService.getAllEvents();
		if (events.length === 0) {
			new Notice('未找到事件');
			return;
		}

		// Import and use TimelineCanvasExporter
		const { TimelineCanvasExporter } = await import('../events/services/timeline-canvas-exporter');
		const exporter = new TimelineCanvasExporter(plugin.app, plugin.settings);

		const result = await exporter.regenerateCanvas(canvasFile, events);

		if (result.success) {
			new Notice(`时间轴已成功重新生成！（${events.length} 个事件）`);
		} else {
			new Notice(`重新生成时间轴失败：${result.error}`);
		}
	} catch (error: unknown) {
		console.error('Error regenerating timeline canvas:', error);
		new Notice('重新生成时间轴失败。请查看控制台了解详情。');
	}
}

export async function exportCanvasToExcalidraw(plugin: CanvasRootsPlugin, canvasFile: TFile) {
	try {
		new Notice('正在导出为 Excalidraw…');

		// Initialize exporter
		const exporter = new ExcalidrawExporter(plugin.app);

		// Export canvas
		const result = await exporter.exportToExcalidraw({
			canvasFile,
			preserveColors: true,
			fontSize: 16,
			strokeWidth: 2
		});

		if (!result.success) {
			new Notice(`导出失败：${result.errors.join(', ')}`);
			return;
		}

		// Save Excalidraw file to vault root
		const outputPath = `${result.fileName}.excalidraw.md`;
		await plugin.app.vault.create(outputPath, result.excalidrawContent!);

		new Notice(`已将 ${result.elementsExported} 个元素导出到 ${result.fileName}.excalidraw.md`);

		// Open the newly created file
		const excalidrawFile = plugin.app.vault.getAbstractFileByPath(outputPath);
		if (excalidrawFile instanceof TFile) {
			const leaf = plugin.app.workspace.getLeaf(false);
			await leaf.openFile(excalidrawFile);
		}
	} catch (error: unknown) {
		console.error('Error exporting to Excalidraw:', error);
		new Notice(`导出为 Excalidraw 失败：${getErrorMessage(error)}`);
	}
}

export async function exportCanvasAsImage(plugin: CanvasRootsPlugin, canvasFile: TFile, format: 'png' | 'svg' | 'pdf') {
	try {
		new Notice(`正在导出为 ${format.toUpperCase()}…`);

		// Read canvas to get root person
		const canvasContent = await plugin.app.vault.read(canvasFile);
		const canvasData = JSON.parse(canvasContent);
		const metadata = canvasData.metadata?.frontmatter;

		if ((metadata?.plugin !== 'charted-roots' && metadata?.plugin !== 'canvas-roots') || !metadata.generation?.rootCrId) {
			new Notice('此画布不包含 Charted Roots 树数据');
			return;
		}

		const rootCrId = metadata.generation.rootCrId;
		const treeType = metadata.generation.treeType || 'full';
		const maxGenerations = metadata.generation.maxGenerations || 0;
		const includeSpouses = metadata.generation.includeSpouses ?? true;

		// Build family tree
		const graphService = plugin.createFamilyGraphService();

		const familyTree = graphService.generateTree({
			rootCrId,
			treeType,
			maxGenerations,
			includeSpouses
		});

		if (!familyTree) {
			new Notice('无法从画布数据构建家族树');
			return;
		}

		// Create a temporary container for the preview renderer
		const tempContainer = activeDocument.createElement('div');
		tempContainer.addClass('cr-offscreen-render');
		activeDocument.body.appendChild(tempContainer);

		try {
			// Render tree
			const renderer = new TreePreviewRenderer(tempContainer);
			renderer.setColorScheme(plugin.settings.nodeColorScheme);
			renderer.renderPreview(familyTree, {
				layoutType: metadata.generation.layoutType || plugin.settings.defaultLayoutType,
				treeType: treeType === 'ancestors' ? 'ancestor' : treeType === 'descendants' ? 'descendant' : 'full',
				direction: 'vertical',
				nodeWidth: plugin.settings.defaultNodeWidth,
				nodeHeight: plugin.settings.defaultNodeHeight,
				nodeSpacingX: plugin.settings.horizontalSpacing,
				nodeSpacingY: plugin.settings.verticalSpacing
			});

			// Export based on format
			if (format === 'png') {
				await renderer.exportAsPNG();
			} else if (format === 'svg') {
				renderer.exportAsSVG();
			} else if (format === 'pdf') {
				await renderer.exportAsPDF();
			}

			new Notice(`${format.toUpperCase()} 导出成功`);
		} finally {
			// Clean up temporary container
			activeDocument.body.removeChild(tempContainer);
		}
	} catch (error: unknown) {
		console.error(`Error exporting canvas as ${format}:`, error);
		new Notice(`导出为 ${format.toUpperCase()} 失败：${getErrorMessage(error)}`);
	}
}

export async function exportPersonTimelineFromFile(plugin: CanvasRootsPlugin, personFile: TFile,
	format: 'canvas' | 'excalidraw' = 'canvas'): Promise<void> {
	const eventService = plugin.getEventService();
	if (!eventService) {
		new Notice('事件服务不可用');
		return;
	}

	const cache = plugin.app.metadataCache.getFileCache(personFile);
	const personName = cache?.frontmatter?.name || personFile.basename;
	const allEvents = eventService.getAllEvents();
	const personLink = `[[${personName}]]`;

	// Filter events for this person
	const personEvents = allEvents.filter(e => {
		if (e.person) {
			const normalizedPerson = e.person.replace(/^\[\[/, '').replace(/\]\]$/, '').toLowerCase();
			return normalizedPerson === personName.toLowerCase();
		}
		return false;
	});

	if (personEvents.length === 0) {
		new Notice(`未找到 ${personName} 的事件`);
		return;
	}

	try {
		const { TimelineCanvasExporter } = await import('../events/services/timeline-canvas-exporter');
		const exporter = new TimelineCanvasExporter(plugin.app, plugin.settings);

		const result = await exporter.exportToCanvas(allEvents, {
			title: `${personName} 时间轴`,
			filterPerson: personLink,
			layoutStyle: 'horizontal',
			colorScheme: 'event_type',
			includeOrderingEdges: true
		});

		if (result.success && result.path) {
			if (format === 'excalidraw') {
				// Convert to Excalidraw
				const { ExcalidrawExporter } = await import('../excalidraw/excalidraw-exporter');
				const excalidrawExporter = new ExcalidrawExporter(plugin.app);

				const canvasFile = plugin.app.vault.getAbstractFileByPath(result.path);
				if (!(canvasFile instanceof TFile)) {
					throw new Error('Canvas file not found after export');
				}

				const excalidrawResult = await excalidrawExporter.exportToExcalidraw({
					canvasFile,
					fileName: result.path.replace('.canvas', '').split('/').pop(),
					preserveColors: true
				});

				if (excalidrawResult.success && excalidrawResult.excalidrawContent) {
					// Save to vault root
					const excalidrawFileName = result.path.replace('.canvas', '.excalidraw.md').split('/').pop();
					const excalidrawPath = excalidrawFileName || result.path.replace('.canvas', '.excalidraw.md');
					await plugin.app.vault.create(excalidrawPath, excalidrawResult.excalidrawContent);
					new Notice(`时间轴已导出到 ${excalidrawPath}`);
					const file = plugin.app.vault.getAbstractFileByPath(excalidrawPath);
					if (file instanceof TFile) {
						void plugin.app.workspace.getLeaf(false).openFile(file);
					}
				} else {
					new Notice(`Excalidraw 导出失败：${excalidrawResult.errors?.join(', ') || '未知错误'}`);
				}
			} else {
				new Notice(`时间轴已导出到 ${result.path}`);
				const file = plugin.app.vault.getAbstractFileByPath(result.path);
				if (file instanceof TFile) {
					void plugin.app.workspace.getLeaf(false).openFile(file);
				}
			}
		} else {
			new Notice(`导出失败：${result.error || '未知错误'}`);
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		new Notice(`导出失败：${message}`);
	}
}

export async function addEssentialPersonProperties(plugin: CanvasRootsPlugin, files: TFile[]) {
	try {
		let processedCount = 0;
		let skippedCount = 0;
		let errorCount = 0;

		for (const file of files) {
			try {
				let propertiesAdded = false;

				await plugin.app.fileManager.processFrontMatter(file, (frontmatter) => {
					// cr_id: Generate if missing
					if (!frontmatter.cr_id) {
						frontmatter.cr_id = generateCrId();
						propertiesAdded = true;
					}

					// cr_type: Set to 'person' if missing
					if (!frontmatter.cr_type) {
						frontmatter.cr_type = 'person';
						propertiesAdded = true;
					}

					// name: Use filename if missing
					if (!frontmatter.name) {
						frontmatter.name = file.basename;
						propertiesAdded = true;
					}

					// born: Add as empty if missing
					if (!frontmatter.born) {
						frontmatter.born = '';
						propertiesAdded = true;
					}

					// died: Add as empty if missing
					if (!frontmatter.died) {
						frontmatter.died = '';
						propertiesAdded = true;
					}

					// father: Add as empty if missing
					if (!frontmatter.father) {
						frontmatter.father = '';
						propertiesAdded = true;
					}

					// mother: Add as empty if missing
					if (!frontmatter.mother) {
						frontmatter.mother = '';
						propertiesAdded = true;
					}

					// spouses: Add as empty array if missing
					if (!frontmatter.spouses) {
						frontmatter.spouses = [];
						propertiesAdded = true;
					}

					// children: Add as empty array if missing
					if (!frontmatter.children) {
						frontmatter.children = [];
						propertiesAdded = true;
					}

					// group_name: Add as empty if missing
					if (!frontmatter.group_name) {
						frontmatter.group_name = '';
						propertiesAdded = true;
					}
				});

				if (propertiesAdded) {
					processedCount++;
				} else {
					skippedCount++;
				}

			} catch (error: unknown) {
				console.error(`Error processing ${file.path}:`, error);
				errorCount++;
			}
		}

		// Show summary
		if (files.length === 1) {
			if (processedCount === 1) {
				new Notice('已添加基本属性');
			} else if (skippedCount === 1) {
				new Notice('文件已包含所有基本属性');
			} else {
				new Notice('添加基本属性失败');
			}
		} else {
			const parts = [];
			if (processedCount > 0) parts.push(`已更新 ${processedCount}`);
			if (skippedCount > 0) parts.push(`已完成 ${skippedCount}`);
			if (errorCount > 0) parts.push(`${errorCount} 个错误`);
			new Notice(`基本属性：${parts.join('，')}`);
		}

	} catch (error: unknown) {
		console.error('Error adding essential person properties:', error);
		new Notice('添加人物基本属性失败');
	}
}

export async function addEssentialPlaceProperties(plugin: CanvasRootsPlugin, files: TFile[]) {
	try {
		let processedCount = 0;
		let skippedCount = 0;
		let errorCount = 0;

		for (const file of files) {
			try {
				let propertiesAdded = false;

				await plugin.app.fileManager.processFrontMatter(file, (frontmatter) => {
					// cr_type: Must be "place" (migrate from legacy 'type' property)
					if (frontmatter.cr_type !== 'place') {
						frontmatter.cr_type = 'place';
						propertiesAdded = true;
					}
					// Remove legacy 'type' property if it exists (migrated to cr_type)
					if (frontmatter.type === 'place') {
						delete frontmatter.type;
						propertiesAdded = true;
					}

					// cr_id: Generate if missing
					if (!frontmatter.cr_id) {
						frontmatter.cr_id = generateCrId();
						propertiesAdded = true;
					}

					// name: Use filename if missing
					if (!frontmatter.name) {
						frontmatter.name = file.basename;
						propertiesAdded = true;
					}

					// place_type: Add as empty if missing
					if (!frontmatter.place_type) {
						frontmatter.place_type = '';
						propertiesAdded = true;
					}

					// place_category: Use setting default if missing
					if (!frontmatter.place_category) {
						frontmatter.place_category = plugin.settings.defaultPlaceCategory;
						propertiesAdded = true;
					}
				});

				if (propertiesAdded) {
					processedCount++;
				} else {
					skippedCount++;
				}

			} catch (error: unknown) {
				console.error(`Error processing ${file.path}:`, error);
				errorCount++;
			}
		}

		// Show summary
		if (files.length === 1) {
			if (processedCount === 1) {
				new Notice('已添加地点基本属性');
			} else if (skippedCount === 1) {
				new Notice('文件已包含所有地点基本属性');
			} else {
				new Notice('添加地点基本属性失败');
			}
		} else {
			const parts = [];
			if (processedCount > 0) parts.push(`已更新 ${processedCount}`);
			if (skippedCount > 0) parts.push(`已完成 ${skippedCount}`);
			if (errorCount > 0) parts.push(`${errorCount} 个错误`);
			new Notice(`地点基本属性：${parts.join('，')}`);
		}

	} catch (error: unknown) {
		console.error('Error adding essential place properties:', error);
		new Notice('添加地点基本属性失败');
	}
}

export async function addEssentialMapProperties(plugin: CanvasRootsPlugin, files: TFile[]) {
	try {
		let processedCount = 0;
		let skippedCount = 0;
		let errorCount = 0;

		for (const file of files) {
			try {
				let propertiesAdded = false;

				await plugin.app.fileManager.processFrontMatter(file, (frontmatter) => {
					// cr_type: Must be "map"
					if (frontmatter.cr_type !== 'map') {
						frontmatter.cr_type = 'map';
						propertiesAdded = true;
					}

					// map_id: Generate from filename if missing
					if (!frontmatter.map_id) {
						frontmatter.map_id = file.basename.toLowerCase().replace(/\s+/g, '-');
						propertiesAdded = true;
					}

					// name: Use filename if missing
					if (!frontmatter.name) {
						frontmatter.name = file.basename;
						propertiesAdded = true;
					}

					// universe: Add empty if missing
					if (!frontmatter.universe) {
						frontmatter.universe = '';
						propertiesAdded = true;
					}

					// image: Add empty if missing
					if (!frontmatter.image) {
						frontmatter.image = '';
						propertiesAdded = true;
					}

					// bounds: Add flat properties if missing (check for both flat and nested)
					const hasFlatBounds = frontmatter.bounds_north !== undefined;
					const hasNestedBounds = frontmatter.bounds && typeof frontmatter.bounds === 'object';
					if (!hasFlatBounds && !hasNestedBounds) {
						frontmatter.bounds_north = 100;
						frontmatter.bounds_south = -100;
						frontmatter.bounds_east = 100;
						frontmatter.bounds_west = -100;
						propertiesAdded = true;
					}
				});

				if (propertiesAdded) {
					processedCount++;
				} else {
					skippedCount++;
				}

			} catch (error: unknown) {
				console.error(`Error processing ${file.path}:`, error);
				errorCount++;
			}
		}

		// Show summary
		if (files.length === 1) {
			if (processedCount === 1) {
				new Notice('已添加地图基本属性');
			} else if (skippedCount === 1) {
				new Notice('文件已包含所有地图基本属性');
			} else {
				new Notice('添加地图基本属性失败');
			}
		} else {
			const parts = [];
			if (processedCount > 0) parts.push(`已更新 ${processedCount}`);
			if (skippedCount > 0) parts.push(`已完成 ${skippedCount}`);
			if (errorCount > 0) parts.push(`${errorCount} 个错误`);
			new Notice(`地图基本属性：${parts.join('，')}`);
		}

	} catch (error: unknown) {
		console.error('Error adding essential map properties:', error);
		new Notice('添加地图基本属性失败');
	}
}

export async function addEssentialUniverseProperties(plugin: CanvasRootsPlugin, files: TFile[]) {
	try {
		let processedCount = 0;
		let errorCount = 0;

		for (const file of files) {
			try {
				await plugin.app.fileManager.processFrontMatter(file, (frontmatter) => {
					// cr_type: Must be "universe"
					frontmatter.cr_type = 'universe';

					// cr_id: Generate if missing
					if (!frontmatter.cr_id) {
						frontmatter.cr_id = generateCrId();
					}

					// name: Use filename if missing
					if (!frontmatter.name) {
						frontmatter.name = file.basename;
					}

					// description: Add empty if missing
					if (frontmatter.description === undefined) {
						frontmatter.description = '';
					}

					// status: Default to 'active' if missing
					if (!frontmatter.status) {
						frontmatter.status = 'active';
					}

					// author: Add empty if missing
					if (frontmatter.author === undefined) {
						frontmatter.author = '';
					}

					// genre: Add empty if missing
					if (frontmatter.genre === undefined) {
						frontmatter.genre = '';
					}
				});

				processedCount++;

			} catch (error: unknown) {
				console.error(`Error processing ${file.path}:`, error);
				errorCount++;
			}
		}

		// Show summary
		if (files.length === 1) {
			if (processedCount === 1) {
				new Notice('已添加宇宙基本属性');
			} else {
				new Notice('添加宇宙基本属性失败');
			}
		} else {
			const parts = [];
			if (processedCount > 0) parts.push(`已更新 ${processedCount}`);
			if (errorCount > 0) parts.push(`${errorCount} 个错误`);
			new Notice(`宇宙基本属性：${parts.join('，')}`);
		}

	} catch (error: unknown) {
		console.error('Error adding essential universe properties:', error);
		new Notice('添加宇宙基本属性失败');
	}
}

export async function addEssentialSourceProperties(plugin: CanvasRootsPlugin, files: TFile[]) {
	try {
		let processedCount = 0;
		let skippedCount = 0;
		let errorCount = 0;

		for (const file of files) {
			try {
				let propertiesAdded = false;

				await plugin.app.fileManager.processFrontMatter(file, (frontmatter) => {
					// cr_type: Must be "source"
					if (frontmatter.cr_type !== 'source') {
						frontmatter.cr_type = 'source';
						propertiesAdded = true;
					}

					// cr_id: Generate if missing
					if (!frontmatter.cr_id) {
						frontmatter.cr_id = generateCrId();
						propertiesAdded = true;
					}

					// title: Use filename if missing
					if (!frontmatter.title) {
						frontmatter.title = file.basename;
						propertiesAdded = true;
					}

					// source_type: Default to 'other' if missing
					if (!frontmatter.source_type) {
						frontmatter.source_type = 'other';
						propertiesAdded = true;
					}

					// confidence: Default to 'unknown' if missing
					if (!frontmatter.confidence) {
						frontmatter.confidence = 'unknown';
						propertiesAdded = true;
					}

					// source_repository: Add empty if missing (check both new and legacy names)
					if (!frontmatter.source_repository && !frontmatter.repository) {
						frontmatter.source_repository = '';
						propertiesAdded = true;
					}

					// source_date: Add empty if missing (check both new and legacy names)
					if (!frontmatter.source_date && !frontmatter.date) {
						frontmatter.source_date = '';
						propertiesAdded = true;
					}
				});

				if (propertiesAdded) {
					processedCount++;
				} else {
					skippedCount++;
				}

			} catch (error: unknown) {
				console.error(`Error processing ${file.path}:`, error);
				errorCount++;
			}
		}

		// Show summary
		if (files.length === 1) {
			if (processedCount === 1) {
				new Notice('已添加来源基本属性');
			} else if (skippedCount === 1) {
				new Notice('文件已包含所有来源基本属性');
			} else {
				new Notice('添加来源基本属性失败');
			}
		} else {
			const parts = [];
			if (processedCount > 0) parts.push(`已更新 ${processedCount}`);
			if (skippedCount > 0) parts.push(`已完成 ${skippedCount}`);
			if (errorCount > 0) parts.push(`${errorCount} 个错误`);
			new Notice(`来源基本属性：${parts.join('，')}`);
		}

	} catch (error: unknown) {
		console.error('Error adding essential source properties:', error);
		new Notice('添加来源基本属性失败');
	}
}

export async function addEssentialEventProperties(plugin: CanvasRootsPlugin, files: TFile[]) {
	try {
		let processedCount = 0;
		let skippedCount = 0;
		let errorCount = 0;

		for (const file of files) {
			try {
				let propertiesAdded = false;

				await plugin.app.fileManager.processFrontMatter(file, (frontmatter) => {
					// cr_type: Must be "event"
					if (frontmatter.cr_type !== 'event') {
						frontmatter.cr_type = 'event';
						propertiesAdded = true;
					}

					// cr_id: Generate if missing
					if (!frontmatter.cr_id) {
						frontmatter.cr_id = generateCrId();
						propertiesAdded = true;
					}

					// title: Use filename if missing
					if (!frontmatter.title) {
						frontmatter.title = file.basename;
						propertiesAdded = true;
					}

					// event_type: Default to 'custom' if missing
					if (!frontmatter.event_type) {
						frontmatter.event_type = 'custom';
						propertiesAdded = true;
					}

					// date: Add empty if missing
					if (!frontmatter.date) {
						frontmatter.date = '';
						propertiesAdded = true;
					}

					// date_precision: Default to 'unknown' if missing
					if (!frontmatter.date_precision) {
						frontmatter.date_precision = 'unknown';
						propertiesAdded = true;
					}

					// persons: Add empty array if missing (use persons array, not deprecated singular person)
					if (!frontmatter.persons) {
						frontmatter.persons = [];
						propertiesAdded = true;
					}

					// place: Add empty if missing
					if (!frontmatter.place) {
						frontmatter.place = '';
						propertiesAdded = true;
					}

					// confidence: Default to 'unknown' if missing
					if (!frontmatter.confidence) {
						frontmatter.confidence = 'unknown';
						propertiesAdded = true;
					}
				});

				if (propertiesAdded) {
					processedCount++;
				} else {
					skippedCount++;
				}

			} catch (error: unknown) {
				console.error(`Error processing ${file.path}:`, error);
				errorCount++;
			}
		}

		// Show summary
		if (files.length === 1) {
			if (processedCount === 1) {
				new Notice('已添加事件基本属性');
			} else if (skippedCount === 1) {
				new Notice('文件已包含所有事件基本属性');
			} else {
				new Notice('添加事件基本属性失败');
			}
		} else {
			const parts = [];
			if (processedCount > 0) parts.push(`已更新 ${processedCount}`);
			if (skippedCount > 0) parts.push(`已完成 ${skippedCount}`);
			if (errorCount > 0) parts.push(`${errorCount} 个错误`);
			new Notice(`事件基本属性：${parts.join('，')}`);
		}

	} catch (error: unknown) {
		console.error('Error adding essential event properties:', error);
		new Notice('添加事件基本属性失败');
	}
}

export async function addCrId(plugin: CanvasRootsPlugin, files: TFile[]) {
	try {
		let processedCount = 0;
		let skippedCount = 0;
		let errorCount = 0;

		for (const file of files) {
			try {
				let idAdded = false;

				await plugin.app.fileManager.processFrontMatter(file, (frontmatter) => {
					// Skip if cr_id already exists
					if (frontmatter.cr_id) {
						return;
					}

					// All note types use plain cr_id format (cr_type identifies the note type)
					frontmatter.cr_id = generateCrId();
					idAdded = true;
				});

				if (idAdded) {
					processedCount++;
				} else {
					skippedCount++;
				}

			} catch (error: unknown) {
				console.error(`Error processing ${file.path}:`, error);
				errorCount++;
			}
		}

		// Show summary
		if (files.length === 1) {
			if (processedCount === 1) {
				new Notice('已添加 cr_id');
			} else if (skippedCount === 1) {
				new Notice('文件已有 cr_id');
			} else {
				new Notice('添加 cr_id 失败');
			}
		} else {
			const parts = [];
			if (processedCount > 0) parts.push(`已更新 ${processedCount}`);
			if (skippedCount > 0) parts.push(`${skippedCount} 已有 cr_id`);
			if (errorCount > 0) parts.push(`${errorCount} 个错误`);
			new Notice(`添加 cr_id：${parts.join('，')}`);
		}

	} catch (error: unknown) {
		console.error('Error adding cr_id:', error);
		new Notice('添加 cr_id 失败');
	}
}

export async function insertSourceRolesBlock(plugin: CanvasRootsPlugin, file: TFile): Promise<void> {
	try {
		const content = await plugin.app.vault.read(file);

		// Check if already has source roles block
		if (content.includes('```charted-roots-source-roles')) {
			new Notice('此笔记中已存在来源角色块');
			return;
		}

		// Build the block (self-referencing - no source parameter needed)
		const blockLines = [
			'',
			'```charted-roots-source-roles',
			'```',
			''
		];

		// Append to end of file
		const newContent = content.trimEnd() + '\n' + blockLines.join('\n');
		await plugin.app.vault.modify(file, newContent);

		new Notice('已添加来源角色块');

	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		console.error('Error inserting source roles block:', error);
		new Notice(`添加来源角色块失败：${message}`);
	}
}

export async function insertMembersBlock(plugin: CanvasRootsPlugin, file: TFile): Promise<void> {
	try {
		const content = await plugin.app.vault.read(file);

		if (content.includes('```charted-roots-members')) {
			new Notice('此笔记中已存在成员块');
			return;
		}

		const blockLines = [
			'',
			'```charted-roots-members',
			'group-by: role',
			'```',
			''
		];

		// Append to end of file
		const newContent = content.trimEnd() + '\n' + blockLines.join('\n');
		await plugin.app.vault.modify(file, newContent);

		new Notice('已添加成员块');

	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		console.error('Error inserting members block:', error);
		new Notice(`添加成员块失败：${message}`);
	}
}

export function showFolderStatistics(plugin: CanvasRootsPlugin, folder: TFolder): void {
	new FolderStatisticsModal(plugin.app, folder).open();
}

export async function openCanvasInFamilyChart(plugin: CanvasRootsPlugin, file: TFile): Promise<void> {
	try {
		const canvasContent = await plugin.app.vault.read(file);
		const canvasData = JSON.parse(canvasContent);
		const metadata = canvasData.metadata?.frontmatter;

		if ((metadata?.plugin !== 'charted-roots' && metadata?.plugin !== 'canvas-roots') || !metadata.generation?.rootCrId) {
			new Notice('此画布不包含 Charted Roots 树数据');
			return;
		}

		const rootCrId = metadata.generation.rootCrId;
		// Open in main workspace when triggered from canvas context menu
		await plugin.activateFamilyChartView(rootCrId, true);
	} catch (error) {
		logger.error('open-canvas-chart', 'Failed to open canvas in family chart', error);
		new Notice('读取画布文件失败');
	}
}

/**
 * Open the region drawing modal for a child map note (#362)
 * Finds the parent map config from frontmatter, then opens the modal
 * to draw/edit the region, saving results back to the child map's frontmatter.
 */
export async function openRegionDrawingForMap(
	plugin: CanvasRootsPlugin,
	file: TFile,
	fm: Record<string, unknown> | undefined
): Promise<void> {
	const parentMapId = fm?.parent_map;
	if (!parentMapId) {
		new Notice('此地图未配置父地图');
		return;
	}

	// Find the parent map's config from frontmatter
	const files = plugin.app.vault.getMarkdownFiles();
	let parentConfig: import('../maps/types/map-types').CustomMapConfig | null = null;

	for (const f of files) {
		const cache = plugin.app.metadataCache.getFileCache(f);
		const parentFm = cache?.frontmatter;
		if (!parentFm) continue;
		const crType = parentFm.cr_type || parentFm.type;
		if (crType !== 'map') continue;

		// Handle wikilink-parsed parent_map values
		let pmId = typeof parentMapId === 'string' ? parentMapId : '';
		if (Array.isArray(parentMapId)) {
			const flat = parentMapId.flat();
			if (flat.length === 1 && typeof flat[0] === 'string') pmId = flat[0];
		}

		if (parentFm.map_id !== pmId) continue;

		const coordSystem = parentFm.coordinate_system === 'geographic' ? 'geographic' : 'pixel';
		const imgW = typeof parentFm.image_width === 'number' ? parentFm.image_width : 1000;
		const imgH = typeof parentFm.image_height === 'number' ? parentFm.image_height : 1000;

		parentConfig = {
			id: parentFm.map_id,
			name: parentFm.name || String(pmId),
			universe: parentFm.universe || '',
			imagePath: parentFm.image || '',
			coordinateSystem: coordSystem,
			bounds: coordSystem === 'pixel'
				? { topLeft: { x: 0, y: imgH }, bottomRight: { x: imgW, y: 0 } }
				: {
					topLeft: { x: parentFm.bounds_west ?? -100, y: parentFm.bounds_north ?? 100 },
					bottomRight: { x: parentFm.bounds_east ?? 100, y: parentFm.bounds_south ?? -100 }
				},
			imageDimensions: { width: imgW, height: imgH },
			sourcePath: f.path
		};
		break;
	}

	if (!parentConfig) {
		new Notice('找不到父地图配置');
		return;
	}

	const existingRegion = (
		typeof fm?.parent_region_x === 'number' &&
		typeof fm?.parent_region_y === 'number' &&
		typeof fm?.parent_region_w === 'number' &&
		typeof fm?.parent_region_h === 'number'
	) ? {
		x: fm.parent_region_x,
		y: fm.parent_region_y,
		w: fm.parent_region_w,
		h: fm.parent_region_h
	} : undefined;

	const childName = (fm?.name as string) || file.basename;

	const { RegionDrawingModal } = await import('../maps/ui/region-drawing-modal');
	new RegionDrawingModal(
		plugin.app,
		parentConfig,
		childName,
		(result) => {
			// Save the region to the child map's frontmatter
			void plugin.app.fileManager.processFrontMatter(file, (frontmatter) => {
				frontmatter.parent_region_x = result.x;
				frontmatter.parent_region_y = result.y;
				frontmatter.parent_region_w = result.w;
				frontmatter.parent_region_h = result.h;
			});
		},
		existingRegion
	).open();
}

/* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument -- Match scope of file-level disable at top. */
