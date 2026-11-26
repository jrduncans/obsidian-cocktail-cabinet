import assert from 'node:assert/strict';
import test from 'node:test';
import { DOMParser } from 'linkedom';
import { readRecipePage, recipeUrl, sourceUrl } from '../src/core/web-recipe';
import { recipeVolumeMl, splitIngredient } from '../src/core/recipe-amount';
import { roughMarkdown } from './support-markdown';

const parse = (html: string) => new DOMParser().parseFromString(html, 'text/html') as unknown as Document;
const read = (html: string, url = 'https://example.test/recipes/drink/') =>
	readRecipePage(html, url, { parse, toMarkdown: roughMarkdown });

const page = (head: string, body: string) =>
	`<!doctype html><html><head><title>Site title</title>${head}</head><body>${body}</body></html>`;

void test('only a single http(s) URL counts as a page to fetch', () => {
	assert.equal(recipeUrl(' https://example.test/a?b=1 ')?.hostname, 'example.test');
	assert.equal(recipeUrl('http://example.test')?.protocol, 'http:');
	assert.equal(recipeUrl('Daiquiri\nhttps://example.test/'), null);
	assert.equal(recipeUrl('see https://example.test/'), null);
	assert.equal(recipeUrl('ftp://example.test/'), null);
	assert.equal(recipeUrl('1 oz gin'), null);
});

void test('the source is the canonical URL on the same site, without tracking or a fragment', () => {
	assert.equal(
		sourceUrl('https://punch.test/r/yacht-rock/?utm_source=instagram&utm_medium=social#top'),
		'https://punch.test/r/yacht-rock/',
	);
	assert.equal(sourceUrl('https://site.test/r?id=4&fbclid=x&igsh=y'), 'https://site.test/r?id=4');
	assert.equal(sourceUrl('https://www.site.test/r?x=1', 'https://site.test/r'), 'https://site.test/r');
	assert.equal(sourceUrl('https://site.test/r?x=1', '/canonical/r'), 'https://site.test/canonical/r');
	// A canonical link on another site, or one that can't be read, is ignored.
	assert.equal(sourceUrl('https://site.test/r', 'https://other.test/r'), 'https://site.test/r');
	assert.equal(sourceUrl('https://site.test/r', 'http://['), 'https://site.test/r');
});

void test('JSON-LD recipe data gives the ingredients, numbered steps, and description', () => {
	const data = {
		'@context': 'https://schema.org',
		'@graph': [
			{ '@type': 'WebPage', name: 'Page' },
			{
				'@type': ['Recipe'],
				name: 'Tunnel Negroni',
				description: 'Bitter &amp; dry.',
				recipeIngredient: ['30 ml Gin', '30 ml Dry vermouth', '20 ml Amaro (e.g. Meletti)'],
				recipeInstructions: [
					{ '@type': 'HowToStep', text: 'STIR all ingredients with ice.' },
					{
						'@type': 'HowToSection',
						name: 'To serve',
						itemListElement: [{ '@type': 'HowToStep', text: 'STRAIN into an ice-filled glass.' }],
					},
				],
				keywords: 'negroni, bitter',
				recipeYield: '1',
			},
		],
	};
	const { recipe, original } = read(
		page(
			`<script type="application/ld+json">${JSON.stringify(data)}</script><link rel="canonical" href="https://example.test/tunnel-negroni">`,
			'<h1>Tunnel Negroni</h1><p>Unrelated text.</p>',
		),
		'https://example.test/tunnel-negroni?utm_campaign=x',
	);
	assert.equal(recipe.name, 'Tunnel Negroni');
	assert.equal(recipe.source, 'https://example.test/tunnel-negroni');
	assert.deepEqual(recipe.ingredients, [
		{ amount: '30 ml', text: 'Gin' },
		{ amount: '30 ml', text: 'Dry vermouth' },
		{ amount: '20 ml', text: 'Amaro (e.g. Meletti)' },
	]);
	assert.equal(recipe.method, '1. STIR all ingredients with ice.\n2. To serve:\n3. STRAIN into an ice-filled glass.');
	assert.equal(recipe.description, 'Bitter & dry.');
	assert.deepEqual(recipe.warnings, []);
	// Keywords and yield are the site's, not the recipe's.
	assert.doesNotMatch(JSON.stringify(recipe), /negroni, bitter/);
	assert.match(original, /Recipe data on the page:\nName: Tunnel Negroni\n- 30 ml Gin/);
});

