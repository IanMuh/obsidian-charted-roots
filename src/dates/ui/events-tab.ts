/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call -- Obsidian API returns any-typed surfaces (frontmatter, file caches, plugin state); project policy accepts these. */
/**
 * Events Tab UI Component
 *
 * Renders the Events tab in the Control Center, showing
 * event notes management, date systems configuration, and temporal data statistics.
 */

import { App, EventRef, Menu, Modal, Notice, Setting, TFile, setIcon } from 'obsidian';
import type CanvasRootsPlugin from '../../../main';
import type { LucideIconName } from '../../ui/lucide-icons';
import { createLucideIcon } from '../../ui/lucide-icons';
import { getContrastColor } from '../../ui/create-person-types';
import { CreateEventModal } from '../../events/ui/create-event-modal';
import type { EventNote } from '../../events/types/event-types';
import { getEventType, getAllEventTypes } from '../../events/types/event-types';
import { TimelineCanvasExporter, TimelineColorScheme, TimelineLayoutStyle } from '../../events/services/timeline-canvas-exporter';
import { TimelineMarkdownExporter, TimelineExportFormat } from '../../events/services/timeline-markdown-exporter';
import { computeSortOrder } from '../../events/services/sort-order-service';
import { SortOrderResultModal } from '../../events/ui/sort-order-result-modal';
import { renderEventTypeManagerCard } from '../../events/ui/event-type-manager-card';
import { isEventNote } from '../../utils/note-type-detection';
import { extractDisplayLabel } from '../../utils/wikilink-resolver';
import { toSafeFilename } from '../../core/canvas-utils';
import { timelineExportTitle } from '../services/timeline-export-naming';
import { TemplateSnippetsModal } from '../../ui/template-snippets-modal';
import { calculateDateStatistics } from '../services/date-statistics';
import { openManageMediaModal } from '../../plugin/context-menu-helpers';

/* ──────────────────────────────────────────────────────────────────────────
   Types for the dockable Events list (renderEventsList)
   ────────────────────────────────────────────────────────────────────────── */

export interface EventsListOptions {
	container: HTMLElement;
	plugin: CanvasRootsPlugin;
	initialTypeFilter?: string;
	initialPersonFilter?: string;
	initialUniverseFilter?: string;
	initialPlaceFilter?: string;
	initialDateFrom?: number | null;
	initialDateTo?: number | null;
	initialSearch?: string;
	onStateChange?: (state: TimelineFilterState) => void;
}

/* ──────────────────────────────────────────────────────────────────────────
   Shared timeline-filter helpers (used by both the Control Center modal
   Timeline card and the dockable Events sidebar). Centralizing the filter
   state shape + predicate keeps the two implementations in sync; each new
   filter dimension adds one field here and is honored everywhere.
   ────────────────────────────────────────────────────────────────────────── */

/**
 * Sentinel value for the universe filter representing "events with no
 * universe field set" (real-world events).
 */
export const UNIVERSE_FILTER_REAL = '__real__';
/**
 * Sentinel value for the universe filter representing "events with any
 * universe field set" (any fictional vault).
 */
export const UNIVERSE_FILTER_ANY_FICTIONAL = '__fictional__';

/** Filter state for the timeline event list. */
export interface TimelineFilterState {
	/** Event type id; empty string means "all types". */
	type: string;
	/** Person wikilink (or substring); empty string means "all people". */
	person: string;
	/** Universe name, `UNIVERSE_FILTER_REAL`, `UNIVERSE_FILTER_ANY_FICTIONAL`, or empty for "all". */
	universe: string;
	/** Place wikilink; empty string means "all places". */
	place: string;
	/** Lower-bound year (inclusive). `null` means no lower bound. */
	dateFrom: number | null;
	/** Upper-bound year (inclusive). `null` means no upper bound. */
	dateTo: number | null;
	/** Free-text search across title/date/place/description; lowercased before matching. */
	search: string;
}

/**
 * Strip wikilink brackets from a string. Used to normalize person/place
 * wikilink values before substring matching against filter input.
 */
function stripWikilink(value: string): string {
	return value.replace(/^\[\[/, '').replace(/\]\]$/, '');
}

/**
 * Apply the timeline filter state to a list of events. Returns the subset
 * that passes every active filter. Empty filter fields are skipped (no
 * narrowing). Shared by both the Control Center modal Timeline card and
 * the dockable Events sidebar (#515).
 */
export function applyTimelineFilters(events: EventNote[], state: TimelineFilterState): EventNote[] {
	const personNeedle = state.person ? stripWikilink(state.person).toLowerCase() : '';
	const placeNeedle = state.place ? stripWikilink(state.place).toLowerCase() : '';
	const search = state.search.toLowerCase();
	const dateBounded = state.dateFrom !== null || state.dateTo !== null;

	return events.filter(event => {
		if (state.type && event.eventType !== state.type) return false;

		if (personNeedle) {
			const singlePerson = event.person ? stripWikilink(event.person).toLowerCase() : '';
			const multiplePeople = event.persons?.map(p => stripWikilink(p).toLowerCase()) || [];
			if (!singlePerson.includes(personNeedle) && !multiplePeople.some(p => p.includes(personNeedle))) {
				return false;
			}
		}

		if (state.universe) {
			if (state.universe === UNIVERSE_FILTER_REAL) {
				if (event.universe) return false;
			} else if (state.universe === UNIVERSE_FILTER_ANY_FICTIONAL) {
				if (!event.universe) return false;
			} else if (event.universe !== state.universe) {
				return false;
			}
		}

		if (placeNeedle) {
			const eventPlace = event.place ? stripWikilink(event.place).toLowerCase() : '';
			if (!eventPlace.includes(placeNeedle)) return false;
		}

		if (dateBounded) {
			// Events with no date pass only when both bounds are absent (already
			// excluded by `dateBounded`). With at least one bound active, an
			// undated event is filtered out.
			const year = event.date ? extractYear(event.date) : null;
			if (year === null) return false;
			if (state.dateFrom !== null && year < state.dateFrom) return false;
			if (state.dateTo !== null && year > state.dateTo) return false;
		}

		if (search) {
			const searchableText = [
				event.title,
				event.date || '',
				event.place || '',
				event.description || ''
			].join(' ').toLowerCase();
			if (!searchableText.includes(search)) return false;
		}

		return true;
	});
}

/**
 * Render the Events tab content
 */
export function renderEventsTab(
	container: HTMLElement,
	plugin: CanvasRootsPlugin,
	createCard: (options: { title: string; icon?: LucideIconName; subtitle?: string }) => HTMLElement,
	showTab: (tabId: string) => void,
	closeModal: () => void
): void {
	// Event Notes card (create and manage events)
	renderEventNotesCard(container, plugin, createCard);

	// Timeline card (event list with filtering)
	renderTimelineCard(container, plugin, createCard, showTab);

	// Export card (export timeline to Canvas/Excalidraw)
	renderExportCard(container, plugin, createCard);

	// Event Type Manager card (customize, hide, create event types)
	renderEventTypeManagerCard(container, plugin, createCard, () => {
		// Refresh the tab content when types change
		container.empty();
		renderEventsTab(container, plugin, createCard, showTab, closeModal);
	});

	// Statistics card
	renderStatisticsCard(container, plugin, createCard, closeModal);
}

/**
 * Render the Actions card with create button and event statistics
 */
