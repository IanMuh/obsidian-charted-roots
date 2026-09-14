import { App, Notice, normalizePath, PluginSettingTab, Setting, TFolder, TextComponent, AbstractInputSuggest, setIcon } from 'obsidian';
import type { SettingDefinitionItem, SettingDefinitionRender } from 'obsidian';
import CanvasRootsPlugin from '../main';
import type { LogLevel } from './core/logging';
import type { RelationshipTypeDefinition } from './relationships';
import type { FictionalDateSystem } from './dates';
import { renderDateSystemsSettings } from './dates/ui/date-systems-card';
import { createUniverseService } from './universes/services/universe-service';
import type { OrganizationTypeDefinition } from './organizations';
import type { SourceTypeDefinition, CitationFormat, SourceCategoryDefinition } from './sources/types/source-types';
import type { EventTypeDefinition, EventCategoryDefinition } from './events/types/event-types';
import type { OrganizationCategoryDefinition } from './organizations/types/organization-types';
import type { RelationshipCategoryDefinition } from './relationships/types/relationship-types';
import type { PlaceTypeDefinition, PlaceTypeCategoryDefinition } from './places/types/place-types';
import type { GedcomCompatibilityMode } from './gedcom/gedcom-preprocessor';
import { getSpouseCompoundLabel } from './utils/terminology';
import {
	PropertyAliasService,
	PERSON_PROPERTY_METADATA,
	EVENT_PROPERTY_METADATA,
	PLACE_PROPERTY_METADATA,
	SOURCE_PROPERTY_METADATA,
	type PropertyMetadata
} from './core/property-alias-service';
import {
	ValueAliasService,
	EVENT_TYPE_LABELS,
	SEX_LABELS,
	PLACE_CATEGORY_LABELS,
	NOTE_TYPE_LABELS,
	CANONICAL_EVENT_TYPES,
	CANONICAL_SEX_VALUES,
	CANONICAL_PLACE_CATEGORIES,
	CANONICAL_NOTE_TYPES,
	type ValueAliasField
} from './core/value-alias-service';
import { capitalize, pluralize } from './utils/format-utils';

export interface RecentTreeInfo {
	canvasPath: string;
	canvasName: string;
	peopleCount: number;
	edgeCount: number;
	rootPerson: string;
	timestamp: number;
}

export interface RecentImportInfo {
	fileName: string;
	recordsImported: number;
	notesCreated: number;
	timestamp: number;
}

/**
 * Recent file entry for Dashboard
 * Tracks files accessed via Charted Roots features
 */
export interface RecentFileEntry {
	/** File path */
	path: string;
	/** Display name (file basename without extension) */
	name: string;
	/** Entity type (person, event, source, place, canvas, map) */
	type: 'person' | 'event' | 'source' | 'place' | 'canvas' | 'map' | 'organization';
	/** Timestamp of last access */
	timestamp: number;
}

/**
 * Information about the last export performed for a specific format
 */
export interface LastExportInfo {
	/** Timestamp of the export */
	timestamp: number;
	/** Number of people exported */
	peopleCount: number;
	/** Output destination (download or vault) */
	destination: 'download' | 'vault';
	/** File path (if saved to vault) */
	filePath?: string;
	/** Number of living people excluded due to privacy */
	privacyExcluded?: number;
}

/**
 * Last-used settings for Family Chart export wizard
 */
export interface LastFamilyChartExportSettings {
	/** Last selected format */
	format: 'png' | 'svg' | 'pdf' | 'odt';
	/** Last avatar setting */
	includeAvatars: boolean;
	/** Last PNG scale */
	scale: number;
	/** Last PDF page size */
	pageSize: 'fit' | 'a4' | 'letter' | 'legal' | 'tabloid';
	/** Last PDF layout */
	layout: 'single' | 'tiled';
	/** Last PDF orientation */
	orientation: 'auto' | 'portrait' | 'landscape';
	/** Last cover page setting */
	includeCoverPage: boolean;
}

/**
 * Custom colors for Family Chart view
 * When set, these override the default CSS variables
 */
export interface FamilyChartColors {
	/** Female card background color */
	femaleColor: string;
	/** Male card background color */
	maleColor: string;
	/** Unknown gender card background color */
	unknownColor: string;
	/** Chart background color (light theme) */
	backgroundLight: string;
	/** Chart background color (dark theme) */
	backgroundDark: string;
	/** Card text color (light theme) */
	textLight: string;
	/** Card text color (dark theme) */
	textDark: string;
}

/**
 * Arrow style for relationship edges
 * - 'directed': Single arrow pointing to child/target (default)
 * - 'bidirectional': Arrows on both ends
 * - 'undirected': No arrows (just lines)
 */
export type ArrowStyle = 'directed' | 'bidirectional' | 'undirected';

/**
 * Node color scheme options
 * - 'sex': Color by sex (green for male, purple for female) - GEDCOM aligned
 * - 'generation': Color by generation level (creates visual layers)
 * - 'collection': Color by collection (different color per collection)
 * - 'monochrome': No coloring (neutral for all nodes)
 */
export type ColorScheme = 'sex' | 'generation' | 'collection' | 'monochrome';

/**
 * Canvas color values (Obsidian's 6 preset colors)
 * - '1': Red
 * - '2': Orange
 * - '3': Yellow
 * - '4': Green
 * - '5': Cyan
 * - '6': Purple
 * - 'none': No color (theme default)
 */
export type CanvasColor = '1' | '2' | '3' | '4' | '5' | '6' | 'none';

/**
 * Spouse edge label format options
 * - 'none': No labels (default - clean look)
 * - 'date-only': Just marriage date (e.g., "m. 1985")
 * - 'date-location': Date and location (e.g., "m. 1985 | Boston, MA")
 * - 'full': Date, location, and status (e.g., "m. 1985 | Boston, MA | div. 1992")
 */
export type SpouseEdgeLabelFormat = 'none' | 'date-only' | 'date-location' | 'full';

/**
 * Layout algorithm options for tree generation
 * - 'standard': Default family-chart layout with standard spacing
 * - 'compact': Tighter spacing for large trees (50% of standard spacing)
 * - 'timeline': Horizontal timeline layout by birth year
 * - 'hourglass': Ancestors above, descendants below a focus person
 */
export type LayoutType = 'standard' | 'compact' | 'timeline' | 'hourglass';

/**
 * Canvas grouping strategy options
 * - 'none': No groups (default - current behavior)
 * - 'generation': Group nodes by generation level
 * - 'nuclear-family': Group nuclear families (parents + children)
 * - 'collection': Group by collection/family group name
 */
export type CanvasGroupingStrategy = 'none' | 'generation' | 'nuclear-family' | 'collection';

/**
 * Folder filter mode options
 * - 'disabled': Scan all folders (default - current behavior)
 * - 'exclude': Scan all folders except those in the exclusion list
 * - 'include': Only scan folders in the inclusion list
 */
export type FolderFilterMode = 'disabled' | 'exclude' | 'include';

/**
 * Calendarium integration mode
 * - 'off': No integration with Calendarium
 * - 'read': Import calendar definitions from Calendarium (read-only)
 */
export type CalendariumIntegrationMode = 'off' | 'read';

/**
 * Sex value normalization mode
 * - 'standard': Normalize to GEDCOM M/F values (default)
 * - 'schema-aware': Skip notes with schemas that define custom sex enum values
 * - 'disabled': Never normalize sex values
 */
export type SexNormalizationMode = 'standard' | 'schema-aware' | 'disabled';

/**
 * Event icon display mode for visual views (timelines, canvas, maps)
 * - 'text': Text labels only (default - current behavior)
 * - 'icon': Icons only, with text in tooltip
 * - 'both': Icon + text label
 */
export type EventIconMode = 'text' | 'icon' | 'both';

export interface CanvasRootsSettings {
	defaultNodeWidth: number;
	defaultNodeHeight: number;
	horizontalSpacing: number;
	verticalSpacing: number;
	autoGenerateCrId: boolean;
	peopleFolder: string;
	placesFolder: string;
	mapsFolder: string;
	schemasFolder: string;
	canvasesFolder: string;
	logExportPath: string;
	logLevel: LogLevel;
	obfuscateLogExports: boolean;
	recentTrees: RecentTreeInfo[];
	recentImports: RecentImportInfo[];
	// Arrow styling
	parentChildArrowStyle: ArrowStyle;
	spouseArrowStyle: ArrowStyle;
	// Node coloring
	nodeColorScheme: ColorScheme;
	// Canvas grouping
	canvasGroupingStrategy: CanvasGroupingStrategy;
	// Edge coloring
	parentChildEdgeColor: CanvasColor;
	spouseEdgeColor: CanvasColor;
	// Marriage metadata display
	showSpouseEdges: boolean;
	spouseEdgeLabelFormat: SpouseEdgeLabelFormat;
	/** Show the marriage type (e.g. "Common-law marriage") wherever marriage info is displayed (#628) */
	showMarriageType: boolean;
	// Bidirectional relationship sync
	enableBidirectionalSync: boolean;
	syncOnFileModify: boolean;
	// Layout algorithm
	defaultLayoutType: LayoutType;
	// Privacy settings
	enablePrivacyProtection: boolean;
	livingPersonAgeThreshold: number;
	privacyDisplayFormat: 'living' | 'private' | 'initials' | 'hidden';
	hideDetailsForLiving: boolean;
	showPronouns: boolean;
	/** UI label preference for romantic relationships: "spouse" or "partner" */
	romanticRelationshipLabel: 'spouse' | 'partner';
	/** Whether the user has dismissed the privacy notice (shown after importing living persons) */
	privacyNoticeDismissed: boolean;
	// Relationship history settings
	enableRelationshipHistory: boolean;
	historyRetentionDays: number;
	// Export settings
	exportFilenamePattern: string;
	preferredGedcomVersion: '5.5.1' | '7.0';
	// GEDCOM import settings
	/** Compatibility mode for GEDCOM imports (auto-detect and fix vendor-specific issues) */
	gedcomCompatibilityMode: GedcomCompatibilityMode;
	lastGedcomExport?: LastExportInfo;
	lastGedcomXExport?: LastExportInfo;
	lastGrampsExport?: LastExportInfo;
	lastCsvExport?: LastExportInfo;
	lastFamilyChartExport?: LastFamilyChartExportSettings;
	// Family Chart custom colors
	familyChartColors?: FamilyChartColors;
	// Folder filtering
	folderFilterMode: FolderFilterMode;
	excludedFolders: string[];
	includedFolders: string[];
	// Staging folder
	stagingFolder: string;
	enableStagingIsolation: boolean;
	// Template folder filtering
	/** Auto-detect template folders from Templates/Templater/QuickAdd plugins */
	autoDetectTemplateFolders: boolean;
	/** Additional folders to treat as template folders (excluded from note discovery) */
	templateFolders: string[];
	// Place category defaults
	defaultPlaceCategory: PlaceCategory;
	placeCategoryRules: PlaceCategoryRule[];
	// Default universe applied to new applicable notes when none is specified (#751).
	// Empty string means no default.
	defaultUniverse: string;
	// Place category → folder mapping (#163)
	/** Automatically organize places into subfolders based on their category */
	useCategorySubfolders: boolean;
	/** Custom category → folder mappings (overrides automatic subfolder naming) */
	placeCategoryFolderRules: PlaceCategoryFolderRule[];
	// Place type management
	customPlaceTypes: PlaceTypeDefinition[];
	showBuiltInPlaceTypes: boolean;
	/** Customizations for built-in place types (overrides name, description) */
	placeTypeCustomizations: Record<string, Partial<PlaceTypeDefinition>>;
	/** Hidden place types (won't appear in dropdowns, but existing notes still work) */
	hiddenPlaceTypes: string[];
	/** User-defined place type categories */
	customPlaceTypeCategories: PlaceTypeCategoryDefinition[];
	/** Customizations for built-in place type categories (name overrides) */
	placeTypeCategoryCustomizations: Record<string, Partial<PlaceTypeCategoryDefinition>>;
	/** Hidden/deleted built-in place type category IDs */
	hiddenPlaceTypeCategories: string[];
	/** Accept DMS coordinate format in place creation modal */
	enableDMSCoordinates: boolean;
	// Place lookup settings (#218)
	/** GeoNames username for API access (free registration at geonames.org) */
	geonamesUsername: string;
	/** Heat map intensity level for the map view */
	heatMapIntensity: 'low' | 'medium' | 'high';
	/** Customizable heat map intensity presets (radius multiplier, blur multiplier, minimum opacity) */
	heatMapPresets: {
		low: { radius: number; blur: number; opacity: number };
		medium: { radius: number; blur: number; opacity: number };
		high: { radius: number; blur: number; opacity: number };
	};
	/** Outline color around map path labels for legibility on colorful or dark backgrounds */
	pathLabelStroke: 'none' | 'white' | 'black';
	// Custom relationship types
	customRelationshipTypes: RelationshipTypeDefinition[];
	showBuiltInRelationshipTypes: boolean;
	/** Customizations for built-in relationship types (overrides name, color, lineStyle) */
	relationshipTypeCustomizations: Record<string, Partial<RelationshipTypeDefinition>>;
	/** Hidden relationship types (won't appear in dropdowns, but existing notes still work) */
	hiddenRelationshipTypes: string[];
	/** User-defined relationship categories */
	customRelationshipCategories: RelationshipCategoryDefinition[];
	/** Customizations for built-in relationship categories (name overrides) */
	relationshipCategoryCustomizations: Record<string, Partial<RelationshipCategoryDefinition>>;
	/** Hidden/deleted built-in relationship category IDs */
	hiddenRelationshipCategories: string[];
	/** Max generation depth for relationship calculator (0 = unlimited) */
	relationshipMaxDepth: number;
	// Fictional date systems
	enableFictionalDates: boolean;
	fictionalDateSystems: FictionalDateSystem[];
	showBuiltInDateSystems: boolean;
	// Universe settings
	universesFolder: string;
	// Organization settings
	organizationsFolder: string;
	customOrganizationTypes: OrganizationTypeDefinition[];
	showBuiltInOrganizationTypes: boolean;
	/** Customizations for built-in organization types (overrides name, icon, color) */
	organizationTypeCustomizations: Record<string, Partial<OrganizationTypeDefinition>>;
	/** Hidden organization types (won't appear in dropdowns, but existing notes still work) */
	hiddenOrganizationTypes: string[];
	/** User-defined organization categories */
	customOrganizationCategories: OrganizationCategoryDefinition[];
	/** Customizations for built-in organization categories (name overrides) */
	organizationCategoryCustomizations: Record<string, Partial<OrganizationCategoryDefinition>>;
	/** Hidden/deleted built-in organization category IDs */
	hiddenOrganizationCategories: string[];
	// Source management settings
	sourcesFolder: string;
	// Notes folder (for separate note files - Phase 4 Gramps integration)
	notesFolder: string;
	// Bases folder
	basesFolder: string;
	defaultCitationFormat: CitationFormat;
	showSourceThumbnails: boolean;
	thumbnailSize: 'small' | 'medium' | 'large';
	customSourceTypes: SourceTypeDefinition[];
	showBuiltInSourceTypes: boolean;
	/** Customizations for built-in source types (overrides name, icon, color) */
	sourceTypeCustomizations: Record<string, Partial<SourceTypeDefinition>>;
	/** Hidden source types (won't appear in dropdowns, but existing notes still work) */
	hiddenSourceTypes: string[];
	/** User-defined source categories */
	customSourceCategories: SourceCategoryDefinition[];
	/** Customizations for built-in source categories (name overrides) */
	sourceCategoryCustomizations: Record<string, Partial<SourceCategoryDefinition>>;
	/** Hidden/deleted built-in source category IDs */
	hiddenSourceCategories: string[];
	// Source indicators on tree nodes
	showSourceIndicators: boolean;
	// Evidence visualization settings (Research tools - opt-in)
	trackFactSourcing: boolean;
	factCoverageThreshold: number;
	showResearchGapsInStatus: boolean;
	// Property aliases for custom frontmatter names
	propertyAliases: Record<string, string>;
	// Value aliases for custom property values
	valueAliases: ValueAliasSettings;
	// Event management settings
	eventsFolder: string;
	timelinesFolder: string;
	customEventTypes: EventTypeDefinition[];
	showBuiltInEventTypes: boolean;
	/** Customizations for built-in event types (overrides name, icon, color) */
	eventTypeCustomizations: Record<string, Partial<EventTypeDefinition>>;
	/** Hidden event types (won't appear in dropdowns, but existing notes still work) */
	hiddenEventTypes: string[];
	/** User-defined event categories */
	customEventCategories: EventCategoryDefinition[];
	/** Customizations for built-in categories (name overrides) */
	categoryCustomizations: Record<string, Partial<EventCategoryDefinition>>;
	/** Hidden/deleted built-in category IDs */
	hiddenCategories: string[];
	/** Event icon display mode for visual views (timelines, canvas, maps) */
	eventIconMode: EventIconMode;
	// Note type detection settings
	noteTypeDetection: NoteTypeDetectionSettings;
	// Date validation settings
	dateFormatStandard: 'iso8601' | 'gedcom' | 'flexible';
	allowPartialDates: boolean;
	allowCircaDates: boolean;
	allowDateRanges: boolean;
	requireLeadingZeros: boolean;
	// Calendarium integration
	calendariumIntegration: CalendariumIntegrationMode;
	/** Show Calendarium dates (fc-date, fc-end) on timelines */
	syncCalendariumEvents: boolean;
	// Citations settings
	citationsFolder: string;
	// Reports settings
	reportsFolder: string;
	// Sex value normalization
	sexNormalizationMode: SexNormalizationMode;
	// Dashboard settings
	dashboardVaultHealthCollapsed: boolean;
	/** Recent files accessed via CR features (max 5) */
	dashboardRecentFiles: RecentFileEntry[];
	/** Whether the user has seen the Dashboard first-run notice */
	dashboardFirstVisitDone: boolean;
	// Media folder filtering
	/** Folders to scan for media files (used by Find Unlinked, Media Manager stats, Media Picker) */
	mediaFolders: string[];
	/** Whether to limit media scanning to specified folders */
	enableMediaFolderFilter: boolean;
	// Gramps import settings
	/** Preserve subfolder structure when extracting media from .gpkg files */
	preserveMediaFolderStructure: boolean;
	// Dynamic content settings
	/** Default historical context note for timelines (wikilink path) */
	defaultTimelineContext: string;
	/** Lifespan margin for filtering context events (0 = no filtering) */
	contextLifespanMargin: number;
	/** Timeline layout mode: chronological, grouped, or personal-first */
	timelineLayout: 'chronological' | 'grouped' | 'personal-first';
	/** Append the immediate parent location to timeline places ("London, England"); per-block place_context overrides */
	timelineShowPlaceContext: boolean;
	/** How many ancestor levels to append when place context is shown (1 = immediate parent; 0 = full hierarchy); per-block place_context can override */
	timelinePlaceContextDepth: number;
	/** Default timeline template note (wikilink path) */
	defaultTimelineTemplate: string;
	// Timeline label customization
	/** Label for birth events */
	timelineBirthLabel: string;
	/** Label for death events */
	timelineDeathLabel: string;
	/** Label for children's birth events ({name} placeholder) */
	timelineChildBirthLabel: string;
	/** Label for spouse death events ({name} placeholder) */
	timelineSpouseDeathLabel: string;
	/** Label for parent death events ({name} placeholder) */
	timelineParentDeathLabel: string;
	/** Label for sibling birth events ({name} placeholder) */
	timelineSiblingBirthLabel: string;
	/** Label for child death events ({name} placeholder) */
	timelineChildDeathLabel: string;
	/** Label for stepparent death events ({name} placeholder) */
	timelineStepparentDeathLabel: string;
	/** Label for sibling death events ({name} placeholder) */
	timelineSiblingDeathLabel: string;
	/** Label for grandchild birth events ({name} placeholder) */
	timelineGrandchildBirthLabel: string;
	/** Label for adopted sibling birth events ({name} placeholder); gated alongside the regular adopted-children-births toggle (#618) */
	timelineAdoptedSiblingBirthLabel: string;
	/** Label for adopted grandchild birth events ({name} placeholder); gated alongside the regular adopted-children-births toggle (#618) */
	timelineAdoptedGrandchildBirthLabel: string;
	/** Label for adopted sibling adoption events ({name} placeholder); gated on the adopted-children-births toggle (#621) */
	timelineAdoptedSiblingAdoptionLabel: string;
	/** Label for adopted grandchild adoption events ({name} placeholder); gated on the adopted-children-births toggle (#621) */
	timelineAdoptedGrandchildAdoptionLabel: string;
	/** Label for child marriage events ({name} for child, {spouse} for their spouse) */
	timelineChildMarriageLabel: string;
	/** Label for parent marriage events ({name} for parent, {spouse} for their spouse) */
	timelineParentMarriageLabel: string;
	/** Label for sibling marriage events ({name} for sibling, {spouse} for their spouse) */
	timelineSiblingMarriageLabel: string;
	// Family events on timelines
	/** Show children's births on timelines */
	timelineShowChildrenBirths: boolean;
	/** Show spouse deaths on timelines */
	timelineShowSpouseDeaths: boolean;
	/** Show parents' deaths on timelines */
	timelineShowParentDeaths: boolean;
	/** Show siblings' births on timelines */
	timelineShowSiblingBirths: boolean;
	/** Show divorces on timelines (#399) */
	timelineShowDivorces: boolean;
	/** Show adopted children's births on adoptive parents' timelines (#396 follow-up) */
	timelineShowAdoptedChildrenBirths: boolean;
	/** Show children's deaths on parents' timelines (#582) */
	timelineShowChildrenDeaths: boolean;
	/** Show stepparents' deaths on stepchildren's timelines (#583) */
	timelineShowStepparentDeaths: boolean;
	/** Show siblings' deaths on the person's timeline (#584) */
	timelineShowSiblingDeaths: boolean;
	/** Show grandchildren's births on grandparents' timelines (#585) */
	timelineShowGrandchildrenBirths: boolean;
	/** Show children's marriages on parents' timelines (#607) */
	timelineShowChildrenMarriages: boolean;
	/** Show parents' marriages on the child's timeline (#608) */
	timelineShowParentMarriages: boolean;
	/** Show siblings' marriages on the person's timeline (#661) */
	timelineShowSiblingMarriages: boolean;
	/** Callout type for frozen media galleries (info, note, etc.) */
	frozenGalleryCalloutType: string;
	// Cleanup wizard state (for resuming interrupted wizards)
	/** Persisted state of the cleanup wizard, if any */
	cleanupWizardState?: CleanupWizardPersistedState;
	/**
	 * Person pairs the user marked "not a duplicate" in the duplicate-detection
	 * modal, so they stay dismissed across sessions and rescans (#633). Each
	 * entry is a sorted `crIdA::crIdB` key (see dismissedDuplicatePairKey).
	 */
	dismissedDuplicatePairs: string[];
	// Create entity modal state (for resuming interrupted creation)
	/** Persisted state for create person modal */
	createPersonModalState?: CreateEntityPersistedState;
	/** Persisted state for create place modal */
	createPlaceModalState?: CreateEntityPersistedState;
	/** Persisted state for create event modal */
	createEventModalState?: CreateEntityPersistedState;
	/** Persisted state for create organization modal */
	createOrganizationModalState?: CreateEntityPersistedState;
	/** Persisted state for create source modal */
	createSourceModalState?: CreateEntityPersistedState;
	/** Persisted state for create note modal */
	createNoteModalState?: CreateEntityPersistedState;
	/** Persisted state for family wizard modal */
	familyWizardModalState?: CreateEntityPersistedState;
	/** Persisted state for map wizard modal */
	mapWizardModalState?: CreateEntityPersistedState;
	// Version tracking (for migration notices)
	/** Last plugin version the user has acknowledged (for showing upgrade notices) */
	lastSeenVersion?: string;
	/**
	 * Tracks completion of individual v0.18.9 nested property migrations.
	 * Migration notice remains visible until all applicable migrations are complete.
	 */
	nestedPropertiesMigration?: {
		/** True when sourced_facts → sourced_* migration is complete */
		sourcedFactsComplete?: boolean;
		/** True when events → event note files migration is complete */
		eventsComplete?: boolean;
	};
	/**
	 * True once the one-time #691 flip of a persisted `eventIconMode: 'text'`
	 * to `'both'` has run. Guards the migration so a user who deliberately
	 * re-selects `text` afterward keeps it (a version check can't, because
	 * `lastSeenVersion` doesn't advance on normal loads).
	 */
	eventIconModeMigratedToBoth?: boolean;
	// Inclusive parent relationships (opt-in feature)
	/** Enable gender-neutral parent relationships */
	enableInclusiveParents: boolean;
	/** Label for gender-neutral parent field (e.g., "Parents", "Guardians", "Progenitors") */
	parentFieldLabel: string;
	// DNA match tracking (opt-in feature)
	/** Enable DNA match tracking features (person subtype, relationship type, UI fields) */
	enableDnaTracking: boolean;
	// Plugin rename migration (Charted Roots → Charted Roots)
	/**
	 * True when migration from Charted Roots to Charted Roots is complete.
	 * Migration updates canvas metadata and code block types in vault files.
	 */
	migratedToChartedRoots?: boolean;

