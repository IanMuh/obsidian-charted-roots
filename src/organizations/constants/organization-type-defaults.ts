/**
 * Organization Types - Built-in Definitions
 *
 * Default organization type categories with colors and icons.
 */

import type { OrganizationType, OrganizationTypeDefinition, OrganizationCategoryDefinition } from '../types/organization-types';

/**
 * Built-in organization type categories
 */
export const BUILT_IN_ORGANIZATION_CATEGORIES: OrganizationCategoryDefinition[] = [
	{ id: 'governance', name: '治理与贵族', sortOrder: 0 },
	{ id: 'economic', name: '经济与贸易', sortOrder: 1 },
	{ id: 'military_religious', name: '军事与宗教', sortOrder: 2 },
	{ id: 'social', name: '社会与教育', sortOrder: 3 },
	{ id: 'other', name: '其他', sortOrder: 4 }
];

/**
 * All built-in organization types
 */
export const BUILT_IN_ORGANIZATION_TYPES: OrganizationTypeDefinition[] = [
	// Governance & Nobility
	{
		id: 'noble_house',
		name: '贵族家族',
		description: '封建家族、王朝、贵族世家',
		color: '#9b59b6',
		icon: 'crown',
		category: 'governance',
		isBuiltIn: true
	},
	{
		id: 'political',
		name: '政治实体',
		description: '王国、共和国、政党',
		color: '#27ae60',
		icon: 'landmark',
		category: 'governance',
		isBuiltIn: true
	},

	// Economic & Trade
	{
		id: 'guild',
		name: '行会',
		description: '商业行会、工匠组织',
		color: '#e67e22',
		icon: 'hammer',
		category: 'economic',
		isBuiltIn: true
	},
	{
		id: 'corporation',
		name: '公司',
		description: '现代公司、企业',
		color: '#3498db',
		icon: 'building-2',
		category: 'economic',
		isBuiltIn: true
	},

	// Military & Religious
	{
		id: 'military',
		name: '军事单位',
		description: '军队、军团、海军、军事修会',
		color: '#e74c3c',
		icon: 'shield',
		category: 'military_religious',
		isBuiltIn: true
	},
	{
		id: 'religious',
		name: '宗教修会',
		description: '教堂、修道院、宗教修会',
		color: '#f1c40f',
		icon: 'church',
		category: 'military_religious',
		isBuiltIn: true
	},

	// Social & Educational
	{
		id: 'educational',
		name: '教育机构',
		description: '学校、大学、学院',
		color: '#1abc9c',
		icon: 'graduation-cap',
		category: 'social',
		isBuiltIn: true
	},

	// Other
	{
		id: 'custom',
		name: '其他',
		description: '用户自定义的组织类型',
		color: '#95a5a6',
		icon: 'folder',
		category: 'other',
		isBuiltIn: true
	}
];

/**
 * Legacy: Keep DEFAULT_ORGANIZATION_TYPES as alias for backwards compatibility
 */
export const DEFAULT_ORGANIZATION_TYPES = BUILT_IN_ORGANIZATION_TYPES;

/**
 * Check if a category ID is a built-in category
 */
export function isBuiltInOrganizationCategory(categoryId: string): boolean {
	return BUILT_IN_ORGANIZATION_CATEGORIES.some(c => c.id === categoryId);
}

/**
 * Get all organization type categories (built-in + custom)
 * Supports customizations and hiding of built-in categories
 */
