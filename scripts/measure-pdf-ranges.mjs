import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { cp, mkdir, mkdtemp, open, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { values } = parseArgs({
	options: {
		pdf: { type: 'string', multiple: true, default: [] },
		page: { type: 'string', default: '2398' },
		pages: { type: 'string', default: '10000' },
		'scan-bytes': { type: 'string', default: '100000' },
		'quiet-ms': { type: 'string', default: '100' },
		port: { type: 'string', default: '9888' },
		report: { type: 'string', default: join(root, 'dist/verification/pdf-range-measurement.json') },
	},
});
const numbers = Object.fromEntries(
	['page', 'pages', 'scan-bytes', 'quiet-ms', 'port'].map((name) => [name, Number(values[name])]),
);
for (const [name, value] of Object.entries(numbers))
	if (!Number.isSafeInteger(value) || value < 1) throw new Error(`Invalid --${name}.`);
if (numbers.port < 1024 || numbers.port > 65535) throw new Error('Invalid Karma port.');
const samples = values.pdf.map((file) => resolve(file));
for (const file of samples)
	if (!(await stat(file)).isFile()) throw new Error(`Not a file: ${file}`);
const reportPath = resolve(values.report);
const logPath = reportPath.replace(/\.json$/, '') + '.log';

const { pages } = numbers;
const scan = numbers['scan-bytes'];
const scanLabel = `${Math.round(scan / 1000)} KB`;
const scenarios = [
	{
		name: `Flat page tree, ${scanLabel} scanned pages`,
		shape: { pages, pageBytes: scan, layout: 'interleaved' },
	},
	{
		name: `Flat page tree, ${scanLabel} pages, page dictionaries stored together`,
		shape: { pages, pageBytes: scan, layout: 'clustered' },
	},
	{
		name: `Balanced page tree (10 per node), ${scanLabel} scanned pages`,
		shape: { pages, pageBytes: scan, layout: 'interleaved', fanout: 10 },
	},
	{
		name: `Balanced page tree (100 per node), ${scanLabel} scanned pages`,
		shape: { pages, pageBytes: scan, layout: 'interleaved', fanout: 100 },
	},
	{
		name: 'Flat page tree, 4 KB text pages',
		shape: { pages, pageBytes: 4000, layout: 'interleaved' },
	},
	...samples.map((file, index) => ({ name: basename(file), sample: `/pdf-sample/${index}` })),
];

async function serveSamples() {
	const server = createServer(async (request, response) => {
		const file = samples[Number(request.url?.slice(1))];
		const range = /^bytes=(\d+)-(\d+)$/.exec(request.headers.range ?? '');
		if (!file || !range) return response.writeHead(400).end();
		const { size } = await stat(file);
		const start = Number(range[1]);
		const end = Math.min(Number(range[2]), size - 1);
		if (start > end) return response.writeHead(416, { 'Content-Range': `bytes */${size}` }).end();
		const handle = await open(file);
		try {
			const bytes = Buffer.alloc(end - start + 1);
			await handle.read(bytes, 0, bytes.length, start);
			response.writeHead(206, {
				'Content-Range': `bytes ${start}-${end}/${size}`,
				'Content-Length': bytes.length,
				'Content-Type': 'application/pdf',
			});
			response.end(bytes);
		} finally {
			await handle.close();
		}
	});
	await new Promise((listening) => server.listen(0, '127.0.0.1', listening));
	return server;
}

async function prepare(sandbox, samplePort) {
	await cp(join(root, 'app'), join(sandbox, 'app'), { recursive: true });
	await cp(join(root, 'environments'), join(sandbox, 'environments'), { recursive: true });
	for (const name of ['package.json', 'tsconfig.json', 'test.ts', 'polyfills.ts'])
		await cp(join(root, name), join(sandbox, name));
	await symlink(join(root, 'node_modules'), join(sandbox, 'node_modules'), 'dir');
	await writeFile(
		join(sandbox, 'angular.json'),
		JSON.stringify({
			version: 1,
			cli: { analytics: false, cache: { enabled: false } },
			projects: {
				'pdf-range-measurement': {
					projectType: 'application',
					root: '',
					sourceRoot: './',
					architect: {
						test: {
							builder: '@angular-devkit/build-angular:karma',
							options: {
								main: 'test.ts',
								polyfills: 'polyfills.ts',
								tsConfig: 'tsconfig.measure.json',
								karmaConfig: 'karma.measure.cjs',
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
	await writeFile(
		join(sandbox, 'tsconfig.measure.json'),
		JSON.stringify({
			extends: './tsconfig.json',
			compilerOptions: { outDir: './out-tsc/spec', types: ['jasmine'] },
			files: ['test.ts', 'polyfills.ts', 'pdf-range-measure.spec.ts'],
			include: ['app/**/*.d.ts'],
		}),
	);
	await writeFile(
		join(sandbox, 'pdf-range-measure.spec.ts'),
		`import { TestBed } from '@angular/core/testing';
import { httpPdfSource, measurePdfRanges, PdfRangeCost, SyntheticPdf, SyntheticPdfShape } from 'app/testing/pdf-range-measurement';

const scenarios: { name: string; shape?: SyntheticPdfShape; sample?: string }[] = ${JSON.stringify(scenarios)};
const summary = ({ requests, bytes, rounds }: PdfRangeCost) => ({ requests, bytes, rounds });

describe('PDF range measurement', () => {
	beforeEach(() => TestBed.configureTestingModule({}));
	for (const scenario of scenarios)
		it(scenario.name, async () => {
			const source = scenario.sample ? await httpPdfSource(scenario.sample) : new SyntheticPdf(scenario.shape!);
			const result = await measurePdfRanges(source, ${numbers.page}, { quietMs: ${numbers['quiet-ms']} });
			const payload = { name: scenario.name, pages: result.pages, length: result.length, page: result.page, open: summary(result.open), jump: summary(result.jump) };
			const encoded = encodeURIComponent(JSON.stringify(payload)).replace(/'/g, '%27');
			console.log('PDF_RANGE_MEASUREMENT ' + encoded + ' END');
		}, 60 * 60_000);
});
`,
	);
	await writeFile(
		join(sandbox, 'karma.measure.cjs'),
		`const fs = require('node:fs');
module.exports = config => config.set({
  frameworks: ['jasmine', '@angular-devkit/build-angular'],
  files: [{pattern: 'node_modules/ngx-extended-pdf-viewer/bleeding-edge/**/*', included: false, served: true, watched: false}],
  proxies: ${JSON.stringify(samplePort ? { '/pdf-sample/': `http://127.0.0.1:${samplePort}/` } : {})},
  plugins: [require('karma-jasmine'), require('karma-chrome-launcher'), require('@angular-devkit/build-angular/plugins/karma'),
    {'reporter:pdf-range-measurement': ['type', function(baseReporterDecorator) {
      baseReporterDecorator(this); const results = []; const failures = [];
      this.onBrowserLog = (_browser, log) => {
        const match = /PDF_RANGE_MEASUREMENT (\\S+) END/.exec(String(log));
        if (match) results.push(JSON.parse(decodeURIComponent(match[1])));
      };
      this.onSpecComplete = (_browser, result) => {
        const name = [...result.suite, result.description].join(' ');
        if (!result.success) failures.push({ name, log: result.log });
        console.log('PDF range measurement: ' + name + (result.success ? ' measured' : ' FAILED'));
      };
      this.onRunComplete = (_browsers, summary) => fs.writeFileSync('measurement-results.json',
        JSON.stringify({ results, failures, error: summary.error, disconnected: summary.disconnected }));
    }]}],
  reporters: ['pdf-range-measurement'], port: ${numbers.port}, hostname: '127.0.0.1', listenAddress: '127.0.0.1',
  browsers: ['ChromeHeadless'], singleRun: true, autoWatch: false, colors: false,
  captureTimeout: 120000, browserNoActivityTimeout: 3600000, browserDisconnectTimeout: 60000,
  client: { captureConsole: true, jasmine: { random: false, timeoutInterval: 3600000 } }
});
`,
	);
}

function run(sandbox) {
	const args = [
		join(root, 'node_modules/@angular/cli/bin/ng.js'),
		'test',
		'--watch=false',
		'--browsers=ChromeHeadless',
		'--progress=false',
		'--source-map=false',
		'--include=pdf-range-measure.spec.ts',
	];
	return new Promise((resolveRun, reject) => {
		const child = spawn(process.execPath, args, { cwd: sandbox, env: process.env });
		let output = '';
		const append = (data) => {
			const text = String(data);
			output += text;
			for (const line of text.split('\n'))
				if (line.startsWith('PDF range measurement:')) console.log(line);
		};
		child.stdout.on('data', append);
		child.stderr.on('data', append);
		child.on('error', reject);
		child.on('close', (code, signal) => resolveRun({ code, signal, output }));
	});
}

const mb = (bytes) => (bytes / 1024 / 1024).toFixed(1);
const kb = (bytes) => (bytes / 1024).toFixed(0);

function table(results) {
	return [
		'| Scenario | Pages | File | Open: requests | Open: MiB | Open: rounds | Jump: page | Jump: requests | Jump: KiB | Jump: rounds |',
		'| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
		...results.map(
			(result) =>
				`| ${result.name} | ${result.pages} | ${mb(result.length)} MiB | ${result.open.requests} | ${mb(result.open.bytes)} | ${result.open.rounds} | ${result.page} | ${result.jump.requests} | ${kb(result.jump.bytes)} | ${result.jump.rounds} |`,
		),
	].join('\n');
}

const sandbox = await mkdtemp(join(tmpdir(), 'maretha-pdf-range-measurement-'));
const server = samples.length ? await serveSamples() : undefined;
try {
	await prepare(sandbox, server?.address().port);
	console.log(
		`PDF range measurement: ${scenarios.length} scenarios; this can take several minutes.`,
	);
	const execution = await run(sandbox);
	await mkdir(dirname(reportPath), { recursive: true });
	await writeFile(logPath, execution.output);
	const native = JSON.parse(
		await readFile(join(sandbox, 'measurement-results.json'), 'utf8').catch(() => '{}'),
	);
	const results = native.results ?? [];
	const failures = native.failures ?? [];
	await writeFile(
		reportPath,
		JSON.stringify(
			{
				measuredAt: new Date().toISOString(),
				options: { ...numbers, samples },
				results,
				failures,
				boundaries: [
					'PDF.js requests are answered in lockstep waves; rounds count dependent round trips under unlimited concurrency, not wall time.',
					'Open = 64 KiB first request, document load, metadata/outline/labels and page 1 display data; jump = display data for the target page.',
					'Display data is the operator list, text content and annotations; canvas painting, viewer DOM work and server latency are not measured.',
					'Synthetic files use a classic xref table, uncompressed objects and one standard font.',
				],
			},
			null,
			2,
		) + '\n',
	);
	await writeFile(reportPath.replace(/\.json$/, '') + '.md', table(results) + '\n');
	console.log('\n' + table(results));
	for (const failure of failures)
		console.error(`\nFAILED ${failure.name}\n${failure.log.join('\n')}`);
	console.log(`\nReport: ${reportPath}\nLog: ${logPath}`);
	if (execution.signal || native.error || native.disconnected || failures.length || !results.length)
		process.exitCode = 1;
} finally {
	server?.close();
	await rm(sandbox, { recursive: true, force: true });
}
