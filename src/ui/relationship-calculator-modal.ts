import { App, Modal, Notice } from 'obsidian';
import { PersonPickerModal, PersonInfo } from './person-picker';
import { RelationshipCalculator, RelationshipResult, RelationshipStep } from '../core/relationship-calculator';
import { createLucideIcon } from './lucide-icons';
import type { PersonNode } from '../core/family-graph';
import type { CanvasRootsSettings } from '../settings';

/**
 * Modal for calculating relationships between two people
 */
export class RelationshipCalculatorModal extends Modal {
	private calculator: RelationshipCalculator;
	private settings?: CanvasRootsSettings;
	private personA: PersonInfo | null = null;
	private personB: PersonInfo | null = null;
	private result: RelationshipResult | null = null;
	private additionalResults: RelationshipResult[] = [];
	private foundAncestorCrIds: string[] = [];

	// UI elements
	private personAContainer: HTMLElement;
	private personBContainer: HTMLElement;
	private calculateButton: HTMLButtonElement;
	private resultsContainer: HTMLElement;

	constructor(app: App, settings?: CanvasRootsSettings) {
		super(app);
		this.calculator = new RelationshipCalculator(app);
		this.settings = settings;
	}

	/**
	 * Open the modal with a pre-selected person A
	 */
	openWithPersonA(person: PersonInfo): void {
		this.personA = person;
		this.open();
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		// Add modal class for styling
		this.modalEl.addClass('cr-relationship-calculator-modal');

		// Create modal structure
		this.createModalContent();
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}

	private createModalContent(): void {
		const { contentEl } = this;

		// Header
		const header = contentEl.createDiv({ cls: 'cr-relcalc-header' });
		const titleSection = header.createDiv({ cls: 'cr-relcalc-title' });
		const icon = createLucideIcon('git-compare', 20);
		titleSection.appendChild(icon);
		titleSection.appendText('关系计算器');

		// Description
		contentEl.createEl('p', {
			text: '选择两个人来计算他们的家族关系。',
			cls: 'cr-relcalc-description'
		});

		// Person selection section
		const selectionSection = contentEl.createDiv({ cls: 'cr-relcalc-selection' });

		// Person A
		const personASection = selectionSection.createDiv({ cls: 'cr-relcalc-person' });
		personASection.createDiv({ cls: 'cr-relcalc-person__label', text: '人物 A' });
		this.personAContainer = personASection.createDiv({ cls: 'cr-relcalc-person__card' });
		this.renderPersonCard(this.personAContainer, this.personA, 'A');

		// Arrow indicator
		const arrowSection = selectionSection.createDiv({ cls: 'cr-relcalc-arrow' });
		const arrowIcon = createLucideIcon('arrow-right', 24);
		arrowSection.appendChild(arrowIcon);

		// Person B
		const personBSection = selectionSection.createDiv({ cls: 'cr-relcalc-person' });
		personBSection.createDiv({ cls: 'cr-relcalc-person__label', text: '人物 B' });
		this.personBContainer = personBSection.createDiv({ cls: 'cr-relcalc-person__card' });
		this.renderPersonCard(this.personBContainer, this.personB, 'B');

		// Calculate button
		const buttonContainer = contentEl.createDiv({ cls: 'cr-relcalc-actions' });
		this.calculateButton = buttonContainer.createEl('button', {
			cls: 'crc-btn crc-btn--primary crc-btn--large',
			text: '计算关系'
		});
		this.calculateButton.disabled = true;
		this.calculateButton.addEventListener('click', () => void this.calculateRelationship());
		this.updateCalculateButton();

		// Results section (hidden initially)
		this.resultsContainer = contentEl.createDiv({ cls: 'cr-relcalc-results cr-hidden' });
	}

