const original = require('./karma.conf');

module.exports = (config) => {
	original({
		set: (settings) =>
			config.set({
				...settings,
				port: 9888,
				autoWatch: false,
				singleRun: true,
				browsers: ['Chrome'],
				client: { ...settings.client, clearContext: true },
			}),
	});
};