	/**
	 * True when the one-shot `collection_name` -> `group_name` frontmatter
	 * migration has completed. Once set, the migration scan short-circuits
	 * on subsequent plugin loads so we don't iterate every markdown file
	 * forever after the work is already done.
	 */
	migratedCollectionNameToGroupName?: boolean;
}

/**
 * Persisted state for the cleanup wizard
 * Used to resume an interrupted cleanup session
 */
export interface CleanupWizardPersistedState {
	/** Current step number (1-10) */
	currentStep: number;
	/** Status and fix count for each step (keyed by step number) */
	steps: Record<number, {
		status: 'pending' | 'in_progress' | 'complete' | 'skipped';
		issueCount: number;
		fixCount: number;
		skippedReason?: string;
	}>;
	/** When the state was saved */
	savedAt: number;
	/** Step completion tracking for dependency checks (keyed by step ID) */
	stepCompletion?: Record<string, {
		/** Whether this step was explicitly completed (not just skipped) */
		completed: boolean;
		/** Timestamp when completed */
		completedAt: number;
		/** Number of issues fixed in this step */
		issuesFixed: number;
	}>;
}

/**
 * Persisted state for create entity modals
 * Used to resume interrupted entity creation (person, place, event, etc.)
 */
export interface CreateEntityPersistedState {
	/** Modal type identifier */
	modalType: 'person' | 'place' | 'event' | 'organization' | 'source' | 'note' | 'family-wizard' | 'map-wizard';
	/** Form data as key-value pairs */
	formData: Record<string, unknown>;
	/** When the state was saved */
	savedAt: number;
}

/**
 * Settings for note type detection
 * Supports multiple detection methods to avoid conflicts with other plugins
 */
export interface NoteTypeDetectionSettings {
	/**
	 * Enable tag-based detection (#person, #place, etc.)
	 * When enabled, tags are checked as a fallback after property-based detection
	 */
	enableTagDetection: boolean;

	/**
	 * Primary property to check for type
	 * - 'cr_type': Use cr_type property (recommended, avoids conflicts)
	 * - 'type': Use type property (legacy default)
	 */
	primaryTypeProperty: 'cr_type' | 'type';
}

/**
 * Value alias settings structure
 * Maps user values to canonical values for each supported field type
 */
export interface ValueAliasSettings {
	eventType: Record<string, string>;        // userValue → canonicalEventType
	sex: Record<string, string>;              // userValue → canonicalSex (GEDCOM aligned)
	gender_identity: Record<string, string>;  // userValue → canonicalGenderIdentity
	placeCategory: Record<string, string>;    // userValue → canonicalPlaceCategory
	noteType: Record<string, string>;         // userValue → canonicalNoteType (cr_type/type)
}

/**
 * Rule for setting default place category based on folder or collection
 */
export interface PlaceCategoryRule {
	type: 'folder' | 'collection';
	pattern: string;  // Folder path or collection name
	category: PlaceCategory;
}

/**
 * Rule for mapping place category to a specific subfolder (category → folder)
 * This is the reverse of PlaceCategoryRule (folder → category)
 */
export interface PlaceCategoryFolderRule {
	category: PlaceCategory;
	folder: string;  // Relative path from placesFolder (e.g., "Fantasy/Fictional")
}

/**
 * Place categories (duplicated from models/place.ts to avoid circular imports)
 */
export type PlaceCategory = 'real' | 'historical' | 'disputed' | 'legendary' | 'mythological' | 'fictional';

/**
 * Get the default place category based on folder path and/or collection name.
 * Rules are checked in order:
 * 1. Collection-based rules (if collection is provided)
 * 2. Folder-based rules (if folder is provided)
 * 3. Global default
 */
export function getDefaultPlaceCategory(
	settings: CanvasRootsSettings,
	options?: { folder?: string; collection?: string }
): PlaceCategory {
	const { folder, collection } = options || {};

	// Check rules in order
	for (const rule of settings.placeCategoryRules) {
		if (rule.type === 'collection' && collection) {
			// Exact match for collection
			if (rule.pattern.toLowerCase() === collection.toLowerCase()) {
				return rule.category;
			}
		} else if (rule.type === 'folder' && folder) {
			// Path prefix match for folders
			const normalizedFolder = folder.toLowerCase().replace(/\\/g, '/');
			const normalizedPattern = rule.pattern.toLowerCase().replace(/\\/g, '/');
			if (normalizedFolder.startsWith(normalizedPattern) ||
				normalizedFolder === normalizedPattern) {
				return rule.category;
			}
		}
	}

	// Fall back to global default
	return settings.defaultPlaceCategory;
}

/**
 * Get the default universe to apply to a new applicable note (person, place,
 * event, organization), or undefined when none is configured (#751). Trimmed so
 * a stray-whitespace setting reads as "no default".
 */
export function getDefaultUniverse(settings: CanvasRootsSettings | undefined): string | undefined {
	const value = settings?.defaultUniverse?.trim();
	return value ? value : undefined;
}

/**
 * Get the folder path for a place based on its category (#163)
 * Priority:
 * 1. Check for explicit category → folder rule
 * 2. If useCategorySubfolders enabled and not default category, use automatic subfolder
 * 3. Fall back to base placesFolder
 *
 * @param settings - Plugin settings
 * @param category - Place category
 * @returns Full folder path (e.g., "Charted Roots/Places/Historical")
 */
export function getPlaceFolderForCategory(
	settings: CanvasRootsSettings,
	category: PlaceCategory
): string {
	const baseFolder = settings.placesFolder || 'Charted Roots/Places';
	const defaultCategory = settings.defaultPlaceCategory || 'real';

	// Check for explicit rule first
	const rule = settings.placeCategoryFolderRules?.find(r => r.category === category);
	if (rule) {
		// Normalize path separators
		const subfolder = rule.folder.replace(/\\/g, '/');
		return `${baseFolder}/${subfolder}`.replace(/\/+/g, '/');
	}

	// Fall back to automatic subfolder if enabled and not default category
	if (settings.useCategorySubfolders && category !== defaultCategory) {
		// Capitalize first letter: historical → Historical
		const subfolder = capitalize(category);
		return `${baseFolder}/${subfolder}`;
	}

	// Fall back to base folder
	return baseFolder;
}

