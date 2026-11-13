import { Notice } from 'obsidian';
import type { App } from 'obsidian';
import type { UndoPlan } from '../core/log-undo';
import type { LogUndoStore } from '../vault/log-undo-store';
import { CabinetForm } from './form';

/** A logging notice with an Undo link that opens the undo review for that log. */
export function undoNotice(app: App, undo: LogUndoStore, message: string): void {
	const id = undo.last()?.id;
	const notice = new Notice(
		createFragment((fragment) => {
			fragment.appendText(`${message} `);
			const link = fragment.createEl('a', { text: 'Undo', href: '#' });
			link.addEventListener('click', (event) => {
				event.preventDefault();
				notice.hide();
				void UndoLogModal.open(app, undo, id).catch((error: unknown) => {
					new Notice(error instanceof Error ? error.message : 'Couldn’t open the undo.');
				});
			});
		}),
		8000,
	);
}

/** Review what undoing a log puts back, then undo it. */
export class UndoLogModal extends CabinetForm {
	private bodyEl!: HTMLElement;

	private constructor(
		app: App,
		private undo: LogUndoStore,
		private plan: UndoPlan,
	) {
		super(app);
	}

	static openLast(app: App, undo: LogUndoStore): Promise<void> {
		return UndoLogModal.open(app, undo, undo.last()?.id);
	}

	static async open(app: App, undo: LogUndoStore, id: string | undefined): Promise<void> {
		const plan = id ? await undo.preview(id) : null;
		if (!plan) {
			new Notice(id ? 'That log can’t be undone anymore.' : 'No logged drink to undo.');
			return;
		}
		new UndoLogModal(app, undo, plan).open();
	}

	onOpen() {
		const record = this.plan.record;
		const servings = record.servings === 1 ? '' : `, ${record.servings} servings`;
		this.begin(`Undo ${record.title}`, `Logged for ${record.date}${servings}.`);
		this.bodyEl = this.contentEl.createDiv();
		this.submit('Undo', async () => {
			const result = await this.undo.undo(this.plan);
			if (result.status === 'done') {
				this.close();
				new Notice(result.notice);
				return;
			}
			if (!result.plan) {
				this.close();
				new Notice('That log can’t be undone anymore.');
				return;
			}
			this.plan = result.plan;
			this.render();
			this.errorEl.setText(result.notice);
		});
		this.render();
	}

	/** The form re-enables Undo after each attempt; keep it off while stock blocks the undo. */
	protected async run(action: () => Promise<void>) {
		await super.run(action);
		this.submitButton?.setDisabled(this.plan.blocked.length > 0);
	}

	private section(heading: string, items: string[]) {
		if (!items.length) return;
		this.bodyEl.createEl('h4', { text: heading });
		const list = this.bodyEl.createEl('ul');
		for (const item of items) list.createEl('li', { text: item });
	}

	private render() {
		this.bodyEl.empty();
		const plan = this.plan;
		const daily = plan.record.daily;
		this.section('Can’t undo', plan.blocked);
		this.section('Put back', [
			...plan.restores.map((restore) => restore.text),
			...(daily ? [`Remove its entry from the daily note for ${plan.record.date}`] : []),
		]);
		this.section('Left as they are', plan.kept);
		if (plan.blocked.length)
			this.bodyEl.createEl('p', {
				text: 'Stock changed since this log, so it can’t be undone.',
				cls: 'cocktail-cabinet-error',
			});
		else if (!plan.restores.length && !daily)
			this.bodyEl.createEl('p', { text: 'Nothing left to put back. Undo clears it from the list.' });
		this.submitButton?.setDisabled(plan.blocked.length > 0);
	}
}
