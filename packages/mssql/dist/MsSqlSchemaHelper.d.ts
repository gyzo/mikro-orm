import { type AbstractSqlConnection, type CheckDef, type Column, type DatabaseSchema, type DatabaseTable, type Dictionary, type ForeignKey, type IndexDef, type Knex, SchemaHelper, type Table, type TableDifference, type Type } from '@mikro-orm/knex';
export declare class MsSqlSchemaHelper extends SchemaHelper {
    static readonly DEFAULT_VALUES: {
        true: string[];
        false: string[];
        'getdate()': string[];
    };
    getManagementDbName(): string;
    disableForeignKeysSQL(): string;
    enableForeignKeysSQL(): string;
    getDatabaseExistsSQL(name: string): string;
    getListTablesSQL(): string;
    getNamespaces(connection: AbstractSqlConnection): Promise<string[]>;
    normalizeDefaultValue(defaultValue: string, length: number, defaultValues?: Dictionary<string[]>, stripQuotes?: boolean): string | number;
    getAllColumns(connection: AbstractSqlConnection, tablesBySchemas: Map<string | undefined, Table[]>): Promise<Dictionary<Column[]>>;
    getAllIndexes(connection: AbstractSqlConnection, tablesBySchemas: Map<string | undefined, Table[]>): Promise<Dictionary<IndexDef[]>>;
    mapForeignKeys(fks: any[], tableName: string, schemaName?: string): Dictionary;
    getAllForeignKeys(connection: AbstractSqlConnection, tablesBySchemas: Map<string | undefined, Table[]>): Promise<Dictionary<Dictionary<ForeignKey>>>;
    getEnumDefinitions(connection: AbstractSqlConnection, checks: CheckDef[], tableName?: string, schemaName?: string): Promise<Dictionary<string[]>>;
    private getChecksSQL;
    getAllChecks(connection: AbstractSqlConnection, tablesBySchemas: Map<string | undefined, Table[]>): Promise<Dictionary<CheckDef[]>>;
    loadInformationSchema(schema: DatabaseSchema, connection: AbstractSqlConnection, tables: Table[]): Promise<void>;
    getPreAlterTable(tableDiff: TableDifference, safe: boolean): string;
    getPostAlterTable(tableDiff: TableDifference, safe: boolean): string;
    getCreateNamespaceSQL(name: string): string;
    getDropNamespaceSQL(name: string): string;
    getDropIndexSQL(tableName: string, index: IndexDef): string;
    getDropColumnsSQL(tableName: string, columns: Column[], schemaName?: string): string;
    getRenameColumnSQL(tableName: string, oldColumnName: string, to: Column, schemaName?: string): string;
    createTableColumn(table: Knex.TableBuilder, column: Column, fromTable: DatabaseTable, changedProperties?: Set<string>, alter?: boolean): Knex.ColumnBuilder | undefined;
    inferLengthFromColumnType(type: string): number | undefined;
    protected wrap(val: string | undefined, type: Type<unknown>): string | undefined;
    /**
     * MSSQL supports `\n` in SQL and stores `\\n` literally.
     * This method overrides the parent behavior to prevent replacing `\n` with `\\n`.
     */
    handleMultilineComment(comment: string): string;
}
