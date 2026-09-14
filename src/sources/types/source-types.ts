/**
 * Source Types for Evidence & Source Management
 *
 * Defines the built-in source types and interfaces for source notes,
 * including evidence visualization types for GPS-aligned research.
 */

import { LucideIconName } from '../../ui/lucide-icons';
import { capitalize } from '../../utils/format-utils';

/**
 * Confidence level for source reliability
 */
export type SourceConfidence = 'high' | 'medium' | 'low' | 'unknown';

/**
 * Source quality classification per Elizabeth Shown Mills / GPS methodology
 *
 * - primary: Created at or near the time of the event by a participant or witness
 *   (e.g., original vital records, census enumeration, contemporary letters)
 * - secondary: Created later from memory or hearsay
 *   (e.g., family bibles with later entries, obituaries, oral histories)
 * - derivative: Copies, transcriptions, or abstracts of other sources
 *   (e.g., database transcriptions, published abstracts, photocopies)
 */
export type SourceQuality = 'primary' | 'secondary' | 'derivative';

/**
 * Mills source classification: what is the document itself?
 *
 * - original: First recording of information, or an image of the original
 * - derivative: A copy, transcription, abstract, or extract of another source
 * - authored_narrative: An interpretive or synthesized work (e.g., published genealogy, biography)
 */
export type SourceClassification = 'original' | 'derivative' | 'authored_narrative';

/**
 * Mills information classification: who provided the information?
 *
 * - primary: Informant was a participant in or witness to the event
 * - secondary: Informant learned of the event from memory, hearsay, or oral tradition
 * - undetermined: Basis for the informant's knowledge is unknown
 */
export type InformationClassification = 'primary' | 'secondary' | 'undetermined';

/**
 * Mills evidence classification: how does the information relate to the research question?
 *
 * - direct: Answers the research question explicitly, on its face
 * - indirect: Requires interpretation or combination with other evidence
 * - negative: Absence of expected information is itself meaningful evidence
 */
export type EvidenceClassification = 'direct' | 'indirect' | 'negative';

/**
 * Fact keys that can be tracked for source coverage
 */
export type FactKey =
	| 'birth_date'
	| 'birth_place'
	| 'death_date'
	| 'death_place'
	| 'parents'
	| 'marriage_date'
	| 'marriage_place'
	| 'spouse'
	| 'occupation'
	| 'residence';

/**
 * All trackable fact keys
 */
export const FACT_KEYS: FactKey[] = [
	'birth_date',
	'birth_place',
	'death_date',
	'death_place',
	'parents',
	'marriage_date',
	'marriage_place',
	'spouse',
	'occupation',
	'residence'
];

/**
 * Human-readable labels for fact keys
 */
export const FACT_KEY_LABELS: Record<FactKey, string> = {
	birth_date: '出生日期',
	birth_place: '出生地点',
	death_date: '去世日期',
	death_place: '去世地点',
	parents: '父母',
	marriage_date: '结婚日期',
	marriage_place: '结婚地点',
	spouse: '配偶',
	occupation: '职业',
	residence: '居住地'
};

/**
 * Flat property names for sourced facts (Obsidian-compatible format)
 *
 * These replace the nested `sourced_facts` object with individual properties.
 * Each property is an array of wikilinks to source notes.
 *
 * Example:
 * ```yaml
 * sourced_birth_date: ["[[1870 Census]]", "[[Birth Certificate]]"]
 * sourced_death_date: ["[[Death Certificate]]"]
 * ```
 */
export type SourcedPropertyName =
	| 'sourced_birth_date'
	| 'sourced_birth_place'
	| 'sourced_death_date'
	| 'sourced_death_place'
	| 'sourced_parents'
	| 'sourced_marriage_date'
	| 'sourced_marriage_place'
	| 'sourced_spouse'
	| 'sourced_occupation'
	| 'sourced_residence';

/**
 * Map from FactKey to its corresponding sourced property name
 */
