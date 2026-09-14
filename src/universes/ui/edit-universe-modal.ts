/**
 * Edit Universe Modal
 * Modal for editing existing universe notes
 */

import { App, Modal, Setting, TFile, Notice } from 'obsidian';
import type CanvasRootsPlugin from '../../../main';
import { createLucideIcon } from '../../ui/lucide-icons';
import type { UniverseInfo, UniverseStatus } from '../types/universe-types';
import { UniverseService, createUniverseService } from '../services/universe-service';
import { DEFAULT_DATE_SYSTEMS } from '../../dates/constants/default-date-systems';
import type { FictionalDateSystem } from '../../dates/types/date-types';

/** Available status options */
const STATUS_OPTIONS: Record<UniverseStatus, string> = {
	active: '活跃',
	draft: '草稿',
	archived: '已归档'
};

/** Available genre options */
const GENRE_OPTIONS = [
	'',
	'Fantasy',
	'Science Fiction',
	'Historical',
	'Alternate History',
	'Horror',
	'Mystery',
	'Romance',
	'Thriller',
	'Other'
];

/**
 * Modal for editing universe notes
 */
export class EditUniverseModal extends Modal {
	private plugin: CanvasRootsPlugin;
	private universeService: UniverseService;
	private universe: UniverseInfo;
	private file: TFile;
	private onUpdated?: (file: TFile) => void;

	// Form state
	private name: string;
	private description: string;
	private author: string;
	private genre: string;
	private status: UniverseStatus;
	private defaultCalendar: string;
	private currentDate: string;

