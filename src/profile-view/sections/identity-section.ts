/**
 * Identity Section
 *
 * Renders the sticky header with entity name, metadata, avatar,
 * pin toggle, and stale indicator. Shared across all entity types.
 * Supports inline editing of identity fields when onFieldSave is provided.
 */

import { type App, TFile, setIcon } from 'obsidian';
import { type MediaService, parseMediaCropFields } from '../../core/media-service';
import { applyCropToImage } from '../../core/crop-renderer';
import type {
	ProfileEntityData,
	EditableFieldConfig,
	InlineEditSaveFn,
	InlineEditNotifyFn
} from '../profile-types';
import { createEditableField, createMetaSeparator, commitActiveEdit } from '../inline-edit';
import { capitalize } from '../../utils/format-utils';
import { stripDateTimeSuffix } from '../../dates/utils/date-display';
import { getPlaceCategoryLabel } from '../../models/place';

export interface IdentityHeaderOptions {
	pinned: boolean;
	stale: boolean;
	onTogglePin: () => void;
	onOpenNote: (file: TFile) => void;
	app: App;
	mediaService: MediaService | null;
	onFieldSave: InlineEditSaveFn | null;
	onEditNotify: InlineEditNotifyFn | null;
	/**
	 * Resolve an event-type id to its catalog display name (e.g. `plot_point`
	 * → "Plot point"). Injected by the caller so this shared header stays
	 * decoupled from plugin settings; falls back to the raw id when unset or
	 * unresolved (#665).
	 */
	eventTypeResolver?: (typeId: string) => string;
	/**
	 * Resolve an organization-type id to its display name (e.g. `noble_house`
	 * → "Noble house"). Same decoupling as `eventTypeResolver`; falls back to
	 * the raw id when unset or unresolved (#735).
	 */
	orgTypeResolver?: (typeId: string) => string;
	/**
	 * Resolve a source-type id to its display name. Same decoupling as
	 * `eventTypeResolver`; falls back to the raw id when unset or unresolved
	 * (#735).
	 */
	sourceTypeResolver?: (typeId: string) => string;
}

export function renderIdentityHeader(
	container: HTMLElement,
	data: ProfileEntityData,
	options: IdentityHeaderOptions
): void {
	commitActiveEdit();
	container.empty();

	// Top row: pin toggle + entity type badge + actions
	const topRow = container.createDiv({ cls: 'cr-profile__header-top' });

	// Pin toggle
	const pinBtn = topRow.createEl('button', {
		cls: 'cr-profile__pin-toggle clickable-icon',
		attr: { 'aria-label': options.pinned ? '取消固定档案' : '固定档案' }
	});
	setIcon(pinBtn, options.pinned ? 'pin-off' : 'pin');
	pinBtn.addEventListener('click', options.onTogglePin);

	// Entity type badge
	const badge = topRow.createSpan({ cls: 'cr-profile__type-badge' });
	badge.addClass(`cr-profile__type-badge--${data.entityType}`);
	badge.textContent = formatEntityType(data.entityType);

	// Stale indicator
	const staleBadge = topRow.createSpan({
		cls: 'cr-profile__stale-badge',
		text: '未跟随当前笔记'
	});
	staleBadge.style.display = options.stale ? 'inline-flex' : 'none';

	// Open note button
	const openBtn = topRow.createEl('button', {
		cls: 'cr-profile__open-note clickable-icon',
		attr: { 'aria-label': '打开笔记' }
	});
	setIcon(openBtn, 'file-text');
	openBtn.addEventListener('click', () => options.onOpenNote(data.file));

	// Main content: avatar + name + metadata
	const main = container.createDiv({ cls: 'cr-profile__header-main' });

	// Avatar (person only)
	if (data.entityType === 'person' && data.node.media && data.node.media.length > 0 && options.mediaService) {
		const thumb = options.mediaService.getFirstThumbnailFile(data.node.media);
		if (thumb) {
			const avatarEl = main.createDiv({ cls: 'cr-profile__header-avatar' });
			const img = avatarEl.createEl('img', {
				attr: {
					src: options.app.vault.getResourcePath(thumb),
					alt: data.name
				}
			});
			// Apply crop region if defined (#354, flat form #683)
			const cache = options.app.metadataCache.getFileCache(data.file);
			const crop = cache?.frontmatter ? parseMediaCropFields(cache.frontmatter).get(thumb.name) : undefined;
			if (crop) {
				void applyCropToImage(options.app, img, thumb, crop);
			}
			img.addEventListener('error', () => {
				avatarEl.remove();
			});
		}
	}

	const info = main.createDiv({ cls: 'cr-profile__header-info' });

	// Name (editable or static)
	renderEntityName(info, data, options);

	// Metadata (entity-type-specific)
	const meta = info.createDiv({ cls: 'cr-profile__header-meta' });
	renderEntityMeta(meta, data, options);
}

