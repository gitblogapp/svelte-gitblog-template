import assert from 'node:assert/strict';
import { createBodyExcerpt, bodyExcerptXml } from '../src/lib/server/body-excerpt';

assert.equal(
	createBodyExcerpt(
		'# Heading\n\nFirst **real** paragraph with [a link](https://example.com).\n\nSecond paragraph with `List<T>`.'
	),
	'First real paragraph with a link.\n\nSecond paragraph with List<T>.'
);
assert.equal(
	createBodyExcerpt(
		'```js\nsecret()\n```\n\n![image](https://example.com/pic.png)\n\n<script>alert(1)</script>\n\nActual body.'
	),
	'Actual body.'
);
assert.equal(createBodyExcerpt('One.\n\nTwo.\n\nThree.\n\nFour.'), 'One.\n\nTwo.\n\nThree.');
assert.equal(
	createBodyExcerpt('> Quoted **body**.\n\n- First item\n- Second item'),
	'Quoted body.\n\nFirst item\n\nSecond item'
);
assert.equal(createBodyExcerpt('A &amp; B, &#x1f331; and `&amp;`.'), 'A & B, 🌱 and &amp;.');
assert.equal(createBodyExcerpt('# Only a heading\n\n```js\ncode()\n```'), '');
const long = createBodyExcerpt('🌱'.repeat(1600));
assert.equal(Array.from(long).length, 1200);
assert.ok(long.endsWith('…'));
assert.equal(bodyExcerptXml('', 100), '');
assert.equal(bodyExcerptXml('Short body', 10), '');
assert.ok(bodyExcerptXml('<tag> & text', 100).includes('&lt;tag&gt; &amp; text'));
for (const budget of [0, 40, 100, 200, 500, 3000]) {
	const xml = bodyExcerptXml('한글 & 🌱'.repeat(300), budget);
	assert.ok(new TextEncoder().encode(xml).byteLength <= budget);
	assert.ok(!xml.includes('\ufffd'));
}
console.log('Body excerpt extraction and RSS byte budgets passed');
