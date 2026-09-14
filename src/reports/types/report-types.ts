/**
 * Report Types
 *
 * Type definitions for the Reports module.
 */

/**
 * Available report types
 */
export type ReportType =
	| 'family-group-sheet'
	| 'individual-summary'
	| 'ahnentafel'
	| 'gaps-report'
	| 'register-report'
	| 'pedigree-chart'
	| 'descendant-chart'
	| 'source-summary'
	| 'sources-by-role'
	| 'timeline-report'
	| 'place-summary'
	| 'media-inventory'
	| 'universe-overview'
	| 'collection-overview'
	// Visual tree reports (graphical PDF output)
	| 'pedigree-tree-pdf'
	| 'descendant-tree-pdf'
	| 'hourglass-tree-pdf'
	| 'fan-chart-pdf'
	// Research document export
	| 'research-report-export'
	// Research analysis reports
	| 'brick-wall-report'
	| 'unconnected-people'
	| 'kinship-report';

/**
 * Report categories for UI organization
 */
export type ReportCategory =
	| 'genealogical'
	| 'research'
	| 'timeline'
	| 'geographic'
	| 'summary'
	| 'visual-trees';

/**
 * Base options for all reports
 */
export interface ReportOptions {
	/** Output method */
	outputMethod: 'vault' | 'download' | 'pdf' | 'odt';
	/** Output folder path (for vault output) */
	outputFolder?: string;
	/** Custom filename (without extension) */
	filename?: string;
	/** Include source citations */
	includeSources: boolean;
}

/**
 * Options for Family Group Sheet report
 */
export interface FamilyGroupSheetOptions extends ReportOptions {
	/** CR ID of the primary person */
	personCrId: string;
	/** Include children in the report */
	includeChildren: boolean;
	/** Include detailed spouse information */
	includeSpouseDetails: boolean;
	/** Include events (marriage, etc.) */
	includeEvents: boolean;
}

/**
 * Options for Individual Summary report
 */
export interface IndividualSummaryOptions extends ReportOptions {
	/** CR ID of the person */
	personCrId: string;
	/** Include life events */
	includeEvents: boolean;
	/** Include family relationships */
	includeFamily: boolean;
	/** Include occupation and other attributes */
	includeAttributes: boolean;
}

/**
 * Options for Ahnentafel report
 */
export interface AhnentafelOptions extends ReportOptions {
	/** CR ID of the root person */
	rootPersonCrId: string;
	/** Maximum number of generations to include */
	maxGenerations: number;
	/** Include dates and places */
	includeDetails: boolean;
}

/**
 * Options for Gaps Report
 */
export interface GapsReportOptions extends ReportOptions {
	/** Scope of the report */
	scope: 'all' | 'collection';
	/** Collection path (if scope is 'collection') */
	collectionPath?: string;
	/** Fields to check for missing data */
	fieldsToCheck: {
		birthDate: boolean;
		deathDate: boolean;
		parents: boolean;
		sources: boolean;
	};
	/** Maximum number of items per category */
	maxItemsPerCategory: number;
	/** Research level filter: only include people at or below this level (0-6, undefined = all) */
	researchLevelMax?: number;
	/** Include people with no research level set */
	includeUnassessed?: boolean;
	/** Sort by research level (lowest first = most needs work) */
	sortByResearchLevel?: boolean;
}

/**
 * Options for Register Report (NGSQ-style descendant report)
 */
export interface RegisterReportOptions extends ReportOptions {
	/** CR ID of the root ancestor */
	rootPersonCrId: string;
	/** Maximum number of generations to include */
	maxGenerations: number;
	/** Include dates and places */
	includeDetails: boolean;
	/** Include spouse information */
	includeSpouses: boolean;
}

/**
 * Options for Pedigree Chart (ancestor tree)
 */
export interface PedigreeChartOptions extends ReportOptions {
	/** CR ID of the root person */
	rootPersonCrId: string;
	/** Maximum number of generations to include */
	maxGenerations: number;
	/** Include dates and places */
	includeDetails: boolean;
}

/**
 * Options for Descendant Chart
 */
export interface DescendantChartOptions extends ReportOptions {
	/** CR ID of the root ancestor */
	rootPersonCrId: string;
	/** Maximum number of generations to include */
	maxGenerations: number;
	/** Include dates and places */
	includeDetails: boolean;
	/** Include spouse information */
	includeSpouses: boolean;
}

