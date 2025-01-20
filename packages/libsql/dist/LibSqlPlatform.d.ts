import { BaseSqlitePlatform } from '@mikro-orm/knex';
import { LibSqlSchemaHelper } from './LibSqlSchemaHelper';
import { LibSqlExceptionConverter } from './LibSqlExceptionConverter';
export declare class LibSqlPlatform extends BaseSqlitePlatform {
    protected readonly schemaHelper: LibSqlSchemaHelper;
    protected readonly exceptionConverter: LibSqlExceptionConverter;
    escape(value: any): string;
}
