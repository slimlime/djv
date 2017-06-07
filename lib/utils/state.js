const { list: validators } = require('../validators');
const { body, restore, template } = require('./template');

/**
 * Configuration for template
 * @typedef {object} TemplateConfig
 * @property {boolean} inner - a generating object should be considered as inner
 */
function State(schema = {}, env) {
  this.push(schema);

  Object.assign(this, {
    current: [0],
    context: [],
    entries: new Map(),
    env,
  });
}

function generate(env, schema, state = new State(schema, env), options) {
  const tpl = template(state);
  tpl.visit(schema);

  const source = body(tpl, state, options);
  return restore(source, schema, options);
}

State.prototype = Object.assign(Object.create(Array.prototype), {
  addEntry(url, schema) {
    if (typeof schema !== 'object') {
      return schema;
    }

    const options = { inner: true };
    const entry = this.entries.get(schema) || generate(this.env, schema, this, options);
    this.entries.set(schema, entry);
    this.revealReference(url);

    return this.context.push(entry);
  },
  addReference(url, schema) {
    const schemaIndex = this.indexOf(schema);
    if (schemaIndex !== -1 && schemaIndex !== this.length - 1) {
      // has already been added to process queue
      return this.context.push(url);
    }
    return false;
  },
  revealReference(url) {
    for (
      let doubled = this.context.indexOf(url);
      doubled !== -1;
      doubled = this.context.indexOf(url)
    ) {
      this.context[doubled] = this.context.length;
    }
  },
  reference(url) {
    const initialStateLength = this.length;
    const schema = this.resolve(url);
    const entry = this.addReference(url, schema) || this.addEntry(url, schema);

    const hasStateChanged = initialStateLength !== this.length;
    if (hasStateChanged) {
      this.length = this.current.pop();
    }

    return entry;
  },
  resolve(reference) {
    if (reference === '#') {
      return 0;
    }

    if (typeof reference !== 'string') {
      return reference;
    }

    const referenceParts = reference.split(/#\/?/);
    const name = referenceParts[1];
    const components = name && name.split('/');

    let uri = referenceParts[0] || '#';
    let currentSchema;

    if (uri === '#') {
      currentSchema = this[this.current[this.current.length - 1]];
    } else {
      if (!Object.prototype.hasOwnProperty.call(this, uri)) {
        uri = this.slice(this.current[this.current.length - 1] + 1).map(schema => schema.id).join('') + uri;
      }

      currentSchema = this.env.resolved[uri].schema;
    }

    this.current.push(this.length);
    this.push(currentSchema);

    while (components && components.length > 0) {
      const currentPath = decodeURIComponent(components[0].replace(/~1/g, '/').replace(/~0/g, '~'));
      if (!Object.prototype.hasOwnProperty.call(currentSchema, currentPath)) {
        throw new Error('Schema not found');
      }

      currentSchema = currentSchema[currentPath];
      this.push(currentSchema);
      components.shift();
    }

    return currentSchema;
  },
  visit(schema, tpl) {
    const initialStateLength = this.length;

    this.push(schema);
    validators.forEach(validator => validator(schema, tpl));
    this.length = initialStateLength;
  },
});

module.exports = {
  State,
  generate,
};