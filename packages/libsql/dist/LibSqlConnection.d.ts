import { BaseSqliteConnection, type Knex } from '@mikro-orm/knex';
export declare class LibSqlConnection extends BaseSqliteConnection {
    createKnex(): void;
    protected getKnexOptions(type: string): Knex.Config;
}
