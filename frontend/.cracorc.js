module.exports = {
  webpack: {
    configure: (webpackConfig) => {
      // Suppress source map warnings from problematic dependencies
      const sourceMapLoader = webpackConfig.module.rules.find(
        (rule) => rule.loader && rule.loader.includes('source-map-loader')
      );

      if (sourceMapLoader) {
        const currentExcludes = Array.isArray(sourceMapLoader.exclude)
          ? sourceMapLoader.exclude
          : sourceMapLoader.exclude
              ? [sourceMapLoader.exclude]
              : [];
        sourceMapLoader.exclude = [...currentExcludes, /rehype-harden/];
      }

      return webpackConfig;
    },
  },
};
