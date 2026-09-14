/**
 * Create Organization Modal
 *
 * Modal for creating or editing organization notes with proper frontmatter.
 */

import { App, Modal, Setting, Notice, TFile } from 'obsidian';
import type CanvasRootsPlugin from '../../../main';
import type { OrganizationType, OrganizationInfo } from '../types/organization-types';
import { getAllOrganizationTypes, getOrganizationType } from '../constants/organization-type-defaults';
import { OrganizationService } from '../services/organization-service';
import { extractDisplayLabel } from '../../utils/wikilink-resolver';
import { ModalStatePersistence, renderResumePromptBanner } from '../../ui/modal-state-persistence';
import { getDefaultUniverse } from '../../settings';

/**
 * Form data structure for persistence
 */
interface OrganizationFormData {
	name: string;
	orgType: OrganizationType;
	parentOrg: string;
	universe: string;
	founded: string;
	dissolved: string;
	motto: string;
	seat: string;
	roles: string[];
	folder: string;
}

/**
 * Options for the CreateOrganizationModal
 */
export interface CreateOrganizationModalOptions {
	onSuccess: () => void;
	/** For edit mode: the organization to edit */
	editOrg?: OrganizationInfo;
	/** For edit mode: the file to update */
	editFile?: TFile;
}

/**
 * Modal for creating or editing organization notes
 */
export class CreateOrganizationModal extends Modal {
	private plugin: CanvasRootsPlugin;
	private onSuccess: () => void;

	// Edit mode properties
	private editMode: boolean = false;
	private editingFile?: TFile;

	// Form fields
	private name: string = '';
	private orgType: OrganizationType = 'custom';
	private parentOrg: string = '';
	private universe: string = '';
	private founded: string = '';
	private dissolved: string = '';
	private motto: string = '';
	private seat: string = '';
	private roles: string[] = [];
	private folder: string;

	// State persistence
	private persistence?: ModalStatePersistence<OrganizationFormData>;
	private savedSuccessfully: boolean = false;
	private resumeBanner?: HTMLElement;

