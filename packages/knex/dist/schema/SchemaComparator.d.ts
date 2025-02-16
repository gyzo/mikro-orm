import { type Dictionary } from '@mikro-orm/core';
import type { Column, ForeignKey, IndexDef, SchemaDifference, TableDifference } from '../typings';
import type { DatabaseSchema } from './DatabaseSchema';
import type { DatabaseTable } from './DatabaseTable';
import type { AbstractSqlPlatform } from '../AbstractSqlPlatform';
/**
 * Compares two Schemas and return an instance of SchemaDifference.
 */
export declare class SchemaComparator {
    private readonly platform;
    private readonly helper;
    private readonly logger;
    constructor(platform: AbstractSqlPlatform);
    /**
     * Returns a SchemaDifference object containing the differences between the schemas fromSchema and toSchema.
     *
     * The returned differences are returned in such a way that they contain the
     * operations to change the schema stored in fromSchema to the schema that is
     * stored in toSchema.
     */
    compare(fromSchema: DatabaseSchema, toSchema: DatabaseSchema, inverseDiff?: SchemaDifference): SchemaDifference;
    /**
     * Returns the difference between the tables fromTable and toTable.
     * If there are no differences this method returns the boolean false.
     */
    diffTable(fromTable: DatabaseTable, toTable: DatabaseTable, inverseTableDiff?: TableDifference): TableDifference | false;
    /**
     * Try to find columns that only changed their name, rename operations maybe cheaper than add/drop
     * however ambiguities between different possibilities should not lead to renaming at all.
     */
    private detectColumnRenamings;
    /**
     * Try to find indexes that only changed their name, rename operations maybe cheaper than add/drop
     * however ambiguities between different possibilities should not lead to renaming at all.
     */
    private detectIndexRenamings;
    diffForeignKey(key1: ForeignKey, key2: ForeignKey, tableDifferences: TableDifference): boolean;
    /**
     * Returns the difference between the columns
     * If there are differences this method returns field2, otherwise the boolean false.
     */
    diffColumn(fromColumn: Column, toColumn: Column, fromTable: DatabaseTable, tableName?: string): Set<string>;
    diffEnumItems(items1?: string[], items2?: string[]): boolean;
    diffComment(comment1?: string, comment2?: string): boolean;
    /**
     * Finds the difference between the indexes index1 and index2.
     * Compares index1 with index2 and returns index2 if there are any differences or false in case there are no differences.
     */
    diffIndex(index1: IndexDef, index2: IndexDef): boolean;
    /**
     * Checks if the other index already fulfills all the indexing and constraint needs of the current one.
     */
    isIndexFulfilledBy(index1: IndexDef, index2: IndexDef): boolean;
    diffExpression(expr1: string, expr2: string): boolean;
    parseJsonDefault(defaultValue?: string | null): Dictionary | string | null;
    hasSameDefaultValue(from: Column, to: Column): boolean;
    private mapColumnToProperty;
    private log;
}
