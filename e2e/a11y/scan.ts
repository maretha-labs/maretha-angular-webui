import { expect, Page, TestInfo } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import Module from 'module';
import { resolve } from 'path';
const require = Module.createRequire(resolve('package.json'));

import {
	IbmReport,
	sanitizedFindings,
	unreviewedFindings,
	validateIbmReport,
} from './reviewed-findings.mjs';

export async function scan(
	page: Page,
	testInfo: TestInfo,
	surface: string,
	scope = 'deterministic real-component fixture; not installed Nuxeo acceptance',
): Promise<void> {
	if (scope.startsWith('deterministic')) {
		const colors = await page
			.locator('nx-confirmation-dialog h2, nx-confirmation-dialog button, .language-label')
			.evaluateAll((elements) =>
				elements.map((element) => {
					const style = getComputedStyle(element);
					return {
						text: element.textContent?.trim(),
						color: style.color,
						background: style.backgroundColor,
						opacity: style.opacity,
						fontSize: style.fontSize,
						ancestors: [
							element.parentElement,
							element.parentElement?.parentElement,
							element.closest('.modal-content'),
						]
							.filter((ancestor): ancestor is Element => !!ancestor)
							.map((ancestor) => ({
								tag: ancestor.tagName,
								class: ancestor.className,
								color: getComputedStyle(ancestor).color,
								background: getComputedStyle(ancestor).backgroundColor,
							})),
					};
				}),
			);
		await testInfo.attach(`${surface}-computed-colors`, {
			body: JSON.stringify(colors, null, 2),
			contentType: 'application/json',
		});
	}
	const axe = await new AxeBuilder({ page })
		.withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'])
		.analyze();
	await page.addScriptTag({ path: require.resolve('accessibility-checker-engine/ace.js') });
	const ibm = await page.evaluate(async () => {
		const engine = (
			window as unknown as {
				ace: {
					Checker: new () => { check: (doc: Document, policies: string[]) => Promise<IbmReport> };
				};
			}
		).ace;
		return new engine.Checker().check(document, ['IBM_Accessibility']);
	});
	try {
		validateIbmReport(ibm);
	} catch (error) {
		if (scope.startsWith('deterministic'))
			await testInfo.attach(`${surface}-invalid-ibm-report`, {
				body: JSON.stringify(ibm, null, 2),
				contentType: 'application/json',
			});
		throw error;
	}
	const violations = ibm.results.filter(
		(entry) => entry.value?.[0] === 'VIOLATION' && entry.value?.[1] === 'FAIL',
	);
	const review = ibm.results.filter(
		(entry) =>
			entry.value?.[1] !== 'PASS' &&
			!(entry.value?.[0] === 'VIOLATION' && entry.value?.[1] === 'FAIL'),
	);
	const exceptions =
		surface === 'confirmation-dialog'
			? await page.evaluate(
					(findings) =>
						findings
							.filter((entry) => {
								if (entry.ruleId !== 'aria_hidden_nontabbable' || entry.reasonId !== 'Fail_1')
									return false;
								const node = document.evaluate(
									entry.path.dom,
									document,
									null,
									XPathResult.FIRST_ORDERED_NODE_TYPE,
								).singleNodeValue;
								return (
									node instanceof HTMLDivElement &&
									node.parentElement?.localName === 'modal-container' &&
									node.parentElement.querySelectorAll('nx-confirmation-dialog').length === 1 &&
									node.getAttribute('aria-hidden') === 'true' &&
									node.getAttribute('tabindex') === '0' &&
									node.classList.length === 2 &&
									node.classList.contains('cdk-visually-hidden') &&
									node.classList.contains('cdk-focus-trap-anchor') &&
									node.childNodes.length === 0
								);
							})
							.map(({ ruleId, reasonId, path }) => ({ ruleId, reasonId, path })),
					violations,
				)
			: [];
	const appliedExceptions = exceptions.length <= 2 ? exceptions : [];
	const unreviewedViolations = unreviewedFindings(violations, appliedExceptions);
	const fixture = scope.startsWith('deterministic');
	if (!fixture && surface === 'native-candidate-dashboard') {
		const technical = await page.evaluate(
			(findings) => {
				const structure = (element: Element | null) => {
					if (!element) return { resolved: false };
					const parts: string[] = [];
					for (let node: Element | null = element; node; node = node.parentElement) {
						const siblings = node.parentElement
							? [...node.parentElement.children].filter(
									(sibling) => sibling.localName === node!.localName,
								)
							: [node];
						parts.unshift(`${node.localName}:nth-of-type(${siblings.indexOf(node) + 1})`);
					}
					const style = getComputedStyle(element);
					const legends = [...element.children].filter((child) => child.localName === 'legend');
					return {
						resolved: true,
						selector: parts.join(' > '),
						tag: element.localName,
						role: element.getAttribute('role'),
						tabindex: element.getAttribute('tabindex'),
						visible: element.getClientRects().length > 0,
						insideClosedDetails: !!element.closest('details:not([open])'),
						legendCount: legends.length,
						legendVisible: legends.some((legend) => legend.getClientRects().length > 0),
						legendHasText: legends.some((legend) => !!legend.textContent?.trim()),
						color: style.color,
						background: style.backgroundColor,
						fontSize: style.fontSize,
						fontWeight: style.fontWeight,
					};
				};
				return {
					privacy:
						'Structural selectors and technical flags only; no DOM, labels, field values or authentication data.',
					axe: findings.axe.map((rule) => ({
						id: rule.id,
						nodes: rule.targets.map((target) => {
							try {
								return structure(
									target.length === 1 && typeof target[0] === 'string'
										? document.querySelector(target[0])
										: null,
								);
							} catch {
								return { resolved: false };
							}
						}),
					})),
					ibm: findings.ibm.map((finding) => {
						let node: Node | null = null;
						try {
							node = document.evaluate(
								finding.dom,
								document,
								null,
								XPathResult.FIRST_ORDERED_NODE_TYPE,
							).singleNodeValue;
						} catch {
							/* Do not serialize raw engine paths/errors. */
						}
						return {
							ruleId: finding.ruleId,
							reasonId: finding.reasonId,
							node: structure(node instanceof Element ? node : null),
						};
					}),
				};
			},
			{
				axe: axe.violations.map(({ id, nodes }) => ({
					id,
					targets: nodes.map(({ target }) => target),
				})),
				ibm: violations.map(({ ruleId, reasonId, path }) => ({ ruleId, reasonId, dom: path.dom })),
			},
		);
		await testInfo.attach(`${surface}-technical-findings`, {
			body: JSON.stringify(technical, null, 2),
			contentType: 'application/json',
		});
	}
	await testInfo.attach(`${surface}-axe`, {
		body: JSON.stringify(
			fixture
				? axe
				: {
						violations: axe.violations.map(({ id, impact }) => ({ id, impact })),
						incomplete: axe.incomplete.map(({ id }) => ({ id })),
					},
			null,
			2,
		),
		contentType: 'application/json',
	});
	await testInfo.attach(`${surface}-ibm-equal-access`, {
		body: JSON.stringify(
			fixture
				? { ...ibm, review }
				: {
						numExecuted: ibm.numExecuted,
						results: ibm.results.map(({ ruleId, reasonId, value }) => ({
							ruleId,
							reasonId,
							value,
						})),
					},
			null,
			2,
		),
		contentType: 'application/json',
	});
	await testInfo.attach(`${surface}-reviewed-exceptions`, {
		body: JSON.stringify(
			{
				id: 'ngx-bootstrap-confirmation-focus-sentinels',
				findings: fixture ? appliedExceptions : sanitizedFindings(appliedExceptions),
				maximum: 2,
				rationale:
					'Reviewed third-party finding: focus-trap sentinels immediately redirect to real dialog controls. Both keyboard directions, Escape and trigger focus return are tested. See e2e/README.md; raw violations retained.',
			},
			null,
			2,
		),
		contentType: 'application/json',
	});
	await testInfo.attach(`${surface}-provenance`, {
		body: JSON.stringify(
			{
				scope,
				surface,
				...(fixture
					? await page.evaluate(() => ({
							locale: document.documentElement.lang,
							theme: localStorage.getItem('maretha.webui.theme')?.replace('maretha.theme.', ''),
						}))
					: {}),
				axe: require('axe-core/package.json').version,
				ibmEqualAccess: require('accessibility-checker-engine/package.json').version,
				playwright: require('@playwright/test/package.json').version,
				browser: page.context().browser()?.version(),
				manualReviewRequired: { axeIncomplete: axe.incomplete.length, ibm: review.length },
			},
			null,
			2,
		),
		contentType: 'application/json',
	});
	if (fixture) {
		const screenshot = testInfo.outputPath(`${surface}.png`);
		await page.screenshot({ path: screenshot, fullPage: true });
		await testInfo.attach(`${surface}-screenshot`, { path: screenshot, contentType: 'image/png' });
	}

	expect
		.soft(
			fixture ? axe.violations : axe.violations.map(({ id }) => id),
			`${surface}: axe violations`,
		)
		.toEqual([]);
	expect
		.soft(exceptions.length, `${surface}: reviewed sentinel count must not grow`)
		.toBeLessThanOrEqual(2);
	expect
		.soft(
			fixture ? unreviewedViolations : sanitizedFindings(unreviewedViolations),
			`${surface}: unreviewed IBM Equal Access violations`,
		)
		.toEqual([]);
}