// ────────────────────────────────────────────────────────────
// Name rendering
// ────────────────────────────────────────────────────────────

function renderEntityName(
	container: HTMLElement,
	data: ProfileEntityData,
	options: IdentityHeaderOptions
): void {
	const nameProperty = data.entityType === 'event' || data.entityType === 'source' ? 'title' : 'name';

	if (options.onFieldSave && options.onEditNotify) {
		const nameEl = container.createDiv({ cls: 'cr-profile__header-name' });
		createEditableField(nameEl, {
			property: nameProperty,
			label: '名称',
			displayValue: data.name,
			rawValue: data.name,
			inputType: 'text',
			placeholder: '输入名称…'
		}, options.onFieldSave, options.onEditNotify);
	} else {
		container.createEl('h2', { text: data.name, cls: 'cr-profile__header-name' });
	}

	// Alt name (#349)
	if (data.entityType === 'person' && data.node.altName) {
		container.createDiv({
			text: data.node.altName,
			cls: 'cr-profile__header-alt-name'
		});
	}
}

// ────────────────────────────────────────────────────────────
// Metadata rendering
// ────────────────────────────────────────────────────────────

function renderEntityMeta(
	container: HTMLElement,
	data: ProfileEntityData,
	options: IdentityHeaderOptions
): void {
	const editable = !!options.onFieldSave;

	switch (data.entityType) {
		case 'person':
			renderPersonMeta(container, data, options);
			break;
		case 'place':
			renderMetaFields(container, getPlaceFields(data), editable, options);
			break;
		case 'event':
			renderMetaFields(container, getEventFields(data, options), editable, options);
			break;
		case 'source':
			renderMetaFields(container, getSourceFields(data, options), editable, options);
			break;
		case 'organization':
			renderOrgMeta(container, data, options);
			break;
	}
}

// ── Person ──────────────────────────────────────────────────

function renderPersonMeta(
	container: HTMLElement,
	data: ProfileEntityData & { entityType: 'person' },
	options: IdentityHeaderOptions
): void {
	const editable = !!options.onFieldSave;
	let fieldCount = 0;

	// Dates: born – died (rendered as two separate editable fields)
	const hasDates = data.node.birthDate || data.node.deathDate;
	if (hasDates || editable) {
		if (editable && options.onFieldSave && options.onEditNotify) {
			createEditableField(container, {
				property: 'born',
				label: '出生日期',
				displayValue: stripDateTimeSuffix(data.node.birthDate),
				rawValue: data.node.birthDate || '',
				inputType: 'text',
				placeholder: '出生于 ?'
			}, options.onFieldSave, options.onEditNotify);

			container.createSpan({ text: ' – ', cls: 'cr-profile__meta-separator' });

			createEditableField(container, {
				property: 'died',
				label: '去世日期',
				displayValue: stripDateTimeSuffix(data.node.deathDate),
				rawValue: data.node.deathDate || '',
				inputType: 'text',
				placeholder: ''
			}, options.onFieldSave, options.onEditNotify);
			fieldCount++;
		} else if (hasDates) {
			const birth = stripDateTimeSuffix(data.node.birthDate) || '?';
			const death = stripDateTimeSuffix(data.node.deathDate);
			container.createSpan({ text: death ? `${birth} – ${death}` : `出生于 ${birth}` });
			fieldCount++;
		}
	}

	// Remaining fields: birthPlace, occupation, sex
	const remainingFields: EditableFieldConfig[] = [];

	if (data.node.birthPlace || editable) {
		remainingFields.push({
			property: 'birth_place',
			label: '出生地点',
			displayValue: stripWikilink(data.node.birthPlace || ''),
			rawValue: data.node.birthPlace || '',
			inputType: 'text',
			placeholder: '出生地点…'
		});
	}

	if (data.node.occupation || editable) {
		remainingFields.push({
			property: 'occupation',
			label: '职业',
			displayValue: data.node.occupation || '',
			rawValue: data.node.occupation || '',
			inputType: 'text',
			placeholder: '职业…'
		});
	}

	if (data.node.sex || editable) {
		remainingFields.push({
			property: 'sex',
			label: '性别',
			displayValue: formatSex(data.node.sex),
			rawValue: data.node.sex || '',
			inputType: 'select',
			selectOptions: [
				{ value: '', label: '（无）' },
				{ value: 'M', label: '男' },
				{ value: 'F', label: '女' },
				{ value: 'X', label: '非二元' },
				{ value: 'U', label: '未知' }
			]
		});
	}

	for (const field of remainingFields) {
		if (editable || field.displayValue) {
			if (fieldCount > 0) createMetaSeparator(container);
			if (editable && options.onFieldSave && options.onEditNotify) {
				createEditableField(container, field, options.onFieldSave, options.onEditNotify);
			} else {
				container.createSpan({ text: field.displayValue });
			}
			fieldCount++;
		}
	}
}

