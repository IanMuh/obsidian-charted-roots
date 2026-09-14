/**
 * Event Types for Chronological Story Mapping
 *
 * Defines types and interfaces for event notes, supporting genealogists,
 * worldbuilders, and writers with timeline visualization.
 */

import type { TFile } from 'obsidian';
import type { LucideIconName } from '../../ui/lucide-icons';
import { capitalize } from '../../utils/format-utils';

/**
 * Confidence level for event accuracy
 */
export type EventConfidence = 'high' | 'medium' | 'low' | 'unknown';

/**
 * Date precision for event dates
 */
export type DatePrecision =
	| 'exact'      // Known to the day: 1850-03-15
	| 'month'      // Known to the month: 1850-03
	| 'year'       // Known to the year: 1850
	| 'decade'     // Known to the decade: 1850s
	| 'estimated'  // Approximate: "circa 1850"
	| 'range'      // Between two dates: 1848-1852
	| 'unknown';   // Date unknown, use relative ordering

/**
 * Built-in event type categories
 */
export type BuiltInEventTypeCategory = 'vital' | 'life' | 'narrative';

/**
 * Event type category for grouping (built-in or user-defined)
 * Uses (string & {}) to preserve literal type hints while allowing any string
 */
export type EventTypeCategory = BuiltInEventTypeCategory | (string & {});

/**
 * Definition of a user-created category
 */
export interface EventCategoryDefinition {
	id: string;
	name: string;
	sortOrder: number;
}

/**
 * Core event types (vital events)
 */
export const CORE_EVENT_TYPES = [
	'birth',
	'death',
	'marriage',
	'divorce',
	'adoption'
] as const;

/**
 * Extended event types (common life events)
 */
export const EXTENDED_EVENT_TYPES = [
	'residence',
	'census',
	'occupation',
	'military',
	'immigration',
	'education',
	'burial',
	'baptism',
	'confirmation',
	'ordination',
	'transfer'
] as const;

/**
 * Narrative event types (for storytelling)
 */
export const NARRATIVE_EVENT_TYPES = [
	'anecdote',
	'lore_event',
	'plot_point',
	'flashback',
	'foreshadowing',
	'backstory',
	'climax',
	'resolution'
] as const;

/**
 * Whether an event type surfaces storytelling-only fields (currently the
 * `Canonical event` toggle in the Edit Event modal's Worldbuilding section).
 * The dropdown's onChange uses this to reactively show/hide the section so
 * picking a narrative type after opening the modal reveals the toggle
 * without requiring a save+reopen (#507 follow-up).
 */
export function isNarrativeEventType(type: string): boolean {
	return (NARRATIVE_EVENT_TYPES as ReadonlyArray<string>).includes(type);
}

/**
 * All built-in event types
 */
export const BUILT_IN_EVENT_TYPES = [
	...CORE_EVENT_TYPES,
	...EXTENDED_EVENT_TYPES,
	...NARRATIVE_EVENT_TYPES,
	'custom'
] as const;

export type BuiltInEventType = typeof BUILT_IN_EVENT_TYPES[number];

/**
 * Definition of an event type (built-in or custom)
 */
export interface EventTypeDefinition {
	id: string;
	name: string;
	description: string;
	icon: LucideIconName;
	color: string;
	category: EventTypeCategory;
	isBuiltIn: boolean;
}

/**
 * Built-in event type definitions
 */