export const DEFAULT_SETTINGS: CanvasRootsSettings = {
	dismissedDuplicatePairs: [],
	defaultNodeWidth: 200,
	defaultNodeHeight: 100,
	// Spacing values optimized for family-chart layout engine with 1.5x multiplier
	// family-chart-layout.ts applies 1.5x multiplier: 400 * 1.5 = 600px effective horizontal spacing
	horizontalSpacing: 400,  // Base horizontal spacing (multiplied by 1.5x in layout engine)
	verticalSpacing: 250,    // Vertical spacing between generations (used directly)
	autoGenerateCrId: true,
	peopleFolder: 'Charted Roots/People',
	placesFolder: 'Charted Roots/Places',
	mapsFolder: 'Charted Roots/Places/Maps',
	schemasFolder: 'Charted Roots/Schemas',
	canvasesFolder: 'Charted Roots/Canvases',
	logExportPath: '.charted-roots/logs',
	logLevel: 'debug',
	obfuscateLogExports: true,  // Secure by default - protect PII in log exports
	recentTrees: [],
	recentImports: [],
	// Arrow styling defaults
	parentChildArrowStyle: 'directed',  // Parent → Child with single arrow
	spouseArrowStyle: 'undirected',     // Spouse — Spouse with no arrows (cleaner look)
	// Node coloring default
	nodeColorScheme: 'sex',             // Sex-based coloring (GEDCOM aligned)
	// Canvas grouping default
	canvasGroupingStrategy: 'none',     // No groups by default (current behavior)
	// Edge coloring defaults (neutral/subtle)
	parentChildEdgeColor: 'none',       // No color - use theme default (clean, subtle)
	spouseEdgeColor: 'none',            // No color - use theme default (clean, subtle)
	// Marriage metadata display defaults
	showSpouseEdges: false,             // Default: OFF (clean look, no spouse edges)
	spouseEdgeLabelFormat: 'date-only', // When enabled, show just marriage date
	showMarriageType: true,             // Default: ON - show marriage type where populated (#628)
	// Bidirectional relationship sync defaults
	enableBidirectionalSync: true,      // Default: ON - automatically sync relationships
	syncOnFileModify: true,             // Default: ON - sync when files are modified
	// Layout algorithm default
	defaultLayoutType: 'standard',      // Default: standard family-chart layout
	// Privacy settings defaults
	enablePrivacyProtection: false,     // Default: OFF - user must opt-in to privacy protection
	livingPersonAgeThreshold: 100,      // Assume alive if born within last 100 years with no death date
	privacyDisplayFormat: 'living',     // Show "Living" for protected persons
	hideDetailsForLiving: true,         // Hide birth dates and places for living persons
	showPronouns: true,                 // Show pronouns in person picker and displays
	romanticRelationshipLabel: 'spouse', // UI label for romantic relationships (spouse/partner)
	privacyNoticeDismissed: false,      // Show privacy notice after first import with living persons
	// Relationship history defaults
	enableRelationshipHistory: true,    // Default: ON - track relationship changes
	historyRetentionDays: 30,           // Keep history for 30 days by default
	// Export defaults
	exportFilenamePattern: '{name}-family-chart-{date}',  // Pattern with {name} and {date} placeholders
	preferredGedcomVersion: '5.5.1',  // Default to 5.5.1 for maximum compatibility
	// GEDCOM import defaults
	gedcomCompatibilityMode: 'auto',  // Auto-detect MyHeritage and apply fixes
	// Folder filtering defaults
	folderFilterMode: 'disabled',  // Default: scan all folders (preserves existing behavior)
	excludedFolders: [],           // No folders excluded by default
	includedFolders: [],           // No inclusion filter by default
	// Staging folder defaults
	stagingFolder: '',             // Empty = no staging configured (must be set by user)
	enableStagingIsolation: true,  // When staging folder is set, auto-exclude from normal operations
	// Template folder filtering defaults
	autoDetectTemplateFolders: true,  // Auto-detect from Templates/Templater/QuickAdd plugins
	templateFolders: [],              // Additional user-specified template folders
	// Place category defaults
	defaultPlaceCategory: 'real',  // Default place category when creating new places
	placeCategoryRules: [],        // Folder/collection-based category rules
	defaultUniverse: '',           // Default universe for new applicable notes (#751); '' = none
	// Place category → folder mapping (#163)
	useCategorySubfolders: false,  // Default false for existing vaults (set true on new installs via migration check)
	placeCategoryFolderRules: [],  // Custom category → folder mappings (empty = use automatic naming)
	// Place type management
	customPlaceTypes: [],                    // User-defined place types (built-ins are always available)
	showBuiltInPlaceTypes: true,             // Whether to show built-in place types in UI
	placeTypeCustomizations: {},             // Overrides for built-in place types
	hiddenPlaceTypes: [],                    // Place types hidden from dropdowns
	customPlaceTypeCategories: [],           // User-defined place type categories
	placeTypeCategoryCustomizations: {},     // Overrides for built-in place type category names
	hiddenPlaceTypeCategories: [],           // Hidden/deleted built-in place type categories
	enableDMSCoordinates: false,             // Opt-in: accept DMS coordinate format
	// Place lookup settings (#218)
	geonamesUsername: '',                    // GeoNames username (required for GeoNames API)
	heatMapIntensity: 'medium' as const,    // Heat map intensity: low, medium, high
	heatMapPresets: {
		low: { radius: 0.55, blur: 1.2, opacity: 0.1 },
		medium: { radius: 0.7, blur: 1.0, opacity: 0.12 },
		high: { radius: 0.9, blur: 0.7, opacity: 0.18 },
	},
	pathLabelStroke: 'none' as const,        // Map path label outline (none / white / black)
	// Custom relationship types
	customRelationshipTypes: [],   // User-defined relationship types (built-ins are always available)
	showBuiltInRelationshipTypes: true,  // Whether to show built-in types in UI
	relationshipMaxDepth: 10,            // Default: 10 generations (0 = unlimited)
	relationshipTypeCustomizations: {},  // Overrides for built-in relationship types
	hiddenRelationshipTypes: [],         // Relationship types hidden from dropdowns
	customRelationshipCategories: [],    // User-defined relationship categories
	relationshipCategoryCustomizations: {}, // Overrides for built-in relationship category names
	hiddenRelationshipCategories: [],    // Hidden/deleted built-in relationship categories
	// Fictional date systems
	enableFictionalDates: true,    // Enable fictional date parsing and display
	fictionalDateSystems: [],      // User-defined date systems (built-ins are always available)
	showBuiltInDateSystems: true,  // Whether to show built-in date systems (Middle-earth, Westeros, etc.)
	// Universe settings
	universesFolder: 'Charted Roots/Universes',  // Default folder for universe notes
	// Organization settings
	organizationsFolder: 'Charted Roots/Organizations',  // Default folder for organization notes
	customOrganizationTypes: [],   // User-defined organization types (built-ins are always available)
	showBuiltInOrganizationTypes: true,  // Whether to show built-in organization types in UI
	organizationTypeCustomizations: {},  // Overrides for built-in organization types
	hiddenOrganizationTypes: [],         // Organization types hidden from dropdowns
	customOrganizationCategories: [],    // User-defined organization categories
	organizationCategoryCustomizations: {}, // Overrides for built-in organization category names
	hiddenOrganizationCategories: [],    // Hidden/deleted built-in organization categories
	// Source management settings
	sourcesFolder: 'Charted Roots/Sources',  // Default folder for source notes
	// Notes folder (for separate note files - Phase 4 Gramps integration)
	notesFolder: 'Charted Roots/Notes',      // Default folder for note entity files
	// Bases folder
	basesFolder: 'Charted Roots/Bases',      // Default folder for base files
	defaultCitationFormat: 'evidence_explained',  // Evidence Explained is the genealogy standard
	showSourceThumbnails: true,   // Show media previews in gallery
	thumbnailSize: 'medium',      // Thumbnail size (small/medium/large)
	customSourceTypes: [],        // User-defined source types (built-ins are always available)
	showBuiltInSourceTypes: true, // Whether to show built-in source types in UI
	sourceTypeCustomizations: {}, // Overrides for built-in source types
	hiddenSourceTypes: [],        // Source types hidden from dropdowns
	customSourceCategories: [],   // User-defined source categories
	sourceCategoryCustomizations: {}, // Overrides for built-in source category names
	hiddenSourceCategories: [],   // Hidden/deleted built-in source categories
	// Source indicators on tree nodes
	showSourceIndicators: false,   // Default OFF - users opt-in to this feature
	// Evidence visualization settings (Research tools)
	trackFactSourcing: true,       // Default ON (#511) - surfaces the Edit Person fact-level citations section without requiring users to hunt for the toggle
	factCoverageThreshold: 6,      // Number of facts for 100% coverage calculation
	showResearchGapsInStatus: true, // Show research gap summary when tracking is enabled
	// Property aliases for custom frontmatter names
	propertyAliases: {},           // Maps user property name → Charted Roots canonical name
	// Value aliases for custom property values
	valueAliases: {
		eventType: {},             // Maps user event type → canonical event type
		sex: {},                   // Maps user sex value → canonical sex (GEDCOM aligned)
		gender_identity: {},       // Maps user gender_identity value → canonical gender identity
		placeCategory: {},         // Maps user place category → canonical place category
		noteType: {}               // Maps user note type (cr_type/type) → canonical note type
	},
	// Event management settings
	eventsFolder: 'Charted Roots/Events',      // Default folder for event notes
	timelinesFolder: 'Charted Roots/Timelines', // Default folder for timeline notes
	customEventTypes: [],                      // User-defined event types (built-ins are always available)
	showBuiltInEventTypes: true,               // Whether to show built-in event types in UI
	eventTypeCustomizations: {},               // Overrides for built-in event types
	hiddenEventTypes: [],                      // Event types hidden from dropdowns
	customEventCategories: [],                 // User-defined event categories
	categoryCustomizations: {},                // Overrides for built-in category names
	hiddenCategories: [],                      // Hidden/deleted built-in categories
	eventIconMode: 'both',                     // Default: icon + text label on every timeline row (#691)
	// Note type detection settings
	noteTypeDetection: {
		enableTagDetection: true,              // Allow #person, #place, etc. as fallback
		primaryTypeProperty: 'cr_type'         // cr_type recommended to avoid conflicts with other plugins
	},
	// Date validation settings
	dateFormatStandard: 'flexible',            // Most permissive default
	allowPartialDates: true,                   // Allow YYYY-MM or YYYY
	allowCircaDates: true,                     // Allow circa dates (c. 1850, ca. 1920)
	allowDateRanges: true,                     // Allow date ranges (1850-1920)
	requireLeadingZeros: false,                // Don't require YYYY-MM-DD format (allow YYYY-M-D)
	// Calendarium integration
	calendariumIntegration: 'off',             // Default: no integration (invisible to users without Calendarium)
	syncCalendariumEvents: false,              // Default: don't show fc-* dates on timelines
	// Citations settings
	citationsFolder: 'Charted Roots/Citations', // Default folder for citation notes
	// Reports settings
	reportsFolder: 'Charted Roots/Reports',     // Default folder for generated reports
	// Sex value normalization
	sexNormalizationMode: 'standard',          // Default: normalize to GEDCOM M/F
	// Dashboard settings
	dashboardVaultHealthCollapsed: false,      // Default: expanded on first visit
	dashboardRecentFiles: [],                  // Empty by default
	dashboardFirstVisitDone: false,            // Show welcome notice on first visit
	// Media folder filtering
	mediaFolders: [],                          // Empty = no filtering (scan entire vault)
	enableMediaFolderFilter: false,            // Disabled by default for backwards compatibility
	// Gramps import settings
	preserveMediaFolderStructure: false,       // Disabled by default for backwards compatibility
	// Dynamic content settings
	defaultTimelineContext: '',                // No default context note
	contextLifespanMargin: 0,                 // 0 = no filtering (show all context events)
	timelineLayout: 'chronological',          // Default: all events interleaved by date
	timelineShowPlaceContext: false,          // Off by default (don't change existing timeline output)
	timelinePlaceContextDepth: 1,             // Immediate parent only (0 = full hierarchy)
	defaultTimelineTemplate: '',              // No default template
	timelineBirthLabel: '出生',
	timelineDeathLabel: '去世',
	timelineChildBirthLabel: '{name}的出生',
	timelineSpouseDeathLabel: '{name}的去世',
	timelineParentDeathLabel: '{name}的去世',
	timelineSiblingBirthLabel: '{name}的出生',
	timelineChildDeathLabel: '{name}的去世',
	timelineStepparentDeathLabel: '{name}的去世',
	timelineSiblingDeathLabel: '{name}的去世',
	timelineGrandchildBirthLabel: '{name}的出生',
	timelineAdoptedSiblingBirthLabel: '被收养的兄弟姐妹{name}的出生',
	timelineAdoptedGrandchildBirthLabel: '被收养的孙辈{name}的出生',
	timelineAdoptedSiblingAdoptionLabel: '收养{name}',
	timelineAdoptedGrandchildAdoptionLabel: '收养{name}',
	timelineChildMarriageLabel: '{name}与{spouse}的婚姻',
	timelineParentMarriageLabel: '{name}与{spouse}的婚姻',
	timelineSiblingMarriageLabel: '{name}与{spouse}的婚姻',
	timelineShowChildrenBirths: false,        // Off by default
	timelineShowSpouseDeaths: true,           // Default on — major life event for the survivor; toggle lets users hide (#447)
	timelineShowParentDeaths: false,
	timelineShowSiblingBirths: false,
	timelineShowDivorces: true,                // Default on — the subject's own event; toggle lets users hide if preferred (#399)
	timelineShowAdoptedChildrenBirths: false,  // Opt-in: separate toggle from biological children's births (#396)
	timelineShowChildrenDeaths: false,         // Opt-in: death of a child on the parent's timeline (#582)
	timelineShowStepparentDeaths: false,       // Opt-in: stepparent death on stepchild's timeline (#583)
	timelineShowSiblingDeaths: false,          // Opt-in: sibling death on the person's timeline (#584)
	timelineShowGrandchildrenBirths: false,    // Opt-in: grandchild birth on grandparent's timeline (#585)
	timelineShowChildrenMarriages: false,      // Opt-in: child's marriage on parent's timeline (#607)
	timelineShowParentMarriages: false,        // Opt-in: parent's marriage on child's timeline, excluding the bio pairing (#608)
	timelineShowSiblingMarriages: false,       // Opt-in: sibling's marriage on the person's timeline (#661)
	frozenGalleryCalloutType: 'info',          // Callout type for frozen media galleries
	// Inclusive parent relationships (opt-in feature)
	enableInclusiveParents: false,             // Default: OFF - users opt-in to gender-neutral parents
	parentFieldLabel: '父母',               // Default label for gender-neutral parent field
	// DNA match tracking (opt-in feature)
	enableDnaTracking: false                   // Default: OFF - users opt-in to DNA match tracking
};

export class CanvasRootsSettingTab extends PluginSettingTab {
	plugin: CanvasRootsPlugin;

	// Track which sections are open (by section name) to preserve state across re-renders
	private openSections: Set<string> = new Set();
	// Track if this is the first render (to avoid restoring state on initial load)
	private hasRendered = false;
	// On Obsidian 1.13.0+ the declarative getSettingDefinitions() path hosts the
	// whole tab inside a framework-provided container; this points at that host so
	// refreshSettings() re-renders the right element. Null on older app versions,
	// where display() drives the imperative tab against containerEl instead.
	private hostEl: HTMLElement | null = null;