// ── Place ───────────────────────────────────────────────────

function getPlaceFields(data: ProfileEntityData & { entityType: 'place' }): EditableFieldConfig[] {
	const fields: EditableFieldConfig[] = [];

	fields.push({
		property: 'place_category',
		label: '分类',
		// Show the human label (e.g. "Historical"), keeping the raw id as the
		// editable value so the select round-trips (#745, like #665).
		displayValue: getPlaceCategoryLabel(data.node.category),
		rawValue: data.node.category || '',
		inputType: 'select',
		selectOptions: [
			{ value: '', label: '（无）' },
			{ value: 'real', label: '真实' },
			{ value: 'historical', label: '历史' },
			{ value: 'disputed', label: '存疑' },
			{ value: 'legendary', label: '传说' },
			{ value: 'mythological', label: '神话' },
			{ value: 'fictional', label: '虚构' }
		]
	});

	const lat = data.node.coordinates?.lat;
	const lon = data.node.coordinates?.long;

	fields.push({
		property: 'coordinates_lat',
		label: '纬度',
		displayValue: lat !== undefined ? `${Math.abs(lat).toFixed(1)}°${lat >= 0 ? 'N' : 'S'}` : '',
		rawValue: lat !== undefined ? String(lat) : '',
		inputType: 'number',
		placeholder: '纬度…'
	});

	fields.push({
		property: 'coordinates_long',
		label: '经度',
		displayValue: lon !== undefined ? `${Math.abs(lon).toFixed(1)}°${lon >= 0 ? 'E' : 'W'}` : '',
		rawValue: lon !== undefined ? String(lon) : '',
		inputType: 'number',
		placeholder: '经度…'
	});

	return fields;
}

// ── Event ───────────────────────────────────────────────────

function getEventFields(
	data: ProfileEntityData & { entityType: 'event' },
	options: IdentityHeaderOptions
): EditableFieldConfig[] {
	const eventType = data.event.eventType || '';
	return [
		{
			property: 'event_type',
			label: '事件类型',
			// Show the catalog display name (e.g. "Plot point"), keeping the raw
			// id as the editable value (#665).
			displayValue: eventType ? (options.eventTypeResolver?.(eventType) ?? eventType) : '',
			rawValue: eventType,
			inputType: 'text',
			placeholder: '事件类型…'
		},
		{
			property: 'date',
			label: '日期',
			displayValue: data.event.date ? String(data.event.date) : '',
			rawValue: data.event.date ? String(data.event.date) : '',
			inputType: 'text',
			placeholder: '日期…'
		},
		{
			property: 'place',
			label: '地点',
			displayValue: data.event.place ? stripWikilink(data.event.place) : '',
			rawValue: data.event.place || '',
			inputType: 'text',
			placeholder: '地点…'
		}
	];
}

// ── Source ───────────────────────────────────────────────────

function getSourceFields(
	data: ProfileEntityData & { entityType: 'source' },
	options: IdentityHeaderOptions
): EditableFieldConfig[] {
	const sourceType = data.source.sourceType || '';
	return [
		{
			property: 'source_type',
			label: '来源类型',
			// Show the catalog display name, keeping the raw id as the editable
			// value (#735).
			displayValue: sourceType ? (options.sourceTypeResolver?.(sourceType) ?? sourceType) : '',
			rawValue: sourceType,
			inputType: 'text',
			placeholder: '来源类型…'
		},
		{
			property: 'date',
			label: '日期',
			displayValue: data.source.date ? String(data.source.date) : '',
			rawValue: data.source.date ? String(data.source.date) : '',
			inputType: 'text',
			placeholder: '日期…'
		},
		{
			property: 'repository',
			label: '存放机构',
			displayValue: data.source.repository ? stripWikilink(data.source.repository) : '',
			rawValue: data.source.repository || '',
			inputType: 'text',
			placeholder: '存放机构…'
		}
	];
}

