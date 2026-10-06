// Update channel is a build-time choice (ADR-0011). Only TEST builds set CT_UPDATES_CHANNEL=testing;
// every other build (incl. any future production build) ships with OTA updates disabled.
module.exports = ({ config }) => {
  const channel = process.env.CT_UPDATES_CHANNEL;
  if (!channel) return config;
  if (channel !== 'testing') throw new Error(`Unsupported CT_UPDATES_CHANNEL "${channel}" (only "testing" is approved)`);
  return {
    ...config,
    updates: { ...config.updates, enabled: true, requestHeaders: { 'expo-channel-name': channel } },
  };
};