export const EVENT_TYPE_DEFINITIONS: EventTypeDefinition[] = [
	// Vital events (birth, death, marriage, divorce)
	{
		id: 'birth',
		name: '出生',
		description: '人物的出生',
		icon: 'baby',
		color: '#4ade80',
		category: 'vital',
		isBuiltIn: true
	},
	{
		id: 'death',
		name: '去世',
		description: '人物的去世',
		icon: 'skull',
		color: '#6b7280',
		category: 'vital',
		isBuiltIn: true
	},
	{
		id: 'marriage',
		name: '婚姻',
		description: '婚姻仪式',
		icon: 'heart',
		color: '#f472b6',
		category: 'vital',
		isBuiltIn: true
	},
	{
		id: 'divorce',
		name: '离婚',
		description: '离婚或婚姻无效',
		icon: 'heart-off',
		color: '#ef4444',
		category: 'vital',
		isBuiltIn: true
	},
	{
		id: 'adoption',
		name: '收养',
		description: '人物的收养',
		icon: 'heart-handshake',
		color: '#fb923c',
		category: 'vital',
		isBuiltIn: true
	},

	// Life events (common non-vital life events)
	{
		id: 'residence',
		name: '居住',
		description: '居住地变更',
		icon: 'home',
		color: '#60a5fa',
		category: 'life',
		isBuiltIn: true
	},
	{
		id: 'census',
		name: '人口普查',
		description: '记录家庭的人口普查',
		icon: 'clipboard-list',
		color: '#8b5cf6',
		category: 'life',
		isBuiltIn: true
	},
	{
		id: 'occupation',
		name: '职业',
		description: '就业或职业变更',
		icon: 'hammer',
		color: '#a78bfa',
		category: 'life',
		isBuiltIn: true
	},
	{
		id: 'military',
		name: '兵役',
		description: '兵役事件',
		icon: 'shield',
		color: '#2e8b57',
		category: 'life',
		isBuiltIn: true
	},
	{
		id: 'immigration',
		name: '移民',
		description: '迁入或迁出',
		icon: 'ship',
		color: '#4169e1',
		category: 'life',
		isBuiltIn: true
	},
	{
		id: 'education',
		name: '教育',
		description: '教育里程碑',
		icon: 'graduation-cap',
		color: '#fbbf24',
		category: 'life',
		isBuiltIn: true
	},
	{
		id: 'burial',
		name: '安葬',
		description: '安葬或下葬',
		icon: 'map-pin',
		color: '#78716c',
		category: 'life',
		isBuiltIn: true
	},
	{
		id: 'baptism',
		name: '洗礼',
		description: '洗礼或命名',
		icon: 'droplets',
		color: '#38bdf8',
		category: 'life',
		isBuiltIn: true
	},
	{
		id: 'confirmation',
		name: '坚振',
		description: '宗教坚振礼',
		icon: 'church',
		color: '#9b59b6',
		category: 'life',
		isBuiltIn: true
	},
	{
		id: 'ordination',
		name: '圣职授任',
		description: '宗教圣职授任',
		icon: 'book-open',
		color: '#7c3aed',
		category: 'life',
		isBuiltIn: true
	},
	{
		id: 'transfer',
		name: '转让',
		description: '所有权、财产或身份的转让（继承、买卖、赠与等）',
		icon: 'arrow-right-left',
		color: '#f97316',
		category: 'life',
		isBuiltIn: true
	},

	// Narrative events (for storytelling and worldbuilding)
	{
		id: 'anecdote',
		name: '轶事',
		description: '家族故事或个人事件',
		icon: 'mic',
		color: '#fb923c',
		category: 'narrative',
		isBuiltIn: true
	},
	{
		id: 'lore_event',
		name: '设定事件',
		description: '世界构建的经典事件',
		icon: 'scroll',
		color: '#daa520',
		category: 'narrative',
		isBuiltIn: true
	},
	{
		id: 'plot_point',
		name: '情节节点',
		description: '关键情节或转折点',
		icon: 'bookmark',
		color: '#eab308',
		category: 'narrative',
		isBuiltIn: true
	},
	{
		id: 'flashback',
		name: '闪回',
		description: '在非时间顺序叙事中提及的事件',
		icon: 'history',
		color: '#a3a3a3',
		category: 'narrative',
		isBuiltIn: true
	},
	{
		id: 'foreshadowing',
		name: '伏笔',
		description: '为后续发展埋下伏笔的事件',
		icon: 'eye',
		color: '#c084fc',
		category: 'narrative',
		isBuiltIn: true
	},
	{
		id: 'backstory',
		name: '背景故事',
		description: '为人物或情节提供背景的前置事件',
		icon: 'history',
		color: '#94a3b8',
		category: 'narrative',
		isBuiltIn: true
	},
	{
		id: 'climax',
		name: '高潮',
		description: '戏剧冲突的顶点',
		icon: 'zap',
		color: '#f43f5e',
		category: 'narrative',
		isBuiltIn: true
	},
	{
		id: 'resolution',
		name: '结局',
		description: '故事收尾事件',
		icon: 'check',
		color: '#22c55e',
		category: 'narrative',
		isBuiltIn: true
	}
];

