/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument -- Obsidian API returns any-typed surfaces (frontmatter, file caches, plugin state); project policy accepts these. */
/**
 * Command Registrations
 *
 * Extracted from main.ts — registers all plugin commands, ribbon icons,
 * and workspace events.
 */

import { Notice } from 'obsidian';
import type CanvasRootsPlugin from '../../main';
import { ControlCenterModal } from '../ui/control-center';
import { RegenerateOptionsModal } from '../ui/regenerate-options-modal';
import { AddResearchQuestionModal } from '../ui/add-research-question-modal';
import { CleanupWizardModal } from '../ui/cleanup-wizard-modal';
import { SplitWizardModal } from '../ui/split-wizard-modal';
import { CreatePlaceModal } from '../ui/create-place-modal';
import { PlaceLookupModal } from '../places/ui/place-lookup-modal';
import { CreateMapWizardModal } from '../ui/create-map-wizard-modal';
import { MergeDuplicatePlacesModal, findDuplicatePlaceNotes } from '../ui/merge-duplicate-places-modal';
import { RelationshipCalculatorModal } from '../ui/relationship-calculator-modal';
import { RelationshipHistoryModal } from '../ui/relationship-history-modal';
import { SchemaService, ValidationService } from '../schemas';
import { UniverseWizardModal } from '../universes';
import { CreateEventModal } from '../events/ui/create-event-modal';
import { isPersonNote, isPlaceNote, isEventNote } from '../utils/note-type-detection';
import { getErrorMessage } from '../core/error-utils';
import { AddRelationshipModal } from '../ui/add-relationship-modal';
import { CommandMenuModal } from '../ui/command-menu-modal';
import { AddCitationModal } from '../sources/ui/add-citation-modal';
import { CitationSyncService } from '../sources/services/citation-sync-service';
import { formatChangeDescription } from '../core/relationship-history';
import {
	promptAssignReferenceNumbers,
	promptClearReferenceNumbers,
	promptAssignLineage,
	promptRemoveLineage,
	generateTreeForCurrentNote,
	createPersonNote,
} from './bulk-operations';

/**
 * Show relationship history modal
 */
function showRelationshipHistory(plugin: CanvasRootsPlugin): void {
	const relationshipHistory = plugin.getRelationshipHistory();
	if (!relationshipHistory) {
		new Notice('关系历史已禁用。请在设置中启用。');
		return;
	}

	new RelationshipHistoryModal(plugin.app, relationshipHistory).open();
}

/**
 * Undo the most recent relationship change
 */
async function undoLastRelationshipChange(plugin: CanvasRootsPlugin): Promise<void> {
	const relationshipHistory = plugin.getRelationshipHistory();
	if (!relationshipHistory) {
		new Notice('关系历史已禁用。请在设置中启用。');
		return;
	}

	const change = await relationshipHistory.undoLastChange();
	if (change) {
		new Notice(`已撤销：${formatChangeDescription(change)}`);
	}
}

