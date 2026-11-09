import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import {
	candidateArchive,
	installArchive,
	prepareConsumer,
	root,
	run,
	writeReport,
} from './sdk-consumer.mjs';

const { values } = parseArgs({
	options: {
		archive: { type: 'string' },
		fixture: { type: 'string', default: join(root, 'examples/client-webui') },
		report: { type: 'string', default: join(root, 'dist/verification/sdk-consumer.json') },
		keep: { type: 'boolean', default: false },
	},
});
const directory = await prepareConsumer(values.fixture);
try {
	const sdk = await installArchive(directory, values.archive ?? (await candidateArchive()));
	run('npm', ['run', 'build'], directory);
	await writeReport(values.report, {
		...sdk,
		consumerBuilt: true,
		verifiedAt: new Date().toISOString(),
	});
	console.log(`Verified standalone consumer: ${values.report}`);
} finally {
	if (values.keep) console.log(`Consumer workspace retained: ${directory}`);
	else await rm(directory, { recursive: true, force: true });
}
