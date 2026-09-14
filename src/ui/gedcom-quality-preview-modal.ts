/**
 * GEDCOM Quality Preview Modal
 *
 * Shows data quality issues found in GEDCOM data before import,
 * allowing users to review and configure how issues should be handled.
 */

import { App, ButtonComponent, Modal } from 'obsidian';
import { createLucideIcon, setLucideIcon, LucideIconName } from './lucide-icons';
import type {
	GedcomQualityAnalysis,
	GedcomQualityIssue,
	QualityFixChoices,
	QualityIssueCategory,
	QualityIssueSeverity
} from '../gedcom/gedcom-quality-analyzer';

/**
 * Result of the quality preview modal
 */
export interface QualityPreviewResult {
	/** Whether to continue with import */
	proceed: boolean;
	/** User's fix choices */
	choices: QualityFixChoices;
}

/**
 * Options for the quality preview modal
 */
export interface QualityPreviewOptions {
	/** Callback when user makes a decision */
	onComplete: (result: QualityPreviewResult) => void;
}

/**
 * Tab configuration for issue categories
 */
interface TabConfig {
	id: QualityIssueCategory | 'places' | 'summary';
	label: string;
	icon: LucideIconName;
}

const TABS: TabConfig[] = [
	{ id: 'summary', label: '概览', icon: 'bar-chart' },
	{ id: 'places', label: '地点', icon: 'globe' },
	{ id: 'date', label: '日期', icon: 'calendar' },
	{ id: 'relationship', label: '关系', icon: 'users' },
	{ id: 'reference', label: '引用', icon: 'link' },
	{ id: 'data', label: '数据', icon: 'file-text' }
];

const SEVERITY_ICONS: Record<QualityIssueSeverity, LucideIconName> = {
	error: 'alert-circle',
	warning: 'alert-triangle',
	info: 'info'
};

const SEVERITY_CLASSES: Record<QualityIssueSeverity, string> = {
	error: 'crc-severity--error',
	warning: 'crc-severity--warning',
	info: 'crc-severity--info'
};

/**
 * Modal for previewing GEDCOM quality issues before import
 */
export class GedcomQualityPreviewModal extends Modal {
	private analysis: GedcomQualityAnalysis;
	private choices: QualityFixChoices;
	private onComplete: (result: QualityPreviewResult) => void;
	private activeTab: TabConfig['id'] = 'summary';
	private tabContentEl: HTMLElement | null = null;

	constructor(
		app: App,
		analysis: GedcomQualityAnalysis,
		options: QualityPreviewOptions
	) {
		super(app);
		this.analysis = analysis;
		this.choices = { ...analysis.defaultChoices };
		this.onComplete = options.onComplete;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		this.modalEl.addClass('crc-quality-preview-modal');
		this.modalEl.addClass('crc-batch-preview-modal');

		// Header
		const header = contentEl.createDiv({ cls: 'crc-modal-header' });
		const titleContainer = header.createDiv({ cls: 'crc-modal-title' });
		const titleIcon = createLucideIcon('clipboard-check', 24);
		titleContainer.appendChild(titleIcon);
		titleContainer.createEl('span', { text: '数据质量预览' });

		// Summary bar
		this.renderSummaryBar(contentEl);

		// Tabs
		const tabsContainer = contentEl.createDiv({ cls: 'crc-quality-tabs' });
		this.renderTabs(tabsContainer);

		// Tab content area
		this.tabContentEl = contentEl.createDiv({ cls: 'crc-quality-tab-content' });
		this.renderTabContent();

		// Action buttons
		this.renderActionButtons(contentEl);
	}

	onClose() {
		this.contentEl.empty();
	}

