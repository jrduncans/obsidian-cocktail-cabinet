import { moment, normalizePath, TFile, TFolder } from 'obsidian';
import type { App } from 'obsidian';
import { hasDailyLog } from '../core/logging-daily';
import type { CabinetNote } from '../core/schema';

type DailyDate = ReturnType<typeof moment>;
interface DailyOptions { folder?: string; format?: string; template?: string; }
interface DailyInstance {
	options: DailyOptions;
	getFormat(): string;
	getDailyNote(date: DailyDate): Promise<TFile | null | undefined>;
}
interface DailyPlugin { enabled: boolean; instance?: DailyInstance; }
export interface DailyPreview {
	date: string;
	path: string;
	configuration: string;
	duplicate: boolean;
	error?: string;
}

/** The core plugin has no public typed API. Keep its structural boundary here. */
export class LoggingDaily {
	constructor(private app: App) {}

	private instance(): DailyInstance {
		const internal = (this.app as App & { internalPlugins?: { plugins: Record<string, DailyPlugin> } }).internalPlugins;
		const plugin = internal?.plugins['daily-notes'];
		if (!plugin?.enabled || !plugin.instance || typeof plugin.instance.getDailyNote !== 'function'
			|| typeof plugin.instance.getFormat !== 'function') throw new Error('Turn on the Daily notes core plugin to use this.');
		return plugin.instance;
	}

	private resolve = (link: string, source: string): string | null => this.app.metadataCache.getFirstLinkpathDest(link, source)?.path ?? null;

	async preview(recipe: CabinetNote): Promise<DailyPreview> {
		const date = moment();
		const result: DailyPreview = { date: date.format('YYYY-MM-DD'), path: '', configuration: '', duplicate: false };
		try {
			const instance = this.instance();
			result.configuration = JSON.stringify(instance.options);
			const folder = instance.options.folder
				? this.app.vault.getAbstractFileByPath(normalizePath(instance.options.folder))
				: this.app.fileManager.getNewFileParent('');
			if (!(folder instanceof TFolder)) throw new Error('Daily note folder not found. Check Settings → Daily notes.');
			const name = date.format(instance.getFormat()).trim();
			if (!name || /[\\:*?"<>|]/.test(name) || name.split('/').some(part => !part || part === '.' || part === '..')) {
				throw new Error('Daily note date format isn’t a valid name. Check Settings → Daily notes.');
			}
			result.path = normalizePath(`${folder.path}/${name}.md`);
			// Match native case-insensitive discovery, and retain the actual existing path.
			const existing = this.app.vault.getAllLoadedFiles().find(file => file.path.toLowerCase() === result.path.toLowerCase());
			if (existing && !(existing instanceof TFile)) throw new Error('A folder has today’s daily note name.');
			if (existing instanceof TFile) {
				result.path = existing.path;
				result.duplicate = hasDailyLog(await this.app.vault.read(existing), recipe, link => this.resolve(link, existing.path));
			} else {
				// Verify the template and path before touching inventory; creation stays native.
				const templatePath = instance.options.template;
				if (templatePath) {
					const template = this.app.vault.getAbstractFileByPath(normalizePath(templatePath.endsWith('.md') ? templatePath : `${templatePath}.md`));
					if (!(template instanceof TFile)) throw new Error('Daily note template not found. Check Settings → Daily notes.');
					await this.app.vault.read(template);
				}
				const parts = result.path.split('/');
				for (let depth = 1; depth < parts.length; depth++) {
					const parent = this.app.vault.getAbstractFileByPath(parts.slice(0, depth).join('/'));
					if (parent && !(parent instanceof TFolder)) throw new Error('A file has the daily note folder’s name.');
				}
			}
		} catch (error) { result.error = error instanceof Error ? error.message : 'Daily notes unavailable.'; }
		return result;
	}

	async append(preview: DailyPreview, recipe: CabinetNote, line: string): Promise<boolean> {
		const instance = this.instance();
		if (preview.configuration !== JSON.stringify(instance.options) || preview.date !== moment().format('YYYY-MM-DD')) {
			throw new Error('The date or daily note settings changed.');
		}
		const file = await instance.getDailyNote(moment(preview.date, 'YYYY-MM-DD'));
		if (!(file instanceof TFile) || file.path !== preview.path) throw new Error('Couldn’t open or create today’s note.');
		let appended = false;
		await this.app.vault.process(file, content => {
			if (!preview.duplicate && hasDailyLog(content, recipe, link => this.resolve(link, file.path))) return content;
			appended = true;
			return `${content}${content && !content.endsWith('\n') ? '\n' : ''}${line}\n`;
		});
		return appended;
	}
}
