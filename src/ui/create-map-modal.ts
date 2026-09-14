/**
 * Create/Edit Map Modal
 * Modal for creating and editing custom map notes for fictional/historical worlds
 */

import { App, ButtonComponent, Modal, Setting, TFile, Notice, normalizePath } from 'obsidian';
import { createLucideIcon } from './lucide-icons';
import { isWikilink, extractWikilinkPath, toWikilink } from '../utils/wikilink-resolver';

/**
 * Safely convert frontmatter value to string
 */
function fmToString(value: unknown, fallback = ''): string {
	if (value === undefined || value === null) return fallback;
	if (typeof value === 'object' && value !== null) return JSON.stringify(value);
	// At this point, value is a primitive
	return String(value as string | number | boolean | bigint | symbol);
}

/**
 * Get the property name to write, respecting aliases
 * If user has an alias for this canonical property, return the user's property name
 */
function getWriteProperty(canonical: string, aliases: Record<string, string>): string {
	for (const [userProp, canonicalProp] of Object.entries(aliases)) {
		if (canonicalProp === canonical) {
			return userProp;
		}
	}
	return canonical;
}

/**
 * Data structure for map note frontmatter
 */
interface MapData {
	mapId: string;
	name: string;
	universe: string;
	imagePath: string;
	coordinateSystem: 'geographic' | 'pixel';
	// Geographic bounds (for geographic mode)
	boundsNorth?: number;
	boundsSouth?: number;
	boundsEast?: number;
	boundsWest?: number;
	// Image dimensions (for pixel mode)
	imageWidth?: number;
	imageHeight?: number;
	// Optional
	defaultZoom?: number;
	centerLat?: number;
	centerLng?: number;
}

/**
 * Generate a URL-friendly map ID from a name
 */
function generateMapId(name: string): string {
	return name
		.toLowerCase()
		.replace(/[^a-z0-9\s-]/g, '') // Remove special characters
		.replace(/\s+/g, '-')          // Replace spaces with hyphens
		.replace(/-+/g, '-')           // Collapse multiple hyphens
		.trim();
}

/**
 * Parse map data from frontmatter
 */
function parseMapDataFromFrontmatter(frontmatter: Record<string, unknown>): MapData {
	const coordinateSystem = frontmatter.coordinate_system === 'pixel' ? 'pixel' : 'geographic';

	// Parse bounds - support both flat and nested formats
	let boundsNorth: number | undefined;
	let boundsSouth: number | undefined;
	let boundsEast: number | undefined;
	let boundsWest: number | undefined;

	if (typeof frontmatter.bounds_north === 'number') {
		boundsNorth = frontmatter.bounds_north;
		boundsSouth = frontmatter.bounds_south as number | undefined;
		boundsEast = frontmatter.bounds_east as number | undefined;
		boundsWest = frontmatter.bounds_west as number | undefined;
	} else if (frontmatter.bounds && typeof frontmatter.bounds === 'object') {
		const bounds = frontmatter.bounds as Record<string, unknown>;
		boundsNorth = bounds.north as number | undefined;
		boundsSouth = bounds.south as number | undefined;
		boundsEast = bounds.east as number | undefined;
		boundsWest = bounds.west as number | undefined;
	}

	return {
		mapId: fmToString(frontmatter.map_id, ''),
		name: fmToString(frontmatter.name, ''),
		universe: fmToString(frontmatter.universe, ''),
		imagePath: fmToString(frontmatter.image, ''),
		coordinateSystem,
		boundsNorth,
		boundsSouth,
		boundsEast,
		boundsWest,
		imageWidth: typeof frontmatter.image_width === 'number' ? frontmatter.image_width : undefined,
		imageHeight: typeof frontmatter.image_height === 'number' ? frontmatter.image_height : undefined,
		defaultZoom: typeof frontmatter.default_zoom === 'number' ? frontmatter.default_zoom : undefined
	};
}

/**
 * Modal for creating and editing custom map notes
 */
export class CreateMapModal extends Modal {
	private mapData: MapData;
	private directory: string;
	private onCreated?: (file: TFile) => void;
	private onUpdated?: (file: TFile) => void;
	private propertyAliases: Record<string, string>;

	// Edit mode properties
	private editMode: boolean = false;
	private editingFile?: TFile;

	// UI elements for dynamic updates
	private boundsSection?: HTMLElement;
	private dimensionsSection?: HTMLElement;
	private mapIdInput?: HTMLInputElement;
	private imagePathInput?: HTMLInputElement;
	private directorySettingEl?: HTMLElement;