function renderEventNotesCard(
	container: HTMLElement,
	plugin: CanvasRootsPlugin,
	createCard: (options: { title: string; icon?: LucideIconName; subtitle?: string }) => HTMLElement
): void {
	const card = createCard({
		title: '操作',
		icon: 'plus',
		subtitle: '为你的家人创建和管理生平事件'
	});
	const content = card.querySelector('.crc-card__content') as HTMLElement;

	// Create Event button
	new Setting(content)
		.setName('创建事件笔记')
		.setDesc('创建新事件以记录生平事件')
		.addButton(button => button
			.setButtonText('创建')
			.setCta()
			.onClick(() => {
				const eventService = plugin.getEventService();
				if (eventService) {
					const modal = new CreateEventModal(
						plugin.app,
						eventService,
						plugin.settings,
						{ plugin }
					);
					modal.open();
				}
			}));

	// Create Events base button
	new Setting(content)
		.setName('创建事件 Base')
		.setDesc('创建一个用于管理事件笔记的 Obsidian Base。创建后点击「属性」即可启用标题、类型、日期、人物、地点、置信度等列。')
		.addButton(button => button
			.setButtonText('创建')
			.onClick(() => {
				plugin.app.commands.executeCommandById('charted-roots:create-events-base-template');
			}));

	// Calendar view button
	new Setting(content)
		.setName('打开日历视图')
		.setDesc('在月历上查看重要日期')
		.addButton(button => button
			.setButtonText('日历')
			.onClick(() => {
				void plugin.activateCalendarView();
			}));

	// Fictional date systems button (#358)
	new Setting(content)
		.setName('虚构日期系统')
		.setDesc('管理用于世界构建的自定义历法')
		.addButton(button => button
			.setButtonText('打开设置')
			.onClick(() => {
				// @ts-expect-error - Obsidian internal API
				plugin.app.setting.open();
				// @ts-expect-error - Obsidian internal API
				plugin.app.setting.openTabById('charted-roots');
				// Delay to allow settings tab to render, then expand the dates section
				window.setTimeout(() => {
					const datesSection = activeDocument.querySelector('.cr-settings-section[data-section-name="dates"]') as HTMLDetailsElement;
					if (datesSection) datesSection.open = true;
				}, 200);
			}));

	// Templater templates button
	new Setting(content)
		.setName('Templater 模板')
		.setDesc('复制可直接用于 Templater 集成的模板')
		.addButton(button => button
			.setButtonText('查看模板')
			.onClick(() => {
				new TemplateSnippetsModal(plugin.app, 'event', plugin.settings.propertyAliases).open();
			}));

	// Compute sort order button
	let computeBtn: HTMLButtonElement;
	new Setting(content)
		.setName('计算排序顺序')
		.setDesc('根据 before/after 关系计算 sort_order 值')
		.addButton(button => {
			computeBtn = button.buttonEl;
			button.setButtonText('计算')
				.onClick(async () => {
					const eventService = plugin.getEventService();
					if (!eventService) return;

					computeBtn.disabled = true;
					computeBtn.textContent = '计算中…';

					try {
						const events = eventService.getAllEvents();
						const result = await computeSortOrder(plugin.app, events, plugin.getDateService());

						// Cycles or errors need an inspectable, actionable surface
						// (clickable culprit links); the quick-success case keeps the
						// lightweight toast (#723).
						if (result.cycleEventNotes.length > 0 || result.errors.length > 0) {
							new SortOrderResultModal(plugin.app, result).open();
						} else {
							new Notice(`已成功为 ${result.updatedCount} 个事件计算排序顺序。`);
						}

						// Invalidate cache to reload events
						eventService.invalidateCache();
					} catch (error) {
						const message = error instanceof Error ? error.message : String(error);
						new Notice(`计算排序顺序失败：${message}`);
					} finally {
						computeBtn.disabled = false;
						computeBtn.textContent = '计算';
					}
				});
		});

	// Event statistics
	const stats = calculateEventStatistics(plugin);

	if (stats.totalEvents > 0) {
		const statsSection = content.createDiv({ cls: 'cr-stats-section crc-mt-3' });
		statsSection.createEl('h4', { text: '事件统计', cls: 'cr-subsection-heading' });

		const statsList = statsSection.createEl('ul', { cls: 'cr-stats-list' });

		// Total events
		const totalItem = statsList.createEl('li');
		totalItem.setText(`库中共有 ${stats.totalEvents} 条事件笔记`);

		// By category breakdown
		if (stats.byCategory.core > 0 || stats.byCategory.extended > 0 || stats.byCategory.narrative > 0) {
			const categoryItem = statsList.createEl('li');
			const parts: string[] = [];
			if (stats.byCategory.core > 0) parts.push(`${stats.byCategory.core} 核心`);
			if (stats.byCategory.extended > 0) parts.push(`${stats.byCategory.extended} 扩展`);
			if (stats.byCategory.narrative > 0) parts.push(`${stats.byCategory.narrative} 叙事`);
			if (stats.byCategory.custom > 0) parts.push(`${stats.byCategory.custom} 自定义`);
			categoryItem.setText(`按分类：${parts.join('、')}`);
		}

		// Events with dates
		if (stats.totalEvents > 0) {
			const datedItem = statsList.createEl('li');
			const datedPercent = Math.round((stats.withDates / stats.totalEvents) * 100);
			datedItem.setText(`${stats.withDates} 个事件有日期（${datedPercent}%）`);
		}
	} else {
		// Empty state
		const emptyState = content.createDiv({ cls: 'crc-empty-state crc-mt-3' });
		emptyState.createEl('p', {
			text: '未找到事件笔记。',
			cls: 'crc-text-muted'
		});
		emptyState.createEl('p', {
			text: '创建事件笔记以记录出生、去世、婚姻等生平事件。',
			cls: 'crc-text-muted'
		});
	}

	container.appendChild(card);
}

/**
 * Add a dock button to a card header that opens the events view
 * in the right sidebar.
 */
function addEventsDockButton(card: HTMLElement, plugin: CanvasRootsPlugin): void {
	const header = card.querySelector('.crc-card__header');
	if (!header) return;

	const dockBtn = activeDocument.createElement('button');
	dockBtn.className = 'crc-card__dock-btn clickable-icon';
	dockBtn.setAttribute('aria-label', '在侧边栏中打开');
	setIcon(dockBtn, 'panel-right');
	dockBtn.addEventListener('click', (e) => {
		e.stopPropagation();
		void plugin.activateEventsView();
	});
	header.appendChild(dockBtn);
}

/**
 * Render the Timeline card with event list, filtering, and gap analysis
 */
function renderTimelineCard(
	container: HTMLElement,
	plugin: CanvasRootsPlugin,
	createCard: (options: { title: string; icon?: LucideIconName; subtitle?: string }) => HTMLElement,
	_showTab: (tabId: string) => void
): void {
	const eventService = plugin.getEventService();
	if (!eventService) return;

	const card = createCard({
		title: '时间轴',
		icon: 'clock',
		subtitle: '按时间顺序显示所有事件'
	});

	addEventsDockButton(card, plugin);

	const content = card.querySelector('.crc-card__content') as HTMLElement;

	// Get all events
	const allEvents = eventService.getAllEvents();

	if (allEvents.length === 0) {
		const emptyState = content.createDiv({ cls: 'crc-empty-state' });
		emptyState.createEl('p', {
			text: '暂无事件。',
			cls: 'crc-text-muted'
		});
		emptyState.createEl('p', {
			text: '创建事件笔记后即可在时间轴中查看。',
			cls: 'crc-text-muted'
		});
		container.appendChild(card);
		return;
	}

	// Filter controls
	const filterRow = content.createDiv({ cls: 'crc-timeline-filters' });

	// Event type filter
	const typeFilter = filterRow.createEl('select', { cls: 'dropdown' });
	typeFilter.createEl('option', { value: '', text: '所有类型' });

	const eventTypes = getAllEventTypes(
		plugin.settings.customEventTypes || [],
		plugin.settings.showBuiltInEventTypes !== false,
		plugin.settings.eventTypeCustomizations,
		plugin.settings.hiddenEventTypes
	);
	for (const type of eventTypes) {
		typeFilter.createEl('option', { value: type.id, text: type.name });
	}

	// Person filter
	const personFilter = filterRow.createEl('select', { cls: 'dropdown' });
	personFilter.createEl('option', { value: '', text: '所有人物' });

	const uniquePeople = eventService.getUniquePeople();
	for (const person of uniquePeople) {
		// Strip wikilink brackets for display
		const displayName = extractDisplayLabel(person);
		personFilter.createEl('option', { value: person, text: displayName });
	}

	// Search input
	const searchInput = filterRow.createEl('input', {
		cls: 'crc-timeline-search',
		attr: {
			type: 'text',
			placeholder: '搜索事件…'
		}
	});

	// More-filters disclosure (#515): render universe/place/date-range
	// controls in a collapsible section between the primary filter row
	// and the table so the row stays compact on narrow widths. Modal
	// version doesn't persist filter state, so the disclosure always
	// starts collapsed.
	const moreFiltersToggle = filterRow.createEl('button', {
		cls: 'crc-timeline-more-filters-toggle clickable-icon',
		attr: { 'aria-expanded': 'false', 'aria-label': '切换更多筛选条件' }
	});
	setIcon(moreFiltersToggle, 'sliders-horizontal');
	moreFiltersToggle.createSpan({ text: ' 更多筛选', cls: 'crc-timeline-more-filters-label' });

	const moreFiltersRow = content.createDiv({ cls: 'crc-timeline-more-filters crc-timeline-more-filters--collapsed' });

	// Universe filter: enumerate from event.universe values rather than
	// from universe notes, so events tagged with a universe name surface
	// in the dropdown even before the user creates a dedicated universe
	// note.
	const universeFilter = moreFiltersRow.createEl('select', { cls: 'dropdown' });
	universeFilter.createEl('option', { value: '', text: '（任意）' });
	universeFilter.createEl('option', { value: UNIVERSE_FILTER_REAL, text: '（现实世界）' });
	universeFilter.createEl('option', { value: UNIVERSE_FILTER_ANY_FICTIONAL, text: '（任意虚构宇宙）' });
	const universeNames = new Set<string>();
	for (const e of allEvents) {
		if (e.universe) universeNames.add(e.universe);
	}
	for (const name of Array.from(universeNames).sort((a, b) => a.localeCompare(b))) {
		universeFilter.createEl('option', { value: name, text: name });
	}

	// Place filter
	const placeFilter = moreFiltersRow.createEl('select', { cls: 'dropdown' });
	placeFilter.createEl('option', { value: '', text: '所有地点' });
	for (const place of eventService.getUniquePlaces()) {
		placeFilter.createEl('option', { value: place, text: stripWikilink(place) });
	}

	// Date range inputs
	const dateFromInput = moreFiltersRow.createEl('input', {
		cls: 'crc-timeline-date-input',
		attr: { type: 'number', placeholder: '起始年份' }
	});
	const dateToInput = moreFiltersRow.createEl('input', {
		cls: 'crc-timeline-date-input',
		attr: { type: 'number', placeholder: '结束年份' }
	});

	moreFiltersToggle.addEventListener('click', () => {
		const isCollapsed = moreFiltersRow.classList.toggle('crc-timeline-more-filters--collapsed');
		moreFiltersToggle.setAttribute('aria-expanded', String(!isCollapsed));
	});

	// Event table container
	const tableContainer = content.createDiv({ cls: 'crc-timeline-table-container' });

	// Render initial table
	let filteredEvents = sortEventsChronologically([...allEvents]);
	renderEventTable(tableContainer, filteredEvents, plugin);

	// Filter handler
	const applyFilters = () => {
		filteredEvents = applyTimelineFilters(allEvents, {
			type: typeFilter.value,
			person: personFilter.value,
			universe: universeFilter.value,
			place: placeFilter.value,
			dateFrom: dateFromInput.value ? parseInt(dateFromInput.value, 10) : null,
			dateTo: dateToInput.value ? parseInt(dateToInput.value, 10) : null,
			search: searchInput.value
		});
		filteredEvents = sortEventsChronologically(filteredEvents);
		renderEventTable(tableContainer, filteredEvents, plugin);
	};

	typeFilter.addEventListener('change', applyFilters);
	personFilter.addEventListener('change', applyFilters);
	universeFilter.addEventListener('change', applyFilters);
	placeFilter.addEventListener('change', applyFilters);
	dateFromInput.addEventListener('input', applyFilters);
	dateToInput.addEventListener('input', applyFilters);
	searchInput.addEventListener('input', applyFilters);

	// Timeline gap analysis section
	renderTimelineGaps(content, allEvents, plugin);

	container.appendChild(card);
}

/**
 * Sort events chronologically
 */