export function getAllOrganizationCategories(
	customCategories: OrganizationCategoryDefinition[] = [],
	customizations?: Record<string, Partial<OrganizationCategoryDefinition>>,
	hiddenCategories?: string[]
): OrganizationCategoryDefinition[] {
	const hidden = new Set(hiddenCategories ?? []);
	const categories: OrganizationCategoryDefinition[] = [];

	// Add built-in categories (with customizations, excluding hidden)
	for (const builtIn of BUILT_IN_ORGANIZATION_CATEGORIES) {
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
 * Get organization category display name
 * Respects customizations for built-in categories
 */
export function getOrganizationCategoryName(
	categoryId: string,
	customCategories: OrganizationCategoryDefinition[] = [],
	customizations?: Record<string, Partial<OrganizationCategoryDefinition>>
): string {
	// Check customizations first for built-in categories
	const customization = customizations?.[categoryId];
	if (customization?.name) return customization.name;

	const builtIn = BUILT_IN_ORGANIZATION_CATEGORIES.find(c => c.id === categoryId);
	if (builtIn) return builtIn.name;

	const custom = customCategories.find(c => c.id === categoryId);
	if (custom) return custom.name;

	// Fallback: capitalize the ID
	return categoryId.charAt(0).toUpperCase() + categoryId.slice(1).replace(/_/g, ' ');
}

/**
 * Get all organization types with customizations and filtering applied
 */
export function getAllOrganizationTypesWithCustomizations(
	customTypes: OrganizationTypeDefinition[] = [],
	showBuiltIn = true,
	customizations?: Record<string, Partial<OrganizationTypeDefinition>>,
	hiddenTypes?: string[]
): OrganizationTypeDefinition[] {
	const hidden = new Set(hiddenTypes ?? []);
	const types: OrganizationTypeDefinition[] = [];

	// Add built-in types with customizations
	if (showBuiltIn) {
		for (const builtIn of BUILT_IN_ORGANIZATION_TYPES) {
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
 * Group organization types by category with full customization support
 */
export function getOrganizationTypesByCategoryWithCustomizations(
	customTypes: OrganizationTypeDefinition[] = [],
	showBuiltIn = true,
	typeCustomizations?: Record<string, Partial<OrganizationTypeDefinition>>,
	hiddenTypes?: string[],
	customCategories: OrganizationCategoryDefinition[] = [],
	categoryCustomizations?: Record<string, Partial<OrganizationCategoryDefinition>>,
	hiddenCategories?: string[]
): Record<string, OrganizationTypeDefinition[]> {
	const types = getAllOrganizationTypesWithCustomizations(customTypes, showBuiltIn, typeCustomizations, hiddenTypes);
	const allCategories = getAllOrganizationCategories(customCategories, categoryCustomizations, hiddenCategories);

	// Initialize grouped object with all categories
	const grouped: Record<string, OrganizationTypeDefinition[]> = {};
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
 * Get organization type definition by ID
 */
export function getOrganizationType(
	typeId: string,
	customTypes: OrganizationTypeDefinition[] = [],
	customizations?: Record<string, Partial<OrganizationTypeDefinition>>
): OrganizationTypeDefinition {
	// Check custom types first
	const customType = customTypes.find(t => t.id === typeId);
	if (customType) return customType;

	// Check built-in types with customizations
	const builtIn = BUILT_IN_ORGANIZATION_TYPES.find(t => t.id === typeId);
	if (builtIn) {
		const overrides = customizations?.[typeId];
		if (overrides) {
			return { ...builtIn, ...overrides };
		}
		return builtIn;
	}

	// Fallback to custom/other type
	return BUILT_IN_ORGANIZATION_TYPES.find(t => t.id === 'custom')!;
}

/**
 * Get all organization types (built-in + custom from settings)
 */
export function getAllOrganizationTypes(
	customTypes: OrganizationTypeDefinition[] = []
): OrganizationTypeDefinition[] {
	return [...BUILT_IN_ORGANIZATION_TYPES, ...customTypes.filter(t => !t.isBuiltIn)];
}

/**
 * Check if a string is a valid organization type ID
 */
export function isValidOrganizationType(
	typeId: string,
	customTypes: OrganizationTypeDefinition[] = []
): typeId is OrganizationType {
	return BUILT_IN_ORGANIZATION_TYPES.some(t => t.id === typeId) ||
		customTypes.some(t => t.id === typeId);
}