	private renderPersonCard(container: HTMLElement, person: PersonInfo | null, slot: 'A' | 'B'): void {
		container.empty();

		if (person) {
			// Show selected person
			const card = container.createDiv({ cls: 'cr-relcalc-card cr-relcalc-card--selected' });

			const cardMain = card.createDiv({ cls: 'cr-relcalc-card__main' });
			cardMain.createDiv({ cls: 'cr-relcalc-card__name', text: person.name });

			const cardMeta = card.createDiv({ cls: 'cr-relcalc-card__meta' });
			if (person.birthDate || person.deathDate) {
				const dates = person.birthDate && person.deathDate
					? `${person.birthDate} – ${person.deathDate}`
					: person.birthDate
						? `出生于 ${person.birthDate}`
						: `逝世于 ${person.deathDate}`;
				cardMeta.createSpan({ cls: 'cr-relcalc-badge', text: dates });
			} else {
				cardMeta.createSpan({ cls: 'cr-relcalc-badge cr-relcalc-badge--id', text: person.crId });
			}

			// Change button
			const changeBtn = card.createEl('button', {
				cls: 'crc-btn crc-btn--text cr-relcalc-card__change',
				text: '更改'
			});
			changeBtn.addEventListener('click', () => this.selectPerson(slot));
		} else {
			// Show empty state with select button
			const emptyCard = container.createDiv({ cls: 'cr-relcalc-card cr-relcalc-card--empty' });

			const emptyIcon = createLucideIcon('user-plus', 32);
			emptyIcon.addClass('cr-relcalc-card__icon');
			emptyCard.appendChild(emptyIcon);

			emptyCard.createDiv({ cls: 'cr-relcalc-card__empty-text', text: '点击选择' });

			emptyCard.addEventListener('click', () => this.selectPerson(slot));
		}
	}

	private selectPerson(slot: 'A' | 'B'): void {
		const picker = new PersonPickerModal(this.app, (selectedPerson) => {
			if (slot === 'A') {
				this.personA = selectedPerson;
				this.renderPersonCard(this.personAContainer, this.personA, 'A');
			} else {
				this.personB = selectedPerson;
				this.renderPersonCard(this.personBContainer, this.personB, 'B');
			}
			this.updateCalculateButton();
			// Clear previous results when selection changes
			this.resultsContainer.addClass('cr-hidden');
			this.result = null;
			this.additionalResults = [];
			this.foundAncestorCrIds = [];
		});
		picker.open();
	}

	private updateCalculateButton(): void {
		const canCalculate = this.personA !== null && this.personB !== null;
		this.calculateButton.disabled = !canCalculate;

		if (canCalculate) {
			this.calculateButton.removeClass('crc-btn--disabled');
		} else {
			this.calculateButton.addClass('crc-btn--disabled');
		}
	}

	private calculateRelationship(): void {
		if (!this.personA || !this.personB) {
			new Notice('请先选择两个人');
			return;
		}

		// Show loading state
		this.calculateButton.disabled = true;
		this.calculateButton.setText('计算中…');

		try {
			this.result = this.calculator.calculateRelationship(
				this.personA.crId,
				this.personB.crId
			);

			if (this.result) {
				this.renderResults();
			} else {
				new Notice('无法计算关系');
			}
		} catch (error: unknown) {
			console.error('Error calculating relationship:', error);
			new Notice('计算关系时出错');
		} finally {
			this.calculateButton.disabled = false;
			this.calculateButton.setText('计算关系');
		}
	}