export function registerCommandsAndEvents(plugin: CanvasRootsPlugin): void {
	// Add ribbon icon for control center
	plugin.addRibbonIcon('users', '打开 Charted Roots 控制中心', () => {
		new ControlCenterModal(plugin.app, plugin).open();
	});

	// Add command: Open quick actions (#290 — categorized command launcher)
	plugin.addCommand({
		id: 'open-quick-actions',
		name: '打开快速操作',
		callback: () => {
			new CommandMenuModal(plugin.app).open();
		}
	});

	// Add command: Open Control Center
	plugin.addCommand({
		id: 'open-control-center',
		name: '打开控制中心',
		callback: () => {
			new ControlCenterModal(plugin.app, plugin).open();
		}
	});

	// Add command: Manage Staging Area
	plugin.addCommand({
		id: 'manage-staging-area',
		name: '管理暂存区',
		callback: async () => {
			const { StagingManagementModal } = await import('../ui/staging-management-modal');
			new StagingManagementModal(plugin.app, plugin).open();
		}
	});

	// Add command: Open Statistics Dashboard
	plugin.addCommand({
		id: 'open-statistics-dashboard',
		name: '打开统计仪表盘',
		callback: () => {
			void plugin.activateStatisticsView();
		}
	});

	// Add command: Open Relationships view
	plugin.addCommand({
		id: 'open-relationships-view',
		name: '打开关系视图',
		callback: () => {
			void plugin.activateRelationshipsView();
		}
	});

	// Add command: Open People view
	plugin.addCommand({
		id: 'open-people-view',
		name: '打开人物视图',
		callback: () => {
			void plugin.activatePeopleView();
		}
	});

	// Add command: Open Events view
	plugin.addCommand({
		id: 'open-events-view',
		name: '打开事件视图',
		callback: () => {
			void plugin.activateEventsView();
		}
	});

	// Add command: Open Places view
	plugin.addCommand({
		id: 'open-places-view',
		name: '打开地点视图',
		callback: () => {
			void plugin.activatePlacesView();
		}
	});

	// Add command: Open Organizations view
	plugin.addCommand({
		id: 'open-organizations-view',
		name: '打开组织视图',
		callback: () => {
			void plugin.activateOrganizationsView();
		}
	});

	// Add command: Open Sources view
	plugin.addCommand({
		id: 'open-sources-view',
		name: '打开来源视图',
		callback: () => {
			void plugin.activateSourcesView();
		}
	});

	// Add command: Open Universes view
	plugin.addCommand({
		id: 'open-universes-view',
		name: '打开宇宙视图',
		callback: () => {
			void plugin.activateUniversesView();
		}
	});

	// Add command: Open Collections view
	plugin.addCommand({
		id: 'open-collections-view',
		name: '打开合集视图',
		callback: () => {
			void plugin.activateCollectionsView();
		}
	});

	// Add command: Open Data Quality view
	plugin.addCommand({
		id: 'open-data-quality-view',
		name: '打开数据质量视图',
		callback: () => {
			void plugin.activateDataQualityView();
		}
	});

	// Add command: Open Entity Profile
	plugin.addCommand({
		id: 'open-entity-profile',
		name: '打开实体档案',
		callback: () => {
			void plugin.activateProfileView();
		}
	});

	// Add command: Add research question to current note
	plugin.addCommand({
		id: 'add-research-question',
		name: '向当前笔记添加研究问题',
		checkCallback: (checking: boolean) => {
			const file = plugin.app.workspace.getActiveFile();
			if (!file) return false;

			const cache = plugin.app.metadataCache.getFileCache(file);
			const crType = cache?.frontmatter?.cr_type;
			const crId = cache?.frontmatter?.cr_id;

			// Valid for person notes (with cr_id), event notes, and place notes
			const validTypes = ['person', 'event', 'place'];
			const isValidType = validTypes.includes(crType);
			const isLegacyPersonNote = crId && !crType; // Legacy person notes have cr_id but no cr_type

			if (!isValidType && !isLegacyPersonNote) return false;

			if (!checking) {
				new AddResearchQuestionModal(plugin.app, file).open();
			}
			return true;
		}
	});

	// Add command: Add citation to current note
	plugin.addCommand({
		id: 'add-citation',
		name: '向当前笔记添加引文',
		checkCallback: (checking: boolean) => {
			const file = plugin.app.workspace.getActiveFile();
			if (!file) return false;

			const cache = plugin.app.metadataCache.getFileCache(file);
			const crType = cache?.frontmatter?.cr_type;
			const crId = cache?.frontmatter?.cr_id;

			// Valid for person and event notes
			const validTypes = ['person', 'event'];
			const isValidType = validTypes.includes(crType);
			const isLegacyPersonNote = crId && !crType;

			if (!isValidType && !isLegacyPersonNote) return false;
			if (!crId) return false;

			if (!checking) {
				new AddCitationModal(plugin.app, plugin, file, crId as string).open();
			}
			return true;
		}
	});

	// Add command: Sync sourced fields from citations
	plugin.addCommand({
		id: 'sync-sourced-from-citations',
		name: '从引文笔记同步来源字段（当前笔记）',
		checkCallback: (checking: boolean) => {
			const file = plugin.app.workspace.getActiveFile();
			if (!file) return false;

			const cache = plugin.app.metadataCache.getFileCache(file);
			const crId = cache?.frontmatter?.cr_id;
			if (!crId) return false;

			if (!checking) {
				const syncService = new CitationSyncService(plugin);
				void syncService.syncSourcedFieldsForPerson(file).then(count => {
					new Notice(count > 0
						? `已更新 ${count} 个来源字段`
						: '未找到此人的引文笔记'
					);
				});
			}
			return true;
		}
	});

	// Add command: Generate citations from sourced_* fields
	plugin.addCommand({
		id: 'generate-citations-from-sourced',
		name: '从来源字段生成引文笔记（当前笔记）',
		checkCallback: (checking: boolean) => {
			const file = plugin.app.workspace.getActiveFile();
			if (!file) return false;

			const cache = plugin.app.metadataCache.getFileCache(file);
			const crId = cache?.frontmatter?.cr_id;
			if (!crId) return false;

			if (!checking) {
				const syncService = new CitationSyncService(plugin);
				void syncService.generateCitationsFromSourcedFields(file).then(count => {
					new Notice(count > 0
						? `已创建 ${count} 条引文笔记`
						: '没有可生成的新引文（所有来源事实都已有引文笔记）'
					);
				});
			}
			return true;
		}
	});

	// Add command: Sync sourced fields vault-wide
	plugin.addCommand({
		id: 'sync-sourced-from-citations-vault',
		name: '从引文笔记同步来源字段（所有人物）',
		callback: () => {
			const syncService = new CitationSyncService(plugin);
			new Notice('正在从引文同步来源字段…');
			void syncService.syncSourcedFieldsVaultWide().then(result => {
				new Notice(`已更新 ${result.peopleUpdated} 个人物的 ${result.fieldsUpdated} 个字段`);
			});
		}
	});

	// Add command: Post-Import Cleanup Wizard
	plugin.addCommand({
		id: 'open-cleanup-wizard',
		name: '导入后清理向导',
		callback: () => {
			new CleanupWizardModal(plugin.app, plugin).open();
		}
	});

	// Register workspace event to open Control Center to a specific tab
	// Used by Plugin Settings to link to Preferences tab
	// Register both new and legacy event names for backward compatibility
	const openControlCenter = (initialTab?: string) => {
		new ControlCenterModal(plugin.app, plugin, initialTab).open();
	};
	plugin.registerEvent(
		plugin.app.workspace.on('charted-roots:open-control-center' as 'layout-change', openControlCenter)
	);
	plugin.registerEvent(
		plugin.app.workspace.on('canvas-roots:open-control-center' as 'layout-change', openControlCenter) // Legacy
	);

	// Register workspace event to open Cleanup Wizard
	// Used by Migration Notice view
	const openCleanupWizard = () => {
		new CleanupWizardModal(plugin.app, plugin).open();
	};
	plugin.registerEvent(
		plugin.app.workspace.on('charted-roots:open-cleanup-wizard' as 'layout-change', openCleanupWizard)
	);
	plugin.registerEvent(
		plugin.app.workspace.on('canvas-roots:open-cleanup-wizard' as 'layout-change', openCleanupWizard) // Legacy
	);

	// Add command: Generate Tree for Current Note
	plugin.addCommand({
		id: 'generate-tree-for-current-note',
		name: '为当前笔记生成树',
		callback: () => {
			void generateTreeForCurrentNote(plugin);
		}
	});

	// Add command: Regenerate Tree
	plugin.addCommand({
		id: 'regenerate-tree',
		name: '重新生成树',
		callback: () => {
			const activeFile = plugin.app.workspace.getActiveFile();

			if (!activeFile || activeFile.extension !== 'canvas') {
				new Notice('没有活动画布。请先打开一个画布文件。');
				return;
			}

			// Show options modal
			new RegenerateOptionsModal(plugin.app, plugin, activeFile).open();
		}
	});

	// Add command: Create Person Note
	plugin.addCommand({
		id: 'create-person-note',
		name: '创建人物笔记',
		callback: () => {
			createPersonNote(plugin);
		}
	});

	// Add command: Create Family Wizard
	plugin.addCommand({
		id: 'create-family-wizard',
		name: '创建家族向导',
		callback: () => {
			void import('../ui/family-creation-wizard').then(({ FamilyCreationWizardModal }) => {
				new FamilyCreationWizardModal(plugin.app, plugin).open();
			});
		}
	});

	// Add command: Create Event Note
	plugin.addCommand({
		id: 'create-event-note',
		name: '创建事件笔记',
		callback: () => {
			const eventService = plugin.getEventService();
			if (eventService) {
				new CreateEventModal(plugin.app, eventService, plugin.settings, { plugin }).open();
			}
		}
	});

	// Add command: Edit current note (opens appropriate edit modal based on note type)
	plugin.addCommand({
		id: 'edit-current-note',
		name: '编辑当前笔记',
		checkCallback: (checking) => {
			const activeFile = plugin.app.workspace.getActiveFile();
			if (!activeFile || activeFile.extension !== 'md') {
				return false;
			}

			const cache = plugin.app.metadataCache.getFileCache(activeFile);
			const fm = cache?.frontmatter;
			const detectionSettings = plugin.settings.noteTypeDetection;

			// Check if this is a supported note type
			const isPerson = isPersonNote(fm, cache, detectionSettings);
			const isPlace = isPlaceNote(fm, cache, detectionSettings);
			const isEvent = isEventNote(fm, cache, detectionSettings);

			if (!isPerson && !isPlace && !isEvent) {
				return false;
			}

			if (!checking) {
				if (isPerson) {
					plugin.openEditPersonModal(activeFile);
				} else if (isPlace) {
					plugin.openEditPlaceModal(activeFile);
				} else if (isEvent) {
					plugin.openEditEventModal(activeFile);
				}
			}

			return true;
		}
	});

	// Add command: Generate All Trees (for multi-family vaults)
	plugin.addCommand({
		id: 'generate-all-trees',
		name: '生成所有树',
		callback: () => {
			void plugin.generateAllTrees();
		}
	});

	// Add command: Create Base Template
	plugin.addCommand({
		id: 'create-base-template',
		name: '创建 base 模板',
		callback: () => {
			void plugin.createBaseTemplate();
		}
	});

	// Add command: Create Organizations Base Template
	plugin.addCommand({
		id: 'create-organizations-base-template',
		name: '创建组织 base 模板',
		callback: () => {
			void plugin.createOrganizationsBaseTemplate();
		}
	});

	// Add command: Create Sources Base Template
	plugin.addCommand({
		id: 'create-sources-base-template',
		name: '创建来源 base 模板',
		callback: () => {
			void plugin.createSourcesBaseTemplate();
		}
	});

	// Add command: Create Places Base Template
	plugin.addCommand({
		id: 'create-places-base-template',
		name: '创建地点 base 模板',
		callback: () => {
			void plugin.createPlacesBaseTemplate();
		}
	});

	// Add command: Create Events Base Template
	plugin.addCommand({
		id: 'create-events-base-template',
		name: '创建事件 base 模板',
		callback: () => {
			void plugin.createEventsBaseTemplate();
		}
	});

	// Add command: Create Universe
	plugin.addCommand({
		id: 'create-universe',
		name: '创建宇宙',
		callback: () => {
			new UniverseWizardModal(plugin, {
				onComplete: () => {
					// Universe created successfully
				}
			}).open();
		}
	});

	// Add command: Create Universes Base Template
	plugin.addCommand({
		id: 'create-universes-base-template',
		name: '创建宇宙 base 模板',
		callback: () => {
			void plugin.createUniversesBaseTemplate();
		}
	});

	// Add command: Create Notes Base Template
	plugin.addCommand({
		id: 'create-notes-base-template',
		name: '创建笔记 base 模板',
		callback: () => {
			void plugin.createNotesBaseTemplate();
		}
	});

	// Add command: Create Research Base Template
	plugin.addCommand({
		id: 'create-research-base-template',
		name: '创建研究 base 模板',
		callback: () => {
			void plugin.createResearchBaseTemplate();
		}
	});

	// Add command: Create All Base Templates
	plugin.addCommand({
		id: 'create-all-bases',
		name: '创建所有 base 模板',
		callback: () => {
			void plugin.createAllBases();
		}
	});

	// Add command: Calculate Relationship
	plugin.addCommand({
		id: 'calculate-relationship',
		name: '计算人物之间的关系',
		callback: () => {
			new RelationshipCalculatorModal(plugin.app, plugin.settings).open();
		}
	});

	// Add command: Find Related Research
	plugin.addCommand({
		id: 'find-related-research',
		name: '查找人物的相关研究',
		callback: async () => {
			const { FindRelatedResearchModal } = await import('../ui/find-related-research-modal');
			const activeFile = plugin.app.workspace.getActiveFile();
			const cache = activeFile ? plugin.app.metadataCache.getFileCache(activeFile) : null;
			if (activeFile && isPersonNote(cache?.frontmatter, cache)) {
				const name = (cache?.frontmatter?.name as string) || activeFile.basename;
				new FindRelatedResearchModal(plugin.app, name, activeFile.basename).open();
			} else {
				const { PersonPickerModal } = await import('../ui/person-picker');
				const picker = new PersonPickerModal(plugin.app, (person) => {
					new FindRelatedResearchModal(plugin.app, person.name, person.file.basename).open();
				});
				picker.open();
			}
		}
	});

	// Add command: Find Duplicates
	plugin.addCommand({
		id: 'find-duplicates',
		name: '查找重复人物',
		callback: async () => {
			const { DuplicateDetectionModal } = await import('../ui/duplicate-detection-modal');
			new DuplicateDetectionModal(plugin.app, plugin).open();
		}
	});

	// Add command: Open Family Chart
	// If a person note is active, use it as the root; otherwise show picker/empty state
	plugin.addCommand({
		id: 'open-family-chart',
		name: '打开家族图表',
		callback: () => {
			// Try to get cr_id from active note if it's a person note
			const activeFile = plugin.app.workspace.getActiveFile();
			let crId: string | undefined;
			if (activeFile && activeFile.extension === 'md') {
				const cache = plugin.app.metadataCache.getFileCache(activeFile);
				crId = plugin.resolveFrontmatterProperty<string>(cache?.frontmatter, 'cr_id');
			}
			void plugin.activateFamilyChartView(crId);
		}
	});

	// Add command: Open Map View
	plugin.addCommand({
		id: 'open-map-view',
		name: '打开地图视图',
		callback: () => {
			void plugin.activateMapView();
		}
	});

	// Add command: Open Calendar View
	plugin.addCommand({
		id: 'open-calendar-view',
		name: '打开日历视图',
		callback: () => {
			void plugin.activateCalendarView();
		}
	});

	// Add command: Open Report Wizard (#372)
	plugin.addCommand({
		id: 'open-report-wizard',
		name: '打开报告向导',
		callback: () => {
			void import('../reports/ui/report-wizard-modal').then(({ ReportWizardModal }) => {
				new ReportWizardModal(plugin).open();
			});
		}
	});

	// Add command: Open New Map View (for side-by-side comparison)
	plugin.addCommand({
		id: 'open-new-map-view',
		name: '打开新地图视图（用于对比）',
		callback: () => {
			void plugin.activateMapView(undefined, true);
		}
	});

	// Add command: Open new Family Chart (always creates new tab)
	plugin.addCommand({
		id: 'open-new-family-chart',
		name: '打开新家族图表',
		callback: () => {
			void plugin.activateFamilyChartView(undefined, true, true);
		}
	});

	// Add command: Open Family Chart for Current Note
	plugin.addCommand({
		id: 'open-family-chart-for-note',
		name: '在家族图表中打开当前笔记',
		checkCallback: (checking) => {
			const activeFile = plugin.app.workspace.getActiveFile();
			if (!activeFile || activeFile.extension !== 'md') {
				return false;
			}
			const cache = plugin.app.metadataCache.getFileCache(activeFile);
			const crId = plugin.resolveFrontmatterProperty<string>(cache?.frontmatter, 'cr_id');
			if (!crId) {
				return false;
			}
			if (!checking) {
				void plugin.activateFamilyChartView(crId);
			}
			return true;
		}
	});

	// Add command: Assign Ahnentafel Numbers
	plugin.addCommand({
		id: 'assign-ahnentafel',
		name: '分配 Ahnentafel 编号（祖先）',
		callback: () => {
			promptAssignReferenceNumbers(plugin, 'ahnentafel');
		}
	});

	// Add command: Assign d'Aboville Numbers
	plugin.addCommand({
		id: 'assign-daboville',
		name: "分配 d'Aboville 编号（后代）",
		callback: () => {
			promptAssignReferenceNumbers(plugin, 'daboville');
		}
	});

	// Add command: Assign Henry Numbers
	plugin.addCommand({
		id: 'assign-henry',
		name: '分配 Henry 编号（后代）',
		callback: () => {
			promptAssignReferenceNumbers(plugin, 'henry');
		}
	});

	// Add command: Assign Generation Numbers
	plugin.addCommand({
		id: 'assign-generation',
		name: '分配世代编号（所有亲属）',
		callback: () => {
			promptAssignReferenceNumbers(plugin, 'generation');
		}
	});

	// Add command: Clear Reference Numbers
	plugin.addCommand({
		id: 'clear-reference-numbers',
		name: '清除编号',
		callback: () => {
			promptClearReferenceNumbers(plugin);
		}
	});

	// Add command: Assign Lineage
	plugin.addCommand({
		id: 'assign-lineage',
		name: '从根人物分配世系',
		callback: () => {
			promptAssignLineage(plugin);
		}
	});

	// Add command: Remove Lineage
	plugin.addCommand({
		id: 'remove-lineage',
		name: '移除世系标签',
		callback: () => {
			promptRemoveLineage(plugin);
		}
	});

	// Add command: View relationship history
	plugin.addCommand({
		id: 'view-relationship-history',
		name: '查看关系历史',
		callback: () => {
			showRelationshipHistory(plugin);
		}
	});

	// Add command: Undo last relationship change
	plugin.addCommand({
		id: 'undo-relationship-change',
		name: '撤销上次关系更改',
		callback: () => {
			void undoLastRelationshipChange(plugin);
		}
	});

	// Add command: Split Tree Wizard
	plugin.addCommand({
		id: 'split-tree-wizard',
		name: '拆分树向导',
		callback: () => {
			new SplitWizardModal(plugin.app, plugin.settings, plugin.getFolderFilter() ?? undefined).open();
		}
	});

	// Add command: Create Place Note
	plugin.addCommand({
		id: 'create-place-note',
		name: '创建地点笔记',
		callback: () => {
			new CreatePlaceModal(plugin.app, {
				directory: plugin.settings.placesFolder || '',
				familyGraph: plugin.createFamilyGraphService(),
				placeGraph: plugin.createPlaceGraphService(),
				settings: plugin.settings,
				plugin: plugin
			}).open();
		}
	});

	// Add command: Look up Place (#218)
	plugin.addCommand({
		id: 'lookup-place',
		name: '查询地点',
		callback: () => {
			new PlaceLookupModal(plugin.app, {
				settings: plugin.settings,
				onSelect: (result) => {
					// Open Create Place modal with the selected result pre-populated
					new CreatePlaceModal(plugin.app, {
						directory: plugin.settings.placesFolder || '',
						initialName: result.standardizedName,
						initialPlaceType: result.placeType,
						familyGraph: plugin.createFamilyGraphService(),
						placeGraph: plugin.createPlaceGraphService(),
						settings: plugin.settings,
						plugin: plugin,
						prefilledCoordinates: result.coordinates ? {
							lat: result.coordinates.lat,
							lng: result.coordinates.lng
						} : undefined
					}).open();
				}
			}).open();
		}
	});

	// Add command: Create Custom Map
	plugin.addCommand({
		id: 'create-custom-map',
		name: '创建自定义地图',
		callback: () => {
			new CreateMapWizardModal(plugin.app, plugin, {
				directory: plugin.settings.mapsFolder
			}).open();
		}
	});

	// Add command: Open Places Tab
	plugin.addCommand({
		id: 'open-places-tab',
		name: '打开地点标签页',
		callback: () => {
			const modal = new ControlCenterModal(plugin.app, plugin);
			modal.openToTab('places');
		}
	});

	// Add command: Merge Duplicate Places
	plugin.addCommand({
		id: 'merge-duplicate-places',
		name: '合并重复地点笔记',
		callback: () => {
			const duplicateGroups = findDuplicatePlaceNotes(plugin.app, {
				settings: plugin.settings,
				folderFilter: plugin.getFolderFilter()
			});
			if (duplicateGroups.length === 0) {
				new Notice('未发现重复的地点笔记。你的地点都是唯一的！');
				return;
			}
			new MergeDuplicatePlacesModal(plugin.app, duplicateGroups).open();
		}
	});

	// Add command: Open Schemas Tab
	plugin.addCommand({
		id: 'open-schemas-tab',
		name: '打开 Schema 标签页',
		callback: () => {
			const modal = new ControlCenterModal(plugin.app, plugin);
			modal.openToTab('schemas');
		}
	});

	// Add command: Validate Vault Against Schemas
	plugin.addCommand({
		id: 'validate-vault-schemas',
		name: '根据 Schema 验证库',
		callback: async () => {
			const schemaService = new SchemaService(plugin);
			const validationService = new ValidationService(plugin, schemaService);

			new Notice('正在运行 Schema 验证…');

			try {
				const results = await validationService.validateVault();
				const summary = validationService.getSummary(results);

				const failedCount = new Set(results.filter(r => !r.isValid).map(r => r.filePath)).size;
				const passedCount = summary.totalPeopleValidated - failedCount;

				new Notice(`Schema 验证：${passedCount} 通过，${failedCount} 失败，${summary.totalErrors} 个错误`);

				// Open Control Center to Schemas tab to show full results
				const modal = new ControlCenterModal(plugin.app, plugin);
				modal.openToTab('schemas');
			} catch (error) {
				new Notice(`Schema 验证失败：${getErrorMessage(error)}`);
			}
		}
	});

	// Add command: Add Custom Relationship
	plugin.addCommand({
		id: 'add-custom-relationship',
		name: '为当前人物添加自定义关系',
		callback: () => {
			const activeFile = plugin.app.workspace.getActiveFile();

			if (!activeFile || activeFile.extension !== 'md') {
				new Notice('没有活动的 Markdown 文件。请先打开一个人物笔记。');
				return;
			}

			// Check if the file has a cr_id (is a person note)
			const cache = plugin.app.metadataCache.getFileCache(activeFile);
			if (!cache?.frontmatter?.cr_id) {
				new Notice('当前文件不是人物笔记（缺少 cr_id）');
				return;
			}

			new AddRelationshipModal(plugin.app, plugin, activeFile).open();
		}
	});

	// Add command: Insert Dynamic Blocks
	plugin.addCommand({
		id: 'insert-dynamic-blocks',
		name: '在当前笔记中插入动态块',
		callback: async () => {
			const activeFile = plugin.app.workspace.getActiveFile();

			if (!activeFile || activeFile.extension !== 'md') {
				new Notice('没有活动的 Markdown 文件。请先打开一个人物笔记。');
				return;
			}

			// Check if the file has a cr_id (is a person note)
			const cache = plugin.app.metadataCache.getFileCache(activeFile);
			if (!cache?.frontmatter?.cr_id) {
				new Notice('当前文件不是人物笔记（缺少 cr_id）');
				return;
			}

			await plugin.insertDynamicBlocks([activeFile]);
		}
	});

	// Add command: Open Relationships Tab
	plugin.addCommand({
		id: 'open-relationships-tab',
		name: '打开关系标签页',
		callback: () => {
			const modal = new ControlCenterModal(plugin.app, plugin);
			modal.openToTab('relationships');
		}
	});

	// Add command: Create Organization Note
	plugin.addCommand({
		id: 'create-organization-note',
		name: '创建组织笔记',
		callback: async () => {
			const { CreateOrganizationModal } = await import('../organizations');
			new CreateOrganizationModal(plugin.app, plugin, () => {
				// Optionally open to organizations tab after creation
			}).open();
		}
	});

	// Add command: Open Organizations Tab
	plugin.addCommand({
		id: 'open-organizations-tab',
		name: '打开组织标签页',
		callback: () => {
			const modal = new ControlCenterModal(plugin.app, plugin);
			modal.openToTab('organizations');
		}
	});

	// Add command: Create Source Note
	plugin.addCommand({
		id: 'create-source-note',
		name: '创建来源笔记',
		callback: async () => {
			const { CreateSourceModal } = await import('../sources');
			new CreateSourceModal(plugin.app, plugin, () => {
				// Optionally open to sources tab after creation
			}).open();
		}
	});

	// Add command: Create Note (Phase 4 Gramps Notes)
	plugin.addCommand({
		id: 'create-note',
		name: '创建笔记',
		callback: async () => {
			const { CreateNoteModal } = await import('../ui/create-note-modal');
			new CreateNoteModal(plugin.app, plugin).open();
		}
	});

	// Add command: Open Sources Tab
	plugin.addCommand({
		id: 'open-sources-tab',
		name: '打开来源标签页',
		callback: () => {
			const modal = new ControlCenterModal(plugin.app, plugin);
			modal.openToTab('sources');
		}
	});

	// Add command: Generate Place Notes
	plugin.addCommand({
		id: 'generate-place-notes',
		name: '从地点字符串生成地点笔记',
		callback: async () => {
			const { PlaceGeneratorModal } = await import('../enhancement/ui/place-generator-modal');
			new PlaceGeneratorModal(plugin.app, plugin.settings).open();
		}
	});

	// Add command: Open Book Builder
	plugin.addCommand({
		id: 'open-book-builder',
		name: '打开书籍构建器',
		callback: async () => {
			const { BookBuilderModal } = await import('../book/ui/book-builder-modal');
			new BookBuilderModal(plugin).open();
		}
	});

	// Add command: Regenerate book from .book.json
	plugin.addCommand({
		id: 'regenerate-book',
		name: '从定义重新生成书籍',
		checkCallback: (checking: boolean) => {
			const file = plugin.app.workspace.getActiveFile();
			if (!file || !file.path.endsWith('.book.json')) return false;
			if (checking) return true;

			void (async () => {
				try {
					const content = await plugin.app.vault.read(file);
					const definition = JSON.parse(content);
					const { BookGenerationService } = await import('../book/services/book-generation-service');
					const service = new BookGenerationService(plugin.app, plugin.settings, plugin);

						new Notice('正在重新生成书籍…');
					const result = await service.generateBook(definition);

					if (result.success && result.blob) {
						BookGenerationService.downloadBook(result.blob, result.suggestedFilename);

						// Save updated hashes and timestamp back to definition
						definition.lastGeneratedAt = new Date().toISOString();
						definition.lastChapterHashes = result.chapterHashes;
						await plugin.app.vault.modify(file, JSON.stringify(definition, null, '\t'));

						const changedCount = result.changedChapters?.length ?? 0;
						const changeMsg = definition.lastChapterHashes
							? `（${changedCount} 个章节已更改）`
							: '';
						new Notice(`书籍已重新生成：${result.stats.chapterCount} 个章节${changeMsg}`);
					} else {
						new Notice(`书籍生成失败：${result.errors.join(', ')}`);
					}
				} catch (err) {
					new Notice(`重新生成书籍失败：${err instanceof Error ? err.message : String(err)}`);
				}
			})();
			return true;
		}
	});
}

/* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument -- Match scope of file-level disable at top. */
