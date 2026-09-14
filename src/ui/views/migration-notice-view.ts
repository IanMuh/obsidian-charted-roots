/**
 * Migration Notice View
 *
 * Displays a one-time notice when users upgrade to versions with breaking changes,
 * informing them about data migrations and providing a path to the Cleanup Wizard.
 *
 * Supported migrations:
 * - v0.17.0: Source property format (source, source_2 → sources array)
 * - v0.18.0: Event person property (person → persons array)
 * - v0.18.9: Nested properties redesign (sourced_facts → sourced_*, events → event notes)
 * - v0.19.0: Plugin rename (Canvas Roots → Charted Roots, folder settings reminder)
 */

import { App, ItemView, WorkspaceLeaf, setIcon } from 'obsidian';
import type CanvasRootsPlugin from '../../../main';

export const VIEW_TYPE_MIGRATION_NOTICE = 'canvas-roots-migration-notice';

/**
 * Migration type for the notice
 */
type MigrationType = 'sources' | 'event-persons' | 'nested-properties' | 'folder-settings';

export class MigrationNoticeView extends ItemView {
	private plugin: CanvasRootsPlugin;
	private migrationType: MigrationType;

	constructor(leaf: WorkspaceLeaf, plugin: CanvasRootsPlugin) {
		super(leaf);
		this.plugin = plugin;
		// Determine which migration to show based on current version
		this.migrationType = this.determineMigrationType();
	}

	getViewType(): string {
		return VIEW_TYPE_MIGRATION_NOTICE;
	}

	getDisplayText(): string {
		const version = this.plugin.manifest.version;
		// Check for 0.19.x+ first (folder settings reminder)
		if (this.migrationType === 'folder-settings') {
			return 'Charted Roots v0.19.0';
		}
		// Check for 0.18.9+ (nested properties migration)
		if (this.migrationType === 'nested-properties') {
			return 'Charted Roots v0.18.9';
		}
		if (version.startsWith('0.18')) {
			return 'Charted Roots v0.18.0';
		}
		return 'Charted Roots v0.17.0';
	}

	getIcon(): string {
		return 'info';
	}

	/**
	 * Determine which migration notice to show based on plugin version
	 */
	private determineMigrationType(): MigrationType {
		const version = this.plugin.manifest.version;
		// Check for 0.19.x+ (folder settings reminder after plugin rename)
		if (this.isVersionAtLeast(version, '0.19.0')) {
			return 'folder-settings';
		}
		// Check for 0.18.9+ (nested properties migration)
		if (this.isVersionAtLeast(version, '0.18.9')) {
			return 'nested-properties';
		}
		if (version.startsWith('0.18')) {
			return 'event-persons';
		}
		return 'sources';
	}

	/**
	 * Compare version strings (semver-like comparison)
	 */
	private isVersionAtLeast(current: string, minimum: string): boolean {
		const currentParts = current.split('.').map(p => parseInt(p) || 0);
		const minimumParts = minimum.split('.').map(p => parseInt(p) || 0);

		for (let i = 0; i < Math.max(currentParts.length, minimumParts.length); i++) {
			const curr = currentParts[i] || 0;
			const min = minimumParts[i] || 0;
			if (curr > min) return true;
			if (curr < min) return false;
		}
		return true; // Equal versions
	}

	async onOpen(): Promise<void> {
		const container = this.containerEl.children[1];
		container.empty();
		container.addClass('cr-migration-notice');

		if (this.migrationType === 'folder-settings') {
			this.renderFolderSettingsMigration(container);
		} else if (this.migrationType === 'nested-properties') {
			this.renderNestedPropertiesMigration(container);
		} else if (this.migrationType === 'event-persons') {
			this.renderEventPersonsMigration(container);
		} else {
			this.renderSourcesMigration(container);
		}
	}

