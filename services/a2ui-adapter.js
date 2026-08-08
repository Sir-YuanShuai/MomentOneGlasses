// Standard A2UI v0.9/v0.9.1 -> Rokid AIUI <a2ui> compatibility adapter.
//
// The public A2UI protocol uses envelope messages such as
// { version, createSurface: {...} } and Basic Catalog components such as
// Column/Row/Text/Button. Rokid's current AIUI sample consumes a compact
// command dialect ({ type: 'createSurface' | 'updateComponents', ... }) plus
// versioned updateDataModel envelopes. Keep this translation at the client
// boundary so the Server can remain standards-based and other clients can
// consume the same A2UI payload unchanged.

export const A2UI_MIME_TYPE = 'application/a2ui+json';
export const A2UI_PROTOCOL_FAMILY = 'v0.9';
export const A2UI_BASIC_CATALOG_ID = 'https://a2ui.org/specification/v0_9/catalogs/basic/catalog.json';
export const A2UI_BASIC_CATALOG_ID_V091 = 'https://a2ui.org/specification/v0_9_1/catalogs/basic/catalog.json';

const CONTAINER_COMPONENTS = {
  Column: 'column',
  Row: 'row',
  Card: 'column',
  List: 'column',
  Grid: 'row',
};

const LEAF_COMPONENTS = {
  Text: 'text',
  Button: 'button',
  Image: 'image',
  Divider: 'divider',
  Icon: 'text',
};

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function parseJson(value) {
  if (typeof value !== 'string') return value;
  const text = value.trim();
  if (!text) return [];
  try {
    return JSON.parse(text);
  } catch (error) {
    const invalid = new Error('A2UI payload is not valid JSON');
    invalid.code = 'A2UI_INVALID_JSON';
    invalid.cause = error;
    throw invalid;
  }
}

export function normalizeA2uiMessages(payload) {
  const parsed = parseJson(payload);
  if (Array.isArray(parsed)) return parsed;
  if (isObject(parsed) && parsed.type === 'a2ui.commands' && Array.isArray(parsed.commands)) {
    return parsed.commands;
  }
  if (isObject(parsed)) return [parsed];
  const error = new Error('A2UI payload must be an object or array');
  error.code = 'A2UI_INVALID_PAYLOAD';
  throw error;
}

