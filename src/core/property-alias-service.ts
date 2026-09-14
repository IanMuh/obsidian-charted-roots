/**
 * Property Alias Service
 *
 * Allows users to map custom frontmatter property names to Charted Roots
 * canonical names. This enables compatibility with existing vaults that
 * use different naming conventions (e.g., "birthdate" instead of "born").
 */

import type CanvasRootsPlugin from '../../main';

/**
 * Canonical person note properties that can be aliased
 */
export const CANONICAL_PERSON_PROPERTIES = [
	// Core identity
	'name',
	'cr_id',
	'type',
	'sex',
	'gender', // Kept for users who prefer gender over sex
	'nickname',
	'maiden_name',
	// Name components (for multi-surname cultures and married/maiden name tracking)
	'given_name',
	'surnames',
	'married_names',
	// Dates
	'born',
	'died',
	// Places
	'birth_place',
	'death_place',
	// Biological parent relationships
	'father',
	'father_id',
	'mother',
	'mother_id',
	'parents',       // Array of parent links (alternative to father/mother)
	'parents_id',    // Array of parent cr_ids
	// Step-parent relationships
	'stepfather',
	'stepfather_id',
	'stepmother',
	'stepmother_id',
	// Adoptive parent relationships
	'adoptive_father',
	'adoptive_father_id',
	'adoptive_mother',
	'adoptive_mother_id',
	// Spouse and child relationships
	'spouse',
	'spouse_id',
	'partners',      // Array of partner/spouse links (alternative to spouse)
	'partners_id',   // Array of partner cr_ids
	'child',
	'children_id',
	// Other
	'occupation',
	'universe',
	'image',
	'sources',
	'sourced_facts',
	'relationships',
	// External IDs (for import round-trip)
	'external_id',
	'external_id_source',
	// Ownership/transfer tracking (#123)
	'property_of',
	'held_at',
	'appraised_value'
] as const;

export type CanonicalPersonProperty = typeof CANONICAL_PERSON_PROPERTIES[number];

/**
 * Canonical event note properties that can be aliased
 */
export const CANONICAL_EVENT_PROPERTIES = [
	// Core
	'cr_id',
	'cr_type',
	'title',
	'event_type',
	// Dates
	'date',
	'date_end',
	'date_precision',
	'date_system',
	// People
	'person',      // Primary person involved
	'persons',     // Multiple people involved (alias: participants)
	// Location
	'place',
	// Sources and confidence
	'sources',
	'confidence',
	// Description and metadata
	'description',
	'is_canonical',
	'universe',
	// Ordering
	'before',
	'after',
	'timeline',
	// Groups/factions
	'groups',
	// Transfer events (#123)
	'transfer_type'
] as const;

export type CanonicalEventProperty = typeof CANONICAL_EVENT_PROPERTIES[number];

/**
 * Canonical place note properties that can be aliased
 */
export const CANONICAL_PLACE_PROPERTIES = [
	'cr_id',
	'cr_type',
	'name',
	'place_type',
	'parent_place',
	'coordinates',
	'universe',
	'collection',
	// Ownership tracking (#123)
	'property_of'
] as const;

export type CanonicalPlaceProperty = typeof CANONICAL_PLACE_PROPERTIES[number];

/**
 * Canonical source note properties that can be aliased
 */
export const CANONICAL_SOURCE_PROPERTIES = [
	'cr_id',
	'cr_type',
	'title',
	'author',
	'source_type',
	'repository',
	'repository_type',
	'source_medium',
	'confidence',
	'url',
	'access_date',
	'citation_detail',
	'gramps_handle',
	'gramps_id',
	'gramps_media_refs',
	// Person roles (#219)
	'principals',
	'witnesses',
	'informants',
	'officials',
	'enslaved_individuals',
	'family',
	'others'
] as const;

export type CanonicalSourceProperty = typeof CANONICAL_SOURCE_PROPERTIES[number];

/**
 * Canonical universe note properties that can be aliased
 */
export const CANONICAL_UNIVERSE_PROPERTIES = [
	'cr_id',
	'cr_type',
	'name',
	'description',
	'author',
	'genre',
	'status',
	'default_calendar',
	'default_map',
	'created'
] as const;

export type CanonicalUniverseProperty = typeof CANONICAL_UNIVERSE_PROPERTIES[number];

/**
 * All canonical properties across all note types
 */
export const ALL_CANONICAL_PROPERTIES = [
	...CANONICAL_PERSON_PROPERTIES,
	...CANONICAL_EVENT_PROPERTIES,
	...CANONICAL_PLACE_PROPERTIES,
	...CANONICAL_SOURCE_PROPERTIES,
	...CANONICAL_UNIVERSE_PROPERTIES
] as const;