function sortEventsChronologically(events: EventNote[]): EventNote[] {
	return events.sort((a, b) => {
		// Events with sortOrder use that first
		if (a.sortOrder !== undefined && b.sortOrder !== undefined) {
			return a.sortOrder - b.sortOrder;
		}
		if (a.sortOrder !== undefined) return -1;
		if (b.sortOrder !== undefined) return 1;

		// Then sort by date
		if (a.date && b.date) {
			return a.date.localeCompare(b.date);
		}
		if (a.date) return -1;
		if (b.date) return 1;

		// Finally sort by title
		return a.title.localeCompare(b.title);
	});
}

/**
 * Render event table
 */
function renderEventTable(
	container: HTMLElement,
	events: EventNote[],
	plugin: CanvasRootsPlugin
): void {
	container.empty();

	if (events.length === 0) {
		container.createEl('p', {
			text: '没有匹配的事件。',
			cls: 'crc-text-muted crc-text-center'
		});
		return;
	}

	// Hint text above table
	const hint = container.createEl('p', { cls: 'crc-text-muted crc-text-small crc-mb-2' });
	hint.appendText('点击某行即可编辑。');
	const fileIconHint = createLucideIcon('file-text', 12);
	fileIconHint.addClass('crc-icon-inline');
	hint.appendChild(fileIconHint);
	hint.appendText(' 可打开笔记。');

	const table = container.createEl('table', { cls: 'crc-timeline-table' });

	// Header
	const thead = table.createEl('thead');
	const headerRow = thead.createEl('tr');
	headerRow.createEl('th', { text: '日期' });
	headerRow.createEl('th', { text: '事件' });
	headerRow.createEl('th', { text: '类型' });
	headerRow.createEl('th', { text: '人物' });
	headerRow.createEl('th', { text: '地点' });
	headerRow.createEl('th', { text: '媒体', cls: 'crc-timeline-th--center' });
	headerRow.createEl('th', { text: '', cls: 'crc-timeline-th--actions' });

	// Body
	const tbody = table.createEl('tbody');

	const eventService = plugin.getEventService();

	for (const event of events) {
		const row = tbody.createEl('tr', { cls: 'crc-timeline-row' });

		// Click row to open edit modal
		row.addEventListener('click', () => {
			if (eventService) {
				const modal = new CreateEventModal(
					plugin.app,
					eventService,
					plugin.settings,
					{
						plugin,
						editEvent: event,
						editFile: event.file,
						onUpdated: () => {
							// Refresh the table
							renderEventTable(container, events, plugin);
						}
					}
				);
				modal.open();
			}
		});

		// Context menu
		row.addEventListener('contextmenu', (e) => {
			e.preventDefault();
			const menu = new Menu();

			menu.addItem((item) => {
				item
					.setTitle('打开笔记')
					.setIcon('file')
					.onClick(async () => {
						await plugin.trackRecentFile(event.file, 'event');
						void plugin.app.workspace.getLeaf(false).openFile(event.file);
					});
			});

			menu.addItem((item) => {
				item
					.setTitle('在新标签页中打开')
					.setIcon('file-plus')
					.onClick(async () => {
						await plugin.trackRecentFile(event.file, 'event');
						void plugin.app.workspace.getLeaf('tab').openFile(event.file);
					});
			});

			menu.addSeparator();

			// Media actions
			const mediaCount = event.media?.length || 0;
			menu.addItem((item) => {
				item
					.setTitle('关联媒体…')
					.setIcon('image-plus')
					.onClick(() => {
						plugin.openLinkMediaModal(event.file, 'event', event.title);
					});
			});

			if (mediaCount > 0) {
				menu.addItem((item) => {
					item
						.setTitle(`管理媒体（${mediaCount}）…`)
						.setIcon('images')
						.onClick(() => {
							openManageMediaModal(plugin, event.file, 'event', event.title);
						});
				});
			}

			menu.addSeparator();

			menu.addItem((item) => {
				item
					.setTitle('删除事件')
					.setIcon('trash')
					.onClick(async () => {
						const confirmed = await confirmDeleteEvent(plugin.app, event.title);
						if (confirmed) {
							await plugin.app.fileManager.trashFile(event.file);
							new Notice(`已删除事件：${event.title}`);
						}
					});
			});

			menu.showAtMouseEvent(e);
		});

		// Date cell
		const dateCell = row.createEl('td', { cls: 'crc-timeline-cell-date' });
		if (event.date) {
			dateCell.textContent = event.date;
			if (event.dateEnd) {
				dateCell.textContent += ` – ${event.dateEnd}`;
			}
		} else {
			dateCell.createEl('span', { text: '未知', cls: 'crc-text-muted' });
		}

		// Event title cell
		const titleCell = row.createEl('td', { cls: 'crc-timeline-cell-title' });
		titleCell.textContent = event.title;

		// Type cell with badge
		const typeCell = row.createEl('td', { cls: 'crc-timeline-cell-type' });
		const typeDef = getEventType(
			event.eventType,
			plugin.settings.customEventTypes || [],
			plugin.settings.showBuiltInEventTypes !== false,
			plugin.settings.eventTypeCustomizations
		);
		if (typeDef) {
			const badge = typeCell.createEl('span', { cls: 'crc-event-type-badge' });
			badge.style.setProperty('background-color', typeDef.color);
			badge.style.setProperty('color', getContrastColor(typeDef.color));
			const icon = createLucideIcon(typeDef.icon, 12);
			badge.appendChild(icon);
			badge.appendText(` ${typeDef.name}`);
		} else {
			typeCell.textContent = event.eventType;
		}

		// Person cell
		const personCell = row.createEl('td', { cls: 'crc-timeline-cell-person' });
		// Collect all people (from both person and persons fields), deduplicated
		const personSet = new Set<string>();
		if (event.person) {
			personSet.add(extractDisplayLabel(event.person));
		}
		if (event.persons && event.persons.length > 0) {
			for (const p of event.persons) {
				personSet.add(extractDisplayLabel(p));
			}
		}
		const allPeople = Array.from(personSet);

		if (allPeople.length > 0) {
			personCell.textContent = allPeople.join(', ');
		} else {
			personCell.createEl('span', { text: '—', cls: 'crc-text-muted' });
		}

		// Place cell
		const placeCell = row.createEl('td', { cls: 'crc-timeline-cell-place' });
		if (event.place) {
			placeCell.textContent = extractDisplayLabel(event.place);
		} else {
			placeCell.createEl('span', { text: '—', cls: 'crc-text-muted' });
		}

		// Media cell
		const mediaCell = row.createEl('td', { cls: 'crc-timeline-cell-media' });
		const mediaCount = event.media?.length || 0;
		if (mediaCount > 0) {
			const mediaBadge = mediaCell.createEl('span', {
				cls: 'crc-person-list-badge crc-person-list-badge--media',
				attr: { title: `${mediaCount} 个媒体文件` }
			});
			const mediaIcon = createLucideIcon('image', 12);
			mediaBadge.appendChild(mediaIcon);
			mediaBadge.appendText(mediaCount.toString());

			// Click to open manage media modal
			mediaBadge.addEventListener('click', (e) => {
				e.stopPropagation();
				openManageMediaModal(plugin, event.file, 'event', event.title);
			});
		} else {
			mediaCell.createEl('span', { text: '—', cls: 'crc-text-muted' });
		}

		// Actions cell with open note button
		const actionsCell = row.createEl('td', { cls: 'crc-timeline-cell-actions' });
		const openBtn = actionsCell.createEl('button', {
			cls: 'crc-timeline-open-btn clickable-icon',
			attr: { 'aria-label': '打开笔记' }
		});
		const fileIcon = createLucideIcon('file-text', 14);
		openBtn.appendChild(fileIcon);
		openBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			void (async () => {
				await plugin.trackRecentFile(event.file, 'event');
				void plugin.app.workspace.getLeaf(false).openFile(event.file);
			})();
		});
	}

	// Show count
	container.createEl('p', {
		text: `显示 ${events.length} 个事件`,
		cls: 'crc-text-muted crc-text-small crc-mt-2'
	});
}

/**
 * Render timeline gap analysis
 */
function renderTimelineGaps(
	container: HTMLElement,
	events: EventNote[],
	_plugin: CanvasRootsPlugin
): void {
	// Only analyze if we have dated events
	const datedEvents = events.filter(e => e.date).sort((a, b) => (a.date || '').localeCompare(b.date || ''));

	if (datedEvents.length < 2) return;

	// Find gaps (periods with no events)
	const gaps: { start: string; end: string; years: number }[] = [];
	const GAP_THRESHOLD_YEARS = 5; // Consider gaps of 5+ years

	for (let i = 0; i < datedEvents.length - 1; i++) {
		const current = datedEvents[i];
		const next = datedEvents[i + 1];

		if (!current.date || !next.date) continue;

		// Extract years from dates
		const currentYear = extractYear(current.date);
		const nextYear = extractYear(next.date);

		if (currentYear && nextYear) {
			const yearGap = nextYear - currentYear;
			if (yearGap >= GAP_THRESHOLD_YEARS) {
				gaps.push({
					start: current.date,
					end: next.date,
					years: yearGap
				});
			}
		}
	}

	// Count unsourced events
	const unsourcedCount = events.filter(e => !e.sources || e.sources.length === 0).length;

	// Count orphan events (no person linked)
	const orphanCount = events.filter(e => !e.person && (!e.persons || e.persons.length === 0)).length;

	// Only show section if there are issues
	if (gaps.length === 0 && unsourcedCount === 0 && orphanCount === 0) return;

	const section = container.createDiv({ cls: 'crc-timeline-gaps crc-mt-4' });
	section.createEl('h4', { text: '数据质量洞察', cls: 'cr-subsection-heading' });

	const issuesList = section.createEl('ul', { cls: 'crc-timeline-gaps-list' });

	// Timeline gaps
	if (gaps.length > 0) {
		const gapItem = issuesList.createEl('li', { cls: 'crc-timeline-gap-item crc-timeline-gap-item--warning' });
		const icon = createLucideIcon('alert-triangle', 14);
		gapItem.appendChild(icon);

		if (gaps.length === 1) {
			gapItem.appendText(` 检测到时间轴断层：${gaps[0].years} 年（${gaps[0].start} – ${gaps[0].end}）`);
		} else {
			gapItem.appendText(` 检测到 ${gaps.length} 处时间轴断层（连续 ${GAP_THRESHOLD_YEARS} 年以上无事件）`);

			// Show first few gaps
			const gapDetails = issuesList.createEl('ul', { cls: 'crc-timeline-gap-details' });
			for (const gap of gaps.slice(0, 3)) {
				gapDetails.createEl('li', { text: `${gap.years} 年：${gap.start} – ${gap.end}` });
			}
			if (gaps.length > 3) {
				gapDetails.createEl('li', { text: `…另有 ${gaps.length - 3} 处`, cls: 'crc-text-muted' });
			}
		}
	}

	// Unsourced events
	if (unsourcedCount > 0) {
		const unsourcedItem = issuesList.createEl('li', { cls: 'crc-timeline-gap-item crc-timeline-gap-item--info' });
		const icon = createLucideIcon('info', 14);
		unsourcedItem.appendChild(icon);
		unsourcedItem.appendText(` ${unsourcedCount} 个事件没有来源引文`);
	}

	// Orphan events
	if (orphanCount > 0) {
		const orphanItem = issuesList.createEl('li', { cls: 'crc-timeline-gap-item crc-timeline-gap-item--info' });
		const icon = createLucideIcon('user-minus', 14);
		orphanItem.appendChild(icon);
		orphanItem.appendText(` ${orphanCount} 个事件未关联任何人物`);
	}
}