/**
 * Options for Source Summary report
 */
export interface SourceSummaryOptions extends ReportOptions {
	/** CR ID of the person */
	personCrId: string;
	/** Include children's sources */
	includeChildrenSources: boolean;
	/** Grouping method */
	groupBy: 'fact_type' | 'source_type' | 'quality' | 'chronological';
	/** Show quality ratings */
	showQualityRatings: boolean;
	/** Include citation details */
	includeCitationDetails: boolean;
	/** Show repository info */
	showRepositoryInfo: boolean;
	/** Highlight unsourced facts */
	highlightGaps: boolean;
}

/**
 * Options for Sources by Role report (#219)
 */
export interface SourcesByRoleOptions extends ReportOptions {
	/** CR ID of the person */
	personCrId: string;
	/** Role types to include (empty = all roles) */
	roleFilter: string[];
	/** Grouping method */
	groupBy: 'role' | 'source' | 'chronological';
	/** Show role details (e.g., "Decedent", "Administrator") */
	showRoleDetails: boolean;
	/** Show source quality ratings */
	showSourceQuality: boolean;
	/** Show repository info */
	showRepositoryInfo: boolean;
}

/**
 * Timeline export format types
 */
export type TimelineExportFormat =
	| 'markdown_table'
	| 'markdown_callout'
	| 'markdown_list'
	| 'markdown_dataview'
	| 'canvas'
	| 'excalidraw'
	| 'pdf'
	| 'odt';

/**
 * Canvas/Excalidraw layout styles
 */
export type TimelineLayoutStyle = 'horizontal' | 'vertical' | 'gantt';

/**
 * Canvas/Excalidraw color schemes
 */
export type TimelineColorScheme = 'event_type' | 'category' | 'confidence' | 'monochrome';

/**
 * Options for Canvas export format
 */
export interface TimelineCanvasExportOptions {
	/** Layout style */
	layoutStyle: TimelineLayoutStyle;
	/** Color scheme */
	colorScheme: TimelineColorScheme;
	/** Include ordering edges (before/after relationships) */
	includeOrderingEdges: boolean;
	/** Node dimensions */
	nodeWidth?: number;
	nodeHeight?: number;
	/** Spacing between nodes */
	spacingX?: number;
	spacingY?: number;
}

/**
 * Options for Excalidraw export format
 */
export interface TimelineExcalidrawExportOptions extends TimelineCanvasExportOptions {
	/** Drawing style */
	drawingStyle: 'architect' | 'artist' | 'cartoonist';
	/** Font family */
	fontFamily: string;
	/** Stroke width */
	strokeWidth: 'thin' | 'normal' | 'bold' | 'extra-bold';
}

/**
 * Options for Markdown callout format
 */
export interface TimelineCalloutExportOptions {
	/** Callout type name (e.g., 'cr-timeline', 'timeline', 'event', or custom) */
	calloutType: string;
}

/**
 * Options for Timeline Report
 */
export interface TimelineReportOptions extends ReportOptions {
	/** Start date filter (optional) */
	dateFrom?: string;
	/** End date filter (optional) */
	dateTo?: string;
	/** Event types to include (empty = all) */
	eventTypes: string[];
	/** Person filter (CR IDs, empty = all) */
	personFilter: string[];
	/** Place filter (CR IDs, empty = all) */
	placeFilter: string[];
	/** Include child places in filter */
	includeChildPlaces: boolean;
	/** Grouping method */
	grouping: 'none' | 'by_year' | 'by_decade' | 'by_person' | 'by_place';
	/** Include event descriptions */
	includeDescriptions: boolean;
	/** Universe filter (optional) */
	universeCrId?: string;
	/** Group/faction filter (optional) */
	groupFilter?: string;
	/** Export format (default: markdown_table for backwards compatibility) */
	format?: TimelineExportFormat;
	/** Canvas-specific options */
	canvasOptions?: TimelineCanvasExportOptions;
	/** Excalidraw-specific options */
	excalidrawOptions?: TimelineExcalidrawExportOptions;
	/** Callout-specific options */
	calloutOptions?: TimelineCalloutExportOptions;
}

/**
 * Options for Place Summary report
 */
