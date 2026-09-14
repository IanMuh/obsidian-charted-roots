/**
 * Referenced Facts Section (Source)
 *
 * Displays entities that cite this source, grouped by entity,
 * showing the specific facts each entity cites.
 */

import type { App } from 'obsidian';
import type { ReferencedFactGroup, SectionToggleFn, EntityLinkClickFn, SectionState } from '../profile-types';
import { renderProfileSection } from './section-base';
import { FACT_KEY_LABELS, type FactKey } from '../../sources/types/source-types';

interface ReferencedFactsSectionOptions {
	sectionStates: SectionState;
	onToggle: SectionToggleFn;
	onEntityLinkClick: EntityLinkClickFn;
	app: App;
}

export function renderReferencedFactsSection(
	parent: HTMLElement,
	factGroups: ReferencedFactGroup[],
	options: ReferencedFactsSectionOptions
): void {
	const totalFacts = factGroups.reduce((sum, g) => sum + g.facts.length, 0);
	const entityCount = factGroups.length;
	const summary = totalFacts > 0
		? `共 ${totalFacts} 项事实，涉及 ${entityCount} 个实体`
		: '未找到引用';

	const content = renderProfileSection(parent, {
		sectionId: 'referenced-facts',
		title: '被引用的事实',
		summary,
		expanded: options.sectionStates['referenced-facts'] ?? true,
		onToggle: options.onToggle,
		icon: 'file-search'
	});
	if (!content) return;

	if (factGroups.length === 0) {
		content.createDiv({ cls: 'cr-profile__section-empty', text: '没有实体引用此来源' });
		return;
	}

	for (const group of factGroups) {
		const groupEl = content.createDiv({ cls: 'cr-profile__fact-group' });

		// Entity name (clickable)
		const header = groupEl.createDiv({ cls: 'cr-profile__fact-group-header' });
		const link = header.createSpan({
			text: group.entityName,
			cls: 'cr-profile__entity-link'
		});

		if (group.entityCrId) {
			link.addEventListener('click', () => {
				options.onEntityLinkClick(
					group.entityCrId,
					group.entityName,
					'person', // Most common; could be enhanced to detect type
					group.entityFilePath
				);
			});
		}

		// Facts list
		const factList = groupEl.createDiv({ cls: 'cr-profile__fact-list' });
		for (const fact of group.facts) {
			const factRow = factList.createDiv({ cls: 'cr-profile__fact-row' });
			factRow.createSpan({
				text: FACT_KEY_LABELS[fact.factKey as FactKey] ?? fact.factKey.replace(/_/g, ' '),
				cls: 'cr-profile__fact-key'
			});
			factRow.createSpan({
				text: fact.factValue,
				cls: 'cr-profile__fact-value'
			});
		}
	}
}
