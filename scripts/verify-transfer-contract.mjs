import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { values } = parseArgs({
	options: {
		'prove-failures': { type: 'boolean', default: false },
		port: { type: 'string', default: '9887' },
		report: { type: 'string' },
	},
});
const port = Number(values.port);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid Karma port.');
const reportPath = resolve(
	values.report ??
		join(
			root,
			`dist/verification/transfer-${values['prove-failures'] ? 'failures' : 'contract'}.json`,
		),
);
const pdf = 'app/modules/explorer/components/viewers/pdf-renderer/';
const helpers = 'app/modules/explorer/helpers/';
const specs = [
	'app/helpers/pdf-range-http.spec.ts',
	`${pdf}pdf-range-source.spec.ts`,
	`${pdf}pdf-range-bridge.spec.ts`,
	`${pdf}pdf-range-integration.spec.ts`,
	`${pdf}pdf-renderer.component.spec.ts`,
	'app/directives/stream-media.directive.spec.ts',
	'app/helpers/blob-delivery.service.spec.ts',
	`${helpers}document-attachments.service.spec.ts`,
	`${helpers}selection-download.service.spec.ts`,
	'app/modules/explorer/components/document-toolbar/selection-download.component.spec.ts',
	'app/modules/explorer/components/viewers/native-media-downloads.spec.ts',
];
const mutations = [
	{
		name: 'pdf-initial-request',
		file: `${pdf}pdf-range-source.ts`,
		before: 'PDF_INITIAL_RANGE_BYTES = 64 * 1024',
		after: 'PDF_INITIAL_RANGE_BYTES = 8 * 1024 * 1024',
		spec: `${pdf}pdf-range-source.spec.ts`,
		failure: 'starts with only 64 KiB',
	},
	{
		name: 'pdf-unclipped-first-range',
		file: `${pdf}pdf-range-source.ts`,
		before: 'throw new PdfUnclippedRange(total);',
		after: 'void total;',
		spec: `${pdf}pdf-range-source.spec.ts`,
		failure:
			're-requests the exact file once when the server echoes a first range past a small file',
	},
	{
		name: 'pdf-page-entry-keystrokes',
		file: `${pdf}pdf-renderer.component.html`,
		before: 'id="pageNumber"',
		after: 'id="pageNumber"\n\t\t\t\t\t[(ngModel)]="currentPage"',
		spec: `${pdf}pdf-renderer.component.spec.ts`,
		failure: 'leaves the typed page number to PDF.js so only the committed page is requested',
	},
	{
		name: 'pdf-unbounded-fallback',
		file: `${pdf}pdf-range-source.ts`,
		before: 'PDF_MAX_FALLBACK_BYTES = 8 * 1024 * 1024',
		after: 'PDF_MAX_FALLBACK_BYTES = 64 * 1024 * 1024',
		spec: 'app/helpers/pdf-range-http.spec.ts',
		failure: 'rejects an oversized PDF fallback before pulling any response body bytes',
	},
	{
		name: 'media-source-retention',
		file: 'app/directives/stream-media.directive.ts',
		before: "this.media.removeAttribute('src');",
		after: 'void this.media;',
		spec: 'app/directives/stream-media.directive.spec.ts',
		failure: 'retires native media URLs, subscriptions and renewal timers across repeated mounts',
	},
	{
		name: 'native-file-buffering',
		file: `${helpers}document-attachments.service.ts`,
		before: 'link.href = grant.url;',
		after:
			"link.href = grant.url;\nthis.httpClient.get(grant.url, { responseType: 'blob' }).subscribe();",
		spec: `${helpers}document-attachments.service.spec.ts`,
		failure:
			'keeps repeated native file downloads free of application byte requests and detached links',
	},
	{
		name: 'bulk-status-buffering',
		file: 'app/helpers/blob-delivery.service.ts',
		before: 'this.http.get<unknown>(this.bulkPath(id), { withCredentials: true })',
		after: "this.http.get(this.bulkPath(id), { withCredentials: true, responseType: 'blob' })",
		spec: 'app/helpers/blob-delivery.service.spec.ts',
		failure: 'reads JSON status only and sends explicit cancel/regenerate to the same opaque job',
	},
	{
		name: 'bulk-poll-retention',
		file: `${helpers}selection-download.service.ts`,
		before: 'request.pipe(takeUntil(cancelled), takeUntil(this.sessionEnded$))',
		after: 'request.pipe(takeUntil(this.sessionEnded$))',
		spec: `${helpers}selection-download.service.spec.ts`,
		failure:
			'releases in-flight bulk status subscriptions and abort listeners across repeated cancellations',
	},
];

