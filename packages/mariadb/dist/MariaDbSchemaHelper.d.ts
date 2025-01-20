import { type AbstractSqlConnection, type CheckDef, type Column, type IndexDef, type DatabaseSchema, type Table, MySqlSchemaHelper } from '@mikro-orm/knex';
import { type Dictionary, type Type } from '@mikro-orm/core';
export declare class MariaDbSchemaHelper extends MySqlSchemaHelper {
    loadInformationSchema(schema: DatabaseSchema, connection: AbstractSqlConnection, tables: Table[]): Promise<void>;
    getAllIndexes(connection: AbstractSqlConnection, tables: Table[]): Promise<Dictionary<IndexDef[]>>;
    getAllColumns(connection: AbstractSqlConnection, tables: Table[]): Promise<Dictionary<Column[]>>;
    getAllChecks(connection: AbstractSqlConnection, tables: Table[], columns?: Dictionary<Column[]>): Promise<Dictionary<CheckDef[]>>;
    protected getChecksSQL(tables: Table[]): string;
    getChecks(connection: AbstractSqlConnection, tableName: string, schemaName: string, columns?: Column[]): Promise<CheckDef[]>;
    protected wrap(val: string | undefined | null, type: Type<unknown>): string | undefined | null;
}
