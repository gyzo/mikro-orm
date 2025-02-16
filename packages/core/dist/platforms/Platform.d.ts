import { EntityRepository } from '../entity';
import { type NamingStrategy } from '../naming-strategy';
import type { Constructor, EntityProperty, IPrimaryKey, ISchemaGenerator, PopulateOptions, Primary, EntityMetadata, SimpleColumnMeta } from '../typings';
import { ExceptionConverter } from './ExceptionConverter';
import type { EntityManager } from '../EntityManager';
import type { Configuration } from '../utils/Configuration';
import type { IDatabaseDriver } from '../drivers/IDatabaseDriver';
import { Type } from '../types';
import type { MikroORM } from '../MikroORM';
import type { TransformContext } from '../types/Type';
export declare const JsonProperty: unique symbol;
export declare abstract class Platform {
    protected readonly exceptionConverter: ExceptionConverter;
    protected config: Configuration;
    protected namingStrategy: NamingStrategy;
    protected timezone?: string;
    usesPivotTable(): boolean;
    supportsTransactions(): boolean;
    usesImplicitTransactions(): boolean;
    getNamingStrategy(): {
        new (): NamingStrategy;
    };
    usesReturningStatement(): boolean;
    usesOutputStatement(): boolean;
    usesCascadeStatement(): boolean;
    /** for postgres native enums */
    supportsNativeEnums(): boolean;
    getSchemaHelper(): unknown;
    indexForeignKeys(): boolean;
    allowsMultiInsert(): boolean;
    /**
     * Whether or not the driver supports retuning list of created PKs back when multi-inserting
     */
    usesBatchInserts(): boolean;
    /**
     * Whether or not the driver supports updating many records at once
     */
    usesBatchUpdates(): boolean;
    usesDefaultKeyword(): boolean;
    /**
     * Normalizes primary key wrapper to scalar value (e.g. mongodb's ObjectId to string)
     */
    normalizePrimaryKey<T extends number | string = number | string>(data: Primary<T> | IPrimaryKey): T;
    /**
     * Converts scalar primary key representation to native driver wrapper (e.g. string to mongodb's ObjectId)
     */
    denormalizePrimaryKey(data: IPrimaryKey): IPrimaryKey;
    /**
     * Used when serializing via toObject and toJSON methods, allows to use different PK field name (like `id` instead of `_id`)
     */
    getSerializedPrimaryKeyField(field: string): string;
    usesDifferentSerializedPrimaryKey(): boolean;
    /**
     * Returns the SQL specific for the platform to get the current timestamp
     */
    getCurrentTimestampSQL(length?: number): string;
    getDateTimeTypeDeclarationSQL(column: {
        length?: number;
    }): string;
    getDefaultDateTimeLength(): number;
    getDefaultVarcharLength(): number;
    getDefaultCharLength(): number;
    getDateTypeDeclarationSQL(length?: number): string;
    getTimeTypeDeclarationSQL(length?: number): string;
    getRegExpOperator(val?: unknown, flags?: string): string;
    getRegExpValue(val: RegExp): {
        $re: string;
        $flags?: string;
    };
    isAllowedTopLevelOperator(operator: string): boolean;
    quoteVersionValue(value: Date | number, prop: EntityProperty): Date | string | number;
    getDefaultVersionLength(): number;
    allowsComparingTuples(): boolean;
    isBigIntProperty(prop: EntityProperty): boolean;
    isRaw(value: any): boolean;
    getDefaultSchemaName(): string | undefined;
    getBooleanTypeDeclarationSQL(): string;
    getIntegerTypeDeclarationSQL(column: {
        length?: number;
        unsigned?: boolean;
        autoincrement?: boolean;
    }): string;
    getSmallIntTypeDeclarationSQL(column: {
        length?: number;
        unsigned?: boolean;
        autoincrement?: boolean;
    }): string;
    getMediumIntTypeDeclarationSQL(column: {
        length?: number;
        unsigned?: boolean;
        autoincrement?: boolean;
    }): string;
    getTinyIntTypeDeclarationSQL(column: {
        length?: number;
        unsigned?: boolean;
        autoincrement?: boolean;
    }): string;
    getBigIntTypeDeclarationSQL(column: {
        length?: number;
        unsigned?: boolean;
        autoincrement?: boolean;
    }): string;
    getCharTypeDeclarationSQL(column: {
        length?: number;
    }): string;
    getVarcharTypeDeclarationSQL(column: {
        length?: number;
    }): string;
    getIntervalTypeDeclarationSQL(column: {
        length?: number;
    }): string;
    getTextTypeDeclarationSQL(_column: {
        length?: number;
    }): string;
    getEnumTypeDeclarationSQL(column: {
        items?: unknown[];
        fieldNames: string[];
        length?: number;
        unsigned?: boolean;
        autoincrement?: boolean;
    }): string;
    getFloatDeclarationSQL(): string;
    getDoubleDeclarationSQL(): string;
    getDecimalTypeDeclarationSQL(column: {
        precision?: number;
        scale?: number;
    }): string;
    getUuidTypeDeclarationSQL(column: {
        length?: number;
    }): string;
    extractSimpleType(type: string): string;
    /**
     * This should be used only to compare types, it can strip some information like the length.
     */
    normalizeColumnType(type: string, options?: {
        length?: number;
        precision?: number;
        scale?: number;
    }): string;
    getMappedType(type: string): Type<unknown>;
    getDefaultMappedType(type: string): Type<unknown>;
    supportsMultipleCascadePaths(): boolean;
    supportsMultipleStatements(): boolean;
    getArrayDeclarationSQL(): string;
    marshallArray(values: string[]): string;
    unmarshallArray(value: string): string[];
    getBlobDeclarationSQL(): string;
    getJsonDeclarationSQL(): string;
    getSearchJsonPropertySQL(path: string, type: string, aliased: boolean): string;
    getSearchJsonPropertyKey(path: string[], type: string, aliased: boolean, value?: unknown): string;
    getJsonIndexDefinition(index: {
        columnNames: string[];
    }): string[];
    getFullTextWhereClause(prop: EntityProperty): string;
    supportsCreatingFullTextIndex(): boolean;
    getFullTextIndexExpression(indexName: string, schemaName: string | undefined, tableName: string, columns: SimpleColumnMeta[]): string;
    convertsJsonAutomatically(): boolean;
    convertJsonToDatabaseValue(value: unknown, context?: TransformContext): unknown;
    convertJsonToJSValue(value: unknown, prop: EntityProperty): unknown;
    convertDateToJSValue(value: string | Date): string;
    convertIntervalToJSValue(value: string): unknown;
    convertIntervalToDatabaseValue(value: unknown): unknown;
    parseDate(value: string | number): Date;
    getRepositoryClass<T extends object>(): Constructor<EntityRepository<T>>;
    getDefaultCharset(): string;
    getExceptionConverter(): ExceptionConverter;
    /**
     * Allows registering extensions of the driver automatically (e.g. `SchemaGenerator` extension in SQL drivers).
     */
    lookupExtensions(orm: MikroORM): void;
    /** @internal */
    init(orm: MikroORM): void;
    getExtension<T>(extensionName: string, extensionKey: string, moduleName: string, em: EntityManager): T;
    getSchemaGenerator(driver: IDatabaseDriver, em?: EntityManager): ISchemaGenerator;
    processDateProperty(value: unknown): string | number | Date;
    quoteIdentifier(id: string, quote?: string): string;
    quoteValue(value: any): string;
    escape(value: any): string;
    formatQuery(sql: string, params: readonly any[]): string;
    cloneEmbeddable<T>(data: T): T;
    setConfig(config: Configuration): void;
    getConfig(): Configuration;
    getTimezone(): string | undefined;
    isNumericProperty(prop: EntityProperty, ignoreCustomType?: boolean): boolean;
    isNumericColumn(mappedType: Type<unknown>): boolean;
    supportsUnsigned(): boolean;
    /**
     * Returns the default name of index for the given columns
     */
    getIndexName(tableName: string, columns: string[], type: 'index' | 'unique' | 'foreign' | 'primary' | 'sequence'): string;
    getDefaultPrimaryName(tableName: string, columns: string[]): string;
    supportsCustomPrimaryKeyNames(): boolean;
    isPopulated<T>(key: string, populate: PopulateOptions<T>[] | boolean): boolean;
    shouldHaveColumn<T>(prop: EntityProperty<T>, populate: PopulateOptions<T>[] | boolean, exclude?: string[], includeFormulas?: boolean): boolean;
    /**
     * Currently not supported due to how knex does complex sqlite diffing (always based on current schema)
     */
    supportsDownMigrations(): boolean;
    validateMetadata(meta: EntityMetadata): void;
    /**
     * Generates a custom order by statement given a set of in order values, eg.
     * ORDER BY (CASE WHEN priority = 'low' THEN 1 WHEN priority = 'medium' THEN 2 ELSE NULL END)
     */
    generateCustomOrder(escapedColumn: string, values: unknown[]): void;
    /**
     * @internal
     */
    castColumn(prop?: {
        columnTypes?: string[];
    }): string;
    /**
     * @internal
     */
    castJsonValue(prop?: {
        columnTypes?: string[];
    }): string;
    /**
     * @internal
     */
    clone(): this;
}