	constructor(
		app: App,
		options?: {
			directory?: string;
			onCreated?: (file: TFile) => void;
			onUpdated?: (file: TFile) => void;
			propertyAliases?: Record<string, string>;
			// Edit mode options
			editFile?: TFile;
			editFrontmatter?: Record<string, unknown>;
		}
	) {
		super(app);
		this.directory = options?.directory || '';
		this.onCreated = options?.onCreated;
		this.onUpdated = options?.onUpdated;
		this.propertyAliases = options?.propertyAliases || {};

		// Check for edit mode
		if (options?.editFile && options?.editFrontmatter) {
			this.editMode = true;
			this.editingFile = options.editFile;
			this.mapData = parseMapDataFromFrontmatter(options.editFrontmatter);
			// Get directory from file path
			const pathParts = options.editFile.path.split('/');
			pathParts.pop(); // Remove filename
			this.directory = pathParts.join('/');
		} else {
			// Initialize with defaults for create mode
			this.mapData = {
				mapId: '',
				name: '',
				universe: '',
				imagePath: '',
				coordinateSystem: 'geographic',
				boundsNorth: 100,
				boundsSouth: -100,
				boundsEast: 100,
				boundsWest: -100,
				defaultZoom: 2
			};
		}
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		// Add modal class for styling
		this.modalEl.addClass('crc-create-map-modal');

		// Header
		const header = contentEl.createDiv({ cls: 'crc-modal-header' });
		const titleContainer = header.createDiv({ cls: 'crc-modal-title' });
		const icon = createLucideIcon('globe', 24);
		titleContainer.appendChild(icon);
		titleContainer.appendText(this.editMode ? '编辑自定义地图' : '创建自定义地图');

		// Description
		contentEl.createEl('p', {
			text: this.editMode
				? '编辑地图配置。更改将保存到 frontmatter。'
				: '为虚构世界或历史地图创建地图笔记。自定义地图可用于地图视图，以显示宇宙中的地点。',
			cls: 'crc-modal-description'
		});

		// Form container
		const form = contentEl.createDiv({ cls: 'crc-form' });

		// Name (required)
		new Setting(form)
			.setName('名称')
			.setDesc('地图的显示名称')
			.addText(text => text
				.setPlaceholder('例如：Middle-earth、Westeros')
				.setValue(this.mapData.name)
				.onChange(value => {
					this.mapData.name = value;
					// Auto-generate map ID from name (only in create mode if not manually edited)
					if (!this.editMode && this.mapIdInput && !this.mapIdInput.dataset.manuallyEdited) {
						const generatedId = generateMapId(value);
						this.mapData.mapId = generatedId;
						this.mapIdInput.value = generatedId;
					}
				}));

		// Map ID (required, auto-generated in create mode)
		new Setting(form)
			.setName('地图 ID')
			.setDesc(this.editMode
				? '唯一标识符（更改可能破坏引用）'
				: '唯一标识符（根据名称自动生成，或输入自定义值）')
			.addText(text => {
				this.mapIdInput = text.inputEl;
				text.setPlaceholder('例如：middle-earth')
					.setValue(this.mapData.mapId)
					.onChange(value => {
						this.mapData.mapId = value;
						// Mark as manually edited to prevent auto-overwrite
						if (this.mapIdInput) {
							this.mapIdInput.dataset.manuallyEdited = 'true';
						}
					});
			});

		// In edit mode, mark the map ID as already manually set
		if (this.editMode && this.mapIdInput) {
			this.mapIdInput.dataset.manuallyEdited = 'true';
		}

		// Universe (required)
		new Setting(form)
			.setName('宇宙')
			.setDesc('此地图所属的虚构世界或设定')
			.addText(text => text
				.setPlaceholder('例如：tolkien、westeros、star-wars')
				.setValue(this.mapData.universe)
				.onChange(value => {
					this.mapData.universe = value;
				}));

		// Image path (required)
		const imagePathSetting = new Setting(form)
			.setName('图片路径')
			.setDesc('库中地图图片文件的路径');

		imagePathSetting.addText(text => {
			this.imagePathInput = text.inputEl;
			// Display the path without wikilink brackets for readability
			const displayPath = extractWikilinkPath(this.mapData.imagePath);
			text.setPlaceholder('例如：assets/maps/middle-earth.jpg')
				.setValue(displayPath)
				.onChange(value => {
					// If user manually types a path, convert to wikilink
					this.mapData.imagePath = isWikilink(value) ? value : toWikilink(value);
				});
		});

		imagePathSetting.addButton(btn => {
			btn.setButtonText('浏览')
				.onClick(() => {
					this.browseForImage();
				});
		});

		// Coordinate system
		new Setting(form)
			.setName('坐标系统')
			.setDesc('地理坐标使用纬度/经度；像素坐标使用图像坐标')
			.addDropdown(dropdown => dropdown
				.addOption('geographic', '地理坐标（纬度/经度）')
				.addOption('pixel', '像素坐标（图像坐标）')
				.setValue(this.mapData.coordinateSystem)
				.onChange(value => {
					this.mapData.coordinateSystem = value as 'geographic' | 'pixel';
					this.updateCoordinateSystemVisibility();
				}));

		// Bounds section (for geographic mode)
		this.boundsSection = form.createDiv({ cls: 'crc-bounds-section' });

		const boundsHeader = new Setting(this.boundsSection)
			.setName('地图边界')
			.setDesc('定义地图图像的坐标边界');
		boundsHeader.settingEl.addClass('crc-section-header');

		const boundsGrid = this.boundsSection.createDiv({ cls: 'crc-bounds-grid' });

		// North
		new Setting(boundsGrid)
			.setName('北')
			.addText(text => text
				.setPlaceholder('100')
				.setValue(this.mapData.boundsNorth?.toString() || '')
				.onChange(value => {
					this.mapData.boundsNorth = parseFloat(value) || undefined;
				}));

		// South
		new Setting(boundsGrid)
			.setName('南')
			.addText(text => text
				.setPlaceholder('-100')
				.setValue(this.mapData.boundsSouth?.toString() || '')
				.onChange(value => {
					this.mapData.boundsSouth = parseFloat(value) || undefined;
				}));

		// East
		new Setting(boundsGrid)
			.setName('东')
			.addText(text => text
				.setPlaceholder('100')
				.setValue(this.mapData.boundsEast?.toString() || '')
				.onChange(value => {
					this.mapData.boundsEast = parseFloat(value) || undefined;
				}));

		// West
		new Setting(boundsGrid)
			.setName('西')
			.addText(text => text
				.setPlaceholder('-100')
				.setValue(this.mapData.boundsWest?.toString() || '')
				.onChange(value => {
					this.mapData.boundsWest = parseFloat(value) || undefined;
				}));

		// Image dimensions section (for pixel mode)
		this.dimensionsSection = form.createDiv({ cls: 'crc-dimensions-section' });

		const dimsHeader = new Setting(this.dimensionsSection)
			.setName('图片尺寸')
			.setDesc('地图图像的尺寸（可选，未指定时自动检测）');
		dimsHeader.settingEl.addClass('crc-section-header');

		const dimsGrid = this.dimensionsSection.createDiv({ cls: 'crc-dims-grid' });

		new Setting(dimsGrid)
			.setName('宽度')
			.addText(text => text
				.setPlaceholder('例如：2048')
				.setValue(this.mapData.imageWidth?.toString() || '')
				.onChange(value => {
					this.mapData.imageWidth = parseInt(value) || undefined;
				}));

		new Setting(dimsGrid)
			.setName('高度')
			.addText(text => text
				.setPlaceholder('例如：1536')
				.setValue(this.mapData.imageHeight?.toString() || '')
				.onChange(value => {
					this.mapData.imageHeight = parseInt(value) || undefined;
				}));

		// Default zoom
		new Setting(form)
			.setName('默认缩放')
			.setDesc('打开地图时的初始缩放级别（通常为 0-5）')
			.addText(text => text
				.setPlaceholder('2')
				.setValue(this.mapData.defaultZoom?.toString() || '')
				.onChange(value => {
					this.mapData.defaultZoom = parseInt(value) || undefined;
				}));

		// Directory setting (only show in create mode)
		if (!this.editMode) {
			const dirSetting = new Setting(form)
				.setName('文件夹')
				.setDesc('在何处创建地图笔记')
				.addText(text => text
					.setPlaceholder('例如：Maps')
					.setValue(this.directory)
					.onChange(value => {
						this.directory = value;
					}));
			this.directorySettingEl = dirSetting.settingEl;
		}

		// Set initial visibility based on coordinate system
		this.updateCoordinateSystemVisibility();

		// Buttons
		const buttonContainer = contentEl.createDiv({ cls: 'crc-modal-buttons' });

		new ButtonComponent(buttonContainer)
			.setButtonText('取消')
			.onClick(() => {
				this.close();
			});

		new ButtonComponent(buttonContainer)
			.setButtonText(this.editMode ? '保存更改' : '创建地图')
			.setCta()
			.onClick(() => {
				if (this.editMode) {
					void this.updateMap();
				} else {
					void this.createMap();
				}
			});
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}