/**
 * Human-readable labels for canonical properties (for UI display)
 */
export const CANONICAL_PROPERTY_LABELS: Record<string, string> = {
	// Person properties
	name: 'Name',
	cr_id: 'CR ID',
	type: 'Type',
	sex: 'Sex',
	gender: 'Gender',
	nickname: 'Nickname',
	maiden_name: 'Maiden name',
	given_name: 'Given name',
	surnames: 'Surnames',
	married_names: 'Married names',
	born: 'Birth date',
	died: 'Death date',
	birth_place: 'Birth place',
	death_place: 'Death place',
	father: 'Father',
	father_id: 'Father ID',
	mother: 'Mother',
	mother_id: 'Mother ID',
	parents: 'Parents (array)',
	parents_id: 'Parents ID (array)',
	stepfather: 'Stepfather',
	stepfather_id: 'Stepfather ID',
	stepmother: 'Stepmother',
	stepmother_id: 'Stepmother ID',
	adoptive_father: 'Adoptive father',
	adoptive_father_id: 'Adoptive father ID',
	adoptive_mother: 'Adoptive mother',
	adoptive_mother_id: 'Adoptive mother ID',
	spouse: 'Spouse',
	spouse_id: 'Spouse ID',
	partners: 'Partners (array)',
	partners_id: 'Partners ID (array)',
	child: 'Child/Children',
	children_id: 'Children ID',
	occupation: 'Occupation',
	universe: 'Universe',
	image: 'Image',
	sourced_facts: 'Sourced facts',
	relationships: 'Relationships',
	external_id: 'External ID',
	external_id_source: 'External ID source',
	// Event properties
	cr_type: 'CR type',
	title: 'Title',
	event_type: 'Event type',
	date: 'Date',
	date_end: 'End date',
	date_precision: 'Date precision',
	date_system: 'Date system',
	person: 'Person',
	persons: 'Persons/Participants',
	place: 'Place',
	sources: 'Sources',
	confidence: 'Confidence',
	description: 'Description',
	is_canonical: 'Is canonical',
	before: 'Before',
	after: 'After',
	timeline: 'Timeline',
	groups: 'Groups',
	// Place properties
	place_type: 'Place type',
	parent_place: 'Parent place',
	coordinates: 'Coordinates',
	collection: 'Collection',
	// Source properties
	author: 'Author',
	source_type: 'Source type',
	repository: 'Repository',
	repository_type: 'Repository type',
	source_medium: 'Source medium',
	url: 'URL',
	access_date: 'Access date',
	citation_detail: 'Citation detail',
	gramps_handle: 'Gramps handle',
	gramps_id: 'Gramps ID',
	gramps_media_refs: 'Gramps media refs',
	// Person roles in sources (#219)
	principals: 'Principals',
	witnesses: 'Witnesses',
	informants: 'Informants',
	officials: 'Officials',
	enslaved_individuals: 'Enslaved individuals',
	family: 'Family',
	others: 'Others',
	// Universe properties
	genre: 'Genre',
	status: 'Status',
	default_calendar: 'Default calendar',
	default_map: 'Default map',
	created: 'Created'
};

/**
 * Property metadata for unified configuration UI
 */
export interface PropertyMetadata {
	canonical: string;
	label: string;
	description: string;
	category: 'person' | 'event' | 'place' | 'source' | 'organization' | 'universe';
	commonAliases?: string[];  // For search/suggestions
}

/**
 * Person property metadata
 */