export const FACT_KEY_TO_SOURCED_PROPERTY: Record<FactKey, SourcedPropertyName> = {
	birth_date: 'sourced_birth_date',
	birth_place: 'sourced_birth_place',
	death_date: 'sourced_death_date',
	death_place: 'sourced_death_place',
	parents: 'sourced_parents',
	marriage_date: 'sourced_marriage_date',
	marriage_place: 'sourced_marriage_place',
	spouse: 'sourced_spouse',
	occupation: 'sourced_occupation',
	residence: 'sourced_residence'
};

/**
 * Map from sourced property name to its FactKey
 */
export const SOURCED_PROPERTY_TO_FACT_KEY: Record<SourcedPropertyName, FactKey> = {
	sourced_birth_date: 'birth_date',
	sourced_birth_place: 'birth_place',
	sourced_death_date: 'death_date',
	sourced_death_place: 'death_place',
	sourced_parents: 'parents',
	sourced_marriage_date: 'marriage_date',
	sourced_marriage_place: 'marriage_place',
	sourced_spouse: 'spouse',
	sourced_occupation: 'occupation',
	sourced_residence: 'residence'
};

/**
 * All sourced property names
 */
export const SOURCED_PROPERTY_NAMES: SourcedPropertyName[] = [
	'sourced_birth_date',
	'sourced_birth_place',
	'sourced_death_date',
	'sourced_death_place',
	'sourced_parents',
	'sourced_marriage_date',
	'sourced_marriage_place',
	'sourced_spouse',
	'sourced_occupation',
	'sourced_residence'
];

/**
 * Source citation for a specific fact
 */
export interface FactSourceEntry {
	/** Array of wikilinks to source notes */
	sources: string[];
}

/**
 * Fact-level source tracking for a person note
 *
 * Maps fact keys to their supporting sources.
 * Missing keys are considered unsourced.
 * Empty sources array means explicitly tracked as unsourced.
 */
export type SourcedFacts = Partial<Record<FactKey, FactSourceEntry>>;

/**
 * Coverage status for a single fact
 */
export type FactCoverageStatus = 'well-sourced' | 'sourced' | 'weakly-sourced' | 'unsourced';

/**
 * Coverage information for a single fact
 */
export interface FactCoverage {
	factKey: FactKey;
	status: FactCoverageStatus;
	sourceCount: number;
	/** Best quality among sources (if any) */
	bestQuality?: SourceQuality;
	/** Links to source notes */
	sources: string[];
}

/**
 * Overall research coverage for a person
 */
export interface PersonResearchCoverage {
	personCrId: string;
	personName: string;
	filePath: string;
	/** Percentage of tracked facts that have sources (0-100) */
	coveragePercent: number;
	/** Number of facts with at least one source */
	sourcedFactCount: number;
	/** Total number of trackable facts */
	totalFactCount: number;
	/** Coverage breakdown by fact */
	facts: FactCoverage[];
}

/**
 * Citation format options
 */
export type CitationFormat = 'chicago' | 'evidence_explained' | 'mla' | 'turabian';

/**
 * Definition of a source type (built-in or custom)
 */
export interface SourceTypeDefinition {
	id: string;
	name: string;
	description: string;
	icon: LucideIconName;
	color: string;
	/** Category ID - can be built-in or custom */
	category: string;
	isBuiltIn: boolean;
	/** Markdown template for the note body (without frontmatter) */
	template?: string;
}

/**
 * Person role property names for source notes (#219)
 * Each role is an array of wikilinks with optional display text containing details.
 * Example: `["[[John Smith|John Smith (Witness)]]"]`
 */
export type PersonRoleProperty =
	| 'principals'
	| 'witnesses'
	| 'informants'
	| 'officials'
	| 'enslaved_individuals'
	| 'family'
	| 'others';

/**
 * All person role property names
 */
export const PERSON_ROLE_PROPERTIES: PersonRoleProperty[] = [
	'principals',
	'witnesses',
	'informants',
	'officials',
	'enslaved_individuals',
	'family',
	'others'
];