	/**
	 * Update visibility of bounds vs dimensions sections based on coordinate system
	 */
	private updateCoordinateSystemVisibility(): void {
		if (this.boundsSection && this.dimensionsSection) {
			if (this.mapData.coordinateSystem === 'geographic') {
				this.boundsSection.removeClass('crc-hidden');
				this.dimensionsSection.addClass('crc-hidden');
			} else {
				this.boundsSection.addClass('crc-hidden');
				this.dimensionsSection.removeClass('crc-hidden');
			}
		}
	}

	/**
	 * Browse for an image file in the vault
	 */
	private browseForImage(): void {
		// Get all image files in the vault
		const imageExtensions = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'];
		const allFiles = this.app.vault.getFiles();
		const imageFiles = allFiles.filter(f =>
			imageExtensions.includes(f.extension.toLowerCase())
		);

		if (imageFiles.length === 0) {
			new Notice('库中未找到图片文件');
			return;
		}

		// Create a simple file picker modal
		const picker = new ImagePickerModal(this.app, imageFiles, (selectedPath) => {
			// Store as wikilink format so Obsidian can auto-update when file moves
			const wikilink = toWikilink(selectedPath);
			this.mapData.imagePath = wikilink;
			if (this.imagePathInput) {
				// Display the path without brackets for readability
				this.imagePathInput.value = selectedPath;
			}
		});
		picker.open();
	}

