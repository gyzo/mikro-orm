"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Utils = exports.ObjectBindingPattern = void 0;
exports.compareObjects = compareObjects;
exports.compareArrays = compareArrays;
exports.compareBooleans = compareBooleans;
exports.compareBuffers = compareBuffers;
exports.equals = equals;
exports.parseJsonSafe = parseJsonSafe;
const node_module_1 = require("node:module");
const globby_1 = __importDefault(require("globby"));
const node_path_1 = require("node:path");
const node_os_1 = require("node:os");
const node_url_1 = require("node:url");
const fs_extra_1 = require("fs-extra");
const node_crypto_1 = require("node:crypto");
const esprima_1 = require("esprima");
const clone_1 = require("./clone");
const enums_1 = require("../enums");
const wrap_1 = require("../entity/wrap");
exports.ObjectBindingPattern = Symbol('ObjectBindingPattern');
function compareConstructors(a, b) {
    if (a.constructor === b.constructor) {
        return true;
    }
    if (!a.constructor) {
        return b.constructor === Object;
    }
    if (!b.constructor) {
        return a.constructor === Object;
    }
    return false;
}
function isRawSql(value) {
    return typeof value === 'object' && !!value && '__raw' in value;
}
function compareObjects(a, b) {
    // eslint-disable-next-line eqeqeq
    if (a === b || (a == null && b == null)) {
        return true;
    }
    if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || !compareConstructors(a, b)) {
        return false;
    }
    if (isRawSql(a) && isRawSql(b)) {
        // eslint-disable-next-line @typescript-eslint/no-use-before-define
        return a.sql === b.sql && compareArrays(a.params, b.params);
    }
    if ((a instanceof Date && b instanceof Date)) {
        const timeA = a.getTime();
        const timeB = b.getTime();
        if (isNaN(timeA) || isNaN(timeB)) {
            throw new Error('Comparing invalid dates is not supported');
        }
        return timeA === timeB;
    }
    if ((typeof a === 'function' && typeof b === 'function') ||
        (typeof a === 'object' && a.client && ['Ref', 'Raw'].includes(a.constructor.name) && typeof b === 'object' && b.client && ['Ref', 'Raw'].includes(b.constructor.name)) || // knex qb
        (a instanceof RegExp && b instanceof RegExp) ||
        (a instanceof String && b instanceof String) ||
        (a instanceof Number && b instanceof Number)) {
        return a.toString() === b.toString();
    }
    const keys = Object.keys(a);
    const length = keys.length;
    if (length !== Object.keys(b).length) {
        return false;
    }
    for (let i = length; i-- !== 0;) {
        if (!Object.hasOwn(b, keys[i])) {
            return false;
        }
    }
    for (let i = length; i-- !== 0;) {
        const key = keys[i];
        // eslint-disable-next-line @typescript-eslint/no-use-before-define
        if (!equals(a[key], b[key])) {
            return false;
        }
    }
    return true;
}
function compareArrays(a, b) {
    const length = a.length;
    if (length !== b.length) {
        return false;
    }
    for (let i = length; i-- !== 0;) {
        // eslint-disable-next-line @typescript-eslint/no-use-before-define
        if (!equals(a[i], b[i])) {
            return false;
        }
    }
    return true;
}
function compareBooleans(a, b) {
    a = typeof a === 'number' ? Boolean(a) : a;
    b = typeof b === 'number' ? Boolean(b) : b;
    return a === b;
}
function compareBuffers(a, b) {
    const length = a.length;
    if (length !== b.length) {
        return false;
    }
    for (let i = length; i-- !== 0;) {
        if (a[i] !== b[i]) {
            return false;
        }
    }
    return true;
}
/**
 * Checks if arguments are deeply (but not strictly) equal.
 */
