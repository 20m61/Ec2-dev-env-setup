// ESLint v9+ 用の設定ファイル
import js from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import parser from '@typescript-eslint/parser';
import importPlugin from 'eslint-plugin-import';
import globals from 'globals';

export default [
    js.configs.recommended,
    {
        files: ['**/*.ts', '**/*.tsx', 'test/**/*.ts'],
        plugins: {
            '@typescript-eslint': tseslint,
            import: importPlugin,
        },
        languageOptions: {
            parser: parser,
            parserOptions: {
                project: ['./tsconfig.json'],
                sourceType: 'module',
            },
            globals: {
                ...globals.node,
                ...globals.jest, // Jestグローバル追加
            },
        },
        rules: {
            'import/order': 'warn',
            '@typescript-eslint/no-unused-vars': 'warn',
        },
    },
    {
        ignores: [
            'cdk.out/',
            'dist/',
            'node_modules/',
            'coverage/',
            'lcov-report/',
        ],
    },
];