/**
 * Extract year from a date string
 */
function extractYear(dateStr: string): number | null {
	// Try ISO format first (YYYY-MM-DD or YYYY)
	const isoMatch = dateStr.match(/^(\d{4})/);
	if (isoMatch) {
		return parseInt(isoMatch[1], 10);
	}

	// Try any 4-digit number
	const yearMatch = dateStr.match(/\d{4}/);
	if (yearMatch) {
		return parseInt(yearMatch[0], 10);
	}

	return null;
}

/** Export format types */
type ExportFormat = 'canvas' | 'excalidraw' | 'markdown';

/**
 * Render the unified Export timeline card with format selector
 */
function renderExportCard(
	container: HTMLElement,
	plugin: CanvasRootsPlugin,
	createCard: (options: { title: string; icon?: LucideIconName; subtitle?: string }) => HTMLElement
): void {
	const eventService = plugin.getEventService();
	if (!eventService) return;

	const allEvents = eventService.getAllEvents();

	// Check if Excalidraw is available
	const excalidrawAvailable = (plugin.app as unknown as { plugins: { enabledPlugins: Set<string> } }).plugins?.enabledPlugins?.has('obsidian-excalidraw-plugin') ?? false;

	const card = createCard({
		title: '导出时间轴',
		icon: 'download',
		subtitle: '将事件导出为 Canvas、Excalidraw 或 Markdown'
	});
	const content = card.querySelector('.crc-card__content') as HTMLElement;

	// Deprecation notice - direct users to Reports
	const deprecationNotice = content.createDiv({ cls: 'crc-deprecation-notice' });
	const noticeIcon = createLucideIcon('info', 16);
	deprecationNotice.appendChild(noticeIcon);
	const noticeText = deprecationNotice.createSpan();
	noticeText.appendText('时间轴导出功能正迁移至 ');
	noticeText.createEl('strong', { text: '统计与报告 → 报告 → 时间轴' });
	noticeText.appendText('，以提供包含所有格式与选项的统一体验。');
	const openReportsLink = deprecationNotice.createEl('a', {
		text: '打开报告',
		cls: 'crc-deprecation-notice__link'
	});
	openReportsLink.addEventListener('click', (e) => {
		e.preventDefault();
		// Navigate to Reports tab in Control Center
		const controlCenter = activeDocument.querySelector('.canvas-roots-control-center');
		if (controlCenter) {
			const reportsTab = controlCenter.querySelector('[data-tab-id="reports"]') as HTMLElement;
			if (reportsTab) {
				reportsTab.click();
			}
		}
	});

	if (allEvents.length === 0) {
		const emptyState = content.createDiv({ cls: 'crc-empty-state' });
		emptyState.createEl('p', {
			text: '没有可导出的事件。',
			cls: 'crc-text-muted'
		});
		container.appendChild(card);
		return;
	}

	// State variables
	let exportFormat: ExportFormat = 'canvas';
	let titleValue = 'Event Timeline';
	let layoutValue: TimelineLayoutStyle = 'horizontal';
	let colorValue: TimelineColorScheme = 'event_type';
	let personValue = '';
	let typeValue = '';
	let groupValue = '';
	let includeEdges = true;
	let groupByPerson = false;
	let markdownFormat: TimelineExportFormat = 'callout';

	// Excalidraw-specific options
	let excalidrawRoughness = 1; // 0=architect, 1=artist, 2=cartoonist
	let excalidrawFontFamily: 1 | 2 | 3 | 4 | 5 | 6 | 7 = 1; // 1=Virgil, 2=Helvetica, 3=Cascadia, 4=Comic Shanns, 5=Excalifont, 6=Nunito, 7=Lilita One
	let excalidrawFillStyle: 'solid' | 'hachure' | 'cross-hatch' = 'solid';
	let excalidrawStrokeStyle: 'solid' | 'dashed' | 'dotted' = 'solid';
	let excalidrawStrokeWidth = 2;
	let excalidrawFontSize = 16;

	// Format selector (always visible at top)
	const formatDescriptions: Record<ExportFormat, string> = {
		canvas: '原生 Obsidian 画布，节点间可链接',
		excalidraw: excalidrawAvailable
			? '手绘风格图表（Excalidraw）'
			: '需要 Excalidraw 插件',
		markdown: '基于文本的格式（callout、表格、列表、dataview）'
	};

	const formatSetting = new Setting(content)
		.setName('导出格式')
		.setDesc(formatDescriptions[exportFormat])
		.addDropdown(dropdown => {
			dropdown
				.addOption('canvas', 'Canvas')
				.addOption('excalidraw', 'Excalidraw')
				.addOption('markdown', 'Markdown')
				.setValue(exportFormat)
				.onChange(value => {
					exportFormat = value as ExportFormat;
					formatSetting.setDesc(formatDescriptions[exportFormat]);
					updateVisibleOptions();
					updateExportButton();
				});
		});

	// Title (always visible)
	new Setting(content)
		.setName('标题')
		.setDesc('导出文件的名称')
		.addText(text => text
			.setPlaceholder('事件时间轴')
			.setValue(titleValue)
			.onChange(value => { titleValue = value; }));

	// Container for format-specific options
	const formatOptionsContainer = content.createDiv({ cls: 'crc-export-format-options' });

	// --- Canvas/Excalidraw options section ---
	const canvasOptionsSection = formatOptionsContainer.createDiv({ cls: 'crc-export-section crc-export-section--canvas' });

	// Layout style
	new Setting(canvasOptionsSection)
		.setName('布局')
		.setDesc('事件的排列方式')
		.addDropdown(dropdown => dropdown
			.addOption('horizontal', '水平（从左到右）')
			.addOption('vertical', '垂直（从上到下）')
			.addOption('gantt', '甘特（按日期与人物）')
			.setValue(layoutValue)
			.onChange(value => { layoutValue = value as TimelineLayoutStyle; }));

	// Color scheme
	new Setting(canvasOptionsSection)
		.setName('着色依据')
		.setDesc('事件节点的着色方式')
		.addDropdown(dropdown => dropdown
			.addOption('event_type', '事件类型')
			.addOption('category', '分类（核心/扩展/叙事）')
			.addOption('confidence', '置信度')
			.addOption('monochrome', '不着色')
			.setValue(colorValue)
			.onChange(value => { colorValue = value as TimelineColorScheme; }));

	// Include ordering edges
	new Setting(canvasOptionsSection)
		.setName('包含排序连线')
		.setDesc('为 before/after 关系绘制连线')
		.addToggle(toggle => toggle
			.setValue(includeEdges)
			.onChange(value => { includeEdges = value; }));

	// Group by person (Canvas only)
	const groupByPersonSetting = new Setting(canvasOptionsSection)
		.setName('按人物分组')
		.setDesc('按关联人物对事件进行视觉分组')
		.addToggle(toggle => toggle
			.setValue(groupByPerson)
			.onChange(value => { groupByPerson = value; }));

	// --- Excalidraw-specific options section ---
	const excalidrawOptionsSection = formatOptionsContainer.createDiv({ cls: 'crc-export-section crc-export-section--excalidraw' });

	// Drawing style (roughness)
	const roughnessDescriptions: Record<number, string> = {
		0: '干净、精确的线条，如建筑图纸',
		1: '略带粗糙的自然手绘风格',
		2: '非常粗糙、富有表现力的卡通风格'
	};
	const roughnessSetting = new Setting(excalidrawOptionsSection)
		.setName('绘制风格')
		.setDesc(roughnessDescriptions[excalidrawRoughness])
		.addDropdown(dropdown => dropdown
			.addOption('0', '建筑师（干净）')
			.addOption('1', '艺术家（自然）')
			.addOption('2', '漫画家（粗糙）')
			.setValue(String(excalidrawRoughness))
			.onChange(value => {
				excalidrawRoughness = parseInt(value);
				roughnessSetting.setDesc(roughnessDescriptions[excalidrawRoughness]);
			}));

	// Font family
	new Setting(excalidrawOptionsSection)
		.setName('字体')
		.setDesc('事件标签的字体样式')
		.addDropdown(dropdown => dropdown
			.addOption('1', 'Virgil（手绘）')
			.addOption('5', 'Excalifont（手绘）')
			.addOption('4', 'Comic Shanns（漫画）')
			.addOption('2', 'Helvetica（简洁）')
			.addOption('6', 'Nunito（圆润）')
			.addOption('7', 'Lilita One（标题）')
			.addOption('3', 'Cascadia（等宽）')
			.setValue(String(excalidrawFontFamily))
			.onChange(value => { excalidrawFontFamily = parseInt(value) as 1 | 2 | 3 | 4 | 5 | 6 | 7; }));

	// Font size
	new Setting(excalidrawOptionsSection)
		.setName('字体大小')
		.setDesc('文字标签的大小（默认：16）')
		.addSlider(slider => slider
			.setLimits(10, 32, 2)
			.setValue(excalidrawFontSize)
			.onChange(value => { excalidrawFontSize = value; }));

	// Stroke width
	new Setting(excalidrawOptionsSection)
		.setName('线条粗细')
		.setDesc('线条与边框的粗细（默认：2）')
		.addSlider(slider => slider
			.setLimits(1, 6, 1)
			.setValue(excalidrawStrokeWidth)
			.onChange(value => { excalidrawStrokeWidth = value; }));

	// Fill style
	new Setting(excalidrawOptionsSection)
		.setName('填充样式')
		.setDesc('图形的填充方式')
		.addDropdown(dropdown => dropdown
			.addOption('solid', '实心')
			.addOption('hachure', '斜线填充')
			.addOption('cross-hatch', '交叉斜线')
			.setValue(excalidrawFillStyle)
			.onChange(value => { excalidrawFillStyle = value as 'solid' | 'hachure' | 'cross-hatch'; }));

	// Stroke style
	new Setting(excalidrawOptionsSection)
		.setName('线条样式')
		.setDesc('线条与边框的样式')
		.addDropdown(dropdown => dropdown
			.addOption('solid', '实线')
			.addOption('dashed', '虚线')
			.addOption('dotted', '点线')
			.setValue(excalidrawStrokeStyle)
			.onChange(value => { excalidrawStrokeStyle = value as 'solid' | 'dashed' | 'dotted'; }));

	// --- Markdown options section ---
	const markdownOptionsSection = formatOptionsContainer.createDiv({ cls: 'crc-export-section crc-export-section--markdown' });

	// Markdown format dropdown
	const mdFormatDescriptions: Record<string, string> = {
		callout: '带年份分栏、彩色圆点和事件卡片的可视化时间轴。需要附带的 CSS。',
		table: '紧凑的 Markdown 表格，包含日期、事件、人物、地点和来源等列。',
		list: '按年份分组的简单项目符号列表。兼容性最佳，无需 CSS。',
		dataview: '生成可动态显示事件的 Dataview 查询。需要 Dataview 插件。'
	};

	const mdFormatSetting = new Setting(markdownOptionsSection)
		.setName('Markdown 格式')
		.setDesc(mdFormatDescriptions[markdownFormat])
		.addDropdown(dropdown => dropdown
			.addOption('callout', '垂直时间轴（带样式 callout）')
			.addOption('table', '精简表格')
			.addOption('list', '简单列表')
			.addOption('dataview', 'Dataview 查询（动态）')
			.setValue(markdownFormat)
			.onChange(value => {
				markdownFormat = value as TimelineExportFormat;
				mdFormatSetting.setDesc(mdFormatDescriptions[value]);
			}));

	// --- Common filter options (always visible) ---
	const filtersSection = content.createDiv({ cls: 'crc-export-filters crc-mt-2' });
	filtersSection.createEl('div', { text: '筛选', cls: 'setting-item-heading' });

	// Filter by person
	new Setting(filtersSection)
		.setName('按人物筛选')
		.setDesc('仅显示指定人物的事件')
		.addDropdown(dropdown => {
			dropdown.addOption('', '所有人物');
			const uniquePeople = eventService.getUniquePeople();
			for (const person of uniquePeople) {
				const displayName = extractDisplayLabel(person);
				dropdown.addOption(person, displayName);
			}
			dropdown.setValue(personValue);
			dropdown.onChange(value => { personValue = value; updateQuickStats(); });
		});

	// Filter by event type
	new Setting(filtersSection)
		.setName('按类型筛选')
		.setDesc('仅显示指定类型的事件')
		.addDropdown(dropdown => {
			dropdown.addOption('', '所有类型');
			const exportEventTypes = getAllEventTypes(
				plugin.settings.customEventTypes || [],
				plugin.settings.showBuiltInEventTypes !== false,
				plugin.settings.eventTypeCustomizations,
				plugin.settings.hiddenEventTypes
			);
			for (const type of exportEventTypes) {
				dropdown.addOption(type.id, type.name);
			}
			dropdown.setValue(typeValue);
			dropdown.onChange(value => { typeValue = value; updateQuickStats(); });
		});

	// Filter by group
	new Setting(filtersSection)
		.setName('按分组筛选')
		.setDesc('仅显示指定分组的事件')
		.addDropdown(dropdown => {
			dropdown.addOption('', '所有分组');
			const uniqueGroups = eventService.getUniqueGroups();
			for (const group of uniqueGroups) {
				dropdown.addOption(group, group);
			}
			dropdown.setValue(groupValue);
			dropdown.onChange(value => { groupValue = value; updateQuickStats(); });
		});

	// Quick stats row
	const markdownExporter = new TimelineMarkdownExporter(plugin.app, plugin.settings, plugin.getDateService());
	const quickStatsRow = content.createDiv({ cls: 'crc-quick-stats crc-mt-2' });

	const updateQuickStats = () => {
		const filterOptions = {
			filterPerson: personValue || undefined,
			filterEventType: typeValue || undefined,
			filterGroup: groupValue || undefined
		};
		const summary = markdownExporter.getExportSummary(allEvents, filterOptions);
		const dateRange = markdownExporter.getDateRange(allEvents, filterOptions);

		quickStatsRow.empty();
		const statsText = quickStatsRow.createEl('span', { cls: 'crc-quick-stats-text' });

		let mainLine = `${summary.totalEvents} 个事件`;
		if (dateRange.earliest && dateRange.latest) {
			const span = dateRange.latest - dateRange.earliest;
			mainLine += `，跨度 ${dateRange.earliest}–${dateRange.latest}（${span} 年）`;
		}
		statsText.createEl('span', { text: mainLine });

		if (summary.uniquePeople > 0 || summary.uniquePlaces > 0) {
			const secondaryStats: string[] = [];
			if (summary.uniquePeople > 0) secondaryStats.push(`${summary.uniquePeople} 人`);
			if (summary.uniquePlaces > 0) secondaryStats.push(`${summary.uniquePlaces} 个地点`);
			if (summary.datedEvents < summary.totalEvents) {
				secondaryStats.push(`${summary.datedEvents} 个有日期`);
			}
			statsText.createEl('span', {
				text: ` • ${secondaryStats.join(' • ')}`,
				cls: 'crc-text-muted'
			});
		}
	};

	// Initial stats
	updateQuickStats();

	// Export button
	const buttonRow = content.createDiv({ cls: 'crc-button-row crc-mt-3' });
	const exportBtn = buttonRow.createEl('button', { cls: 'crc-btn crc-btn--primary' });

	const updateExportButton = () => {
		exportBtn.empty();
		let iconName: LucideIconName = 'download';
		let buttonText = '导出';

		switch (exportFormat) {
			case 'canvas':
				iconName = 'layout';
				buttonText = '导出到 Canvas';
				break;
			case 'excalidraw':
				iconName = 'edit';
				buttonText = '导出到 Excalidraw';
				break;
			case 'markdown':
				iconName = 'file-text';
				buttonText = '导出到 Markdown';
				break;
		}

		const icon = createLucideIcon(iconName, 16);
		exportBtn.appendChild(icon);
		exportBtn.appendText(` ${buttonText}`);

		// Disable Excalidraw button if plugin not available
		exportBtn.disabled = exportFormat === 'excalidraw' && !excalidrawAvailable;
	};

	const updateVisibleOptions = () => {
		// Show/hide canvas options (shared between Canvas and Excalidraw)
		const showCanvas = exportFormat === 'canvas' || exportFormat === 'excalidraw';
		canvasOptionsSection.toggleClass('crc-hidden', !showCanvas);

		// Show/hide group by person (Canvas only, not Excalidraw)
		groupByPersonSetting.settingEl.toggleClass('crc-hidden', exportFormat !== 'canvas');

		// Show/hide Excalidraw-specific options
		excalidrawOptionsSection.toggleClass('crc-hidden', exportFormat !== 'excalidraw');

		// Show/hide markdown options
		markdownOptionsSection.toggleClass('crc-hidden', exportFormat !== 'markdown');
	};

	// Initial visibility
	updateVisibleOptions();
	updateExportButton();

	// Export handler
	exportBtn.addEventListener('click', () => {
		void (async () => {
			const title = titleValue || 'Event Timeline';

			if (exportFormat === 'canvas') {
				await handleCanvasExport(plugin, allEvents, title, layoutValue, colorValue, personValue, typeValue, groupValue, includeEdges, groupByPerson, exportBtn);
			} else if (exportFormat === 'excalidraw') {
				await handleExcalidrawExport(plugin, allEvents, title, layoutValue, colorValue, personValue, typeValue, groupValue, includeEdges, exportBtn, {
					roughness: excalidrawRoughness,
					fontFamily: excalidrawFontFamily,
					fillStyle: excalidrawFillStyle,
					strokeStyle: excalidrawStrokeStyle,
					strokeWidth: excalidrawStrokeWidth,
					fontSize: excalidrawFontSize
				});
			} else if (exportFormat === 'markdown') {
				await handleMarkdownExport(plugin, allEvents, title, markdownFormat, personValue, typeValue, groupValue, exportBtn);
			}
		})();
	});

	container.appendChild(card);
}