/**
 * Human-readable labels for person role properties
 */
export const PERSON_ROLE_LABELS: Record<PersonRoleProperty, string> = {
	principals: '当事人',
	witnesses: '证人',
	informants: '告密者',
	officials: '官员',
	enslaved_individuals: '被奴役者',
	family: '家族',
	others: '其他'
};

/**
 * Descriptions for person role properties
 */
export const PERSON_ROLE_DESCRIPTIONS: Record<PersonRoleProperty, string> = {
	principals: '文件的主体（逝者、立遗嘱人、新郎/新娘）',
	witnesses: '事件或文件签署的具名见证人',
	informants: '提供信息的人（影响质量评估）',
	officials: '书记员、法官、主婚人、医生、殡葬承办人',
	enslaved_individuals: '在遗嘱、财产清单中被列为财产的人',
	family: '与当事人相关的具名家族成员',
	others: '不符合以上分类的任何角色'
};

/**
 * Parsed person role entry
 */
export interface ParsedPersonRole {
	/** Link target (file path or note name) */
	linkTarget: string;
	/** Display name (may differ from link target) */
	displayName: string;
	/** Optional role details extracted from display text */
	details?: string;
	/** Original raw value from frontmatter */
	raw: string;
}

/**
 * Source note data extracted from frontmatter
 */
export interface SourceNote {
	/** File path in vault */
	filePath: string;
	/** Unique identifier */
	crId: string;
	/** Display title */
	title: string;
	/** Source type (census, vital_record, etc.) */
	sourceType: string;
	/** Date of the original document */
	date?: string;
	/** When the source was accessed */
	dateAccessed?: string;
	/** Repository/archive where source is held */
	repository?: string;
	/** URL to online source */
	repositoryUrl?: string;
	/** Collection or record group name */
	collection?: string;
	/** Geographic location of record */
	location?: string;
	/** Media file wikilinks (aggregated from media, media_2, etc.) */
	media: string[];
	/** Confidence level */
	confidence: SourceConfidence;
	/** Manual citation override */
	citationOverride?: string;
	/**
	 * Source quality classification (GPS methodology)
	 * If not explicitly set, inferred from sourceType via getDefaultSourceQuality()
	 */
	sourceQuality?: SourceQuality;
	/** Mills source classification: what is the document itself? */
	sourceClassification?: SourceClassification;
	/** Mills information classification: who provided the information? */
	informationClassification?: InformationClassification;
	/** Mills evidence classification: how does the information relate to the question? */
	evidenceClassification?: EvidenceClassification;

	// Source hierarchy (#337)
	/** Parent source wikilink (e.g., probate packet parent note) */
	sourceParent?: string;
	/** Parent source cr_id for reliable resolution */
	sourceParentId?: string;

	// Person roles (#219)
	/** Subject(s) of the document */
	principals?: string[];
	/** Named witnesses */
	witnesses?: string[];
	/** Person(s) providing information */
	informants?: string[];
	/** Authority figures (clerks, judges, etc.) */
	officials?: string[];
	/** Persons listed as property */
	enslaved_individuals?: string[];
	/** Family members of principals */
	family?: string[];
	/** Other roles not fitting above categories */
	others?: string[];
}

/**
 * Summary statistics for sources
 */
export interface SourceStats {
	totalSources: number;
	byType: Record<string, number>;
	byRepository: Record<string, number>;
	byConfidence: Record<SourceConfidence, number>;
	withMedia: number;
	withoutMedia: number;
}

/**
 * Built-in source types
 */
