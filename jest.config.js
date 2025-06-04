/* eslint-env node */
/** @type {import('jest').Config} */
exports.preset = 'ts-jest';
exports.testEnvironment = 'node';
exports.testMatch = ['**/test/**/*.test.ts'];
exports.moduleFileExtensions = ['ts', 'js', 'json', 'node'];
exports.transform = {
  '^.+\\.(ts|tsx)$': 'ts-jest',
};
exports.extensionsToTreatAsEsm = [];
exports.testTimeout = 30000;
