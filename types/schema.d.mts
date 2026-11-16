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
export type SchemaNode = {
    type: 'object' | 'map' | 'array' | 'string' | 'boolean' | 'integer' | 'any';
    /**
     * Known keys of an `object`.
     */
    props?: Record<string, SchemaNode>;
    /**
     * Value schema of a `map` (arbitrary keys) or `array` items.
     */
    values?: SchemaNode;
    /**
     * Allowed values.
     */
    enum?: readonly unknown[];
    /**
     * Pattern for strings.
     */
    pattern?: RegExp;
    /**
     * Minimum for integers and minimum length for arrays.
     */
    min?: number;
    /**
     * Whether `null` is accepted.
     */
    nullable?: boolean;
    /**
     * Extra check returning an error message.
     */
    check?: (value: any) => string | undefined;
    /**
     * Appended to type errors.
     */
    hint?: string;
};
/**
 * Spelling hint (` (did you mean "x"?)`) for the closest candidate, or an empty string.
 * @param {string} key
 * @param {readonly string[]} candidates
 */
export declare function suggest(key: string, candidates: readonly string[]): string;
/**
 * Validates `value` against `node`, appending one message per problem to `errors`.
 * @param {SchemaNode} node
 * @param {unknown} value
 * @param {string} path
 * @param {string[]} errors
 */
export declare function validate(node: SchemaNode, value: unknown, path: string, errors: string[]): number | undefined;