export const BUILT_IN_SOURCE_TYPES: SourceTypeDefinition[] = [
	// Vital Records
	{
		id: 'vital_record',
		name: '重要记录',
		description: '出生、死亡、婚姻证书',
		icon: 'file-text',
		color: '#4a90d9',
		category: 'vital',
		isBuiltIn: true
	},
	{
		id: 'obituary',
		name: '讣告',
		description: '死亡通告、纪念文章',
		icon: 'bookmark',
		color: '#7c7c7c',
		category: 'vital',
		isBuiltIn: true
	},

	// Census
	{
		id: 'census',
		name: '人口普查',
		description: '人口普查记录',
		icon: 'users',
		color: '#5ba55b',
		category: 'census',
		isBuiltIn: true
	},

	// Church Records
	{
		id: 'church_record',
		name: '教会记录',
		description: '洗礼、婚姻、安葬记录',
		icon: 'church',
		color: '#9b59b6',
		category: 'church',
		isBuiltIn: true
	},

	// Legal
	{
		id: 'court_record',
		name: '法院记录',
		description: '法律诉讼、离婚',
		icon: 'gavel',
		color: '#8b4513',
		category: 'legal',
		isBuiltIn: true
	},
	{
		id: 'land_deed',
		name: '土地契约',
		description: '财产记录、契约',
		icon: 'map',
		color: '#228b22',
		category: 'legal',
		isBuiltIn: true
	},
	{
		id: 'probate',
		name: '遗嘱认证',
		description: '遗嘱、遗产清单',
		icon: 'scroll',
		color: '#daa520',
		category: 'legal',
		isBuiltIn: true
	},

	// Military
	{
		id: 'military',
		name: '军事记录',
		description: '服役记录、征兵卡、抚恤金',
		icon: 'shield',
		color: '#2e8b57',
		category: 'military',
		isBuiltIn: true
	},

	// Immigration
	{
		id: 'immigration',
		name: '移民记录',
		description: '船舶舱单、入籍、护照',
		icon: 'ship',
		color: '#4169e1',
		category: 'other',
		isBuiltIn: true
	},

	// Media & Correspondence
	{
		id: 'photo',
		name: '照片',
		description: '照片与肖像',
		icon: 'image',
		color: '#ff6b6b',
		category: 'media',
		isBuiltIn: true
	},
	{
		id: 'correspondence',
		name: '通信',
		description: '信件、电子邮件、明信片',
		icon: 'mail',
		color: '#ff8c00',
		category: 'media',
		isBuiltIn: true
	},
	{
		id: 'newspaper',
		name: '报纸',
		description: '报纸文章',
		icon: 'newspaper',
		color: '#696969',
		category: 'media',
		isBuiltIn: true
	},
	{
		id: 'oral_history',
		name: '口述历史',
		description: '访谈、录音',
		icon: 'mic',
		color: '#e91e63',
		category: 'media',
		isBuiltIn: true
	},

	// Other
	{
		id: 'custom',
		name: '自定义',
		description: '用户定义的来源类型',
		icon: 'file',
		color: '#808080',
		category: 'other',
		isBuiltIn: true
	}
];

/**
 * Get a source type definition by ID
 */
export function getSourceType(
	typeId: string,
	customTypes: SourceTypeDefinition[] = [],
	showBuiltIn = true
): SourceTypeDefinition | undefined {
	// Check custom types first
	const customType = customTypes.find(t => t.id === typeId);
	if (customType) return customType;

	// Check built-in types
	if (showBuiltIn) {
		return BUILT_IN_SOURCE_TYPES.find(t => t.id === typeId);
	}

	return undefined;
}

/**
 * Get all available source types
 */
export function getAllSourceTypes(
	customTypes: SourceTypeDefinition[] = [],
	showBuiltIn = true
): SourceTypeDefinition[] {
	const types: SourceTypeDefinition[] = [];

	if (showBuiltIn) {
		types.push(...BUILT_IN_SOURCE_TYPES);
	}

	types.push(...customTypes);

	return types;
}

/**
 * Group source types by category
 */
export function getSourceTypesByCategory(
	customTypes: SourceTypeDefinition[] = [],
	showBuiltIn = true
): Record<string, SourceTypeDefinition[]> {
	const types = getAllSourceTypes(customTypes, showBuiltIn);
	const grouped: Record<string, SourceTypeDefinition[]> = {};

	for (const type of types) {
		if (!grouped[type.category]) {
			grouped[type.category] = [];
		}
		grouped[type.category].push(type);
	}

	return grouped;
}