// ── Organization ────────────────────────────────────────────

function renderOrgMeta(
	container: HTMLElement,
	data: ProfileEntityData & { entityType: 'organization' },
	options: IdentityHeaderOptions
): void {
	const editable = !!options.onFieldSave;
	let fieldCount = 0;

	// Org type — show the catalog display name (e.g. "Noble house"), keeping the
	// raw id as the editable value (#735).
	const orgType = data.org.orgType || '';
	const orgTypeDisplay = orgType ? (options.orgTypeResolver?.(orgType) ?? orgType) : '';
	if (orgType || editable) {
		if (editable && options.onFieldSave && options.onEditNotify) {
			createEditableField(container, {
				property: 'org_type',
				label: '组织类型',
				displayValue: orgTypeDisplay,
				rawValue: orgType,
				inputType: 'text',
				placeholder: '组织类型…'
			}, options.onFieldSave, options.onEditNotify);
		} else {
			container.createSpan({ text: orgTypeDisplay });
		}
		fieldCount++;
	}

	// Founded / dissolved (compound display, separate editable fields)
	const hasDates = data.org.founded || data.org.dissolved;
	if (hasDates || editable) {
		if (fieldCount > 0) createMetaSeparator(container);

		if (editable && options.onFieldSave && options.onEditNotify) {
			container.createSpan({ text: '成立于 ', cls: 'cr-profile__meta-separator' });
			createEditableField(container, {
				property: 'founded',
				label: '成立',
				displayValue: data.org.founded || '',
				rawValue: data.org.founded || '',
				inputType: 'text',
				placeholder: '成立…'
			}, options.onFieldSave, options.onEditNotify);

			container.createSpan({ text: ' – ', cls: 'cr-profile__meta-separator' });

			createEditableField(container, {
				property: 'dissolved',
				label: '解散',
				displayValue: data.org.dissolved || '',
				rawValue: data.org.dissolved || '',
				inputType: 'text',
				placeholder: ''
			}, options.onFieldSave, options.onEditNotify);
		} else if (hasDates) {
			const dissolved = data.org.dissolved ? ` – ${data.org.dissolved}` : '';
			container.createSpan({ text: `成立于 ${data.org.founded}${dissolved}` });
		}
		fieldCount++;
	}

	// Seat
	if (data.org.seat || editable) {
		if (fieldCount > 0) createMetaSeparator(container);
		if (editable && options.onFieldSave && options.onEditNotify) {
			createEditableField(container, {
				property: 'seat',
				label: '所在地',
				displayValue: data.org.seat ? stripWikilink(data.org.seat) : '',
				rawValue: data.org.seat || '',
				inputType: 'text',
				placeholder: '所在地…'
			}, options.onFieldSave, options.onEditNotify);
		} else {
			container.createSpan({ text: stripWikilink(data.org.seat || '') });
		}
	}
}

// ── Shared field renderer ───────────────────────────────────

function renderMetaFields(
	container: HTMLElement,
	fields: EditableFieldConfig[],
	editable: boolean,
	options: IdentityHeaderOptions
): void {
	const visible = editable
		? fields
		: fields.filter(f => f.displayValue);

	visible.forEach((field, index) => {
		if (index > 0) createMetaSeparator(container);

		if (editable && options.onFieldSave && options.onEditNotify) {
			createEditableField(container, field, options.onFieldSave, options.onEditNotify);
		} else {
			container.createSpan({ text: field.displayValue });
		}
	});
}

// ── Helpers ─────────────────────────────────────────────────

const ENTITY_TYPE_LABELS: Record<string, string> = {
	person: '人物',
	place: '地点',
	event: '事件',
	source: '来源',
	organization: '组织'
};

function formatEntityType(type: string): string {
	return ENTITY_TYPE_LABELS[type] ?? capitalize(type);
}

function stripWikilink(link: string): string {
	return link.replace(/^\[\[/, '').replace(/\]\]$/, '').replace(/\|.*$/, '');
}

function formatSex(sex: string | undefined): string {
	if (!sex) return '';
	const labels: Record<string, string> = { M: '男', F: '女', X: '非二元', U: '未知' };
	return labels[sex] || sex;
}
