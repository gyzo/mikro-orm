import type { Configuration } from '@mikro-orm/core';
import { AbstractSqlDriver } from '@mikro-orm/knex';
import { BetterSqliteConnection } from './BetterSqliteConnection';
export declare class BetterSqliteDriver extends AbstractSqlDriver<BetterSqliteConnection> {
    constructor(config: Configuration);
}