export const PERSON_PROPERTY_METADATA: PropertyMetadata[] = [
	// Core identity
	{
		canonical: 'name',
		label: '名称',
		description: '人物的完整姓名',
		category: 'person',
		commonAliases: ['full_name', 'display_name', 'person_name']
	},
	{
		canonical: 'cr_id',
		label: 'CR ID',
		description: '人物的唯一标识符',
		category: 'person',
		commonAliases: ['id', 'person_id', 'uuid']
	},
	{
		canonical: 'cr_type',
		label: 'CR 类型',
		description: '笔记类型标识符（通常为 "person"）',
		category: 'person',
		commonAliases: ['type', 'note_type']
	},
	{
		canonical: 'sex',
		label: '生理性别',
		description: '生理性别（male、female、nonbinary、unknown）',
		category: 'person',
		commonAliases: ['gender', 'sex_at_birth']
	},
	{
		canonical: 'gender',
		label: '性别',
		description: '性别（向后兼容 - 请使用 gender_identity 或 sex）',
		category: 'person',
		commonAliases: []
	},
	{
		canonical: 'gender_identity',
		label: '性别认同',
		description: '性别认同（区别于生理性别）',
		category: 'person',
		commonAliases: []
	},
	{
		canonical: 'nickname',
		label: '昵称',
		description: '非正式名称或别名',
		category: 'person',
		commonAliases: ['alias', 'known_as', 'goes_by']
	},
	{
		canonical: 'alt_name',
		label: '别名',
		description: '替代名称或显示名称（如艺名、音译名）',
		category: 'person',
		commonAliases: ['also_known_as', 'aka', 'alternate_name', 'display_name']
	},
	{
		canonical: 'maiden_name',
		label: '娘家姓',
		description: '出生时的姓氏（婚前）',
		category: 'person',
		commonAliases: ['birth_name', 'birth_surname', 'née', 'nee']
	},
	// Name components
	{
		canonical: 'given_name',
		label: '名',
		description: '名（first/given name）',
		category: 'person',
		commonAliases: ['first_name', 'forename', 'christian_name']
	},
	{
		canonical: 'surnames',
		label: '姓氏',
		description: '家族姓氏',
		category: 'person',
		commonAliases: ['last_name', 'family_name']
	},
	{
		canonical: 'married_names',
		label: '婚后姓氏',
		description: '婚后的姓氏',
		category: 'person',
		commonAliases: []
	},
	// Dates
	{
		canonical: 'born',
		label: '出生日期',
		description: '人物的出生日期',
		category: 'person',
		commonAliases: ['birthdate', 'birth_date', 'dob', 'date_of_birth']
	},
	{
		canonical: 'died',
		label: '去世日期',
		description: '人物的去世日期',
		category: 'person',
		commonAliases: ['deathdate', 'death_date', 'dod', 'date_of_death']
	},
	// Places
	{
		canonical: 'birth_place',
		label: '出生地点',
		description: '人物出生的地点',
		category: 'person',
		commonAliases: ['birthplace', 'place_of_birth', 'born_in']
	},
	{
		canonical: 'death_place',
		label: '去世地点',
		description: '人物去世的地点',
		category: 'person',
		commonAliases: ['deathplace', 'place_of_death', 'died_in']
	},
	// Relationships
	{
		canonical: 'father',
		label: '父亲',
		description: '指向父亲笔记的链接',
		category: 'person',
		commonAliases: ['father_name', 'dad', 'père']
	},
	{
		canonical: 'father_id',
		label: '父亲 ID',
		description: '父亲的 CR ID',
		category: 'person',
		commonAliases: ['father_cr_id']
	},
	{
		canonical: 'mother',
		label: '母亲',
		description: '指向母亲笔记的链接',
		category: 'person',
		commonAliases: ['mother_name', 'mom', 'mère']
	},
	{
		canonical: 'mother_id',
		label: '母亲 ID',
		description: '母亲的 CR ID',
		category: 'person',
		commonAliases: ['mother_cr_id']
	},
	{
		canonical: 'parents',
		label: '父母',
		description: '父母链接数组（father/mother 的替代）',
		category: 'person',
		commonAliases: ['parent']
	},
	{
		canonical: 'parents_id',
		label: '父母 ID',
		description: '父母 CR ID 数组',
		category: 'person',
		commonAliases: ['parent_ids']
	},
	// Step-parent relationships
	{
		canonical: 'stepfather',
		label: '继父',
		description: '指向继父笔记的链接',
		category: 'person',
		commonAliases: ['step_father', 'step-father']
	},
	{
		canonical: 'stepfather_id',
		label: '继父 ID',
		description: '继父的 CR ID',
		category: 'person',
		commonAliases: ['step_father_id', 'stepfather_cr_id']
	},
	{
		canonical: 'stepmother',
		label: '继母',
		description: '指向继母笔记的链接',
		category: 'person',
		commonAliases: ['step_mother', 'step-mother']
	},
	{
		canonical: 'stepmother_id',
		label: '继母 ID',
		description: '继母的 CR ID',
		category: 'person',
		commonAliases: ['step_mother_id', 'stepmother_cr_id']
	},
	// Adoptive parent relationships
	{
		canonical: 'adoptive_father',
		label: '养父',
		description: '指向养父笔记的链接',
		category: 'person',
		commonAliases: ['adopted_father', 'adoptivefather']
	},
	{
		canonical: 'adoptive_father_id',
		label: '养父 ID',
		description: '养父的 CR ID',
		category: 'person',
		commonAliases: ['adopted_father_id', 'adoptive_father_cr_id']
	},
	{
		canonical: 'adoptive_mother',
		label: '养母',
		description: '指向养母笔记的链接',
		category: 'person',
		commonAliases: ['adopted_mother', 'adoptivemother']
	},
	{
		canonical: 'adoptive_mother_id',
		label: '养母 ID',
		description: '养母的 CR ID',
		category: 'person',
		commonAliases: ['adopted_mother_id', 'adoptive_mother_cr_id']
	},
	{
		canonical: 'spouse',
		label: '配偶',
		description: '指向配偶笔记的链接',
		category: 'person',
		commonAliases: ['spouse_name', 'partner', 'husband', 'wife']
	},
	{
		canonical: 'spouse_id',
		label: '配偶 ID',
		description: '配偶的 CR ID',
		category: 'person',
		commonAliases: ['spouse_cr_id', 'partner_id']
	},
	{
		canonical: 'partners',
		label: '伴侣',
		description: '伴侣/配偶链接数组',
		category: 'person',
		commonAliases: ['spouses']
	},
	{
		canonical: 'partners_id',
		label: '伴侣 ID',
		description: '伴侣 CR ID 数组',
		category: 'person',
		commonAliases: ['partner_ids', 'spouse_ids']
	},
	{
		canonical: 'child',
		label: '子女',
		description: '指向子女笔记的链接',
		category: 'person',
		commonAliases: ['children', 'kids', 'offspring']
	},
	{
		canonical: 'children_id',
		label: '子女 ID',
		description: '子女的 CR ID',
		category: 'person',
		commonAliases: ['child_ids', 'kid_ids']
	},
	// Descriptive fields (rendered on Family Chart cards and in info panels)
	{
		canonical: 'pronouns',
		label: '代词',
		description: '偏好的代词（如 she/her、they/them）',
		category: 'person',
		commonAliases: []
	},
	{
		canonical: 'occupation',
		label: '职业',
		description: '人物的职业或角色',
		category: 'person',
		commonAliases: ['job', 'profession', 'career', 'work']
	},
	{
		canonical: 'religion',
		label: '宗教',
		description: '宗教信仰',
		category: 'person',
		commonAliases: ['faith', 'denomination']
	},
	{
		canonical: 'caste',
		label: '种姓',
		description: '种姓或社会阶层',
		category: 'person',
		commonAliases: ['social_class']
	},
	// Other
	{
		canonical: 'universe',
		label: '宇宙',
		description: '虚构宇宙或世界',
		category: 'person',
		commonAliases: ['world', 'setting', 'realm']
	},
	{
		canonical: 'image',
		label: '图像',
		description: '指向肖像或照片的链接',
		category: 'person',
		commonAliases: ['photo', 'portrait', 'picture', 'avatar']
	},
	{
		canonical: 'sources',
		label: '来源',
		description: '此人的来源引文',
		category: 'person',
		commonAliases: ['citations', 'references', 'evidence']
	},
	{
		canonical: 'sourced_facts',
		label: '有来源的事实',
		description: '带有来源引文的事实',
		category: 'person',
		commonAliases: ['cited_facts']
	},
	{
		canonical: 'relationships',
		label: '关系',
		description: '自定义关系定义',
		category: 'person',
		commonAliases: ['custom_relationships', 'relations']
	},
	// External IDs (for import round-trip)
	{
		canonical: 'external_id',
		label: '外部 ID',
		description: '导入数据源的原始 ID（如 GEDCOM xref、Gramps handle）',
		category: 'person',
		commonAliases: ['import_id', 'source_id', 'original_id']
	},
	{
		canonical: 'external_id_source',
		label: '外部 ID 来源',
		description: '外部 ID 的来源（如 "gedcom"、"gramps"、"familysearch"）',
		category: 'person',
		commonAliases: ['id_source', 'import_source']
	},
	// Ownership/transfer tracking (#123)
	{
		canonical: 'property_of',
		label: '归属',
		description: '指向拥有或对此人持有权利者的链接（如奴隶主、监护人）',
		category: 'person',
		commonAliases: ['owned_by', 'enslaved_by', 'held_by', 'guardian']
	},
	{
		canonical: 'held_at',
		label: '所在地',
		description: '指向此人在被拥有状态下被关押或居住地点的链接',
		category: 'person',
		commonAliases: ['location', 'residence', 'plantation', 'estate']
	},
	{
		canonical: 'appraised_value',
		label: '评估价值',
		description: '历史记录中赋予此人的货币价值',
		category: 'person',
		commonAliases: ['value', 'worth', 'price', 'valuation']
	}
];