	/**
	 * Render the v0.18.0 event persons migration notice
	 */
	private renderEventPersonsMigration(container: Element): void {
		// Header
		const header = container.createDiv({ cls: 'cr-migration-header' });
		const iconEl = header.createSpan({ cls: 'cr-migration-icon' });
		setIcon(iconEl, 'sparkles');
		header.createEl('h2', { text: 'v0.18.0 新功能' });

		// Content
		const content = container.createDiv({ cls: 'cr-migration-content' });

		// Event person format change section
		const section = content.createDiv({ cls: 'cr-migration-section' });
		section.createEl('h3', { text: '事件人物属性整合' });

		section.createEl('p', {
			text: '事件笔记现在使用单个"persons"数组属性，而不再分别使用"person"和"persons"属性。这简化了数据管理，并让所有事件类型都支持多人事件。'
		});

		// Code comparison
		const codeBlock = section.createDiv({ cls: 'cr-migration-code' });

		const oldCode = codeBlock.createDiv({ cls: 'cr-code-example cr-code-old' });
		oldCode.createEl('div', { cls: 'cr-code-label', text: '旧格式（已弃用）' });
		oldCode.createEl('pre', {
			text: `# Single-person event
person: "[[John Smith]]"

# Multi-person event
persons:
  - "[[John Smith]]"
  - "[[Jane Doe]]"`
		});

		const newCode = codeBlock.createDiv({ cls: 'cr-code-example cr-code-new' });
		newCode.createEl('div', { cls: 'cr-code-label', text: '新格式（所有事件）' });
		newCode.createEl('pre', {
			text: `persons:
  - "[[John Smith]]"

# or for multi-person events:
persons:
  - "[[John Smith]]"
  - "[[Jane Doe]]"`
		});

		// Benefits section
		const benefitsSection = content.createDiv({ cls: 'cr-migration-section' });
		benefitsSection.createEl('h3', { text: '优势' });

		const benefitsList = benefitsSection.createEl('ul');
		benefitsList.createEl('li', { text: '所有事件类型使用一致的属性名' });
		benefitsList.createEl('li', { text: '任何事件都可包含多名参与者，无需更改结构' });
		benefitsList.createEl('li', { text: '在 Obsidian Bases 和 Dataview 中查询更简单' });

		// Action section
		const actionSection = content.createDiv({ cls: 'cr-migration-section' });
		actionSection.createEl('h3', { text: '建议操作' });
		actionSection.createEl('p', {
			text: '如果你的事件笔记使用了旧的"person"属性，请运行清理向导自动迁移。新导入将使用数组格式。'
		});

		// Buttons
		this.renderButtons(content);
	}