const sandbox = await mkdtemp(join(tmpdir(), 'maretha-transfer-contract-'));
const results = [];
const originals = new Map();
for (const mutation of mutations) {
	if (!originals.has(mutation.file))
		originals.set(mutation.file, await readFile(join(root, mutation.file)));
}

function hash(bytes) {
	return createHash('sha256').update(bytes).digest('hex');
}

async function fixture(selectedSpecs) {
	await mkdir(join(sandbox, 'scripts'), { recursive: true });
	await cp(join(root, 'app'), join(sandbox, 'app'), { recursive: true });
	await cp(join(root, 'environments'), join(sandbox, 'environments'), { recursive: true });
	await cp(join(root, 'assets/i18n'), join(sandbox, 'assets/i18n'), { recursive: true });
	await cp(join(root, 'styles'), join(sandbox, 'styles'), { recursive: true });
	for (const name of ['package.json', 'tsconfig.json', 'test.ts', 'polyfills.ts'])
		await cp(join(root, name), join(sandbox, name));
	await symlink(join(root, 'node_modules'), join(sandbox, 'node_modules'), 'dir');
	await writeFile(
		join(sandbox, 'angular.json'),
		JSON.stringify({
			version: 1,
			cli: { analytics: false, cache: { enabled: false } },
			projects: {
				'transfer-contract': {
					projectType: 'application',
					root: '',
					sourceRoot: './',
					architect: {
						test: {
							builder: '@angular-devkit/build-angular:karma',
							options: {
								main: 'test.ts',
								polyfills: 'polyfills.ts',
								tsConfig: 'tsconfig.guard.json',
								karmaConfig: 'karma.guard.cjs',
								inlineStyleLanguage: 'scss',
								assets: [],
								styles: [],
								scripts: [],
							},
						},
					},
				},
			},
		}),
	);
	await selectSpecs(selectedSpecs);
	await writeFile(
		join(sandbox, 'karma.guard.cjs'),
		`const fs = require('node:fs');
module.exports = config => config.set({
  frameworks: ['jasmine', '@angular-devkit/build-angular'],
  files: ['assets','bleeding-edge'].map(folder => ({pattern:'node_modules/ngx-extended-pdf-viewer/'+folder+'/**/*',included:false,served:true,watched:false})),
  plugins: [require('karma-jasmine'),require('karma-chrome-launcher'),require('@angular-devkit/build-angular/plugins/karma'),
    {'reporter:transfer-json':['type', function(baseReporterDecorator) {
      baseReporterDecorator(this); const tests = [];
      this.onSpecComplete = (_browser, result) => tests.push({name: [...result.suite,result.description].join(' '),success:result.success,skipped:result.skipped,log:result.log});
      this.onRunComplete = (_browsers, summary) => fs.writeFileSync('guard-results.json',JSON.stringify({tests,error:summary.error,disconnected:summary.disconnected}));
    }]}],
  reporters: ['dots','transfer-json'], port:${port}, hostname:'127.0.0.1', listenAddress:'127.0.0.1',
  browsers:['ChromeHeadless'], singleRun:true, autoWatch:false, colors:false,
  browserNoActivityTimeout:60000, client:{jasmine:{random:false}}
});
`,
	);
}

async function selectSpecs(selected) {
	await writeFile(
		join(sandbox, 'tsconfig.guard.json'),
		JSON.stringify({
			extends: './tsconfig.json',
			compilerOptions: { outDir: './out-tsc/spec', types: ['jasmine'] },
			files: ['test.ts', 'polyfills.ts', ...selected],
			include: ['app/**/*.d.ts'],
		}),
	);
}