/**
 * Event property metadata
 */
export const EVENT_PROPERTY_METADATA: PropertyMetadata[] = [
	// Core
	{
		canonical: 'cr_id',
		label: 'CR ID',
		description: '事件的唯一标识符',
		category: 'event',
		commonAliases: ['id', 'event_id', 'uuid']
	},
	{
		canonical: 'cr_type',
		label: 'CR 类型',
		description: '笔记类型标识符（通常为 "event"）',
		category: 'event',
		commonAliases: ['type', 'note_type']
	},
	{
		canonical: 'title',
		label: '标题',
		description: '事件名称或标题',
		category: 'event',
		commonAliases: ['name', 'event_name', 'event_title']
	},
	{
		canonical: 'event_type',
		label: '事件类型',
		description: '事件类型（出生、去世、婚姻等）',
		category: 'event',
		commonAliases: ['type', 'category', 'kind']
	},
	// Dates
	{
		canonical: 'date',
		label: '日期',
		description: '事件发生的时间',
		category: 'event',
		commonAliases: ['event_date', 'occurred', 'happened', 'when']
	},
	{
		canonical: 'date_end',
		label: '结束日期',
		description: '事件结束的时间（用于日期范围）',
		category: 'event',
		commonAliases: ['end_date', 'concluded', 'finished']
	},
	{
		canonical: 'date_precision',
		label: '日期精度',
		description: '日期的精度（精确、约等）',
		category: 'event',
		commonAliases: ['precision', 'date_accuracy']
	},
	{
		canonical: 'date_system',
		label: '日期系统',
		description: '使用的日历系统（公历、虚构历法等）',
		category: 'event',
		commonAliases: ['calendar', 'calendar_system']
	},
	// People
	{
		canonical: 'person',
		label: '人物',
		description: '参与事件的主要人物',
		category: 'event',
		commonAliases: ['primary_person', 'subject']
	},
	{
		canonical: 'persons',
		label: '人物（多人）',
		description: '参与事件的多人',
		category: 'event',
		commonAliases: ['participants', 'people', 'attendees']
	},
	// Location
	{
		canonical: 'place',
		label: '地点',
		description: '事件发生的地点',
		category: 'event',
		commonAliases: ['location', 'where', 'event_place']
	},
	// Sources and confidence
	{
		canonical: 'sources',
		label: '来源',
		description: '事件的来源引文',
		category: 'event',
		commonAliases: ['citations', 'references', 'evidence']
	},
	{
		canonical: 'confidence',
		label: '置信度',
		description: '事件数据的置信度',
		category: 'event',
		commonAliases: ['reliability', 'certainty']
	},
	// Description and metadata
	{
		canonical: 'description',
		label: '描述',
		description: '事件的详细信息',
		category: 'event',
		commonAliases: ['details', 'notes', 'summary']
	},
	{
		canonical: 'is_canonical',
		label: '是否正典',
		description: '该事件在故事中是否为正典',
		category: 'event',
		commonAliases: ['canonical']
	},
	{
		canonical: 'universe',
		label: '宇宙',
		description: '虚构宇宙或世界',
		category: 'event',
		commonAliases: ['world', 'setting', 'realm']
	},
	// Ordering
	{
		canonical: 'before',
		label: '之前',
		description: '在此事件之前发生的事件',
		category: 'event',
		commonAliases: ['precedes', 'earlier']
	},
	{
		canonical: 'after',
		label: '之后',
		description: '在此事件之后发生的事件',
		category: 'event',
		commonAliases: ['follows', 'later']
	},
	{
		canonical: 'timeline',
		label: '时间轴',
		description: '此事件所属的时间轴',
		category: 'event',
		commonAliases: ['sequence', 'chronology']
	},
	// Groups/factions
	{
		canonical: 'groups',
		label: '群组',
		description: '涉及的组织或派系',
		category: 'event',
		commonAliases: ['organizations', 'factions', 'parties']
	},
	// Transfer events (#123)
	{
		canonical: 'transfer_type',
		label: '转移类型',
		description: '转移类型（继承、购买、赠予、雇用、没收、出生、迁移）',
		category: 'event',
		commonAliases: ['transfer_kind', 'transaction_type']
	}
];