	/**
	 * Validate required fields
	 */
	private validate(): boolean {
		if (!this.mapData.name.trim()) {
			new Notice('请输入地图名称');
			return false;
		}

		if (!this.mapData.mapId.trim()) {
			new Notice('请输入地图 ID');
			return false;
		}

		if (!this.mapData.universe.trim()) {
			new Notice('请输入宇宙/世界名称');
			return false;
		}

		if (!this.mapData.imagePath.trim()) {
			new Notice('请指定图片路径');
			return false;
		}

		// Validate bounds for geographic mode
		if (this.mapData.coordinateSystem === 'geographic') {
			if (
				this.mapData.boundsNorth === undefined ||
				this.mapData.boundsSouth === undefined ||
				this.mapData.boundsEast === undefined ||
				this.mapData.boundsWest === undefined
			) {
				new Notice('请指定全部四项边界值（北、南、东、西）');
				return false;
			}
		}

		return true;
	}

	/**
	 * Create a new map note
	 */
	private async createMap(): Promise<void> {
		if (!this.validate()) return;

		try {
			// Ensure directory exists
			if (this.directory) {
				const normalizedDir = normalizePath(this.directory);
				const folder = this.app.vault.getAbstractFileByPath(normalizedDir);
				if (!folder) {
					await this.app.vault.createFolder(normalizedDir);
				}
			}

			// Generate frontmatter
			const frontmatter = this.generateFrontmatter();

			// Create filename from name
			const filename = this.mapData.name.replace(/[\\/:*?"<>|]/g, '-') + '.md';
			const filepath = this.directory
				? normalizePath(`${this.directory}/${filename}`)
				: filename;

			// Check if file already exists
			const existingFile = this.app.vault.getAbstractFileByPath(filepath);
			if (existingFile) {
				new Notice(`文件已存在于 ${filepath}`);
				return;
			}

			// Create the note content
			const content = `---\n${frontmatter}---\n\n# ${this.mapData.name}\n\nThis is a custom map for the ${this.mapData.universe} universe.\n`;

			const file = await this.app.vault.create(filepath, content);

			new Notice(`已创建地图笔记：${file.basename}`);

			if (this.onCreated) {
				this.onCreated(file);
			}

			// Open the file
			await this.app.workspace.getLeaf(false).openFile(file);

			this.close();
		} catch (error) {
			console.error('Failed to create map note:', error);
			new Notice(`创建地图笔记失败：${error instanceof Error ? error.message : '未知错误'}`);
		}
	}

	/**
	 * Update an existing map note
	 */
	private async updateMap(): Promise<void> {
		if (!this.validate()) return;

		if (!this.editingFile) {
			new Notice('没有可更新的文件');
			return;
		}

		try {
			// Read the current file content
			const content = await this.app.vault.read(this.editingFile);

			// Find and replace frontmatter
			const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
			if (!frontmatterMatch) {
				new Notice('无法在文件中找到 frontmatter');
				return;
			}

			const newFrontmatter = this.generateFrontmatter();
			const newContent = content.replace(
				/^---\n[\s\S]*?\n---/,
				`---\n${newFrontmatter}---`
			);

			await this.app.vault.modify(this.editingFile, newContent);

			new Notice(`已更新地图笔记：${this.editingFile.basename}`);

			if (this.onUpdated) {
				this.onUpdated(this.editingFile);
			}

			this.close();
		} catch (error) {
			console.error('Failed to update map note:', error);
			new Notice(`更新地图笔记失败：${error instanceof Error ? error.message : '未知错误'}`);
		}
	}

	/**
	 * Generate YAML frontmatter for the map note
	 */
	private generateFrontmatter(): string {
		// Helper to get aliased property name
		const prop = (canonical: string) => getWriteProperty(canonical, this.propertyAliases);

		// Quote the image path if it's a wikilink to prevent YAML from parsing [[...]] as array
		const imagePath = this.mapData.imagePath.startsWith('[[')
			? `"${this.mapData.imagePath}"`
			: this.mapData.imagePath;

		const lines: string[] = [
			`${prop('cr_type')}: map`,
			`map_id: ${this.mapData.mapId}`,
			`${prop('name')}: ${this.mapData.name}`,
			`${prop('universe')}: ${this.mapData.universe}`,
			`image: ${imagePath}`,
			`coordinate_system: ${this.mapData.coordinateSystem}`
		];

		if (this.mapData.coordinateSystem === 'geographic') {
			// Add bounds using flat properties
			lines.push(`bounds_north: ${this.mapData.boundsNorth}`);
			lines.push(`bounds_south: ${this.mapData.boundsSouth}`);
			lines.push(`bounds_east: ${this.mapData.boundsEast}`);
			lines.push(`bounds_west: ${this.mapData.boundsWest}`);
		} else {
			// Add image dimensions if specified
			if (this.mapData.imageWidth !== undefined) {
				lines.push(`image_width: ${this.mapData.imageWidth}`);
			}
			if (this.mapData.imageHeight !== undefined) {
				lines.push(`image_height: ${this.mapData.imageHeight}`);
			}
		}

		if (this.mapData.defaultZoom !== undefined) {
			lines.push(`default_zoom: ${this.mapData.defaultZoom}`);
		}

		return lines.join('\n') + '\n';
	}
}

/**
 * Simple image picker modal
 */
class ImagePickerModal extends Modal {
	private files: TFile[];
	private onSelect: (path: string) => void;
	private searchInput?: HTMLInputElement;
	private listContainer?: HTMLElement;

	constructor(app: App, files: TFile[], onSelect: (path: string) => void) {
		super(app);
		this.files = files;
		this.onSelect = onSelect;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('crc-image-picker-modal');

		// Header
		contentEl.createEl('h3', { text: '选择地图图片' });

		// Search input
		const searchContainer = contentEl.createDiv({ cls: 'crc-search-container' });
		this.searchInput = searchContainer.createEl('input', {
			type: 'text',
			placeholder: '搜索图片……',
			cls: 'crc-search-input'
		});
		this.searchInput.addEventListener('input', () => this.filterFiles());

		// File list
		this.listContainer = contentEl.createDiv({ cls: 'crc-file-list' });
		this.renderFiles(this.files);

		// Focus search
		this.searchInput.focus();
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}

	private filterFiles(): void {
		const query = this.searchInput?.value.toLowerCase() || '';
		const filtered = this.files.filter(f =>
			f.path.toLowerCase().includes(query) ||
			f.basename.toLowerCase().includes(query)
		);
		this.renderFiles(filtered);
	}

	private renderFiles(files: TFile[]): void {
		if (!this.listContainer) return;
		this.listContainer.empty();

		if (files.length === 0) {
			this.listContainer.createEl('p', {
				text: '未找到匹配的图片',
				cls: 'crc-no-results'
			});
			return;
		}

		// Group by folder
		const byFolder = new Map<string, TFile[]>();
		for (const file of files) {
			const folder = file.parent?.path || '/';
			if (!byFolder.has(folder)) {
				byFolder.set(folder, []);
			}
			byFolder.get(folder)!.push(file);
		}

		// Render grouped
		for (const [folder, folderFiles] of byFolder.entries()) {
			if (byFolder.size > 1) {
				this.listContainer.createEl('div', {
					text: folder || '根目录',
					cls: 'crc-folder-header'
				});
			}

			for (const file of folderFiles) {
				const item = this.listContainer.createDiv({ cls: 'crc-file-item' });
				item.createSpan({ text: file.basename, cls: 'crc-file-name' });
				item.createSpan({ text: file.extension, cls: 'crc-file-ext' });

				item.addEventListener('click', () => {
					this.onSelect(file.path);
					this.close();
				});
			}
		}
	}
}