export interface PlaceSummaryOptions extends ReportOptions {
	/** CR ID of the place */
	placeCrId: string;
	/** Include child places */
	includeChildPlaces: boolean;
	/** Start date filter (optional) */
	dateFrom?: string;
	/** End date filter (optional) */
	dateTo?: string;
	/** Event types to include (empty = all) */
	eventTypes: string[];
	/** Show coordinates */
	showCoordinates: boolean;
	/** Show place hierarchy */
	showHierarchy: boolean;
	/** Include map reference (future) */
	includeMapReference: boolean;
}

/**
 * Options for Media Inventory report
 */
export interface MediaInventoryOptions extends ReportOptions {
	/** Scope of the report */
	scope: 'all' | 'sources_only' | 'by_folder';
	/** Folder path (if scope is 'by_folder') */
	folderPath?: string;
	/** Show orphaned files */
	showOrphanedFiles: boolean;
	/** Show coverage gaps (entities without media) */
	showCoverageGaps: boolean;
	/** Grouping method */
	groupBy: 'entity_type' | 'folder' | 'file_type';
	/** Include file sizes */
	includeFileSizes: boolean;
}

/**
 * Options for Universe Overview report
 */
export interface UniverseOverviewOptions extends ReportOptions {
	/** CR ID of the universe */
	universeCrId: string;
	/** Include entity list */
	includeEntityList: boolean;
	/** Show geographic summary */
	showGeographicSummary: boolean;
	/** Show date systems */
	showDateSystems: boolean;
	/** Show recent activity */
	showRecentActivity: boolean;
	/** Max entities per type in list */
	maxEntitiesPerType: number;
}

/**
 * Options for Collection Overview report
 */
export interface CollectionOverviewOptions extends ReportOptions {
	/** Collection identifier (path for user collections, component ID for auto-detected) */
	collectionId: string;
	/** Collection type */
	collectionType: 'user' | 'component';
	/** Include member list */
	includeMemberList: boolean;
	/** Show generation analysis */
	showGenerationAnalysis: boolean;
	/** Show geographic distribution */
	showGeographicDistribution: boolean;
	/** Show surname distribution */
	showSurnameDistribution: boolean;
	/** Member sort order */
	sortMembersBy: 'birth_date' | 'name' | 'death_date';
	/** Max members in list */
	maxMembers: number;
}

/**
 * Options for Research Report Export
 */
export interface ResearchReportExportOptions extends ReportOptions {
	/** Path to the markdown note to export */
	notePath: string;
	/** Optional custom title (overrides note title) */
	customTitle?: string;
}

/**
 * Sort order for brick wall report
 */
export type BrickWallSortOrder = 'generation' | 'name' | 'research_level';

/**
 * Options for Brick Wall Report (#297)
 */
export interface BrickWallReportOptions extends ReportOptions {
	/** CR ID of the root person */
	rootPersonCrId: string;
	/** Maximum number of generations to traverse */
	maxGenerations: number;
	/** Include dates and places */
	includeDetails: boolean;
	/** Sort order for brick wall entries */
	sortBy: BrickWallSortOrder;
}

/**
 * Options for Unconnected People report (#298)
 */
export interface UnconnectedPeopleOptions extends ReportOptions {
	/** CR ID of the root person (defines the "main" network) */
	rootPersonCrId: string;
}

/**
 * Sort order for kinship report
 */
export type KinshipSortOrder = 'degree' | 'name' | 'relationship';

/**
 * Options for Kinship Report (#300)
 */
export interface KinshipReportOptions extends ReportOptions {
	/** CR ID of the root person */
	rootPersonCrId: string;
	/** Maximum degree of relationship to include (default 20) */
	maxDegree: number;
	/** Sort order */
	sortBy: KinshipSortOrder;
}

/**
 * Person data used in reports
 */
export interface ReportPerson {
	crId: string;
	name: string;
	birthDate?: string;
	birthPlace?: string;
	deathDate?: string;
	deathPlace?: string;
	sex?: 'male' | 'female' | 'other' | 'unknown';
	pronouns?: string | string[];
	occupation?: string;
	filePath: string;
	/** Research level (0-6) based on Hoitink's Six Levels */
	researchLevel?: number;
}

/**
 * Event data used in reports
 */
export interface ReportEvent {
	type: string;
	date?: string;
	place?: string;
	description?: string;
	sources: string[];
}

/**
 * Result of report generation
 */
