import type { Configuration } from '@mikro-orm/core';
import { AbstractSqlDriver } from '@mikro-orm/knex';
import { LibSqlConnection } from './LibSqlConnection';
export declare class LibSqlDriver extends AbstractSqlDriver<LibSqlConnection> {
    constructor(config: Configuration);
}