async function run(name, selected, expectedFailure) {
	await selectSpecs(selected);
	await rm(join(sandbox, 'guard-results.json'), { force: true });
	const args = [
		join(root, 'node_modules/@angular/cli/bin/ng.js'),
		'test',
		'--watch=false',
		'--browsers=ChromeHeadless',
		'--progress=false',
		'--source-map=false',
		...selected.map((spec) => `--include=${spec}`),
	];
	console.log(`Transfer guard: ${name} (${selected.length} suites).`);
	const started = Date.now();
	const execution = await new Promise((resolveResult, reject) => {
		const child = spawn(process.execPath, args, { cwd: sandbox, env: process.env });
		let output = '';
		const append = (data) => {
			output += data;
			if (output.length > 16 * 1024 * 1024) child.kill('SIGTERM');
		};
		child.stdout.on('data', append);
		child.stderr.on('data', append);
		const timeout = setTimeout(() => child.kill('SIGTERM'), 180_000);
		child.on('error', (error) => {
			clearTimeout(timeout);
			reject(error);
		});
		child.on('close', (code, signal) => {
			clearTimeout(timeout);
			resolveResult({ code, signal, output });
		});
	});
	const log = join(dirname(reportPath), `${name}.log`);
	await mkdir(dirname(log), { recursive: true });
	await writeFile(log, execution.output);
	const native = JSON.parse(
		await readFile(join(sandbox, 'guard-results.json'), 'utf8').catch(() => '{}'),
	);
	const tests = native.tests ?? [];
	const failed = tests.filter((test) => !test.success && !test.skipped);
	const failure = failed.find((test) => test.name.includes(expectedFailure));
	if (
		execution.signal ||
		native.error ||
		native.disconnected ||
		!tests.length ||
		tests.some((test) => test.skipped)
	)
		throw new Error(`Transfer guard did not complete normally; inspect ${log}`);
	if (expectedFailure ? execution.code === 0 || !failure : execution.code !== 0 || failed.length)
		throw new Error(
			`${name} did not ${expectedFailure ? 'reject the intended regression' : 'pass'}; inspect ${log}`,
		);
	const result = {
		name,
		exitCode: execution.code,
		tests: tests.length,
		failures: failed.length,
		...(failure ? { detected: failure.name } : {}),
		elapsedMs: Date.now() - started,
		log,
	};
	results.push(result);
	console.log(
		`${name}: ${tests.length} tests; ${expectedFailure ? 'intended regression rejected' : 'passed'}.`,
	);
}

try {
	await fixture(specs);
	await run('transfer-pristine', specs);
	if (values['prove-failures']) {
		for (const mutation of mutations) {
			const original = originals.get(mutation.file).toString('utf8');
			if (original.split(mutation.before).length !== 2)
				throw new Error(
					`Expected exactly one mutation target for ${mutation.name}; update the proof.`,
				);
			const path = join(sandbox, mutation.file);
			try {
				await writeFile(path, original.replace(mutation.before, mutation.after));
				await run(mutation.name, [mutation.spec], mutation.failure);
			} finally {
				await writeFile(path, original);
			}
		}
	}
	const sourceHashes = {};
	for (const [file, bytes] of originals) {
		const current = await readFile(join(root, file));
		if (hash(current) !== hash(bytes))
			throw new Error(`Source changed concurrently during verification: ${file}`);
		sourceHashes[file] = hash(bytes);
	}
	await mkdir(dirname(reportPath), { recursive: true });
	await writeFile(
		reportPath,
		JSON.stringify(
			{
				verifiedAt: new Date().toISOString(),
				results,
				sourceHashes,
				boundaries: [
					'Application request sizes, transport selection and lifecycle cleanup; no total browser/PDF.js heap claim.',
					'Only synthetic bounded fixtures; no multi-GB latency, disk-throughput or hosted acceptance benchmark.',
					'Image/text previews and separate generated exports including CSV retain their authenticated Blob paths.',
				],
			},
			null,
			2,
		) + '\n',
	);
	console.log(`Transfer contract report: ${reportPath}`);
} finally {
	await rm(sandbox, { recursive: true, force: true });
}
