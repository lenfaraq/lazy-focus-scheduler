/**
 * Expo Config Plugin for Offline iOS Live Activities & Dynamic Island (Milestone 5)
 *
 * Configures Info.plist keys (`NSSupportsLiveActivities`, `NSSupportsLiveActivitiesFrequentUpdates`)
 * and App Group entitlements (`group.com.lazyfocus.scheduler`) required by ActivityKit on iOS.
 */

const { withInfoPlist, withEntitlementsPlist } = require('@expo/config-plugins');

const DEFAULT_APP_GROUP = 'group.com.lazyfocus.scheduler';
const DEFAULT_WIDGET_EXTENSION_NAME = 'RoutineLiveActivityWidget';

function withLiveActivityInfoPlist(config, options = {}) {
  return withInfoPlist(config, (modConfig) => {
    modConfig.modResults.NSSupportsLiveActivities = true;
    modConfig.modResults.NSSupportsLiveActivitiesFrequentUpdates =
      options.frequentUpdates !== false;
    modConfig.modResults.LazyFocusLiveActivityExtension =
      options.widgetExtensionName || DEFAULT_WIDGET_EXTENSION_NAME;
    return modConfig;
  });
}

function withLiveActivityEntitlements(config, options = {}) {
  return withEntitlementsPlist(config, (modConfig) => {
    const appGroup = options.appGroup || DEFAULT_APP_GROUP;
    const existingGroups = Array.isArray(
      modConfig.modResults['com.apple.security.application-groups']
    )
      ? modConfig.modResults['com.apple.security.application-groups']
      : [];

    if (!existingGroups.includes(appGroup)) {
      modConfig.modResults['com.apple.security.application-groups'] = [
        ...existingGroups,
        appGroup,
      ];
    }
    return modConfig;
  });
}

function withLiveActivity(config, options = {}) {
  if (!config.ios) {
    config.ios = {};
  }
  if (!config.ios.infoPlist) {
    config.ios.infoPlist = {};
  }
  config.ios.infoPlist.NSSupportsLiveActivities = true;
  config.ios.infoPlist.NSSupportsLiveActivitiesFrequentUpdates =
    options.frequentUpdates !== false;

  let updatedConfig = withLiveActivityInfoPlist(config, options);
  updatedConfig = withLiveActivityEntitlements(updatedConfig, options);
  return updatedConfig;
}

module.exports = withLiveActivity;
module.exports.DEFAULT_APP_GROUP = DEFAULT_APP_GROUP;
module.exports.DEFAULT_WIDGET_EXTENSION_NAME = DEFAULT_WIDGET_EXTENSION_NAME;
