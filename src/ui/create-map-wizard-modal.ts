/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument -- Obsidian API returns any-typed surfaces (frontmatter, file caches, plugin state); project policy accepts these. */
/**
 * Create Map Wizard Modal
 *
 * A step-by-step wizard for creating custom maps with optional initial places.
 *
 * Steps:
 * - Step 1: Select image from vault
 * - Step 2: Configure map (name, universe, coordinate system)
 * - Step 3: Add places (optional, click on map to add)
 * - Step 4: Review and create
 */

import { App, ButtonComponent, Modal, Notice, Setting, setIcon, TFile, normalizePath } from 'obsidian';
import type CanvasRootsPlugin from '../../main';
import { createLucideIcon } from './lucide-icons';
import { getLogger } from '../core/logging';
import { generateCrId } from '../core/uuid';
import { toWikilink, extractWikilinkPath, normalizeLabelValue } from '../utils/wikilink-resolver';
import { ModalStatePersistence, renderResumePromptBanner } from './modal-state-persistence';
import { RegionDrawingModal } from '../maps/ui/region-drawing-modal';

const logger = getLogger('CreateMapWizard');

/**
 * Form data for persistence
 */
interface MapWizardFormData {
	currentStep: WizardStep;
	mapConfig: MapConfig;
	pendingPlaces: PendingPlace[];
}

/**
 * Wizard steps
 */
type WizardStep = 'step1' | 'step2' | 'step3' | 'step4' | 'complete';

/**
 * Coordinate system type
 */
type CoordinateSystem = 'pixel' | 'geographic';

/**
 * Pending place to be created
 */
interface PendingPlace {
	id: string;
	name: string;
	pixelX: number;
	pixelY: number;
}

/**
 * Map configuration data
 */
interface MapConfig {
	imagePath: string;
	imageWidth: number;
	imageHeight: number;
	name: string;
	mapId: string;
	universe: string;
	parentMap: string;
	parentRegion?: { x: number; y: number; w: number; h: number };
	coordinateSystem: CoordinateSystem;
	// Geographic bounds (for geographic mode)
	boundsNorth?: number;
	boundsSouth?: number;
	boundsEast?: number;
	boundsWest?: number;
	// Zoom settings
	defaultZoom?: number;
	minZoom?: number;
	maxZoom?: number;
}

/**
 * Create Map Wizard Modal
 */
export class CreateMapWizardModal extends Modal {
	private plugin: CanvasRootsPlugin;
	private currentStep: WizardStep = 'step1';
	private mapConfig: MapConfig;
	private pendingPlaces: PendingPlace[] = [];
	private directory: string;
	private createdFiles: TFile[] = [];

	// UI elements
	private imagePreviewEl?: HTMLElement;
	private mapPreviewContainer?: HTMLElement;
	private showNewUniverseInput = false;

	// Persistence
	private persistence: ModalStatePersistence<MapWizardFormData>;
	private savedSuccessfully = false;

	constructor(app: App, plugin: CanvasRootsPlugin, options?: {
		directory?: string;
		preselectedImage?: TFile;
	}) {
		super(app);
		this.plugin = plugin;
		this.directory = options?.directory || plugin.settings.mapsFolder || 'Maps';
		this.persistence = new ModalStatePersistence(plugin, 'map-wizard');

		// Initialize map config
		this.mapConfig = {
			imagePath: '',
			imageWidth: 0,
			imageHeight: 0,
			name: '',
			mapId: '',
			universe: '',
			parentMap: '',
			coordinateSystem: 'pixel', // Default to pixel for fantasy maps
			defaultZoom: 1,
			minZoom: 0,
			maxZoom: 4
		};

		// If preselected image, set it
		if (options?.preselectedImage) {
			this.mapConfig.imagePath = toWikilink(options.preselectedImage.path);
			void this.loadImageDimensions(options.preselectedImage.path);
		}
	}

	onOpen(): void {
		this.modalEl.addClass('crc-map-wizard-modal');

		// Check for existing state
		const existingState = this.persistence.getValidState();
		if (existingState) {
			this.renderResumePrompt(existingState);
		} else {
			this.render();
		}
	}

	onClose(): void {
		const { contentEl } = this;
		contentEl.empty();

		// Persist state if not saved successfully and has content
		if (!this.savedSuccessfully) {
			const formData: MapWizardFormData = {
				currentStep: this.currentStep,
				mapConfig: this.mapConfig,
				pendingPlaces: this.pendingPlaces
			};
			if (this.persistence.hasContent(formData)) {
				void this.persistence.persist(formData);
			}
		}
	}

	/**
	 * Render resume prompt for existing state
	 */
	private renderResumePrompt(existingState: { formData: Record<string, unknown>; savedAt: number }): void {
		const { contentEl } = this;
		contentEl.empty();

		this.renderHeader('恢复上次会话？');

		const timeAgo = this.persistence.getTimeAgoString({ ...existingState, modalType: 'map-wizard' });

		renderResumePromptBanner(
			contentEl,
			timeAgo,
			() => {
				// Discard - clear state and start fresh
				void this.persistence.clear();
				this.render();
			},
			() => {
				// Restore - load the saved state
				const data = existingState.formData as unknown as MapWizardFormData;
				if (data.currentStep) this.currentStep = data.currentStep;
				if (data.mapConfig) this.mapConfig = { ...this.mapConfig, ...data.mapConfig };
				if (data.pendingPlaces) this.pendingPlaces = [...data.pendingPlaces];
				void this.persistence.clear();
				this.render();
			}
		);

		// Show a preview of what will be restored
		const previewSection = contentEl.createDiv({ cls: 'crc-wizard-resume-preview' });
		const data = existingState.formData as unknown as MapWizardFormData;

		if (data.mapConfig?.name) {
			previewSection.createDiv({ cls: 'crc-wizard-resume-preview-item', text: `地图：${data.mapConfig.name}` });
		}
		if (data.mapConfig?.imagePath) {
			const imagePath = extractWikilinkPath(data.mapConfig.imagePath);
			const filename = imagePath.split('/').pop() || imagePath;
			previewSection.createDiv({ cls: 'crc-wizard-resume-preview-item', text: `图片：${filename}` });
		}
		if (data.pendingPlaces && data.pendingPlaces.length > 0) {
			previewSection.createDiv({ cls: 'crc-wizard-resume-preview-item', text: `地点：${data.pendingPlaces.length} 个待创建` });
		}
	}

