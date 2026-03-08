module.exports = {
	expo: {
		name: 'MRS Earthmovers',
		slug: 'mrs-earthmovers',
		version: '1.0.0',
		orientation: 'portrait',
		assetBundlePatterns: ['**/*'],
		updates: {
			// Disable OTA until EAS Update URL/runtime is correctly configured.
			enabled: false,
			checkAutomatically: 'NEVER',
			fallbackToCacheTimeout: 0
		},
		runtimeVersion: {
			policy: 'appVersion'
		}
	}
};