	/**
	 * Render the v0.18.9 nested properties migration notice
	 */
	private renderNestedPropertiesMigration(container: Element): void {
		// Header
		const header = container.createDiv({ cls: 'cr-migration-header' });
		const iconEl = header.createSpan({ cls: 'cr-migration-icon' });
		setIcon(iconEl, 'sparkles');
		header.createEl('h2', { text: 'v0.18.9 新功能' });

		// Content
		const content = container.createDiv({ cls: 'cr-migration-content' });

		// Introduction
		const introSection = content.createDiv({ cls: 'cr-migration-section' });
		introSection.createEl('p', {
			text: '此版本修复了与 Obsidian 属性面板的兼容性问题。两个功能已改为使用扁平属性格式，可无缝配合 Obsidian 使用。'
		});

		// Get migration status
		const migration = this.plugin.settings.nestedPropertiesMigration || {};
		const sourcedFactsComplete = migration.sourcedFactsComplete ?? false;
		const eventsComplete = migration.eventsComplete ?? false;

		// === Evidence Tracking Migration ===
		const evidenceSection = content.createDiv({ cls: 'cr-migration-section' });
		const evidenceHeader = evidenceSection.createDiv({ cls: 'cr-migration-section-header' });
		if (sourcedFactsComplete) {
			const checkIcon = evidenceHeader.createSpan({ cls: 'cr-migration-check' });
			setIcon(checkIcon, 'check-circle');
		}
		evidenceHeader.createEl('h3', { text: '证据追踪属性格式' });

		evidenceSection.createEl('p', {
			text: '嵌套的 sourced_facts 对象已替换为每种事实类型对应的独立扁平属性。'
		});

		// Code comparison for sourced_facts
		const evidenceCode = evidenceSection.createDiv({ cls: 'cr-migration-code' });

		const oldEvidenceCode = evidenceCode.createDiv({ cls: 'cr-code-example cr-code-old' });
		oldEvidenceCode.createEl('div', { cls: 'cr-code-label', text: '旧格式（嵌套对象）' });
		oldEvidenceCode.createEl('pre', {
			text: `sourced_facts:
  birth_date:
    sources:
      - "[[Census 1870]]"
  death_date:
    sources:
      - "[[Death Certificate]]"`
		});

		const newEvidenceCode = evidenceCode.createDiv({ cls: 'cr-code-example cr-code-new' });
		newEvidenceCode.createEl('div', { cls: 'cr-code-label', text: '新格式（扁平属性）' });
		newEvidenceCode.createEl('pre', {
			text: `sourced_birth_date:
  - "[[Census 1870]]"
sourced_death_date:
  - "[[Death Certificate]]"`
		});

		// === Life Events Migration ===
		const eventsSection = content.createDiv({ cls: 'cr-migration-section' });
		const eventsHeader = eventsSection.createDiv({ cls: 'cr-migration-section-header' });
		if (eventsComplete) {
			const checkIcon = eventsHeader.createSpan({ cls: 'cr-migration-check' });
			setIcon(checkIcon, 'check-circle');
		}
		eventsHeader.createEl('h3', { text: '人生事件属性格式' });

		eventsSection.createEl('p', {
			text: '内联的事件数组已替换为指向独立事件笔记文件的链接。'
		});

		// Code comparison for events
		const eventsCode = eventsSection.createDiv({ cls: 'cr-migration-code' });

		const oldEventsCode = eventsCode.createDiv({ cls: 'cr-code-example cr-code-old' });
		oldEventsCode.createEl('div', { cls: 'cr-code-label', text: '旧格式（内联数组）' });
		oldEventsCode.createEl('pre', {
			text: `events:
  - event_type: residence
    place: "[[New York]]"
    date_from: "1920"`
		});

		const newEventsCode = eventsCode.createDiv({ cls: 'cr-code-example cr-code-new' });
		newEventsCode.createEl('div', { cls: 'cr-code-label', text: '新格式（事件笔记链接）' });
		newEventsCode.createEl('pre', {
			text: `life_events:
  - "[[Events/John Smith - Residence 1920]]"`
		});

		// Benefits section
		const benefitsSection = content.createDiv({ cls: 'cr-migration-section' });
		benefitsSection.createEl('h3', { text: '优势' });

		const benefitsList = benefitsSection.createEl('ul');
		benefitsList.createEl('li', { text: '属性面板中不再出现"类型不匹配"警告' });
		benefitsList.createEl('li', { text: '可安全编辑属性而不会损坏数据' });
		benefitsList.createEl('li', { text: '更好地兼容 Dataview 和 Bases' });
		benefitsList.createEl('li', { text: '每个事件作为独立笔记，支持链接、标签和附件' });

		// Action section
		const actionSection = content.createDiv({ cls: 'cr-migration-section' });
		actionSection.createEl('h3', { text: '建议操作' });
		actionSection.createEl('p', {
			text: '使用清理向导迁移现有数据。插件同时读取新旧两种格式，因此你可以在方便时再迁移。'
		});

		// Buttons with multi-action aware dismiss
		this.renderNestedPropertiesButtons(content, sourcedFactsComplete, eventsComplete);
	}

