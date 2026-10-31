import { openBottleMl } from './stock';

export const OPEN_AMOUNT_UNITS = { percent: 'Percent full', ml: 'mL' } as const;
export type OpenAmountUnit = keyof typeof OPEN_AMOUNT_UNITS;

/** Form input state; the saved quantity is always mL. */
export class BottleAmount {
	unit: OpenAmountUnit = 'percent';
	value = '';
	private volume = '';
	private defaultFull = true;

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
	}

	setUnit(unit: string): void {
		if (unit !== 'percent' && unit !== 'ml') throw new Error('Select percent full or mL.');
		if (unit === this.unit) return;
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
		return openBottleMl(this.value, this.unit, this.fullVolume);
	}

	/** Switching stock tracking modes explicitly starts with unknown stock. */
	reset(): void {
		this.value = '';
		this.defaultFull = false;
	}
}