export interface ReportResult {
	/** Whether generation succeeded */
	success: boolean;
	/** Generated markdown content */
	content: string;
	/** Suggested filename */
	suggestedFilename: string;
	/** Statistics about the report */
	stats: {
		/** Number of people included */
		peopleCount: number;
		/** Number of events included */
		eventsCount: number;
		/** Number of sources cited */
		sourcesCount: number;
		/** Number of generations (for Ahnentafel) */
		generationsCount?: number;
	};
	/** Error message if failed */
	error?: string;
	/** Warnings during generation */
	warnings: string[];
}

/**
 * Family Group Sheet result
 */
/** Marriage data for Family Group Sheet (#370) */
export interface ReportMarriage {
	spouseCrId: string;
	date?: string;
	place?: string;
}

export interface FamilyGroupSheetResult extends ReportResult {
	/** Primary person */
	primaryPerson: ReportPerson;
	/** Spouse(s) */
	spouses: ReportPerson[];
	/** Marriage data per spouse (#370) */
	marriages: ReportMarriage[];
	/** Children */
	children: ReportPerson[];
}

/**
 * Individual Summary result
 */
export interface IndividualSummaryResult extends ReportResult {
	/** The person */
	person: ReportPerson;
	/** Life events */
	events: ReportEvent[];
}

/**
 * Ahnentafel result
 */
export interface AhnentafelResult extends ReportResult {
	/** Root person */
	rootPerson: ReportPerson;
	/** Ancestors by Sosa-Stradonitz number */
	ancestors: Map<number, ReportPerson>;
}

/**
 * Gaps Report result
 */
export interface GapsReportResult extends ReportResult {
	/** Summary statistics */
	summary: {
		totalPeople: number;
		missingBirthDate: number;
		missingDeathDate: number;
		missingParents: number;
		unsourced: number;
		/** Research level breakdown */
		byResearchLevel: {
			/** Count of people at each level (0-6) */
			levels: Record<number, number>;
			/** Count of people without research level set */
			unassessed: number;
			/** Count at levels 0-2 (needs significant work) */
			needsWork: number;
			/** Count at levels 3-4 (partially researched) */
			partial: number;
			/** Count at levels 5-6 (well researched) */
			complete: number;
		};
	};
	/** People missing birth dates */
	missingBirthDates: ReportPerson[];
	/** People missing death dates (excluding living) */
	missingDeathDates: ReportPerson[];
	/** People missing parents */
	missingParents: ReportPerson[];
	/** People without source citations */
	unsourcedPeople: ReportPerson[];
}

/**
 * Register Report entry with NGSQ numbering
 */
export interface RegisterEntry {
	/** NGSQ-style number (e.g., "1", "2", "3i", "3ii") */
	registerNumber: string;
	/** Person data */
	person: ReportPerson;
	/** Generation number (1 = root, 2 = children, etc.) */
	generation: number;
	/** Whether this person has descendants in the report */
	hasDescendants: boolean;
	/** Reference number for descendants (the number they are listed under) */
	descendantRef?: string;
	/** Spouses */
	spouses: ReportPerson[];
	/** Children (with their register numbers if they continue the line) */
	children: Array<{ person: ReportPerson; registerNumber?: string }>;
}

/**
 * Register Report result
 */
export interface RegisterReportResult extends ReportResult {
	/** Root ancestor */
	rootPerson: ReportPerson;
	/** All entries in register order */
	entries: RegisterEntry[];
}

/**
 * Pedigree Chart result
 */
export interface PedigreeChartResult extends ReportResult {
	/** Root person */
	rootPerson: ReportPerson;
	/** Ancestor lines as formatted tree text */
	treeContent: string;
}

/**
 * Descendant entry for chart
 */
export interface DescendantEntry {
	/** Person data */
	person: ReportPerson;
	/** Indentation level (0 = root) */
	level: number;
	/** Spouses (if included) */
	spouses: ReportPerson[];
}

/**
 * Descendant Chart result
 */
export interface DescendantChartResult extends ReportResult {
	/** Root ancestor */
	rootPerson: ReportPerson;
	/** All descendants in tree order */
	entries: DescendantEntry[];
}

/**
 * Source entry for Source Summary report
 */
