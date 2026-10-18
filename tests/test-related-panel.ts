import assert from 'node:assert/strict';
import { createRelatedPanelConfig } from '../src/lib/template/related-panel.ts';
const input = { repository: 'owner/blog', hubEnabled: true };
assert.equal(createRelatedPanelConfig(input)?.limit, 4);
for (const limit of ['1', '4', '8']) {
	assert.equal(createRelatedPanelConfig({ ...input, limit })?.limit, Number(limit));
}
for (const limit of ['', '0', '9', '-1', '1.5', 'oops']) {
	assert.equal(createRelatedPanelConfig({ ...input, limit })?.limit, 4);
}
assert.equal(createRelatedPanelConfig({ ...input, enabled: 'false' }), null);
assert.equal(createRelatedPanelConfig({ ...input, hubEnabled: false }), null);
console.log('Related panel defaults, count bounds and opt-outs passed');
