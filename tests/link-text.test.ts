import assert from 'node:assert/strict';
import test from 'node:test';
import {
	cabinetNameLink,
	defaultLinkSource,
	joinWordingLink,
	savedWordingLink,
	wholeLinkSource,
	wordingLink,
} from '../src/core/link-text';
import { linkedLine, linkedLinePreview } from '../src/core/unlinked-lines';
import type { CabinetNote } from '../src/core/schema';

const note = (name: string, aliases: string[] = [], folder = 'Types'): CabinetNote =>
	({ path: `Cocktails/${folder}/${name}.md`, name, kind: 'type', aliases }) as unknown as CabinetNote;

const lime = note('Lime Juice');
const campari = note('Campari', [], 'Bottles');
const strega = note('Liquore Strega', ['Strega'], 'Bottles');
const allspice = note('St Elizabeth Allspice Dram', [], 'Bottles');
const falernum = note('Falernum Syrup', ['Falernum']);
const coruba = note('Coruba', [], 'Bottles');

void test('the same name, ignoring case, accents, punctuation, and spacing, defaults to the cabinet name', () => {
	assert.equal(defaultLinkSource('lime juice', lime, 'name'), 'name');
	assert.equal(defaultLinkSource('St. Elizabeth  Allspice Dram', allspice, 'name'), 'name');
	assert.deepEqual(cabinetNameLink('lime juice', lime), { before: '', text: 'Lime Juice', after: '' });
	assert.deepEqual(cabinetNameLink('St. Elizabeth Allspice Dram', allspice), {
		before: '',
		text: 'St Elizabeth Allspice Dram',
		after: '',
	});
});

void test('keeping the recipe wording never defaults to the cabinet name', () => {
	assert.equal(defaultLinkSource('lime juice', lime, 'keep'), 'original');
	assert.equal(defaultLinkSource('fresh lime juice', lime, 'keep'), 'original');
});

void test('an alias counts only at the alias level', () => {
	assert.equal(defaultLinkSource('Strega', strega, 'name'), 'original');
	assert.equal(defaultLinkSource('Strega', strega, 'alias'), 'name');
	assert.deepEqual(cabinetNameLink('Strega', strega), { before: '', text: 'Liquore Strega', after: '' });
	assert.equal(defaultLinkSource('a little Strega', strega, 'name'), 'original');
	assert.deepEqual(wordingLink('a little Strega', strega, 'name'), {
		before: 'a little ',
		text: 'Liquore Strega',
		after: '',
	});
});

void test('wording containing the name links only the name and keeps the other words', () => {
	assert.equal(defaultLinkSource('fresh lime juice', lime, 'name'), 'name');
	assert.deepEqual(cabinetNameLink('fresh lime juice', lime), { before: 'fresh ', text: 'Lime Juice', after: '' });
	assert.deepEqual(cabinetNameLink('strawberry-infused Campari', campari), {
		before: 'strawberry-infused ',
		text: 'Campari',
		after: '',
	});
	assert.deepEqual(cabinetNameLink('rum, preferably Coruba.', coruba), {
		before: 'rum, preferably ',
		text: 'Coruba',
		after: '.',
	});
	assert.deepEqual(cabinetNameLink('Campari, chilled', campari), { before: '', text: 'Campari', after: ', chilled' });
});

void test('a name inside a longer word is not a match', () => {
	assert.equal(defaultLinkSource('Campari-infused gin', campari, 'alias'), 'original');
	assert.deepEqual(cabinetNameLink('Campari-infused gin', campari), { before: '', text: 'Campari', after: '' });
});

void test('wording that does not contain the name keeps its wording by default', () => {
	assert.equal(defaultLinkSource('Falernum', note('Falernum Syrup'), 'alias'), 'original');
	assert.equal(defaultLinkSource('Falernum', falernum, 'name'), 'original');
	assert.equal(defaultLinkSource('Falernum', falernum, 'alias'), 'name');
	assert.deepEqual(wordingLink('Rye Whiskey', note('Bonded Rye'), 'original'), {
		before: '',
		text: 'Rye Whiskey',
		after: '',
	});
	assert.deepEqual(wordingLink('Rye Whiskey', note('Bonded Rye'), 'typed', 'rye'), {
		before: '',
		text: 'rye',
		after: '',
	});
});

void test('a wording link joins and writes into the line with the amount kept', () => {
	const fresh = cabinetNameLink('fresh lime juice', lime);
	assert.equal(joinWordingLink(fresh, lime.path), 'fresh [[Cocktails/Types/Lime Juice|Lime Juice]]');
	assert.equal(
		linkedLine('- ¾ oz fresh lime juice', lime.path, fresh),
		'- ¾ oz fresh [[Cocktails/Types/Lime Juice|Lime Juice]]',
	);
	assert.equal(
		linkedLine('- 1 oz · 30 ml Campari, chilled', campari.path, cabinetNameLink('Campari, chilled', campari)),
		'- 1 oz · 30 ml [[Cocktails/Bottles/Campari|Campari]], chilled',
	);
	assert.deepEqual(linkedLinePreview('¾ oz fresh lime juice', fresh), {
		before: '¾ oz fresh',
		link: 'Lime Juice',
		after: '',
	});
	// A plain string still links the whole wording, as before.
	assert.equal(linkedLine('- 2 oz gin', 'Cocktails/Types/Gin', 'Gin'), '- 2 oz [[Cocktails/Types/Gin|Gin]]');
});

void test('a saved wording with one link reads back into the words around it and the link', () => {
	assert.deepEqual(savedWordingLink('fresh [[Cocktails/Types/Lime Juice|Lime Juice]]'), {
		before: 'fresh ',
		target: 'Cocktails/Types/Lime Juice',
		text: 'Lime Juice',
		after: '',
	});
	assert.deepEqual(savedWordingLink('[[Campari]], chilled'), {
		before: '',
		target: 'Campari',
		text: 'Campari',
		after: ', chilled',
	});
	assert.equal(savedWordingLink('[[Gin]] or [[Vodka]]'), null);
	assert.equal(savedWordingLink('plain gin'), null);
});

void test('text linked whole starts on the cabinet name only when all of it is the name', () => {
	assert.equal(wholeLinkSource('lime juice', lime, 'name'), 'name');
	assert.equal(wholeLinkSource('Strega', strega, 'name'), 'original');
	assert.equal(wholeLinkSource('Strega', strega, 'alias'), 'name');
	assert.equal(wholeLinkSource('fresh lime juice', lime, 'alias'), 'original');
	assert.equal(wholeLinkSource('lime juice', lime, 'keep'), 'original');
});