	constructor(app: App, plugin: CanvasRootsPlugin, options: CreateOrganizationModalOptions | (() => void)) {
		super(app);
		this.plugin = plugin;

		// Support both old signature (callback) and new signature (options object)
		if (typeof options === 'function') {
			this.onSuccess = options;
		} else {
			this.onSuccess = options.onSuccess;

			// Check for edit mode
			if (options.editOrg && options.editFile) {
				this.editMode = true;
				this.editingFile = options.editFile;
				// Populate form fields from existing organization
				this.name = options.editOrg.name;
				this.orgType = options.editOrg.orgType;
				this.parentOrg = options.editOrg.parentOrgLink || '';
				this.universe = options.editOrg.universe || '';
				this.founded = options.editOrg.founded || '';
				this.dissolved = options.editOrg.dissolved || '';
				this.motto = options.editOrg.motto || '';
				this.seat = options.editOrg.seat || '';
				this.roles = options.editOrg.roles ? [...options.editOrg.roles] : [];
			}
		}

		this.folder = plugin.settings.organizationsFolder;

		// Apply the default universe to brand-new organizations (#751).
		if (!this.editMode) {
			this.universe = getDefaultUniverse(plugin.settings) || '';
		}

		// Set up persistence (only in create mode)
		if (!this.editMode) {
			this.persistence = new ModalStatePersistence<OrganizationFormData>(this.plugin, 'organization');
		}
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('cr-create-org-modal');

		contentEl.createEl('h2', { text: this.editMode ? '编辑组织' : '创建组织' });

		// Check for persisted state (only in create mode)
		if (this.persistence && !this.editMode) {
			const existingState = this.persistence.getValidState();
			if (existingState) {
				const timeAgo = this.persistence.getTimeAgoString(existingState);
				this.resumeBanner = renderResumePromptBanner(
					contentEl,
					timeAgo,
					() => {
						// Discard - clear state and remove banner
						void this.persistence?.clear();
						this.resumeBanner?.remove();
						this.resumeBanner = undefined;
					},
					() => {
						// Restore - populate form with saved data
						this.restoreFromPersistedState(existingState.formData as unknown as OrganizationFormData);
						this.resumeBanner?.remove();
						this.resumeBanner = undefined;
						// Re-render form with restored data
						contentEl.empty();
						this.onOpen();
					}
				);
			}
		}

		// Name
		new Setting(contentEl)
			.setName('名称')
			.setDesc('组织的显示名称')
			.addText(text => text
				.setPlaceholder('例如：史塔克家族')
				.setValue(this.name)
				.onChange(value => this.name = value));

		// Organization type
		const allOrgTypes = getAllOrganizationTypes(this.plugin.settings.customOrganizationTypes || []);
		new Setting(contentEl)
			.setName('类型')
			.setDesc('组织的分类')
			.addDropdown(dropdown => {
				for (const typeDef of allOrgTypes) {
					dropdown.addOption(typeDef.id, typeDef.name);
				}
				dropdown.setValue(this.orgType);
				dropdown.onChange(value => {
					this.orgType = value as OrganizationType;
					// Auto-populate default roles from type template if roles are currently empty
					if (this.roles.length === 0) {
						const typeDef = getOrganizationType(
							value,
							this.plugin.settings.customOrganizationTypes,
							this.plugin.settings.organizationTypeCustomizations
						);
						if (typeDef.defaultRoles && typeDef.defaultRoles.length > 0) {
							this.roles = [...typeDef.defaultRoles];
							renderRolesEditor();
						}
					}
				});
			});

		// Roles editor
		const rolesContainer = contentEl.createDiv();
		const renderRolesEditor = () => {
			rolesContainer.empty();

			const roleSetting = new Setting(rolesContainer)
				.setName('角色')
				.setDesc('定义成员的可用角色（按显示顺序）');

			let addInput: HTMLInputElement | null = null;
			roleSetting.addText(text => {
				text.setPlaceholder('添加角色…');
				addInput = text.inputEl;
				text.inputEl.addEventListener('keydown', (e: KeyboardEvent) => {
					if (e.key === 'Enter') {
						e.preventDefault();
						const value = text.getValue().trim();
						if (value && !this.roles.includes(value)) {
							this.roles.push(value);
							text.setValue('');
							renderRolesEditor();
						}
					}
				});
			});
			roleSetting.addButton(btn => btn
				.setIcon('plus')
				.setTooltip('添加角色')
				.onClick(() => {
					if (!addInput) return;
					const value = addInput.value.trim();
					if (value && !this.roles.includes(value)) {
						this.roles.push(value);
						addInput.value = '';
						renderRolesEditor();
					}
				}));

			if (this.roles.length > 0) {
				const chipList = rolesContainer.createDiv({ cls: 'cr-roles-chip-list' });
				for (let i = 0; i < this.roles.length; i++) {
					const chip = chipList.createDiv({ cls: 'cr-roles-chip' });
					chip.createSpan({ text: this.roles[i] });
					const removeBtn = chip.createEl('button', {
						cls: 'cr-roles-chip__remove',
						attr: { 'aria-label': `移除 ${this.roles[i]}` }
					});
					removeBtn.textContent = '\u00d7';
					const idx = i;
					removeBtn.addEventListener('click', () => {
						this.roles.splice(idx, 1);
						renderRolesEditor();
					});
				}
			}
		};
		renderRolesEditor();

		// Parent organization. Strip wikilink brackets / paths / pipe-aliases
		// for display so users see "Jedi Order" rather than
		// "Charted Roots/Organizations/Jedi Order|Jedi Order" (#549). The
		// underlying `this.parentOrg` is updated to the cleaned form on edit;
		// `updateOrganization` re-canonicalizes via createSmartWikilink on
		// save (idempotent when already canonical).
		new Setting(contentEl)
			.setName('上级组织')
			.setDesc('层级中的可选上级（wikilink）')
			.addText(text => text
				.setPlaceholder('[[上级组织]]')
				.setValue(extractDisplayLabel(this.parentOrg))
				.onChange(value => this.parentOrg = value));

		// Universe
		new Setting(contentEl)
			.setName('宇宙')
			.setDesc('可选的宇宙范围（例如：维斯特洛、中土世界）')
			.addText(text => text
				.setPlaceholder('例如：维斯特洛')
				.setValue(this.universe)
				.onChange(value => this.universe = value));

		// Collapsible optional details
		const detailsEl = contentEl.createEl('details', { cls: 'cr-create-org-details' });
		detailsEl.createEl('summary', { text: '可选详情' });

		// Founded
		new Setting(detailsEl)
			.setName('成立')
			.setDesc('成立日期（支持虚构日期）')
			.addText(text => text
				.setPlaceholder('例如：英雄纪元、TA 2000')
				.setValue(this.founded)
				.onChange(value => this.founded = value));

		// Dissolved
		new Setting(detailsEl)
			.setName('解散')
			.setDesc('组织解散的日期（支持虚构日期）')
			.addText(text => text
				.setPlaceholder('例如：TA 2050')
				.setValue(this.dissolved)
				.onChange(value => this.dissolved = value));

		// Motto
		new Setting(detailsEl)
			.setName('格言')
			.setDesc('组织的格言或口号')
			.addText(text => text
				.setPlaceholder('例如：凛冬将至')
				.setValue(this.motto)
				.onChange(value => this.motto = value));

		// Seat. Same display-cleanup + writer-rewrap pattern as parent_org
		// above (#549).
		new Setting(detailsEl)
			.setName('驻地')
			.setDesc('主要地点（指向地点笔记的 wikilink）')
			.addText(text => text
				.setPlaceholder('[[临冬城]]')
				.setValue(extractDisplayLabel(this.seat))
				.onChange(value => this.seat = value));

		// Folder (only in create mode)
		if (!this.editMode) {
			new Setting(detailsEl)
				.setName('文件夹')
				.setDesc('创建笔记所在的文件夹')
				.addText(text => text
					.setPlaceholder('Charted Roots/Organizations')
					.setValue(this.folder)
					.onChange(value => this.folder = value));
		}

		// Buttons
		const buttonContainer = contentEl.createDiv({ cls: 'cr-modal-buttons' });

		const cancelBtn = buttonContainer.createEl('button', { text: '取消' });
		cancelBtn.addEventListener('click', () => this.close());

		const submitBtn = buttonContainer.createEl('button', {
			text: this.editMode ? '保存' : '创建',
			cls: 'mod-cta'
		});
		submitBtn.addEventListener('click', () => {
			if (this.editMode) {
				void this.updateOrganization();
			} else {
				void this.createOrganization();
			}
		});
	}

