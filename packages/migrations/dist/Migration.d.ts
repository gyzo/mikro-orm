import type { Configuration, Transaction } from '@mikro-orm/core';
import type { AbstractSqlDriver, Knex, EntityManager } from '@mikro-orm/knex';
export type Query = string | Knex.QueryBuilder | Knex.Raw;
export declare abstract class Migration {
    protected readonly driver: AbstractSqlDriver;
    protected readonly config: Configuration;
    private readonly queries;
    protected ctx?: Transaction<Knex.Transaction>;
    private em?;
    constructor(driver: AbstractSqlDriver, config: Configuration);
    abstract up(): Promise<void> | void;
    down(): Promise<void> | void;
    isTransactional(): boolean;
    addSql(sql: Query): void;
    reset(): void;
    setTransactionContext(ctx: Transaction): void;
    /**
     * Executes a raw SQL query. Accepts a string SQL or a knex query builder instance.
     * The `params` parameter is respected only if you use string SQL in the first parameter.
     */
    execute(sql: Query, params?: unknown[]): Promise<import("@mikro-orm/core").EntityData<Partial<any>>[]>;
    getKnex(): Knex<any, any[]>;
    /**
     * Creates a cached `EntityManager` instance for this migration, which will respect
     * the current transaction context.
     */
    getEntityManager(): EntityManager;
    getQueries(): Query[];
}