	/**
	 * Render the summary bar with issue counts
	 */
	private renderSummaryBar(container: HTMLElement): void {
		const { summary } = this.analysis;

		const summaryBar = container.createDiv({ cls: 'crc-quality-summary-bar' });

		// Record counts
		const recordsInfo = summaryBar.createDiv({ cls: 'crc-quality-summary-item' });
		recordsInfo.createEl('span', {
			text: `${summary.totalIndividuals} 位人物`,
			cls: 'crc-quality-summary-count'
		});
		recordsInfo.createEl('span', { text: ' · ', cls: 'crc-text--muted' });
		recordsInfo.createEl('span', {
			text: `${summary.totalFamilies} 个家族`,
			cls: 'crc-quality-summary-count'
		});
		recordsInfo.createEl('span', { text: ' · ', cls: 'crc-text--muted' });
		recordsInfo.createEl('span', {
			text: `${summary.uniquePlaces.length} 个不重复地点`,
			cls: 'crc-quality-summary-count'
		});

		// Issue counts by severity
		const issuesInfo = summaryBar.createDiv({ cls: 'crc-quality-summary-item' });

		if (summary.bySeverity.error > 0) {
			const errorBadge = issuesInfo.createSpan({ cls: 'crc-quality-badge crc-quality-badge--error' });
			setLucideIcon(errorBadge.createSpan(), 'alert-circle');
			errorBadge.createSpan({ text: ` ${summary.bySeverity.error}` });
		}

		if (summary.bySeverity.warning > 0) {
			const warnBadge = issuesInfo.createSpan({ cls: 'crc-quality-badge crc-quality-badge--warning' });
			setLucideIcon(warnBadge.createSpan(), 'alert-triangle');
			warnBadge.createSpan({ text: ` ${summary.bySeverity.warning}` });
		}

		if (summary.bySeverity.info > 0) {
			const infoBadge = issuesInfo.createSpan({ cls: 'crc-quality-badge crc-quality-badge--info' });
			setLucideIcon(infoBadge.createSpan(), 'info');
			infoBadge.createSpan({ text: ` ${summary.bySeverity.info}` });
		}

		if (summary.totalIssues === 0 && summary.placeVariants.length === 0) {
			issuesInfo.createEl('span', {
				text: '✓ 未发现问题',
				cls: 'crc-text--success'
			});
		}
	}

	/**
	 * Render the tab navigation
	 */
	private renderTabs(container: HTMLElement): void {
		const { summary } = this.analysis;

		for (const tab of TABS) {
			const tabBtn = container.createEl('button', {
				cls: `crc-quality-tab ${this.activeTab === tab.id ? 'crc-quality-tab--active' : ''}`
			});

			setLucideIcon(tabBtn.createSpan({ cls: 'crc-quality-tab-icon' }), tab.icon);
			tabBtn.createSpan({ text: tab.label, cls: 'crc-quality-tab-label' });

			// Badge showing count
			let count = 0;
			if (tab.id === 'places') {
				count = summary.placeVariants.length;
			} else if (tab.id !== 'summary') {
				count = summary.byCategory[tab.id] || 0;
			}

			if (count > 0) {
				tabBtn.createSpan({
					text: count.toString(),
					cls: 'crc-quality-tab-badge'
				});
			}

			tabBtn.addEventListener('click', () => {
				this.activeTab = tab.id;
				// Update active states
				container.querySelectorAll('.crc-quality-tab').forEach(el => {
					el.removeClass('crc-quality-tab--active');
				});
				tabBtn.addClass('crc-quality-tab--active');
				this.renderTabContent();
			});
		}
	}

	/**
	 * Render the content for the active tab
	 */
	private renderTabContent(): void {
		if (!this.tabContentEl) return;
		this.tabContentEl.empty();

		switch (this.activeTab) {
			case 'summary':
				this.renderSummaryTab(this.tabContentEl);
				break;
			case 'places':
				this.renderPlacesTab(this.tabContentEl);
				break;
			default:
				this.renderIssuesTab(this.tabContentEl, this.activeTab);
				break;
		}
	}

	/**
	 * Render the summary tab
	 */
	private renderSummaryTab(container: HTMLElement): void {
		const { summary } = this.analysis;

		// Overview
		const overviewSection = container.createDiv({ cls: 'crc-quality-section' });
		overviewSection.createEl('h4', { text: '导入概览' });

		const overviewGrid = overviewSection.createDiv({ cls: 'crc-quality-overview-grid' });

		this.createStatCard(overviewGrid, 'users', summary.totalIndividuals.toString(), '人物');
		this.createStatCard(overviewGrid, 'home', summary.totalFamilies.toString(), '家族');
		this.createStatCard(overviewGrid, 'map-pin', summary.uniquePlaces.length.toString(), '不重复地点');
		this.createStatCard(
			overviewGrid,
			summary.totalIssues > 0 ? 'alert-triangle' : 'check-circle',
			summary.totalIssues.toString(),
			'发现的问题',
			summary.totalIssues === 0 ? 'crc-stat-card--success' : summary.bySeverity.error > 0 ? 'crc-stat-card--error' : ''
		);

		// Place variants summary (if any)
		if (summary.placeVariants.length > 0) {
			const variantsSection = container.createDiv({ cls: 'crc-quality-section' });
			variantsSection.createEl('h4', { text: '地点名称变体' });
			variantsSection.createEl('p', {
				text: `发现 ${summary.placeVariants.length} 个可标准化的地点名称变体（例如"USA"与"United States"）。`,
				cls: 'crc-text--muted'
			});

			const viewBtn = variantsSection.createEl('button', {
				text: '配置地点名称 →',
				cls: 'crc-btn crc-btn--small'
			});
			viewBtn.addEventListener('click', () => {
				this.activeTab = 'places';
				this.tabContentEl?.parentElement?.querySelectorAll('.crc-quality-tab').forEach(el => {
					el.removeClass('crc-quality-tab--active');
					if (el.textContent?.includes('地点')) {
						el.addClass('crc-quality-tab--active');
					}
				});
				this.renderTabContent();
			});
		}

		// Issues breakdown (if any)
		if (summary.totalIssues > 0) {
			const issuesSection = container.createDiv({ cls: 'crc-quality-section' });
			issuesSection.createEl('h4', { text: '按分类的问题' });

			const categoryGrid = issuesSection.createDiv({ cls: 'crc-quality-category-grid' });

			const categories: Array<{ cat: QualityIssueCategory; label: string; icon: LucideIconName }> = [
				{ cat: 'date', label: '日期问题', icon: 'calendar' },
				{ cat: 'relationship', label: '关系问题', icon: 'users' },
				{ cat: 'reference', label: '引用问题', icon: 'link' },
				{ cat: 'data', label: '数据问题', icon: 'file-text' }
			];

			for (const { cat, label, icon } of categories) {
				const count = summary.byCategory[cat] || 0;
				if (count > 0) {
					const catItem = categoryGrid.createDiv({ cls: 'crc-quality-category-item' });
					setLucideIcon(catItem.createSpan(), icon);
					catItem.createSpan({ text: ` ${count} ${label.toLowerCase()}` });
				}
			}
		}

		// No issues message
		if (summary.totalIssues === 0 && summary.placeVariants.length === 0) {
			const successSection = container.createDiv({ cls: 'crc-quality-success' });
			const successIcon = createLucideIcon('check-circle', 48);
			successIcon.addClass('crc-text--success');
			successSection.appendChild(successIcon);
			successSection.createEl('h4', { text: '数据看起来很好！' });
			successSection.createEl('p', {
				text: '在此 GEDCOM 文件中未检测到数据质量问题。',
				cls: 'crc-text--muted'
			});
		}
	}

