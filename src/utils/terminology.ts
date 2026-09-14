/**
 * Terminology helpers for configurable UI labels
 *
 * These helpers allow users to customize terminology throughout the UI
 * without affecting the underlying data model or frontmatter properties.
 */

import type { CanvasRootsSettings } from '../settings';

/**
 * Get the appropriate label for romantic relationships based on user preference.
 * @param settings Plugin settings (defaults to 'spouse' terminology if undefined)
 * @param options.plural Return plural form ("Spouses" or "Partners")
 * @param options.lowercase Return lowercase form
 */
export function getSpouseLabel(
	settings: CanvasRootsSettings | undefined,
	options?: { plural?: boolean; lowercase?: boolean }
): string {
	const isPartner = settings?.romanticRelationshipLabel === 'partner';
	// 中文没有单复数/大小写变化，plural/lowercase 仅保留以兼容既有调用点。
	const label = isPartner ? '伴侣' : '配偶';
	return options?.lowercase ? label.toLowerCase() : label;
}

/**
 * Get action label like "Add spouse" or "Add partner"
 */
export function getAddSpouseLabel(settings: CanvasRootsSettings | undefined): string {
	return `添加${getSpouseLabel(settings, { lowercase: true })}`;
}

/**
 * 复合标签（如“配偶箭头”“配偶连线”）的后缀译名。
 */
const COMPOUND_SUFFIX_ZH: Record<string, string> = {
	'arrows': '箭头',
	'edges': '连线',
	'edge label format': '连线标签格式',
	'edge color': '连线颜色',
	'edge labels': '连线标签',
	'arrow style': '箭头样式',
	'edge display': '连线显示'
};

/**
 * Get compound labels like "Spouse arrows" or "Partner arrows"
 */
export function getSpouseCompoundLabel(
	settings: CanvasRootsSettings | undefined,
	suffix: string
): string {
	const translated = COMPOUND_SUFFIX_ZH[suffix] ?? suffix;
	return `${getSpouseLabel(settings)}${translated}`;
}

/**
 * 关系类型 token → 中文显示名映射。
 *
 * token 来自各处 createContext.relationshipType（如 'father'、'step-mother'、
 * 'adoptive father'、'spouse'、'child' 等），用于“新建 X”按钮与快捷创建标题。
 * 未收录的 token 原样返回，便于发现遗漏。
 */
const RELATIONSHIP_TYPE_ZH: Record<string, string> = {
	'father': '父亲',
	'mother': '母亲',
	'parent': '父母',
	'parents': '父母',
	'child': '子女',
	'son': '儿子',
	'daughter': '女儿',
	'sibling': '兄弟姐妹',
	'brother': '兄弟',
	'sister': '姐妹',
	'spouse': '配偶',
	'partner': '伴侣',
	'step-father': '继父',
	'step-mother': '继母',
	'stepfather': '继父',
	'stepmother': '继母',
	'adoptive father': '养父',
	'adoptive mother': '养母',
	'adoptive_father': '养父',
	'adoptive_mother': '养母',
	'grandparent': '祖父母',
	'grandfather': '祖父',
	'grandmother': '祖母',
	'grandchild': '孙辈',
	'uncle': '叔伯/舅父',
	'aunt': '姑姨/婶母',
	'cousin': '堂/表亲',
	'event_person': '事件人物'
};

/**
 * 将关系类型 token 转为中文显示名。
 */
export function getRelationshipTypeLabel(relationshipType: string | undefined): string {
	if (!relationshipType) return '人物';
	const key = relationshipType.toLowerCase();
	return RELATIONSHIP_TYPE_ZH[key] ?? relationshipType;
}
