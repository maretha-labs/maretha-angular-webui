const original = require('./karma.conf');

module.exports = (config) => {
	original({
		set: (settings) => config.set({ ...settings, port: 9887, autoWatch: false, singleRun: true }),
	});
};