/**
 * Handle Canvas export
 */
async function handleCanvasExport(
	plugin: CanvasRootsPlugin,
	allEvents: EventNote[],
	title: string,
	layoutValue: TimelineLayoutStyle,
	colorValue: TimelineColorScheme,
	personValue: string,
	typeValue: string,
	groupValue: string,
	includeEdges: boolean,
	groupByPerson: boolean,
	exportBtn: HTMLButtonElement
): Promise<void> {
	const folder = plugin.settings.canvasesFolder || 'Charted Roots';
	const exportTitle = timelineExportTitle(title, personValue);
	const safeTitle = toSafeFilename(exportTitle);
	const expectedPath = `${folder}/${safeTitle}.canvas`;
	const existingFile = plugin.app.vault.getAbstractFileByPath(expectedPath);

	if (existingFile) {
		const confirmed = await confirmOverwriteCanvas(plugin.app, expectedPath);
		if (!confirmed) return;
	}

	exportBtn.disabled = true;
	exportBtn.textContent = '导出中…';

	try {
		const exporter = new TimelineCanvasExporter(plugin.app, plugin.settings);
		const result = await exporter.exportToCanvas(allEvents, {
			title: exportTitle,
			layoutStyle: layoutValue,
			colorScheme: colorValue,
			filterPerson: personValue || undefined,
			filterEventType: typeValue || undefined,
			filterGroup: groupValue || undefined,
			includeOrderingEdges: includeEdges,
			groupByPerson
		});

		if (result.success && result.path) {
			if (result.warnings?.length) {
				for (const warning of result.warnings) {
					new Notice(warning, 8000);
				}
			}
			new Notice(`已导出时间轴至 ${result.path}`);
			const file = plugin.app.vault.getAbstractFileByPath(result.path);
			if (file instanceof TFile) {
				void plugin.app.workspace.getLeaf(false).openFile(file);
			}
		} else {
			new Notice(`导出失败：${result.error || '未知错误'}`);
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
			new Notice(`导出失败：${message}`);
	} finally {
		exportBtn.disabled = false;
		exportBtn.empty();
		const icon = createLucideIcon('layout', 16);
		exportBtn.appendChild(icon);
		exportBtn.appendText(' 导出到 Canvas');
	}
}

/**
 * Handle Excalidraw export
 */
async function handleExcalidrawExport(
	plugin: CanvasRootsPlugin,
	allEvents: EventNote[],
	title: string,
	layoutValue: TimelineLayoutStyle,
	colorValue: TimelineColorScheme,
	personValue: string,
	typeValue: string,
	groupValue: string,
	includeEdges: boolean,
	exportBtn: HTMLButtonElement,
	excalidrawOptions: {
		roughness: number;
		fontFamily: 1 | 2 | 3 | 4 | 5 | 6 | 7;
		fillStyle: 'solid' | 'hachure' | 'cross-hatch';
		strokeStyle: 'solid' | 'dashed' | 'dotted';
		strokeWidth: number;
		fontSize: number;
	}
): Promise<void> {
	const folder = plugin.settings.canvasesFolder || 'Charted Roots';
	const exportTitle = timelineExportTitle(title, personValue);
	const safeTitle = toSafeFilename(exportTitle);
	const expectedExcalidrawPath = `${folder}/${safeTitle}.excalidraw.md`;
	const existingExcalidraw = plugin.app.vault.getAbstractFileByPath(expectedExcalidrawPath);

	if (existingExcalidraw) {
		const confirmed = await confirmOverwriteCanvas(plugin.app, expectedExcalidrawPath);
		if (!confirmed) return;
	}

	exportBtn.disabled = true;
	exportBtn.textContent = '导出中…';

	try {
		const exporter = new TimelineCanvasExporter(plugin.app, plugin.settings);

		// Export to canvas first (as intermediate format)
		const result = await exporter.exportToCanvas(allEvents, {
			title: exportTitle,
			layoutStyle: layoutValue,
			colorScheme: colorValue,
			filterPerson: personValue || undefined,
			filterEventType: typeValue || undefined,
			filterGroup: groupValue || undefined,
			includeOrderingEdges: includeEdges,
			groupByPerson: false
		});

		if (result.success && result.path) {
			if (result.warnings?.length) {
				for (const warning of result.warnings) {
					new Notice(warning, 8000);
				}
			}

			// Convert to Excalidraw
			const { ExcalidrawExporter } = await import('../../excalidraw/excalidraw-exporter');
			const excalidrawExporter = new ExcalidrawExporter(plugin.app);

			const canvasFile = plugin.app.vault.getAbstractFileByPath(result.path);
			if (!(canvasFile instanceof TFile)) {
				throw new Error('Canvas file not found after export');
			}

			const excalidrawResult = await excalidrawExporter.exportToExcalidraw({
				canvasFile,
				fileName: result.path.replace('.canvas', '').split('/').pop(),
				preserveColors: true,
				roughness: excalidrawOptions.roughness,
				fontFamily: excalidrawOptions.fontFamily,
				fillStyle: excalidrawOptions.fillStyle,
				strokeStyle: excalidrawOptions.strokeStyle,
				strokeWidth: excalidrawOptions.strokeWidth,
				fontSize: excalidrawOptions.fontSize
			});

			if (excalidrawResult.success && excalidrawResult.excalidrawContent) {
				const excalidrawPath = result.path.replace('.canvas', '.excalidraw.md');
				const existingFile = plugin.app.vault.getAbstractFileByPath(excalidrawPath);
				if (existingFile instanceof TFile) {
					await plugin.app.vault.modify(existingFile, excalidrawResult.excalidrawContent);
				} else {
					await plugin.app.vault.create(excalidrawPath, excalidrawResult.excalidrawContent);
				}
				new Notice(`已导出时间轴至 ${excalidrawPath}`);
				const file = plugin.app.vault.getAbstractFileByPath(excalidrawPath);
				if (file instanceof TFile) {
					void plugin.app.workspace.getLeaf(false).openFile(file);
				}
			} else {
				new Notice(`Excalidraw 导出失败：${excalidrawResult.errors.join('，') || '未知错误'}`);
			}
		} else {
			new Notice(`导出失败：${result.error || '未知错误'}`);
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
			new Notice(`导出失败：${message}`);
	} finally {
		exportBtn.disabled = false;
		exportBtn.empty();
		const icon = createLucideIcon('edit', 16);
		exportBtn.appendChild(icon);
		exportBtn.appendText(' 导出到 Excalidraw');
	}
}

/**
 * Handle Markdown export
 */
async function handleMarkdownExport(
	plugin: CanvasRootsPlugin,
	allEvents: EventNote[],
	title: string,
	formatValue: TimelineExportFormat,
	personValue: string,
	typeValue: string,
	groupValue: string,
	exportBtn: HTMLButtonElement
): Promise<void> {
	const folder = plugin.settings.timelinesFolder || plugin.settings.eventsFolder || 'Charted Roots/Timelines';
	const exportTitle = timelineExportTitle(title, personValue);
	const safeTitle = toSafeFilename(exportTitle);
	const expectedPath = `${folder}/${safeTitle}.md`;
	const existingFile = plugin.app.vault.getAbstractFileByPath(expectedPath);

	if (existingFile) {
		const confirmed = await confirmOverwriteCanvas(plugin.app, expectedPath);
		if (!confirmed) return;
	}

	exportBtn.disabled = true;
	exportBtn.textContent = '导出中…';

	try {
		const exporter = new TimelineMarkdownExporter(plugin.app, plugin.settings, plugin.getDateService());
		const result = await exporter.export(allEvents, {
			title: exportTitle,
			format: formatValue,
			filterPerson: personValue || undefined,
			filterEventType: typeValue || undefined,
			filterGroup: groupValue || undefined,
			groupByYear: true,
			includePlaces: true,
			includeSources: true,
			multiColumn: formatValue === 'callout'
		});

		if (result.success && result.path) {
			if (result.warnings?.length) {
				for (const warning of result.warnings) {
					new Notice(warning, 8000);
				}
			}
			new Notice(`已导出时间轴至 ${result.path}`);
			const file = plugin.app.vault.getAbstractFileByPath(result.path);
			if (file instanceof TFile) {
				void plugin.app.workspace.getLeaf(false).openFile(file);
			}
		} else {
			new Notice(`导出失败：${result.error || '未知错误'}`);
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
			new Notice(`导出失败：${message}`);
	} finally {
		exportBtn.disabled = false;
		exportBtn.empty();
		const icon = createLucideIcon('file-text', 16);
		exportBtn.appendChild(icon);
		exportBtn.appendText(' 导出到 Markdown');
	}
}

/**
 * Statistics about events in the vault
 */
interface EventStatistics {
	totalEvents: number;
	withDates: number;
	byCategory: {
		core: number;
		extended: number;
		narrative: number;
		custom: number;
	};
}

/**
 * Resolve a property from frontmatter using alias mapping
 * Checks canonical property first, then falls back to aliases
 */
function resolveProperty(
	frontmatter: Record<string, unknown>,
	canonicalProperty: string,
	aliases: Record<string, string>
): unknown {
	// Canonical property takes precedence
	if (frontmatter[canonicalProperty] !== undefined) {
		return frontmatter[canonicalProperty];
	}

	// Check aliases - find user property that maps to this canonical property
	for (const [userProp, mappedCanonical] of Object.entries(aliases)) {
		if (mappedCanonical === canonicalProperty && frontmatter[userProp] !== undefined) {
			return frontmatter[userProp];
		}
	}

	return undefined;
}

/**
 * Calculate event statistics from event notes
 */
function calculateEventStatistics(plugin: CanvasRootsPlugin): EventStatistics {
	const stats: EventStatistics = {
		totalEvents: 0,
		withDates: 0,
		byCategory: {
			core: 0,
			extended: 0,
			narrative: 0,
			custom: 0
		}
	};

	// Core event types
	const coreTypes = ['birth', 'death', 'marriage', 'divorce'];
	// Extended event types
	const extendedTypes = ['burial', 'residence', 'occupation', 'education', 'military', 'immigration', 'baptism', 'confirmation', 'ordination'];
	// Narrative event types
	const narrativeTypes = ['anecdote', 'lore_event', 'plot_point', 'flashback', 'foreshadowing', 'backstory', 'climax', 'resolution'];

	// Get property aliases for resolving aliased properties
	const aliases = plugin.settings.propertyAliases || {};

	// Get all markdown files
	const files = plugin.app.vault.getMarkdownFiles();

	for (const file of files) {
		const cache = plugin.app.metadataCache.getFileCache(file);
		const frontmatter = cache?.frontmatter;

		if (!frontmatter) continue;

		// Check if this is an event note (supports cr_type, type, and tags)
		if (!isEventNote(frontmatter, cache, plugin.settings.noteTypeDetection)) continue;

		stats.totalEvents++;

		// Check for date (using property aliases)
		const dateValue = resolveProperty(frontmatter, 'date', aliases);
		if (dateValue) {
			stats.withDates++;
		}

		// Categorize by event type (using property aliases)
		const eventType = resolveProperty(frontmatter, 'event_type', aliases) as string;
		if (coreTypes.includes(eventType)) {
			stats.byCategory.core++;
		} else if (extendedTypes.includes(eventType)) {
			stats.byCategory.extended++;
		} else if (narrativeTypes.includes(eventType)) {
			stats.byCategory.narrative++;
		} else {
			stats.byCategory.custom++;
		}
	}

	return stats;
}

/**
 * Render the Statistics card with date coverage metrics
 */
function renderStatisticsCard(
	container: HTMLElement,
	plugin: CanvasRootsPlugin,
	createCard: (options: { title: string; icon?: LucideIconName }) => HTMLElement,
	closeModal: () => void
): void {
	const card = createCard({
		title: '统计',
		icon: 'bar-chart'
	});
	const content = card.querySelector('.crc-card__content') as HTMLElement;

	// Render the card body from a fresh statistics computation. Extracted so it
	// can re-run when the metadata cache settles (#651): the count walks the
	// metadata cache, which may be incompletely populated at first render (cold
	// start, post-edit re-indexing), so an early render can show a low number
	// until the cache catches up.
	const renderBody = (): void => {
		content.empty();

		const stats = calculateDateStatistics(plugin);

		if (stats.totalPersons === 0) {
			// Empty state if no persons
			const emptyState = content.createDiv({ cls: 'crc-empty-state' });
			emptyState.createEl('p', {
				text: '未找到人物笔记。',
				cls: 'crc-text-muted'
			});
			emptyState.createEl('p', {
				text: '创建 frontmatter 中带 cr_type: person 的人物笔记，即可查看日期统计。',
				cls: 'crc-text-muted'
			});
		} else {
			// Date coverage section
			const coverageSection = content.createDiv({ cls: 'cr-stats-section' });
			coverageSection.createEl('h4', { text: '日期覆盖', cls: 'cr-subsection-heading' });

			const coverageList = coverageSection.createEl('ul', { cls: 'cr-stats-list' });

			// Birth dates
			const birthItem = coverageList.createEl('li');
			const birthPercent = Math.round((stats.withBirthDates / stats.totalPersons) * 100);
			birthItem.setText(`共 ${stats.totalPersons} 条人物笔记，其中 ${stats.withBirthDates} 条有出生日期（${birthPercent}%）`);

			// Death dates
			const deathItem = coverageList.createEl('li');
			const deathPercent = Math.round((stats.withDeathDates / stats.totalPersons) * 100);
			deathItem.setText(`共 ${stats.totalPersons} 条人物笔记，其中 ${stats.withDeathDates} 条有去世日期（${deathPercent}%）`);

			// Fictional dates section (only show if fictional dates are enabled)
			if (plugin.settings.enableFictionalDates) {
				const fictionalSection = content.createDiv({ cls: 'cr-stats-section' });
				fictionalSection.createEl('h4', { text: '虚构日期', cls: 'cr-subsection-heading' });

				const fictionalList = fictionalSection.createEl('ul', { cls: 'cr-stats-list' });

				// Count of notes using fictional dates
				const fictionalItem = fictionalList.createEl('li');
				fictionalItem.setText(`${stats.withFictionalDates} 条笔记使用虚构日期系统`);

				// Systems in use
				if (stats.systemsInUse.length > 0) {
					const systemsItem = fictionalList.createEl('li');
					const systemsText = stats.systemsInUse
						.map(s => `${s.name}（${s.count}）`)
						.join('，');
					systemsItem.setText(`使用中的系统：${systemsText}`);
				}
			}
		}

		// View full statistics link
		const statsLink = content.createDiv({ cls: 'cr-stats-link' });
		const link = statsLink.createEl('a', { text: '查看完整统计 →', cls: 'crc-text-muted' });
		link.addEventListener('click', (e) => {
			e.preventDefault();
			closeModal();
			void plugin.activateStatisticsView();
		});
	};

	renderBody();
	container.appendChild(card);

	// #651: recompute when Obsidian signals the metadata cache has settled, so a
	// stale low count rendered mid-indexing corrects itself without a manual tab
	// reopen. The listener removes itself once the card leaves the DOM (tab
	// switch or modal close), and self-heals any leftover refs on the next event.
	let resolvedRef: EventRef;
	const recompute = (): void => {
		if (!card.isConnected) {
			plugin.app.metadataCache.offref(resolvedRef);
			return;
		}
		renderBody();
	};
	resolvedRef = plugin.app.metadataCache.on('resolved', recompute);
}

/**
 * Confirm deletion of an event
 */
async function confirmDeleteEvent(app: App, eventTitle: string): Promise<boolean> {
	return new Promise((resolve) => {
		const modal = new Modal(app);
		modal.titleEl.setText('删除事件');
		modal.contentEl.createEl('p', {
			text: `确定要删除「${eventTitle}」吗？此操作无法撤销。`
		});

		const buttonContainer = modal.contentEl.createDiv({ cls: 'modal-button-container' });

		const cancelBtn = buttonContainer.createEl('button', { text: '取消' });
		cancelBtn.addEventListener('click', () => {
			modal.close();
			resolve(false);
		});

		const deleteBtn = buttonContainer.createEl('button', {
			text: '删除',
			cls: 'mod-warning'
		});
		deleteBtn.addEventListener('click', () => {
			modal.close();
			resolve(true);
		});

		modal.open();
	});
}

/**
 * Confirm overwriting an existing canvas file
 */
async function confirmOverwriteCanvas(app: App, canvasPath: string): Promise<boolean> {
	return new Promise((resolve) => {
		const modal = new Modal(app);
		modal.titleEl.setText('覆盖画布？');
		modal.contentEl.createEl('p', {
			text: `"${canvasPath}" 处已存在画布文件。`
		});
		modal.contentEl.createEl('p', {
			text: '是否要用新的时间轴导出内容替换它？'
		});

		const buttonContainer = modal.contentEl.createDiv({ cls: 'modal-button-container' });

		const cancelBtn = buttonContainer.createEl('button', { text: '取消' });
		cancelBtn.addEventListener('click', () => {
			modal.close();
			resolve(false);
		});

		const overwriteBtn = buttonContainer.createEl('button', {
			text: '覆盖',
			cls: 'mod-warning'
		});
		overwriteBtn.addEventListener('click', () => {
			modal.close();
			resolve(true);
		});

		modal.open();
	});
}

/* ══════════════════════════════════════════════════════════════════════════
   Dockable Events List — standalone renderer for the sidebar ItemView
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Render a browsable events list for the dockable sidebar view.
 *
 * This is a standalone function with closure-scoped state, independent of
 * the modal's `renderTimelineCard()` / `renderEventTable()`. It provides
 * type/person filters, search, and a simplified table without row-click-to-edit,
 * media actions, delete, or gap analysis.
 */
export function renderEventsList(options: EventsListOptions): void {
	const { container, plugin, onStateChange } = options;

	const eventService = plugin.getEventService();
	if (!eventService) {
		container.createEl('p', {
			text: '事件服务不可用。',
			cls: 'crc-text-muted'
		});
		return;
	}

	// Closure-scoped state
	let currentTypeFilter = options.initialTypeFilter ?? '';
	let currentPersonFilter = options.initialPersonFilter ?? '';
	let currentUniverseFilter = options.initialUniverseFilter ?? '';
	let currentPlaceFilter = options.initialPlaceFilter ?? '';
	let currentDateFrom: number | null = options.initialDateFrom ?? null;
	let currentDateTo: number | null = options.initialDateTo ?? null;
	let currentSearch = options.initialSearch ?? '';

	// Get all events
	const allEvents = eventService.getAllEvents();

	if (allEvents.length === 0) {
		const emptyState = container.createDiv({ cls: 'crc-empty-state' });
		emptyState.createEl('p', {
			text: '暂无事件。',
			cls: 'crc-text-muted'
		});
		emptyState.createEl('p', {
			text: '创建事件笔记后即可在此查看。',
			cls: 'crc-text-muted'
		});
		return;
	}

	// Filter controls
	const filterRow = container.createDiv({ cls: 'crc-timeline-filters' });

	// Event type filter
	const typeFilterEl = filterRow.createEl('select', { cls: 'dropdown' });
	typeFilterEl.createEl('option', { value: '', text: '所有类型' });

	const eventTypes = getAllEventTypes(
		plugin.settings.customEventTypes || [],
		plugin.settings.showBuiltInEventTypes !== false,
		plugin.settings.eventTypeCustomizations,
		plugin.settings.hiddenEventTypes
	);
	for (const type of eventTypes) {
		const opt = typeFilterEl.createEl('option', { value: type.id, text: type.name });
		if (type.id === currentTypeFilter) opt.selected = true;
	}
	typeFilterEl.value = currentTypeFilter;

	// Person filter
	const personFilterEl = filterRow.createEl('select', { cls: 'dropdown' });
	personFilterEl.createEl('option', { value: '', text: '所有人物' });

	const uniquePeople = eventService.getUniquePeople();
	for (const person of uniquePeople) {
		const displayName = extractDisplayLabel(person);
		const opt = personFilterEl.createEl('option', { value: person, text: displayName });
		if (person === currentPersonFilter) opt.selected = true;
	}
	personFilterEl.value = currentPersonFilter;

	// Search input
	const searchInput = filterRow.createEl('input', {
		cls: 'crc-timeline-search',
		attr: {
			type: 'text',
			placeholder: '搜索事件…'
		}
	});
	searchInput.value = currentSearch;

	// More-filters disclosure (#515). Opens by default if any of the
	// secondary filters are persisted as set, so users with a remembered
	// universe/place/date-range filter see those controls without hunting
	// for them.
	const hasSecondaryFilter = !!(currentUniverseFilter || currentPlaceFilter || currentDateFrom !== null || currentDateTo !== null);
	const moreFiltersToggle = filterRow.createEl('button', {
		cls: 'crc-timeline-more-filters-toggle clickable-icon',
		attr: { 'aria-expanded': String(hasSecondaryFilter), 'aria-label': '切换更多筛选条件' }
	});
	setIcon(moreFiltersToggle, 'sliders-horizontal');
	moreFiltersToggle.createSpan({ text: ' 更多筛选', cls: 'crc-timeline-more-filters-label' });

	const moreFiltersRow = container.createDiv({ cls: 'crc-timeline-more-filters' });
	if (!hasSecondaryFilter) {
		moreFiltersRow.addClass('crc-timeline-more-filters--collapsed');
	}

	const universeFilterEl = moreFiltersRow.createEl('select', { cls: 'dropdown' });
	universeFilterEl.createEl('option', { value: '', text: '（任意）' });
	universeFilterEl.createEl('option', { value: UNIVERSE_FILTER_REAL, text: '（现实世界）' });
	universeFilterEl.createEl('option', { value: UNIVERSE_FILTER_ANY_FICTIONAL, text: '（任意虚构宇宙）' });
	const universeNames = new Set<string>();
	for (const e of allEvents) {
		if (e.universe) universeNames.add(e.universe);
	}
	for (const name of Array.from(universeNames).sort((a, b) => a.localeCompare(b))) {
		universeFilterEl.createEl('option', { value: name, text: name });
	}
	universeFilterEl.value = currentUniverseFilter;

	const placeFilterEl = moreFiltersRow.createEl('select', { cls: 'dropdown' });
	placeFilterEl.createEl('option', { value: '', text: '所有地点' });
	for (const place of eventService.getUniquePlaces()) {
		placeFilterEl.createEl('option', { value: place, text: stripWikilink(place) });
	}
	placeFilterEl.value = currentPlaceFilter;

	const dateFromInput = moreFiltersRow.createEl('input', {
		cls: 'crc-timeline-date-input',
		attr: { type: 'number', placeholder: '起始年份' }
	});
	if (currentDateFrom !== null) dateFromInput.value = String(currentDateFrom);

	const dateToInput = moreFiltersRow.createEl('input', {
		cls: 'crc-timeline-date-input',
		attr: { type: 'number', placeholder: '结束年份' }
	});
	if (currentDateTo !== null) dateToInput.value = String(currentDateTo);

	moreFiltersToggle.addEventListener('click', () => {
		const isCollapsed = moreFiltersRow.classList.toggle('crc-timeline-more-filters--collapsed');
		moreFiltersToggle.setAttribute('aria-expanded', String(!isCollapsed));
	});

	// Table container
	const tableContainer = container.createDiv({ cls: 'crc-timeline-table-container' });

	// Render function
	const renderTable = (events: EventNote[]) => {
		tableContainer.empty();

		if (events.length === 0) {
			tableContainer.createEl('p', {
				text: '没有匹配的事件。',
				cls: 'crc-text-muted crc-text-center'
			});
			return;
		}

		const table = tableContainer.createEl('table', { cls: 'crc-timeline-table' });

		// Header
		const thead = table.createEl('thead');
		const headerRow = thead.createEl('tr');
		headerRow.createEl('th', { text: '日期' });
		headerRow.createEl('th', { text: '事件' });
		headerRow.createEl('th', { text: '类型' });
		headerRow.createEl('th', { text: '人物' });
		headerRow.createEl('th', { text: '地点' });
		headerRow.createEl('th', { text: '媒体', cls: 'crc-timeline-th--center' });
		headerRow.createEl('th', { text: '', cls: 'crc-timeline-th--actions' });

		// Body
		const tbody = table.createEl('tbody');

		for (const event of events) {
			const row = tbody.createEl('tr', { cls: 'crc-timeline-row crc-timeline-row--browse' });

			// Context menu (simplified: open note, open in new tab only)
			row.addEventListener('contextmenu', (e) => {
				e.preventDefault();
				const menu = new Menu();

				menu.addItem((item) => {
					item
						.setTitle('打开笔记')
						.setIcon('file')
						.onClick(async () => {
							await plugin.trackRecentFile(event.file, 'event');
							void plugin.app.workspace.getLeaf(false).openFile(event.file);
						});
				});

				menu.addItem((item) => {
					item
						.setTitle('在新标签页中打开')
						.setIcon('file-plus')
						.onClick(async () => {
							await plugin.trackRecentFile(event.file, 'event');
							void plugin.app.workspace.getLeaf('tab').openFile(event.file);
						});
				});

				menu.showAtMouseEvent(e);
			});

			// Date cell
			const dateCell = row.createEl('td', { cls: 'crc-timeline-cell-date' });
			if (event.date) {
				dateCell.textContent = event.date;
				if (event.dateEnd) {
					dateCell.textContent += ` – ${event.dateEnd}`;
				}
			} else {
				dateCell.createEl('span', { text: '未知', cls: 'crc-text-muted' });
			}

			// Event title cell
			const titleCell = row.createEl('td', { cls: 'crc-timeline-cell-title' });
			titleCell.textContent = event.title;

			// Type cell with badge
			const typeCell = row.createEl('td', { cls: 'crc-timeline-cell-type' });
			const typeDef = getEventType(
				event.eventType,
				plugin.settings.customEventTypes || [],
				plugin.settings.showBuiltInEventTypes !== false,
				plugin.settings.eventTypeCustomizations
			);
			if (typeDef) {
				const badge = typeCell.createEl('span', { cls: 'crc-event-type-badge' });
				badge.style.setProperty('background-color', typeDef.color);
				badge.style.setProperty('color', getContrastColor(typeDef.color));
				const icon = createLucideIcon(typeDef.icon, 12);
				badge.appendChild(icon);
				badge.appendText(` ${typeDef.name}`);
			} else {
				typeCell.textContent = event.eventType;
			}

			// Person cell
			const personCell = row.createEl('td', { cls: 'crc-timeline-cell-person' });
			const allPeople: string[] = [];
			if (event.person) {
				allPeople.push(extractDisplayLabel(event.person));
			}
			if (event.persons && event.persons.length > 0) {
				allPeople.push(...event.persons.map(p => extractDisplayLabel(p)));
			}

			if (allPeople.length > 0) {
				personCell.textContent = allPeople.join(', ');
			} else {
				personCell.createEl('span', { text: '—', cls: 'crc-text-muted' });
			}

			// Place cell
			const placeCell = row.createEl('td', { cls: 'crc-timeline-cell-place' });
			if (event.place) {
				placeCell.textContent = extractDisplayLabel(event.place);
			} else {
				placeCell.createEl('span', { text: '—', cls: 'crc-text-muted' });
			}

			// Media cell (read-only badge, no click handler)
			const mediaCell = row.createEl('td', { cls: 'crc-timeline-cell-media' });
			const mediaCount = event.media?.length || 0;
			if (mediaCount > 0) {
				const mediaBadge = mediaCell.createEl('span', {
					cls: 'crc-person-list-badge crc-person-list-badge--media',
					attr: { title: `${mediaCount} 个媒体文件` }
				});
				const mediaIcon = createLucideIcon('image', 12);
				mediaBadge.appendChild(mediaIcon);
				mediaBadge.appendText(mediaCount.toString());
			} else {
				mediaCell.createEl('span', { text: '—', cls: 'crc-text-muted' });
			}

			// Actions cell with open note button
			const actionsCell = row.createEl('td', { cls: 'crc-timeline-cell-actions' });
			const openBtn = actionsCell.createEl('button', {
				cls: 'crc-timeline-open-btn clickable-icon',
				attr: { 'aria-label': '打开笔记' }
			});
			const fileIcon = createLucideIcon('file-text', 14);
			openBtn.appendChild(fileIcon);
			openBtn.addEventListener('click', (e) => {
				e.stopPropagation();
				void (async () => {
					await plugin.trackRecentFile(event.file, 'event');
					void plugin.app.workspace.getLeaf(false).openFile(event.file);
				})();
			});
		}

		// Show count
		tableContainer.createEl('p', {
			text: `显示 ${events.length} 个事件`,
			cls: 'crc-text-muted crc-text-small crc-mt-2'
		});
	};

	// Apply filters and render
	const applyFilters = () => {
		currentTypeFilter = typeFilterEl.value;
		currentPersonFilter = personFilterEl.value;
		currentUniverseFilter = universeFilterEl.value;
		currentPlaceFilter = placeFilterEl.value;
		currentDateFrom = dateFromInput.value ? parseInt(dateFromInput.value, 10) : null;
		currentDateTo = dateToInput.value ? parseInt(dateToInput.value, 10) : null;
		currentSearch = searchInput.value;

		const filterState: TimelineFilterState = {
			type: currentTypeFilter,
			person: currentPersonFilter,
			universe: currentUniverseFilter,
			place: currentPlaceFilter,
			dateFrom: currentDateFrom,
			dateTo: currentDateTo,
			search: currentSearch
		};
		const filtered = applyTimelineFilters(allEvents, filterState);
		renderTable(sortEventsChronologically([...filtered]));

		onStateChange?.(filterState);
	};

	typeFilterEl.addEventListener('change', applyFilters);
	personFilterEl.addEventListener('change', applyFilters);
	universeFilterEl.addEventListener('change', applyFilters);
	placeFilterEl.addEventListener('change', applyFilters);
	dateFromInput.addEventListener('input', applyFilters);
	dateToInput.addEventListener('input', applyFilters);
	searchInput.addEventListener('input', applyFilters);

	// Initial render
	const initialFiltered = applyTimelineFilters(allEvents, {
		type: currentTypeFilter,
		person: currentPersonFilter,
		universe: currentUniverseFilter,
		place: currentPlaceFilter,
		dateFrom: currentDateFrom,
		dateTo: currentDateTo,
		search: currentSearch
	});
	renderTable(sortEventsChronologically([...initialFiltered]));
}

/* eslint-enable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call -- Match scope of file-level disable at top. */
