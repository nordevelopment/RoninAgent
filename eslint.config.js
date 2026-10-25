import tsParser from '@typescript-eslint/parser';

export default [
  { ignores: ['node_modules/**', 'dist/**', 'workspace/**', 'storage/**', 'frontend/src/**/*.vue'] },
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: { parser: tsParser, parserOptions: { ecmaVersion: 'latest', sourceType: 'module' } },
    rules: {
      'no-unreachable': 'error',
      'no-constant-condition': 'error'
    }
  }
];