function pathBinding(value) {
  if (!isObject(value) || typeof value.path !== 'string') return '';
  const normalized = value.path.replace(/^\/+/, '').replace(/\//g, '.');
  return normalized ? `{{ ${normalized} }}` : '';
}

function stringValue(value, fallback = '') {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return pathBinding(value) || fallback;
}

function joinStyle(parts) {
  return parts.filter(Boolean).join(' ');
}

function layoutStyle(kind, source) {
  const provided = typeof source.style === 'string' ? source.style.trim() : '';
  if (kind === 'row') {
    return joinStyle(['display: flex; flex-direction: row; align-items: center;', provided]);
  }
  return joinStyle(['display: flex; flex-direction: column;', provided]);
}

function componentChildren(component) {
  if (Array.isArray(component.children)) return component.children.map(String);
  if (component.child !== undefined && component.child !== null && component.child !== '') {
    return [String(component.child)];
  }
  return [];
}

function mapStandardComponent(component) {
  const id = String(component.id || '');
  if (!id) {
    const error = new Error('A2UI component is missing id');
    error.code = 'A2UI_COMPONENT_INVALID';
    throw error;
  }

  // Already in the dialect accepted by the Rokid sample: keep it untouched.
  if (typeof component.type === 'string' && !component.component) {
    return Object.assign({}, component, { id });
  }

  const name = String(component.component || '');
  const containerKind = CONTAINER_COMPONENTS[name];
  if (containerKind) {
    return {
      id,
      type: 'view',
      props: {
        style: layoutStyle(containerKind, component),
        a2uiComponent: name,
      },
      children: componentChildren(component),
    };
  }

  if (name === 'Text') {
    return {
      id,
      type: 'text',
      props: {
        content: stringValue(component.text, ''),
        style: typeof component.style === 'string' ? component.style : '',
        a2uiComponent: name,
      },
    };
  }

  if (name === 'Button') {
    return {
      id,
      type: 'button',
      props: {
        style: typeof component.style === 'string' ? component.style : '',
        variant: stringValue(component.variant, ''),
        // Preserve the standard action as data. Rokid action dispatch is kept
        // behind the generic renderer and can be wired without per-tool code.
        a2uiAction: component.action || null,
        a2uiComponent: name,
      },
      children: componentChildren(component),
    };
  }

  if (name === 'Image') {
    return {
      id,
      type: 'image',
      props: {
        src: stringValue(component.url || component.src, ''),
        alt: stringValue(component.alt, ''),
        style: typeof component.style === 'string' ? component.style : '',
        a2uiComponent: name,
      },
    };
  }

  if (name === 'Divider') {
    return {
      id,
      type: 'view',
      props: {
        style: joinStyle([
          'width: 100%; height: 1px; background-color: var(--border-color-muted);',
          typeof component.style === 'string' ? component.style : '',
        ]),
        a2uiComponent: name,
      },
    };
  }

  if (name === 'Icon') {
    return {
      id,
      type: 'text',
      props: {
        content: stringValue(component.name || component.text, '•'),
        style: typeof component.style === 'string' ? component.style : '',
        a2uiComponent: name,
      },
    };
  }

  // Unknown containers retain their children so a new optional component does
  // not make the whole result blank. Unknown leaves render a compact marker.
  const children = componentChildren(component);
  if (children.length) {
    return {
      id,
      type: 'view',
      props: {
        style: layoutStyle('column', component),
        a2uiUnsupportedComponent: name || 'unknown',
      },
      children,
    };
  }
  return {
    id,
    type: 'text',
    props: {
      content: `[${name || 'Unsupported UI'}]`,
      style: 'font-size: 10px; color: var(--color-text-secondary);',
      a2uiUnsupportedComponent: name || 'unknown',
    },
  };
}

function convertMessage(message) {
  if (!isObject(message)) {
    const error = new Error('A2UI message must be an object');
    error.code = 'A2UI_MESSAGE_INVALID';
    throw error;
  }

  // Rokid-native messages remain valid and make the adapter idempotent.
  if (typeof message.type === 'string') return message;

  if (isObject(message.createSurface)) {
    const source = message.createSurface;
    return {
      type: 'createSurface',
      surfaceId: String(source.surfaceId || 'main'),
      containerId: 'root',
      catalogId: String(source.catalogId || ''),
      theme: source.theme || undefined,
    };
  }

  if (isObject(message.updateComponents)) {
    const source = message.updateComponents;
    return {
      type: 'updateComponents',
      surfaceId: String(source.surfaceId || 'main'),
      components: Array.isArray(source.components)
        ? source.components.map(mapStandardComponent)
        : [],
    };
  }

  if (isObject(message.updateDataModel)) {
    const source = message.updateDataModel;
    return {
      version: A2UI_PROTOCOL_FAMILY,
      updateDataModel: {
        surfaceId: String(source.surfaceId || 'main'),
        path: typeof source.path === 'string' ? source.path : '/',
        value: source.value === undefined ? {} : source.value,
      },
    };
  }

  if (isObject(message.deleteSurface)) {
    return {
      type: 'deleteSurface',
      surfaceId: String(message.deleteSurface.surfaceId || 'main'),
    };
  }

  const error = new Error('Unsupported A2UI message envelope');
  error.code = 'A2UI_MESSAGE_UNSUPPORTED';
  throw error;
}

export function adaptStandardA2ui(payload) {
  return normalizeA2uiMessages(payload).map(convertMessage);
}

export function serializeRokidA2ui(payload) {
  return JSON.stringify(adaptStandardA2ui(payload));
}

function mimeMatches(value) {
  return String(value || '').split(';')[0].trim().toLowerCase() === A2UI_MIME_TYPE;
}

export function extractA2uiResource(toolResult) {
  const content = toolResult && Array.isArray(toolResult.content) ? toolResult.content : [];
  for (let index = 0; index < content.length; index += 1) {
    const item = content[index];
    const resource = item && item.type === 'resource' ? item.resource : null;
    if (!resource || !mimeMatches(resource.mimeType)) continue;
    const payload = resource.text !== undefined ? resource.text : resource.blob;
    if (payload === undefined || payload === null || payload === '') continue;
    return {
      uri: String(resource.uri || ''),
      mimeType: A2UI_MIME_TYPE,
      payload,
      annotations: item.annotations || null,
    };
  }
  return null;
}

export function extractToolText(toolResult) {
  const content = toolResult && Array.isArray(toolResult.content) ? toolResult.content : [];
  return content
    .filter((item) => item && item.type === 'text' && item.text)
    .map((item) => String(item.text))
    .join('\n')
    .trim();
}

export function adaptToolResultA2ui(toolResult) {
  const resource = extractA2uiResource(toolResult);
  if (!resource) return null;
  return {
    uri: resource.uri,
    mimeType: resource.mimeType,
    commands: serializeRokidA2ui(resource.payload),
    fallbackText: extractToolText(toolResult),
  };
}