	/**
	 * Create a stat card
	 */
	private createStatCard(
		container: HTMLElement,
		icon: LucideIconName,
		value: string,
		label: string,
		extraClass?: string
	): void {
		const card = container.createDiv({ cls: `crc-stat-card ${extraClass || ''}` });
		const iconEl = createLucideIcon(icon, 24);
		card.appendChild(iconEl);
		card.createEl('div', { text: value, cls: 'crc-stat-card-value' });
		card.createEl('div', { text: label, cls: 'crc-stat-card-label' });
	}

	/**
	 * Render the places tab with variant configuration
	 */
	private renderPlacesTab(container: HTMLElement): void {
		const { summary } = this.analysis;

		if (summary.placeVariants.length === 0) {
			const emptyState = container.createDiv({ cls: 'crc-quality-empty' });
			emptyState.createEl('p', {
				text: '未发现地点名称变体。所有地点名称均已标准化。',
				cls: 'crc-text--muted'
			});
			return;
		}

		// Description
		const description = container.createDiv({ cls: 'crc-quality-section' });
		description.createEl('p', {
			text: '发现以下地点名称变体。请为每个变体选择要使用的形式：',
			cls: 'crc-text--muted'
		});

		// Quick actions
		const quickActions = container.createDiv({ cls: 'crc-quality-quick-actions' });
		const useCanonicalBtn = quickActions.createEl('button', {
			text: '全部使用规范形式',
			cls: 'crc-btn crc-btn--small'
		});
		useCanonicalBtn.addEventListener('click', () => {
			for (const variant of summary.placeVariants) {
				this.choices.placeVariantChoices.set(variant.variant, variant.canonical);
			}
			this.renderTabContent();
		});

		const keepOriginalBtn = quickActions.createEl('button', {
			text: '全部保留原始形式',
			cls: 'crc-btn crc-btn--small'
		});
		keepOriginalBtn.addEventListener('click', () => {
			for (const variant of summary.placeVariants) {
				this.choices.placeVariantChoices.set(variant.variant, variant.variant);
			}
			this.renderTabContent();
		});

		// Variants table
		const tableContainer = container.createDiv({ cls: 'crc-batch-table-container' });
		const table = tableContainer.createEl('table', { cls: 'crc-batch-preview-table' });

		const thead = table.createEl('thead');
		const headerRow = thead.createEl('tr');
		headerRow.createEl('th', { text: '文件中的形式' });
		headerRow.createEl('th', { text: '标准化为' });
		headerRow.createEl('th', { text: '出现次数' });

		const tbody = table.createEl('tbody');

		for (const variant of summary.placeVariants) {
			const row = tbody.createEl('tr');

			// Original value
			const originalCell = row.createEl('td');
			const currentChoice = this.choices.placeVariantChoices.get(variant.variant);
			if (currentChoice && currentChoice !== variant.variant) {
				originalCell.createEl('s', { text: variant.variant, cls: 'crc-text--muted' });
			} else {
				originalCell.createEl('span', { text: variant.variant });
			}

			// Dropdown to choose canonical
			const choiceCell = row.createEl('td');
			const select = choiceCell.createEl('select', { cls: 'dropdown' });

			// Option: Keep original
			const keepOpt = select.createEl('option', {
				value: variant.variant,
				text: `${variant.variant}（保留）`
			});
			keepOpt.selected = currentChoice === variant.variant;

			// Option: Use canonical
			const canonicalOpt = select.createEl('option', {
				value: variant.canonical,
				text: variant.canonical
			});
			canonicalOpt.selected = !currentChoice || currentChoice === variant.canonical;

			select.addEventListener('change', () => {
				this.choices.placeVariantChoices.set(variant.variant, select.value);
				// Re-render to update strikethrough
				this.renderTabContent();
			});

			// Count
			const countCell = row.createEl('td', { cls: 'crc-batch-cell--count' });
			countCell.textContent = variant.count.toString();
		}
	}