	constructor(app: App, plugin: CanvasRootsPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	/**
	 * Declarative entry point used by Obsidian 1.13.0+. The whole tab is a
	 * heavily-customized, collapsible, searchable UI that doesn't map onto the
	 * framework's per-row control model, so rather than re-express ~100 settings
	 * declaratively (and maintain two divergent copies) this hosts the existing
	 * imperative tab inside the framework-provided group container. The framework
	 * calls getSettingDefinitions() on 1.13.0+ and skips display(); older versions
	 * keep calling display(). Both paths render the same UI via renderSettingsInto().
	 */
	getSettingDefinitions(): SettingDefinitionItem[] {
		const hosted: SettingDefinitionRender = {
			name: '',
			searchable: false,
			render: (setting: Setting) => {
				// Host the imperative collapsible/searchable tab inside this render
				// def's row. Obsidian 1.13.0 also passed a SettingGroup with a
				// `.listEl` as a second arg and we rendered into that, but 1.13.1 no
				// longer provides it for a top-level render def — the access threw
				// (swallowed by the framework) and the whole tab rendered blank.
				// Use only the documented `setting` param: strip the default
				// `.setting-item` row chrome and host our UI in its element.
				const rowEl = setting.settingEl;
				rowEl.removeClass('setting-item');
				rowEl.addClass('cr-settings-host-row');
				rowEl.empty();
				// The framework re-runs render defs on every settings change to
				// re-evaluate predicates. Our hosted UI manages its own refreshes
				// (refreshSettings), so on a framework re-render reuse the already
				// built host — moving the live node preserves open sections, scroll,
				// and focus instead of tearing the whole tab down on each interaction.
				if (this.hostEl && this.hostEl.childElementCount > 0) {
					rowEl.appendChild(this.hostEl);
					return;
				}
				// Render into a dedicated child so refreshSettings() can clear only
				// our content, never the framework's own scaffolding.
				const host = rowEl.createDiv({ cls: 'cr-settings-host' });
				this.hostEl = host;
				this.rerender(host);
			},
		};
		return [hosted];
	}

	display(): void {
		// Obsidian < 1.13.0 entry point (and the 1.13.0 fallback when
		// getSettingDefinitions() returns nothing). Drives the imperative tab.
		this.hostEl = null;
		this.rerender(this.containerEl);
	}

	hide(): void {
		// Drop the host so the next open rebuilds fresh (settings may have changed
		// elsewhere) rather than re-attaching a stale node.
		this.hostEl = null;
		this.hasRendered = false;
		super.hide();
	}

	/**
	 * Re-run an internal refresh (the old imperative refresh point). Targets the
	 * 1.13.0 host container when present, otherwise the imperative containerEl.
	 * Used by conditional toggles and the alias editors to rebuild after a change.
	 */
	private refreshSettings(): void {
		this.rerender(this.hostEl ?? this.containerEl);
	}

	/** Rebuild the full tab into the given container, preserving section open state and scroll. */
	private rerender(container: HTMLElement): void {
		// On 1.13.0 the scrollable element is an ancestor of the host, not the
		// host itself, so resolve the real scroll parent to save/restore against.
		const scrollEl = this.getScrollParent(container);
		const scrollTop = scrollEl ? scrollEl.scrollTop : 0;
		if (this.hasRendered) {
			this.saveOpenSections(container);
		}

		container.empty();
		this.renderSettingsInto(container);

		// Restore section open states and scroll position after re-render
		if (this.hasRendered) {
			this.restoreOpenSections(container);
			// Use requestAnimationFrame to ensure DOM is updated before scrolling
			window.requestAnimationFrame(() => {
				if (scrollEl) scrollEl.scrollTop = scrollTop;
			});
		}
		this.hasRendered = true;
	}

	/** Nearest scrollable ancestor (or the element itself), for scroll preservation across re-renders. */
	private getScrollParent(el: HTMLElement): HTMLElement | null {
		let node: HTMLElement | null = el;
		while (node) {
			if (node.scrollHeight > node.clientHeight) {
				const overflowY = node.ownerDocument.defaultView?.getComputedStyle(node).overflowY ?? '';
				if (overflowY === 'auto' || overflowY === 'scroll') {
					return node;
				}
			}
			node = node.parentElement;
		}
		return el;
	}

	/** Build the search box and all eleven sections into the container. */
	private renderSettingsInto(containerEl: HTMLElement): void {
		// Search box for filtering settings
		const searchContainer = containerEl.createDiv({ cls: 'cr-settings-search' });
		new Setting(searchContainer)
			.setName('搜索设置')
			.addSearch(search => {
				search
					.setPlaceholder('筛选设置…')
					.onChange((query) => {
						this.filterSettings(containerEl, query);
					});
			});

		this.renderFoldersSection(containerEl);
		this.renderDataSection(containerEl);
		this.renderPrivacySection(containerEl);
		this.renderCanvasSection(containerEl);
		this.renderDatesSection(containerEl);
		this.renderTimelineSection(containerEl);
		this.renderSexSection(containerEl);
		this.renderPlacesSection(containerEl);
		this.renderResearchSection(containerEl);
		this.renderAliasesSection(containerEl);
		this.renderAdvancedSection(containerEl);
	}

	private renderFoldersSection(containerEl: HTMLElement): void {
		// ═══════════════════════════════════════════════════════════════════════
		// SECTION 1: FOLDERS
		// ═══════════════════════════════════════════════════════════════════════
		const foldersDetails = containerEl.createEl('details', { cls: 'cr-settings-section' });
		foldersDetails.dataset.sectionName = 'folders';
		const foldersSummary = foldersDetails.createEl('summary');
		foldersSummary.createSpan({ text: '文件夹' });
		foldersSummary.createSpan({ cls: 'cr-section-desc', text: 'Charted Roots 存储和查找笔记的位置' });
		const foldersContent = foldersDetails.createDiv({ cls: 'cr-section-content' });

		// Folder explanation
		const folderExplanation = foldersContent.createDiv({ cls: 'setting-item-description cr-info-box' });
		folderExplanation.appendText('这些文件夹决定新笔记的创建位置。Charted Roots 通过属性（cr_type）而非位置识别笔记——你的笔记可以放在库中的任何位置。');

		// --- Entity folders subsection ---
		new Setting(foldersContent).setName("实体文件夹").setHeading();

		this.createFolderSetting(foldersContent, '人物文件夹', '人物笔记的默认文件夹', 'Charted Roots/People',
			() => this.plugin.settings.peopleFolder, (v) => { this.plugin.settings.peopleFolder = v; });

		this.createFolderSetting(foldersContent, '地点文件夹', '地点笔记的默认文件夹', 'Charted Roots/Places',
			() => this.plugin.settings.placesFolder, (v) => { this.plugin.settings.placesFolder = v; });

		this.createFolderSetting(foldersContent, '事件文件夹', '事件笔记的默认文件夹', 'Charted Roots/Events',
			() => this.plugin.settings.eventsFolder, (v) => { this.plugin.settings.eventsFolder = v; });

		this.createFolderSetting(foldersContent, '来源文件夹', '来源笔记的默认文件夹', 'Charted Roots/Sources',
			() => this.plugin.settings.sourcesFolder, (v) => { this.plugin.settings.sourcesFolder = v; });

		this.createFolderSetting(foldersContent, '引文文件夹', '引文笔记的默认文件夹', 'Charted Roots/Citations',
			() => this.plugin.settings.citationsFolder, (v) => { this.plugin.settings.citationsFolder = v; });

		this.createFolderSetting(foldersContent, '组织文件夹', '组织笔记的默认文件夹', 'Charted Roots/Organizations',
			() => this.plugin.settings.organizationsFolder, (v) => { this.plugin.settings.organizationsFolder = v; });

		this.createFolderSetting(foldersContent, '宇宙文件夹', '宇宙笔记的默认文件夹（虚构世界）', 'Charted Roots/Universes',
			() => this.plugin.settings.universesFolder, (v) => { this.plugin.settings.universesFolder = v; });

		// --- Output folders subsection ---
		new Setting(foldersContent).setName("输出文件夹").setHeading();

		this.createFolderSetting(foldersContent, '画布文件夹', '生成的画布文件的默认文件夹', 'Charted Roots/Canvases',
			() => this.plugin.settings.canvasesFolder, (v) => { this.plugin.settings.canvasesFolder = v; });

		this.createFolderSetting(foldersContent, '地图文件夹', '地图笔记的默认文件夹', 'Charted Roots/Places/Maps',
			() => this.plugin.settings.mapsFolder, (v) => { this.plugin.settings.mapsFolder = v; });

		this.createFolderSetting(foldersContent, '时间轴文件夹', '时间轴笔记的默认文件夹', 'Charted Roots/Timelines',
			() => this.plugin.settings.timelinesFolder, (v) => { this.plugin.settings.timelinesFolder = v; });

		this.createFolderSetting(foldersContent, '报告文件夹', '生成的报告的默认文件夹', 'Charted Roots/Reports',
			() => this.plugin.settings.reportsFolder, (v) => { this.plugin.settings.reportsFolder = v; });

		this.createFolderSetting(foldersContent, 'Bases 文件夹', 'Obsidian Bases 文件的默认文件夹', 'Charted Roots/Bases',
			() => this.plugin.settings.basesFolder, (v) => { this.plugin.settings.basesFolder = v; });

		// --- Media folder filtering subsection ---
		new Setting(foldersContent).setName("媒体文件夹筛选").setHeading();

		foldersContent.createEl('p', {
			cls: 'setting-item-description',
			text: '将媒体发现限制在特定文件夹。这会影响“查找未链接”、媒体管理器统计和媒体选择器——但不会影响已链接的媒体或浏览图库。'
		});

		new Setting(foldersContent)
			.setName('将媒体扫描限制在指定文件夹')
			.setDesc('启用后，仅扫描下方列出的文件夹中的媒体文件')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableMediaFolderFilter)
				.onChange(async (value) => {
					this.plugin.settings.enableMediaFolderFilter = value;
					await this.plugin.saveSettings();
				}));

		// Media folders list with drag-and-drop
		const mediaFoldersContainer = foldersContent.createDiv({ cls: 'cr-media-folders-list' });
		this.renderMediaFoldersList(mediaFoldersContainer);

		// Note about advanced settings
		const advancedNote = foldersContent.createDiv({ cls: 'cr-info-box cr-info-box--muted' });
		const advancedIcon = advancedNote.createSpan({ cls: 'cr-info-box-icon' });
		setIcon(advancedIcon, 'settings');
		advancedNote.createSpan({
			text: '有关文件夹筛选选项（在发现中包括/排除文件夹），请参阅下方的“高级”。'
		});

		// --- System folders subsection ---
		new Setting(foldersContent).setName("系统文件夹").setHeading();

		this.createFolderSetting(foldersContent, 'Schema 文件夹', '验证 schema 的默认文件夹', 'Charted Roots/Schemas',
			() => this.plugin.settings.schemasFolder, (v) => { this.plugin.settings.schemasFolder = v; });

		this.createFolderSetting(foldersContent, '暂存文件夹', '导入暂存用的文件夹（与主库隔离）', 'Charted Roots/Staging',
			() => this.plugin.settings.stagingFolder, (v) => { this.plugin.settings.stagingFolder = v; });

