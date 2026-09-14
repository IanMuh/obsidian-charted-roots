import { describe, it, expect } from 'vitest';
import { summarizeCoreIssues } from '../src/statistics/services/core-issues-summary';

describe('summarizeCoreIssues', () => {
	it('lists all three categories when each contributes', () => {
		const result = summarizeCoreIssues({ missingBirthDate: 3, orphanedPeople: 6, unsourcedEvents: 14 });
		expect(result.count).toBe(23);
		expect(result.subtitle).toBe('缺少出生日期 + 孤立人物 + 无来源事件');
	});

	it('omits missing births when birth dates are complete (#676)', () => {
		const result = summarizeCoreIssues({ missingBirthDate: 0, orphanedPeople: 6, unsourcedEvents: 14 });
		expect(result.count).toBe(20);
		expect(result.subtitle).toBe('孤立人物 + 无来源事件');
	});

	it('names a single contributing category', () => {
		const result = summarizeCoreIssues({ missingBirthDate: 0, orphanedPeople: 0, unsourcedEvents: 14 });
		expect(result.count).toBe(14);
		expect(result.subtitle).toBe('无来源事件');
	});

	it('capitalizes a lone missing-births category', () => {
		const result = summarizeCoreIssues({ missingBirthDate: 5, orphanedPeople: 0, unsourcedEvents: 0 });
		expect(result.count).toBe(5);
		expect(result.subtitle).toBe('缺少出生日期');
	});

	it('reports no core issues when everything is clean', () => {
		const result = summarizeCoreIssues({ missingBirthDate: 0, orphanedPeople: 0, unsourcedEvents: 0 });
		expect(result.count).toBe(0);
		expect(result.subtitle).toBe('无核心问题');
	});
});