/**
 * Place property metadata
 */
export const PLACE_PROPERTY_METADATA: PropertyMetadata[] = [
	{
		canonical: 'cr_id',
		label: 'CR ID',
		description: '地点的唯一标识符',
		category: 'place',
		commonAliases: ['id', 'place_id', 'uuid']
	},
	{
		canonical: 'cr_type',
		label: 'CR 类型',
		description: '笔记类型标识符（通常为 "place"）',
		category: 'place',
		commonAliases: ['type', 'note_type']
	},
	{
		canonical: 'name',
		label: '名称',
		description: '地点的名称',
		category: 'place',
		commonAliases: ['place_name', 'location_name']
	},
	{
		canonical: 'place_type',
		label: '地点类型',
		description: '地点类型（城市、国家、地区等）',
		category: 'place',
		commonAliases: ['type', 'category', 'kind']
	},
	{
		canonical: 'parent_place',
		label: '上级地点',
		description: '此地点所属的更大地点',
		category: 'place',
		commonAliases: ['parent', 'contains', 'within', 'part_of']
	},
	{
		canonical: 'coordinates',
		label: '坐标',
		description: '地理坐标（纬度、经度）',
		category: 'place',
		commonAliases: ['coords', 'location', 'lat_long', 'latlng']
	},
	{
		canonical: 'universe',
		label: '宇宙',
		description: '虚构宇宙或世界',
		category: 'place',
		commonAliases: ['world', 'setting', 'realm']
	},
	{
		canonical: 'collection',
		label: '合集',
		description: '此地点所属的合集或数据集',
		category: 'place',
		commonAliases: ['dataset', 'group']
	},
	// Ownership tracking (#123)
	{
		canonical: 'property_of',
		label: '归属',
		description: '指向拥有此地点的个人的链接（如种植园主、地产持有人）',
		category: 'place',
		commonAliases: ['owned_by', 'owner', 'held_by']
	}
];

