/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call -- Obsidian API returns any-typed surfaces (frontmatter, file caches, plugin state); project policy accepts these. */
/**
 * Maps tab for the Control Center modal
 *
 * Renders the maps tab content including world map preview, custom maps gallery,
 * visualizations, place timeline, and map statistics.
 */

import { Menu, MenuItem, Modal, Notice, Setting, TFile } from 'obsidian';
import type { App } from 'obsidian';
import type CanvasRootsPlugin from '../../../main';
import type { LucideIconName } from '../../ui/lucide-icons';
import { setLucideIcon } from '../../ui/lucide-icons';
import { createStatItem } from '../../ui/shared/card-component';
import { PlaceGraphService } from '../../core/place-graph';
import { BulkGeocodeModal } from './bulk-geocode-modal';
import { CreateMapWizardModal } from '../../ui/create-map-wizard-modal';
import { CreateMapModal } from '../../ui/create-map-modal';
import { MigrationDiagramModal } from '../../ui/migration-diagram-modal';
import { PlaceNetworkModal } from '../../ui/place-network-modal';
import { renderWorldMapPreview } from './world-map-preview';
import { renderPlaceTimelineCard } from '../../events/ui/place-timeline';
import { resolvePathToFile } from '../../utils/wikilink-resolver';
import { getErrorMessage } from '../../core/error-utils';

/**
 * Options for rendering the Maps tab
 */
export interface MapsTabOptions {
	container: HTMLElement;
	plugin: CanvasRootsPlugin;
	app: App;
	createCard: (options: { title: string; icon?: LucideIconName; subtitle?: string }) => HTMLElement;
	showTab: (tabId: string) => void;
	closeModal: () => void;
}

/**
 * Convert a value to a safe string for YAML frontmatter
 */
function toSafeString(value: unknown): string {
	if (value === undefined || value === null) return '';
	if (typeof value === 'object' && value !== null) return JSON.stringify(value);
	return String(value as string | number | boolean | bigint | symbol);
}

/**
 * Generate a URL-friendly map ID from a name
 */
function generateMapId(name: string): string {
	return name
		.toLowerCase()
		.replace(/[^a-z0-9\s-]/g, '')
		.replace(/\s+/g, '-')
		.replace(/-+/g, '-')
		.replace(/^-|-$/g, '');
}

/**
 * Get all custom map notes from the vault
 */
function getCustomMaps(app: App): Array<{
	name: string;
	filePath: string;
	imagePath?: string;
	universe?: string;
	id?: string;
}> {
	const maps: Array<{
		name: string;
		filePath: string;
		imagePath?: string;
		universe?: string;
		id?: string;
	}> = [];

	const files = app.vault.getMarkdownFiles();

	for (const file of files) {
		const cache = app.metadataCache.getFileCache(file);
		const frontmatter = cache?.frontmatter;

		if (frontmatter?.cr_type === 'map' || frontmatter?.type === 'map') {
			// Get raw image value - may be string, nested array (YAML [[path]]), or quoted wikilink
			const rawImage = frontmatter.image || frontmatter.image_path || frontmatter.imagePath;
			let imagePath: string | undefined;

			if (rawImage) {
				// Handle wikilinks parsed as nested arrays by YAML
				// [[path/to/file]] becomes [["path/to/file"]] in memory
				if (Array.isArray(rawImage) && rawImage.length === 1 &&
					Array.isArray(rawImage[0]) && rawImage[0].length === 1) {
					imagePath = `[[${rawImage[0][0]}]]`;
				} else if (typeof rawImage === 'string') {
					imagePath = rawImage;
				}
			}

			maps.push({
				name: frontmatter.name || file.basename,
				filePath: file.path,
				imagePath,
				universe: frontmatter.universe,
				id: frontmatter.map_id
			});
		}
	}

	// Sort by name
	maps.sort((a, b) => a.name.localeCompare(b.name));

	return maps;
}