	private renderResults(): void {
		if (!this.result) return;

		this.resultsContainer.empty();
		this.resultsContainer.removeClass('cr-hidden');

		// Result header
		const resultHeader = this.resultsContainer.createDiv({ cls: 'cr-relcalc-result-header' });

		// Relationship badge
		const relationshipBadge = resultHeader.createDiv({ cls: 'cr-relcalc-result-badge' });
		const relationshipIcon = this.getRelationshipIcon(this.result);
		relationshipBadge.appendChild(relationshipIcon);
		relationshipBadge.createSpan({
			cls: 'cr-relcalc-result-badge__text',
			text: this.result.relationshipDescription
		});

		// Result details
		const resultDetails = this.resultsContainer.createDiv({ cls: 'cr-relcalc-result-details' });

		// Generations info
		if (this.result.generationsUp > 0 || this.result.generationsDown > 0) {
			const genInfo = resultDetails.createDiv({ cls: 'cr-relcalc-result-stat' });
			genInfo.createSpan({ cls: 'cr-relcalc-result-stat__label', text: '世代：' });
			const genText = [];
			if (this.result.generationsUp > 0) {
				genText.push(`上溯 ${this.result.generationsUp} 代`);
			}
			if (this.result.generationsDown > 0) {
				genText.push(`下延 ${this.result.generationsDown} 代`);
			}
			genInfo.createSpan({ cls: 'cr-relcalc-result-stat__value', text: genText.join(', ') });
		}

		// Blood relation
		const bloodInfo = resultDetails.createDiv({ cls: 'cr-relcalc-result-stat' });
		bloodInfo.createSpan({ cls: 'cr-relcalc-result-stat__label', text: '血缘关系：' });
		bloodInfo.createSpan({
			cls: `cr-relcalc-result-stat__value ${this.result.isBloodRelation ? 'cr-text--success' : ''}`,
			text: this.result.isBloodRelation ? '是' : '否'
		});

		// Direct line
		const directInfo = resultDetails.createDiv({ cls: 'cr-relcalc-result-stat' });
		directInfo.createSpan({ cls: 'cr-relcalc-result-stat__label', text: '直系：' });
		directInfo.createSpan({
			cls: `cr-relcalc-result-stat__value ${this.result.isDirectLine ? 'cr-text--success' : ''}`,
			text: this.result.isDirectLine ? '是' : '否'
		});

		// Common ancestor (if applicable)
		if (this.result.commonAncestor && !this.result.isDirectLine) {
			const ancestorInfo = resultDetails.createDiv({ cls: 'cr-relcalc-result-stat' });
			ancestorInfo.createSpan({ cls: 'cr-relcalc-result-stat__label', text: '共同祖先：' });
			ancestorInfo.createSpan({
				cls: 'cr-relcalc-result-stat__value',
				text: this.result.commonAncestor.name
			});
		}

		// Path visualization
		if (this.result.path.length > 1) {
			this.renderPathVisualization(this.resultsContainer);
		}

		// Additional relationships (if already found)
		if (this.additionalResults.length > 0) {
			this.renderAdditionalResults(this.resultsContainer);
		}

		// Action buttons
		const actionButtons = this.resultsContainer.createDiv({ cls: 'cr-relcalc-result-actions' });

		// Find more button
		const findMoreBtn = actionButtons.createEl('button', {
			cls: 'crc-btn crc-btn--secondary'
		});
		const searchIcon = createLucideIcon('search', 14);
		findMoreBtn.appendChild(searchIcon);
		findMoreBtn.appendText('查找更多关系');
		findMoreBtn.addEventListener('click', () => this.findMoreRelationships());

		const copyBtn = actionButtons.createEl('button', {
			cls: 'crc-btn crc-btn--secondary'
		});
		const copyIcon = createLucideIcon('copy', 14);
		copyBtn.appendChild(copyIcon);
		copyBtn.appendText('复制结果');
		copyBtn.addEventListener('click', () => this.copyResult());
	}

