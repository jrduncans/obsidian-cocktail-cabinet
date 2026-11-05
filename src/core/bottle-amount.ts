import { openBottleMl } from './stock';

export const OPEN_AMOUNT_UNITS = { percent: 'Percent full', ml: 'mL' } as const;
export type OpenAmountUnit = keyof typeof OPEN_AMOUNT_UNITS;

/** Form input state; the saved quantity is always mL. */
export class BottleAmount {
	unit: OpenAmountUnit = 'percent';
	value = '';
	private volume = '';
	private defaultFull = true;
	/** The saved amount, kept exact until the user changes the entry. */
	private loaded: number | null | undefined;

	private get fullVolume(): number | null {
		const volume = Number(this.volume);
		return this.volume.trim() && Number.isFinite(volume) && volume > 0 ? volume : null;
	}

	setVolume(value: string): void {
		this.volume = value;
		if (this.defaultFull) {
			const volume = this.fullVolume;
			this.value = volume === null ? '' : this.unit === 'percent' ? '100' : String(volume);
		}
	}

	setValue(value: string): void {
		this.value = value;
		this.defaultFull = false;
		this.loaded = undefined;
	}

	/** Start from saved stock: percent when the bottle size is known, otherwise mL. */
	load(ml: number | null, volume: number | null): void {
		this.volume = volume === null ? '' : String(volume);
		this.defaultFull = false;
		this.unit = volume !== null && volume > 0 ? 'percent' : 'ml';
		this.loaded = ml;
		this.value = this.display(ml);
	}

	private display(ml: number | null): string {
		if (ml === null) return '';
		const volume = this.fullVolume;
		if (this.unit === 'ml') return String(Number(ml.toFixed(3)));
		return volume === null ? '' : String(Number((ml / volume * 100).toFixed(1)));
	}

	setUnit(unit: string): void {
		if (unit !== 'percent' && unit !== 'ml') throw new Error('Select percent full or mL.');
		if (unit === this.unit) return;
		if (this.loaded !== undefined) {
			if (unit === 'percent' && this.loaded !== null && this.loaded > 0 && this.fullVolume === null) {
				throw new Error('Enter the bottle volume to use a percentage estimate.');
			}
			this.unit = unit;
			this.value = this.display(this.loaded);
			return;
		}
		let value = '';
		if (this.defaultFull) {
			if (this.fullVolume !== null) value = unit === 'percent' ? '100' : String(this.fullVolume);
		} else {
			const ml = this.toMl();
			if (ml !== null) {
				const volume = this.fullVolume;
				if (unit === 'ml') value = String(ml);
				else if (ml === 0) value = '0';
				else if (volume === null) throw new Error('Enter the bottle volume to use a percentage estimate.');
				else value = String(ml / volume * 100);
			}
		}
		this.unit = unit;
		this.value = value;
	}

	toMl(): number | null {
		if (this.loaded !== undefined) return this.loaded;
		return openBottleMl(this.value, this.unit, this.fullVolume);
	}

	/** Switching stock tracking modes explicitly starts with unknown stock. */
	reset(): void {
		this.value = '';
		this.defaultFull = false;
		this.loaded = undefined;
	}
}
