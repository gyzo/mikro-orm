import { BaseSqliteConnection } from '@mikro-orm/knex';
export declare class BetterSqliteConnection extends BaseSqliteConnection {
    createKnex(): void;
}