	/**
	 * Render buttons for nested properties migration (with multi-action completion tracking)
	 */
	private renderNestedPropertiesButtons(content: Element, sourcedFactsComplete: boolean, eventsComplete: boolean): void {
		const buttons = content.createDiv({ cls: 'cr-migration-buttons' });

		const wizardBtn = buttons.createEl('button', {
			cls: 'mod-cta',
			text: '打开清理向导'
		});
		wizardBtn.addEventListener('click', () => {
			this.leaf.detach();
			// Open the cleanup wizard
			this.app.workspace.trigger('canvas-roots:open-cleanup-wizard');
		});

		// Only enable dismiss if both migrations are complete OR user has no data to migrate
		const canDismiss = (sourcedFactsComplete && eventsComplete);
		const dismissBtn = buttons.createEl('button', {
			cls: 'cr-migration-dismiss',
			text: canDismiss ? '关闭' : '完成迁移后可关闭'
		});
		dismissBtn.disabled = !canDismiss;
		if (canDismiss) {
			dismissBtn.addEventListener('click', () => {
				void this.markAsSeen();
				this.leaf.detach();
			});
		}

		// Add skip button for users who want to dismiss without migrating
		const skipBtn = buttons.createEl('button', {
			cls: 'cr-migration-skip',
			text: '暂时跳过'
		});
		skipBtn.addEventListener('click', () => {
			void this.markAsSeen();
			this.leaf.detach();
		});
	}

	/**
	 * Render the v0.19.0 folder settings migration notice
	 * This informs users upgrading from Canvas Roots that folder settings may need updating
	 */
	private renderFolderSettingsMigration(container: Element): void {
		// Header
		const header = container.createDiv({ cls: 'cr-migration-header' });
		const iconEl = header.createSpan({ cls: 'cr-migration-icon' });
		setIcon(iconEl, 'folder-cog');
		header.createEl('h2', { text: '插件已更名为 Charted Roots' });

		// Content
		const content = container.createDiv({ cls: 'cr-migration-content' });

		// Introduction
		const introSection = content.createDiv({ cls: 'cr-migration-section' });
		introSection.createEl('p', {
			text: 'Canvas Roots 已更名为 Charted Roots。你的画布文件和代码块已自动迁移。'
		});

		// Folder settings warning
		const warningSection = content.createDiv({ cls: 'cr-migration-section' });
		warningSection.createEl('h3', { text: '检查你的文件夹设置' });

		warningSection.createEl('p', {
			text: '默认文件夹路径已从"Canvas Roots/..."变为"Charted Roots/..."。如果你此前使用默认文件夹，你的设置现在可能指向与现有文件不同的位置。'
		});

		// Code comparison showing old vs new defaults
		const codeBlock = warningSection.createDiv({ cls: 'cr-migration-code' });

		const oldCode = codeBlock.createDiv({ cls: 'cr-code-example cr-code-old' });
		oldCode.createEl('div', { cls: 'cr-code-label', text: '先前的默认值' });
		oldCode.createEl('pre', {
			text: `People folder: Canvas Roots/People
Places folder: Canvas Roots/Places
Events folder: Canvas Roots/Events
Sources folder: Canvas Roots/Sources`
		});

		const newCode = codeBlock.createDiv({ cls: 'cr-code-example cr-code-new' });
		newCode.createEl('div', { cls: 'cr-code-label', text: '新的默认值' });
		newCode.createEl('pre', {
			text: `People folder: Charted Roots/People
Places folder: Charted Roots/Places
Events folder: Charted Roots/Events
Sources folder: Charted Roots/Sources`
		});

		// Action section
		const actionSection = content.createDiv({ cls: 'cr-migration-section' });
		actionSection.createEl('h3', { text: '建议操作' });

		const actionList = actionSection.createEl('ol');
		actionList.createEl('li', { text: '打开 设置 → Charted Roots → 文件夹' });
		actionList.createEl('li', { text: '检查每个文件夹路径是否指向你的现有数据' });
		actionList.createEl('li', { text: '如果你看到一个新的空"Charted Roots"文件夹，请将设置改为使用你现有的"Canvas Roots"文件夹' });

		actionSection.createEl('p', {
			text: '如果你从零开始，或已使用自定义文件夹路径，则无需任何操作。'
		});

		// Buttons - simple dismiss since no automated migration is available
		const buttons = content.createDiv({ cls: 'cr-migration-buttons' });

		const settingsBtn = buttons.createEl('button', {
			cls: 'mod-cta',
			text: '打开文件夹设置'
		});
		settingsBtn.addEventListener('click', () => {
			void this.markAsSeen();
			this.leaf.detach();
			// Open Plugin Settings to Charted Roots tab
			const appWithSettings = this.app as App & { setting?: { open: () => void; openTabById: (id: string) => void } };
			appWithSettings.setting?.open();
			appWithSettings.setting?.openTabById('canvas-roots');
		});

		const dismissBtn = buttons.createEl('button', {
			cls: 'cr-migration-dismiss',
			text: '关闭'
		});
		dismissBtn.addEventListener('click', () => {
			void this.markAsSeen();
			this.leaf.detach();
		});
	}

