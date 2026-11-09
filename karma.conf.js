// Karma configuration file, see link for more information
// https://karma-runner.github.io/1.0/config/configuration-file.html

module.exports = function (config) {
	config.set({
		basePath: '',
		frameworks: ['jasmine', '@angular-devkit/build-angular'],
		files: [
			{
				pattern: 'node_modules/bootstrap/dist/css/bootstrap.rtl.min.css',
				included: false,
				served: true,
				watched: false,
			},
			{
				pattern: 'node_modules/ngx-extended-pdf-viewer/assets/**/*',
				included: false,
				served: true,
				watched: false,
			},
			{
				pattern: 'node_modules/ngx-extended-pdf-viewer/bleeding-edge/**/*',
				included: false,
				served: true,
				watched: false,
			},
		],
		plugins: [
			require('karma-jasmine'),
			require('karma-chrome-launcher'),
			require('karma-jasmine-html-reporter'),
			require('karma-coverage'),
			require('@angular-devkit/build-angular/plugins/karma'),
		],
		client: {
			args: process.env.MARETHA_CAPTURE_UI_CATALOG === '1' ? ['capture-ui-catalog'] : [],
			jasmine: {
				...(process.env.MARETHA_COVERAGE === '1' ? { random: false } : {}),
				// you can add configuration options for Jasmine here
				// the possible options are listed at https://jasmine.github.io/api/edge/Configuration.html
				// for example, you can disable the random execution with `random: false`
				// or set a specific seed with `seed: 4321`
			},
			clearContext: false, // leave Jasmine Spec Runner output visible in browser
		},
		jasmineHtmlReporter: {
			suppressAll: true, // removes the duplicated traces
		},
		coverageReporter: {
			dir: require('path').join(__dirname, './coverage/maretha-angular-webui'),
			subdir: '.',
			reporters: [{ type: 'html' }, { type: 'text-summary' }, { type: 'json' }],
		},
		reporters: ['progress', 'kjhtml'],
		port: Number(process.env.MARETHA_KARMA_PORT || 9876),
		colors: true,
		logLevel: config.LOG_INFO,
		autoWatch: true,
		browsers: ['Chrome'],
		singleRun: false,
		restartOnFileChange: true,
	});
};