/**
 * Category display names
 */
export const SOURCE_CATEGORY_NAMES: Record<string, string> = {
	vital: '重要记录',
	census: '人口普查',
	church: '教会记录',
	legal: '法律与财产',
	military: '军事',
	media: '媒体与通信',
	other: '其他'
};

/**
 * Default source quality by source type
 *
 * These defaults assume the user has the original or authoritative version.
 * Users can override with explicit source_quality in frontmatter.
 */
export const DEFAULT_SOURCE_QUALITY: Record<string, SourceQuality> = {
	// Primary sources - created at/near the event
	census: 'primary',
	vital_record: 'primary',
	church_record: 'primary',
	military: 'primary',
	court_record: 'primary',
	land_deed: 'primary',
	probate: 'primary',
	photo: 'primary',
	correspondence: 'primary',
	immigration: 'primary',

	// Secondary sources - created later from memory/hearsay
	newspaper: 'secondary',
	obituary: 'secondary',
	oral_history: 'secondary',
	custom: 'secondary'
};

/**
 * Get the quality for a source, using explicit value or inferring from type
 */
export function getSourceQuality(source: SourceNote): SourceQuality {
	// Use explicit quality if set
	if (source.sourceQuality) {
		return source.sourceQuality;
	}

	// Infer from source type
	return DEFAULT_SOURCE_QUALITY[source.sourceType] || 'secondary';
}

/**
 * Get the default quality for a source type
 */
export function getDefaultSourceQuality(sourceType: string): SourceQuality {
	return DEFAULT_SOURCE_QUALITY[sourceType] || 'secondary';
}

/**
 * User-friendly labels for source quality (for casual users)
 */
export const SOURCE_QUALITY_LABELS: Record<SourceQuality, { label: string; description: string }> = {
	primary: {
		label: '原始记录',
		description: '在事件发生时由参与者或见证人创建'
	},
	secondary: {
		label: '事后记述',
		description: '事后根据记忆或传闻创建'
	},
	derivative: {
		label: '副本/转录',
		description: '其他来源的副本、转录或摘要'
	}
};

/**
 * User-friendly labels for Mills source classification
 */
export const SOURCE_CLASSIFICATION_LABELS: Record<SourceClassification, { label: string; description: string }> = {
	original: {
		label: '原始',
		description: '信息的最初记录，或原始件的图像'
	},
	derivative: {
		label: '衍生',
		description: '另一来源的副本、转录、摘要或摘录'
	},
	authored_narrative: {
		label: '著述叙述',
		description: '解释性或综合性的作品（例如已出版的家谱）'
	}
};

/**
 * User-friendly labels for Mills information classification
 */
export const INFORMATION_CLASSIFICATION_LABELS: Record<InformationClassification, { label: string; description: string }> = {
	primary: {
		label: '一手',
		description: '信息提供者是事件的参与者或见证人'
	},
	secondary: {
		label: '二手',
		description: '信息提供者从记忆、传闻或口述传统中得知该事件'
	},
	undetermined: {
		label: '未确定',
		description: '信息提供者知识的依据未知'
	}
};

/**
 * User-friendly labels for Mills evidence classification
 */
export const EVIDENCE_CLASSIFICATION_LABELS: Record<EvidenceClassification, { label: string; description: string }> = {
	direct: {
		label: '直接',
		description: '在字面上直接回答研究问题'
	},
	indirect: {
		label: '间接',
		description: '需要解释或与其他证据结合'
	},
	negative: {
		label: '否定',
		description: '预期信息的缺失本身就是有意义的证据'
	}
};

/**
 * Get the effective information quality for a source.
 * Prefers informationClassification when present; falls back to sourceQuality.
 */