	onClose() {
		const { contentEl } = this;

		// Persist state if not saved successfully and we have persistence enabled
		if (this.persistence && !this.editMode && !this.savedSuccessfully) {
			const formData = this.gatherFormData();
			if (this.persistence.hasContent(formData)) {
				void this.persistence.persist(formData);
			}
		}

		contentEl.empty();
	}

	/**
	 * Gather current form data for persistence
	 */
	private gatherFormData(): OrganizationFormData {
		return {
			name: this.name,
			orgType: this.orgType,
			parentOrg: this.parentOrg,
			universe: this.universe,
			founded: this.founded,
			dissolved: this.dissolved,
			motto: this.motto,
			seat: this.seat,
			roles: this.roles,
			folder: this.folder
		};
	}

	/**
	 * Restore form state from persisted data
	 */
	private restoreFromPersistedState(formData: OrganizationFormData): void {
		this.name = formData.name || '';
		this.orgType = formData.orgType || 'custom';
		this.parentOrg = formData.parentOrg || '';
		this.universe = formData.universe || '';
		this.founded = formData.founded || '';
		this.dissolved = formData.dissolved || '';
		this.motto = formData.motto || '';
		this.seat = formData.seat || '';
		this.roles = Array.isArray(formData.roles) ? formData.roles : [];
		if (formData.folder) {
			this.folder = formData.folder;
		}
	}

	private async createOrganization(): Promise<void> {
		if (!this.name.trim()) {
			new Notice('请输入组织名称');
			return;
		}

		try {
			const orgService = new OrganizationService(this.plugin);
			await orgService.createOrganization(this.name.trim(), this.orgType, {
				parentOrg: this.parentOrg.trim() || undefined,
				universe: this.universe.trim() || undefined,
				founded: this.founded.trim() || undefined,
				dissolved: this.dissolved.trim() || undefined,
				motto: this.motto.trim() || undefined,
				seat: this.seat.trim() || undefined,
				roles: this.roles.length > 0 ? this.roles : undefined,
				folder: this.folder.trim() || undefined
			});

			// Mark as saved successfully and clear persisted state
			this.savedSuccessfully = true;
			if (this.persistence) {
				void this.persistence.clear();
			}

			this.close();
			this.onSuccess();
		} catch (error) {
			new Notice(`创建组织失败：${error}`);
		}
	}

	private async updateOrganization(): Promise<void> {
		if (!this.name.trim()) {
			new Notice('请输入组织名称');
			return;
		}

		if (!this.editingFile) {
			new Notice('没有可更新的文件');
			return;
		}

		try {
			const orgService = new OrganizationService(this.plugin);
			await orgService.updateOrganization(this.editingFile, {
				name: this.name.trim(),
				orgType: this.orgType,
				parentOrg: this.parentOrg.trim() || undefined,
				universe: this.universe.trim() || undefined,
				founded: this.founded.trim() || undefined,
				dissolved: this.dissolved.trim() || undefined,
				motto: this.motto.trim() || undefined,
				seat: this.seat.trim() || undefined,
				roles: this.roles
			});

			this.close();
			this.onSuccess();
		} catch (error) {
			new Notice(`更新组织失败：${error}`);
		}
	}
}