/**
 * Source property metadata
 */
export const SOURCE_PROPERTY_METADATA: PropertyMetadata[] = [
	{
		canonical: 'cr_id',
		label: 'CR ID',
		description: '来源的唯一标识符',
		category: 'source',
		commonAliases: ['id', 'source_id', 'uuid']
	},
	{
		canonical: 'cr_type',
		label: 'CR 类型',
		description: '笔记类型标识符（通常为 "source"）',
		category: 'source',
		commonAliases: ['type', 'note_type']
	},
	{
		canonical: 'title',
		label: '标题',
		description: '来源标题或名称',
		category: 'source',
		commonAliases: ['name', 'source_name', 'source_title']
	},
	{
		canonical: 'author',
		label: '作者',
		description: '来源的作者或创建者',
		category: 'source',
		commonAliases: ['creator', 'author_name', 'by']
	},
	{
		canonical: 'source_type',
		label: '来源类型',
		description: '来源记录的类型（census、vital_record 等）',
		category: 'source',
		commonAliases: ['type', 'record_type', 'category']
	},
	{
		canonical: 'repository',
		label: '保管机构',
		description: '存放来源的档案馆或网站',
		category: 'source',
		commonAliases: ['archive', 'location', 'held_at', 'source_repository']
	},
	{
		canonical: 'repository_type',
		label: '保管机构类型',
		description: '保管机构类型（图书馆、档案馆等）',
		category: 'source',
		commonAliases: ['archive_type', 'repo_type']
	},
	{
		canonical: 'source_medium',
		label: '来源载体',
		description: '来源的载体（书籍、电子等）',
		category: 'source',
		commonAliases: ['medium', 'format']
	},
	{
		canonical: 'confidence',
		label: '置信度',
		description: '来源的置信度（高、中、低）',
		category: 'source',
		commonAliases: ['reliability', 'certainty', 'quality']
	},
	{
		canonical: 'url',
		label: 'URL',
		description: '在线来源的 URL',
		category: 'source',
		commonAliases: ['link', 'source_url', 'web_address']
	},
	{
		canonical: 'access_date',
		label: '访问日期',
		description: '访问来源的日期',
		category: 'source',
		commonAliases: ['accessed', 'date_accessed', 'viewed']
	},
	{
		canonical: 'citation_detail',
		label: '引文详情',
		description: '具体引文细节（页码、卷号等）',
		category: 'source',
		commonAliases: ['page', 'volume', 'citation', 'reference']
	},
	{
		canonical: 'gramps_handle',
		label: 'Gramps handle',
		description: 'Gramps 内部原始标识符',
		category: 'source',
		commonAliases: []
	},
	{
		canonical: 'gramps_id',
		label: 'Gramps ID',
		description: 'Gramps 的原始用户可见 ID',
		category: 'source',
		commonAliases: []
	},
	{
		canonical: 'gramps_media_refs',
		label: 'Gramps 媒体引用',
		description: '需要手动处理的 Gramps 媒体 handle',
		category: 'source',
		commonAliases: []
	}
];

/**
 * Universe property metadata
 */