	/**
	 * Main render method
	 */
	private render(): void {
		const { contentEl } = this;
		contentEl.empty();

		switch (this.currentStep) {
			case 'step1':
				this.renderStep1();
				break;
			case 'step2':
				this.renderStep2();
				break;
			case 'step3':
				this.renderStep3();
				break;
			case 'step4':
				this.renderStep4();
				break;
			case 'complete':
				this.renderComplete();
				break;
		}
	}

	/**
	 * Render header
	 */
	private renderHeader(subtitle: string): void {
		const { contentEl } = this;

		const header = contentEl.createDiv({ cls: 'crc-modal-header' });
		const titleContainer = header.createDiv({ cls: 'crc-modal-title' });
		const icon = createLucideIcon('map', 24);
		titleContainer.appendChild(icon);
		titleContainer.appendText('创建自定义地图');

		// Subtitle
		header.createDiv({ cls: 'crc-modal-subtitle', text: subtitle });
	}

	/**
	 * Render step indicator
	 */
	private renderStepIndicator(currentStepNum: number): void {
		const { contentEl } = this;
		const indicator = contentEl.createDiv({ cls: 'crc-wizard-step-indicator' });

		const steps = [
			{ num: 1, label: '图片' },
			{ num: 2, label: '配置' },
			{ num: 3, label: '地点' },
			{ num: 4, label: '确认' }
		];

		steps.forEach((step, index) => {
			if (index > 0) {
				const connector = indicator.createDiv({ cls: 'crc-wizard-step-connector' });
				if (step.num <= currentStepNum) {
					connector.addClass('crc-wizard-step-connector--completed');
				}
			}

			const stepEl = indicator.createDiv({ cls: 'crc-wizard-step' });
			stepEl.textContent = String(step.num);

			if (step.num === currentStepNum) {
				stepEl.addClass('crc-wizard-step--active');
			} else if (step.num < currentStepNum) {
				stepEl.addClass('crc-wizard-step--completed');
				stepEl.empty();
				setIcon(stepEl, 'check');
			}
		});
	}

	/**
	 * Render footer with navigation buttons
	 */
	private renderFooter(options: {
		onBack?: () => void;
		onNext?: () => void;
		backLabel?: string;
		nextLabel?: string;
		nextDisabled?: boolean;
		showSkip?: boolean;
		onSkip?: () => void;
	}): void {
		const { contentEl } = this;
		const footer = contentEl.createDiv({ cls: 'crc-modal-buttons' });

		if (options.onBack) {
			new ButtonComponent(footer)
				.setButtonText(options.backLabel || '上一步')
				.onClick(options.onBack);
		} else {
			// Cancel button
			new ButtonComponent(footer)
				.setButtonText('取消')
				.onClick(() => this.close());
		}

		const rightButtons = footer.createDiv({ cls: 'crc-btn-group' });

		if (options.showSkip && options.onSkip) {
			new ButtonComponent(rightButtons)
				.setButtonText('跳过')
				.onClick(options.onSkip);
		}

		if (options.onNext) {
			const nextBtn = new ButtonComponent(rightButtons)
				.setButtonText(options.nextLabel || '下一步')
				.setCta()
				.onClick(options.onNext);
			if (options.nextDisabled) {
				nextBtn.setDisabled(true);
			}
		}
	}

	// ========================================
	// STEP 1: SELECT IMAGE
	// ========================================

	private renderStep1(): void {
		const { contentEl } = this;

		this.renderHeader('第1步，共4步：选择图片');
		this.renderStepIndicator(1);

		const content = contentEl.createDiv({ cls: 'crc-wizard-content' });

		const sectionTitle = content.createEl('h3', { cls: 'crc-wizard-section-title' });
		sectionTitle.setText('地图图片');

		const sectionDesc = content.createEl('p', { cls: 'crc-wizard-section-desc' });
		sectionDesc.setText('从库中选择一张图片作为地图背景。');

		// Image selection area
		if (this.mapConfig.imagePath) {
			// Show preview
			this.renderImagePreview(content);
		} else {
			// Show picker
			this.renderImagePicker(content);
		}

		// Footer
		this.renderFooter({
			onNext: () => {
				if (!this.mapConfig.imagePath) {
					new Notice('请选择一张图片');
					return;
				}
				this.currentStep = 'step2';
				this.render();
			},
			nextDisabled: !this.mapConfig.imagePath
		});
	}

	private renderImagePicker(container: HTMLElement): void {
		const picker = container.createDiv({ cls: 'crc-wizard-image-picker' });

		const pickerIcon = picker.createDiv({ cls: 'crc-wizard-image-picker-icon' });
		setIcon(pickerIcon, 'image');

		picker.createDiv({ cls: 'crc-wizard-image-picker-text', text: '点击浏览库中的图片' });
		picker.createDiv({ cls: 'crc-wizard-image-picker-hint', text: '支持 PNG、JPG、WebP、SVG' });

		picker.addEventListener('click', () => {
			this.browseForImage();
		});
	}

	private renderImagePreview(container: HTMLElement): void {
		this.imagePreviewEl = container.createDiv({ cls: 'crc-wizard-image-preview' });

		// Thumbnail
		const thumbnail = this.imagePreviewEl.createDiv({ cls: 'crc-wizard-image-preview-thumbnail' });
		const displayPath = extractWikilinkPath(this.mapConfig.imagePath);
		const file = this.app.vault.getAbstractFileByPath(displayPath);
		if (file instanceof TFile) {
			const imgEl = thumbnail.createEl('img');
			imgEl.src = this.app.vault.getResourcePath(file);
		} else {
			setIcon(thumbnail, 'image');
		}

		// Info
		const info = this.imagePreviewEl.createDiv({ cls: 'crc-wizard-image-preview-info' });
		const filename = displayPath.split('/').pop() || displayPath;
		info.createDiv({ cls: 'crc-wizard-image-preview-name', text: filename });
		info.createDiv({ cls: 'crc-wizard-image-preview-path', text: displayPath });

		if (this.mapConfig.imageWidth && this.mapConfig.imageHeight) {
			const dims = info.createDiv({ cls: 'crc-wizard-image-preview-dimensions' });
			setIcon(dims, 'ruler');
			dims.createSpan({ text: `${this.mapConfig.imageWidth} × ${this.mapConfig.imageHeight} px` });
		}

		// Change button
		const changeLink = info.createEl('a', {
			cls: 'crc-wizard-image-preview-change',
			text: '更换图片'
		});
		changeLink.addEventListener('click', (e) => {
			e.preventDefault();
			this.browseForImage();
		});
	}

