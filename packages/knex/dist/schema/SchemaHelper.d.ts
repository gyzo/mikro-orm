import { type Connection, type Dictionary } from '@mikro-orm/core';
import type { Knex } from 'knex';
import type { AbstractSqlConnection } from '../AbstractSqlConnection';
import type { AbstractSqlPlatform } from '../AbstractSqlPlatform';
import type { CheckDef, Column, ForeignKey, IndexDef, Table, TableDifference } from '../typings';
import type { DatabaseSchema } from './DatabaseSchema';
import type { DatabaseTable } from './DatabaseTable';
export declare abstract class SchemaHelper {
    protected readonly platform: AbstractSqlPlatform;
    constructor(platform: AbstractSqlPlatform);
    getSchemaBeginning(charset: string, disableForeignKeys?: boolean): string;
    disableForeignKeysSQL(): string;
    enableForeignKeysSQL(): string;
    getSchemaEnd(disableForeignKeys?: boolean): string;
    finalizeTable(table: Knex.TableBuilder, charset: string, collate?: string): void;
    supportsSchemaConstraints(): boolean;
    getPrimaryKeys(connection: AbstractSqlConnection, indexes: IndexDef[] | undefined, tableName: string, schemaName?: string): Promise<string[]>;
    inferLengthFromColumnType(type: string): number | undefined;
    getForeignKeys(connection: AbstractSqlConnection, tableName: string, schemaName?: string): Promise<Dictionary>;
    protected getTableKey(t: Table): string;
    getEnumDefinitions(connection: AbstractSqlConnection, checks: CheckDef[], tableName: string, schemaName?: string): Promise<Dictionary<string[]>>;
    getCreateNativeEnumSQL(name: string, values: unknown[], schema?: string): string;
    getDropNativeEnumSQL(name: string, schema?: string): string;
    getAlterNativeEnumSQL(name: string, schema?: string, value?: string, items?: string[], oldItems?: string[]): string;
    loadInformationSchema(schema: DatabaseSchema, connection: AbstractSqlConnection, tables: Table[], schemas?: string[]): Promise<void>;
    getListTablesSQL(schemaName?: string): string;
    getRenameColumnSQL(tableName: string, oldColumnName: string, to: Column, schemaName?: string): string;
    getCreateIndexSQL(tableName: string, index: IndexDef, partialExpression?: boolean): string;
    getDropIndexSQL(tableName: string, index: IndexDef): string;
    getRenameIndexSQL(tableName: string, index: IndexDef, oldIndexName: string): string;
    getDropColumnsSQL(tableName: string, columns: Column[], schemaName?: string): string;
    hasNonDefaultPrimaryKeyName(table: DatabaseTable): boolean;
    createTableColumn(table: Knex.TableBuilder, column: Column, fromTable: DatabaseTable, changedProperties?: Set<string>, alter?: boolean): Knex.ColumnBuilder | undefined;
    configureColumn(column: Column, col: Knex.ColumnBuilder, knex: Knex, changedProperties?: Set<string>): Knex.ColumnBuilder;
    configureColumnDefault(column: Column, col: Knex.ColumnBuilder, knex: Knex, changedProperties?: Set<string>): Knex.ColumnBuilder;
    getPreAlterTable(tableDiff: TableDifference, safe: boolean): string;
    getPostAlterTable(tableDiff: TableDifference, safe: boolean): string;
    getAlterColumnAutoincrement(tableName: string, column: Column, schemaName?: string): string;
    getChangeColumnCommentSQL(tableName: string, to: Column, schemaName?: string): string;
    getNamespaces(connection: AbstractSqlConnection): Promise<string[]>;
    getColumns(connection: AbstractSqlConnection, tableName: string, schemaName?: string): Promise<Column[]>;
    getIndexes(connection: AbstractSqlConnection, tableName: string, schemaName?: string): Promise<IndexDef[]>;
    getChecks(connection: AbstractSqlConnection, tableName: string, schemaName?: string, columns?: Column[]): Promise<CheckDef[]>;
    protected mapIndexes(indexes: IndexDef[]): Promise<IndexDef[]>;
    getForeignKeysSQL(tableName: string, schemaName?: string): string;
    mapForeignKeys(fks: any[], tableName: string, schemaName?: string): Dictionary;
    normalizeDefaultValue(defaultValue: string, length?: number, defaultValues?: Dictionary<string[]>): string | number;
    getCreateDatabaseSQL(name: string): string;
    getDropDatabaseSQL(name: string): string;
    getCreateNamespaceSQL(name: string): string;
    getDropNamespaceSQL(name: string): string;
    getDatabaseExistsSQL(name: string): string;
    getDatabaseNotExistsError(dbName: string): string;
    getManagementDbName(): string;
    getDefaultEmptyString(): string;
    databaseExists(connection: Connection, name: string): Promise<boolean>;
    /**
     * Uses `raw` method injected in `AbstractSqlConnection` to allow adding custom queries inside alter statements.
     */
    pushTableQuery(table: Knex.TableBuilder, expression: string, grouping?: string): void;
    dump(builder: Knex.SchemaBuilder | string, append: string): Promise<string>;
    createTable(tableDef: DatabaseTable, alter?: boolean): Knex.SchemaBuilder;
    createForeignKey(table: Knex.CreateTableBuilder, foreignKey: ForeignKey, schema?: string): void;
    splitTableName(name: string): [string | undefined, string];
    getReferencedTableName(referencedTableName: string, schema?: string): string;
    createIndex(table: Knex.CreateTableBuilder, index: IndexDef, tableDef: DatabaseTable, createPrimary?: boolean): void;
    createCheck(table: Knex.CreateTableBuilder, check: CheckDef): void;
    createSchemaBuilder(schema?: string): Knex.SchemaBuilder;
    getTablesGroupedBySchemas(tables: Table[]): Map<string | undefined, Table[]>;
    getAlterTable?(changedTable: TableDifference, wrap?: boolean): Promise<string>;
    get knex(): Knex;
    get options(): {
        disableForeignKeys?: boolean;
        createForeignKeyConstraints?: boolean;
        ignoreSchema?: string[];
        managementDbName?: string;
    };
    private processComment;
    protected handleMultilineComment(comment: string): string;
}
