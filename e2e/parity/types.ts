export interface ReadyCondition {
	selector: string;
	state: 'visible' | 'attached' | 'hidden';
}
export interface ParityTarget {
	runnable: boolean;
	route: string | null;
	ready: ReadyCondition[];
	steps: {
		type: 'hover' | 'focus' | 'click' | 'press';
		selector: string;
		key?: string;
		safe: true;
		ready?: ReadyCondition[];
	}[];
	regions: { id: string; selector: string }[];
	measurements: {
		id: string;
		selector: string;
		property: string;
		expected: string | number;
		tolerance?: number;
	}[];
	blockedBy: string[];
}
export interface ParityScenario {
	id: string;
	inventory: string[];
	status: string;
	description: string;
	prerequisites: string[];
	rendering: {
		viewport: { width: number; height: number };
		locale: string;
		theme: string;
		direction: 'ltr' | 'rtl';
		timezone: string;
		deviceScaleFactor: number;
		zoom: 1;
	};
	targets: { reference: ParityTarget; candidate: ParityTarget; local?: ParityTarget };
	excludedRegions: unknown[];
}
export interface ParityManifest {
	version: 1;
	expectedBundleIdentities: Record<
		string,
		{ path: string | null; sha256: string | null; source: string | null }
	>;
	scenarios: ParityScenario[];
}
export interface ParitySettings {
	mode: 'local' | 'hosted';
	runId: string;
	output: string;
	baseline?: string;
	scenario?: string;
	username?: string;
	password?: string;
	bases: { local: string; reference?: string; candidate?: string };
	/** Hosted origins requests may reach; empty in local mode. */
	origins: string[];
}