function equals(a, b) {
    if (a === b) {
        return true;
    }
    if (a && b && typeof a === 'object' && typeof b === 'object') {
        if (Array.isArray(a)) {
            return compareArrays(a, b);
        }
        if (ArrayBuffer.isView(a) && ArrayBuffer.isView(b)) {
            return compareBuffers(a, b);
        }
        return compareObjects(a, b);
    }
    return Number.isNaN(a) && Number.isNaN(b);
}
const equalsFn = equals;
function parseJsonSafe(value) {
    if (typeof value === 'string') {
        try {
            return JSON.parse(value);
        }
        catch {
            // ignore and return the value, as sometimes we get the parsed value,
            // e.g. when it is a string value in JSON column
        }
    }
    return value;
}
class Utils {
    static PK_SEPARATOR = '~~~';
    /* istanbul ignore next */
    static dynamicImportProvider = (id) => import(id);
    /**
     * Checks if the argument is not undefined
     */
    static isDefined(data) {
        return typeof data !== 'undefined';
    }
    /**
     * Checks if the argument is instance of `Object`. Returns false for arrays.
     */
    static isObject(o) {
        return !!o && typeof o === 'object' && !Array.isArray(o);
    }
    /**
     * Relation decorators allow using two signatures
     * - using first parameter as options object
     * - using all parameters
     *
     * This function validates those two ways are not mixed and returns the final options object.
     * If the second way is used, we always consider the last parameter as options object.
     * @internal
     */
    static processDecoratorParameters(params) {
        const keys = Object.keys(params);
        const values = Object.values(params);
        if (!Utils.isPlainObject(values[0])) {
            const lastKey = keys[keys.length - 1];
            const last = params[lastKey];
            delete params[lastKey];
            return { ...last, ...params };
        }
        // validate only first parameter is used if its an option object
        const empty = (v) => v == null || (Utils.isPlainObject(v) && !Utils.hasObjectKeys(v));
        if (values.slice(1).some(v => !empty(v))) {
            throw new Error('Mixing first decorator parameter as options object with other parameters is forbidden. ' +
                'If you want to use the options parameter at first position, provide all options inside it.');
        }
        return values[0];
    }
    /**
     * Checks if the argument is instance of `Object`, but not one of the blacklisted types. Returns false for arrays.
     */
    static isNotObject(o, not) {
        return this.isObject(o) && !not.some(cls => o instanceof cls);
    }
    /**
     * Removes `undefined` properties (recursively) so they are not saved as nulls
     */
    static dropUndefinedProperties(o, value, visited = new Set()) {
        if (Array.isArray(o)) {
            for (const item of o) {
                Utils.dropUndefinedProperties(item, value, visited);
            }
            return;
        }
        if (!Utils.isPlainObject(o) || visited.has(o)) {
            return;
        }
        visited.add(o);
        for (const key of Object.keys(o)) {
            if (o[key] === value) {
                delete o[key];
                continue;
            }
            Utils.dropUndefinedProperties(o[key], value, visited);
        }
    }
    /**
     * Returns the number of properties on `obj`. This is 20x faster than Object.keys(obj).length.
     * @see https://github.com/deepkit/deepkit-framework/blob/master/packages/core/src/core.ts
     */
    static getObjectKeysSize(object) {
        let size = 0;
        for (const key in object) {
            /* istanbul ignore else */
            if (Object.hasOwn(object, key)) {
                size++;
            }
        }
        return size;
    }
    /**
     * Returns true if `obj` has at least one property. This is 20x faster than Object.keys(obj).length.
     * @see https://github.com/deepkit/deepkit-framework/blob/master/packages/core/src/core.ts
     */
    static hasObjectKeys(object) {
        for (const key in object) {
            /* istanbul ignore else */
            if (Object.hasOwn(object, key)) {
                return true;
            }
        }
        return false;
    }
    /**
     * Checks if the argument is string
     */
    static isString(s) {
        return typeof s === 'string';
    }
    /**
     * Checks if the argument is number
     */
    static isNumber(s) {
        return typeof s === 'number';
    }
    /**
     * Checks if arguments are deeply (but not strictly) equal.
     */
    static equals(a, b) {
        return equalsFn(a, b);
    }
    /**
     * Gets array without duplicates.
     */
    static unique(items) {
        if (items.length < 2) {
            return items;
        }
        return [...new Set(items)];
    }
    /**
     * Merges all sources into the target recursively.
     */
    static merge(target, ...sources) {
        return Utils._merge(target, sources, false);
    }
    /**
     * Merges all sources into the target recursively. Ignores `undefined` values.
     */
    static mergeConfig(target, ...sources) {
        return Utils._merge(target, sources, true);
    }
    /**
     * Merges all sources into the target recursively.
     */
    static _merge(target, sources, ignoreUndefined) {
        if (!sources.length) {
            return target;
        }
        const source = sources.shift();
        if (Utils.isObject(target) && Utils.isPlainObject(source)) {
            for (const [key, value] of Object.entries(source)) {
                if (ignoreUndefined && typeof value === 'undefined') {
                    continue;
                }
                if (Utils.isPlainObject(value)) {
                    if (!Utils.isObject(target[key])) {
                        target[key] = Utils.copy(value);
                        continue;
                    }
                    /* istanbul ignore next */
                    if (!(key in target)) {
                        Object.assign(target, { [key]: {} });
                    }
                    Utils._merge(target[key], [value], ignoreUndefined);
                }
                else {
                    Object.assign(target, { [key]: value });
                }
            }
        }
        return Utils._merge(target, sources, ignoreUndefined);
    }
    static getRootEntity(metadata, meta) {
        const base = meta.extends && metadata.find(Utils.className(meta.extends));
        if (!base || base === meta) { // make sure we do not fall into infinite loop
            return meta;
        }
        const root = Utils.getRootEntity(metadata, base);
        if (root.discriminatorColumn) {
            return root;
        }
        return meta;
    }
    /**
     * Computes difference between two objects, ignoring items missing in `b`.
     */
    static diff(a, b) {
        const ret = {};
        for (const k of Object.keys(b)) {
            if (Utils.equals(a[k], b[k])) {
                continue;
            }
            ret[k] = b[k];
        }
        return ret;
    }
    /**
     * Creates deep copy of given object.
     */
    static copy(entity, respectCustomCloneMethod = true) {
        return (0, clone_1.clone)(entity, respectCustomCloneMethod);
    }
    /**
     * Normalize the argument to always be an array.
     */
    static asArray(data, strict = false) {
        if (typeof data === 'undefined' && !strict) {
            return [];
        }
        if (this.isIterable(data)) {
            return Array.from(data);
        }
        return [data];
    }
    /**
     * Checks if the value is iterable, but considers strings and buffers as not iterable.
     */
    static isIterable(value) {
        if (value == null || typeof value === 'string' || ArrayBuffer.isView(value)) {
            return false;
        }
        return typeof Object(value)[Symbol.iterator] === 'function';
    }
    /**
     * Renames object key, keeps order of properties.
     */
    static renameKey(payload, from, to) {
        if (Utils.isObject(payload) && from in payload && !(to in payload)) {
            for (const key of Object.keys(payload)) {
                const value = payload[key];
                delete payload[key];
                payload[from === key ? to : key] = value;
            }
        }
    }
    /**
     * Returns array of functions argument names. Uses `esprima` for source code analysis.
     */
    static tokenize(func) {
        if (Array.isArray(func)) {
            return func;
        }
        try {
            return (0, esprima_1.tokenize)(func.toString(), { tolerant: true });
        }
        catch {
            /* istanbul ignore next */
            return [];
        }
    }
    /**
     * Returns array of functions argument names. Uses `esprima` for source code analysis.
     */
    static getParamNames(func, methodName) {
        const ret = [];
        const tokens = this.tokenize(func);
        let inside = 0;
        let currentBlockStart = 0;
        for (let i = 0; i < tokens.length; i++) {
            const token = tokens[i];
            if (token.type === 'Identifier' && token.value === methodName) {
                inside = 1;
                currentBlockStart = i;
                continue;
            }
            if (inside === 1 && token.type === 'Punctuator' && token.value === '(') {
                inside = 2;
                currentBlockStart = i;
                continue;
            }
            if (inside === 2 && token.type === 'Punctuator' && token.value === ')') {
                break;
            }
            if (inside === 2 && token.type === 'Punctuator' && token.value === '{' && i === currentBlockStart + 1) {
                ret.push(exports.ObjectBindingPattern);
                i = tokens.findIndex((t, idx) => idx > i + 2 && t.type === 'Punctuator' && t.value === '}');
                continue;
            }
            if (inside === 2 && token.type === 'Identifier') {
                ret.push(token.value);
            }
        }
        return ret;
    }
    /**
     * Checks whether the argument looks like primary key (string, number or ObjectId).
     */
    static isPrimaryKey(key, allowComposite = false) {
        if (['string', 'number', 'bigint'].includes(typeof key)) {
            return true;
        }
        if (allowComposite && Array.isArray(key) && key.every(v => Utils.isPrimaryKey(v, true))) {
            return true;
        }
        if (Utils.isObject(key)) {
            if (key.constructor && key.constructor.name.toLowerCase() === 'objectid') {
                return true;
            }
            if (!Utils.isPlainObject(key) && !Utils.isEntity(key, true)) {
                return true;
            }
        }
        return false;
    }
    /**
     * Extracts primary key from `data`. Accepts objects or primary keys directly.
     */
    static extractPK(data, meta, strict = false) {
        if (Utils.isPrimaryKey(data)) {
            return data;
        }
        if (Utils.isEntity(data, true)) {
            return (0, wrap_1.helper)(data).getPrimaryKey();
        }
        if (strict && meta && Utils.getObjectKeysSize(data) !== meta.primaryKeys.length) {
            return null;
        }
        if (Utils.isPlainObject(data) && meta) {
            if (meta.compositePK) {
                return this.getCompositeKeyValue(data, meta);
            }
            return data[meta.primaryKeys[0]] || data[meta.serializedPrimaryKey] || null;
        }
        return null;
    }
    static getCompositeKeyValue(data, meta, convertCustomTypes = false, platform) {
        return meta.primaryKeys.map((pk, idx) => {
            const value = Array.isArray(data) ? data[idx] : data[pk];
            const prop = meta.properties[pk];
            if (prop.targetMeta && Utils.isPlainObject(value)) {
                return this.getCompositeKeyValue(value, prop.targetMeta);
            }
            if (prop.customType && platform && convertCustomTypes) {
                const method = typeof convertCustomTypes === 'string' ? convertCustomTypes : 'convertToJSValue';
                return prop.customType[method](value, platform);
            }
            return value;
        });
    }
    static getCompositeKeyHash(data, meta, convertCustomTypes = false, platform, flat = false) {
        let pks = this.getCompositeKeyValue(data, meta, convertCustomTypes, platform);
        if (flat) {
            pks = Utils.flatten(pks);
        }
        return Utils.getPrimaryKeyHash(pks);
    }
    static getPrimaryKeyHash(pks) {
        return pks.map(pk => {
            if (Buffer.isBuffer(pk)) {
                return pk.toString('hex');
            }
            if (pk instanceof Date) {
                return pk.toISOString();
            }
            return pk;
        }).join(this.PK_SEPARATOR);
    }
    static splitPrimaryKeys(key) {
        return key.split(this.PK_SEPARATOR);
    }
    static getPrimaryKeyValues(entity, primaryKeys, allowScalar = false, convertCustomTypes = false) {
        /* istanbul ignore next */
        if (entity == null) {
            return entity;
        }
        function toArray(val) {
            if (Utils.isPlainObject(val)) {
                return Object.values(val).flatMap(v => toArray(v));
            }
            return val;
        }
        const pk = Utils.isEntity(entity, true)
            ? (0, wrap_1.helper)(entity).getPrimaryKey(convertCustomTypes)
            : primaryKeys.reduce((o, pk) => { o[pk] = entity[pk]; return o; }, {});
        if (primaryKeys.length > 1) {
            return toArray(pk);
        }
        if (allowScalar) {
            if (Utils.isPlainObject(pk)) {
                return pk[primaryKeys[0]];
            }
            return pk;
        }
        return [pk];
    }
    static getPrimaryKeyCond(entity, primaryKeys) {
        const cond = primaryKeys.reduce((o, pk) => {
            o[pk] = Utils.extractPK(entity[pk]);
            return o;
        }, {});
        if (Object.values(cond).some(v => v === null)) {
            return null;
        }
        return cond;
    }
    /**
     * Maps nested FKs from `[1, 2, 3]` to `[1, [2, 3]]`.
     */
    static mapFlatCompositePrimaryKey(fk, prop, fieldNames = prop.fieldNames, idx = 0) {
        if (!prop.targetMeta) {
            return fk[idx++];
        }
        const parts = [];
        for (const pk of prop.targetMeta.getPrimaryProps()) {
            parts.push(this.mapFlatCompositePrimaryKey(fk, pk, fieldNames, idx));
            idx += pk.fieldNames.length;
        }
        if (parts.length < 2) {
            return parts[0];
        }
        return parts;
    }
    static getPrimaryKeyCondFromArray(pks, meta) {
        return meta.getPrimaryProps().reduce((o, pk, idx) => {
            if (Array.isArray(pks[idx]) && pk.targetMeta) {
                o[pk.name] = pks[idx];
            }
            else {
                o[pk.name] = Utils.extractPK(pks[idx], meta);
            }
            return o;
        }, {});
    }
    static getOrderedPrimaryKeys(id, meta, platform, convertCustomTypes = false) {
        const data = (Utils.isPrimaryKey(id) ? { [meta.primaryKeys[0]]: id } : id);
        const pks = meta.primaryKeys.map((pk, idx) => {
            const prop = meta.properties[pk];
            // `data` can be a composite PK in form of array of PKs, or a DTO
            let value = Array.isArray(data) ? data[idx] : (data[pk] ?? data);
            if (convertCustomTypes && platform && prop.customType && !prop.targetMeta) {
                value = prop.customType.convertToJSValue(value, platform);
            }
            if (prop.kind !== enums_1.ReferenceKind.SCALAR && prop.targetMeta) {
                const value2 = this.getOrderedPrimaryKeys(value, prop.targetMeta, platform, convertCustomTypes);
                value = value2.length > 1 ? value2 : value2[0];
            }
            return value;
        });
        // we need to flatten the PKs as composite PKs can be build from another composite PKs
        // and this method is used to get the PK hash in identity map, that expects flat array
        return Utils.flatten(pks);
    }
    /**
     * Checks whether given object is an entity instance.
     */
    static isEntity(data, allowReference = false) {
        if (!Utils.isObject(data)) {
            return false;
        }
        if (allowReference && !!data.__reference) {
            return true;
        }
        return !!data.__entity;
    }
    /**
     * Checks whether given object is a scalar reference.
     */
    static isScalarReference(data, allowReference = false) {
        return typeof data === 'object' && data?.__scalarReference;
    }
    /**
     * Checks whether the argument is ObjectId instance
     */
    static isObjectID(key) {
        return Utils.isObject(key) && key.constructor && key.constructor.name.toLowerCase() === 'objectid';
    }
    /**
     * Checks whether the argument is empty (array without items, object without keys or falsy value).
     */
    static isEmpty(data) {
        if (Array.isArray(data)) {
            return data.length === 0;
        }
        if (Utils.isObject(data)) {
            return !Utils.hasObjectKeys(data);
        }
        return !data;
    }
    /**
     * Gets string name of given class.
     */
    static className(classOrName) {
        if (typeof classOrName === 'string') {
            return classOrName;
        }
        return classOrName.name;
    }
    static extractChildElements(items, prefix, allSymbol) {
        return items
            .filter(field => field === allSymbol || field.startsWith(`${prefix}.`))
            .map(field => field === allSymbol ? allSymbol : field.substring(prefix.length + 1));
    }
    /**
     * Tries to detect `ts-node` runtime.
     */
    static detectTsNode() {
        /* istanbul ignore next */
        return process.argv[0].endsWith('ts-node') // running via ts-node directly
            // @ts-ignore
            || !!process[Symbol.for('ts-node.register.instance')] // check if internal ts-node symbol exists
            || !!process.env.TS_JEST // check if ts-jest is used (works only with v27.0.4+)
            || !!process.env.VITEST // check if vitest is used
            || !!process.versions.bun // check if bun is used
            || process.argv.slice(1).some(arg => arg.includes('ts-node')) // registering ts-node runner
            || process.execArgv.some(arg => arg === 'ts-node/esm') // check for ts-node/esm module loader
            || (require.extensions && !!require.extensions['.ts']); // check if the extension is registered
    }
    /**
     * Uses some dark magic to get source path to caller where decorator is used.
     * Analyses stack trace of error created inside the function call.
     */
    static lookupPathFromDecorator(name, stack) {
        // use some dark magic to get source path to caller
        stack = stack || new Error().stack.split('\n');
        // In some situations (e.g. swc 1.3.4+), the presence of a source map can obscure the call to
        // __decorate(), replacing it with the constructor name. To support these cases we look for
        // Reflect.decorate() as well. Also when babel is used, we need to check
        // the `_applyDecoratedDescriptor` method instead.
        let line = stack.findIndex(line => line.match(/__decorate|Reflect\.decorate|_applyDecoratedDescriptor/));
        // bun does not have those lines at all, only the DecorateProperty/DecorateConstructor,
        // but those are also present in node, so we need to check this only if they weren't found.
        if (line === -1) {
            // here we handle bun which stack is different from nodejs so we search for reflect-metadata
            const reflectLine = stack.findIndex(line => Utils.normalizePath(line).includes('node_modules/reflect-metadata/Reflect.js'));
            if (reflectLine === -1 || reflectLine + 2 >= stack.length || !stack[reflectLine + 1].includes('bun:wrap')) {
                return name;
            }
            line = reflectLine + 2;
        }
        if (stack[line].includes('Reflect.decorate')) {
            line++;
        }
        if (Utils.normalizePath(stack[line]).includes('node_modules/tslib/tslib')) {
            line++;
        }
        try {
            const re = stack[line].match(/\(.+\)/i) ? /\((.*):\d+:\d+\)/ : /at\s*(.*):\d+:\d+$/;
            return Utils.normalizePath(stack[line].match(re)[1]);
        }
        catch {
            return name;
        }
    }
    /**
     * Gets the type of the argument.
     */
    static getObjectType(value) {
        const simple = typeof value;
        if (['string', 'number', 'boolean', 'bigint'].includes(simple)) {
            return simple;
        }
        const objectType = Object.prototype.toString.call(value);
        const type = objectType.match(/\[object (\w+)]/)[1];
        if (type === 'Uint8Array') {
            return 'Buffer';
        }
        return ['Date', 'Buffer', 'RegExp'].includes(type) ? type : type.toLowerCase();
    }
    /**
     * Checks whether the value is POJO (e.g. `{ foo: 'bar' }`, and not instance of `Foo`)
     */
    static isPlainObject(value) {
        return (value !== null
            && typeof value === 'object'
            && typeof value.constructor === 'function'
            && (Object.hasOwn(value.constructor.prototype, 'isPrototypeOf') || Object.getPrototypeOf(value.constructor.prototype) === null))
            || (value && Object.getPrototypeOf(value) === null)
            || value instanceof enums_1.PlainObject;
    }
    /**
     * Executes the `cb` promise serially on every element of the `items` array and returns array of resolved values.
     */
    static async runSerial(items, cb) {
        const ret = [];
        for (const item of items) {
            ret.push(await cb(item));
        }
        return ret;
    }
    static isCollection(item) {
        return item?.__collection;
    }
    static fileURLToPath(url) {
        // expose `fileURLToPath` on Utils so that it can be properly mocked in tests
        return (0, node_url_1.fileURLToPath)(url);
    }
    /**
     * Resolves and normalizes a series of path parts relative to each preceding part.
     * If any part is a `file:` URL, it is converted to a local path. If any part is an
     * absolute path, it replaces preceding paths (similar to `path.resolve` in NodeJS).
     * Trailing directory separators are removed, and all directory separators are converted
     * to POSIX-style separators (`/`).
     */
    static normalizePath(...parts) {
        let start = 0;
        for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            if ((0, node_path_1.isAbsolute)(part)) {
                start = i;
            }
            else if (part.startsWith('file:')) {
                start = i;
                parts[i] = Utils.fileURLToPath(part);
            }
        }
        if (start > 0) {
            parts = parts.slice(start);
        }
        let path = parts.join('/').replace(/\\/g, '/').replace(/\/$/, '');
        path = (0, node_path_1.normalize)(path).replace(/\\/g, '/');
        return (path.match(/^[/.]|[a-zA-Z]:/) || path.startsWith('!')) ? path : './' + path;
    }
    /**
     * Determines the relative path between two paths. If either path is a `file:` URL,
     * it is converted to a local path.
     */
    static relativePath(path, relativeTo) {
        if (!path) {
            return path;
        }
        path = Utils.normalizePath(path);
        if (path.startsWith('.')) {
            return path;
        }
        path = (0, node_path_1.relative)(Utils.normalizePath(relativeTo), path);
        return Utils.normalizePath(path);
    }
    /**
     * Computes the absolute path to for the given path relative to the provided base directory.
     * If either `path` or `baseDir` are `file:` URLs, they are converted to local paths.
     */
    static absolutePath(path, baseDir = process.cwd()) {
        if (!path) {
            return Utils.normalizePath(baseDir);
        }
        if (!(0, node_path_1.isAbsolute)(path) && !path.startsWith('file://')) {
            path = baseDir + '/' + path;
        }
        return Utils.normalizePath(path);
    }
    static hash(data, length) {
        const hash = (0, node_crypto_1.createHash)('md5').update(data).digest('hex');
        if (length) {
            return hash.substring(0, length);
        }
        return hash;
    }
    static runIfNotEmpty(clause, data) {
        if (!Utils.isEmpty(data)) {
            clause();
        }
    }
    static defaultValue(prop, option, defaultValue) {
        prop[option] = option in prop ? prop[option] : defaultValue;
    }
    static findDuplicates(items) {
        return items.reduce((acc, v, i, arr) => {
            return arr.indexOf(v) !== i && acc.indexOf(v) === -1 ? acc.concat(v) : acc;
        }, []);
    }
    static removeDuplicates(items) {
        const ret = [];
        const contains = (arr, val) => !!arr.find(v => equals(val, v));
        for (const item of items) {
            if (!contains(ret, item)) {
                ret.push(item);
            }
        }
        return ret;
    }
    static randomInt(min, max) {
        return Math.round(Math.random() * (max - min)) + min;
    }
    static async pathExists(path, options = {}) {
        if (globby_1.default.hasMagic(path)) {
            const found = await (0, globby_1.default)(path, options);
            return found.length > 0;
        }
        return (0, fs_extra_1.pathExistsSync)(path);
    }
    /**
     * Extracts all possible values of a TS enum. Works with both string and numeric enums.
     */
    static extractEnumValues(target) {
        const keys = Object.keys(target);
        const values = Object.values(target);
        const numeric = !!values.find(v => typeof v === 'number');
        const constEnum = values.length % 2 === 0 // const enum will have even number of items
            && values.slice(0, values.length / 2).every(v => typeof v === 'string') // first half are strings
            && values.slice(values.length / 2).every(v => typeof v === 'number') // second half are numbers
            && this.equals(keys, values.slice(values.length / 2).concat(values.slice(0, values.length / 2)).map(v => '' + v)); // and when swapped, it will match the keys
        if (numeric || constEnum) {
            return values.filter(val => !keys.includes(val));
        }
        return values;
    }
    static flatten(arrays) {
        return [].concat.apply([], arrays);
    }
    static isOperator(key, includeGroupOperators = true) {
        if (!includeGroupOperators) {
            return key in enums_1.QueryOperator;
        }
        return key in enums_1.GroupOperator || key in enums_1.QueryOperator;
    }
    static isGroupOperator(key) {
        return key in enums_1.GroupOperator;
    }
    static isArrayOperator(key) {
        return enums_1.ARRAY_OPERATORS.includes(key);
    }
    static isJsonKeyOperator(key) {
        return enums_1.JSON_KEY_OPERATORS.includes(key);
    }
    static hasNestedKey(object, key) {
        if (!object) {
            return false;
        }
        if (Array.isArray(object)) {
            return object.some(o => this.hasNestedKey(o, key));
        }
        if (typeof object === 'object') {
            return Object.entries(object).some(([k, v]) => k === key || this.hasNestedKey(v, key));
        }
        return false;
    }
    static getGlobalStorage(namespace) {
        const key = `mikro-orm-${namespace}`;
        globalThis[key] = globalThis[key] || {};
        return globalThis[key];
    }
    /**
     * Require a module from a specific location
     * @param id The module to require
     * @param [from] Location to start the node resolution
     */
    static requireFrom(id, from = process.cwd()) {
        if (!(0, node_path_1.extname)(from)) {
            from = (0, node_path_1.join)(from, '__fake.js');
        }
        return (0, node_module_1.createRequire)((0, node_path_1.resolve)(from))(id);
    }
    static async dynamicImport(id) {
        /* istanbul ignore next */
        if ((0, node_os_1.platform)() === 'win32') {
            try {
                id = (0, node_url_1.pathToFileURL)(id).toString();
            }
            catch {
                // ignore
            }
            // If the extension is not registered, we need to fall back to a file path.
            if (require.extensions && !require.extensions[(0, node_path_1.extname)(id)]) {
                id = (0, node_url_1.fileURLToPath)(id);
            }
        }
        /* istanbul ignore next */
        return this.dynamicImportProvider(id);
    }
    /* istanbul ignore next */
    static setDynamicImportProvider(provider) {
        this.dynamicImportProvider = provider;
    }
    static getORMVersion() {
        /* istanbul ignore next */
        try {
            // this works with ts-node during development (where we have `src` folder)
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            return require('../../package.json').version;
        }
        catch {
            // this works with node in production build (where we do not have the `src` folder)
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            return require('../package.json').version;
        }
    }
    /* istanbul ignore next */
    static createFunction(context, code) {
        try {
            return new Function(...context.keys(), `'use strict';\n` + code)(...context.values());
        }
        catch (e) {
            // eslint-disable-next-line no-console
            console.error(code);
            throw e;
        }
    }
    /* istanbul ignore next */
    static callCompiledFunction(fn, ...args) {
        try {
            return fn(...args);
        }
        catch (e) {
            if ([SyntaxError, TypeError, EvalError, ReferenceError].some(t => e instanceof t)) {
                const position = e.stack.match(/<anonymous>:(\d+):(\d+)/);
                let code = fn.toString();
                if (position) {
                    const lines = code.split('\n').map((line, idx) => {
                        if (idx === +position[1] - 5) {
                            return '> ' + line;
                        }
                        return '  ' + line;
                    });
                    lines.splice(+position[1] - 4, 0, ' '.repeat(+position[2]) + '^');
                    code = lines.join('\n');
                }
                // eslint-disable-next-line no-console
                console.error(`JIT runtime error: ${e.message}\n\n${code}`);
            }
            throw e;
        }
    }
    /**
     * @see https://github.com/mikro-orm/mikro-orm/issues/840
     */
    static propertyDecoratorReturnValue() {
        if (process.env.BABEL_DECORATORS_COMPAT) {
            return {};
        }
    }
    static unwrapProperty(entity, meta, prop, payload = false) {
        let p = prop;
        const path = [];
        if (!prop.object && !prop.array && !prop.embedded) {
            return entity[prop.name] != null ? [[entity[prop.name], []]] : [];
        }
        while (p.embedded) {
            const child = meta.properties[p.embedded[0]];
            if (payload && !child.object && !child.array) {
                break;
            }
            path.shift();
            path.unshift(p.embedded[0], p.embedded[1]);
            p = child;
        }
        const ret = [];
        const follow = (t, idx = 0, i = []) => {
            const k = path[idx];
            if (Array.isArray(t)) {
                for (const t1 of t) {
                    const ii = t.indexOf(t1);
                    follow(t1, idx, [...i, ii]);
                }
                return;
            }
            if (t == null) {
                return;
            }
            const target = t[k];
            if (path[++idx]) {
                follow(target, idx, i);
            }
            else if (target != null) {
                ret.push([target, i]);
            }
        };
        follow(entity);
        return ret;
    }
    static setPayloadProperty(entity, meta, prop, value, idx) {
        if (!prop.object && !prop.array && !prop.embedded) {
            entity[prop.name] = value;
            return;
        }
        let target = entity;
        let p = prop;
        const path = [];
        while (p.embedded) {
            path.shift();
            path.unshift(p.embedded[0], p.embedded[1]);
            const prev = p;
            p = meta.properties[p.embedded[0]];
            if (!p.object) {
                path.shift();
                path[0] = prev.name;
                break;
            }
        }
        let j = 0;
        for (const k of path) {
            const i = path.indexOf(k);
            if (i === path.length - 1) {
                if (Array.isArray(target)) {
                    target[idx[j++]][k] = value;
                }
                else {
                    target[k] = value;
                }
            }
            else {
                if (Array.isArray(target)) {
                    target = target[idx[j++]][k];
                }
                else {
                    target = target[k];
                }
            }
        }
    }
    static tryRequire({ module, from, allowError, warning }) {
        allowError ??= `Cannot find module '${module}'`;
        from ??= process.cwd();
        try {
            return Utils.requireFrom(module, from);
        }
        catch (err) {
            if (err.message.includes(allowError)) {
                // eslint-disable-next-line no-console
                console.warn(warning);
                return undefined;
            }
            throw err;
        }
    }
    static stripRelativePath(str) {
        return str.replace(/^(?:\.\.\/|\.\/)+/, '/');
    }
    /**
     * simple process.argv parser, supports only properties with long names, prefixed with `--`
     */
    static parseArgs() {
        let lastKey;
        return process.argv.slice(2).reduce((args, arg) => {
            if (arg.includes('=')) {
                const [key, value] = arg.split('=');
                args[key.substring(2)] = value;
            }
            else if (lastKey) {
                args[lastKey] = arg;
                lastKey = undefined;
            }
            else if (arg.startsWith('--')) {
                lastKey = arg.substring(2);
            }
            return args;
        }, {});
    }
    static xor(a, b) {
        return (a || b) && !(a && b);
    }
    static keys(obj) {
        return Object.keys(obj);
    }
    static values(obj) {
        return Object.values(obj);
    }
    static entries(obj) {
        return Object.entries(obj);
    }
    static isRawSql(value) {
        return isRawSql(value);
    }
    static primaryKeyToObject(meta, primaryKey, visible) {
        const pks = meta.compositePK && Utils.isPlainObject(primaryKey) ? Object.values(primaryKey) : Utils.asArray(primaryKey);
        const pkProps = meta.getPrimaryProps();
        return meta.primaryKeys.reduce((o, pk, idx) => {
            const pkProp = pkProps[idx];
            if (visible && !visible.includes(pkProp.name)) {
                return o;
            }
            if (Utils.isPlainObject(pks[idx]) && pkProp.targetMeta) {
                o[pk] = Utils.getOrderedPrimaryKeys(pks[idx], pkProp.targetMeta);
                return o;
            }
            o[pk] = pks[idx];
            return o;
        }, {});
    }
}
exports.Utils = Utils;
