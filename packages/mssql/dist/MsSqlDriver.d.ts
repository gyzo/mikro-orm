import { type AnyEntity, type Configuration, type ConnectionType, type EntityDictionary, type LoggingOptions, type NativeInsertUpdateManyOptions, type QueryResult, type Transaction } from '@mikro-orm/core';
import { AbstractSqlDriver, type Knex, type SqlEntityManager } from '@mikro-orm/knex';
import { MsSqlConnection } from './MsSqlConnection';
import { MsSqlQueryBuilder } from './MsSqlQueryBuilder';
export declare class MsSqlDriver extends AbstractSqlDriver<MsSqlConnection> {
    constructor(config: Configuration);
    nativeInsertMany<T extends AnyEntity<T>>(entityName: string, data: EntityDictionary<T>[], options?: NativeInsertUpdateManyOptions<T>): Promise<QueryResult<T>>;
    createQueryBuilder<T extends AnyEntity<T>>(entityName: string, ctx?: Transaction<Knex.Transaction>, preferredConnectionType?: ConnectionType, convertCustomTypes?: boolean, loggerContext?: LoggingOptions, alias?: string, em?: SqlEntityManager): MsSqlQueryBuilder<T, any, any, any>;
}
