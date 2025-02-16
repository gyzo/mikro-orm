import { MongoClient, type ClientSession, type Collection, type Db, type MongoClientOptions, type TransactionOptions } from 'mongodb';
import { Connection, type AnyEntity, type Configuration, type ConnectionConfig, type ConnectionOptions, type ConnectionType, type EntityData, type EntityName, type FilterQuery, type IsolationLevel, type QueryOrderMap, type QueryResult, type Transaction, type TransactionEventBroadcaster, type UpsertOptions, type UpsertManyOptions, type LoggingOptions } from '@mikro-orm/core';
export declare class MongoConnection extends Connection {
    protected client: MongoClient;
    protected db: Db;
    constructor(config: Configuration, options?: ConnectionOptions, type?: ConnectionType);
    connect(): Promise<void>;
    close(force?: boolean): Promise<void>;
    isConnected(): Promise<boolean>;
    checkConnection(): Promise<{
        ok: true;
    } | {
        ok: false;
        reason: string;
        error?: Error;
    }>;
    getClient(): MongoClient;
    getCollection<T extends object>(name: EntityName<T>): Collection<T>;
    createCollection<T extends object>(name: EntityName<T>): Promise<Collection<T>>;
    listCollections(): Promise<string[]>;
    dropCollection(name: EntityName<AnyEntity>): Promise<boolean>;
    getDefaultClientUrl(): string;
    getConnectionOptions(): MongoClientOptions & ConnectionConfig;
    getClientUrl(): string;
    getDb(): Db;
    execute(query: string): Promise<any>;
    find<T extends object>(collection: string, where: FilterQuery<T>, orderBy?: QueryOrderMap<T> | QueryOrderMap<T>[], limit?: number, offset?: number, fields?: string[], ctx?: Transaction<ClientSession>, loggerContext?: LoggingOptions): Promise<EntityData<T>[]>;
    insertOne<T extends object>(collection: string, data: Partial<T>, ctx?: Transaction<ClientSession>): Promise<QueryResult<T>>;
    insertMany<T extends object>(collection: string, data: Partial<T>[], ctx?: Transaction<ClientSession>): Promise<QueryResult<T>>;
    updateMany<T extends object>(collection: string, where: FilterQuery<T>, data: Partial<T>, ctx?: Transaction<ClientSession>, upsert?: boolean, upsertOptions?: UpsertOptions<T>): Promise<QueryResult<T>>;
    bulkUpdateMany<T extends object>(collection: string, where: FilterQuery<T>[], data: Partial<T>[], ctx?: Transaction<ClientSession>, upsert?: boolean, upsertOptions?: UpsertManyOptions<T>): Promise<QueryResult<T>>;
    deleteMany<T extends object>(collection: string, where: FilterQuery<T>, ctx?: Transaction<ClientSession>): Promise<QueryResult<T>>;
    aggregate<T extends object = any>(collection: string, pipeline: any[], ctx?: Transaction<ClientSession>, loggerContext?: LoggingOptions): Promise<T[]>;
    countDocuments<T extends object>(collection: string, where: FilterQuery<T>, ctx?: Transaction<ClientSession>): Promise<number>;
    transactional<T>(cb: (trx: Transaction<ClientSession>) => Promise<T>, options?: {
        isolationLevel?: IsolationLevel;
        ctx?: Transaction<ClientSession>;
        eventBroadcaster?: TransactionEventBroadcaster;
    } & TransactionOptions): Promise<T>;
    begin(options?: {
        isolationLevel?: IsolationLevel;
        ctx?: ClientSession;
        eventBroadcaster?: TransactionEventBroadcaster;
    } & TransactionOptions): Promise<ClientSession>;
    commit(ctx: ClientSession, eventBroadcaster?: TransactionEventBroadcaster): Promise<void>;
    rollback(ctx: ClientSession, eventBroadcaster?: TransactionEventBroadcaster): Promise<void>;
    private runQuery;
    private rethrow;
    private createUpdatePayload;
    private transformResult;
    private getCollectionName;
    private logObject;
}
