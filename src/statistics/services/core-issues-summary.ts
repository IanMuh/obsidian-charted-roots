/**
 * The "core" data-quality issues surfaced in the Statistics dashboard summary
 * card: missing birth dates, orphaned people, and unsourced events.
 */
export interface CoreIssueCounts {
	missingBirthDate: number;
	orphanedPeople: number;
	unsourcedEvents: number;
}

export interface CoreIssuesSummary {
	count: number;
	/** Sentence-case subtitle naming only the categories that actually contribute. */
	subtitle: string;
}

/**
 * Summarize the core issue counts into a total and a subtitle that lists only
 * the non-zero categories. Keeps the subtitle honest: the card never claims
 * "missing births" when birth dates are complete, which is what the static
 * "Missing births + orphans + unsourced events" string did at 100% birth-date
 * coverage (#676 follow-up).
 */
export function summarizeCoreIssues(counts: CoreIssueCounts): CoreIssuesSummary {
	const parts: Array<{ count: number; label: string }> = [
		{ count: counts.missingBirthDate, label: '缺少出生日期' },
		{ count: counts.orphanedPeople, label: '孤立人物' },
		{ count: counts.unsourcedEvents, label: '无来源事件' },
	];

	const count = parts.reduce((sum, part) => sum + part.count, 0);
	const joined = parts.filter(part => part.count > 0).map(part => part.label).join(' + ');
	const subtitle = joined.length > 0 ? joined : '无核心问题';

	return { count, subtitle };
}
