/**
 * Type definitions, constants, and pure utility functions for CleanupWizardModal
 * Extracted from cleanup-wizard-modal.ts for maintainability
 */

import type { PlaceNode, PlaceType } from '../models/place';
import type { PlaceGraphService } from '../core/place-graph';

/**
 * Wizard step types
 */
export type StepType = 'review' | 'batch' | 'interactive';

/**
 * Step status
 */
export type StepStatus = 'pending' | 'in_progress' | 'complete' | 'skipped';

/**
 * Wizard step configuration
 */
export interface WizardStepConfig {
	id: string;
	number: number;
	title: string;
	shortTitle: string;
	description: string;
	type: StepType;
	service: string;
	detectMethod?: string;
	previewMethod?: string;
	applyMethod?: string;
	dependencies: number[];
}

/**
 * Step state
 */
export interface StepState {
	status: StepStatus;
	issueCount: number;
	fixCount: number;
	skippedReason?: string;
}

/**
 * Wizard state
 */
export interface CleanupWizardState {
	currentStep: number;
	steps: Record<number, StepState>;
	startTime: number;
	isPreScanning: boolean;
	preScanComplete: boolean;
}

/**
 * Result of hierarchy enrichment for a single place
 */
export interface HierarchyEnrichmentResult {
	placeName: string;
	success: boolean;
	/** Parsed hierarchy components from geocoding */
	hierarchy?: string[];
	/** Parent places created */
	parentsCreated?: string[];
	/** Parent place linked to */
	parentLinked?: string;
	/** Error message if failed */
	error?: string;
	/** Whether place was skipped (already has parent) */
	skipped?: boolean;
}

/** Maximum age of persisted state before it's considered stale (24 hours) */
export const STATE_EXPIRY_MS = 24 * 60 * 60 * 1000;

/**
 * Known place type mappings from OSM/Nominatim address components
 */
export const OSM_TYPE_MAP: Record<string, PlaceType> = {
	country: 'country',
	state: 'state',
	province: 'province',
	region: 'region',
	county: 'county',
	city: 'city',
	town: 'town',
	village: 'village',
	municipality: 'city',
	district: 'district',
	suburb: 'district',
	neighbourhood: 'district',
	hamlet: 'village'
};

/**
 * Wizard step definitions
 */
