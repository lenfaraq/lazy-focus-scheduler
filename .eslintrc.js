// https://docs.expo.dev/guides/using-eslint/
module.exports = {
  extends: ['expo'],
  env: {
    node: true,
  },
  overrides: [
    {
      files: ['**/__tests__/**/*.{js,jsx,ts,tsx}', 'jest.setup.js', 'jest.config.js'],
      env: {
        jest: true,
      },
    },
  ],
  ignorePatterns: ['/dist/*', 'node_modules/*'],
};