	/**
	 * Render the v0.17.0 sources migration notice
	 */
	private renderSourcesMigration(container: Element): void {
		// Header
		const header = container.createDiv({ cls: 'cr-migration-header' });
		const iconEl = header.createSpan({ cls: 'cr-migration-icon' });
		setIcon(iconEl, 'sparkles');
		header.createEl('h2', { text: 'v0.17.0 新功能' });

		// Content
		const content = container.createDiv({ cls: 'cr-migration-content' });

		// Source format change section
		const section = content.createDiv({ cls: 'cr-migration-section' });
		section.createEl('h3', { text: '来源属性格式变更' });

		section.createEl('p', {
			text: '带索引的来源格式（source、source_2、source_3…）现已弃用，改用 YAML 数组格式：'
		});

		// Code comparison
		const codeBlock = section.createDiv({ cls: 'cr-migration-code' });

		const oldCode = codeBlock.createDiv({ cls: 'cr-code-example cr-code-old' });
		oldCode.createEl('div', { cls: 'cr-code-label', text: '旧格式（已弃用）' });
		oldCode.createEl('pre', {
			text: `source: "[[Census 1900]]"
source_2: "[[Birth Certificate]]"`
		});

		const newCode = codeBlock.createDiv({ cls: 'cr-code-example cr-code-new' });
		newCode.createEl('div', { cls: 'cr-code-label', text: '新格式' });
		newCode.createEl('pre', {
			text: `sources:
  - "[[Census 1900]]"
  - "[[Birth Certificate]]"`
		});

		// Action section
		const actionSection = content.createDiv({ cls: 'cr-migration-section' });
		actionSection.createEl('h3', { text: '必须操作' });
		actionSection.createEl('p', {
			text: '如果你有使用旧格式的笔记，请运行清理向导自动迁移。'
		});

		// Buttons
		this.renderButtons(content);
	}

	/**
	 * Render the action buttons
	 */
	private renderButtons(content: Element): void {
		const buttons = content.createDiv({ cls: 'cr-migration-buttons' });

		const wizardBtn = buttons.createEl('button', {
			cls: 'mod-cta',
			text: '打开清理向导'
		});
		wizardBtn.addEventListener('click', () => {
			// Mark as seen and close
			void this.markAsSeen();
			this.leaf.detach();
			// Open the cleanup wizard
			this.app.workspace.trigger('canvas-roots:open-cleanup-wizard');
		});

		const dismissBtn = buttons.createEl('button', {
			cls: 'cr-migration-dismiss',
			text: '关闭'
		});
		dismissBtn.addEventListener('click', () => {
			void this.markAsSeen();
			this.leaf.detach();
		});
	}

	async onClose(): Promise<void> {
		// Nothing to clean up
	}

	/**
	 * Mark the current version as seen so the notice doesn't appear again
	 */
	private async markAsSeen(): Promise<void> {
		this.plugin.settings.lastSeenVersion = this.plugin.manifest.version;
		await this.plugin.saveSettings();
	}
}