export function getEffectiveInformationQuality(source: SourceNote): SourceQuality {
	if (source.informationClassification) {
		if (source.informationClassification === 'primary') return 'primary';
		if (source.informationClassification === 'secondary') return 'secondary';
		// 'undetermined' maps to 'secondary' for conservative analysis
		return 'secondary';
	}
	return getSourceQuality(source);
}

/**
 * Source type category identifier
 */
export type SourceTypeCategory = 'vital' | 'census' | 'church' | 'legal' | 'military' | 'media' | 'other';

/**
 * Definition of a source type category (built-in or custom)
 */
export interface SourceCategoryDefinition {
	id: string;
	name: string;
	sortOrder: number;
}

/**
 * Built-in source type categories
 */
export const BUILT_IN_SOURCE_CATEGORIES: SourceCategoryDefinition[] = [
	{ id: 'vital', name: '重要记录', sortOrder: 0 },
	{ id: 'census', name: '人口普查', sortOrder: 1 },
	{ id: 'church', name: '教会记录', sortOrder: 2 },
	{ id: 'legal', name: '法律与财产', sortOrder: 3 },
	{ id: 'military', name: '军事', sortOrder: 4 },
	{ id: 'media', name: '媒体与通信', sortOrder: 5 },
	{ id: 'other', name: '其他', sortOrder: 6 }
];

/**
 * Check if a category ID is a built-in category
 */
export function isBuiltInSourceCategory(categoryId: string): boolean {
	return BUILT_IN_SOURCE_CATEGORIES.some(c => c.id === categoryId);
}

/**
 * Get all source type categories (built-in + custom)
 * Supports customizations and hiding of built-in categories
 */