/**
 * Human-readable labels for event types
 */
export const EVENT_TYPE_LABELS: Record<string, string> = Object.fromEntries(
	EVENT_TYPE_DEFINITIONS.map(def => [def.id, def.name])
);

/**
 * Human-readable labels for date precision
 */
export const DATE_PRECISION_LABELS: Record<DatePrecision, string> = {
	exact: '精确日期',
	month: '仅月份',
	year: '仅年份',
	decade: '年代',
	estimated: '约计',
	range: '日期范围',
	unknown: '未知'
};

/**
 * Human-readable labels for confidence levels
 */
export const CONFIDENCE_LABELS: Record<EventConfidence, string> = {
	high: '高',
	medium: '中',
	low: '低',
	unknown: '未知'
};

/**
 * Event note data extracted from frontmatter
 */
export interface EventNote {
	/** File reference */
	file: TFile;
	/** File path in vault */
	filePath: string;
	/** Unique identifier */
	crId: string;
	/** Display title */
	title: string;
	/** Type of event */
	eventType: string;
	/** Event date (ISO format or fictional calendar) */
	date?: string;
	/** End date for ranges */
	dateEnd?: string;
	/** How precise the date is */
	datePrecision: DatePrecision;
	/** Primary person involved (wikilink) */
	person?: string;
	/** Multiple people involved (wikilinks) */
	persons?: string[];
	/** Where the event occurred (wikilink to place note) */
	place?: string;
	/** Sources documenting this event (wikilinks) */
	sources?: string[];
	/** Confidence level */
	confidence: EventConfidence;
	/** Additional details */
	description?: string;
	/** For worldbuilders: this is authoritative truth */
	isCanonical?: boolean;
	/** Fictional universe */
	universe?: string;
	/** Fictional date system ID */
	dateSystem?: string;
	/** Events that happen after this one (for relative ordering) */
	before?: string[];
	/** Events that happen before this one (for relative ordering) */
	after?: string[];
	/** Parent timeline note */
	timeline?: string;
	/** Computed sort value for Bases */
	sortOrder?: number;
	/** Groups/factions involved in this event (for filtering by nation, faction, etc.) */
	groups?: string[];
	/** Organization notes involved in this event (wikilinks) — surfaces the event on the org's profile (#659) */
	organizations?: string[];
	/** Media files linked to this event (wikilinks) */
	media?: string[];
	/** For transfer events: type of transfer (inheritance, purchase, gift, hire, seizure, birth, relocation) */
	transferType?: string;
	/** Research questions requiring investigation for this event */
	needs_research?: string[];
	/** Age at event (from GEDCOM AGE sub-tag) */
	age?: string;
	/** Cause (from GEDCOM CAUS sub-tag, e.g., cause of death) */
	cause?: string;
}

/**
 * Data for creating a new event note
 */