void test('microdata ingredients skip hidden duplicates in the text, and a garnish line is kept', () => {
	const ingredient = (line: string) =>
		`<li>${line}</li><li itemprop="recipeIngredient" style="display: none">${line}</li>`;
	const html = page(
		'',
		`<nav><a>Recipes</a></nav><main><article><section itemscope itemtype="http://schema.org/Recipe">
			<h1 itemprop="name">Yacht Rock</h1>
			<div itemprop="author" itemscope itemtype="http://schema.org/Person"><span itemprop="name">A Writer</span></div>
			<meta itemprop="description" content="A Jungle Bird twist.">
			<h5>Ingredients</h5><ul>${ingredient('3/4 ounce rum, such as Coruba')}${ingredient('3/4 ounce Campari')}</ul>
			<p><span>Garnish:</span> lime boat, orchid</p>
			<h5>Directions</h5><ol><li>Shake with ice.</li><li>Strain over crushed ice.</li></ol>
		</section></article></main>`,
	);
	const { recipe } = read(html);
	assert.equal(recipe.name, 'Yacht Rock');
	assert.deepEqual(recipe.ingredients, [
		{ amount: '3/4 ounce', text: 'rum, such as Coruba' },
		{ amount: '3/4 ounce', text: 'Campari' },
		{ amount: '', text: 'Garnish: lime boat, orchid' },
	]);
	assert.equal(recipe.description, 'A Jungle Bird twist.');
	// Directions aren't marked up, so they come from the text, once.
	assert.match(recipe.method, /Shake with ice\.[\s\S]*Strain over crushed ice\./);
	assert.equal(recipe.method.match(/Shake with ice/g)?.length, 1);
});

void test('a blog post without recipe data is read from its body and named by its title', () => {
	const html = page(
		'',
		`<header><h1>Blog name</h1></header>
		<div class="post hentry"><h3 class="post-title entry-title">tell no tales</h3>
		<div class="post-body entry-content">1 1/2 oz Appleton Rum<br>3/4 oz Lime Juice<br>2 dash Angostura Bitters<br><br>
		Shake with ice, strain into a rocks glass.<br><br>I had this at a bar.</div>
		<div class="post-footer">ingredients: absinthe, rum</div></div>
		<aside><ul><li>amaro (770)</li><li>gin (1190)</li></ul></aside>`,
	);
	const { recipe } = read(html);
	assert.equal(recipe.name, 'tell no tales');
	assert.deepEqual(recipe.ingredients, [
		{ amount: '1 1/2 oz', text: 'Appleton Rum' },
		{ amount: '3/4 oz', text: 'Lime Juice' },
		{ amount: '2 dash', text: 'Angostura Bitters' },
	]);
	assert.match(recipe.method, /^Shake with ice/);
	assert.doesNotMatch(JSON.stringify(recipe), /amaro \(770\)|absinthe/);
});

void test('navigation before the page heading is skipped and the heading names the recipe', () => {
	const html = page(
		'',
		`<main><p>Back to Recipes</p><h1>Today is Friday</h1><p>Print</p>
		<h2>Ingredients</h2><ul><li>2 oz white rum</li><li>¾ oz fresh lime juice</li></ul>
		<h2>Directions</h2><ul><li>Shake and strain.</li></ul></main>`,
	);
	const { recipe } = read(html);
	assert.equal(recipe.name, 'Today is Friday');
	assert.deepEqual(
		recipe.ingredients.map((row) => `${row.amount} ${row.text}`),
		['2 oz white rum', '¾ oz fresh lime juice'],
	);
	assert.ok(!recipe.warnings.some((warning) => /first line/.test(warning)));
	assert.doesNotMatch(recipe.description, /Back to Recipes/);
});