		this.createFolderSetting(foldersContent, '日志导出文件夹', '导出日志文件的库文件夹', '.charted-roots/logs',
			() => this.plugin.settings.logExportPath, (v) => { this.plugin.settings.logExportPath = v; });
	}

	private renderDataSection(containerEl: HTMLElement): void {
		// ═══════════════════════════════════════════════════════════════════════
		// SECTION 2: DATA & DETECTION
		// ═══════════════════════════════════════════════════════════════════════
		const dataDetails = containerEl.createEl('details', { cls: 'cr-settings-section' });
		dataDetails.dataset.sectionName = 'data';
		const dataSummary = dataDetails.createEl('summary');
		dataSummary.createSpan({ text: '数据与检测' });
		dataSummary.createSpan({ cls: 'cr-section-desc', text: 'Charted Roots 识别和同步笔记的方式' });
		const dataContent = dataDetails.createDiv({ cls: 'cr-section-content' });

		// Auto-generate cr_id
		new Setting(dataContent)
			.setName('自动生成 cr_id')
			.setDesc('为没有 cr_id 的人物笔记自动生成 cr_id')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.autoGenerateCrId)
				.onChange(async (value) => {
					this.plugin.settings.autoGenerateCrId = value;
					await this.plugin.saveSettings();
				}));

		// Primary type property (from Note type detection)
		new Setting(dataContent)
			.setName('主要类型属性')
			.setDesc('检查笔记类型时优先使用哪个 frontmatter 属性（人物、地点、事件等）')
			.addDropdown(dropdown => dropdown
				.addOption('cr_type', 'cr_type（推荐）')
				.addOption('type', 'type（旧版）')
				.setValue(this.plugin.settings.noteTypeDetection.primaryTypeProperty)
				.onChange(async (value) => {
					this.plugin.settings.noteTypeDetection.primaryTypeProperty = value as 'type' | 'cr_type';
					await this.plugin.saveSettings();
				}));

		// Enable tag-based detection
		new Setting(dataContent)
			.setName('启用基于标签的检测')
			.setDesc('当未找到类型属性时，允许使用标签（#person、#place、#event、#source）作为回退')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.noteTypeDetection.enableTagDetection)
				.onChange(async (value) => {
					this.plugin.settings.noteTypeDetection.enableTagDetection = value;
					await this.plugin.saveSettings();
				}));

		// Accept DMS coordinate format
		new Setting(dataContent)
			.setName('接受 DMS 坐标格式')
			.setDesc('允许以度、分、秒格式输入坐标（例如 33°51\'08"N）')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableDMSCoordinates)
				.onChange(async (value) => {
					this.plugin.settings.enableDMSCoordinates = value;
					await this.plugin.saveSettings();
				}));

		// GEDCOM compatibility mode
		new Setting(dataContent)
			.setName('GEDCOM 兼容模式')
			.setDesc('修复 GEDCOM 导入中的厂商特有问题（MyHeritage：BOM、双重编码实体、<br> 标签）')
			.addDropdown(dropdown => dropdown
				.addOption('auto', '自动（检测并修复）')
				.addOption('myheritage', 'MyHeritage（始终修复）')
				.addOption('none', '无（禁用）')
				.setValue(this.plugin.settings.gedcomCompatibilityMode)
				.onChange(async (value) => {
					this.plugin.settings.gedcomCompatibilityMode = value as GedcomCompatibilityMode;
					await this.plugin.saveSettings();
				}));

		// Bidirectional relationship sync
		new Setting(dataContent)
			.setName('启用双向关系同步')
			.setDesc('编辑笔记时自动维护互惠关系')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableBidirectionalSync)
				.onChange(async (value) => {
					this.plugin.settings.enableBidirectionalSync = value;
					await this.plugin.saveSettings();
					// Re-register file modification handler with new settings
					this.plugin.registerFileModificationHandler();
					// Refresh display to update disabled state
					this.refreshSettings();
				}));

		// Sync on file modify
		new Setting(dataContent)
			.setName('文件修改时同步')
			.setDesc('人物笔记被编辑时自动同步关系')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.syncOnFileModify)
				.onChange(async (value) => {
					this.plugin.settings.syncOnFileModify = value;
					await this.plugin.saveSettings();
					// Re-register file modification handler with new settings
					this.plugin.registerFileModificationHandler();
				})
				.setDisabled(!this.plugin.settings.enableBidirectionalSync));
	}

	private renderPrivacySection(containerEl: HTMLElement): void {
		// ═══════════════════════════════════════════════════════════════════════
		// PRIVACY & EXPORT SECTION (Collapsible)
		// ═══════════════════════════════════════════════════════════════════════
		const privacyDetails = containerEl.createEl('details', { cls: 'cr-settings-section' });
		privacyDetails.dataset.sectionName = 'privacy';
		const privacySummary = privacyDetails.createEl('summary');
		privacySummary.createSpan({ text: '隐私与导出' });
		privacySummary.createSpan({ cls: 'cr-section-desc', text: '控制数据如何受到保护和导出' });
		const privacyContent = privacyDetails.createDiv({ cls: 'cr-section-content' });

		new Setting(privacyContent)
			.setName('启用隐私保护')
			.setDesc('在导出和画布显示中保护在世人物')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enablePrivacyProtection)
				.onChange(async (value) => {
					this.plugin.settings.enablePrivacyProtection = value;
					await this.plugin.saveSettings();
				}));

		new Setting(privacyContent)
			.setName('在世人物年龄阈值')
			.setDesc('如果出生距今在此年数内，则假定该人物在世')
			.addText(text => text
				.setPlaceholder('100')
				.setValue(String(this.plugin.settings.livingPersonAgeThreshold))
				.onChange(async (value) => {
					const numValue = parseInt(value);
					if (!isNaN(numValue) && numValue > 0) {
						this.plugin.settings.livingPersonAgeThreshold = numValue;
						await this.plugin.saveSettings();
					}
				}));

		new Setting(privacyContent)
			.setName('隐私显示格式')
			.setDesc('如何显示受保护的人物')
			.addDropdown(dropdown => dropdown
				.addOption('living', '显示“在世”')
				.addOption('private', '显示“私密”')
				.addOption('initials', '仅显示首字母')
				.addOption('hidden', '完全排除')
				.setValue(this.plugin.settings.privacyDisplayFormat)
				.onChange(async (value: 'living' | 'private' | 'initials' | 'hidden') => {
					this.plugin.settings.privacyDisplayFormat = value;
					await this.plugin.saveSettings();
				}));

		new Setting(privacyContent)
			.setName('隐藏在世人物的详细信息')
			.setDesc('隐藏在世人物的出生日期和地点')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.hideDetailsForLiving)
				.onChange(async (value) => {
					this.plugin.settings.hideDetailsForLiving = value;
					await this.plugin.saveSettings();
				}));

		new Setting(privacyContent)
			.setName('导出文件名模式')
			.setDesc('使用{name}表示根人物，{date}表示当前日期')
			.addText(text => text
				.setPlaceholder('{name}-family-chart-{date}')
				.setValue(this.plugin.settings.exportFilenamePattern)
				.onChange(async (value) => {
					this.plugin.settings.exportFilenamePattern = value || '{name}-family-chart-{date}';
					await this.plugin.saveSettings();
				}));
	}

	private renderCanvasSection(containerEl: HTMLElement): void {
		// ═══════════════════════════════════════════════════════════════════════
		// SECTION 3: CANVAS & TREES
		// ═══════════════════════════════════════════════════════════════════════
		const canvasDetails = containerEl.createEl('details', { cls: 'cr-settings-section' });
		canvasDetails.dataset.sectionName = 'canvas';
		const canvasSummary = canvasDetails.createEl('summary');
		canvasSummary.createSpan({ text: '画布与树' });
		canvasSummary.createSpan({ cls: 'cr-section-desc', text: '树生成的布局与样式' });
		const canvasContent = canvasDetails.createDiv({ cls: 'cr-section-content' });

		// Info text
		const canvasInfo = canvasContent.createDiv({ cls: 'setting-item-description cr-info-box' });
		canvasInfo.appendText('更改会应用于新生成的树。要更新现有画布，请右键单击画布文件并选择“重新布局家谱”。');

		// --- Node dimensions subsection ---
		new Setting(canvasContent).setName("节点尺寸").setHeading();

		new Setting(canvasContent)
			.setName('节点宽度')
			.setDesc('人物节点的宽度（像素）')
			.addSlider(slider => slider
				.setLimits(100, 500, 25)
				.setValue(this.plugin.settings.defaultNodeWidth)
				.onChange(async (value) => {
					this.plugin.settings.defaultNodeWidth = value;
					await this.plugin.saveSettings();
				}));

		new Setting(canvasContent)
			.setName('节点高度')
			.setDesc('人物节点的高度（像素）')
			.addSlider(slider => slider
				.setLimits(50, 300, 25)
				.setValue(this.plugin.settings.defaultNodeHeight)
				.onChange(async (value) => {
					this.plugin.settings.defaultNodeHeight = value;
					await this.plugin.saveSettings();
				}));

		// --- Spacing subsection ---
		new Setting(canvasContent).setName("间距").setHeading();

		new Setting(canvasContent)
			.setName('水平间距')
			.setDesc('节点之间的水平间距')
			.addSlider(slider => slider
				.setLimits(100, 1000, 50)
				.setValue(this.plugin.settings.horizontalSpacing)
				.onChange(async (value) => {
					this.plugin.settings.horizontalSpacing = value;
					await this.plugin.saveSettings();
				}));

		new Setting(canvasContent)
			.setName('垂直间距')
			.setDesc('世代之间的垂直间距')
			.addSlider(slider => slider
				.setLimits(100, 1000, 50)
				.setValue(this.plugin.settings.verticalSpacing)
				.onChange(async (value) => {
					this.plugin.settings.verticalSpacing = value;
					await this.plugin.saveSettings();
				}));

		// --- Colors & styling subsection ---
		new Setting(canvasContent).setName("颜色与样式").setHeading();

		new Setting(canvasContent)
			.setName('配色方案')
			.setDesc('如何为家谱中的人物节点着色')
			.addDropdown(dropdown => dropdown
				.addOption('sex', '性别 - 男性绿色，女性紫色')
				.addOption('generation', '世代 - 按世代层级着色')
				.addOption('collection', '合集 - 每个合集使用不同颜色')
				.addOption('monochrome', '单色 - 不着色')
				.setValue(this.plugin.settings.nodeColorScheme)
				.onChange(async (value) => {
					this.plugin.settings.nodeColorScheme = value as ColorScheme;
					await this.plugin.saveSettings();
				}));

		new Setting(canvasContent)
			.setName('画布分组')
			.setDesc('用于在画布上组织相关节点的可视组')
			.addDropdown(dropdown => dropdown
				.addOption('none', '无 - 不分组')
				.addOption('generation', '按世代')
				.addOption('nuclear-family', '按夫妻')
				.addOption('collection', '按合集')
				.setValue(this.plugin.settings.canvasGroupingStrategy)
				.onChange(async (value) => {
					this.plugin.settings.canvasGroupingStrategy = value as CanvasGroupingStrategy;
					await this.plugin.saveSettings();
				}));

		// --- Arrow styles subsection ---
		new Setting(canvasContent).setName("箭头样式").setHeading();

		new Setting(canvasContent)
			.setName('父母 → 子女箭头')
			.setDesc('亲子关系的箭头样式')
			.addDropdown(dropdown => dropdown
				.addOption('directed', '有向（→）')
				.addOption('bidirectional', '双向（↔）')
				.addOption('undirected', '无向（—）')
				.setValue(this.plugin.settings.parentChildArrowStyle)
				.onChange(async (value) => {
					this.plugin.settings.parentChildArrowStyle = value as ArrowStyle;
					await this.plugin.saveSettings();
				}));

		new Setting(canvasContent)
			.setName(getSpouseCompoundLabel(this.plugin.settings, 'arrows'))
			.setDesc('配偶/伴侣关系的箭头样式')
			.addDropdown(dropdown => dropdown
				.addOption('directed', '有向（→）')
				.addOption('bidirectional', '双向（↔）')
				.addOption('undirected', '无向（—）')
				.setValue(this.plugin.settings.spouseArrowStyle)
				.onChange(async (value) => {
					this.plugin.settings.spouseArrowStyle = value as ArrowStyle;
					await this.plugin.saveSettings();
				}));

		// --- Spouse edges subsection ---
		new Setting(canvasContent).setName("").setHeading();

		new Setting(canvasContent)
			.setName(`显示${getSpouseCompoundLabel(this.plugin.settings, 'edges').toLowerCase()}`)
			.setDesc('显示配偶/伴侣之间的连线及婚姻元数据')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.showSpouseEdges)
				.onChange(async (value) => {
					this.plugin.settings.showSpouseEdges = value;
					await this.plugin.saveSettings();
				}));

		new Setting(canvasContent)
			.setName(getSpouseCompoundLabel(this.plugin.settings, 'edge label format'))
			.setDesc('如何在配偶/伴侣连线上显示婚姻信息')
			.addDropdown(dropdown => dropdown
				.addOption('none', '无')
				.addOption('date-only', '仅日期')
				.addOption('date-location', '日期和地点')
				.addOption('full', '完整详情')
				.setValue(this.plugin.settings.spouseEdgeLabelFormat)
				.onChange(async (value) => {
					this.plugin.settings.spouseEdgeLabelFormat = value as SpouseEdgeLabelFormat;
					await this.plugin.saveSettings();
				}));
	}

	private renderDatesSection(containerEl: HTMLElement): void {
		// ═══════════════════════════════════════════════════════════════════════
		// SECTION 5: DATES & VALIDATION
		// ═══════════════════════════════════════════════════════════════════════
		const datesDetails = containerEl.createEl('details', { cls: 'cr-settings-section' });
		datesDetails.dataset.sectionName = 'dates';
		const datesSummary = datesDetails.createEl('summary');
		datesSummary.createSpan({ text: '日期与验证' });
		datesSummary.createSpan({ cls: 'cr-section-desc', text: '日期格式与验证规则' });
		const datesContent = datesDetails.createDiv({ cls: 'cr-section-content' });

		new Setting(datesContent)
			.setName('日期格式标准')
			.setDesc('验证时首选的日期格式标准')
			.addDropdown(dropdown => dropdown
				.addOption('iso8601', 'ISO 8601 - 严格的 YYYY-MM-DD')
				.addOption('gedcom', 'GEDCOM - DD MMM YYYY')
				.addOption('flexible', '灵活 - 多种格式')
				.setValue(this.plugin.settings.dateFormatStandard)
				.onChange(async (value) => {
					this.plugin.settings.dateFormatStandard = value as 'iso8601' | 'gedcom' | 'flexible';
					await this.plugin.saveSettings();
				}));

		new Setting(datesContent)
			.setName('允许部分日期')
			.setDesc('接受缺少日或月的日期（例如“1920-05”或“1920”）')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.allowPartialDates)
				.onChange(async (value) => {
					this.plugin.settings.allowPartialDates = value;
					await this.plugin.saveSettings();
				}));

		new Setting(datesContent)
			.setName('允许约略日期')
			.setDesc('接受带有“c.”、“ca.”、“circa”或“~”前缀的近似日期')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.allowCircaDates)
				.onChange(async (value) => {
					this.plugin.settings.allowCircaDates = value;
					await this.plugin.saveSettings();
				}));

		new Setting(datesContent)
			.setName('允许日期范围')
			.setDesc('接受使用连字符或“to”的日期范围（例如“1850-1920”）')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.allowDateRanges)
				.onChange(async (value) => {
					this.plugin.settings.allowDateRanges = value;
					await this.plugin.saveSettings();
				}));

		new Setting(datesContent)
			.setName('要求前导零')
			.setDesc('要求月和日补零（例如“1920-05-01”）')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.requireLeadingZeros)
				.onChange(async (value) => {
					this.plugin.settings.requireLeadingZeros = value;
					await this.plugin.saveSettings();
				}));

		// Fictional date systems (#358)
		const fictionalDetails = datesContent.createEl('details', { cls: 'cr-settings-section' });
		const fictionalSummary = fictionalDetails.createEl('summary');
		fictionalSummary.createSpan({ text: '虚构日期系统' });
		fictionalSummary.createSpan({ cls: 'cr-section-desc', text: '用于世界观构建的自定义历法' });
		const fictionalContent = fictionalDetails.createDiv({ cls: 'cr-section-content' });

		// Calendarium integration — moved here from Advanced so the enable
		// controls sit next to the calendars they import (#725).
		new Setting(fictionalContent).setName('Calendarium').setHeading();

		// Re-render the date-systems list when the integration is toggled, so
		// imported calendars appear/disappear without reopening settings.
		let dateSystemsContainer: HTMLElement | undefined;
		const refreshDateSystems = () => {
			if (dateSystemsContainer) {
				dateSystemsContainer.empty();
				renderDateSystemsSettings(dateSystemsContainer, this.plugin);
			}
		};

		new Setting(fictionalContent)
			.setName('Calendarium 集成')
			.setDesc('从 Calendarium 插件导入历法定义')
			.addDropdown(dropdown => dropdown
				.addOption('off', '关闭')
				.addOption('read', '读取历法')
				.setValue(this.plugin.settings.calendariumIntegration)
				.onChange(async (value) => {
					this.plugin.settings.calendariumIntegration = value as 'off' | 'read';
					await this.plugin.saveSettings();
					refreshDateSystems();
				}));

		new Setting(fictionalContent)
			.setName('同步 Calendarium 事件')
			.setDesc('在时间轴上显示 Calendarium 日期（fc-date、fc-end）')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.syncCalendariumEvents)
				.onChange(async (value) => {
					this.plugin.settings.syncCalendariumEvents = value;
					await this.plugin.saveSettings();
				}));

		dateSystemsContainer = fictionalContent.createDiv();
		renderDateSystemsSettings(dateSystemsContainer, this.plugin);
	}

	private renderTimelineSection(containerEl: HTMLElement): void {
		// ═══════════════════════════════════════════════════════════════════════
		// SECTION 6: TIMELINE
		// ═══════════════════════════════════════════════════════════════════════
		const timelineDetails = containerEl.createEl('details', { cls: 'cr-settings-section' });
		timelineDetails.dataset.sectionName = 'timeline';
		const timelineSummary = timelineDetails.createEl('summary');
		timelineSummary.createSpan({ text: '事件与时间轴' });
		timelineSummary.createSpan({ cls: 'cr-section-desc', text: '事件显示、布局、标签和事件覆盖范围' });
		const timelineContent = timelineDetails.createDiv({ cls: 'cr-section-content' });

		// --- Event display subsection ---
		new Setting(timelineContent).setName("事件显示").setHeading();

		new Setting(timelineContent)
			.setName('事件类型显示')
			.setDesc('如何在时间轴、画布事件节点和地图中显示事件类型')
			.addDropdown(dropdown => dropdown
				.addOption('text', '文本标签')
				.addOption('icon', '图标（带提示）')
				.addOption('both', '图标加标签')
				.setValue(this.plugin.settings.eventIconMode)
				.onChange(async (value) => {
					this.plugin.settings.eventIconMode = value as EventIconMode;
					await this.plugin.saveSettings();
				}));

		new Setting(timelineContent)
			.setName('显示地点上下文')
			.setDesc('为时间轴地点追加父级位置，使“London”显示为“London, England”。父级来自地点笔记层级（parent_place）。可使用 place_context: true / false / 数字 / full 按块覆盖。')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.timelineShowPlaceContext)
				.onChange(async (value) => {
					this.plugin.settings.timelineShowPlaceContext = value;
					await this.plugin.saveSettings();
				}));

		new Setting(timelineContent)
			.setName('地点上下文深度')
			.setDesc('地点上下文开启时追加的父级层数。1 = 仅直接父级；0 = 直到根地点的完整层级。可使用 place_context: <数字> 或 place_context: full 按块覆盖。')
			.addText(text => text
				.setPlaceholder('1')
				.setValue(String(this.plugin.settings.timelinePlaceContextDepth ?? 1))
				.onChange(async (value) => {
					const parsed = parseInt(value, 10);
					// 0 = full; clamp invalid/negative input back to the default depth of 1.
					this.plugin.settings.timelinePlaceContextDepth = Number.isFinite(parsed) && parsed >= 0 ? parsed : 1;
					await this.plugin.saveSettings();
				}));

		new Setting(timelineContent)
			.setName('显示婚姻类型')
			.setDesc('设置后，在时间轴婚姻行中追加婚姻类型（例如“Common-law marriage”），使该行显示为“Marriage to Jane Doe (Common-law marriage)”。可在人物编辑器中为每位配偶设置类型。')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.showMarriageType)
				.onChange(async (value) => {
					this.plugin.settings.showMarriageType = value;
					await this.plugin.saveSettings();
				}));

		// --- Timeline layout subsection ---
		new Setting(timelineContent).setName("时间轴布局").setHeading();

		new Setting(timelineContent)
			.setName('默认布局')
			.setDesc('事件在时间轴上的排列方式')
			.addDropdown(dropdown => dropdown
				.addOption('chronological', '按时间顺序 — 所有事件按日期交错排列')
				.addOption('grouped', '分组 — 个人、家庭，然后是历史')
				.addOption('personal-first', '个人优先 — 先个人事件，其余按时间顺序')
				.setValue(this.plugin.settings.timelineLayout)
				.onChange(async (value) => {
					this.plugin.settings.timelineLayout = value as 'chronological' | 'grouped' | 'personal-first';
					await this.plugin.saveSettings();
				}));

		new Setting(timelineContent)
			.setName('默认时间轴模板')
			.setDesc('定义时间轴分区的笔记，可自定义排序、包含和格式。可使用 template: [[Note]] 按块覆盖。')
			.addText(text => text
				.setPlaceholder('[[我的时间轴模板]]')
				.setValue(this.plugin.settings.defaultTimelineTemplate)
				.onChange(async (value) => {
					this.plugin.settings.defaultTimelineTemplate = value;
					await this.plugin.saveSettings();
				}));

		// --- Timeline labels subsection ---
		new Setting(timelineContent).setName("时间轴标签").setHeading();

		const labelSettings: Array<{ key: keyof typeof this.plugin.settings; name: string; placeholder: string; desc?: string }> = [
			{ key: 'timelineBirthLabel', name: '出生标签', placeholder: '出生' },
			{ key: 'timelineDeathLabel', name: '去世标签', placeholder: '去世' },
			{ key: 'timelineChildBirthLabel', name: '子女出生标签', placeholder: '{name}的出生' },
			{ key: 'timelineSpouseDeathLabel', name: '配偶去世标签', placeholder: '{name}的去世' },
			{ key: 'timelineParentDeathLabel', name: '父母去世标签', placeholder: '{name}的去世' },
			{ key: 'timelineSiblingBirthLabel', name: '兄弟姐妹出生标签', placeholder: '{name}的出生' },
			{ key: 'timelineChildDeathLabel', name: '子女去世标签', placeholder: '{name}的去世' },
			{ key: 'timelineStepparentDeathLabel', name: '继父母去世标签', placeholder: '{name}的去世' },
			{ key: 'timelineSiblingDeathLabel', name: '兄弟姐妹去世标签', placeholder: '{name}的去世' },
			{ key: 'timelineGrandchildBirthLabel', name: '孙辈出生标签', placeholder: '{name}的出生' },
			{ key: 'timelineAdoptedSiblingBirthLabel', name: '被收养兄弟姐妹出生标签', placeholder: '被收养的兄弟姐妹{name}的出生' },
			{ key: 'timelineAdoptedGrandchildBirthLabel', name: '被收养孙辈出生标签', placeholder: '被收养的孙辈{name}的出生' },
			{ key: 'timelineAdoptedSiblingAdoptionLabel', name: '被收养兄弟姐妹收养标签', placeholder: '收养{name}' },
			{ key: 'timelineAdoptedGrandchildAdoptionLabel', name: '被收养孙辈收养标签', placeholder: '收养{name}' },
			{ key: 'timelineChildMarriageLabel', name: '子女婚姻标签', placeholder: '{name}与{spouse}的婚姻', desc: '使用{name}表示子女，{spouse}表示其配偶' },
			{ key: 'timelineParentMarriageLabel', name: '父母婚姻标签', placeholder: '{name}与{spouse}的婚姻', desc: '使用{name}表示父母，{spouse}表示其配偶' },
			{ key: 'timelineSiblingMarriageLabel', name: '兄弟姐妹婚姻标签', placeholder: '{name}与{spouse}的婚姻', desc: '使用{name}表示兄弟姐妹，{spouse}表示其配偶' },
		];

		for (const label of labelSettings) {
			new Setting(timelineContent)
				.setName(label.name)
				.setDesc(label.desc || `使用{name}表示人物姓名`)
				.addText(text => text
					.setPlaceholder(label.placeholder)
					.setValue((this.plugin.settings as unknown as Record<string, unknown>)[label.key as string] as string)
					.onChange(async (value) => {
						(this.plugin.settings as unknown as Record<string, unknown>)[label.key as string] = value || label.placeholder;
						await this.plugin.saveSettings();
					}));
		}

		// --- Family events on timelines subsection ---
		new Setting(timelineContent).setName("时间轴上的家庭事件").setHeading();

		new Setting(timelineContent)
			.setName('显示子女出生')
			.setDesc('在父母的时间轴上显示子女的出生事件')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.timelineShowChildrenBirths)
				.onChange(async (value) => {
					this.plugin.settings.timelineShowChildrenBirths = value;
					await this.plugin.saveSettings();
				}));

		new Setting(timelineContent)
			.setName('显示配偶去世')
			.setDesc('在人物的时间轴上显示配偶的去世事件')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.timelineShowSpouseDeaths)
				.onChange(async (value) => {
					this.plugin.settings.timelineShowSpouseDeaths = value;
					await this.plugin.saveSettings();
				}));

		new Setting(timelineContent)
			.setName('显示父母去世')
			.setDesc('在人物的时间轴上显示父母的去世事件')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.timelineShowParentDeaths)
				.onChange(async (value) => {
					this.plugin.settings.timelineShowParentDeaths = value;
					await this.plugin.saveSettings();
				}));

		new Setting(timelineContent)
			.setName('显示兄弟姐妹出生')
			.setDesc('在人物的时间轴上显示兄弟姐妹的出生事件')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.timelineShowSiblingBirths)
				.onChange(async (value) => {
					this.plugin.settings.timelineShowSiblingBirths = value;
					await this.plugin.saveSettings();
				}));

		new Setting(timelineContent)
			.setName('显示被收养子女出生')
			.setDesc('在所有界面中显示被收养关系的出生事件——收养父母时间轴上的被收养子女、焦点人物时间轴上的被收养兄弟姐妹，以及祖父母时间轴上的被收养孙辈。独立于亲生子女的出生开关。启用后，被收养关系的条目使用不同标签（“被收养的兄弟姐妹X的出生”/“被收养的孙辈X的出生”），以便与亲生条目区分。收养日期本身始终显示在收养父母和被收养者的时间轴上。')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.timelineShowAdoptedChildrenBirths)
				.onChange(async (value) => {
					this.plugin.settings.timelineShowAdoptedChildrenBirths = value;
					await this.plugin.saveSettings();
				}));

		new Setting(timelineContent)
			.setName('显示离婚')
			.setDesc('在人物的时间轴上显示离婚事件。婚姻始终在有数据时显示；此开关仅控制离婚。')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.timelineShowDivorces)
				.onChange(async (value) => {
					this.plugin.settings.timelineShowDivorces = value;
					await this.plugin.saveSettings();
				}));

		new Setting(timelineContent)
			.setName('显示子女去世')
			.setDesc('在父母的时间轴上显示子女的去世事件。当焦点人物被记录为父母或继父母时，涵盖亲生、被收养和继子女。')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.timelineShowChildrenDeaths)
				.onChange(async (value) => {
					this.plugin.settings.timelineShowChildrenDeaths = value;
					await this.plugin.saveSettings();
				}));

		new Setting(timelineContent)
			.setName('显示继父母去世')
			.setDesc('在继子女的时间轴上显示继父母的去世事件。')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.timelineShowStepparentDeaths)
				.onChange(async (value) => {
					this.plugin.settings.timelineShowStepparentDeaths = value;
					await this.plugin.saveSettings();
				}));

		new Setting(timelineContent)
			.setName('显示兄弟姐妹去世')
			.setDesc('在人物的时间轴上显示兄弟姐妹的去世事件。')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.timelineShowSiblingDeaths)
				.onChange(async (value) => {
					this.plugin.settings.timelineShowSiblingDeaths = value;
					await this.plugin.saveSettings();
				}));

		new Setting(timelineContent)
			.setName('显示孙辈出生')
			.setDesc('在祖父母的时间轴上显示孙辈（亲生和收养）的出生事件。')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.timelineShowGrandchildrenBirths)
				.onChange(async (value) => {
					this.plugin.settings.timelineShowGrandchildrenBirths = value;
					await this.plugin.saveSettings();
				}));

		new Setting(timelineContent)
			.setName('显示子女婚姻')
			.setDesc('在父母的时间轴上显示子女的婚姻事件。涵盖亲生、被收养和继子女。显示配偶姓名以及（设置后）婚姻地点。')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.timelineShowChildrenMarriages)
				.onChange(async (value) => {
					this.plugin.settings.timelineShowChildrenMarriages = value;
					await this.plugin.saveSettings();
				}));

		new Setting(timelineContent)
			.setName('显示父母婚姻')
			.setDesc('在子女的时间轴上显示亲生和收养父母的婚姻事件。跳过两位亲生父母之间的婚姻（父母链接中隐含的配对）。收养父母双方的婚姻和父母的再婚都会显示。')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.timelineShowParentMarriages)
				.onChange(async (value) => {
					this.plugin.settings.timelineShowParentMarriages = value;
					await this.plugin.saveSettings();
				}));

		new Setting(timelineContent)
			.setName('显示兄弟姐妹婚姻')
			.setDesc('在人物的时间轴上显示兄弟姐妹的婚姻事件。涵盖亲生和被收养的兄弟姐妹；排除继兄弟姐妹（与兄弟姐妹出生保持一致）。显示配偶姓名以及（设置后）婚姻地点。')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.timelineShowSiblingMarriages)
				.onChange(async (value) => {
					this.plugin.settings.timelineShowSiblingMarriages = value;
					await this.plugin.saveSettings();
				}));

		// --- Context events subsection ---
		new Setting(timelineContent).setName("上下文事件").setHeading();

		new Setting(timelineContent)
			.setName('默认时间轴上下文')
			.setDesc('包含历史事件的笔记，用于叠加到所有时间轴上（例如 [[World History]]）。可使用 context: [[Note]] 按块覆盖。')
			.addText(text => text
				.setPlaceholder('[[我的历史事件]]')
				.setValue(this.plugin.settings.defaultTimelineContext)
				.onChange(async (value) => {
					this.plugin.settings.defaultTimelineContext = value;
					await this.plugin.saveSettings();
				}));

		new Setting(timelineContent)
			.setName('上下文寿命边距')
			.setDesc('仅显示在人物寿命前后此年数范围内的上下文事件。设置为 0 可显示所有上下文事件（默认）。')
			.addText(text => text
				.setPlaceholder('0')
				.setValue(String(this.plugin.settings.contextLifespanMargin))
				.onChange(async (value) => {
					const val = parseInt(value);
					if (!isNaN(val) && val >= 0) {
						this.plugin.settings.contextLifespanMargin = val;
						await this.plugin.saveSettings();
					}
				}));
	}

	private renderSexSection(containerEl: HTMLElement): void {
		// ═══════════════════════════════════════════════════════════════════════
		// SECTION 6: SEX & GENDER
		// ═══════════════════════════════════════════════════════════════════════
		const sexDetails = containerEl.createEl('details', { cls: 'cr-settings-section' });
		sexDetails.dataset.sectionName = 'sex';
		const sexSummary = sexDetails.createEl('summary');
		sexSummary.createSpan({ text: '性别' });
		sexSummary.createSpan({ cls: 'cr-section-desc', text: '性别规范化与包容性选项' });
		const sexContent = sexDetails.createDiv({ cls: 'cr-section-content' });

		new Setting(sexContent)
			.setName('性别规范化模式')
			.setDesc('批量操作中性别值的规范化方式')
			.addDropdown(dropdown => dropdown
				.addOption('standard', '标准 - 规范化为 GEDCOM M/F')
				.addOption('schema-aware', 'Schema 感知 - 跳过具有自定义 schema 的笔记')
				.addOption('disabled', '禁用 - 从不规范化')
				.setValue(this.plugin.settings.sexNormalizationMode)
				.onChange(async (value) => {
					this.plugin.settings.sexNormalizationMode = value as SexNormalizationMode;
					await this.plugin.saveSettings();
				}));

		new Setting(sexContent)
			.setName('启用性别中立父母属性')
			.setDesc('在人物模态框中显示“父母”属性以实现包容性术语')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableInclusiveParents)
				.onChange(async (value) => {
					this.plugin.settings.enableInclusiveParents = value;
					await this.plugin.saveSettings();
					this.refreshSettings(); // Refresh to show/hide label setting
				}));

		if (this.plugin.settings.enableInclusiveParents) {
			new Setting(sexContent)
				.setName('父母属性标签')
				.setDesc('自定义性别中立父母属性的界面标签')
				.addText(text => text
					.setPlaceholder('父母')
					.setValue(this.plugin.settings.parentFieldLabel)
					.onChange(async (value) => {
						this.plugin.settings.parentFieldLabel = value || '父母';
						await this.plugin.saveSettings();
					}));
		}

		new Setting(sexContent)
			.setName('显示代词')
			.setDesc('在人物选择器和卡片中显示代词')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.showPronouns)
				.onChange(async (value) => {
					this.plugin.settings.showPronouns = value;
					await this.plugin.saveSettings();
				}));

		new Setting(sexContent)
			.setName('恋爱关系标签')
			.setDesc('为界面中的配偶/伴侣关系选择术语')
			.addDropdown(dropdown => dropdown
				.addOption('spouse', '配偶')
				.addOption('partner', '伴侣')
				.setValue(this.plugin.settings.romanticRelationshipLabel)
				.onChange(async (value: 'spouse' | 'partner') => {
					this.plugin.settings.romanticRelationshipLabel = value;
					await this.plugin.saveSettings();
				}));
	}

	private renderPlacesSection(containerEl: HTMLElement): void {
		// ═══════════════════════════════════════════════════════════════════════
		// SECTION 7: PLACES
		// ═══════════════════════════════════════════════════════════════════════
		const placesDetails = containerEl.createEl('details', { cls: 'cr-settings-section' });
		placesDetails.dataset.sectionName = 'places';
		const placesSummary = placesDetails.createEl('summary');
		placesSummary.createSpan({ text: '地点' });
		placesSummary.createSpan({ cls: 'cr-section-desc', text: '地点组织与坐标处理' });
		const placesContent = placesDetails.createDiv({ cls: 'cr-section-content' });

		new Setting(placesContent)
			.setName('使用基于分类的子文件夹')
			.setDesc('根据分类自动将新地点整理到子文件夹中')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.useCategorySubfolders)
				.onChange(async (value) => {
					this.plugin.settings.useCategorySubfolders = value;
					await this.plugin.saveSettings();
					this.refreshSettings(); // Refresh to show/hide overrides section
				}));

		// Show category folder overrides section if enabled
		if (this.plugin.settings.useCategorySubfolders) {
			new Setting(placesContent).setName("分类文件夹覆盖").setHeading();

			placesContent.createEl('p', {
				cls: 'setting-item-description',
				text: '为特定分类覆盖默认子文件夹名称。留空则使用首字母大写的分类名称（例如“Historical”）。'
			});

			const rulesContainer = placesContent.createDiv({ cls: 'cr-category-folder-rules' });
			this.renderCategoryFolderRules(rulesContainer);
		}

		new Setting(placesContent)
			.setName('默认地点分类')
			.setDesc('未指定时为新建地点分配的分类')
			.addDropdown(dropdown => dropdown
				.addOption('real', '真实')
				.addOption('historical', '历史')
				.addOption('disputed', '有争议')
				.addOption('legendary', '传说')
				.addOption('mythological', '神话')
				.addOption('fictional', '虚构')
				.setValue(this.plugin.settings.defaultPlaceCategory)
				.onChange(async (value) => {
					this.plugin.settings.defaultPlaceCategory = value as PlaceCategory;
					await this.plugin.saveSettings();
				}));

		// Default universe (#751) — applied to new people, places, events, and
		// organizations when their universe field is left empty. Placed beside the
		// place-category default since the two pair up for fictional worldbuilding.
		new Setting(placesContent)
			.setName('默认宇宙')
			.setDesc('未指定时为新建人物、地点、事件和组织分配的宇宙。对于地点，仅适用于虚构分类。')
			.addDropdown(dropdown => {
				dropdown.addOption('', '（无）');
				const current = this.plugin.settings.defaultUniverse || '';
				const names = createUniverseService(this.plugin).getAllUniverses().map(u => u.name);
				for (const name of names) {
					dropdown.addOption(name, name);
				}
				// Keep a previously-set universe selectable even if its note was removed.
				if (current && !names.includes(current)) {
					dropdown.addOption(current, `${current}（缺失）`);
				}
				dropdown.setValue(current);
				dropdown.onChange(async (value) => {
					this.plugin.settings.defaultUniverse = value;
					await this.plugin.saveSettings();
				});
			});

		new Setting(placesContent)
			.setName('接受 DMS 坐标格式')
			.setDesc('允许以度、分、秒格式输入坐标')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableDMSCoordinates)
				.onChange(async (value) => {
					this.plugin.settings.enableDMSCoordinates = value;
					await this.plugin.saveSettings();
				}));

		// --- Place lookup subsection (#218) ---
		new Setting(placesContent).setName("地点查找").setHeading();

		new Setting(placesContent)
			.setName('GeoNames 用户名')
			.setDesc(createFragment(f => {
				f.appendText('可选。将 GeoNames 启用为附加查找来源。');
				f.createEl('a', { text: '免费注册', href: 'https://www.geonames.org/login' });
				f.appendText('，然后');
				f.createEl('a', { text: '启用免费网络服务', href: 'https://www.geonames.org/manageaccount' });
				f.appendText('（在账户页面上，API 访问所需）。');
			}))
			.addText(text => text
				.setPlaceholder('你的用户名')
				.setValue(this.plugin.settings.geonamesUsername)
				.onChange(async (value) => {
					this.plugin.settings.geonamesUsername = value.trim();
					await this.plugin.saveSettings();
				}));

		// Heat map intensity
		new Setting(placesContent)
			.setName('热力图强度')
			.setDesc('控制地图视图中热力图叠加层的亮度和半径。也可在地图“图层”菜单中调整。')
			.addDropdown(dropdown => dropdown
				.addOption('low', '低')
				.addOption('medium', '中')
				.addOption('high', '高')
				.setValue(this.plugin.settings.heatMapIntensity)
				.onChange(async (value) => {
					this.plugin.settings.heatMapIntensity = value as 'low' | 'medium' | 'high';
					await this.plugin.saveSettings();
				}));

		// Heat map preset customization
		const presets = this.plugin.settings.heatMapPresets;
		for (const level of ['low', 'medium', 'high'] as const) {
			const preset = presets[level];
			new Setting(placesContent)
				.setName(`${({ low: '低', medium: '中', high: '高' } as const)[level]}预设`)
				.setDesc(`半径：${preset.radius}，模糊：${preset.blur}，不透明度：${preset.opacity}`)
				.addText(text => text
					.setPlaceholder('半径')
					.setValue(String(preset.radius))
					.onChange(async (value) => {
						const num = parseFloat(value);
						if (!isNaN(num) && num > 0 && num <= 5) {
							this.plugin.settings.heatMapPresets[level].radius = num;
							await this.plugin.saveSettings();
						}
					}))
				.addText(text => text
					.setPlaceholder('模糊')
					.setValue(String(preset.blur))
					.onChange(async (value) => {
						const num = parseFloat(value);
						if (!isNaN(num) && num > 0 && num <= 5) {
							this.plugin.settings.heatMapPresets[level].blur = num;
							await this.plugin.saveSettings();
						}
					}))
				.addText(text => text
					.setPlaceholder('不透明度')
					.setValue(String(preset.opacity))
					.onChange(async (value) => {
						const num = parseFloat(value);
						if (!isNaN(num) && num >= 0 && num <= 1) {
							this.plugin.settings.heatMapPresets[level].opacity = num;
							await this.plugin.saveSettings();
						}
					}));
		}

		// Map path label outline (#483)
		new Setting(placesContent)
			.setName('地图路径标签描边')
			.setDesc('在路径标签周围添加对比描边，以便在彩色或深色背景上清晰可读。')
			.addDropdown(dropdown => dropdown
				.addOption('none', '无')
				.addOption('white', '白色描边')
				.addOption('black', '黑色描边')
				.setValue(this.plugin.settings.pathLabelStroke)
				.onChange(async (value) => {
					this.plugin.settings.pathLabelStroke = value as 'none' | 'white' | 'black';
					await this.plugin.saveSettings();
				}));

		// Info note about place lookup
		const lookupNote = placesContent.createDiv({ cls: 'cr-info-box cr-info-box--muted' });
		const lookupIcon = lookupNote.createSpan({ cls: 'cr-info-box-icon' });
		setIcon(lookupIcon, 'info');
		lookupNote.createSpan({
			text: '地点查找默认使用 Wikidata 和 OpenStreetMap。添加 GeoNames 用户名可获取更多结果。'
		});

		// Info note about imports
		const importNote = placesContent.createDiv({ cls: 'cr-info-box cr-info-box--muted' });
		const importIcon = importNote.createSpan({ cls: 'cr-info-box-icon' });
		setIcon(importIcon, 'info');
		importNote.createSpan({
			text: '导入（GEDCOM、Gramps）始终在基础文件夹中创建地点。之后可使用 数据质量 → “不在分类文件夹中的地点”来整理它们。'
		});
	}

	private renderResearchSection(containerEl: HTMLElement): void {
		// ═══════════════════════════════════════════════════════════════════════
		// SECTION: RESEARCH (#511)
		// Specialist features for evidence-based genealogy and DNA-driven
		// discovery. Promoted from Advanced → Research tools / DNA tracking
		// in v0.22.17 so the per-fact source-tracking surface is discoverable
		// without hunting through Advanced.
		// ═══════════════════════════════════════════════════════════════════════
		const researchDetails = containerEl.createEl('details', { cls: 'cr-settings-section' });
		researchDetails.dataset.sectionName = 'research';
		const researchSummary = researchDetails.createEl('summary');
		researchSummary.createSpan({ text: '研究' });
		researchSummary.createSpan({ cls: 'cr-section-desc', text: '基于证据的谱系研究与 DNA 工作流' });
		const researchContent = researchDetails.createDiv({ cls: 'cr-section-content' });

		// --- Research tools subsection ---
		new Setting(researchContent).setName("研究工具").setHeading();

		new Setting(researchContent)
			.setName('启用事实级来源追踪')
			.setDesc('追踪哪些具体事实具有来源引文')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.trackFactSourcing)
				.onChange(async (value) => {
					this.plugin.settings.trackFactSourcing = value;
					await this.plugin.saveSettings();
					this.refreshSettings();
				}));

		if (this.plugin.settings.trackFactSourcing) {
			new Setting(researchContent)
				.setName('事实覆盖率阈值')
				.setDesc('用于计算100%覆盖率的关键事实数量')
				.addText(text => text
					.setPlaceholder('6')
					.setValue(String(this.plugin.settings.factCoverageThreshold))
					.onChange(async (value) => {
						const numValue = parseInt(value);
						if (!isNaN(numValue) && numValue > 0 && numValue <= 10) {
							this.plugin.settings.factCoverageThreshold = numValue;
							await this.plugin.saveSettings();
						}
					}));

			new Setting(researchContent)
				.setName('在状态标签页中显示研究缺口')
				.setDesc('在控制中心显示无来源事实的摘要')
				.addToggle(toggle => toggle
					.setValue(this.plugin.settings.showResearchGapsInStatus)
					.onChange(async (value) => {
						this.plugin.settings.showResearchGapsInStatus = value;
						await this.plugin.saveSettings();
					}));
		}

		// --- DNA tracking subsection ---
		new Setting(researchContent).setName("DNA 追踪").setHeading();

		new Setting(researchContent)
			.setName('启用 DNA 匹配追踪')
			.setDesc('为遗传谱系工作流显示 DNA 相关字段和选项')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableDnaTracking)
				.onChange(async (value) => {
					this.plugin.settings.enableDnaTracking = value;
					await this.plugin.saveSettings();
					this.refreshSettings();
				}));

		if (this.plugin.settings.enableDnaTracking) {
			researchContent.createEl('p', {
				cls: 'setting-item-description',
				text: '启用后：创建人物中可使用“DNA 匹配”人物类型，编辑人物模态框中显示 DNA 字段，可使用 DNA 匹配关系类型。'
			});
		}
	}

	private renderAliasesSection(containerEl: HTMLElement): void {
		// ═══════════════════════════════════════════════════════════════════════
		// SECTION 8: PROPERTY & VALUE ALIASES
		// ═══════════════════════════════════════════════════════════════════════
		const aliasesDetails = containerEl.createEl('details', { cls: 'cr-settings-section' });
		aliasesDetails.dataset.sectionName = 'aliases';
		const aliasesSummary = aliasesDetails.createEl('summary');
		aliasesSummary.createSpan({ text: '属性与值别名' });
		aliasesSummary.createSpan({ cls: 'cr-section-desc', text: '自定义 frontmatter 名称和值映射' });
		const aliasesContent = aliasesDetails.createDiv({ cls: 'cr-section-content' });

		// Services for alias management
		const propertyAliasService = new PropertyAliasService(this.plugin);
		const valueAliasService = new ValueAliasService(this.plugin);

		// Description
		const aliasExplanation = aliasesContent.createDiv({ cls: 'setting-item-description cr-info-box' });
		aliasExplanation.appendText('使用你自己的属性名称和值——Charted Roots 会识别它们，而不会重写你的文件。');

		// --- Property aliases subsection ---
		new Setting(aliasesContent).setName("属性别名").setHeading();

		// Person properties
		this.renderPropertyAliasSection(aliasesContent, '人物属性', PERSON_PROPERTY_METADATA, propertyAliasService);

		// Event properties
		this.renderPropertyAliasSection(aliasesContent, '事件属性', EVENT_PROPERTY_METADATA, propertyAliasService);

		// Place properties
		this.renderPropertyAliasSection(aliasesContent, '地点属性', PLACE_PROPERTY_METADATA, propertyAliasService);

		// Source properties
		this.renderPropertyAliasSection(aliasesContent, '来源属性', SOURCE_PROPERTY_METADATA, propertyAliasService);

		// --- Value aliases subsection ---
		new Setting(aliasesContent).setName("值别名").setHeading();

		const valueAliasExplanation = aliasesContent.createDiv({ cls: 'setting-item-description cr-info-box cr-info-box--muted' });
		valueAliasExplanation.appendText('将你的自定义值映射到 Charted Roots 的规范值。例如，将“nameday”映射到“birth”事件类型。');

		// Event type values
		this.renderValueAliasSection(aliasesContent, '事件类型值', 'eventType', CANONICAL_EVENT_TYPES, EVENT_TYPE_LABELS, valueAliasService);

		// Sex values
		this.renderValueAliasSection(aliasesContent, '性别值', 'sex', CANONICAL_SEX_VALUES, SEX_LABELS, valueAliasService);

		// Place category values
		this.renderValueAliasSection(aliasesContent, '地点分类值', 'placeCategory', CANONICAL_PLACE_CATEGORIES, PLACE_CATEGORY_LABELS, valueAliasService);

		// Note type values
		this.renderValueAliasSection(aliasesContent, '笔记类型值', 'noteType', CANONICAL_NOTE_TYPES, NOTE_TYPE_LABELS, valueAliasService);
	}

	private renderAdvancedSection(containerEl: HTMLElement): void {
		// ═══════════════════════════════════════════════════════════════════════
		// SECTION 9: ADVANCED
		// ═══════════════════════════════════════════════════════════════════════
		const advancedDetails = containerEl.createEl('details', { cls: 'cr-settings-section' });
		advancedDetails.dataset.sectionName = 'advanced';
		const advancedSummary = advancedDetails.createEl('summary');
		advancedSummary.createSpan({ text: '高级' });
		advancedSummary.createSpan({ cls: 'cr-section-desc', text: '较少使用的设置' });
		const advancedContent = advancedDetails.createDiv({ cls: 'cr-section-content' });

		// --- Folder filtering subsection ---
		new Setting(advancedContent).setName("文件夹筛选").setHeading();

		new Setting(advancedContent)
			.setName('筛选模式')
			.setDesc('控制扫描哪些文件夹以查找笔记')
			.addDropdown(dropdown => dropdown
				.addOption('disabled', '禁用（扫描全部）')
				.addOption('exclude', '排除文件夹')
				.addOption('include', '仅包括文件夹')
				.setValue(this.plugin.settings.folderFilterMode)
				.onChange(async (value: FolderFilterMode) => {
					this.plugin.settings.folderFilterMode = value;
					await this.plugin.saveSettings();
					this.refreshSettings();
				}));

		if (this.plugin.settings.folderFilterMode !== 'disabled') {
			const isExcludeMode = this.plugin.settings.folderFilterMode === 'exclude';
			const filterFolders = isExcludeMode
				? this.plugin.settings.excludedFolders
				: this.plugin.settings.includedFolders;

			new Setting(advancedContent)
				.setName(isExcludeMode ? '排除的文件夹' : '包括的文件夹')
				.setDesc('每行一个文件夹路径')
				.addTextArea(textArea => textArea
					.setPlaceholder(isExcludeMode ? 'templates\narchive' : 'People\nFamily')
					.setValue(filterFolders.join('\n'))
					.onChange(async (value) => {
						const folderList = value.split('\n').map(f => f.trim()).filter(f => f.length > 0);
						if (isExcludeMode) {
							this.plugin.settings.excludedFolders = folderList;
						} else {
							this.plugin.settings.includedFolders = folderList;
						}
						await this.plugin.saveSettings();
					}));
		}

		new Setting(advancedContent)
			.setName('暂存隔离')
			.setDesc('从常规操作中排除暂存文件夹')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableStagingIsolation)
				.onChange(async (value) => {
					this.plugin.settings.enableStagingIsolation = value;
					await this.plugin.saveSettings();
				}));

		// --- Template detection subsection ---
		new Setting(advancedContent).setName("模板检测").setHeading();

		new Setting(advancedContent)
			.setName('自动检测模板文件夹')
			.setDesc('自动排除来自 Templates/Templater/QuickAdd 插件的模板文件夹')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.autoDetectTemplateFolders)
				.onChange(async (value) => {
					this.plugin.settings.autoDetectTemplateFolders = value;
					await this.plugin.saveSettings();
					const templateFilter = this.plugin.getTemplateFilter();
					if (templateFilter) {
						templateFilter.refresh();
					}
				}));

		new Setting(advancedContent)
			.setName('其他模板文件夹')
			.setDesc('要从笔记发现中排除的其他文件夹（每行一个）')
			.addTextArea(textArea => textArea
				.setPlaceholder('_templates\nmy-templates')
				.setValue((this.plugin.settings.templateFolders || []).join('\n'))
				.onChange(async (value) => {
					const folderList = value.split('\n').map(f => f.trim()).filter(f => f.length > 0);
					this.plugin.settings.templateFolders = folderList;
					await this.plugin.saveSettings();
				}));

		// --- Relationship calculator subsection ---
		new Setting(advancedContent).setName("关系计算器").setHeading();

		new Setting(advancedContent)
			.setName('最大搜索深度')
			.setDesc('计算关系时搜索的最大世代数。设置为 0 表示不限（在大型库中可能较慢）。')
			.addText(text => text
				.setPlaceholder('10')
				.setValue(String(this.plugin.settings.relationshipMaxDepth))
				.onChange(async (value) => {
					const val = parseInt(value);
					if (!isNaN(val) && val >= 0) {
						this.plugin.settings.relationshipMaxDepth = val;
						await this.plugin.saveSettings();
					}
				}));

		// --- Logging subsection ---
		new Setting(advancedContent).setName("日志").setHeading();

		new Setting(advancedContent)
			.setName('日志级别')
			.setDesc('控制台日志的详细程度')
			.addDropdown(dropdown => dropdown
				.addOption('debug', '调试（详细）')
				.addOption('info', '信息')
				.addOption('warn', '警告')
				.addOption('error', '错误')
				.addOption('off', '关闭')
				.setValue(this.plugin.settings.logLevel)
				.onChange(async (value: LogLevel) => {
					this.plugin.settings.logLevel = value;
					await this.plugin.saveSettings();
					const { LoggerFactory } = await import('./core/logging');
					LoggerFactory.setLogLevel(value);
				}));

		new Setting(advancedContent)
			.setName('混淆日志导出')
			.setDesc('导出日志时将个人身份信息替换为占位符')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.obfuscateLogExports)
				.onChange(async (value) => {
					this.plugin.settings.obfuscateLogExports = value;
					await this.plugin.saveSettings();
				}));

		new Setting(advancedContent)
			.setName('导出日志')
			.setDesc('将收集的日志导出到库中的文件')
			.addButton(button => button
				.setButtonText('导出')
				.onClick(async () => {
					try {
						const { LoggerFactory, obfuscateLogs } = await import('./core/logging');
						const logs = LoggerFactory.getLogs();

						if (logs.length === 0) {
							new Notice('没有可导出的日志');
							return;
						}

						const logsToExport = this.plugin.settings.obfuscateLogExports
							? obfuscateLogs(logs)
							: logs;

						const lines = logsToExport.map(entry => {
							const timestamp = entry.timestamp.toISOString();
							const level = entry.level.toUpperCase().padEnd(5);
							const dataStr = entry.data ? ` | ${JSON.stringify(entry.data)}` : '';
							return `[${timestamp}] ${level} [${entry.component}/${entry.category}] ${entry.message}${dataStr}`;
						});
						const content = lines.join('\n');

						const folder = this.plugin.settings.logExportPath || '.charted-roots/logs';
						const filename = `charted-roots-${new Date().toISOString().replace(/[:.]/g, '-')}.log`;
						const folderPath = normalizePath(folder);
						const fullPath = normalizePath(`${folderPath}/${filename}`);

						// Use the adapter for filesystem checks — the metadata cache
						// can lag behind on hidden folders like `.charted-roots/logs`,
						// causing getAbstractFileByPath to return null after a
						// previous export already created the folder (#402).
						if (!(await this.app.vault.adapter.exists(folderPath))) {
							await this.app.vault.createFolder(folderPath);
						}

						await this.app.vault.create(fullPath, content);
						new Notice(`已导出${logs.length}条日志到${fullPath}`);
					} catch (error) {
						const message = error instanceof Error ? error.message : String(error);
						new Notice(`导出日志失败：${message}`);
					}
				}));
	}


	/**
	 * Filter visible settings based on search query
	 */
	private filterSettings(containerEl: HTMLElement, query: string): void {
		const normalizedQuery = query.toLowerCase().trim();
		const sections = containerEl.querySelectorAll('.cr-settings-section');

		sections.forEach(section => {
			const settingItems = section.querySelectorAll('.cr-section-content .setting-item');
			let visibleCount = 0;

			settingItems.forEach(item => {
				const settingItem = item as HTMLElement;
				const nameEl = settingItem.querySelector('.setting-item-name');
				const descEl = settingItem.querySelector('.setting-item-description');

				const name = nameEl?.textContent?.toLowerCase() || '';
				const desc = descEl?.textContent?.toLowerCase() || '';

				const matches = !normalizedQuery ||
					name.includes(normalizedQuery) ||
					desc.includes(normalizedQuery);

				settingItem.toggleClass('crc-hidden', !matches);
				if (matches) visibleCount++;
			});

			// Show/hide section based on whether it has visible items
			const sectionEl = section as HTMLElement;
			if (normalizedQuery && visibleCount === 0) {
				sectionEl.addClass('crc-hidden');
			} else {
				sectionEl.removeClass('crc-hidden');
				// Auto-expand sections with matches when searching
				if (normalizedQuery && visibleCount > 0) {
					(section as HTMLDetailsElement).open = true;
				}
			}
		});
	}

	/**
	 * Save which sections are currently open
	 */
	private saveOpenSections(containerEl: HTMLElement): void {
		const sections = containerEl.querySelectorAll<HTMLDetailsElement>('.cr-settings-section[data-section-name]');
		// Nothing rendered yet (e.g. a fresh framework-provided host): keep the
		// last known state instead of clearing it.
		if (sections.length === 0) {
			return;
		}
		this.openSections.clear();
		sections.forEach(section => {
			if (section.open && section.dataset.sectionName) {
				this.openSections.add(section.dataset.sectionName);
			}
		});
	}

	/**
	 * Restore previously open sections
	 */
	private restoreOpenSections(containerEl: HTMLElement): void {
		const sections = containerEl.querySelectorAll<HTMLDetailsElement>('.cr-settings-section[data-section-name]');
		sections.forEach(section => {
			if (section.dataset.sectionName && this.openSections.has(section.dataset.sectionName)) {
				section.open = true;
			}
		});
	}

	/**
	 * Helper to create a folder setting with autocomplete
	 */
	private createFolderSetting(
		container: HTMLElement,
		name: string,
		desc: string,
		placeholder: string,
		getValue: () => string,
		setValue: (v: string) => void
	): void {
		new Setting(container)
			.setName(name)
			.setDesc(desc)
			.addText(text => {
				text
					.setPlaceholder(placeholder)
					.setValue(getValue())
					.onChange(async (value) => {
						setValue(value);
						await this.plugin.saveSettings();
					});

				// Attach folder autocomplete
				new FolderSuggest(this.app, text, (value) => {
					void (async () => {
						setValue(value);
						await this.plugin.saveSettings();
					})();
				});
			});
	}

	/**
	 * Render a collapsible property alias section
	 */
	private renderPropertyAliasSection(
		container: HTMLElement,
		title: string,
		properties: readonly PropertyMetadata[],
		propertyAliasService: PropertyAliasService
	): void {
		// Count configured aliases
		const configuredCount = properties.filter(meta =>
			propertyAliasService.getAlias(meta.canonical)
		).length;

		// Create collapsible section
		const section = container.createEl('details', { cls: 'cr-property-section' });
		const summary = section.createEl('summary', { cls: 'cr-property-section-summary' });
		summary.createSpan({ text: title, cls: 'cr-property-section-title' });
		summary.createSpan({
			text: configuredCount > 0 ? `已配置${configuredCount}项` : `${properties.length}个属性`,
			cls: 'cr-property-section-count'
		});

		const sectionContent = section.createDiv({ cls: 'cr-property-section-content' });

		// Lazy render on first open
		let rendered = false;
		section.addEventListener('toggle', () => {
			if (section.open && !rendered) {
				rendered = true;
				properties.forEach(meta => {
					const currentAlias = propertyAliasService.getAlias(meta.canonical) || '';

					new Setting(sectionContent)
						.setName(meta.label)
						.setDesc(meta.description)
						.addText(text => {
							text.setPlaceholder(meta.canonical).setValue(currentAlias);
							text.inputEl.addEventListener('blur', () => {
								void (async () => {
									const value = text.inputEl.value.trim();
									if (value === '') {
										if (currentAlias) {
											await propertyAliasService.removeAlias(currentAlias);
											this.refreshSettings();
										}
									} else if (value !== meta.canonical && value !== currentAlias) {
										const existingMapping = propertyAliasService.aliases[value];
										if (existingMapping && existingMapping !== meta.canonical) {
											new Notice(`“${value}”已映射到“${existingMapping}”`);
											text.inputEl.value = currentAlias;
										} else {
											await propertyAliasService.setAlias(value, meta.canonical);
											this.refreshSettings();
										}
									}
								})();
							});
						})
						.addExtraButton(button => {
							button.setIcon('x').setTooltip('清除别名').onClick(async () => {
								if (currentAlias) {
									await propertyAliasService.removeAlias(currentAlias);
									this.refreshSettings();
								}
							});
							button.extraSettingsEl.addClass(currentAlias ? 'cr-clear-btn--enabled' : 'cr-clear-btn--disabled');
						});
				});
			}
		});
	}

	/**
	 * Render a collapsible value alias section
	 */
	private renderValueAliasSection(
		container: HTMLElement,
		title: string,
		field: ValueAliasField,
		canonicalValues: readonly string[],
		valueLabels: Record<string, string>,
		valueAliasService: ValueAliasService
	): void {
		const aliases = valueAliasService.getAliases(field);
		const aliasCount = Object.keys(aliases).length;

		// Create collapsible section
		const section = container.createEl('details', { cls: 'cr-property-section' });
		const summary = section.createEl('summary', { cls: 'cr-property-section-summary' });
		summary.createSpan({ text: title, cls: 'cr-property-section-title' });
		summary.createSpan({
			text: `${aliasCount}${pluralize(aliasCount, '个别名', '个别名')}`,
			cls: 'cr-property-section-count'
		});

		const sectionContent = section.createDiv({ cls: 'cr-property-section-content' });

		// Lazy render on first open
		let rendered = false;
		section.addEventListener('toggle', () => {
			if (section.open && !rendered) {
				rendered = true;
				canonicalValues.forEach(canonicalValue => {
					// Find existing alias for this canonical value
					const userValue = Object.entries(aliases).find(
						([_, canonical]) => canonical === canonicalValue
					)?.[0] || '';

					const valueLabel = valueLabels[canonicalValue] || canonicalValue;

					new Setting(sectionContent)
						.setName(valueLabel)
						.setDesc(canonicalValue)
						.addText(text => {
							text.setPlaceholder('你的值').setValue(userValue);
							text.inputEl.addEventListener('blur', () => {
								void (async () => {
									const value = text.inputEl.value.trim();
									if (value === '') {
										if (userValue) {
											await valueAliasService.removeAlias(field, userValue);
											this.refreshSettings();
										}
									} else if (value.toLowerCase() !== canonicalValue.toLowerCase() && value !== userValue) {
										const existingMapping = aliases[value.toLowerCase()];
										if (existingMapping && existingMapping !== canonicalValue) {
											new Notice(`“${value}”已映射到“${existingMapping}”`);
											text.inputEl.value = userValue;
										} else {
											if (userValue) {
												await valueAliasService.removeAlias(field, userValue);
											}
											await valueAliasService.setAlias(field, value, canonicalValue);
											this.refreshSettings();
										}
									}
								})();
							});
						})
						.addExtraButton(button => {
							button.setIcon('x').setTooltip('清除别名').onClick(async () => {
								if (userValue) {
									await valueAliasService.removeAlias(field, userValue);
									this.refreshSettings();
								}
							});
							button.extraSettingsEl.addClass(userValue ? 'cr-clear-btn--enabled' : 'cr-clear-btn--disabled');
						});
				});
			}
		});
	}

	/**
	 * Render the media folders list with add/remove and drag-drop functionality
	 */
	private renderMediaFoldersList(container: HTMLElement): void {
		container.empty();

		const folders = this.plugin.settings.mediaFolders;

		// State for drag and drop
		let draggedIndex = -1;

		// Render existing folders
		for (let i = 0; i < folders.length; i++) {
			const folder = folders[i];
			const row = container.createDiv({ cls: 'cr-media-folder-row' });

			// Make row draggable
			row.setAttribute('draggable', 'true');

			// Drag handle
			const dragHandle = row.createSpan({ cls: 'cr-media-folder-handle' });
			setIcon(dragHandle, 'grip-vertical');

			// Folder icon
			const iconEl = row.createSpan({ cls: 'cr-media-folder-icon' });
			setIcon(iconEl, 'folder');

			// Folder path text
			row.createSpan({ cls: 'cr-media-folder-path', text: folder });

			// Remove button
			const removeBtn = row.createSpan({ cls: 'cr-media-folder-remove' });
			setIcon(removeBtn, 'x');
			removeBtn.setAttribute('aria-label', '移除文件夹');

			removeBtn.addEventListener('click', () => {
				this.plugin.settings.mediaFolders = folders.filter((_, idx) => idx !== i);
				void this.plugin.saveSettings().then(() => {
					this.renderMediaFoldersList(container);
				});
			});

			// Drag and drop event handlers
			row.addEventListener('dragstart', (e: DragEvent) => {
				draggedIndex = i;
				row.addClass('cr-media-folder-row--dragging');
				if (e.dataTransfer) {
					e.dataTransfer.effectAllowed = 'move';
					e.dataTransfer.setData('text/plain', i.toString());
				}
			});

			row.addEventListener('dragend', () => {
				row.removeClass('cr-media-folder-row--dragging');
				// Remove drag-over indicators from all rows
				container.querySelectorAll('.cr-media-folder-row').forEach(r => {
					r.removeClass('cr-media-folder-row--drag-over');
				});
			});

			row.addEventListener('dragover', (e: DragEvent) => {
				e.preventDefault();
				if (e.dataTransfer) {
					e.dataTransfer.dropEffect = 'move';
				}
			});

			row.addEventListener('dragenter', (e: DragEvent) => {
				e.preventDefault();
				if (i !== draggedIndex) {
					row.addClass('cr-media-folder-row--drag-over');
				}
			});

			row.addEventListener('dragleave', (e: DragEvent) => {
				// Only remove class if we're actually leaving the row
				const relatedTarget = e.relatedTarget as HTMLElement;
				if (!row.contains(relatedTarget)) {
					row.removeClass('cr-media-folder-row--drag-over');
				}
			});

			row.addEventListener('drop', (e: DragEvent) => {
				e.preventDefault();

				if (draggedIndex === -1 || draggedIndex === i) {
					return;
				}

				// Reorder the folders array
				const newFolders = [...folders];
				const [movedFolder] = newFolders.splice(draggedIndex, 1);
				newFolders.splice(i, 0, movedFolder);

				this.plugin.settings.mediaFolders = newFolders;
				void this.plugin.saveSettings().then(() => {
					this.renderMediaFoldersList(container);
				});
			});
		}

		// Add folder row
		const addRow = container.createDiv({ cls: 'cr-media-folder-add-row' });

		// Create a wrapper for the text input with folder suggest
		const inputWrapper = addRow.createDiv({ cls: 'cr-media-folder-input-wrapper' });

		const addSetting = new Setting(inputWrapper)
			.addText(text => {
				text.setPlaceholder('添加媒体文件夹…');

				// Attach folder autocomplete
				new FolderSuggest(this.app, text, (value) => {
					if (value.trim() && !folders.includes(value.trim())) {
						this.plugin.settings.mediaFolders = [...folders, value.trim()];
						void this.plugin.saveSettings().then(() => {
							this.renderMediaFoldersList(container);
						});
					}
				});

				// Also handle Enter key
				text.inputEl.addEventListener('keydown', (e) => {
					if (e.key === 'Enter') {
						const value = text.inputEl.value.trim();
						if (value && !folders.includes(value)) {
							this.plugin.settings.mediaFolders = [...folders, value];
							void this.plugin.saveSettings().then(() => {
								this.renderMediaFoldersList(container);
							});
						}
					}
				});
			});

		// Remove the default styling from the Setting
		addSetting.settingEl.addClass('cr-media-folder-add-setting');
	}

	/**
	 * Render the category folder rules list with add/remove functionality
	 */
	private renderCategoryFolderRules(container: HTMLElement): void {
		container.empty();

		const rules = this.plugin.settings.placeCategoryFolderRules || [];

		// Get categories that already have rules
		const usedCategories = new Set(rules.map(r => r.category));

		// Render existing rules
		for (let i = 0; i < rules.length; i++) {
			const rule = rules[i];
			const ruleRow = container.createDiv({ cls: 'cr-category-folder-rule' });

			// Category label
			const categoryLabel = PLACE_CATEGORY_LABELS[rule.category as keyof typeof PLACE_CATEGORY_LABELS] || rule.category;
			ruleRow.createSpan({ cls: 'cr-category-folder-rule-category', text: categoryLabel });

			// Arrow
			ruleRow.createSpan({ cls: 'cr-category-folder-rule-arrow', text: '→' });

			// Folder path (editable)
			const folderInput = ruleRow.createEl('input', {
				cls: 'cr-category-folder-rule-folder',
				attr: {
					type: 'text',
					value: rule.folder,
					placeholder: categoryLabel
				}
			});

			folderInput.addEventListener('change', () => {
				void (async () => {
					const newFolder = folderInput.value.trim();
					if (newFolder) {
						this.plugin.settings.placeCategoryFolderRules[i].folder = newFolder;
					} else {
						// Remove rule if folder is cleared
						this.plugin.settings.placeCategoryFolderRules.splice(i, 1);
					}
					await this.plugin.saveSettings();
					this.renderCategoryFolderRules(container);
				})();
			});

			// Remove button
			const removeBtn = ruleRow.createSpan({ cls: 'cr-category-folder-rule-remove' });
			setIcon(removeBtn, 'x');
			removeBtn.setAttribute('aria-label', '移除覆盖');

			removeBtn.addEventListener('click', () => {
				void (async () => {
					this.plugin.settings.placeCategoryFolderRules.splice(i, 1);
					await this.plugin.saveSettings();
					this.renderCategoryFolderRules(container);
				})();
			});
		}

		// Add new rule row (only show if there are unused categories)
		const availableCategories = CANONICAL_PLACE_CATEGORIES.filter(c => !usedCategories.has(c));

		if (availableCategories.length > 0) {
			const addRow = container.createDiv({ cls: 'cr-category-folder-rule cr-category-folder-rule--add' });

			// Category dropdown
			const categorySelect = addRow.createEl('select', { cls: 'cr-category-folder-rule-select' });
			categorySelect.createEl('option', { value: '', text: '添加覆盖…' });
			for (const cat of availableCategories) {
				const label = PLACE_CATEGORY_LABELS[cat] || cat;
				categorySelect.createEl('option', { value: cat, text: label });
			}

			// Arrow (hidden initially)
			const arrow = addRow.createSpan({ cls: 'cr-category-folder-rule-arrow', text: '→' });
			arrow.hide();

			// Folder input (hidden initially)
			const folderInput = addRow.createEl('input', {
				cls: 'cr-category-folder-rule-folder',
				attr: {
					type: 'text',
					placeholder: '子文件夹路径'
				}
			});
			folderInput.hide();

			// Show folder input when category is selected
			categorySelect.addEventListener('change', () => {
				const selectedCategory = categorySelect.value as PlaceCategory;
				if (selectedCategory) {
					arrow.show();
					folderInput.show();
					// Set placeholder to default folder name
					const label = PLACE_CATEGORY_LABELS[selectedCategory as keyof typeof PLACE_CATEGORY_LABELS] || selectedCategory;
					folderInput.placeholder = label;
					folderInput.focus();
				} else {
					arrow.hide();
					folderInput.hide();
				}
			});

			// Add rule when folder is entered
			folderInput.addEventListener('keydown', (e) => {
				if (e.key === 'Enter') {
					const selectedCategory = categorySelect.value as PlaceCategory;
					const folder = folderInput.value.trim();
					if (selectedCategory && folder) {
						void (async () => {
							const newRule: PlaceCategoryFolderRule = {
								category: selectedCategory,
								folder: folder
							};
							this.plugin.settings.placeCategoryFolderRules.push(newRule);
							await this.plugin.saveSettings();
							this.renderCategoryFolderRules(container);
						})();
					}
				}
			});

			// Also add on blur if there's a value
			folderInput.addEventListener('blur', () => {
				const selectedCategory = categorySelect.value as PlaceCategory;
				const folder = folderInput.value.trim();
				if (selectedCategory && folder) {
					void (async () => {
						const newRule: PlaceCategoryFolderRule = {
							category: selectedCategory,
							folder: folder
						};
						this.plugin.settings.placeCategoryFolderRules.push(newRule);
						await this.plugin.saveSettings();
						this.renderCategoryFolderRules(container);
					})();
				}
			});
		}
	}
}