/**
 * Load custom maps into a thumbnail grid
 */
function loadCustomMapsGrid(
	container: HTMLElement,
	options: MapsTabOptions
): void {
	const { app, plugin, closeModal } = options;
	container.empty();

	// Find all map notes (cr_type: map in frontmatter)
	const customMaps = getCustomMaps(app);

	if (customMaps.length === 0) {
		const emptyState = container.createDiv({ cls: 'crc-empty-state' });
		emptyState.createEl('p', {
			text: '未找到自定义地图。',
			cls: 'crc-text--muted'
		});
		emptyState.createEl('p', {
			text: '创建一篇 frontmatter 中带 cr_type: map 的笔记，即可为虚构世界定义自定义图片地图。',
			cls: 'crc-text--muted crc-text--small'
		});

		// Link to wiki
		const wikiLink = emptyState.createEl('a', {
			text: '了解自定义地图 \u2192',
			href: 'https://github.com/banisterious/obsidian-charted-roots/wiki/Geographic-Features#custom-image-maps',
			cls: 'crc-link external-link crc-mt-2'
		});
		wikiLink.setAttr('target', '_blank');
		return;
	}

	// Create thumbnail grid
	const grid = container.createDiv({ cls: 'cr-map-grid' });

	for (const mapNote of customMaps) {
		const thumbnail = grid.createDiv({ cls: 'cr-map-thumbnail' });

		// Try to load image preview
		if (mapNote.imagePath) {
			// Use wikilink resolver to handle both plain paths and [[wikilinks]]
			const imageFile = resolvePathToFile(app, mapNote.imagePath);
			if (imageFile) {
				const imgUrl = app.vault.getResourcePath(imageFile);
				const img = thumbnail.createEl('img', {
					attr: {
						src: imgUrl,
						alt: mapNote.name
					}
				});
				img.onerror = () => {
					// Replace with placeholder on error
					img.remove();
					const placeholder = thumbnail.createDiv({ cls: 'cr-map-thumbnail__placeholder' });
					setLucideIcon(placeholder, 'map', 32);
				};
			} else {
				// Image not found - show placeholder
				const placeholder = thumbnail.createDiv({ cls: 'cr-map-thumbnail__placeholder' });
				setLucideIcon(placeholder, 'map', 32);
			}
		} else {
			// No image path - show placeholder
			const placeholder = thumbnail.createDiv({ cls: 'cr-map-thumbnail__placeholder' });
			setLucideIcon(placeholder, 'map', 32);
		}

		// Overlay with name and universe
		const overlay = thumbnail.createDiv({ cls: 'cr-map-thumbnail__overlay' });
		overlay.createDiv({ cls: 'cr-map-thumbnail__name', text: mapNote.name });
		if (mapNote.universe) {
			overlay.createDiv({ cls: 'cr-map-thumbnail__universe', text: mapNote.universe });
		}

		// Action buttons container (stacked vertically on right)
		const actionsContainer = thumbnail.createDiv({ cls: 'cr-map-thumbnail__actions' });

		// Edit button
		const editBtn = actionsContainer.createDiv({ cls: 'cr-map-thumbnail__action-btn' });
		setLucideIcon(editBtn, 'edit', 14);
		editBtn.setAttribute('aria-label', '编辑地图');
		editBtn.addEventListener('click', (e) => {
			e.stopPropagation(); // Prevent thumbnail click
			const file = app.vault.getAbstractFileByPath(mapNote.filePath);
			if (file instanceof TFile) {
				const cache = app.metadataCache.getFileCache(file);
				const frontmatter = cache?.frontmatter;
				new CreateMapModal(app, {
					editFile: file,
					editFrontmatter: frontmatter,
					propertyAliases: plugin.settings.propertyAliases,
					onCreated: () => {
						// Refresh the maps grid after editing
						loadCustomMapsGrid(container, options);
					}
				}).open();
			}
		});

		// Menu button
		const menuBtn = actionsContainer.createDiv({ cls: 'cr-map-thumbnail__action-btn' });
		setLucideIcon(menuBtn, 'more-vertical', 14);
		menuBtn.setAttribute('aria-label', '更多选项');
		menuBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			showMapContextMenu(mapNote, container, e, options);
		});

		// Click to open in Map View with this specific map
		thumbnail.addEventListener('click', () => {
			closeModal();
			void plugin.activateMapView(mapNote.id);
		});

		// Right-click context menu
		thumbnail.addEventListener('contextmenu', (e) => {
			e.preventDefault();
			showMapContextMenu(mapNote, container, e, options);
		});
	}
}