export const WIZARD_STEPS: WizardStepConfig[] = [
	{
		id: 'quality-report',
		number: 1,
		title: '数据质量报告',
		shortTitle: '质量报告',
		description: '查看库中检测到的数据质量问题。',
		type: 'review',
		service: 'DataQualityService',
		detectMethod: 'getIssuesSummary',
		dependencies: []
	},
	{
		id: 'bidirectional',
		number: 2,
		title: '修复双向关系',
		shortTitle: '双向关系',
		description: '确保父母子女关系在双向都正确关联。',
		type: 'batch',
		service: 'DataQualityService',
		detectMethod: 'detectBidirectionalIssues',
		applyMethod: 'fixBidirectionalInconsistencies',
		dependencies: [1]
	},
	{
		id: 'date-normalize',
		number: 3,
		title: '规范化日期格式',
		shortTitle: '日期',
		description: '将非标准日期格式转换为 ISO 8601（YYYY-MM-DD）。',
		type: 'batch',
		service: 'DataQualityService',
		detectMethod: 'detectDateIssues',
		applyMethod: 'normalizeDateFormats',
		dependencies: [2]
	},
	{
		id: 'gender-normalize',
		number: 4,
		title: '规范化性别值',
		shortTitle: '性别',
		description: '将性别值统一为标准格式。',
		type: 'batch',
		service: 'DataQualityService',
		detectMethod: 'detectGenderIssues',
		applyMethod: 'normalizeGenderValues',
		dependencies: [2]
	},
	{
		id: 'orphan-clear',
		number: 5,
		title: '清除孤立引用',
		shortTitle: '孤立引用',
		description: '移除指向不存在笔记的悬空链接。',
		type: 'batch',
		service: 'DataQualityService',
		detectMethod: 'detectOrphanReferences',
		applyMethod: 'clearOrphanReferences',
		dependencies: [2]
	},
	{
		id: 'source-migrate',
		number: 6,
		title: '迁移来源属性',
		shortTitle: '来源',
		description: '将索引形式的来源属性（source_2、source_3）转换为数组格式。',
		type: 'batch',
		service: 'SourceMigrationService',
		detectMethod: 'detectIndexedSources',
		applyMethod: 'migrateToArrayFormat',
		dependencies: [5]
	},
	{
		id: 'place-variants',
		number: 7,
		title: '标准化地点变体',
		shortTitle: '地点名称',
		description: '为有多个变体的地点选择规范名称。',
		type: 'interactive',
		service: 'PlaceGraphService',
		detectMethod: 'detectPlaceVariants',
		applyMethod: 'standardizeVariant',
		dependencies: []
	},
	{
		id: 'geocode',
		number: 8,
		title: '批量地理编码',
		shortTitle: '地理编码',
		description: '为地点笔记添加地理坐标。',
		type: 'interactive',
		service: 'GeocodingService',
		detectMethod: 'detectUngeocoded',
		applyMethod: 'geocodePlace',
		dependencies: [7]
	},
	{
		id: 'place-hierarchy',
		number: 9,
		title: '丰富地点层级',
		shortTitle: '层级',
		description: '构建从属链（城市 → 县 → 州 → 国家）。',
		type: 'interactive',
		service: 'PlaceGraphService',
		detectMethod: 'detectMissingHierarchy',
		applyMethod: 'enrichHierarchy',
		dependencies: [8]
	},
	{
		id: 'flatten-props',
		number: 10,
		title: '展平嵌套属性',
		shortTitle: '展平',
		description: '将嵌套的 YAML 对象转换为扁平属性格式。',
		type: 'batch',
		service: 'DataQualityService',
		detectMethod: 'detectNestedProperties',
		applyMethod: 'flattenProperties',
		dependencies: []
	},
	{
		id: 'event-person-migrate',
		number: 11,
		title: '迁移事件人物属性',
		shortTitle: '事件人物',
		description: '将单数 person 属性转换为 persons 数组格式。',
		type: 'batch',
		service: 'EventPersonMigrationService',
		detectMethod: 'detectLegacyPersonProperty',
		applyMethod: 'migrateToArrayFormat',
		dependencies: [6]
	},
	{
		id: 'sourced-facts-migrate',
		number: 12,
		title: '迁移证据追踪',
		shortTitle: '证据',
		description: '将嵌套的 sourced_facts 转换为扁平的 sourced_* 属性。',
		type: 'batch',
		service: 'SourcedFactsMigrationService',
		detectMethod: 'detectLegacySourcedFacts',
		applyMethod: 'migrateToFlatFormat',
		dependencies: []
	},
	{
		id: 'life-events-migrate',
		number: 13,
		title: '迁移生平事件',
		shortTitle: '生平事件',
		description: '将内联的 events 数组转换为独立的事件笔记文件。',
		type: 'batch',
		service: 'LifeEventsMigrationService',
		detectMethod: 'detectInlineEvents',
		applyMethod: 'migrateToEventNotes',
		dependencies: []
	},
	{
		id: 'child-to-children',
		number: 14,
		title: '规范化子女属性',
		shortTitle: '子女',
		description: '将旧版 "child" 属性重命名为 "children" 以保持一致。',
		type: 'batch',
		service: 'inline', // No external service needed
		detectMethod: 'detectLegacyChildProperty',
		applyMethod: 'migrateChildToChildren',
		dependencies: []
	},
	{
		id: 'place-cr-id',
		number: 15,
		title: '为地点笔记添加 cr_id',
		shortTitle: '地点 ID',
		description: '为缺少 cr_id 的地点笔记生成 cr_id。没有 cr_id 时，地点会被静默排除在地点图之外，也不会出现在按名称查找、父级下拉菜单或地图标记中。',
		type: 'batch',
		service: 'inline',
		detectMethod: 'detectPlacesWithoutCrId',
		applyMethod: 'addCrIdToPlaces',
		dependencies: []
	}
];