export interface CreateEventData {
	title: string;
	eventType: string;
	date?: string;
	dateEnd?: string;
	datePrecision: DatePrecision;
	person?: string;
	persons?: string[];
	/** File basename for the legacy `person` field (#510). When provided, the wikilink uses the [[basename|name]] form. */
	personBasename?: string;
	/** File basenames parallel to `persons[]` (#510). Indices align with `persons`; entries may be empty strings when basename is unknown. */
	personsBasenames?: string[];
	place?: string;
	/** File basename for `place` (#510). */
	placeBasename?: string;
	sources?: string[];
	confidence?: EventConfidence;
	description?: string;
	isCanonical?: boolean;
	universe?: string;
	dateSystem?: string;
	before?: string[];
	after?: string[];
	timeline?: string;
	groups?: string[];
	/** Organization notes involved in this event (wikilinks) (#659) */
	organizations?: string[];
	/** For transfer events: inheritance, purchase, gift, hire, seizure, birth, relocation */
	transferType?: string;
	/** Research questions requiring investigation for this event */
	needsResearch?: string[];
	/** Age at event (from GEDCOM AGE sub-tag) */
	age?: string;
	/** Cause (from GEDCOM CAUS sub-tag, e.g., cause of death) */
	cause?: string;
}

/**
 * Data for updating an event note
 */
export type UpdateEventData = Partial<CreateEventData>;

/**
 * Summary statistics for events
 */
export interface EventStats {
	totalEvents: number;
	byType: Record<string, number>;
	byPerson: Record<string, number>;
	byPlace: Record<string, number>;
	byGroup: Record<string, number>;
	byConfidence: Record<EventConfidence, number>;
	withSources: number;
	withoutSources: number;
	withDates: number;
	withRelativeOrdering: number;
}

/**
 * Options for retrieving event types
 */
export interface EventTypeOptions {
	/** User-defined event types */
	customTypes?: EventTypeDefinition[];
	/** Whether to include built-in types */
	showBuiltIn?: boolean;
	/** Customizations for built-in types (overrides) */
	customizations?: Record<string, Partial<EventTypeDefinition>>;
	/** Hidden type IDs (excluded from getAllEventTypes but still resolved by getEventType) */
	hiddenTypes?: string[];
}

/**
 * Get an event type definition by ID
 * Always returns the type if it exists, even if hidden (for existing notes)
 */
export function getEventType(
	typeId: string,
	customTypes: EventTypeDefinition[] = [],
	showBuiltIn = true,
	customizations?: Record<string, Partial<EventTypeDefinition>>
): EventTypeDefinition | undefined {
	// Check custom types first
	const customType = customTypes.find(t => t.id === typeId);
	if (customType) return customType;

	// Check built-in types
	if (showBuiltIn) {
		const builtIn = EVENT_TYPE_DEFINITIONS.find(t => t.id === typeId);
		if (builtIn) {
			// Apply customizations if any
			const overrides = customizations?.[typeId];
			if (overrides) {
				return {
					...builtIn,
					...overrides,
					isBuiltIn: true // Always preserve this
				};
			}
			return builtIn;
		}
	}

	return undefined;
}

/**
 * Get all available event types
 * Respects customizations and hidden types
 */
export function getAllEventTypes(
	customTypes: EventTypeDefinition[] = [],
	showBuiltIn = true,
	customizations?: Record<string, Partial<EventTypeDefinition>>,
	hiddenTypes?: string[]
): EventTypeDefinition[] {
	const types: EventTypeDefinition[] = [];
	const hidden = new Set(hiddenTypes ?? []);

	if (showBuiltIn) {
		for (const builtIn of EVENT_TYPE_DEFINITIONS) {
			// Skip hidden types
			if (hidden.has(builtIn.id)) continue;

			// Apply customizations if any
			const overrides = customizations?.[builtIn.id];
			if (overrides) {
				types.push({
					...builtIn,
					...overrides,
					isBuiltIn: true
				});
			} else {
				types.push(builtIn);
			}
		}
	}

	// Add user-defined types (excluding hidden ones)
	for (const custom of customTypes) {
		if (!hidden.has(custom.id)) {
			types.push(custom);
		}
	}

	return types;
}

/**
 * Group event types by category
 */