	private renderAdditionalResults(container: HTMLElement): void {
		// Group results where common ancestors are spouses (couples)
		const grouped = this.groupByAncestorPairs(this.additionalResults);

		const section = container.createDiv({ cls: 'cr-relcalc-additional' });
		section.createDiv({
			cls: 'cr-relcalc-additional__title',
			text: `其他关系（${grouped.length}）`
		});

		for (const group of grouped) {
			const result = group.primaryResult;
			const row = section.createDiv({ cls: 'cr-relcalc-additional__row' });

			const icon = this.getRelationshipIcon(result);
			row.appendChild(icon);

			row.createSpan({
				cls: 'cr-relcalc-additional__desc',
				text: result.relationshipDescription
			});

			// Show common ancestor(s) — grouped as couple if applicable
			const ancestorNames = group.ancestorNames;
			if (ancestorNames.length > 0) {
				row.createSpan({
					cls: 'cr-relcalc-additional__ancestor',
						text: ` 经由 ${ancestorNames.join(' & ')}`
				});
			}

			if (result.isBloodRelation) {
				row.createSpan({
					cls: 'cr-relcalc-badge cr-relcalc-badge--blood',
						text: '血缘'
				});
			} else {
				row.createSpan({
					cls: 'cr-relcalc-badge cr-relcalc-badge--marriage',
						text: '姻亲'
				});
			}

			// Path visualization for this result
			if (result.path.length > 1) {
				const pathSection = section.createDiv({ cls: 'cr-relcalc-path cr-relcalc-path--additional' });
				const pathContainer = pathSection.createDiv({ cls: 'cr-relcalc-path__container' });

				result.path.forEach((step, index) => {
					const nodeEl = pathContainer.createDiv({ cls: 'cr-relcalc-path__node' });
					nodeEl.createSpan({ cls: 'cr-relcalc-path__name', text: step.person.name });

					if (index < result.path.length - 1) {
						const nextStep = result.path[index + 1];
						const arrowEl = pathContainer.createDiv({ cls: 'cr-relcalc-path__arrow' });
						const dirIcon = this.getDirectionIcon(nextStep.direction);
						arrowEl.appendChild(dirIcon);
						arrowEl.createSpan({
							cls: 'cr-relcalc-path__relation',
							text: this.getRelationshipLabel(nextStep.relationship)
						});
					}
				});
			}
		}
	}

	/**
	 * Group additional results where common ancestors are spouses of each other.
	 * Returns grouped entries with merged ancestor names.
	 */
	private groupByAncestorPairs(
		results: RelationshipResult[]
	): Array<{ primaryResult: RelationshipResult; ancestorNames: string[] }> {
		const groups: Array<{ primaryResult: RelationshipResult; ancestorNames: string[]; ancestorCrIds: Set<string> }> = [];

		for (const result of results) {
			if (!result.commonAncestor) {
				groups.push({ primaryResult: result, ancestorNames: [], ancestorCrIds: new Set() });
				continue;
			}

			const ancestorCrId = result.commonAncestor.crId;

			// Check if this ancestor is a spouse of an already-grouped ancestor
			let merged = false;
			for (const group of groups) {
				if (group.primaryResult.relationshipDescription === result.relationshipDescription) {
					// Same relationship type — check if ancestors are spouses
					const existingAncestor = group.primaryResult.commonAncestor;
					if (existingAncestor && this.areSpouses(existingAncestor, result.commonAncestor)) {
						group.ancestorNames.push(result.commonAncestor.name);
						group.ancestorCrIds.add(ancestorCrId);
						merged = true;
						break;
					}
				}
			}

			if (!merged) {
				groups.push({
					primaryResult: result,
					ancestorNames: [result.commonAncestor.name],
					ancestorCrIds: new Set([ancestorCrId])
				});
			}
		}

		return groups;
	}

	/**
	 * Check if two people are spouses of each other
	 */
	private areSpouses(personA: PersonNode, personB: PersonNode): boolean {
		return personA.spouseCrIds?.includes(personB.crId) || personB.spouseCrIds?.includes(personA.crId);
	}

	private findMoreRelationships(): void {
		if (!this.personA || !this.personB || !this.result) return;

		// Collect already-found common ancestor IDs
		if (this.result.commonAncestor && !this.foundAncestorCrIds.includes(this.result.commonAncestor.crId)) {
			this.foundAncestorCrIds.push(this.result.commonAncestor.crId);
		}
		for (const r of this.additionalResults) {
			if (r.commonAncestor && !this.foundAncestorCrIds.includes(r.commonAncestor.crId)) {
				this.foundAncestorCrIds.push(r.commonAncestor.crId);
			}
		}

		const maxDepth = this.settings?.relationshipMaxDepth ?? 10;
		const newResults = this.calculator.findAdditionalRelationships(
			this.personA.crId,
			this.personB.crId,
			this.foundAncestorCrIds,
			{ maxDepth }
		);

		if (newResults.length === 0) {
			new Notice('未找到其他关系');
			return;
		}

		this.additionalResults.push(...newResults);
		new Notice(`找到 ${newResults.length} 个其他关系`);

		// Re-render results to show the new ones
		this.renderResults();
	}

