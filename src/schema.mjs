/**
 * Minimal declarative validator for plain configuration data. It exists so that a typo such as
 * `secruity` fails loudly instead of being silently ignored, without a runtime dependency.
 *
 * @typedef {object} SchemaNode
 * @property {'object'|'map'|'array'|'string'|'boolean'|'integer'|'any'} type
 * @property {Record<string, SchemaNode>} [props] Known keys of an `object`.
 * @property {SchemaNode} [values] Value schema of a `map` (arbitrary keys) or `array` items.
 * @property {readonly unknown[]} [enum] Allowed values.
 * @property {RegExp} [pattern] Pattern for strings.
 * @property {number} [min] Minimum for integers and minimum length for arrays.
 * @property {boolean} [nullable] Whether `null` is accepted.
 * @property {(value: any) => string | undefined} [check] Extra check returning an error message.
 * @property {string} [hint] Appended to type errors.
 */

/** @param {string} a @param {string} b */
function distance(a, b) {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let previous = row[0] ?? 0;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const current = row[j] ?? 0;
      row[j] = Math.min(
        current + 1,
        (row[j - 1] ?? 0) + 1,
        previous + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      previous = current;
    }
  }
  return row[b.length] ?? 0;
}

/**
 * Spelling hint (` (did you mean "x"?)`) for the closest candidate, or an empty string.
 * @param {string} key
 * @param {readonly string[]} candidates
 */
export function suggest(key, candidates) {
  let best = '';
  let score = Number.POSITIVE_INFINITY;
  for (const candidate of candidates) {
    const d = distance(key.toLowerCase(), candidate.toLowerCase());
    if (d < score) [best, score] = [candidate, d];
  }
  return score <= Math.max(2, Math.floor(key.length / 3)) ? ` (did you mean "${best}"?)` : '';
}

/** @param {unknown} value */
const describe = (value) =>
  value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;

/**
 * Validates `value` against `node`, appending one message per problem to `errors`.
 * @param {SchemaNode} node
 * @param {unknown} value
 * @param {string} path
 * @param {string[]} errors
 */
export function validate(node, value, path, errors) {
  const at = path || '(root)';
  if (value === undefined) return;
  if (value === null) {
    if (!node.nullable && node.type !== 'any') errors.push(`${at}: must not be null`);
    return;
  }
  /** @param {string} expected */
  const typeError = (expected) =>
    errors.push(
      `${at}: expected ${expected}, got ${describe(value)}${node.hint ? `. ${node.hint}` : ''}`,
    );
  switch (node.type) {
    case 'any':
      break;
    case 'string':
      if (typeof value !== 'string') return typeError('string');
      if (node.pattern && !node.pattern.test(value))
        errors.push(
          `${at}: invalid value ${JSON.stringify(value)}${node.hint ? `. ${node.hint}` : ''}`,
        );
      break;
    case 'boolean':
      if (typeof value !== 'boolean') return typeError('boolean');
      break;
    case 'integer':
      if (!Number.isInteger(value)) return typeError('integer');
      if (node.min !== undefined && /** @type {number} */ (value) < node.min)
        errors.push(`${at}: must be >= ${node.min}`);
      break;
    case 'array':
      if (!Array.isArray(value)) return typeError('array');
      if (node.min !== undefined && value.length < node.min)
        errors.push(`${at}: needs at least ${node.min} item(s)`);
      if (node.values)
        for (const [i, item] of value.entries())
          validate(node.values, item, `${path}[${i}]`, errors);
      break;
    case 'map':
    case 'object': {
      if (typeof value !== 'object' || Array.isArray(value)) return typeError('object');
      const record = /** @type {Record<string, unknown>} */ (value);
      for (const [key, child] of Object.entries(record)) {
        const childPath = path ? `${path}.${key}` : key;
        const childNode = node.type === 'object' ? node.props?.[key] : node.values;
        if (!childNode) {
          errors.push(`${childPath}: unknown key${suggest(key, Object.keys(node.props ?? {}))}`);
          continue;
        }
        validate(childNode, child, childPath, errors);
      }
      break;
    }
  }
  if (node.enum && !node.enum.includes(value)) {
    errors.push(
      `${at}: must be one of ${node.enum.map((v) => JSON.stringify(v)).join(', ')}${typeof value === 'string' ? suggest(value, node.enum.map(String)) : ''}`,
    );
    return;
  }
  const extra = node.check?.(value);
  if (extra) errors.push(`${at}: ${extra}`);
}