export function getEventTypesByCategory(
	customTypes: EventTypeDefinition[] = [],
	showBuiltIn = true,
	customizations?: Record<string, Partial<EventTypeDefinition>>,
	hiddenTypes?: string[],
	customCategories: EventCategoryDefinition[] = [],
	categoryCustomizations?: Record<string, Partial<EventCategoryDefinition>>,
	hiddenCategories?: string[]
): Record<string, EventTypeDefinition[]> {
	const types = getAllEventTypes(customTypes, showBuiltIn, customizations, hiddenTypes);
	const allCategories = getAllCategories(customCategories, categoryCustomizations, hiddenCategories);

	// Initialize grouped object with all categories
	const grouped: Record<string, EventTypeDefinition[]> = {};
	for (const cat of allCategories) {
		grouped[cat.id] = [];
	}

	// Group types into their categories
	for (const type of types) {
		if (!grouped[type.category]) {
			grouped[type.category] = [];
		}
		grouped[type.category].push(type);
	}

	return grouped;
}

/**
 * Built-in category definitions
 */
export const BUILT_IN_CATEGORIES: EventCategoryDefinition[] = [
	{ id: 'vital', name: '重要事件', sortOrder: 0 },
	{ id: 'life', name: '生活事件', sortOrder: 1 },
	{ id: 'narrative', name: '叙事事件', sortOrder: 2 }
];

/**
 * Options for getting categories
 */
export interface CategoryOptions {
	customCategories?: EventCategoryDefinition[];
	customizations?: Record<string, Partial<EventCategoryDefinition>>;
	hiddenCategories?: string[];
}

/**
 * Get all categories (built-in + custom)
 * Supports customizations and hiding of built-in categories
 */
export function getAllCategories(
	customCategories: EventCategoryDefinition[] = [],
	customizations?: Record<string, Partial<EventCategoryDefinition>>,
	hiddenCategories?: string[]
): EventCategoryDefinition[] {
	const hidden = new Set(hiddenCategories ?? []);
	const categories: EventCategoryDefinition[] = [];

	// Add built-in categories (with customizations, excluding hidden)
	for (const builtIn of BUILT_IN_CATEGORIES) {
		if (hidden.has(builtIn.id)) continue;

		const overrides = customizations?.[builtIn.id];
		if (overrides) {
			categories.push({
				...builtIn,
				...overrides
			});
		} else {
			categories.push(builtIn);
		}
	}

	// Add custom categories, avoiding duplicate IDs
	const existingIds = new Set(categories.map(c => c.id));
	for (const custom of customCategories) {
		if (!existingIds.has(custom.id)) {
			categories.push(custom);
		}
	}

	// Sort by sortOrder
	return categories.sort((a, b) => a.sortOrder - b.sortOrder);
}

/**
 * Get category display name
 * Respects customizations for built-in categories
 */
export function getCategoryName(
	categoryId: string,
	customCategories: EventCategoryDefinition[] = [],
	customizations?: Record<string, Partial<EventCategoryDefinition>>
): string {
	// Check customizations first for built-in categories
	const customization = customizations?.[categoryId];
	if (customization?.name) return customization.name;

	const builtIn = BUILT_IN_CATEGORIES.find(c => c.id === categoryId);
	if (builtIn) return builtIn.name;

	const custom = customCategories.find(c => c.id === categoryId);
	if (custom) return custom.name;

	// Fallback: capitalize the ID
	return capitalize(categoryId);
}

/**
 * Check if a string is a valid built-in event type
 */
export function isBuiltInEventType(type: string): type is BuiltInEventType {
	return (BUILT_IN_EVENT_TYPES as readonly string[]).includes(type);
}

/**
 * Check if a category is built-in
 */
export function isBuiltInCategory(categoryId: string): boolean {
	return BUILT_IN_CATEGORIES.some(c => c.id === categoryId);
}

/**
 * Get the category for an event type
 */
export function getEventTypeCategory(typeId: string): EventTypeCategory {
	if ((CORE_EVENT_TYPES as readonly string[]).includes(typeId)) return 'vital';
	if ((EXTENDED_EVENT_TYPES as readonly string[]).includes(typeId)) return 'life';
	if ((NARRATIVE_EVENT_TYPES as readonly string[]).includes(typeId)) return 'narrative';
	return 'life'; // Default to life events for unknown types
}