void test('a page with nothing readable gives no ingredients, and scripts never count', () => {
	const { recipe } = read(
		page('<title>Simple Page</title>', '<div id="root"></div><script>var r = "1 oz gin";</script>'),
	);
	assert.deepEqual(recipe.ingredients, []);
});

void test('amounts may use the fraction slash, and links and images in page text come through as plain text', () => {
	assert.deepEqual(splitIngredient('2⁄3 fl oz Amaro'), { amount: '2⁄3 fl oz', text: 'Amaro' });
	assert.equal(recipeVolumeMl('2⁄3 fl oz')?.toFixed(2), recipeVolumeMl('2/3 fl oz')?.toFixed(2));
	const { recipe } = read(
		page(
			'',
			`<article><article class="comment"><p>Great drink!</p></article><h1>Today is Friday</h1><img src="x.jpg" alt="photo">
			<h2>Ingredients</h2><ul><li>¾ oz <a href="/syrup"><strong>Marion Blackberry Syrup</strong></a></li><li>2 oz white rum</li></ul>
			<h2>Directions</h2><p>Shake with ice. <a href="#">Print</a></p></article>`,
		),
	);
	assert.deepEqual(recipe.ingredients[0], { amount: '¾ oz', text: 'Marion Blackberry Syrup' });
	assert.doesNotMatch(JSON.stringify(recipe), /\]\(|x\.jpg|\*\*/);
});

void test('without a recipe-like container, the body is read rather than the first article', () => {
	const { recipe } = read(
		page(
			'',
			`<div class="content"><h1>Tunnel Negroni</h1><h2>Ingredients</h2><ul><li>1 fl oz London Dry Gin</li></ul></div>
			<h2>Comments</h2><article class="comment"><p>Lovely.</p></article>`,
		),
	);
	assert.equal(recipe.name, 'Tunnel Negroni');
	assert.deepEqual(recipe.ingredients, [{ amount: '1 fl oz', text: 'London Dry Gin' }]);
});

void test('ingredient tables read as one line per row', () => {
	const { recipe } = read(
		page(
			'',
			`<main><h1>Tunnel Negroni</h1><h2>Ingredients</h2><table><tr><td></td><td>1 fl oz</td><td><a href="#">London Dry Gin</a></td></tr>
			<tr><td></td><td>2⁄3 fl oz</td><td>Amaro</td></tr></table><h2>How to make</h2><ol><li>STIR with ice.</li></ol></main>`,
		),
	);
	assert.deepEqual(recipe.ingredients, [
		{ amount: '1 fl oz', text: 'London Dry Gin' },
		{ amount: '2⁄3 fl oz', text: 'Amaro' },
	]);
});

void test('HTML smuggled into a page’s recipe stays text in the note', () => {
	const data = {
		'@type': 'Recipe',
		name: 'Tracked <b>Sour</b>',
		description: 'Bright &lt;img src="https://t.example/p.gif"&gt; and tart.',
		recipeIngredient: ['2 oz gin &lt;iframe src="https://t.example/"&gt;&lt;/iframe&gt;', '¾ oz lemon juice'],
		recipeInstructions: ['Shake &lt;script&gt;x&lt;/script&gt; with ice.'],
	};
	const { recipe } = read(page(`<script type="application/ld+json">${JSON.stringify(data)}</script>`, ''));
	assert.equal(recipe.name, 'Tracked Sour');
	assert.equal(recipe.ingredients[0]!.text, 'gin &lt;iframe src="https://t.example/">&lt;/iframe>');
	assert.equal(recipe.description, 'Bright &lt;img src="https://t.example/p.gif"> and tart.');
	assert.equal(recipe.method, 'Shake &lt;script>x&lt;/script> with ice.');
	assert.equal(recipe.ingredients[1]!.text, 'lemon juice');
	// A tag at the very start is escaped too; one already escaped is left as written.
	const escaped = read(
		page(
			`<script type="application/ld+json">${JSON.stringify({ ...data, description: '&lt;b&gt;Bold&lt;/b&gt; and \\&lt;i&gt; kept.' })}</script>`,
			'',
		),
	);
	assert.equal(escaped.recipe.description, '&lt;b>Bold&lt;/b> and \\<i> kept.');
});
