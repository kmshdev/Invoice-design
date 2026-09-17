/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at https://mozilla.org/MPL/2.0/.
 *
 * Copyright Oxide Computer Company
 */
import { defineConfig } from 'vite-plus'

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    include: ['test/**/*.test.{ts,tsx}'],
  },
  fmt: {
    printWidth: 92,
    proseWrap: 'always',
    semi: false,
    singleQuote: true,
    trailingComma: 'all',
    sortImports: {
      groups: [
        ['builtin', 'external', 'internal', 'subpath'],
        ['parent', 'sibling', 'index'],
        'unknown',
      ],
      newlinesBetween: true,
      sortSideEffects: false,
    },
    sortPackageJson: false,
    sortTailwindcss: {},
    ignorePatterns: ['**/*.json', '**/*.md', '**/*.astro'],
  },
  lint: {
    plugins: ['typescript', 'react', 'unicorn', 'oxc'],
    categories: { correctness: 'error' },
    env: { node: true, browser: true },
    ignorePatterns: ['**/*.astro', '**/*.js'],
    options: { typeAware: true, typeCheck: true },
    rules: {
      // React Compiler is not enabled; preserve the current effect-based components.
      'react/set-state-in-effect': 'off',
      'no-array-constructor': 'error',
      'no-unused-expressions': 'error',
      'no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
        },
      ],
      eqeqeq: [
        'error',
        'always',
        {
          null: 'ignore',
        },
      ],
      'no-param-reassign': 'error',
      'no-return-assign': 'error',
      'typescript/ban-ts-comment': 'error',
      'typescript/no-duplicate-enum-values': 'error',
      'typescript/no-empty-object-type': 'error',
      'typescript/no-explicit-any': 'error',
      'typescript/no-extra-non-null-assertion': 'error',
      'typescript/no-misused-new': 'error',
      'typescript/no-namespace': 'error',
      'typescript/no-non-null-asserted-optional-chain': 'error',
      'typescript/no-require-imports': 'error',
      'typescript/no-this-alias': 'error',
      'typescript/no-unnecessary-type-constraint': 'error',
      'typescript/no-unsafe-declaration-merging': 'error',
      'typescript/no-unsafe-function-type': 'error',
      'typescript/no-wrapper-object-types': 'error',
      'typescript/prefer-as-const': 'error',
      'typescript/prefer-namespace-keyword': 'error',
      'typescript/triple-slash-reference': 'error',
    },
    overrides: [
      {
        files: ['**/*.{ts,tsx,mts,cts}'],
        rules: {
          'constructor-super': 'off',
          'getter-return': 'off',
          'no-class-assign': 'off',
          'no-const-assign': 'off',
          'no-dupe-class-members': 'off',
          'no-dupe-keys': 'off',
          'no-func-assign': 'off',
          'no-import-assign': 'off',
          'no-new-native-nonconstructor': 'off',
          'no-obj-calls': 'off',
          'no-redeclare': 'off',
          'no-setter-return': 'off',
          'no-this-before-super': 'off',
          'no-undef': 'off',
          'no-unreachable': 'off',
          'no-unsafe-negation': 'off',
          'no-var': 'error',
          'no-with': 'off',
          'prefer-const': 'error',
          'prefer-rest-params': 'error',
          'prefer-spread': 'error',
        },
      },
    ],
  },
  run: {
    // Validation must execute, not replay a prior success or omit deleted build outputs.
    cache: false,
    tasks: {
      'invoice:server:check': {
        command: 'vp run invoice:browser && vp run invoice:server:test',
      },
      'check-all': {
        command: 'node -e "console.log(\'All toolchain checks passed\')"',
        dependsOn: [
          'check',
          'test',
          'invoice:check',
          'invoice:server:check',
          'invoice:prose',
          'astro:format:check',
        ],
      },
    },
  },
})