export interface SourceEntry {
	/** Source CR ID */
	crId: string;
	/** Source title */
	title: string;
	/** Source type (e.g., vital record, census) */
	sourceType?: string;
	/** Quality classification */
	quality?: 'primary' | 'secondary' | 'derivative' | 'undetermined';
	/** Citation text */
	citation?: string;
	/** Repository name */
	repository?: string;
	/** Mills source classification */
	sourceClassification?: 'original' | 'derivative' | 'authored_narrative';
	/** Mills information classification */
	informationClassification?: 'primary' | 'secondary' | 'undetermined';
	/** Mills evidence classification */
	evidenceClassification?: 'direct' | 'indirect' | 'negative';
	/** Fact types this source supports */
	factTypes: string[];
	/** Citation page reference (from citation notes) */
	page?: string;
	/** Citation quality assessment 0-3 (from citation notes) */
	citationQuality?: number;
}

/**
 * Source Summary result
 */
export interface SourceSummaryResult extends ReportResult {
	/** Subject person */
	person: ReportPerson;
	/** Summary statistics */
	summary: {
		totalSources: number;
		primaryCount: number;
		secondaryCount: number;
		derivativeCount: number;
		unsourcedFactCount: number;
	};
	/** Sources by fact type */
	sourcesByFactType: Record<string, SourceEntry[]>;
	/** Unsourced facts */
	unsourcedFacts: string[];
	/** Repository summary */
	repositories: Array<{ name: string; sourceCount: number }>;
}

/**
 * Role entry for Sources by Role report (#219)
 */
export interface SourceRoleEntry {
	/** Source data */
	source: SourceEntry;
	/** Role category */
	role: string;
	/** Role label (display name) */
	roleLabel: string;
	/** Role details (e.g., "Decedent", "Administrator") */
	details?: string;
	/** Source date */
	date?: string;
}

/**
 * Sources by Role result (#219)
 */
export interface SourcesByRoleResult extends ReportResult {
	/** Subject person */
	person: ReportPerson;
	/** Summary statistics */
	summary: {
		totalSources: number;
		byRole: Record<string, number>;
	};
	/** Entries grouped by role */
	entriesByRole: Record<string, SourceRoleEntry[]>;
	/** All entries (for flat/chronological views) */
	allEntries: SourceRoleEntry[];
}

/**
 * Timeline entry
 */
export interface TimelineEntry {
	/** Event date */
	date: string;
	/** Event date (sortable format) */
	sortDate: string;
	/** Event type */
	type: string;
	/** Event note title (for wikilinks) */
	eventName: string;
	/** Event description */
	description?: string;
	/** Participants */
	participants: ReportPerson[];
	/** Place name */
	place?: string;
	/** Place CR ID */
	placeCrId?: string;
	/** Source references */
	sources: string[];
}

/**
 * Timeline Report result
 */
export interface TimelineReportResult extends ReportResult {
	/** Date range */
	dateRange: { from?: string; to?: string };
	/** Summary statistics */
	summary: {
		eventCount: number;
		participantCount: number;
		placeCount: number;
	};
	/** Timeline entries (chronological) */
	entries: TimelineEntry[];
	/** Entries grouped (if grouping enabled) */
	groupedEntries?: Record<string, TimelineEntry[]>;
}

/**
 * Place Summary result
 */
export interface PlaceSummaryResult extends ReportResult {
	/** Subject place */
	place: {
		crId: string;
		name: string;
		type?: string;
		hierarchy: string[];
		coordinates?: { lat: number; lng: number };
	};
	/** Summary statistics */
	summary: {
		eventCount: number;
		personCount: number;
		dateRange: { earliest?: string; latest?: string };
	};
	/** People born here */
	births: Array<{ person: ReportPerson; date?: string }>;
	/** People died here */
	deaths: Array<{ person: ReportPerson; date?: string }>;
	/** People married here */
	marriages: Array<{ couple: string; date?: string }>;
	/** People who resided here */
	residences: Array<{ person: ReportPerson; period?: string }>;
	/** Other events */
	otherEvents: TimelineEntry[];
}

/**
 * Media file entry
 */
export interface MediaFileEntry {
	/** File path */
	path: string;
	/** File name */
	name: string;
	/** File extension */
	extension: string;
	/** File size in bytes */
	size?: number;
	/** Linked entities */
	linkedEntities: Array<{ crId: string; name: string; type: string }>;
	/** Is orphaned (no links) */
	isOrphaned: boolean;
}

/**
 * Media Inventory result
 */