// --- Pure utility functions ---

/**
 * Format a date as relative time (e.g., "2 小时前")
 */
export function formatTimeAgo(date: Date): string {
	const seconds = Math.floor((Date.now() - date.getTime()) / 1000);

	if (seconds < 60) return '刚刚';
	if (seconds < 3600) return `${Math.floor(seconds / 60)} 分钟前`;
	if (seconds < 86400) return `${Math.floor(seconds / 3600)} 小时前`;
	return `${Math.floor(seconds / 86400)} 天前`;
}

/**
 * Parse hierarchy from geocoding address components
 */
export function parseHierarchyFromAddress(
	addressComponents: Record<string, string>,
	placeName: string
): string[] {
	const hierarchy: string[] = [];

	// Order of address components from most specific to least
	const componentOrder = [
		'city', 'town', 'village', 'municipality', 'hamlet',
		'county', 'district', 'suburb',
		'state', 'province', 'region',
		'country'
	];

	// Track what we've added to avoid duplicates
	const added = new Set<string>();
	added.add(placeName.toLowerCase()); // Don't include the place itself

	for (const component of componentOrder) {
		const value = addressComponents[component];
		if (value && !added.has(value.toLowerCase())) {
			hierarchy.push(value);
			added.add(value.toLowerCase());
		}
	}

	return hierarchy;
}

/**
 * Find an existing place by name in the place graph
 */
export function findPlaceByName(name: string, placeGraph: PlaceGraphService): PlaceNode | undefined {
	const allPlaces = placeGraph.getAllPlaces();
	const nameLower = name.toLowerCase();

	return allPlaces.find(p =>
		p.name.toLowerCase() === nameLower ||
		p.aliases.some(a => a.toLowerCase() === nameLower)
	);
}

/**
 * Infer place type from address components using OSM type mapping
 */
export function inferPlaceType(name: string, addressComponents: Record<string, string>): PlaceType | undefined {
	// Check which component matches this name
	for (const [component, value] of Object.entries(addressComponents)) {
		if (value.toLowerCase() === name.toLowerCase()) {
			return OSM_TYPE_MAP[component];
		}
	}
	return undefined;
}

/**
 * Strip wikilink brackets from a place value
 */
export function stripWikilink(value: string): { inner: string; hadBrackets: boolean } {
	if (value.startsWith('[[') && value.endsWith(']]')) {
		return { inner: value.slice(2, -2), hadBrackets: true };
	}
	return { inner: value, hadBrackets: false };
}

/**
 * Check if a place value contains the variant (as a standalone component)
 */
export function containsPlaceVariant(value: string, variant: string): boolean {
	const { inner } = stripWikilink(value);
	const parts = inner.split(',').map(p => p.trim());
	return parts.some(part => part.toLowerCase() === variant.toLowerCase());
}

/**
 * Replace a variant in a place value with the canonical form
 */
export function replacePlaceVariant(value: string, oldVariant: string, newCanonical: string): string {
	const { inner, hadBrackets } = stripWikilink(value);
	const parts = inner.split(',').map(p => p.trim());
	const newParts = parts.map(part => {
		if (part.toLowerCase() === oldVariant.toLowerCase()) {
			return newCanonical;
		}
		return part;
	});
	const result = newParts.join(', ');
	return hadBrackets ? `[[${result}]]` : result;
}

/**
 * Get stats from persisted state
 */
export function getPersistedStateStats(state: { steps: Record<number, { status: string }> }): { completed: number; total: number } {
	let completed = 0;
	const total = WIZARD_STEPS.length;
	for (const step of Object.values(state.steps)) {
		if (step.status === 'complete' || step.status === 'skipped') {
			completed++;
		}
	}
	return { completed, total };
}