/**
 * Show context menu for a custom map
 */
function showMapContextMenu(
	mapNote: { name: string; filePath: string; imagePath?: string; universe?: string; id?: string },
	gridContainer: HTMLElement,
	event: MouseEvent,
	options: MapsTabOptions
): void {
	const { app, plugin, closeModal } = options;
	const menu = new Menu();

	menu.addItem((item: MenuItem) => {
		item
			.setTitle('在地图视图中打开')
			.setIcon('map')
			.onClick(async () => {
				closeModal();
				await plugin.activateMapView(mapNote.id);
			});
	});

	menu.addItem((item: MenuItem) => {
		item
			.setTitle('编辑地图')
			.setIcon('edit')
			.onClick(() => {
				const file = app.vault.getAbstractFileByPath(mapNote.filePath);
				if (file instanceof TFile) {
					const cache = app.metadataCache.getFileCache(file);
					const frontmatter = cache?.frontmatter;
					new CreateMapModal(app, {
						editFile: file,
						editFrontmatter: frontmatter,
						propertyAliases: plugin.settings.propertyAliases,
						onCreated: () => {
							// Refresh the maps grid after editing
							loadCustomMapsGrid(gridContainer, options);
						}
					}).open();
				}
			});
	});

	menu.addItem((item: MenuItem) => {
		item
			.setTitle('复制地图')
			.setIcon('copy')
			.onClick(async () => {
				await duplicateMap(mapNote.filePath, gridContainer, options);
			});
	});

	menu.addItem((item: MenuItem) => {
		item
			.setTitle('导出为 JSON')
			.setIcon('download')
			.onClick(async () => {
				await exportMapToJson(mapNote.filePath, app);
			});
	});

	menu.addSeparator();

	menu.addItem((item: MenuItem) => {
		item
			.setTitle('打开笔记')
			.setIcon('file-text')
			.onClick(async () => {
				const file = app.vault.getAbstractFileByPath(mapNote.filePath);
				if (file instanceof TFile) {
					await app.workspace.getLeaf(false).openFile(file);
					closeModal();
				}
			});
	});

	menu.addItem((item: MenuItem) => {
		item
			.setTitle('删除地图')
			.setIcon('trash')
			.onClick(async () => {
				await deleteMap(mapNote.filePath, mapNote.name, gridContainer, options);
			});
	});

	menu.showAtMouseEvent(event);
}

/**
 * Duplicate a custom map note
 */
