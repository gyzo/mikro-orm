import type { Configuration, Transaction, EntityName } from '@mikro-orm/core';
import type { MongoDriver } from '@mikro-orm/mongodb';
import type { Collection, ClientSession, Document } from 'mongodb';
export declare abstract class Migration {
    protected readonly driver: MongoDriver;
    protected readonly config: Configuration;
    protected ctx?: Transaction<ClientSession>;
    constructor(driver: MongoDriver, config: Configuration);
    abstract up(): Promise<void>;
    down(): Promise<void>;
    isTransactional(): boolean;
    reset(): void;
    setTransactionContext(ctx: Transaction): void;
    getCollection<T extends Document>(entityName: EntityName<any>): Collection<T>;
}
