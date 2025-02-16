import { type Configuration, type ConnectionOptions, type DynamicPassword } from '../utils';
import type { LogContext, Logger } from '../logging';
import type { MetadataStorage } from '../metadata';
import type { ConnectionType, Dictionary, MaybePromise, Primary } from '../typings';
import type { Platform } from '../platforms/Platform';
import type { TransactionEventBroadcaster } from '../events/TransactionEventBroadcaster';
import type { IsolationLevel } from '../enums';
export declare abstract class Connection {
    protected readonly config: Configuration;
    protected readonly type: ConnectionType;
    protected metadata: MetadataStorage;
    protected platform: Platform;
    protected readonly options: ConnectionOptions;
    protected readonly logger: Logger;
    protected connected: boolean;
    constructor(config: Configuration, options?: ConnectionOptions, type?: ConnectionType);
    /**
     * Establishes connection to database
     */
    abstract connect(): void | Promise<void>;
    /**
     * Are we connected to the database
     */
    abstract isConnected(): Promise<boolean>;
    /**
     * Are we connected to the database
     */
    abstract checkConnection(): Promise<{
        ok: true;
    } | {
        ok: false;
        reason: string;
        error?: Error;
    }>;
    /**
     * Closes the database connection (aka disconnect)
     */
    close(force?: boolean): Promise<void>;
    /**
     * Ensure the connection exists, this is used to support lazy connect when using `MikroORM.initSync()`
     */
    ensureConnection(): Promise<void>;
    /**
     * Returns default client url for given driver (e.g. mongodb://127.0.0.1:27017 for mongodb)
     */
    abstract getDefaultClientUrl(): string;
    transactional<T>(cb: (trx: Transaction) => Promise<T>, options?: {
        isolationLevel?: IsolationLevel;
        readOnly?: boolean;
        ctx?: Transaction;
        eventBroadcaster?: TransactionEventBroadcaster;
    }): Promise<T>;
    begin(options?: {
        isolationLevel?: IsolationLevel;
        readOnly?: boolean;
        ctx?: Transaction;
        eventBroadcaster?: TransactionEventBroadcaster;
    }): Promise<Transaction>;
    commit(ctx: Transaction, eventBroadcaster?: TransactionEventBroadcaster): Promise<void>;
    rollback(ctx: Transaction, eventBroadcaster?: TransactionEventBroadcaster): Promise<void>;
    abstract execute<T>(query: string, params?: any[], method?: 'all' | 'get' | 'run', ctx?: Transaction): Promise<QueryResult<T> | any | any[]>;
    getConnectionOptions(): ConnectionConfig;
    getClientUrl(): string;
    setMetadata(metadata: MetadataStorage): void;
    setPlatform(platform: Platform): void;
    getPlatform(): Platform;
    protected executeQuery<T>(query: string, cb: () => Promise<T>, context?: LogContext): Promise<T>;
    protected logQuery(query: string, context?: LogContext): void;
}
export interface QueryResult<T = {
    id: number;
}> {
    affectedRows: number;
    insertId: Primary<T>;
    row?: Dictionary;
    rows?: Dictionary[];
    insertedIds?: Primary<T>[];
}
export interface ConnectionConfig {
    host?: string;
    port?: number;
    user?: string;
    password?: string | (() => MaybePromise<string> | MaybePromise<DynamicPassword>);
    database?: string;
    schema?: string;
}
export type Transaction<T = any> = T;