	private browseForImage(): void {
		const imageExtensions = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'];
		const allFiles = this.app.vault.getFiles();
		const imageFiles = allFiles.filter(f =>
			imageExtensions.includes(f.extension.toLowerCase())
		);

		if (imageFiles.length === 0) {
			new Notice('库中未找到图片文件');
			return;
		}

		const picker = new ImagePickerModal(this.app, imageFiles, (selectedPath) => {
			void (async () => {
				this.mapConfig.imagePath = toWikilink(selectedPath);
				await this.loadImageDimensions(selectedPath);
				this.render();
			})();
		});
		picker.open();
	}

	private async loadImageDimensions(path: string): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile)) return;

		return new Promise((resolve) => {
			const img = new Image();
			img.onload = () => {
				this.mapConfig.imageWidth = img.naturalWidth;
				this.mapConfig.imageHeight = img.naturalHeight;
				resolve();
			};
			img.onerror = () => {
				logger.warn('image-load', 'Failed to load image dimensions', { path });
				resolve();
			};
			img.src = this.app.vault.getResourcePath(file);
		});
	}

	// ========================================
	// STEP 2: CONFIGURE MAP
	// ========================================

	private renderStep2(): void {
		const { contentEl } = this;

		this.renderHeader('第2步，共4步：配置');
		this.renderStepIndicator(2);

		const content = contentEl.createDiv({ cls: 'crc-wizard-content' });

		const form = content.createDiv({ cls: 'crc-form' });

		// Name (required)
		new Setting(form)
			.setName('地图名称')
			.setDesc('将用作笔记的文件名')
			.addText(text => {
				text.setPlaceholder('例如：Middle-earth 地图')
					.setValue(this.mapConfig.name)
					.onChange(value => {
						this.mapConfig.name = value;
						// Auto-generate map ID
						this.mapConfig.mapId = this.generateMapId(value);
					});
				window.setTimeout(() => text.inputEl.focus(), 50);
			});

		// Universe (optional)
		const universes = this.getExistingUniverses();
		const universeSetting = new Setting(form)
			.setName('宇宙')
			.setDesc('将此地图关联到一个宇宙（可选）');

		if (universes.length === 0 || this.showNewUniverseInput) {
			// No existing universes or user chose to create new - show text input
			universeSetting.addText(text => {
				text.setPlaceholder('输入宇宙名称……')
					.setValue(this.mapConfig.universe)
					.onChange(value => {
						this.mapConfig.universe = value;
					});
			});

			// Add link to show dropdown if universes exist
			if (universes.length > 0) {
				const switchLink = universeSetting.controlEl.createEl('a', {
					cls: 'crc-wizard-switch-link',
					text: '选择现有宇宙'
				});
				switchLink.addEventListener('click', (e) => {
					e.preventDefault();
					this.showNewUniverseInput = false;
					this.render();
				});
			}
		} else {
			// Show dropdown with existing universes
			universeSetting.addDropdown(dropdown => {
				dropdown.addOption('', '选择宇宙……');
				for (const u of universes) {
					dropdown.addOption(u, u);
				}
				dropdown.addOption('__new__', '+ 创建新宇宙……');
				dropdown.setValue(this.mapConfig.universe)
					.onChange(value => {
						if (value === '__new__') {
							this.showNewUniverseInput = true;
							this.mapConfig.universe = '';
							this.render();
						} else {
							this.mapConfig.universe = value;
						}
					});
			});
		}

		// Parent map (optional, for nested maps #361)
		const existingMaps = this.getExistingMaps();
		if (existingMaps.length > 0) {
			new Setting(form)
				.setName('父级地图')
				.setDesc('将此地图嵌套在另一地图下（可选，启用面包屑导航）')
				.addDropdown(dropdown => {
					dropdown.addOption('', '无');
					for (const map of existingMaps) {
						dropdown.addOption(map.id, map.name);
					}
					dropdown.setValue(this.mapConfig.parentMap)
						.onChange(value => {
							this.mapConfig.parentMap = value;
							// Clear region if parent map changed
							if (!value) {
								this.mapConfig.parentRegion = undefined;
							}
							this.render();
						});
				});

			// Draw region button (only when parent map is selected) (#362)
			if (this.mapConfig.parentMap) {
				const regionSetting = new Setting(form)
					.setName('父级区域')
					.setDesc(this.mapConfig.parentRegion
						? `区域：x=${this.mapConfig.parentRegion.x}, y=${this.mapConfig.parentRegion.y}, w=${this.mapConfig.parentRegion.w}, h=${this.mapConfig.parentRegion.h}`
						: '在父级地图上绘制此子地图所在的区域（可选）');

				regionSetting.addButton(button => {
					button
						.setButtonText(this.mapConfig.parentRegion ? '编辑区域' : '绘制区域')
						.onClick(() => {
							this.openRegionDrawingModal();
						});
				});

				if (this.mapConfig.parentRegion) {
					regionSetting.addButton(button => {
						button
							.setButtonText('清除')
							.onClick(() => {
								this.mapConfig.parentRegion = undefined;
								this.render();
							});
					});
				}
			}
		}

		// Coordinate system
		new Setting(form)
			.setName('坐标系统')
			.setDesc('奇幻地图推荐使用像素坐标')
			.addDropdown(dropdown => {
				dropdown
					.addOption('pixel', '像素坐标（推荐）')
					.addOption('geographic', '地理坐标（纬度/经度）')
					.setValue(this.mapConfig.coordinateSystem)
					.onChange(value => {
						this.mapConfig.coordinateSystem = value as CoordinateSystem;
						this.render(); // Re-render to show/hide bounds
					});
			});

		// Geographic bounds (only for geographic mode)
		if (this.mapConfig.coordinateSystem === 'geographic') {
			const boundsSection = form.createDiv({ cls: 'crc-wizard-bounds-section' });
			boundsSection.createEl('h4', { text: '地图边界', cls: 'crc-wizard-bounds-title' });

			const boundsGrid = boundsSection.createDiv({ cls: 'crc-wizard-bounds-grid' });

			// North
			new Setting(boundsGrid)
				.setName('北')
				.addText(text => text
					.setPlaceholder('90')
					.setValue(this.mapConfig.boundsNorth?.toString() || '')
					.onChange(value => {
						this.mapConfig.boundsNorth = parseFloat(value) || undefined;
					}));

			// South
			new Setting(boundsGrid)
				.setName('南')
				.addText(text => text
					.setPlaceholder('-90')
					.setValue(this.mapConfig.boundsSouth?.toString() || '')
					.onChange(value => {
						this.mapConfig.boundsSouth = parseFloat(value) || undefined;
					}));

			// East
			new Setting(boundsGrid)
				.setName('东')
				.addText(text => text
					.setPlaceholder('180')
					.setValue(this.mapConfig.boundsEast?.toString() || '')
					.onChange(value => {
						this.mapConfig.boundsEast = parseFloat(value) || undefined;
					}));

			// West
			new Setting(boundsGrid)
				.setName('西')
				.addText(text => text
					.setPlaceholder('-180')
					.setValue(this.mapConfig.boundsWest?.toString() || '')
					.onChange(value => {
						this.mapConfig.boundsWest = parseFloat(value) || undefined;
					}));
		}

		// Advanced options (collapsible)
		const advancedHeader = form.createDiv({ cls: 'crc-wizard-collapsible-header' });
		const advancedArrow = advancedHeader.createSpan({ text: '▶' });
		advancedHeader.createSpan({ text: ' 高级选项' });

		const advancedContent = form.createDiv({ cls: 'crc-wizard-collapsible-content crc-hidden' });

		advancedHeader.addEventListener('click', () => {
			if (advancedContent.hasClass('crc-hidden')) {
				advancedContent.removeClass('crc-hidden');
				advancedArrow.textContent = '▼';
			} else {
				advancedContent.addClass('crc-hidden');
				advancedArrow.textContent = '▶';
			}
		});

		// Default zoom
		new Setting(advancedContent)
			.setName('默认缩放')
			.addText(text => text
				.setPlaceholder('1')
				.setValue(this.mapConfig.defaultZoom?.toString() || '')
				.onChange(value => {
					this.mapConfig.defaultZoom = parseInt(value) || undefined;
				}));

		// Min/Max zoom in a row
		const zoomRow = advancedContent.createDiv({ cls: 'crc-form-row-inline' });

		new Setting(zoomRow)
			.setName('最小缩放')
			.addText(text => text
				.setPlaceholder('0')
				.setValue(this.mapConfig.minZoom?.toString() || '')
				.onChange(value => {
					this.mapConfig.minZoom = parseInt(value) || undefined;
				}));

		new Setting(zoomRow)
			.setName('最大缩放')
			.addText(text => text
				.setPlaceholder('4')
				.setValue(this.mapConfig.maxZoom?.toString() || '')
				.onChange(value => {
					this.mapConfig.maxZoom = parseInt(value) || undefined;
				}));

		// Footer
		this.renderFooter({
			onBack: () => {
				this.currentStep = 'step1';
				this.render();
			},
			onNext: () => {
				if (!this.mapConfig.name.trim()) {
					new Notice('请输入地图名称');
					return;
				}
				this.currentStep = 'step3';
				this.render();
			},
			nextLabel: '下一步：添加地点'
		});
	}

	private generateMapId(name: string): string {
		return name
			.toLowerCase()
			.replace(/[^a-z0-9\s-]/g, '')
			.replace(/\s+/g, '-')
			.replace(/-+/g, '-')
			.trim();
	}

	private getExistingUniverses(): string[] {
		const universes = new Set<string>();
		const files = this.app.vault.getMarkdownFiles();

		// Collect universe note names (the canonical display names)
		for (const file of files) {
			const cache = this.app.metadataCache.getFileCache(file);
			const fm = cache?.frontmatter;
			if (!fm) continue;
			const crType = fm.cr_type || fm.type;
			if (crType === 'universe' && fm.name) {
				universes.add(fm.name);
			}
		}

		// Also collect universe references from entity notes (for cases where
		// a universe string is used without a universe note)
		for (const file of files) {
			const cache = this.app.metadataCache.getFileCache(file);
			const fm = cache?.frontmatter;
			if (!fm?.universe || typeof fm.universe !== 'string') continue;
			const crType = fm.cr_type || fm.type;
			// Skip map notes — they may store cr_ids instead of names
			if (crType === 'map') continue;
			// Normalize so [[X]] / X / [[X|X]] collapse to one option (#755)
			universes.add(normalizeLabelValue(fm.universe));
		}

		return Array.from(universes).sort();
	}

	/**
	 * Get existing custom maps for the parent map dropdown (#361)
	 */
	/**
	 * Open the region drawing modal for the selected parent map (#362)
	 */
	private openRegionDrawingModal(): void {
		const parentMapId = this.mapConfig.parentMap;
		if (!parentMapId) return;

		// Find the parent map's config from frontmatter
		const parentConfig = this.getMapConfigFromFrontmatter(parentMapId);
		if (!parentConfig) {
			new Notice('无法找到父级地图配置');
			return;
		}

		const childName = this.mapConfig.name || '新地图';
		new RegionDrawingModal(
			this.app,
			parentConfig,
			childName,
			(result) => {
				this.mapConfig.parentRegion = result;
				this.render();
			},
			this.mapConfig.parentRegion
		).open();
	}

	/**
	 * Build a minimal CustomMapConfig from a map note's frontmatter (#362)
	 */
	private getMapConfigFromFrontmatter(mapId: string): import('../maps/types/map-types').CustomMapConfig | null {
		const files = this.app.vault.getMarkdownFiles();
		for (const file of files) {
			const cache = this.app.metadataCache.getFileCache(file);
			const fm = cache?.frontmatter;
			if (!fm) continue;
			const crType = fm.cr_type || fm.type;
			if (crType !== 'map' || fm.map_id !== mapId) continue;

			const coordSystem = fm.coordinate_system === 'geographic' ? 'geographic' : 'pixel';
			const imgW = typeof fm.image_width === 'number' ? fm.image_width : 1000;
			const imgH = typeof fm.image_height === 'number' ? fm.image_height : 1000;

			return {
				id: fm.map_id,
				name: fm.name || mapId,
				universe: fm.universe || '',
				imagePath: fm.image || '',
				coordinateSystem: coordSystem,
				bounds: coordSystem === 'pixel'
					? { topLeft: { x: 0, y: imgH }, bottomRight: { x: imgW, y: 0 } }
					: {
						topLeft: { x: fm.bounds_west ?? -100, y: fm.bounds_north ?? 100 },
						bottomRight: { x: fm.bounds_east ?? 100, y: fm.bounds_south ?? -100 }
					},
				imageDimensions: { width: imgW, height: imgH },
				sourcePath: file.path
			};
		}
		return null;
	}

	private getExistingMaps(): Array<{ id: string; name: string }> {
		const maps: Array<{ id: string; name: string }> = [];
		const files = this.app.vault.getMarkdownFiles();

		for (const file of files) {
			const cache = this.app.metadataCache.getFileCache(file);
			const fm = cache?.frontmatter;
			if (!fm) continue;
			const crType = fm.cr_type || fm.type;
			if (crType === 'map' && fm.map_id && fm.name) {
				maps.push({ id: fm.map_id, name: fm.name });
			}
		}

		return maps.sort((a, b) => a.name.localeCompare(b.name));
	}

	// ========================================
	// STEP 3: ADD PLACES (OPTIONAL)
	// ========================================

	private renderStep3(): void {
		const { contentEl } = this;

		this.renderHeader('第3步，共4步：添加地点（可选）');
		this.renderStepIndicator(3);

		const content = contentEl.createDiv({ cls: 'crc-wizard-content crc-wizard-content--map' });

		const sectionDesc = content.createEl('p', { cls: 'crc-wizard-section-desc' });
		sectionDesc.setText('点击地图以添加地点。你可以跳过此步骤，稍后再添加。');

		// Map preview container
		this.mapPreviewContainer = content.createDiv({ cls: 'crc-wizard-map-preview-container' });
		const mapPreview = this.mapPreviewContainer.createDiv({ cls: 'crc-wizard-map-preview' });

		// Instructions overlay
		const instructions = mapPreview.createDiv({ cls: 'crc-wizard-map-instructions' });
		setIcon(instructions, 'map-pin');
		instructions.createSpan({ text: '点击地图以添加地点' });

		// Load map image
		const displayPath = extractWikilinkPath(this.mapConfig.imagePath);
		const file = this.app.vault.getAbstractFileByPath(displayPath);
		let imgElRef: HTMLImageElement | null = null;

		if (file instanceof TFile) {
			const imgEl = mapPreview.createEl('img', { cls: 'crc-wizard-map-image' });
			imgEl.src = this.app.vault.getResourcePath(file);
			imgElRef = imgEl;

			// Click handler for adding places
			imgEl.addEventListener('click', (e) => {
				const imgRect = imgEl.getBoundingClientRect();
				const containerRect = mapPreview.getBoundingClientRect();

				// Calculate click position relative to image (not container)
				const clickXOnImage = e.clientX - imgRect.left;
				const clickYOnImage = e.clientY - imgRect.top;

				// Convert to image pixel coordinates
				// X: left-to-right (0 = left edge)
				const x = Math.round((clickXOnImage / imgRect.width) * this.mapConfig.imageWidth);
				// Y: In DOM, 0 is at top. For Leaflet Simple CRS, 0 is at bottom.
				// Flip Y so stored coordinates work with Leaflet: y = imageHeight - domY
				const domY = Math.round((clickYOnImage / imgRect.height) * this.mapConfig.imageHeight);
				const y = this.mapConfig.imageHeight - domY;

				// For input positioning, calculate relative to container but accounting for image offset
				const inputX = e.clientX - containerRect.left;
				const inputY = e.clientY - containerRect.top;

				this.showPlaceInput(mapPreview, inputX, inputY, x, y);
			});
		}

		// Render existing markers
		this.renderPlaceMarkers(mapPreview, imgElRef);

		// Pending places list
		if (this.pendingPlaces.length > 0) {
			this.renderPendingPlacesList(content);
		}

		// Footer
		this.renderFooter({
			onBack: () => {
				this.currentStep = 'step2';
				this.render();
			},
			onNext: () => {
				this.currentStep = 'step4';
				this.render();
			},
			nextLabel: '确认',
			showSkip: this.pendingPlaces.length === 0,
			onSkip: () => {
				this.currentStep = 'step4';
				this.render();
			}
		});
	}

	private renderPlaceMarkers(container: HTMLElement, imgEl: HTMLImageElement | null): void {
		if (!imgEl) return;

		this.pendingPlaces.forEach((place, index) => {
			const marker = container.createDiv({ cls: 'crc-wizard-place-marker crc-wizard-place-marker--draggable' });
			marker.textContent = String(index + 1);

			// Position marker relative to container, but calculate based on image position
			// The image may not fill the container exactly, so we need to account for the image's position
			const updateMarkerPosition = () => {
				const containerRect = container.getBoundingClientRect();
				const imgRect = imgEl.getBoundingClientRect();

				// Calculate where on the image the place should be (as percentage of image)
				// place.pixelX: 0 = left edge (same as DOM)
				const xPercent = place.pixelX / this.mapConfig.imageWidth;
				// place.pixelY is in Leaflet format (0 = bottom), convert to DOM (0 = top)
				const domY = this.mapConfig.imageHeight - place.pixelY;
				const yPercent = domY / this.mapConfig.imageHeight;

				// Convert to position within the image
				const xOnImage = xPercent * imgRect.width;
				const yOnImage = yPercent * imgRect.height;

				// Account for image offset within container
				const imageOffsetLeft = imgRect.left - containerRect.left;
				const imageOffsetTop = imgRect.top - containerRect.top;

				marker.style.left = `${imageOffsetLeft + xOnImage}px`;
				marker.style.top = `${imageOffsetTop + yOnImage}px`;
			};

			// Position after image loads
			if (imgEl.complete) {
				updateMarkerPosition();
			} else {
				imgEl.addEventListener('load', updateMarkerPosition, { once: true });
			}

			marker.setAttribute('title', `${place.name}（拖动以移动）`);

			// Make marker draggable
			this.makeDraggable(marker, place, imgEl);
		});
	}

	/**
	 * Make a marker element draggable
	 */
	private makeDraggable(marker: HTMLElement, place: PendingPlace, imgEl: HTMLImageElement): void {
		let isDragging = false;
		let offsetX = 0; // Offset from mouse to marker center
		let offsetY = 0;

		const onMouseDown = (e: MouseEvent) => {
			e.preventDefault();
			e.stopPropagation();
			isDragging = true;

			// Calculate offset from mouse position to marker center
			// This ensures the marker doesn't "jump" when we start dragging
			const markerRect = marker.getBoundingClientRect();
			offsetX = e.clientX - (markerRect.left + markerRect.width / 2);
			offsetY = e.clientY - (markerRect.top + markerRect.height / 2);

			marker.addClass('crc-wizard-place-marker--dragging');
			activeDocument.addEventListener('mousemove', onMouseMove);
			activeDocument.addEventListener('mouseup', onMouseUp);
		};

		const onMouseMove = (e: MouseEvent) => {
			if (!isDragging) return;

			const imgRect = imgEl.getBoundingClientRect();
			const containerRect = marker.parentElement?.getBoundingClientRect();
			if (!containerRect) return;

			// Calculate where the marker center should be (accounting for initial offset)
			const targetCenterX = e.clientX - offsetX;
			const targetCenterY = e.clientY - offsetY;

			// Calculate position relative to container
			let newLeft = targetCenterX - containerRect.left;
			let newTop = targetCenterY - containerRect.top;

			// Clamp to image bounds (accounting for image position within container)
			const imageOffsetLeft = imgRect.left - containerRect.left;
			const imageOffsetTop = imgRect.top - containerRect.top;

			newLeft = Math.max(imageOffsetLeft, Math.min(newLeft, imageOffsetLeft + imgRect.width));
			newTop = Math.max(imageOffsetTop, Math.min(newTop, imageOffsetTop + imgRect.height));

			// Update visual position
			marker.style.left = `${newLeft}px`;
			marker.style.top = `${newTop}px`;
		};

		const onMouseUp = () => {
			if (!isDragging) return;
			isDragging = false;
			marker.removeClass('crc-wizard-place-marker--dragging');
			activeDocument.removeEventListener('mousemove', onMouseMove);
			activeDocument.removeEventListener('mouseup', onMouseUp);

			// Calculate final position in image pixel coordinates
			const imgRect = imgEl.getBoundingClientRect();
			const markerRect = marker.getBoundingClientRect();

			// Get marker center position relative to image (DOM coordinates: 0 at top)
			const markerCenterX = markerRect.left + markerRect.width / 2 - imgRect.left;
			const markerCenterY = markerRect.top + markerRect.height / 2 - imgRect.top;

			// Convert to image pixel coordinates
			// X: direct mapping (0 = left edge)
			const newPixelX = Math.round((markerCenterX / imgRect.width) * this.mapConfig.imageWidth);
			// Y: DOM has 0 at top, Leaflet Simple CRS has 0 at bottom - flip it
			const domY = Math.round((markerCenterY / imgRect.height) * this.mapConfig.imageHeight);
			const newPixelY = this.mapConfig.imageHeight - domY;

			// Update place coordinates (clamped to valid range)
			place.pixelX = Math.max(0, Math.min(newPixelX, this.mapConfig.imageWidth));
			place.pixelY = Math.max(0, Math.min(newPixelY, this.mapConfig.imageHeight));

			// Re-render to update the list
			this.render();
		};

		marker.addEventListener('mousedown', onMouseDown);
	}

	private showPlaceInput(container: HTMLElement, clickX: number, clickY: number, pixelX: number, pixelY: number): void {
		// Remove any existing input
		const existingInput = container.querySelector('.crc-wizard-inline-place-input');
		if (existingInput) existingInput.remove();

		const inputContainer = container.createDiv({ cls: 'crc-wizard-inline-place-input' });
		inputContainer.style.left = `${clickX + 10}px`;
		inputContainer.style.top = `${clickY - 20}px`;

		const input = inputContainer.createEl('input', {
			type: 'text',
			placeholder: '地点名称……'
		});

		const addBtn = inputContainer.createEl('button', {
			cls: 'crc-btn crc-btn--primary crc-btn--small',
			text: '添加'
		});

		const cancelBtn = inputContainer.createEl('button', {
			cls: 'crc-btn crc-btn--small',
			text: '×'
		});

		input.focus();

		const addPlace = () => {
			const name = input.value.trim();
			if (name) {
				this.pendingPlaces.push({
					id: generateCrId(),
					name,
					pixelX,
					pixelY
				});
				this.render();
			} else {
				inputContainer.remove();
			}
		};

		addBtn.addEventListener('click', addPlace);
		input.addEventListener('keydown', (e) => {
			if (e.key === 'Enter') addPlace();
			if (e.key === 'Escape') inputContainer.remove();
		});
		cancelBtn.addEventListener('click', () => inputContainer.remove());
	}

	private renderPendingPlacesList(container: HTMLElement): void {
		const section = container.createDiv({ cls: 'crc-wizard-pending-places' });

		const header = section.createDiv({ cls: 'crc-wizard-pending-places-header' });
		header.createSpan({ cls: 'crc-wizard-pending-places-title', text: '待创建地点' });
		header.createSpan({ cls: 'crc-wizard-pending-places-count', text: `${this.pendingPlaces.length} 个地点` });

		this.pendingPlaces.forEach((place, index) => {
			const item = section.createDiv({ cls: 'crc-wizard-pending-place-item' });

			const marker = item.createSpan({ cls: 'crc-wizard-pending-place-marker' });
			marker.textContent = String(index + 1);

			item.createSpan({ cls: 'crc-wizard-pending-place-name', text: place.name });
			item.createSpan({ cls: 'crc-wizard-pending-place-coords', text: `(${place.pixelX}, ${place.pixelY})` });

			const removeBtn = item.createSpan({ cls: 'crc-wizard-pending-place-remove', text: '×' });
			removeBtn.addEventListener('click', () => {
				this.pendingPlaces.splice(index, 1);
				this.render();
			});
		});
	}

	// ========================================
	// STEP 4: REVIEW & CREATE
	// ========================================

	private renderStep4(): void {
		const { contentEl } = this;

		this.renderHeader('第4步，共4步：确认并创建');
		this.renderStepIndicator(4);

		const content = contentEl.createDiv({ cls: 'crc-wizard-content' });

		// Summary header
		const summaryHeader = content.createDiv({ cls: 'crc-wizard-summary-header' });
		const summaryIcon = summaryHeader.createDiv({ cls: 'crc-wizard-summary-icon' });
		setIcon(summaryIcon, 'map');
		summaryHeader.createDiv({ cls: 'crc-wizard-summary-title', text: this.mapConfig.name });

		const placeCount = this.pendingPlaces.length;
		const subtitle = placeCount > 0
			? `准备创建 1 个地图笔记和 ${placeCount} 个地点笔记`
			: '准备创建 1 个地图笔记';
		summaryHeader.createDiv({ cls: 'crc-wizard-summary-subtitle', text: subtitle });

		// Summary list
		const summaryList = content.createDiv({ cls: 'crc-wizard-summary-list' });

		// Map note
		this.renderSummaryItem(summaryList, 'map', '地图笔记', `${this.mapConfig.name}.md`, 'success');

		// Image
		const displayPath = extractWikilinkPath(this.mapConfig.imagePath);
		this.renderSummaryItem(summaryList, 'image', '图片', displayPath, 'muted');

		// Universe
		if (this.mapConfig.universe) {
			this.renderSummaryItem(summaryList, 'globe', '宇宙', this.mapConfig.universe, 'normal');
		}

		// Coordinate system
		const coordLabel = this.mapConfig.coordinateSystem === 'pixel' ? '像素坐标' : '地理坐标（纬度/经度）';
		this.renderSummaryItem(summaryList, 'ruler', '坐标', coordLabel, 'normal');

		// Places to create
		if (this.pendingPlaces.length > 0) {
			const placesSection = content.createDiv({ cls: 'crc-wizard-summary-places' });
			placesSection.createDiv({ cls: 'crc-wizard-summary-places-label', text: `待创建地点（${this.pendingPlaces.length}）：` });

			const placesTags = placesSection.createDiv({ cls: 'crc-wizard-summary-place-tags' });
			this.pendingPlaces.forEach(place => {
				const tag = placesTags.createSpan({ cls: 'crc-wizard-summary-place-tag' });
				setIcon(tag, 'map-pin');
				tag.createSpan({ text: place.name });
			});
		}

		// Footer
		this.renderFooter({
			onBack: () => {
				this.currentStep = 'step3';
				this.render();
			},
			onNext: () => {
				void this.createMap();
			},
			nextLabel: '创建地图'
		});
	}

	private renderSummaryItem(container: HTMLElement, iconName: string, label: string, value: string, style: 'success' | 'muted' | 'normal'): void {
		const item = container.createDiv({ cls: 'crc-wizard-summary-item' });

		const iconEl = item.createDiv({ cls: `crc-wizard-summary-item-icon crc-wizard-summary-item-icon--${style}` });
		setIcon(iconEl, iconName);

		const contentEl = item.createDiv({ cls: 'crc-wizard-summary-item-content' });
		contentEl.createDiv({ cls: 'crc-wizard-summary-item-type', text: label });
		const nameEl = contentEl.createDiv({ cls: 'crc-wizard-summary-item-name' });
		if (style === 'muted') {
			nameEl.addClass('crc-wizard-summary-item-name--muted');
		}
		nameEl.setText(value);
	}

	// ========================================
	// COMPLETE STEP
	// ========================================

	private renderComplete(): void {
		const { contentEl } = this;

		const content = contentEl.createDiv({ cls: 'crc-wizard-content crc-wizard-completion' });

		// Success icon
		const successIcon = content.createDiv({ cls: 'crc-wizard-completion-icon' });
		setIcon(successIcon, 'check-circle');

		content.createEl('h2', { cls: 'crc-wizard-completion-title' }).setText('地图已创建！');
		content.createEl('p', { cls: 'crc-wizard-completion-message' }).setText(
			'你的自定义地图已创建，可以使用了。'
		);

		// Stats
		const stats = content.createDiv({ cls: 'crc-wizard-completion-stats' });

		const mapStat = stats.createDiv({ cls: 'crc-wizard-completion-stat' });
		mapStat.createDiv({ cls: 'crc-wizard-completion-stat-value' }).setText('1');
		mapStat.createDiv({ cls: 'crc-wizard-completion-stat-label' }).setText('已创建地图');

		if (this.pendingPlaces.length > 0) {
			const placesStat = stats.createDiv({ cls: 'crc-wizard-completion-stat' });
			placesStat.createDiv({ cls: 'crc-wizard-completion-stat-value' }).setText(String(this.pendingPlaces.length));
			placesStat.createDiv({ cls: 'crc-wizard-completion-stat-label' }).setText('已创建地点');
		}

		// Created notes list
		if (this.createdFiles.length > 0) {
			const listSection = content.createDiv({ cls: 'crc-wizard-created-notes-list' });
			listSection.createEl('h5').setText('已创建的笔记：');

			this.createdFiles.forEach(file => {
				const item = listSection.createDiv({ cls: 'crc-wizard-created-note-item' });
				const itemIcon = item.createDiv({ cls: 'crc-wizard-created-note-icon' });
				setIcon(itemIcon, 'check');
				item.createDiv({ cls: 'crc-wizard-created-note-name' }).setText(file.basename);

				const openLink = item.createEl('span', { cls: 'crc-wizard-created-note-link' });
				openLink.setText('打开');
				openLink.addEventListener('click', () => {
					void this.app.workspace.openLinkText(file.path, '', false);
				});
			});
		}

		// Footer
		const footer = contentEl.createDiv({ cls: 'crc-modal-buttons crc-modal-buttons--center' });

		new ButtonComponent(footer)
			.setButtonText('在地图视图中打开')
			.setCta()
			.onClick(() => {
				// Open the map in Map View
				void this.openInMapView();
				this.close();
			});

		new ButtonComponent(footer)
			.setButtonText('完成')
			.onClick(() => this.close());
	}

	// ========================================
	// MAP CREATION
	// ========================================

	private async createMap(): Promise<void> {
		try {
			// Ensure directory exists
			const normalizedDir = normalizePath(this.directory);
			const folder = this.app.vault.getAbstractFileByPath(normalizedDir);
			if (!folder) {
				await this.app.vault.createFolder(normalizedDir);
			}

			// Generate frontmatter
			const frontmatter = this.generateMapFrontmatter();

			// Create filename from name
			const filename = this.mapConfig.name.replace(/[\\/:*?"<>|]/g, '-') + '.md';
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
			const content = `---\n${frontmatter}---\n\n# ${this.mapConfig.name}\n\n${this.mapConfig.universe ? `This is a custom map for the ${this.mapConfig.universe} universe.` : 'This is a custom map.'}\n`;

			const mapFile = await this.app.vault.create(filepath, content);
			this.createdFiles.push(mapFile);

			// Create place notes
			if (this.pendingPlaces.length > 0) {
				await this.createPlaceNotes();
			}

			new Notice(`已创建地图：${this.mapConfig.name}`);

			// Mark as saved and clear persistence
			this.savedSuccessfully = true;
			await this.persistence.clear();

			// Show completion
			this.currentStep = 'complete';
			this.render();

		} catch (error) {
			logger.error('create-map', 'Failed to create map', { error });
			new Notice(`创建地图失败：${error instanceof Error ? error.message : '未知错误'}`);
		}
	}

	private generateMapFrontmatter(): string {
		// Quote the image path if it's a wikilink
		const imagePath = this.mapConfig.imagePath.startsWith('[[')
			? `"${this.mapConfig.imagePath}"`
			: this.mapConfig.imagePath;

		const lines: string[] = [
			`cr_type: map`,
			`map_id: ${this.mapConfig.mapId}`,
			`name: ${this.mapConfig.name}`,
			`image: ${imagePath}`,
			`coordinate_system: ${this.mapConfig.coordinateSystem}`
		];

		if (this.mapConfig.universe) {
			lines.push(`universe: ${this.mapConfig.universe}`);
		}

		if (this.mapConfig.parentMap) {
			lines.push(`parent_map: ${this.mapConfig.parentMap}`);
			if (this.mapConfig.parentRegion) {
				lines.push(`parent_region_x: ${this.mapConfig.parentRegion.x}`);
				lines.push(`parent_region_y: ${this.mapConfig.parentRegion.y}`);
				lines.push(`parent_region_w: ${this.mapConfig.parentRegion.w}`);
				lines.push(`parent_region_h: ${this.mapConfig.parentRegion.h}`);
			}
		}

		if (this.mapConfig.coordinateSystem === 'geographic') {
			if (this.mapConfig.boundsNorth !== undefined) lines.push(`bounds_north: ${this.mapConfig.boundsNorth}`);
			if (this.mapConfig.boundsSouth !== undefined) lines.push(`bounds_south: ${this.mapConfig.boundsSouth}`);
			if (this.mapConfig.boundsEast !== undefined) lines.push(`bounds_east: ${this.mapConfig.boundsEast}`);
			if (this.mapConfig.boundsWest !== undefined) lines.push(`bounds_west: ${this.mapConfig.boundsWest}`);
		} else {
			// For pixel mode, store image dimensions
			if (this.mapConfig.imageWidth) lines.push(`image_width: ${this.mapConfig.imageWidth}`);
			if (this.mapConfig.imageHeight) lines.push(`image_height: ${this.mapConfig.imageHeight}`);
		}

		if (this.mapConfig.defaultZoom !== undefined) {
			lines.push(`default_zoom: ${this.mapConfig.defaultZoom}`);
		}

		return lines.join('\n') + '\n';
	}

	private async createPlaceNotes(): Promise<void> {
		const placesFolder = this.plugin.settings.placesFolder || 'Places';

		// Ensure places folder exists
		const normalizedPlacesDir = normalizePath(placesFolder);
		const placesDir = this.app.vault.getAbstractFileByPath(normalizedPlacesDir);
		if (!placesDir) {
			await this.app.vault.createFolder(normalizedPlacesDir);
		}

		for (const place of this.pendingPlaces) {
			const crId = generateCrId();

			// Generate frontmatter for place
			const frontmatter = [
				`cr_type: place`,
				`cr_id: ${crId}`,
				`name: ${place.name}`,
				`place_category: fictional`,
				`custom_coordinates_x: ${place.pixelX}`,
				`custom_coordinates_y: ${place.pixelY}`
			];

			if (this.mapConfig.universe) {
				frontmatter.push(`universe: ${this.mapConfig.universe}`);
			}

			const filename = place.name.replace(/[\\/:*?"<>|]/g, '-') + '.md';
			const filepath = normalizePath(`${placesFolder}/${filename}`);

			// Check if file exists
			const existingFile = this.app.vault.getAbstractFileByPath(filepath);
			if (existingFile) {
				logger.warn('create-place', 'Place file already exists, skipping', { filepath });
				continue;
			}

			const content = `---\n${frontmatter.join('\n')}\n---\n\n# ${place.name}\n`;

			const placeFile = await this.app.vault.create(filepath, content);
			this.createdFiles.push(placeFile);
		}
	}

	private async openInMapView(): Promise<void> {
		// Open Map View with the newly created map selected
		const mapId = this.mapConfig.mapId;

		const leaves = this.app.workspace.getLeavesOfType('canvas-roots-map');
		if (leaves.length > 0) {
			// Activate the existing Map View and switch to the new map
			const leaf = leaves[0];
			await this.app.workspace.revealLeaf(leaf);
			// Set state to switch to the new map
			await leaf.setViewState({
				type: 'canvas-roots-map',
				active: true,
				state: { activeMap: mapId }
			});
		} else {
			// Open a new Map View with the new map selected
			const leaf = this.app.workspace.getLeaf(false);
			await leaf.setViewState({
				type: 'canvas-roots-map',
				active: true,
				state: { activeMap: mapId }
			});
		}
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

	onOpen(): void {
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

	onClose(): void {
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

/* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument -- Match scope of file-level disable at top. */
