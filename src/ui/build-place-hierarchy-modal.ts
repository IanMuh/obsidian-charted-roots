/**
 * Modal for building place hierarchy
 * Allows assigning parent places to orphan locations
 */

import { App, ButtonComponent, Modal, Setting, Notice, TFile } from 'obsidian';
import { PlaceNode } from '../models/place';
import { updatePlaceNote } from '../core/place-note-writer';
import { createLucideIcon } from './lucide-icons';
import { capitalize } from '../utils/format-utils';

interface BuildPlaceHierarchyOptions {
	onComplete?: (updated: number) => void;
}

interface OrphanAssignment {
	orphan: PlaceNode;
	parentId: string | null;
	parentName: string | null;
}

/**
 * Modal for assigning parent places to orphan locations
 */
export class BuildPlaceHierarchyModal extends Modal {
	private orphanPlaces: PlaceNode[];
	private potentialParents: PlaceNode[];
	private assignments: Map<string, OrphanAssignment>;
	private onComplete?: (updated: number) => void;

	constructor(
		app: App,
		orphanPlaces: PlaceNode[],
		potentialParents: PlaceNode[],
		options: BuildPlaceHierarchyOptions = {}
	) {
		super(app);
		this.orphanPlaces = orphanPlaces;
		this.potentialParents = potentialParents;
		this.onComplete = options.onComplete;

		// Initialize assignments
		this.assignments = new Map();
		for (const orphan of orphanPlaces) {
			this.assignments.set(orphan.id, {
				orphan,
				parentId: null,
				parentName: null
			});
		}
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		// Add modal class for styling
		this.modalEl.addClass('crc-build-hierarchy-modal');

		// Header
		const header = contentEl.createDiv({ cls: 'crc-modal-header' });
		const titleContainer = header.createDiv({ cls: 'crc-modal-title' });
		const icon = createLucideIcon('layers', 24);
		titleContainer.appendChild(icon);
		titleContainer.appendText('构建地点层级');

		// Description
		contentEl.createEl('p', {
			text: `发现 ${this.orphanPlaces.length} 个地点没有父级归属。为每个地点选择父级以构建层级。`,
			cls: 'crc-text--muted'
		});

		if (this.potentialParents.length === 0) {
			contentEl.createEl('p', {
				text: '未找到可用的父级地点。请先创建国家、州/省或地区地点笔记。',
				cls: 'crc-text--warning'
			});
		}

		// Assignment list
		const assignmentContainer = contentEl.createDiv({ cls: 'crc-assignment-list' });
		this.renderAssignments(assignmentContainer);

		// Buttons
		const buttonContainer = contentEl.createDiv({ cls: 'crc-modal-buttons' });

		new ButtonComponent(buttonContainer)
			.setButtonText('取消')
			.onClick(() => {
				this.close();
			});

		new ButtonComponent(buttonContainer)
			.setButtonText('应用归属')
			.setCta()
			.onClick(() => void this.applyAssignments());
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}

	/**
	 * Render the list of orphan places with parent selection dropdowns
	 */
	private renderAssignments(container: HTMLElement): void {
		container.empty();

		// Sort orphans by type then name
		const sortedOrphans = [...this.orphanPlaces].sort((a, b) => {
			if (a.placeType !== b.placeType) {
				return (a.placeType || '').localeCompare(b.placeType || '');
			}
			return a.name.localeCompare(b.name);
		});

		// Group by place type
		const byType = new Map<string, PlaceNode[]>();
		for (const orphan of sortedOrphans) {
			const type = orphan.placeType || 'other';
			if (!byType.has(type)) {
				byType.set(type, []);
			}
			byType.get(type)!.push(orphan);
		}

		// Build parent options for dropdown
		const parentOptions = this.buildParentOptions();

		for (const [type, orphans] of byType.entries()) {
			const typeSection = container.createDiv({ cls: 'crc-hierarchy-type-section' });

			typeSection.createEl('h4', {
				text: this.formatPlaceType(type),
				cls: 'crc-section-title'
			});

			for (const orphan of orphans) {
				const assignment = this.assignments.get(orphan.id)!;

				new Setting(typeSection)
					.setName(orphan.name)
					.setDesc(orphan.aliases.length > 0 ? `别名：${orphan.aliases.join('、')}` : '')
					.addDropdown(dropdown => {
						dropdown.addOption('', '（无父级）');

						for (const [groupName, options] of parentOptions.entries()) {
							// Add optgroup-like separator
							dropdown.addOption(`__group_${groupName}`, `── ${groupName} ──`);
							for (const opt of options) {
								dropdown.addOption(opt.id, `  ${opt.name}`);
							}
						}

						dropdown.setValue(assignment.parentId || '');
						dropdown.onChange(value => {
							if (value.startsWith('__group_')) {
								// Reset to no selection if they clicked a group header
								dropdown.setValue(assignment.parentId || '');
								return;
							}
							if (value) {
								const parent = this.potentialParents.find(p => p.id === value);
								assignment.parentId = value;
								assignment.parentName = parent?.name || null;
							} else {
								assignment.parentId = null;
								assignment.parentName = null;
							}
						});
					});
			}
		}
	}

	/**
	 * Build organized parent options grouped by type
	 */
	private buildParentOptions(): Map<string, Array<{ id: string; name: string }>> {
		const options = new Map<string, Array<{ id: string; name: string }>>();

		// Sort parents by type then name
		const sortedParents = [...this.potentialParents].sort((a, b) => {
			if (a.placeType !== b.placeType) {
				return (a.placeType || '').localeCompare(b.placeType || '');
			}
			return a.name.localeCompare(b.name);
		});

		for (const parent of sortedParents) {
			const type = this.formatPlaceType(parent.placeType || 'other');
			if (!options.has(type)) {
				options.set(type, []);
			}
			options.get(type)!.push({
				id: parent.id,
				name: parent.name
			});
		}

		return options;
	}

	/**
	 * Format place type for display
	 */
	private formatPlaceType(type: string): string {
		const names: Record<string, string> = {
			continent: '大陆',
			country: '国家',
			state: '州',
			province: '省',
			region: '地区',
			county: '县',
			city: '城市',
			town: '城镇',
			village: '村庄',
			district: '区',
			parish: '教区',
			castle: '城堡',
			estate: '庄园',
			cemetery: '墓地',
			church: '教堂',
			other: '其他'
		};
		return names[type] || capitalize(type);
	}

	/**
	 * Apply the parent assignments to place notes
	 */
	private async applyAssignments(): Promise<void> {
		let updated = 0;
		const errors: string[] = [];

		for (const assignment of this.assignments.values()) {
			if (!assignment.parentId) continue;

			try {
				const file = this.app.vault.getAbstractFileByPath(assignment.orphan.filePath);
				if (!(file instanceof TFile)) {
					errors.push(`${assignment.orphan.name}: File not found`);
					continue;
				}

				await updatePlaceNote(this.app, file, {
					parentPlaceId: assignment.parentId,
					parentPlace: assignment.parentName || undefined
				});

				updated++;
			} catch (error) {
				errors.push(`${assignment.orphan.name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
			}
		}

		if (errors.length > 0) {
			console.error('Errors updating place notes:', errors);
			new Notice(`已更新 ${updated} 个地点，${errors.length} 个失败。`);
		}

		if (this.onComplete) {
			this.onComplete(updated);
		}

		this.close();
	}
}