	/**
	 * Render an issues tab for a specific category
	 */
	private renderIssuesTab(container: HTMLElement, category: QualityIssueCategory): void {
		const issues = this.analysis.issues.filter(i => i.category === category);

		if (issues.length === 0) {
			const categoryLabel = TABS.find(t => t.id === category)?.label ?? category;
			const emptyState = container.createDiv({ cls: 'crc-quality-empty' });
			emptyState.createEl('p', {
				text: `未发现${categoryLabel}问题。`,
				cls: 'crc-text--muted'
			});
			return;
		}

		// Group by severity
		const errorIssues = issues.filter(i => i.severity === 'error');
		const warningIssues = issues.filter(i => i.severity === 'warning');
		const infoIssues = issues.filter(i => i.severity === 'info');

		if (errorIssues.length > 0) {
			this.renderIssueGroup(container, '错误', 'error', errorIssues);
		}
		if (warningIssues.length > 0) {
			this.renderIssueGroup(container, '警告', 'warning', warningIssues);
		}
		if (infoIssues.length > 0) {
			this.renderIssueGroup(container, '提示', 'info', infoIssues);
		}
	}

	/**
	 * Render a group of issues
	 */
	private renderIssueGroup(
		container: HTMLElement,
		title: string,
		severity: QualityIssueSeverity,
		issues: GedcomQualityIssue[]
	): void {
		const section = container.createDiv({ cls: 'crc-quality-issue-group' });

		const header = section.createDiv({ cls: 'crc-quality-issue-group-header' });
		const icon = createLucideIcon(SEVERITY_ICONS[severity], 16);
		icon.addClass(SEVERITY_CLASSES[severity]);
		header.appendChild(icon);
		header.createSpan({ text: ` ${title} (${issues.length})` });

		const list = section.createDiv({ cls: 'crc-quality-issue-list' });

		// Limit display to avoid overwhelming the user
		const displayLimit = 50;
		const displayIssues = issues.slice(0, displayLimit);

		for (const issue of displayIssues) {
			const issueEl = list.createDiv({ cls: `crc-quality-issue ${SEVERITY_CLASSES[issue.severity]}` });

			const issueHeader = issueEl.createDiv({ cls: 'crc-quality-issue-header' });
			issueHeader.createEl('strong', { text: issue.recordName });
			issueHeader.createSpan({
				text: ` (@${issue.recordId}@)`,
				cls: 'crc-text--muted'
			});

			issueEl.createEl('p', {
				text: issue.message,
				cls: 'crc-quality-issue-message'
			});
		}

		if (issues.length > displayLimit) {
			list.createEl('p', {
				text: `… 以及另外 ${issues.length - displayLimit} 条`,
				cls: 'crc-text--muted crc-text--center'
			});
		}
	}

	/**
	 * Render the action buttons
	 */
	private renderActionButtons(container: HTMLElement): void {
		const { summary } = this.analysis;

		// Warning callout if there are errors
		if (summary.bySeverity.error > 0) {
			const warning = container.createDiv({ cls: 'crc-warning-callout' });
			const warningIcon = createLucideIcon('alert-triangle', 16);
			warning.appendChild(warningIcon);
			warning.createSpan({
				text: ` 发现 ${summary.bySeverity.error} 个错误。这些记录可能存在影响家谱的数据问题。`
			});
		}

		// Buttons
		const buttonContainer = container.createDiv({ cls: 'crc-modal-buttons' });

		new ButtonComponent(buttonContainer)
			.setButtonText('取消导入')
			.onClick(() => {
				this.onComplete({ proceed: false, choices: this.choices });
				this.close();
			});

		new ButtonComponent(buttonContainer)
			.setButtonText(summary.placeVariants.length > 0
				? '使用这些设置继续'
				: '继续导入')
			.setCta()
			.onClick(() => {
				this.onComplete({ proceed: true, choices: this.choices });
				this.close();
			});
	}
}