import { describe, expect, it } from 'vitest';
import { generatePeopleBaseTemplate } from '../src/constants/base-template';
import { generatePlacesBaseTemplate } from '../src/constants/places-base-template';
import { generateEventsBaseTemplate } from '../src/constants/events-base-template';
import { BASE_TEMPLATE } from '../src/constants/base-template';
import { PLACES_BASE_TEMPLATE } from '../src/constants/places-base-template';
import { EVENTS_BASE_TEMPLATE } from '../src/constants/events-base-template';
import { ORGANIZATIONS_BASE_TEMPLATE } from '../src/constants/organizations-base-template';
import { SOURCES_BASE_TEMPLATE } from '../src/constants/sources-base-template';
import { UNIVERSES_BASE_TEMPLATE } from '../src/constants/universes-base-template';
import { NOTES_BASE_TEMPLATE } from '../src/constants/notes-base-template';
import { RESEARCH_BASE_TEMPLATE } from '../src/constants/research-base-template';

/**
 * Obsidian 1.14 changed the `.base` view key `groupBy` from a mapping
 * (`property:` + `direction:`) to a plain string property reference. On 1.14
 * the old object form fails validation with "groupBy must be a string" and
 * the whole database file refuses to load. These fences keep every generated
 * base template on the string form.
 */

/** Every rendered template that must contain groupBy views, both aliased and plain */
const TEMPLATES: Record<string, string> = {
	'people (default)': generatePeopleBaseTemplate(),
	'people (aliased)': generatePeopleBaseTemplate({ aliases: { 出生: 'born', 父亲: 'father', 研究级别: 'research_level' } }),
	'people (const)': BASE_TEMPLATE,
	'places (default)': generatePlacesBaseTemplate(),
	'places (aliased)': generatePlacesBaseTemplate({ 地点类型: 'place_type', 宇宙: 'universe' }),
	'places (const)': PLACES_BASE_TEMPLATE,
	'events (default)': generateEventsBaseTemplate(),
	'events (aliased)': generateEventsBaseTemplate({ 类型: 'event_type', 置信度: 'confidence' }),
	'events (const)': EVENTS_BASE_TEMPLATE,
	organizations: ORGANIZATIONS_BASE_TEMPLATE,
	sources: SOURCES_BASE_TEMPLATE,
	universes: UNIVERSES_BASE_TEMPLATE,
	research: RESEARCH_BASE_TEMPLATE,
	notes: NOTES_BASE_TEMPLATE
};

function groupByLines(template: string): string[] {
	return template
		.split(/\r?\n/)
		.filter(line => /^\s*groupBy:/.test(line));
}

describe('base templates use string groupBy (Obsidian 1.14+)', () => {
	for (const [name, template] of Object.entries(TEMPLATES)) {
		it(`${name}: has at least one groupBy view`, () => {
			expect(groupByLines(template).length).toBeGreaterThan(0);
		});

		it(`${name}: every groupBy is an inline string value`, () => {
			for (const line of groupByLines(template)) {
				// Mapping form (`groupBy:` alone on the line, keys below) is
				// rejected by 1.14; string form carries a value on the same line.
				expect(line, `offending line: ${line}`).toMatch(/^\s+groupBy: \S[^:]*$/);
			}
		});

		it(`${name}: no groupBy mapping residue (property/direction under groupBy)`, () => {
			expect(template).not.toMatch(/groupBy:\r?\n\s+property:/);
			expect(template).not.toMatch(/groupBy:\r?\n\s+direction:/);
		});
	}

	it('string values are property references (no mapping residue)', () => {
		for (const template of Object.values(TEMPLATES)) {
			for (const line of groupByLines(template)) {
				const value = line.split(/groupBy:\s+/)[1].trim();
				// 1.14 expects a property path; user aliases may contribute
				// non-ASCII property names, so accept any single scalar token.
				expect(value, `bad groupBy value: ${value}`).toMatch(/^[^\s:]+$/);
			}
		}
	});
});
