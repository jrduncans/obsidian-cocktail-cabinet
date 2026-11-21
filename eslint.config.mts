import obsidianmd from 'eslint-plugin-obsidianmd';
import { DEFAULT_ACRONYMS } from 'eslint-plugin-obsidianmd/dist/lib/rules/ui/acronyms.js';
import globals from 'globals';
import { globalIgnores, defineConfig } from 'eslint/config';

export default defineConfig(
	globalIgnores([
		'node_modules',
		'dist',
		'esbuild.config.mjs',
		'scripts/test.mjs',
		'scripts/catalog-docs.mjs',
		'scripts/run-ts.mjs',
		'tests/tsconfig.json',
		'version-bump.mjs',
		'versions.json',
		'main.js',
		'package.json',
		'package-lock.json',
		'tsconfig.json',
	]),
	{
		languageOptions: {
			globals: {
				...globals.browser,
			},
			parserOptions: {
				projectService: {
					allowDefaultProject: ['eslint.config.mts', 'manifest.json'],
				},
				tsconfigRootDir: import.meta.dirname,
				extraFileExtensions: ['.json'],
			},
		},
	},
	...obsidianmd.configs.recommended,
	{
		// ABV (alcohol by volume) and the pronoun I ("What can I make?") stay uppercase; the option replaces
		// the defaults, so they're kept.
		rules: {
			'obsidianmd/ui/sentence-case': [
				'warn',
				{ enforceCamelCaseLower: true, acronyms: [...DEFAULT_ACRONYMS, 'ABV', 'I'] },
			],
		},
	},
	{
		files: ['tests/**/*.ts', 'scripts/**/*.ts'],
		languageOptions: { globals: globals.node },
		rules: {
			'obsidianmd/no-nodejs-modules': 'off',
			'obsidianmd/hardcoded-config-path': 'off',
		},
	},
);