async function duplicateMap(
	filePath: string,
	gridContainer: HTMLElement,
	options: MapsTabOptions
): Promise<void> {
	const { app, plugin } = options;
	const file = app.vault.getAbstractFileByPath(filePath);
	if (!(file instanceof TFile)) {
		new Notice('未找到地图文件');
		return;
	}

	// Read original file content
	const content = await app.vault.read(file);
	const cache = app.metadataCache.getFileCache(file);
	const frontmatter = cache?.frontmatter;

	if (!frontmatter) {
		new Notice('无法读取地图 frontmatter');
		return;
	}

	// Generate new name and ID
	const originalName = frontmatter.name || file.basename;
	const newName = `${originalName} (copy)`;
	const originalId = frontmatter.map_id || '';
	const newId = originalId ? `${originalId}-copy` : generateMapId(newName);

	// Check if copy already exists, increment suffix if needed
	let finalName = newName;
	let finalId = newId;
	let suffix = 1;
	const parentPath = file.parent?.path || '';

	let testPath = parentPath ? `${parentPath}/${finalName}.md` : `${finalName}.md`;
	while (app.vault.getAbstractFileByPath(testPath)) {
		suffix++;
		finalName = `${originalName} (copy ${suffix})`;
		finalId = originalId ? `${originalId}-copy-${suffix}` : generateMapId(finalName);
		testPath = parentPath ? `${parentPath}/${finalName}.md` : `${finalName}.md`;
	}

	// Update frontmatter in content
	let newContent = content;

	// Replace name in frontmatter
	if (frontmatter.name) {
		newContent = newContent.replace(
			/^(name:\s*).+$/m,
			`$1${finalName}`
		);
	} else {
		// Add name if not present
		newContent = newContent.replace(
			/^(---\s*\n)/,
			`$1name: ${finalName}\n`
		);
	}

	// Replace map_id in frontmatter
	if (frontmatter.map_id) {
		newContent = newContent.replace(
			/^(map_id:\s*).+$/m,
			`$1${finalId}`
		);
	} else {
		// Add map_id if not present
		newContent = newContent.replace(
			/^(---\s*\n)/,
			`$1map_id: ${finalId}\n`
		);
	}

	// Create new file in same directory
	const newFilePath = parentPath
		? `${parentPath}/${finalName}.md`
		: `${finalName}.md`;

	try {
		const newFile = await app.vault.create(newFilePath, newContent);
		new Notice(`已创建“${finalName}”`);

		// Refresh the grid
		loadCustomMapsGrid(gridContainer, options);

		// Open the new map in edit mode
		const newCache = app.metadataCache.getFileCache(newFile);
		new CreateMapModal(app, {
			editFile: newFile,
			editFrontmatter: newCache?.frontmatter,
			propertyAliases: plugin.settings.propertyAliases,
			onCreated: () => {
				loadCustomMapsGrid(gridContainer, options);
			}
		}).open();
	} catch (error) {
		new Notice(`复制地图失败：${getErrorMessage(error)}`);
	}
}

/**
 * Export a custom map's configuration to JSON
 */
async function exportMapToJson(filePath: string, app: App): Promise<void> {
	const file = app.vault.getAbstractFileByPath(filePath);
	if (!(file instanceof TFile)) {
		new Notice('未找到地图文件');
		return;
	}

	const cache = app.metadataCache.getFileCache(file);
	const frontmatter = cache?.frontmatter;

	if (!frontmatter) {
		new Notice('无法读取地图 frontmatter');
		return;
	}

	// Build export object with relevant map properties
	const exportData: Record<string, unknown> = {
		name: frontmatter.name || file.basename,
		map_id: frontmatter.map_id,
		type: 'map',
		universe: frontmatter.universe,
		image: frontmatter.image || frontmatter.image_path || frontmatter.imagePath,
		coordinate_system: frontmatter.coordinate_system || 'geographic',
		exported_at: new Date().toISOString(),
		exported_from: 'Charted Roots'
	};

	// Add coordinate system specific fields
	if (frontmatter.coordinate_system === 'pixel') {
		exportData.width = frontmatter.width;
		exportData.height = frontmatter.height;
	} else {
		// Geographic bounds
		if (frontmatter.bounds) {
			exportData.bounds = frontmatter.bounds;
		} else {
			exportData.bounds = {
				north: frontmatter.north,
				south: frontmatter.south,
				east: frontmatter.east,
				west: frontmatter.west
			};
		}
	}

	// Add optional fields if present
	if (frontmatter.default_zoom !== undefined) {
		exportData.default_zoom = frontmatter.default_zoom;
	}
	if (frontmatter.min_zoom !== undefined) {
		exportData.min_zoom = frontmatter.min_zoom;
	}
	if (frontmatter.max_zoom !== undefined) {
		exportData.max_zoom = frontmatter.max_zoom;
	}
	if (frontmatter.center) {
		exportData.center = frontmatter.center;
	}

	// Remove undefined values
	const cleanExport = Object.fromEntries(
		Object.entries(exportData).filter(([, v]) => v !== undefined)
	);

	const jsonContent = JSON.stringify(cleanExport, null, 2);

	// Create filename from map name
	const mapName = frontmatter.name || file.basename;
	const safeFileName = mapName.replace(/[^a-z0-9\s-]/gi, '').replace(/\s+/g, '-');
	const exportFileName = `${safeFileName}-map-export.json`;

	// Save to vault root or Downloads equivalent
	try {
		// Check if file already exists
		const existingFile = app.vault.getAbstractFileByPath(exportFileName);
		if (existingFile instanceof TFile) {
			await app.vault.modify(existingFile, jsonContent);
		} else if (!existingFile) {
			await app.vault.create(exportFileName, jsonContent);
		}
		new Notice(`已导出“${mapName}”到 ${exportFileName}`);
	} catch (error) {
		new Notice(`导出失败：${getErrorMessage(error)}`);
	}
}

