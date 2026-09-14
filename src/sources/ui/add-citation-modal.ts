/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call -- Obsidian API returns any-typed surfaces (frontmatter, file caches, plugin state); project policy accepts these. */
/**
 * Add Citation Modal
 *
 * Creates a citation note linking a source to a specific fact on a person
 * with optional page reference and quality assessment.
 */

import { Modal, Setting, TFile, Notice } from 'obsidian';
import type CanvasRootsPlugin from '../../../main';
import { SourcePickerModal } from './source-picker-modal';
import { CitationNoteService } from '../services/citation-note-service';
import { CITATION_QUALITY_LABELS, type CitationQuality, type CitationData } from '../types/citation-types';

/** Common fact types for the dropdown */
const FACT_OPTIONS: Array<{ value: string; label: string }> = [
	{ value: 'birth_date', label: '出生日期' },
	{ value: 'birth_place', label: '出生地点' },
	{ value: 'death_date', label: '去世日期' },
	{ value: 'death_place', label: '去世地点' },
	{ value: 'burial_date', label: '安葬日期' },
	{ value: 'burial_place', label: '安葬地点' },
	{ value: 'baptism_date', label: '洗礼日期' },
	{ value: 'marriage_date', label: '结婚日期' },
	{ value: 'marriage_place', label: '结婚地点' },
	{ value: 'divorce_date', label: '离婚日期' },
	{ value: 'occupation', label: '职业' },
	{ value: 'residence', label: '居住地' },
	{ value: 'census', label: '人口普查' },
	{ value: 'immigration', label: '移民' },
	{ value: 'military_service', label: '服役' },
	{ value: 'education', label: '教育' },
	{ value: 'name', label: '姓名' },
	{ value: 'sex', label: '性别' },
];

export class AddCitationModal extends Modal {
	private plugin: CanvasRootsPlugin;
	private subjectFile: TFile;
	private subjectCrId: string;
	private subjectName: string;

	// Form state
	private selectedSourceName = '';
	private selectedSourceCrId = '';
	private selectedFact = '';
	private page = '';
	private quality: CitationQuality | undefined = undefined;

	constructor(app: import('obsidian').App, plugin: CanvasRootsPlugin, subjectFile: TFile, subjectCrId: string) {
		super(app);
		this.plugin = plugin;
		this.subjectFile = subjectFile;
		this.subjectCrId = subjectCrId;
		this.subjectName = subjectFile.basename;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('cr-add-citation-modal');

		contentEl.createEl('h2', { text: '添加引文' });
		contentEl.createEl('p', {
			text: `正在向以下人物添加引文：${this.subjectName}`,
			cls: 'setting-item-description'
		});

		const form = contentEl.createDiv({ cls: 'cr-form' });

		// Source picker
		const sourceSetting = new Setting(form)
			.setName('来源')
			.setDesc('选择被引用的来源');

		const sourceDisplay = sourceSetting.controlEl.createSpan({
			text: this.selectedSourceName || '未选择',
			cls: 'cr-add-citation__source-display'
		});

		sourceSetting.addButton(btn => btn
			.setButtonText('选择来源')
			.onClick(() => {
				new SourcePickerModal(this.app, this.plugin, {
					onSelect: (source) => {
						this.selectedSourceName = source.title;
						this.selectedSourceCrId = source.crId;
						sourceDisplay.textContent = source.title;
						this.updateSubmitButton();
					}
				}).open();
			}));

		// Fact selector
		new Setting(form)
			.setName('事实')
			.setDesc('该来源支持哪一事实？')
			.addDropdown(dropdown => {
				dropdown.addOption('', '选择事实…');
				for (const opt of FACT_OPTIONS) {
					dropdown.addOption(opt.value, opt.label);
				}
				dropdown.onChange(value => {
					this.selectedFact = value;
					this.updateSubmitButton();
				});
			});

		// Page reference
		new Setting(form)
			.setName('页码 / 位置')
			.setDesc('来源中的页码、条目或位置')
			.addText(text => text
				.setPlaceholder('例如：第 42 页，第 15 条')
				.onChange(value => {
					this.page = value;
				}));

		// Quality assessment
		new Setting(form)
			.setName('质量')
			.setDesc('来源质量评估（GEDCOM QUAY）')
			.addDropdown(dropdown => {
				dropdown.addOption('', '未指定');
				for (const [key, label] of Object.entries(CITATION_QUALITY_LABELS)) {
					dropdown.addOption(key, `${key} — ${label}`);
				}
				dropdown.onChange(value => {
					this.quality = value ? parseInt(value) as CitationQuality : undefined;
				});
			});

		// Actions
		const actions = new Setting(form);
		actions.addButton(btn => btn
			.setButtonText('取消')
			.onClick(() => this.close()));
		actions.addButton(btn => {
			btn.setButtonText('添加引文')
				.setCta()
				.onClick(() => void this.submit());
			btn.buttonEl.addClass('cr-add-citation__submit');
			btn.buttonEl.disabled = true;
		});
	}

	private updateSubmitButton(): void {
		const submitBtn = this.contentEl.querySelector('.cr-add-citation__submit') as HTMLButtonElement;
		if (submitBtn) {
			submitBtn.disabled = !this.selectedSourceCrId || !this.selectedFact;
		}
	}

	private async submit(): Promise<void> {
		if (!this.selectedSourceCrId || !this.selectedFact) return;

		const sourceBaseName = this.app.metadataCache.getFirstLinkpathDest(
			this.selectedSourceName, ''
		)?.basename || this.selectedSourceName;

		const data: CitationData = {
			source: `[[${sourceBaseName}]]`,
			sourceCrId: this.selectedSourceCrId,
			subject: `[[${this.subjectName}]]`,
			subjectCrId: this.subjectCrId,
			fact: this.selectedFact,
			page: this.page || undefined,
			quality: this.quality
		};

		try {
			const citationService = new CitationNoteService(this.plugin);
			const citationFile = await citationService.createCitationNote(data);

			// Add citation link to the subject note
			await this.app.fileManager.processFrontMatter(this.subjectFile, (frontmatter) => {
				const existing = Array.isArray(frontmatter.citations) ? frontmatter.citations : [];
				existing.push(`[[${citationFile.basename}]]`);
				frontmatter.citations = existing;
			});

			new Notice(`已添加引文：${sourceBaseName} → ${this.selectedFact}`);
			this.close();
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			new Notice(`创建引文失败：${message}`);
		}
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

/* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call -- Match scope of file-level disable at top. */
