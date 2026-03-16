// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Add .sf2 (SoundFont) as a recognized asset extension
config.resolver.assetExts.push('sf2');

module.exports = config;
