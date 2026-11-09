import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { createHash } from 'node:crypto';

const require = createRequire(resolve('package.json'));
// Use the PNG decoder bundled with the repository's pinned Playwright version.
// No download, new dependency, baseline update, or image normalization occurs.
const { PNG } = require(
	join(dirname(require.resolve('playwright-core/package.json')), 'lib/utilsBundle.js'),
);
export const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');
export function comparePixels(reference, candidate) {
	const left = PNG.sync.read(reference);
	const right = PNG.sync.read(candidate);
	if (left.width !== right.width || left.height !== right.height)
		return {
			matched: false,
			reason: 'dimensions',
			reference: { width: left.width, height: left.height },
			candidate: { width: right.width, height: right.height },
			changedPixels: null,
			diff: null,
		};
	const diff = new PNG({ width: left.width, height: left.height });
	let changedPixels = 0;
	for (let index = 0; index < left.data.length; index += 4) {
		const changed = [0, 1, 2, 3].some(
			(channel) => left.data[index + channel] !== right.data[index + channel],
		);
		if (changed) changedPixels++;
		const gray = Math.round(
			(right.data[index] + right.data[index + 1] + right.data[index + 2]) / 3,
		);
		diff.data[index] = changed ? 255 : gray;
		diff.data[index + 1] = changed ? 0 : gray;
		diff.data[index + 2] = changed ? 0 : gray;
		diff.data[index + 3] = 255;
	}
	return {
		matched: changedPixels === 0,
		reason: changedPixels ? 'pixels' : null,
		width: left.width,
		height: left.height,
		changedPixels,
		pixelCount: left.width * left.height,
		diff: PNG.sync.write(diff),
	};
}