export function getAllSourceCategories(
	customCategories: SourceCategoryDefinition[] = [],
	customizations?: Record<string, Partial<SourceCategoryDefinition>>,
	hiddenCategories?: string[]
): SourceCategoryDefinition[] {
	const hidden = new Set(hiddenCategories ?? []);
	const categories: SourceCategoryDefinition[] = [];

	// Add built-in categories (with customizations, excluding hidden)
	for (const builtIn of BUILT_IN_SOURCE_CATEGORIES) {
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
 * Get source category display name
 * Respects customizations for built-in categories
 */
export function getSourceCategoryName(
	categoryId: string,
	customCategories: SourceCategoryDefinition[] = [],
	customizations?: Record<string, Partial<SourceCategoryDefinition>>
): string {
	// Check customizations first for built-in categories
	const customization = customizations?.[categoryId];
	if (customization?.name) return customization.name;

	const builtIn = BUILT_IN_SOURCE_CATEGORIES.find(c => c.id === categoryId);
	if (builtIn) return builtIn.name;

	const custom = customCategories.find(c => c.id === categoryId);
	if (custom) return custom.name;

	// Fallback: use SOURCE_CATEGORY_NAMES or capitalize the ID
	return SOURCE_CATEGORY_NAMES[categoryId] || capitalize(categoryId);
}

/**
 * Get all source types with customizations and filtering applied
 */
export function getAllSourceTypesWithCustomizations(
	customTypes: SourceTypeDefinition[] = [],
	showBuiltIn = true,
	customizations?: Record<string, Partial<SourceTypeDefinition>>,
	hiddenTypes?: string[]
): SourceTypeDefinition[] {
	const hidden = new Set(hiddenTypes ?? []);
	const types: SourceTypeDefinition[] = [];

	// Add built-in types with customizations
	if (showBuiltIn) {
		for (const builtIn of BUILT_IN_SOURCE_TYPES) {
			if (hidden.has(builtIn.id)) continue;

			const overrides = customizations?.[builtIn.id];
			if (overrides) {
				types.push({
					...builtIn,
					...overrides
				});
			} else {
				types.push(builtIn);
			}
		}
	}

	// Add custom types (excluding hidden)
	for (const custom of customTypes) {
		if (!hidden.has(custom.id)) {
			types.push(custom);
		}
	}

	return types;
}

/**
 * Group source types by category with full customization support
 */
export function getSourceTypesByCategoryWithCustomizations(
	customTypes: SourceTypeDefinition[] = [],
	showBuiltIn = true,
	typeCustomizations?: Record<string, Partial<SourceTypeDefinition>>,
	hiddenTypes?: string[],
	customCategories: SourceCategoryDefinition[] = [],
	categoryCustomizations?: Record<string, Partial<SourceCategoryDefinition>>,
	hiddenCategories?: string[]
): Record<string, SourceTypeDefinition[]> {
	const types = getAllSourceTypesWithCustomizations(customTypes, showBuiltIn, typeCustomizations, hiddenTypes);
	const allCategories = getAllSourceCategories(customCategories, categoryCustomizations, hiddenCategories);

	// Initialize grouped object with all categories
	const grouped: Record<string, SourceTypeDefinition[]> = {};
	for (const cat of allCategories) {
		grouped[cat.id] = [];
	}

	// Group types into their categories
	for (const type of types) {
		if (grouped[type.category]) {
			grouped[type.category].push(type);
		} else {
			// Type's category not in list (possibly hidden), add to 'other'
			if (grouped['other']) {
				grouped['other'].push(type);
			}
		}
	}

	return grouped;
}

/**
 * Parse a person role entry from frontmatter (#219)
 *
 * Handles wikilink syntax: `[[Link Target]]` or `[[Link Target|Display Text]]`
 * Extracts optional details from parentheses in display text.
 *
 * @param raw The raw string value from frontmatter
 * @returns Parsed role entry or null if not a valid wikilink
 */
export function parsePersonRoleEntry(raw: string): ParsedPersonRole | null {
	if (!raw || typeof raw !== 'string') return null;

	// Match wikilink with optional alias: [[target]] or [[target|display]]
	const wikilinkMatch = raw.match(/^\[\[([^\]|]+)(?:\|([^\]]+))?\]\]$/);
	if (!wikilinkMatch) return null;

	const linkTarget = wikilinkMatch[1].trim();
	const displayText = wikilinkMatch[2]?.trim();

	// If no display text, use link target as display name
	if (!displayText) {
		return {
			linkTarget,
			displayName: linkTarget,
			raw
		};
	}

	// Try to extract details from parentheses in display text
	// Pattern: "Name (Details)" -> displayName="Name", details="Details"
	const detailsMatch = displayText.match(/^(.+?)\s*\(([^)]+)\)$/);
	if (detailsMatch) {
		return {
			linkTarget,
			displayName: detailsMatch[1].trim(),
			details: detailsMatch[2].trim(),
			raw
		};
	}

	// No parenthetical details, use full display text as name
	return {
		linkTarget,
		displayName: displayText,
		raw
	};
}

/**
 * Parse all person role entries from an array
 *
 * @param entries Array of raw strings from frontmatter
 * @returns Array of parsed entries (invalid entries filtered out)
 */
export function parsePersonRoleEntries(entries: string[] | undefined): ParsedPersonRole[] {
	if (!entries || !Array.isArray(entries)) return [];
	return entries
		.map(parsePersonRoleEntry)
		.filter((entry): entry is ParsedPersonRole => entry !== null);
}

/**
 * Get all person roles from a source note as parsed entries
 *
 * @param source The source note
 * @returns Map of role property to parsed entries
 */
export function getAllPersonRoles(source: SourceNote): Map<PersonRoleProperty, ParsedPersonRole[]> {
	const roles = new Map<PersonRoleProperty, ParsedPersonRole[]>();

	for (const prop of PERSON_ROLE_PROPERTIES) {
		const entries = source[prop];
		if (entries && entries.length > 0) {
			const parsed = parsePersonRoleEntries(entries);
			if (parsed.length > 0) {
				roles.set(prop, parsed);
			}
		}
	}

	return roles;
}

/**
 * Check if a source note has any person roles defined
 */
export function hasPersonRoles(source: SourceNote): boolean {
	return PERSON_ROLE_PROPERTIES.some(prop => {
		const entries = source[prop];
		return entries && entries.length > 0;
	});
}
