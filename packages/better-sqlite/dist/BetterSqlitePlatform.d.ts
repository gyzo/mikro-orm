import { BaseSqlitePlatform } from '@mikro-orm/knex';
import { BetterSqliteSchemaHelper } from './BetterSqliteSchemaHelper';
import { BetterSqliteExceptionConverter } from './BetterSqliteExceptionConverter';
export declare class BetterSqlitePlatform extends BaseSqlitePlatform {
    protected readonly schemaHelper: BetterSqliteSchemaHelper;
    protected readonly exceptionConverter: BetterSqliteExceptionConverter;
    escape(value: any): string;
}