/**
 * Inline suggest for folder paths with autocomplete from existing vault folders
 */
class FolderSuggest extends AbstractInputSuggest<TFolder> {
	private textComponent: TextComponent;
	private onSelectValue: (value: string) => void;

	constructor(app: App, textComponent: TextComponent, onSelectValue: (value: string) => void) {
		super(app, textComponent.inputEl);
		this.textComponent = textComponent;
		this.onSelectValue = onSelectValue;
	}

	getSuggestions(inputStr: string): TFolder[] {
		const lowerInput = inputStr.toLowerCase();
		const folders: TFolder[] = [];

		// Get all folders from the vault
		const rootFolder = this.app.vault.getRoot();
		this.collectFolders(rootFolder, folders);

		// Filter by input
		return folders
			.filter(folder => folder.path.toLowerCase().includes(lowerInput))
			.sort((a, b) => a.path.localeCompare(b.path))
			.slice(0, 20); // Limit results
	}

	private collectFolders(folder: TFolder, result: TFolder[]): void {
		for (const child of folder.children) {
			if (child instanceof TFolder) {
				result.push(child);
				this.collectFolders(child, result);
			}
		}
	}

	renderSuggestion(folder: TFolder, el: HTMLElement): void {
		el.addClass('cr-folder-suggestion');
		const iconSpan = el.createSpan({ cls: 'cr-folder-suggestion-icon' });
		setIcon(iconSpan, 'folder');
		el.createSpan({ text: folder.path });
	}

	selectSuggestion(folder: TFolder): void {
		this.textComponent.setValue(folder.path);
		this.onSelectValue(folder.path);
		this.close();
	}
}