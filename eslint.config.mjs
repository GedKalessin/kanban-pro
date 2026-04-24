import globals from 'globals';
import tseslint from 'typescript-eslint';
import noUnsanitized from 'eslint-plugin-no-unsanitized';
import obsidianmd from 'eslint-plugin-obsidianmd';
import { globalIgnores } from 'eslint/config';

export default tseslint.config(
  ...obsidianmd.configs.recommended,
  noUnsanitized.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.node },
      parserOptions: {
        projectService: {
          allowDefaultProject: ['eslint.config.mjs', 'manifest.json'],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      'no-unused-vars': 'off',
      'no-undef': 'off',
      'obsidianmd/ui/sentence-case': ['error', { allowAutoFix: true }],
      '@typescript-eslint/no-unused-vars': ['error', { args: 'none' }],
      '@typescript-eslint/ban-ts-comment': 'off',
      'no-prototype-builtins': 'off',
      '@typescript-eslint/no-empty-function': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      'no-unsanitized/method': 'error',
      'no-unsanitized/property': 'error',
    },
  },
  globalIgnores(['node_modules', 'dist', 'main.js']),
);