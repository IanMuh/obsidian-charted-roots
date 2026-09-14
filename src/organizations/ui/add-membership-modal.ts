/* eslint-disable @typescript-eslint/no-unsafe-assignment -- Obsidian API returns any-typed surfaces (frontmatter, file caches, plugin state); project policy accepts these. */
/**
 * Add Membership Modal
 *
 * Modal for adding an organization membership to a person note.
 */

import { App, Modal, Setting, Notice, TFile, type TextComponent } from 'obsidian';
import type CanvasRootsPlugin from '../../../main';
import type { MembershipRecord, OrganizationInfo } from '../types/organization-types';
import { OrganizationService } from '../services/organization-service';
import { MembershipService } from '../services/membership-service';
import { RoleSuggest } from './role-suggest';

/** Sentinel dropdown value for the "create a new organization" option (#710). */
const NEW_ORGANIZATION_VALUE = '__new_organization__';

/**
 * Modal for adding a membership to a person
 */
export class AddMembershipModal extends Modal {
	private plugin: CanvasRootsPlugin;
	private personFile: TFile;
	private onSuccess: () => void;
	private orgService: OrganizationService;
	private membershipService: MembershipService;

	// Form fields
	private selectedOrg: OrganizationInfo | null = null;
	private role: string = '';
	private fromDate: string = '';
	private toDate: string = '';
	private notes: string = '';

	constructor(app: App, plugin: CanvasRootsPlugin, personFile: TFile, onSuccess: () => void) {
		super(app);
		this.plugin = plugin;
		this.personFile = personFile;
		this.onSuccess = onSuccess;
		this.orgService = new OrganizationService(plugin);
		this.membershipService = new MembershipService(plugin, this.orgService);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('cr-add-membership-modal');

		// Get person name
		const cache = this.app.metadataCache.getFileCache(this.personFile);
		const personName = cache?.frontmatter?.name || this.personFile.basename;

		contentEl.createEl('h2', { text: '添加成员身份' });
		contentEl.createEl('p', {
			text: `正在为以下人物添加成员身份：${personName}`,
			cls: 'crc-text-muted'
		});

		// Organization selector
		const orgs = this.orgService.getAllOrganizations();

		if (orgs.length === 0) {
			contentEl.createEl('p', {
				text: '未找到组织。请先创建组织。',
				cls: 'crc-text-muted'
			});

			const buttonContainer = contentEl.createDiv({ cls: 'cr-modal-buttons' });
			const cancelBtn = buttonContainer.createEl('button', { text: '取消' });
			cancelBtn.addEventListener('click', () => this.close());

			const createBtn = buttonContainer.createEl('button', { text: '创建组织', cls: 'mod-cta' });
			createBtn.addEventListener('click', () => this.openCreateOrganization());

			return;
		}

		new Setting(contentEl)
			.setName('组织')
			.setDesc('选择组织')
			.addDropdown(dropdown => {
				dropdown.addOption('', '-- 选择组织 --');
				for (const org of orgs.sort((a, b) => a.name.localeCompare(b.name))) {
					dropdown.addOption(org.crId, org.name);
				}
				// Inline org creation without leaving the modal (#710), matching the
				// "+ New" options in the place / person modals.
				dropdown.addOption(NEW_ORGANIZATION_VALUE, '+ 新建组织');
				dropdown.onChange(value => {
					if (value === NEW_ORGANIZATION_VALUE) {
						this.openCreateOrganization();
						return;
					}
					this.selectedOrg = orgs.find(o => o.crId === value) || null;
					// Attach role suggest with the selected org's roles
					if (roleTextComponent && this.selectedOrg) {
						const effectiveRoles = this.orgService.getEffectiveRoles(this.selectedOrg);
						if (effectiveRoles.length > 0) {
							new RoleSuggest(
								this.app,
								roleTextComponent.inputEl,
								effectiveRoles,
								(val) => { this.role = val; },
								roleTextComponent
							);
						}
					}
				});
			});

		// Role
		let roleTextComponent: TextComponent | null = null;
		new Setting(contentEl)
			.setName('角色')
			.setDesc('组织内的职位或角色')
			.addText(text => {
				text.setPlaceholder('例如：领主、成员、队长')
					.setValue(this.role)
					.onChange(value => this.role = value);
				roleTextComponent = text;
			});

		// From date
		new Setting(contentEl)
			.setName('开始')
			.setDesc('成员身份的开始日期（可选）')
			.addText(text => text
				.setPlaceholder('例如：283 AC、TA 2941')
				.setValue(this.fromDate)
				.onChange(value => this.fromDate = value));

		// To date
		new Setting(contentEl)
			.setName('结束')
			.setDesc('成员身份的结束日期（可选，若仍在任则留空）')
			.addText(text => text
				.setPlaceholder('例如：298 AC')
				.setValue(this.toDate)
				.onChange(value => this.toDate = value));

		// Notes
		new Setting(contentEl)
			.setName('备注')
			.setDesc('关于此成员身份的补充说明（可选）')
			.addText(text => text
				.setPlaceholder('例如：在琼恩·艾林去世后受任命')
				.setValue(this.notes)
				.onChange(value => this.notes = value));

		// Buttons
		const buttonContainer = contentEl.createDiv({ cls: 'cr-modal-buttons' });

		const cancelBtn = buttonContainer.createEl('button', { text: '取消' });
		cancelBtn.addEventListener('click', () => this.close());

		const addBtn = buttonContainer.createEl('button', { text: '添加', cls: 'mod-cta' });
		addBtn.addEventListener('click', () => void this.addMembership());
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}

	/**
	 * Close this modal, open the Create organization modal, and re-open the
	 * membership modal once the org is created so it appears in the dropdown
	 * (#710). Shared by the empty-state button and the "+ New organization"
	 * dropdown option.
	 */
	private openCreateOrganization(): void {
		this.close();
		void (async () => {
			const { CreateOrganizationModal } = await import('./create-organization-modal');
			new CreateOrganizationModal(this.app, this.plugin, () => {
				new AddMembershipModal(this.app, this.plugin, this.personFile, this.onSuccess).open();
			}).open();
		})();
	}

	private async addMembership(): Promise<void> {
		if (!this.selectedOrg) {
			new Notice('请选择一个组织');
			return;
		}

		const membership: MembershipRecord = {
			org: `[[${this.selectedOrg.file.basename}]]`,
			org_id: this.selectedOrg.crId
		};

		if (this.role.trim()) {
			membership.role = this.role.trim();
		}
		if (this.fromDate.trim()) {
			membership.from = this.fromDate.trim();
		}
		if (this.toDate.trim()) {
			membership.to = this.toDate.trim();
		}
		if (this.notes.trim()) {
			membership.notes = this.notes.trim();
		}

		try {
			await this.membershipService.addMembership(this.personFile, membership);
			this.close();
			this.onSuccess();
		} catch (error) {
			new Notice(`添加成员身份失败：${error}`);
		}
	}
}

/* eslint-enable @typescript-eslint/no-unsafe-assignment -- Match scope of file-level disable at top. */
