// ESLint v9+ 用の設定ファイル
const js = require('@eslint/js');
const tseslint = require('@typescript-eslint/eslint-plugin');
const parser = require('@typescript-eslint/parser');
const importPlugin = require('eslint-plugin-import');
const globals = require('globals');

module.exports = [
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
    // CommonJSファイル用の設定
    {
        files: ['*.js', 'tools/*.js', 'jest.config.js'],
        languageOptions: {
            globals: {
                ...globals.node,
            },
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
