import { cp, mkdir, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

export function run(command, args, cwd) {
	const result = spawnSync(command, args, { cwd, stdio: 'inherit' });
	if (result.error) throw result.error;
	if (result.status !== 0)
		throw new Error(`${command} ${args.join(' ')} failed with ${result.signal ?? result.status}`);
}

export async function candidateArchive() {
	const sdk = JSON.parse(await readFile(join(root, 'app/extensions/package.json'), 'utf8'));
	return join(root, 'dist', `maretha-webui-sdk-${sdk.version}.tgz`);
}

export async function prepareConsumer(fixture = join(root, 'examples/client-webui')) {
	const directory = await mkdtemp(join(tmpdir(), 'maretha-sdk-consumer-'));
	await cp(resolve(fixture), directory, {
		recursive: true,
		filter: (path) => !['node_modules', 'dist', '.angular', 'vendor'].includes(basename(path)),
	});
	const config = JSON.parse(await readFile(join(directory, 'tsconfig.json'), 'utf8'));
	if (config.compilerOptions?.paths || config.extends)
		throw new Error(
			'The standalone consumer must not inherit repository aliases or configuration.',
		);
	await mkdir(join(directory, 'vendor'), { recursive: true });
	return directory;
}

export async function installArchive(directory, archive) {
	const bytes = await readFile(resolve(archive));
	const digest = sha256(bytes);
	const relativeArchive = `vendor/sdk-${digest}.tgz`;
	await writeFile(join(directory, relativeArchive), bytes);
	const manifestPath = join(directory, 'package.json');
	const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
	manifest.dependencies['@maretha/webui-sdk'] = `file:${relativeArchive}`;
	await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
	// A unique tarball path defeats same-version local-package and Angular build caches.
	await rm(join(directory, '.angular'), { recursive: true, force: true });
	run('npm', ['install', '--ignore-scripts', '--no-fund', '--no-audit'], directory);
	run('npm', ['ci', '--ignore-scripts', '--no-fund', '--no-audit'], directory);
	const installed = JSON.parse(
		await readFile(join(directory, 'node_modules/@maretha/webui-sdk/package.json'), 'utf8'),
	);
	if (installed.name !== '@maretha/webui-sdk') throw new Error('Unexpected installed SDK package.');
	return { version: installed.version, sha256: digest, sourceAliases: false };
}

export async function writeReport(path, report) {
	await mkdir(dirname(resolve(path)), { recursive: true });
	await writeFile(resolve(path), JSON.stringify(report, null, 2) + '\n');
}