/**
 * Import a custom map from a JSON file
 */
function importMapFromJson(
	gridContainer: HTMLElement,
	options: MapsTabOptions
): void {
	const { app, plugin } = options;

	// Create file input element
	const input = activeDocument.createElement('input');
	input.type = 'file';
	input.accept = '.json';

	input.addEventListener('change', () => void (async () => {
		const file = input.files?.[0];
		if (!file) return;

		try {
			const text = await file.text();
			const data = JSON.parse(text) as Record<string, unknown>;

			// Validate required fields
			if (!data.name || typeof data.name !== 'string') {
				new Notice('JSON 无效：缺少 "name" 字段');
				return;
			}

			// Check for map_id or generate one
			let mapId = data.map_id as string | undefined;
			if (!mapId) {
				mapId = generateMapId(data.name);
			}

			// Check if a map with this ID already exists
			const existingMaps = getCustomMaps(app);
			const existingMap = existingMaps.find(m => m.id === mapId);
			if (existingMap) {
				new Notice(`已存在 ID 为“${mapId}”的地图。请编辑 JSON 或删除现有地图。`);
				return;
			}

			// Build frontmatter
			const frontmatterLines: string[] = [
				'---',
				'cr_type: map',
				`name: ${data.name}`,
				`map_id: ${mapId}`
			];

			if (data.universe) {
				frontmatterLines.push(`universe: ${toSafeString(data.universe)}`);
			}
			if (data.image) {
				frontmatterLines.push(`image: ${toSafeString(data.image)}`);
			}
			if (data.coordinate_system) {
				frontmatterLines.push(`coordinate_system: ${toSafeString(data.coordinate_system)}`);
			}

			// Handle bounds (geographic) or dimensions (pixel)
			if (data.coordinate_system === 'pixel') {
				if (data.width !== undefined) {
					frontmatterLines.push(`width: ${toSafeString(data.width)}`);
				}
				if (data.height !== undefined) {
					frontmatterLines.push(`height: ${toSafeString(data.height)}`);
				}
			} else {
				// Geographic bounds
				if (data.bounds && typeof data.bounds === 'object') {
					const bounds = data.bounds as Record<string, number>;
					if (bounds.north !== undefined) frontmatterLines.push(`north: ${toSafeString(bounds.north)}`);
					if (bounds.south !== undefined) frontmatterLines.push(`south: ${toSafeString(bounds.south)}`);
					if (bounds.east !== undefined) frontmatterLines.push(`east: ${toSafeString(bounds.east)}`);
					if (bounds.west !== undefined) frontmatterLines.push(`west: ${toSafeString(bounds.west)}`);
				}
			}

			// Optional fields
			if (data.default_zoom !== undefined) {
				frontmatterLines.push(`default_zoom: ${toSafeString(data.default_zoom)}`);
			}
			if (data.min_zoom !== undefined) {
				frontmatterLines.push(`min_zoom: ${toSafeString(data.min_zoom)}`);
			}
			if (data.max_zoom !== undefined) {
				frontmatterLines.push(`max_zoom: ${toSafeString(data.max_zoom)}`);
			}
			if (data.center && typeof data.center === 'object') {
				const center = data.center as Record<string, number>;
				frontmatterLines.push(`center:`);
				if (center.lat !== undefined) frontmatterLines.push(`  lat: ${toSafeString(center.lat)}`);
				if (center.lng !== undefined) frontmatterLines.push(`  lng: ${toSafeString(center.lng)}`);
			}

			frontmatterLines.push('---');
			frontmatterLines.push('');
			frontmatterLines.push(`# ${String(data.name)}`);
			frontmatterLines.push('');
			frontmatterLines.push('*Imported from JSON*');

			const content = frontmatterLines.join('\n');

			// Determine file path - use configured maps folder or vault root
			const mapsDir = plugin.settings.mapsFolder || '';
			const safeFileName = String(data.name).replace(/[^a-z0-9\s-]/gi, '').replace(/\s+/g, '-');
			const filePath = mapsDir
				? `${mapsDir}/${safeFileName}.md`
				: `${safeFileName}.md`;

			// Check if file already exists
			const existingFile = app.vault.getAbstractFileByPath(filePath);
			if (existingFile) {
				new Notice(`文件“${filePath}”已存在`);
				return;
			}

			// Ensure directory exists
			if (mapsDir) {
				const folder = app.vault.getAbstractFileByPath(mapsDir);
				if (!folder) {
					await app.vault.createFolder(mapsDir);
				}
			}

			// Create the file
			await app.vault.create(filePath, content);
			new Notice(`已从 JSON 导入“${data.name}”`);

			// Refresh the grid
			loadCustomMapsGrid(gridContainer, options);

		} catch (error) {
			if (error instanceof SyntaxError) {
				new Notice('JSON 文件无效');
			} else {
				new Notice(`导入失败：${getErrorMessage(error)}`);
			}
		}
	})());

	// Trigger file picker
	input.click();
}

