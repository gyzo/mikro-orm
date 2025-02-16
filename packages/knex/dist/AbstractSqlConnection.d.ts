import { type Knex } from 'knex';
import { Connection, type AnyEntity, type Configuration, type ConnectionOptions, type EntityData, type IsolationLevel, type QueryResult, type Transaction, type TransactionEventBroadcaster, type LoggingOptions } from '@mikro-orm/core';
import type { AbstractSqlPlatform } from './AbstractSqlPlatform';
export declare abstract class AbstractSqlConnection extends Connection {
    private static __patched;
    protected platform: AbstractSqlPlatform;
    protected client: Knex;
    constructor(config: Configuration, options?: ConnectionOptions, type?: 'read' | 'write');
    abstract createKnex(): void;
    /** @inheritDoc */
    connect(): void | Promise<void>;
    getKnex(): Knex;
    /**
     * @inheritDoc
     */
    close(force?: boolean): Promise<void>;
    /**
     * @inheritDoc
     */
    isConnected(): Promise<boolean>;
    /**
     * @inheritDoc
     */
    checkConnection(): Promise<{
        ok: true;
    } | {
        ok: false;
        reason: string;
        error?: Error;
    }>;
    transactional<T>(cb: (trx: Transaction<Knex.Transaction>) => Promise<T>, options?: {
        isolationLevel?: IsolationLevel;
        readOnly?: boolean;
        ctx?: Knex.Transaction;
        eventBroadcaster?: TransactionEventBroadcaster;
    }): Promise<T>;
    begin(options?: {
        isolationLevel?: IsolationLevel;
        readOnly?: boolean;
        ctx?: Knex.Transaction;
        eventBroadcaster?: TransactionEventBroadcaster;
    }): Promise<Knex.Transaction>;
    commit(ctx: Knex.Transaction, eventBroadcaster?: TransactionEventBroadcaster): Promise<void>;
    rollback(ctx: Knex.Transaction, eventBroadcaster?: TransactionEventBroadcaster): Promise<void>;
    execute<T extends QueryResult | EntityData<AnyEntity> | EntityData<AnyEntity>[] = EntityData<AnyEntity>[]>(queryOrKnex: string | Knex.QueryBuilder | Knex.Raw, params?: unknown[], method?: 'all' | 'get' | 'run', ctx?: Transaction, loggerContext?: LoggingOptions): Promise<T>;
    /**
     * Execute raw SQL queries from file
     */
    loadFile(path: string): Promise<void>;
    protected createKnexClient(type: string): Knex;
    protected getKnexOptions(type: string): Knex.Config;
    private getSql;
    /**
     * do not call `positionBindings` when there are no bindings - it was messing up with
     * already interpolated strings containing `?`, and escaping that was not enough to
     * support edge cases like `\\?` strings (as `positionBindings` was removing the `\\`)
     */
    private patchKnexClient;
    protected abstract transformRawResult<T>(res: any, method: 'all' | 'get' | 'run'): T;
}