export const UNIVERSE_PROPERTY_METADATA: PropertyMetadata[] = [
	{
		canonical: 'cr_id',
		label: 'CR ID',
		description: '宇宙的唯一标识符',
		category: 'universe',
		commonAliases: ['id', 'universe_id', 'uuid']
	},
	{
		canonical: 'cr_type',
		label: 'CR 类型',
		description: '笔记类型标识符（通常为 "universe"）',
		category: 'universe',
		commonAliases: ['type', 'note_type']
	},
	{
		canonical: 'name',
		label: '名称',
		description: '宇宙或虚构世界的名称',
		category: 'universe',
		commonAliases: ['universe_name', 'world_name', 'title']
	},
	{
		canonical: 'description',
		label: '描述',
		description: '宇宙的简要描述',
		category: 'universe',
		commonAliases: ['summary', 'about', 'overview']
	},
	{
		canonical: 'author',
		label: '作者',
		description: '宇宙的创作者或作者',
		category: 'universe',
		commonAliases: ['creator', 'writer', 'created_by']
	},
	{
		canonical: 'genre',
		label: '体裁',
		description: '宇宙的体裁或类别',
		category: 'universe',
		commonAliases: ['category', 'type', 'setting_type']
	},
	{
		canonical: 'status',
		label: '状态',
		description: '宇宙状态（active、draft、archived）',
		category: 'universe',
		commonAliases: ['state', 'universe_status']
	},
	{
		canonical: 'default_calendar',
		label: '默认历法',
		description: '此宇宙中日期的默认日历系统',
		category: 'universe',
		commonAliases: ['calendar', 'date_system']
	},
	{
		canonical: 'default_map',
		label: '默认地图',
		description: '此宇宙中地点的默认地图',
		category: 'universe',
		commonAliases: ['map', 'world_map']
	},
	{
		canonical: 'created',
		label: '创建时间',
		description: '宇宙笔记的创建日期',
		category: 'universe',
		commonAliases: ['created_at', 'creation_date']
	}
];

/**
 * All property metadata combined
 */
export const ALL_PROPERTY_METADATA: PropertyMetadata[] = [
	...PERSON_PROPERTY_METADATA,
	...EVENT_PROPERTY_METADATA,
	...PLACE_PROPERTY_METADATA,
	...SOURCE_PROPERTY_METADATA,
	...UNIVERSE_PROPERTY_METADATA
];

/**
 * Service for resolving property aliases
 */
export class PropertyAliasService {
	private plugin: CanvasRootsPlugin;

	constructor(plugin: CanvasRootsPlugin) {
		this.plugin = plugin;
	}

	/**
	 * Get the configured aliases
	 */
	get aliases(): Record<string, string> {
		return this.plugin.settings.propertyAliases;
	}

	/**
	 * Resolve a property value from frontmatter using alias mapping.
	 * Checks canonical property first, then falls back to aliases.
	 *
	 * @param frontmatter - The note's frontmatter object
	 * @param canonicalProperty - The Charted Roots canonical property name
	 * @returns The property value, or undefined if not found
	 */
	resolve(frontmatter: Record<string, unknown>, canonicalProperty: string): unknown {
		// Canonical property takes precedence
		if (frontmatter[canonicalProperty] !== undefined) {
			return frontmatter[canonicalProperty];
		}

		// Check aliases - find user property that maps to this canonical property
		for (const [userProp, mappedCanonical] of Object.entries(this.aliases)) {
			if (mappedCanonical === canonicalProperty && frontmatter[userProp] !== undefined) {
				return frontmatter[userProp];
			}
		}

		return undefined;
	}

	/**
	 * Get the property name to use when writing to frontmatter.
	 * Returns the aliased name if configured, otherwise the canonical name.
	 *
	 * @param canonicalProperty - The Charted Roots canonical property name
	 * @returns The property name to write to
	 */
	getWriteProperty(canonicalProperty: string): string {
		// Find if user has an alias for this canonical property
		for (const [userProp, mappedCanonical] of Object.entries(this.aliases)) {
			if (mappedCanonical === canonicalProperty) {
				return userProp;
			}
		}
		return canonicalProperty;
	}

	/**
	 * Get the property name to display in UI.
	 * Returns the aliased name if configured, otherwise the canonical name.
	 * Same as getWriteProperty - users should see their preferred names.
	 *
	 * @param canonicalProperty - The Charted Roots canonical property name
	 * @returns The property name to display
	 */
	getDisplayProperty(canonicalProperty: string): string {
		return this.getWriteProperty(canonicalProperty);
	}

	/**
	 * Check if a property has an alias configured
	 *
	 * @param canonicalProperty - The Charted Roots canonical property name
	 * @returns True if an alias is configured for this property
	 */
	hasAlias(canonicalProperty: string): boolean {
		return Object.values(this.aliases).includes(canonicalProperty);
	}

