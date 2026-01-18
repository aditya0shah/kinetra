module.exports = {
  webpack: {
    configure: (webpackConfig) => {
      // Suppress source map warnings from problematic dependencies
      const sourceMapLoader = webpackConfig.module.rules.find(
        (rule) => rule.loader && rule.loader.includes('source-map-loader')
      );

      if (sourceMapLoader) {
        sourceMapLoader.exclude = [
          ...sourceMapLoader.exclude,
          /rehype-harden/,
        ];
      }

      return webpackConfig;
    },
  },
};
