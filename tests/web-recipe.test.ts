import assert from 'node:assert/strict';
import test from 'node:test';
import { DOMParser } from 'linkedom';
import { readRecipePage, recipeUrl, sourceUrl } from '../src/core/web-recipe';
import { unshout } from '../src/core/site-diffords';
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
	// An unclosed tag in the name can't survive tag stripping.
	const unclosed = read(
		page(
			`<script type="application/ld+json">${JSON.stringify({ ...data, name: 'Sour &lt;img src=x onerror=y' })}</script>`,
			'',
		),
	);
	assert.equal(unclosed.recipe.name, 'Sour img src=x onerror=y');
});

/** A synthetic page shaped like Difford's Guide as Obsidian is served it: no recipe data, comments in articles. */
const diffords = (extra = '') =>
	page(
		'<link rel="canonical" href="https://www.diffordsguide.com/cocktails/recipe/1/test-prince">',
		`<header><h1 class="dg-component-title-block__name">Test Prince</h1><p>Updated by Someone</p></header>
		<div class="cocktail-ingredients"><p>I’m making <select><option>1</option></select> measured in</p>
		<p><em>Read about cocktail <a href="#">measures and measuring</a></em></p>
		<table class="cocktail-ingredients__table"><tbody>
		<tr><td class="ingredient-measure">2 fl oz</td><td><a href="#">Aged rum</a></td></tr>
		<tr><td class="ingredient-measure"><sup>3</sup>&frasl;<sub>4</sub> fl oz</td><td><a href="#">Punt E Mes vermouth amaro</a> <span class="tag"><svg><use></use></svg> (chilled)</span></td></tr>
		<tr><td class="ingredient-measure">1 dash</td><td><a href="#">Orange bitters</a> (optional)</td></tr>
		</tbody></table></div>
		<div class="cocktail-method"><h2>How to make</h2><label>Keep screen awake</label>
		<h3>Glass</h3><p>Photographed in a <a href="#">Bobo</a></p>
		<h3>Prepare</h3><ol><li>Select and pre-chill a <a href="#">NICK &amp; NORA GLASS</a>.</li></ol>
		<h3>Method</h3><ol start="2"><li><a href="#">STIR</a> all ingredients with ice.</li><li><a href="#">FINE STRAIN</a> into chilled glass.</li></ol>
		<h3>Garnish</h3><ol start="4"><li>Garnish with a cherry.</li></ol></div>
		<div class="cocktail-flavour-profile"><h2>Flavour Profile</h2><span>None</span><span>Boozy</span></div>
		<div class="cocktail-history"><h2>History</h2><p>Created in 2009 by <a href="#">a bartender</a>.</p><div class="cocktail-history__more">More <a href="#">cocktails by them</a></div></div>
		<div class="cocktail-review"><h2>Review</h2><p>A dark, bittersweet Manhattan.</p></div>
		<div class="shopify-container">Punt E Mes 750ml - makes 33 cocktails $27.99</div>
		${extra}
		<article class="dg-component-comment"><p>Great with 1 oz rum.</p></article>`,
	);

void test("a Difford's Guide page is read from its ingredient table, steps, review, and history", () => {
	const { recipe, original } = read(
		diffords(),
		'https://www.diffordsguide.com/cocktails/recipe/1/test-prince?utm_source=x',
	);
	assert.equal(recipe.name, 'Test Prince');
	assert.equal(recipe.source, 'https://www.diffordsguide.com/cocktails/recipe/1/test-prince');
	assert.deepEqual(recipe.ingredients, [
		{ amount: '2 fl oz', text: 'Aged rum' },
		{ amount: '3⁄4 fl oz', text: 'Punt E Mes vermouth amaro (chilled)' },
		{ amount: '1 dash', text: 'Orange bitters (optional)' },
	]);
	assert.equal(
		recipe.method,
		[
			'1. Select and pre-chill a nick & nora glass.',
			'2. Stir all ingredients with ice.',
			'3. Fine strain into chilled glass.',
			'4. Garnish with a cherry.',
		].join('\n'),
	);
	assert.equal(recipe.description, 'A dark, bittersweet Manhattan.\n\nCreated in 2009 by a bartender.');
	assert.equal(recipe.tastingNotes, '');
	assert.deepEqual(recipe.warnings, []);
	assert.match(original, /^Recipe on the page \(Difford's Guide\):\nName: Test Prince\n- 2 fl oz Aged rum/);
	assert.doesNotMatch(original, /shop|comment|27\.99|Great with/i);
});

void test("Difford's Guide's table is preferred to its abbreviated recipe data, and only on its own site", () => {
	const data = {
		'@type': 'Recipe',
		name: 'Test Prince',
		recipeIngredient: ['60 ml Aged rum (6-10yr)', '22.5 ml Vermouth amaro (Pun.)'],
		recipeInstructions: [{ '@type': 'HowToStep', text: 'STIR all ingredients with ice.' }],
		description: 'Discover how to make a Test Prince in just 4 easy to follow steps',
	};
	const html = diffords(`<script type="application/ld+json">${JSON.stringify(data)}</script>`);
	const { recipe } = read(html, 'https://www.diffordsguide.com/cocktails/recipe/1/test-prince');
	assert.equal(recipe.ingredients[1]?.text, 'Punt E Mes vermouth amaro (chilled)');
	assert.doesNotMatch(recipe.description, /Discover/);
	// The same markup elsewhere gets the generic reading, which takes the recipe data.
	assert.equal(read(html).recipe.ingredients[1]?.text, 'Vermouth amaro (Pun.)');
});

void test("Difford's steps lose their capitals but keep ordinary words", () => {
	assert.equal(unshout('STIR all ingredients with ice.'), 'Stir all ingredients with ice.');
	assert.equal(
		unshout('Select and pre-chill an OLD-FASHIONED GLASS.'),
		'Select and pre-chill an old-fashioned glass.',
	);
	assert.equal(unshout('POUR into the shell. (Fills two shells.)'), 'Pour into the shell. (Fills two shells.)');
	assert.equal(unshout('BLEND with one 12oz scoop of crushed ice.'), 'Blend with one 12oz scoop of crushed ice.');
	assert.equal(unshout('Serve with a straw.'), 'Serve with a straw.');
});
