import { AbstractSqlConnection, type IsolationLevel, type Knex, type TransactionEventBroadcaster } from '@mikro-orm/knex';
export declare class MsSqlConnection extends AbstractSqlConnection {
    createKnex(): void;
    getDefaultClientUrl(): string;
    getConnectionOptions(): Knex.MsSqlConnectionConfig;
    begin(options?: {
        isolationLevel?: IsolationLevel;
        ctx?: Knex.Transaction;
        eventBroadcaster?: TransactionEventBroadcaster;
    }): Promise<Knex.Transaction>;
    commit(ctx: Knex.Transaction, eventBroadcaster?: TransactionEventBroadcaster): Promise<void>;
    rollback(ctx: Knex.Transaction, eventBroadcaster?: TransactionEventBroadcaster): Promise<void>;
    protected transformRawResult<T>(res: any, method: 'all' | 'get' | 'run'): T;
}