	constructor(
		app: App,
		plugin: CanvasRootsPlugin,
		options: {
			universe: UniverseInfo;
			file: TFile;
			onUpdated?: (file: TFile) => void;
		}
	) {
		super(app);
		this.plugin = plugin;
		this.universeService = createUniverseService(plugin);
		this.universe = options.universe;
		this.file = options.file;
		this.onUpdated = options.onUpdated;

		// Initialize form state from universe
		this.name = this.universe.name;
		this.description = this.universe.description || '';
		this.author = this.universe.author || '';
		this.genre = this.universe.genre || '';
		this.status = this.universe.status;
		this.defaultCalendar = this.universe.defaultCalendar || '';
		this.currentDate = this.universe.currentDate || '';
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		// Add modal class for styling
		this.modalEl.addClass('crc-edit-universe-modal');

		// Header
		const header = contentEl.createDiv({ cls: 'crc-modal-header' });
		const titleContainer = header.createDiv({ cls: 'crc-modal-title' });
		const icon = createLucideIcon('globe', 24);
		titleContainer.appendChild(icon);
		titleContainer.appendText('编辑宇宙');

		// Form container
		const form = contentEl.createDiv({ cls: 'crc-form' });

		// Name (required)
		new Setting(form)
			.setName('名称')
			.setDesc('此宇宙的显示名称')
			.addText(text => text
				.setPlaceholder('例如：中土世界')
				.setValue(this.name)
				.onChange(value => {
					this.name = value;
				}));

		// Description
		new Setting(form)
			.setName('描述')
			.setDesc('宇宙的简要描述')
			.addTextArea(text => {
				text
					.setPlaceholder('一个丰富的奇幻世界…')
					.setValue(this.description)
					.onChange(value => {
						this.description = value;
					});
				text.inputEl.rows = 3;
			});

		// Author
		new Setting(form)
			.setName('作者')
			.setDesc('虚构世界的创作者或作者')
			.addText(text => text
				.setPlaceholder('例如：J.R.R. 托尔金')
				.setValue(this.author)
				.onChange(value => {
					this.author = value;
				}));

		// Genre
		new Setting(form)
			.setName('题材')
			.setDesc('虚构世界的主要题材')
			.addDropdown(dropdown => {
				for (const genre of GENRE_OPTIONS) {
					dropdown.addOption(genre, genre || '未指定');
				}
				dropdown.setValue(this.genre);
				dropdown.onChange(value => {
					this.genre = value;
				});
			});

		// Status
		new Setting(form)
			.setName('状态')
			.setDesc('此宇宙的当前状态')
			.addDropdown(dropdown => {
				for (const [value, label] of Object.entries(STATUS_OPTIONS)) {
					dropdown.addOption(value, label);
				}
				dropdown.setValue(this.status);
				dropdown.onChange((value: UniverseStatus) => {
					this.status = value;
				});
			});

		// Calendar — default calendar pointer for this universe (#432 Phase 1).
		// Lists built-ins and user-defined custom calendar systems; '(unset)'
		// removes the link.
		new Setting(form)
			.setName('历法')
			.setDesc('此宇宙中虚构日期的默认历法')
			.addDropdown(dropdown => {
				dropdown.addOption('', '（未设置）');
				for (const sys of this.collectAvailableCalendars()) {
					dropdown.addOption(sys.id, sys.builtIn ? `${sys.name}（内置）` : sys.name);
				}
				// Preserve the current value even if the system is no longer
				// in the list (e.g., a custom calendar was removed) so the
				// user can deliberately clear it rather than silently lose it.
				if (this.defaultCalendar && !this.collectAvailableCalendars().some(s => s.id === this.defaultCalendar)) {
					dropdown.addOption(this.defaultCalendar, `${this.defaultCalendar}（缺失）`);
				}
				dropdown.setValue(this.defaultCalendar);
				dropdown.onChange(value => {
					this.defaultCalendar = value;
				});
			});

		// Current date: the universe's in-world "now", used to age living
		// characters for record superlatives (#749). Real-world universes can
		// leave this blank (today is assumed for people without a universe).
		new Setting(form)
			.setName('当前日期')
			.setDesc('宇宙自身的"现在"，采用其自身历法（例如 "342 AE"）。用于在统计中计算在世人物的年龄。留空则使用今天。')
			.addText(text => text
				.setPlaceholder('例如 342 AE')
				.setValue(this.currentDate)
				.onChange(value => {
					this.currentDate = value;
				}));

		// Info section
		const info = form.createDiv({ cls: 'crc-modal-info' });
		info.createEl('p', {
			text: `cr_id: ${this.universe.crId}`,
			cls: 'crc-info-text'
		});
		if (this.universe.created) {
			info.createEl('p', {
				text: `创建于：${this.universe.created}`,
				cls: 'crc-info-text'
			});
		}

		// Action buttons
		const actions = contentEl.createDiv({ cls: 'crc-modal-actions' });

		// Cancel button
		const cancelBtn = actions.createEl('button', {
			text: '取消',
			cls: 'crc-btn crc-btn-secondary'
		});
		cancelBtn.addEventListener('click', () => {
			this.close();
		});

		// Save button
		const saveBtn = actions.createEl('button', {
			text: '保存更改',
			cls: 'crc-btn crc-btn-primary'
		});
		saveBtn.addEventListener('click', () => {
			void this.save();
		});
	}

	/**
	 * Validate and save changes
	 */
	private async save(): Promise<void> {
		// Validate required fields
		if (!this.name.trim()) {
			new Notice('名称为必填项');
			return;
		}

		try {
			await this.universeService.updateUniverse(this.file, {
				name: this.name.trim(),
				description: this.description.trim() || undefined,
				author: this.author.trim() || undefined,
				genre: this.genre || undefined,
				status: this.status,
				// Empty string clears the field; undefined would preserve it,
				// so use empty-string sentinel to support the (unset) option.
				defaultCalendar: this.defaultCalendar,
				currentDate: this.currentDate.trim()
			});

			this.close();
			this.onUpdated?.(this.file);
		} catch (error) {
			new Notice(`更新宇宙失败：${error instanceof Error ? error.message : '未知错误'}`);
		}
	}

	/**
	 * Calendars available to link to this universe: all built-ins, plus any
	 * user-defined fictional calendar systems from plugin settings (#432).
	 */
	private collectAvailableCalendars(): FictionalDateSystem[] {
		const customs = this.plugin.settings.fictionalDateSystems || [];
		// Customs overlay built-ins by id; built-ins surface first so users
		// see the canonical list before their own additions.
		const seen = new Set<string>();
		const result: FictionalDateSystem[] = [];
		for (const sys of [...DEFAULT_DATE_SYSTEMS, ...customs]) {
			if (seen.has(sys.id)) continue;
			seen.add(sys.id);
			result.push(sys);
		}
		return result;
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}