export interface MediaInventoryResult extends ReportResult {
	/** Summary statistics */
	summary: {
		totalFiles: number;
		linkedCount: number;
		orphanedCount: number;
		totalSize?: number;
	};
	/** File type breakdown */
	byFileType: Record<string, number>;
	/** Entity type breakdown (sources with media, etc.) */
	byEntityType: Record<string, number>;
	/** Linked media files */
	linkedMedia: MediaFileEntry[];
	/** Orphaned media files */
	orphanedMedia: MediaFileEntry[];
	/** Entities without media */
	entitiesWithoutMedia: Array<{ crId: string; name: string; type: string }>;
}

/**
 * Universe Overview result
 */
export interface UniverseOverviewResult extends ReportResult {
	/** Universe info */
	universe: {
		crId: string;
		name: string;
		description?: string;
	};
	/** Summary statistics */
	summary: {
		totalEntities: number;
		byType: Record<string, number>;
		dateRange?: { earliest?: string; latest?: string };
	};
	/** Calendar/date systems used */
	dateSystems: string[];
	/** Geographic summary */
	geographicSummary?: {
		placesWithCoordinates: number;
		totalPlaces: number;
	};
	/** Entity lists (if included) */
	entityLists?: Record<string, Array<{ crId: string; name: string }>>;
	/** Recently modified entities */
	recentActivity?: Array<{ crId: string; name: string; type: string; modified: string }>;
}

/**
 * Collection Overview result
 */
export interface CollectionOverviewResult extends ReportResult {
	/** Collection info */
	collection: {
		id: string;
		name: string;
		type: 'user' | 'component';
	};
	/** Summary statistics */
	summary: {
		memberCount: number;
		generationDepth: number;
		dateRange: { earliest?: string; latest?: string };
	};
	/** Member list */
	members: ReportPerson[];
	/** Generation analysis */
	generationAnalysis?: Record<number, number>;
	/** Geographic distribution */
	geographicDistribution?: Array<{ place: string; count: number }>;
	/** Surname distribution */
	surnameDistribution?: Array<{ surname: string; count: number }>;
}

/**
 * Research Report Export result
 */
export interface ResearchReportExportResult extends ReportResult {
	/** Title extracted from note frontmatter or filename */
	noteTitle: string;
	/** Word count of the content */
	wordCount: number;
	/** Number of footnotes found */
	footnoteCount: number;
}

/**
 * Brick wall entry — a terminal ancestor with no parents defined
 */
export interface BrickWallEntry {
	/** Person data */
	person: ReportPerson;
	/** Generation number (1 = self, 2 = parents, etc.) */
	generation: number;
	/** Ahnentafel / Sosa-Stradonitz number */
	ahnentafelNumber: number;
	/** Lineage path from root to this ancestor (e.g., "Father's mother's father") */
	lineagePath: string;
	/** Number of source notes linked to this person */
	sourceCount: number;
}

/**
 * Brick Wall Report result (#297)
 */
export interface BrickWallReportResult extends ReportResult {
	/** Root person */
	rootPerson: ReportPerson;
	/** Terminal ancestors (brick walls) */
	brickWalls: BrickWallEntry[];
	/** Summary statistics */
	summary: {
		/** Total ancestor slots searched */
		totalSlots: number;
		/** Ancestors found */
		ancestorsFound: number;
		/** Brick walls identified */
		brickWallCount: number;
		/** Deepest generation reached */
		maxGeneration: number;
		/** Completeness percentage (ancestors found / theoretical max) */
		completeness: number;
	};
}

/**
 * A disconnected component (group of people connected to each other but not to the main network)
 */
export interface DisconnectedComponent {
	/** Representative person (oldest by birth date) */
	representative: ReportPerson;
	/** All people in this component */
	people: ReportPerson[];
	/** Collection name if all members share one */
	collectionName?: string;
}

/**
 * Unconnected People report result (#298)
 */
export interface UnconnectedPeopleResult extends ReportResult {
	/** Root person defining the main network */
	rootPerson: ReportPerson;
	/** Size of the main connected component */
	mainComponentSize: number;
	/** Disconnected components (each is a group of mutually connected people not linked to the main network) */
	disconnectedComponents: DisconnectedComponent[];
	/** Total number of unconnected people */
	totalUnconnected: number;
	/** Total number of people in the vault */
	totalPeople: number;
	/** Completely isolated people (no relationships at all) */
	isolatedCount: number;
}