/**
 * Delete a custom map note with confirmation
 */
async function deleteMap(
	filePath: string,
	mapName: string,
	gridContainer: HTMLElement,
	options: MapsTabOptions
): Promise<void> {
	const { app } = options;
	const file = app.vault.getAbstractFileByPath(filePath);
	if (!(file instanceof TFile)) {
		new Notice('未找到地图文件');
		return;
	}

	// Show confirmation dialog
	const confirmed = await showDeleteConfirmation(mapName, app);
	if (!confirmed) {
		return;
	}

	try {
		await app.fileManager.trashFile(file);
		new Notice(`已删除“${mapName}”`);
		loadCustomMapsGrid(gridContainer, options);
	} catch (error) {
		new Notice(`删除失败：${getErrorMessage(error)}`);
	}
}

/**
 * Show a confirmation dialog for deleting a map
 */
function showDeleteConfirmation(mapName: string, app: App): Promise<boolean> {
	return new Promise((resolve) => {
		const modal = new Modal(app);
		modal.titleEl.setText('删除地图');

		modal.contentEl.createEl('p', {
			text: `确定要删除“${mapName}”吗？`
		});
		modal.contentEl.createEl('p', {
			text: '地图笔记将被移至回收站，图片文件不会被删除。',
			cls: 'crc-text--muted'
		});

		const buttonContainer = modal.contentEl.createDiv({ cls: 'modal-button-container' });

		buttonContainer.createEl('button', { text: '取消' })
			.addEventListener('click', () => {
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
 * Render map statistics
 */
function renderMapStatistics(
	container: HTMLElement,
	stats: ReturnType<PlaceGraphService['calculateStatistics']>,
	options: MapsTabOptions
): void {
	const { plugin, closeModal } = options;
	const statsGrid = container.createDiv({ cls: 'crc-stats-grid' });

	// Places with coordinates
	const coordPercent = stats.totalPlaces > 0
		? Math.round((stats.withCoordinates / stats.totalPlaces) * 100)
		: 0;
	createStatItem(statsGrid, '有坐标', `${stats.withCoordinates}/${stats.totalPlaces} (${coordPercent}%)`, 'globe');

	// Places without coordinates
	const withoutCoords = stats.totalPlaces - stats.withCoordinates;
	createStatItem(statsGrid, '无任何坐标', withoutCoords.toString(), 'map-pin');

	// Universes
	const universeCount = Object.keys(stats.byUniverse).length;
	if (universeCount > 0) {
		createStatItem(statsGrid, '宇宙', universeCount.toString(), 'globe');

		// List universes
		const universeSection = container.createDiv({ cls: 'crc-mt-3' });
		universeSection.createEl('h4', { text: '宇宙', cls: 'crc-section-title' });
		const universeList = universeSection.createEl('ul', { cls: 'crc-list' });

		for (const [universe, count] of Object.entries(stats.byUniverse).sort((a, b) => b[1] - a[1])) {
			const item = universeList.createEl('li');
			item.createEl('span', { text: universe });
			item.createEl('span', { text: `（${count} 个地点）`, cls: 'crc-text--muted' });
		}
	}

	// View full statistics link
	const statsLink = container.createDiv({ cls: 'cr-stats-link' });
	const link = statsLink.createEl('a', { text: '查看完整统计 \u2192', cls: 'crc-text-muted' });
	link.addEventListener('click', (e) => {
		e.preventDefault();
		closeModal();
		void plugin.activateStatisticsView();
	});
}

/**
 * Render the Maps tab content
 */
export function renderMapsTab(options: MapsTabOptions): void {
	const { container, app, plugin, createCard, closeModal } = options;

	// Card 1: World map preview
	const mapViewCard = createCard({
		title: '世界地图',
		icon: 'map',
		subtitle: '交互式地理可视化'
	});

	const mapViewContent = mapViewCard.querySelector('.crc-card__content') as HTMLElement;

	// Get place data for the map preview and statistics
	const placeService = plugin.createPlaceGraphService();
	void placeService.reloadCache();
	const places = placeService.getAllPlaces();
	const stats = placeService.calculateStatistics();

	// Render the clickable world map preview
	renderWorldMapPreview(mapViewContent, app, {
		places,
		onClick: () => {
			closeModal();
			app.commands.executeCommandById('charted-roots:open-map-view');
		}
	});

	// Open new map button (for side-by-side comparison)
	new Setting(mapViewContent)
		.setName('打开新的地图视图')
		.setDesc('打开第二个地图视图以进行并排比较')
		.addButton(button => button
			.setButtonText('打开新地图')
			.onClick(() => {
				closeModal();
				app.commands.executeCommandById('charted-roots:open-new-map-view');
			}));

	// Bulk geocode places without coordinates
	const placesWithoutCoords = places.filter(p =>
		!p.coordinates && ['real', 'historical', 'disputed'].includes(p.category)
	);

	if (placesWithoutCoords.length > 0) {
		new Setting(mapViewContent)
			.setName('批量地理编码地点')
			.setDesc(`${placesWithoutCoords.length} 个地点缺少坐标。使用 OpenStreetMap 查询。`)
			.addButton(button => button
				.setButtonText('地理编码')
				.onClick(() => {
					new BulkGeocodeModal(app, placeService, {
						onComplete: () => {
							// Refresh the Maps tab
							container.empty();
							renderMapsTab(options);
						}
					}).open();
				}));
	}

	container.appendChild(mapViewCard);

	// Card 2: Custom Maps
	const customMapsCard = createCard({
		title: '自定义地图',
		icon: 'globe',
		subtitle: '用于虚构世界的图片地图'
	});

	const customMapsContent = customMapsCard.querySelector('.crc-card__content') as HTMLElement;

	// Create map buttons
	new Setting(customMapsContent)
		.setName('创建自定义地图')
		.setDesc('为虚构或历史世界创建新的地图笔记')
		.addButton(button => button
			.setButtonText('向导')
			.setCta()
			.onClick(() => {
				closeModal();
				new CreateMapWizardModal(app, plugin, {
					directory: plugin.settings.mapsFolder
				}).open();
			}))
		.addButton(button => button
			.setButtonText('快速创建')
			.onClick(() => {
				closeModal();
				new CreateMapModal(app, {
					directory: plugin.settings.mapsFolder,
					propertyAliases: plugin.settings.propertyAliases,
					onCreated: () => {
						// Note: Control Center is closed, so we can't refresh
					}
				}).open();
			}))
		.addButton(button => button
			.setButtonText('导入 JSON')
			.onClick(() => {
				importMapFromJson(mapsGridContainer, options);
			}));

	// Gallery section with heading
	const gallerySection = customMapsContent.createDiv({ cls: 'cr-map-gallery-section' });
	gallerySection.createEl('h4', { text: '图库', cls: 'cr-map-gallery-heading' });

	// Placeholder for loading maps
	const mapsGridContainer = gallerySection.createDiv();
	mapsGridContainer.createEl('p', {
		text: '正在加载自定义地图…',
		cls: 'crc-text--muted'
	});

	container.appendChild(customMapsCard);

	// Load custom maps asynchronously
	void loadCustomMapsGrid(mapsGridContainer, options);

	// Card 3: Visualizations
	const vizCard = createCard({
		title: '可视化',
		icon: 'activity',
		subtitle: '迁移与关系网络图'
	});

	const vizContent = vizCard.querySelector('.crc-card__content') as HTMLElement;

	new Setting(vizContent)
		.setName('迁移图')
		.setDesc('可视化从出生地到去世地的迁移模式')
		.addButton(button => button
			.setButtonText('查看图表')
			.onClick(() => {
				new MigrationDiagramModal(app).open();
			}));

	new Setting(vizContent)
		.setName('地点层级')
		.setDesc('以网络图形式可视化地点关系')
		.addButton(button => button
			.setButtonText('查看层级')
			.onClick(() => {
				new PlaceNetworkModal(app).open();
			}));

	container.appendChild(vizCard);

	// Card 4: Place Timeline
	const placeTimelineCard = createCard({
		title: '地点时间轴',
		icon: 'map-pin',
		subtitle: '某地点随时间发生的事件'
	});

	const placeTimelineContent = placeTimelineCard.querySelector('.crc-card__content') as HTMLElement;

	const eventService = plugin.getEventService();
	if (eventService) {
		renderPlaceTimelineCard(
			placeTimelineContent,
			app,
			plugin.settings,
			eventService,
			{
				onPlaceSelect: (_placeName) => {
					// Could navigate to place on map in future
				}
			}
		);
	} else {
		placeTimelineContent.createEl('p', {
			text: '事件服务不可用。',
			cls: 'crc-text--muted'
		});
	}

	container.appendChild(placeTimelineCard);

	// Card 5: Map Statistics
	const statsCard = createCard({
		title: '地图统计',
		icon: 'bar-chart',
		subtitle: '地理数据概览'
	});

	const statsContent = statsCard.querySelector('.crc-card__content') as HTMLElement;
	renderMapStatistics(statsContent, stats, options);

	container.appendChild(statsCard);
}

/* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call -- Match scope of file-level disable at top. */
