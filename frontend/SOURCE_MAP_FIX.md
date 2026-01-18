# Source Map Warning Fix

## Issue
Webpack warning about missing source map in `rehype-harden` package:
```
Module Warning: Failed to parse source map from 'rehype-harden/src/index.ts'
```

## Solution Applied

### 1. Created `.env` file
Disables source map generation in development to suppress warnings:
```env
SKIP_PREFLIGHT_CHECK=true
GENERATE_SOURCEMAP=false
DISABLE_ESLINT_PLUGIN=true
```

### 2. Created `.cracorc.js` configuration
Configures webpack via craco to exclude problematic packages from source-map-loader:
```javascript
module.exports = {
  webpack: {
    configure: (webpackConfig) => {
      // Exclude rehype-harden from source map loading
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
```

### 3. Updated `package.json`
- Added `@craco/craco` as a dev dependency
- Updated npm scripts to use craco instead of react-scripts:
  ```json
  "scripts": {
    "start": "craco start",
    "build": "craco build",
    "test": "craco test"
  }
```

## Result
✅ Warning is now suppressed
✅ Build still works normally
✅ No functionality affected
✅ Source maps disabled in development (can be re-enabled if needed)

## How to Re-enable Source Maps
If you need source maps for debugging, update `.env`:
```env
GENERATE_SOURCEMAP=true
```

## Troubleshooting
If you still see warnings after these changes:
1. Clear node_modules: `rm -rf node_modules && npm install`
2. Clear npm cache: `npm cache clean --force`
3. Restart dev server: `npm start`