	/**
	 * Get the alias for a canonical property, if configured
	 *
	 * @param canonicalProperty - The Charted Roots canonical property name
	 * @returns The alias, or undefined if not configured
	 */
	getAlias(canonicalProperty: string): string | undefined {
		for (const [userProp, mappedCanonical] of Object.entries(this.aliases)) {
			if (mappedCanonical === canonicalProperty) {
				return userProp;
			}
		}
		return undefined;
	}

	/**
	 * Add or update an alias
	 *
	 * @param userProperty - The user's property name
	 * @param canonicalProperty - The Charted Roots canonical property name
	 */
	async setAlias(userProperty: string, canonicalProperty: string): Promise<void> {
		// Remove any existing alias for this canonical property
		for (const [existingUser, existingCanonical] of Object.entries(this.aliases)) {
			if (existingCanonical === canonicalProperty) {
				delete this.plugin.settings.propertyAliases[existingUser];
			}
		}

		// Set the new alias
		this.plugin.settings.propertyAliases[userProperty] = canonicalProperty;
		await this.plugin.saveSettings();
	}

	/**
	 * Remove an alias
	 *
	 * @param userProperty - The user's property name to remove
	 */
	async removeAlias(userProperty: string): Promise<void> {
		delete this.plugin.settings.propertyAliases[userProperty];
		await this.plugin.saveSettings();
	}

	/**
	 * Get all configured aliases as an array for display
	 *
	 * @returns Array of { userProperty, canonicalProperty } objects
	 */
	getAllAliases(): Array<{ userProperty: string; canonicalProperty: string }> {
		return Object.entries(this.aliases).map(([userProperty, canonicalProperty]) => ({
			userProperty,
			canonicalProperty
		}));
	}

	/**
	 * Resolve multiple properties at once from frontmatter.
	 * Convenience method for resolving all person properties.
	 *
	 * @param frontmatter - The note's frontmatter object
	 * @param properties - Array of canonical property names to resolve
	 * @returns Object with resolved values
	 */
	resolveAll(
		frontmatter: Record<string, unknown>,
		properties: string[]
	): Record<string, unknown> {
		const result: Record<string, unknown> = {};
		for (const prop of properties) {
			const value = this.resolve(frontmatter, prop);
			if (value !== undefined) {
				result[prop] = value;
			}
		}
		return result;
	}

	/**
	 * Get metadata for a canonical property
	 *
	 * @param canonicalProperty - The canonical property name
	 * @returns Property metadata, or undefined if not found
	 */
	getMetadata(canonicalProperty: string): PropertyMetadata | undefined {
		return ALL_PROPERTY_METADATA.find(m => m.canonical === canonicalProperty);
	}

	/**
	 * Get all properties for a specific category
	 *
	 * @param category - The property category (person, event, place, etc.)
	 * @returns Array of property metadata for that category
	 */
	getPropertiesByCategory(category: string): PropertyMetadata[] {
		return ALL_PROPERTY_METADATA.filter(m => m.category === category);
	}

	/**
	 * Search properties by name, description, canonical name, or common aliases
	 *
	 * @param query - Search query string
	 * @returns Array of matching property metadata
	 */
	searchProperties(query: string): PropertyMetadata[] {
		if (!query || query.trim() === '') {
			return ALL_PROPERTY_METADATA;
		}

		const normalized = query.toLowerCase().trim();

		return ALL_PROPERTY_METADATA.filter(meta => {
			// Match against label
			if (meta.label.toLowerCase().includes(normalized)) {
				return true;
			}

			// Match against description
			if (meta.description.toLowerCase().includes(normalized)) {
				return true;
			}

			// Match against canonical property name
			if (meta.canonical.toLowerCase().includes(normalized)) {
				return true;
			}

			// Match against common aliases
			if (meta.commonAliases?.some(alias => alias.toLowerCase().includes(normalized))) {
				return true;
			}

			return false;
		});
	}

	/**
	 * Get all properties with configured aliases
	 *
	 * @returns Array of property metadata that have aliases configured
	 */
	getAliasedProperties(): PropertyMetadata[] {
		const aliasedCanonicals = Object.values(this.aliases);
		return ALL_PROPERTY_METADATA.filter(meta =>
			aliasedCanonicals.includes(meta.canonical)
		);
	}

	/**
	 * Check if a property is valid (exists in metadata)
	 *
	 * @param canonicalProperty - The canonical property name to check
	 * @returns True if the property exists in metadata
	 */
	isValidProperty(canonicalProperty: string): boolean {
		return ALL_PROPERTY_METADATA.some(m => m.canonical === canonicalProperty);
	}
}

/**
 * Create a PropertyAliasService instance
 */
export function createPropertyAliasService(plugin: CanvasRootsPlugin): PropertyAliasService {
	return new PropertyAliasService(plugin);
}
