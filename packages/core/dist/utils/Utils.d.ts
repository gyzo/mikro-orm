import { type GlobbyOptions } from 'globby';
import type { Dictionary, EntityData, EntityDictionary, EntityKey, EntityMetadata, EntityName, EntityProperty, IMetadataStorage, Primary } from '../typings';
import type { Collection } from '../entity/Collection';
import type { Platform } from '../platforms';
import type { ScalarReference } from '../entity/Reference';
export declare const ObjectBindingPattern: unique symbol;
export declare function compareObjects(a: any, b: any): boolean;
export declare function compareArrays(a: any[] | string, b: any[] | string): boolean;
export declare function compareBooleans(a: unknown, b: unknown): boolean;
export declare function compareBuffers(a: Uint8Array, b: Uint8Array): boolean;
/**
 * Checks if arguments are deeply (but not strictly) equal.
 */
export declare function equals(a: any, b: any): boolean;
export declare function parseJsonSafe<T = unknown>(value: unknown): T;
export declare class Utils {
    static readonly PK_SEPARATOR = "~~~";
    static dynamicImportProvider: (id: string) => Promise<any>;
    /**
     * Checks if the argument is not undefined
     */
    static isDefined<T = Record<string, unknown>>(data: any): data is T;
    /**
     * Checks if the argument is instance of `Object`. Returns false for arrays.
     */
    static isObject<T = Dictionary>(o: any): o is T;
    /**
     * Relation decorators allow using two signatures
     * - using first parameter as options object
     * - using all parameters
     *
     * This function validates those two ways are not mixed and returns the final options object.
     * If the second way is used, we always consider the last parameter as options object.
     * @internal
     */
    static processDecoratorParameters<T>(params: Dictionary): T;
    /**
     * Checks if the argument is instance of `Object`, but not one of the blacklisted types. Returns false for arrays.
     */
    static isNotObject<T = Dictionary>(o: any, not: any[]): o is T;
    /**
     * Removes `undefined` properties (recursively) so they are not saved as nulls
     */
    static dropUndefinedProperties<T = Dictionary | unknown[]>(o: any, value?: undefined | null, visited?: Set<unknown>): void;
    /**
     * Returns the number of properties on `obj`. This is 20x faster than Object.keys(obj).length.
     * @see https://github.com/deepkit/deepkit-framework/blob/master/packages/core/src/core.ts
     */
    static getObjectKeysSize(object: Dictionary): number;
    /**
     * Returns true if `obj` has at least one property. This is 20x faster than Object.keys(obj).length.
     * @see https://github.com/deepkit/deepkit-framework/blob/master/packages/core/src/core.ts
     */
    static hasObjectKeys(object: Dictionary): boolean;
    /**
     * Checks if the argument is string
     */
    static isString(s: any): s is string;
    /**
     * Checks if the argument is number
     */
    static isNumber<T = number>(s: any): s is T;
    /**
     * Checks if arguments are deeply (but not strictly) equal.
     */
    static equals(a: any, b: any): boolean;
    /**
     * Gets array without duplicates.
     */
    static unique<T = string>(items: T[]): T[];
    /**
     * Merges all sources into the target recursively.
     */
    static merge(target: any, ...sources: any[]): any;
    /**
     * Merges all sources into the target recursively. Ignores `undefined` values.
     */
    static mergeConfig(target: any, ...sources: any[]): any;
    /**
     * Merges all sources into the target recursively.
     */
    private static _merge;
    static getRootEntity(metadata: IMetadataStorage, meta: EntityMetadata): EntityMetadata;
    /**
     * Computes difference between two objects, ignoring items missing in `b`.
     */
    static diff(a: Dictionary, b: Dictionary): Record<keyof (typeof a & typeof b), any>;
    /**
     * Creates deep copy of given object.
     */
    static copy<T>(entity: T, respectCustomCloneMethod?: boolean): T;
    /**
     * Normalize the argument to always be an array.
     */
    static asArray<T>(data?: T | readonly T[] | Iterable<T>, strict?: boolean): T[];
    /**
     * Checks if the value is iterable, but considers strings and buffers as not iterable.
     */
    static isIterable<T>(value: unknown): value is Iterable<T>;
    /**
     * Renames object key, keeps order of properties.
     */
    static renameKey<T>(payload: T, from: string | keyof T, to: string): void;
    /**
     * Returns array of functions argument names. Uses `esprima` for source code analysis.
     */
    static tokenize(func: {
        toString(): string;
    } | string | {
        type: string;
        value: string;
    }[]): {
        type: string;
        value: string;
    }[];
    /**
     * Returns array of functions argument names. Uses `esprima` for source code analysis.
     */
    static getParamNames(func: {
        toString(): string;
    } | string | {
        type: string;
        value: string;
    }[], methodName?: string): string[];
    /**
     * Checks whether the argument looks like primary key (string, number or ObjectId).
     */
    static isPrimaryKey<T>(key: any, allowComposite?: boolean): key is Primary<T>;
    /**
     * Extracts primary key from `data`. Accepts objects or primary keys directly.
     */
    static extractPK<T extends object>(data: any, meta?: EntityMetadata<T>, strict?: boolean): Primary<T> | string | null;
    static getCompositeKeyValue<T>(data: EntityData<T>, meta: EntityMetadata<T>, convertCustomTypes?: boolean | 'convertToDatabaseValue' | 'convertToJSValue', platform?: Platform): Primary<T>;
    static getCompositeKeyHash<T>(data: EntityData<T>, meta: EntityMetadata<T>, convertCustomTypes?: boolean, platform?: Platform, flat?: boolean): string;
    static getPrimaryKeyHash(pks: (string | Buffer | Date)[]): string;
    static splitPrimaryKeys<T extends object>(key: string): EntityKey<T>[];
    static getPrimaryKeyValues<T>(entity: T, primaryKeys: string[], allowScalar?: boolean, convertCustomTypes?: boolean): any;
    static getPrimaryKeyCond<T>(entity: T, primaryKeys: EntityKey<T>[]): Record<string, Primary<T>> | null;
    /**
     * Maps nested FKs from `[1, 2, 3]` to `[1, [2, 3]]`.
     */
    static mapFlatCompositePrimaryKey(fk: Primary<any>[], prop: EntityProperty, fieldNames?: string[], idx?: number): Primary<any> | Primary<any>[];
    static getPrimaryKeyCondFromArray<T extends object>(pks: Primary<T>[], meta: EntityMetadata<T>): Record<string, Primary<T>>;
    static getOrderedPrimaryKeys<T>(id: Primary<T> | Record<string, Primary<T>>, meta: EntityMetadata<T>, platform?: Platform, convertCustomTypes?: boolean): Primary<T>[];
    /**
     * Checks whether given object is an entity instance.
     */
    static isEntity<T = unknown>(data: any, allowReference?: boolean): data is T & {};
    /**
     * Checks whether given object is a scalar reference.
     */
    static isScalarReference<T = unknown>(data: any, allowReference?: boolean): data is ScalarReference<any> & {};
    /**
     * Checks whether the argument is ObjectId instance
     */
    static isObjectID(key: any): boolean;
    /**
     * Checks whether the argument is empty (array without items, object without keys or falsy value).
     */
    static isEmpty(data: any): boolean;
    /**
     * Gets string name of given class.
     */
    static className<T>(classOrName: EntityName<T>): string;
    static extractChildElements(items: string[], prefix: string, allSymbol?: string): string[];
    /**
     * Tries to detect `ts-node` runtime.
     */
    static detectTsNode(): boolean;
    /**
     * Uses some dark magic to get source path to caller where decorator is used.
     * Analyses stack trace of error created inside the function call.
     */
    static lookupPathFromDecorator(name: string, stack?: string[]): string;
    /**
     * Gets the type of the argument.
     */
    static getObjectType(value: any): string;
    /**
     * Checks whether the value is POJO (e.g. `{ foo: 'bar' }`, and not instance of `Foo`)
     */
    static isPlainObject<T extends Dictionary>(value: any): value is T;
    /**
     * Executes the `cb` promise serially on every element of the `items` array and returns array of resolved values.
     */
    static runSerial<T = any, U = any>(items: Iterable<U>, cb: (item: U) => Promise<T>): Promise<T[]>;
    static isCollection<T extends object, O extends object = object>(item: any): item is Collection<T, O>;
    static fileURLToPath(url: string | URL): string;
    /**
     * Resolves and normalizes a series of path parts relative to each preceding part.
     * If any part is a `file:` URL, it is converted to a local path. If any part is an
     * absolute path, it replaces preceding paths (similar to `path.resolve` in NodeJS).
     * Trailing directory separators are removed, and all directory separators are converted
     * to POSIX-style separators (`/`).
     */
    static normalizePath(...parts: string[]): string;
    /**
     * Determines the relative path between two paths. If either path is a `file:` URL,
     * it is converted to a local path.
     */
    static relativePath(path: string, relativeTo: string): string;
    /**
     * Computes the absolute path to for the given path relative to the provided base directory.
     * If either `path` or `baseDir` are `file:` URLs, they are converted to local paths.
     */
    static absolutePath(path: string, baseDir?: string): string;
    static hash(data: string, length?: number): string;
    static runIfNotEmpty(clause: () => any, data: any): void;
    static defaultValue<T extends Dictionary>(prop: T, option: keyof T, defaultValue: any): void;
    static findDuplicates<T>(items: T[]): T[];
    static removeDuplicates<T>(items: T[]): T[];
    static randomInt(min: number, max: number): number;
    static pathExists(path: string, options?: GlobbyOptions): Promise<boolean>;
    /**
     * Extracts all possible values of a TS enum. Works with both string and numeric enums.
     */
    static extractEnumValues(target: Dictionary): (string | number)[];
    static flatten<T>(arrays: T[][]): T[];
    static isOperator(key: PropertyKey, includeGroupOperators?: boolean): boolean;
    static isGroupOperator(key: PropertyKey): boolean;
    static isArrayOperator(key: PropertyKey): boolean;
    static isJsonKeyOperator(key: PropertyKey): boolean;
    static hasNestedKey(object: unknown, key: string): boolean;
    static getGlobalStorage(namespace: string): Dictionary;
    /**
     * Require a module from a specific location
     * @param id The module to require
     * @param [from] Location to start the node resolution
     */
    static requireFrom<T extends Dictionary>(id: string, from?: string): T;
    static dynamicImport<T = any>(id: string): Promise<T>;
    static setDynamicImportProvider(provider: (id: string) => Promise<unknown>): void;
    static getORMVersion(): string;
    static createFunction(context: Map<string, any>, code: string): any;
    static callCompiledFunction<T extends unknown[], R>(fn: (...args: T) => R, ...args: T): R;
    /**
     * @see https://github.com/mikro-orm/mikro-orm/issues/840
     */
    static propertyDecoratorReturnValue(): any;
    static unwrapProperty<T>(entity: T, meta: EntityMetadata<T>, prop: EntityProperty<T>, payload?: boolean): [unknown, number[]][];
    static setPayloadProperty<T>(entity: EntityDictionary<T>, meta: EntityMetadata<T>, prop: EntityProperty<T>, value: unknown, idx: number[]): void;
    static tryRequire<T extends Dictionary = any>({ module, from, allowError, warning }: {
        module: string;
        warning: string;
        from?: string;
        allowError?: string;
    }): T | undefined;
    static stripRelativePath(str: string): string;
    /**
     * simple process.argv parser, supports only properties with long names, prefixed with `--`
     */
    static parseArgs<T extends Dictionary = Dictionary>(): T;
    static xor(a: boolean, b: boolean): boolean;
    static keys<T extends object>(obj: T): (keyof T)[];
    static values<T extends object>(obj: T): T[keyof T][];
    static entries<T extends object>(obj: T): [keyof T, T[keyof T]][];
    static isRawSql<T = {
        sql: string;
        params: unknown[];
        use: () => void;
    }>(value: unknown): value is T;
    static primaryKeyToObject<T>(meta: EntityMetadata<T>, primaryKey: Primary<T> | T, visible?: (keyof T)[]): T;
}