/**
 * A kinship entry — a person and their relationship to the root
 */
export interface KinshipEntry {
	/** Person data */
	person: ReportPerson;
	/** Relationship description (e.g., "2nd Cousin 1 time removed") */
	relationshipDescription: string;
	/** Total degree (generationsUp + generationsDown) */
	degree: number;
	/** Generations up to common ancestor */
	generationsUp: number;
	/** Generations down from common ancestor */
	generationsDown: number;
	/** Whether this is a blood relation (vs. by marriage) */
	isBloodRelation: boolean;
	/** Whether this person is on a direct line (ancestor or descendant) */
	isDirectLine: boolean;
}

/**
 * Kinship Report result (#300)
 */
export interface KinshipReportResult extends ReportResult {
	/** Root person */
	rootPerson: ReportPerson;
	/** All kinship entries */
	entries: KinshipEntry[];
	/** Summary statistics */
	summary: {
		totalRelatives: number;
		bloodRelatives: number;
		inLaws: number;
		maxDegreeFound: number;
		byCategory: Record<string, number>;
	};
}

/**
 * Report metadata for display
 */
export interface ReportMetadata {
	type: ReportType;
	name: string;
	description: string;
	icon: string;
	category: ReportCategory;
	/** Whether report requires a person/entity picker */
	requiresPerson: boolean;
	/** Type of entity required (person, place, universe, collection) */
	entityType?: 'person' | 'place' | 'universe' | 'collection';
	/** Hidden from user-facing pickers (e.g., catalog entry exists but renderer is incomplete) */
	hidden?: boolean;
}

/**
 * All report metadata
 */