	private renderPathVisualization(container: HTMLElement): void {
		if (!this.result || this.result.path.length <= 1) return;

		const pathSection = container.createDiv({ cls: 'cr-relcalc-path' });
		pathSection.createDiv({ cls: 'cr-relcalc-path__title', text: '关系路径' });

		const pathContainer = pathSection.createDiv({ cls: 'cr-relcalc-path__container' });

		this.result.path.forEach((step, index) => {
			// Person node
			const nodeEl = pathContainer.createDiv({ cls: 'cr-relcalc-path__node' });
			nodeEl.createSpan({ cls: 'cr-relcalc-path__name', text: step.person.name });

			// Arrow and relationship label (except for last node)
			if (index < this.result!.path.length - 1) {
				const nextStep = this.result!.path[index + 1];
				const arrowEl = pathContainer.createDiv({ cls: 'cr-relcalc-path__arrow' });

				const dirIcon = this.getDirectionIcon(nextStep.direction);
				arrowEl.appendChild(dirIcon);

				arrowEl.createSpan({
					cls: 'cr-relcalc-path__relation',
					text: this.getRelationshipLabel(nextStep.relationship)
				});
			}
		});
	}

	private getRelationshipIcon(result: RelationshipResult): HTMLElement {
		if (result.relationshipDescription === '配偶') {
			return createLucideIcon('heart', 18);
		}
		if (result.isDirectLine && result.generationsUp > 0) {
			return createLucideIcon('arrow-up', 18);
		}
		if (result.isDirectLine && result.generationsDown > 0) {
			return createLucideIcon('arrow-down', 18);
		}
		if (result.relationshipDescription.includes('兄弟姐妹')) {
			return createLucideIcon('users', 18);
		}
		if (result.relationshipDescription.includes('堂/表亲')) {
			return createLucideIcon('git-branch', 18);
		}
		return createLucideIcon('link', 18);
	}

	private getDirectionIcon(direction: RelationshipStep['direction']): HTMLElement {
		switch (direction) {
			case 'up':
				return createLucideIcon('arrow-up', 14);
			case 'down':
				return createLucideIcon('arrow-down', 14);
			case 'lateral':
				return createLucideIcon('arrow-right', 14);
			default:
				return createLucideIcon('circle', 14);
		}
	}

	private getRelationshipLabel(relationship: RelationshipStep['relationship']): string {
		switch (relationship) {
			case 'father':
				return '父亲';
			case 'mother':
				return '母亲';
			case 'spouse':
				return '配偶';
			case 'child':
				return '子女';
			case 'stepfather':
				return '继父';
			case 'stepmother':
				return '继母';
			case 'stepchild':
				return '继子女';
			case 'adoptive_father':
				return '养父';
			case 'adoptive_mother':
				return '养母';
			case 'adopted_child':
				return '养子女';
			default:
				return '';
		}
	}

	private copyResult(): void {
		if (!this.result || !this.personA || !this.personB) return;

		const lines = [
			`关系：${this.personA.name} → ${this.personB.name}`,
			`结果：${this.result.relationshipDescription}`,
			''
		];

		if (this.result.generationsUp > 0 || this.result.generationsDown > 0) {
			lines.push(`世代：上溯 ${this.result.generationsUp} 代，下延 ${this.result.generationsDown} 代`);
		}

		lines.push(`血缘关系：${this.result.isBloodRelation ? '是' : '否'}`);
		lines.push(`直系：${this.result.isDirectLine ? '是' : '否'}`);

		if (this.result.commonAncestor && !this.result.isDirectLine) {
			lines.push(`共同祖先：${this.result.commonAncestor.name}`);
		}

		if (this.result.path.length > 1) {
			lines.push('');
			lines.push('路径：');
			this.result.path.forEach((step, index) => {
				if (index === 0) {
					lines.push(`  ${step.person.name}`);
				} else {
					lines.push(`  → ${step.relationship} → ${step.person.name}`);
				}
			});
		}

		void navigator.clipboard.writeText(lines.join('\n'));
		new Notice('结果已复制到剪贴板');
	}
}
