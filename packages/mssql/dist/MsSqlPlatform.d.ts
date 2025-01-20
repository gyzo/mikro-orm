import { AbstractSqlPlatform, type EntityMetadata, type IDatabaseDriver, type EntityManager, type MikroORM, Type, type Primary, type IPrimaryKey } from '@mikro-orm/knex';
import { MsSqlSchemaHelper } from './MsSqlSchemaHelper';
import { MsSqlExceptionConverter } from './MsSqlExceptionConverter';
import { MsSqlSchemaGenerator } from './MsSqlSchemaGenerator';
export declare class MsSqlPlatform extends AbstractSqlPlatform {
    protected readonly schemaHelper: MsSqlSchemaHelper;
    protected readonly exceptionConverter: MsSqlExceptionConverter;
    /** @inheritDoc */
    lookupExtensions(orm: MikroORM): void;
    /** @inheritDoc */
    init(orm: MikroORM): void;
    usesOutputStatement(): boolean;
    convertDateToJSValue(value: string | Date): string;
    convertsJsonAutomatically(): boolean;
    indexForeignKeys(): boolean;
    supportsSchemas(): boolean;
    getCurrentTimestampSQL(length: number): string;
    getDateTimeTypeDeclarationSQL(column: {
        length?: number;
    }): string;
    getDefaultDateTimeLength(): number;
    getFloatDeclarationSQL(): string;
    getDoubleDeclarationSQL(): string;
    getBooleanTypeDeclarationSQL(): string;
    getRegExpOperator(): string;
    getBlobDeclarationSQL(): string;
    getJsonDeclarationSQL(): string;
    getVarcharTypeDeclarationSQL(column: {
        length?: number;
    }): string;
    getEnumTypeDeclarationSQL(column: {
        items?: unknown[];
        fieldNames: string[];
        length?: number;
        unsigned?: boolean;
        autoincrement?: boolean;
    }): string;
    normalizeColumnType(type: string, options?: {
        length?: number;
        precision?: number;
        scale?: number;
    }): string;
    getDefaultMappedType(type: string): Type<unknown>;
    getDefaultSchemaName(): string | undefined;
    getUuidTypeDeclarationSQL(column: {
        length?: number;
    }): string;
    validateMetadata(meta: EntityMetadata): void;
    getSearchJsonPropertyKey(path: string[], type: string, aliased: boolean, value?: unknown): string;
    normalizePrimaryKey<T extends number | string = number | string>(data: Primary<T> | IPrimaryKey | string): T;
    supportsMultipleCascadePaths(): boolean;
    supportsMultipleStatements(): boolean;
    quoteIdentifier(id: string): string;
    escape(value: any): string;
    getSchemaGenerator(driver: IDatabaseDriver, em?: EntityManager): MsSqlSchemaGenerator;
    allowsComparingTuples(): boolean;
}
