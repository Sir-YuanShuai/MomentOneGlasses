import assert from 'node:assert/strict';
import {
  A2UI_BASIC_CATALOG_ID,
  A2UI_MIME_TYPE,
  adaptStandardA2ui,
  adaptToolResultA2ui,
  extractA2uiResource,
  extractToolText,
  normalizeA2uiMessages,
  serializeRokidA2ui,
} from '../services/a2ui-adapter.js';

const canonical = [
  {
    version: 'v0.9.1',
    createSurface: {
      surfaceId: 'summary',
      catalogId: A2UI_BASIC_CATALOG_ID,
    },
  },
  {
    version: 'v0.9.1',
    updateDataModel: {
      surfaceId: 'summary',
      path: '/',
      value: { title: '本月账单', expense: '¥38.50' },
    },
  },
  {
    version: 'v0.9.1',
    updateComponents: {
      surfaceId: 'summary',
      components: [
        { id: 'root', component: 'Column', children: ['title', 'metrics', 'detail'] },
        { id: 'title', component: 'Text', text: { path: '/title' } },
        { id: 'metrics', component: 'Row', children: ['expense'] },
        { id: 'expense', component: 'Text', text: { path: '/expense' } },
        { id: 'detail-label', component: 'Text', text: '查看详情' },
        {
          id: 'detail',
          component: 'Button',
          child: 'detail-label',
          variant: 'primary',
          action: { event: { name: 'open_detail' } },
        },
      ],
    },
  },
];

assert.deepEqual(normalizeA2uiMessages(JSON.stringify(canonical)), canonical);
assert.deepEqual(normalizeA2uiMessages({ type: 'a2ui.commands', commands: canonical }), canonical);

const adapted = adaptStandardA2ui(canonical);
assert.equal(adapted[0].type, 'createSurface');
assert.equal(adapted[0].surfaceId, 'summary');
assert.equal(adapted[1].version, 'v0.9');
assert.equal(adapted[1].updateDataModel.value.expense, '¥38.50');
assert.equal(adapted[2].type, 'updateComponents');

const components = adapted[2].components;
const root = components.find((component) => component.id === 'root');
const title = components.find((component) => component.id === 'title');
const metrics = components.find((component) => component.id === 'metrics');
const button = components.find((component) => component.id === 'detail');
assert.equal(root.type, 'view');
assert.match(root.props.style, /flex-direction: column/);
assert.equal(title.type, 'text');
assert.equal(title.props.content, '{{ title }}');
assert.match(metrics.props.style, /flex-direction: row/);
assert.equal(button.type, 'button');
assert.equal(button.props.a2uiAction.event.name, 'open_detail');
assert.deepEqual(button.children, ['detail-label']);

const unknown = adaptStandardA2ui({
  version: 'v0.9.1',
  updateComponents: {
    surfaceId: 'summary',
    components: [
      { id: 'wrapper', component: 'FutureContainer', children: ['leaf'] },
      { id: 'leaf', component: 'FutureLeaf' },
    ],
  },
});
assert.equal(unknown[0].components[0].type, 'view');
assert.deepEqual(unknown[0].components[0].children, ['leaf']);
assert.equal(unknown[0].components[1].type, 'text');
assert.match(unknown[0].components[1].props.content, /FutureLeaf/);

const result = {
  content: [
    { type: 'text', text: '本月支出 38.50 元' },
    {
      type: 'resource',
      resource: {
        uri: 'a2ui://moment-one/summary',
        mimeType: `${A2UI_MIME_TYPE};charset=utf-8`,
        text: JSON.stringify(canonical),
      },
      annotations: { audience: ['user'] },
    },
  ],
  structuredContent: { expense: 38.5 },
};
assert.equal(extractToolText(result), '本月支出 38.50 元');
assert.equal(extractA2uiResource(result).uri, 'a2ui://moment-one/summary');
const presentation = adaptToolResultA2ui(result);
assert.equal(presentation.fallbackText, '本月支出 38.50 元');
assert.equal(JSON.parse(presentation.commands)[0].type, 'createSurface');
assert.equal(serializeRokidA2ui(canonical), presentation.commands);

assert.throws(() => normalizeA2uiMessages('{not-json'), /valid JSON/);
assert.throws(() => adaptStandardA2ui({ version: 'v0.9.1', unsupported: {} }), /Unsupported/);

console.log('A2UI adapter Gate A checks passed.');