export const REPORT_METADATA: Record<ReportType, ReportMetadata> = {
	// Genealogical reports
	'family-group-sheet': {
		type: 'family-group-sheet',
		name: '家族群组表',
		description: '配偶与子女、生平要点及来源',
		icon: 'users',
		category: 'genealogical',
		requiresPerson: true,
		entityType: 'person'
	},
	'individual-summary': {
		type: 'individual-summary',
		name: '个人摘要',
		description: '某个人的全部已知事实及来源引文',
		icon: 'user',
		category: 'genealogical',
		requiresPerson: true,
		entityType: 'person'
	},
	'ahnentafel': {
		type: 'ahnentafel',
		name: '祖先谱系报告',
		description: '带编号的祖先列表，可配置世代深度',
		icon: 'git-branch',
		category: 'genealogical',
		requiresPerson: true,
		entityType: 'person'
	},
	'register-report': {
		type: 'register-report',
		name: '世系登记报告',
		description: '采用 NGSQ 式谱系编号的后代',
		icon: 'list-ordered',
		category: 'genealogical',
		requiresPerson: true,
		entityType: 'person'
	},
	'pedigree-chart': {
		type: 'pedigree-chart',
		name: '谱系图',
		description: '以 Markdown 格式呈现的祖先树',
		icon: 'cr-pedigree-tree',
		category: 'genealogical',
		requiresPerson: true,
		entityType: 'person'
	},
	'descendant-chart': {
		type: 'descendant-chart',
		name: '后代图',
		description: '以 Markdown 格式呈现的后代树',
		icon: 'cr-descendant-tree',
		category: 'genealogical',
		requiresPerson: true,
		entityType: 'person'
	},

	// Research reports
	'source-summary': {
		type: 'source-summary',
		name: '来源摘要',
		description: '某个人的全部来源，按事实类型分组并附质量评级',
		icon: 'file-text',
		category: 'research',
		requiresPerson: true,
		entityType: 'person'
	},
	'sources-by-role': {
		type: 'sources-by-role',
		name: '按角色分类的来源',
		description: '某人以证人、信息提供者、官员等角色出现的来源',
		icon: 'users',
		category: 'research',
		requiresPerson: true,
		entityType: 'person'
	},
	'gaps-report': {
		type: 'gaps-report',
		name: '缺失报告',
		description: '缺失的重要记录与可继续研究的方向',
		icon: 'search',
		category: 'research',
		requiresPerson: false
	},
	'media-inventory': {
		type: 'media-inventory',
		name: '媒体清单',
		description: '审查媒体文件，查找孤立文件和覆盖缺口',
		icon: 'image',
		category: 'research',
		requiresPerson: false
	},
	'research-report-export': {
		type: 'research-report-export',
		name: '研究报告导出',
		description: '将研究报告笔记导出为 PDF 或 ODT',
		icon: 'file-text',
		category: 'research',
		requiresPerson: false
	},
	'brick-wall-report': {
		type: 'brick-wall-report',
		name: '研究瓶颈报告',
		description: '没有父母的断线祖先——指出应重点研究的位置',
		icon: 'alert-triangle',
		category: 'research',
		requiresPerson: true,
		entityType: 'person'
	},
	'unconnected-people': {
		type: 'unconnected-people',
		name: '未关联人物',
		description: '未与主要家族网络关联的人物——找出孤立记录',
		icon: 'unlink',
		category: 'research',
		requiresPerson: true,
		entityType: 'person'
	},
	'kinship-report': {
		type: 'kinship-report',
		name: '亲属关系报告',
		description: '某人的全部亲属及其称谓与亲属度数',
		icon: 'git-merge',
		category: 'genealogical',
		requiresPerson: true,
		entityType: 'person'
	},

	// Timeline reports
	'timeline-report': {
		type: 'timeline-report',
		name: '时间轴报告',
		description: '按时间顺序列出的事件，含日期、参与者和地点',
		icon: 'calendar',
		category: 'timeline',
		requiresPerson: false
	},

	// Geographic reports
	'place-summary': {
		type: 'place-summary',
		name: '地点摘要',
		description: '与某个地点相关的事件和人物',
		icon: 'map-pin',
		category: 'geographic',
		requiresPerson: false,
		entityType: 'place'
	},

	// Summary reports
	'universe-overview': {
		type: 'universe-overview',
		name: '宇宙概览',
		description: '某个宇宙的实体统计、日期范围和细分',
		icon: 'globe',
		category: 'summary',
		requiresPerson: true,
		entityType: 'universe'
	},
	'collection-overview': {
		type: 'collection-overview',
		name: '合集概览',
		description: '用户合集或家族组成部分的摘要',
		icon: 'folder',
		category: 'summary',
		requiresPerson: true,
		entityType: 'collection'
	},

	// Visual tree reports (graphical PDF output)
	'pedigree-tree-pdf': {
		type: 'pedigree-tree-pdf',
		name: '谱系树 PDF',
		description: '带定位方框和连线的图形化祖先树',
		icon: 'cr-pedigree-tree',
		category: 'visual-trees',
		requiresPerson: true,
		entityType: 'person'
	},
	'descendant-tree-pdf': {
		type: 'descendant-tree-pdf',
		name: '后代树 PDF',
		description: '向下分支的图形化后代树',
		icon: 'cr-descendant-tree',
		category: 'visual-trees',
		requiresPerson: true,
		entityType: 'person'
	},
	'hourglass-tree-pdf': {
		type: 'hourglass-tree-pdf',
		name: '沙漏树 PDF',
		description: '以某人为根，同时展示祖先和后代',
		icon: 'cr-hourglass-tree',
		category: 'visual-trees',
		requiresPerson: true,
		entityType: 'person'
	},
	'fan-chart-pdf': {
		type: 'fan-chart-pdf',
		name: '扇形图 PDF',
		description: '半圆形谱系，含放射状祖先扇区',
		icon: 'cr-fan-chart',
		category: 'visual-trees',
		requiresPerson: true,
		entityType: 'person',
		hidden: true
	}
};

/**
 * Category metadata for UI display
 */
export const REPORT_CATEGORY_METADATA: Record<ReportCategory, { name: string; description: string }> = {
	genealogical: {
		name: '谱系',
		description: '传统谱系报告'
	},
	research: {
		name: '研究',
		description: '研究追踪与来源记录'
	},
	timeline: {
		name: '时间轴',
		description: '按时间顺序的事件报告'
	},
	geographic: {
		name: '地理',
		description: '基于地点的报告'
	},
	summary: {
		name: '摘要',
		description: '合集与宇宙概览'
	},
	'visual-trees': {
		name: '可视化树',
		description: '图形化 PDF 树状图'
	}
};

/**
 * Get reports by category
 */
export function getReportsByCategory(category: ReportCategory): ReportMetadata[] {
	return Object.values(REPORT_METADATA).filter(r => r.category === category && !r.hidden);
}
