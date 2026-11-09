import { existsSync } from 'fs';

export const executablePath =
	process.env['CHROME_BIN'] ||
	(process.platform === 'darwin' &&
	existsSync('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')
		? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
		: undefined);
