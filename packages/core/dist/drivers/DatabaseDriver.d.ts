import { type CountOptions, type DeleteOptions, type DriverMethodOptions, EntityManagerType, type FindOneOptions, type FindOptions, type IDatabaseDriver, type LockOptions, type NativeInsertUpdateManyOptions, type NativeInsertUpdateOptions, type OrderDefinition } from './IDatabaseDriver';
import type { ConnectionType, Dictionary, EntityData, EntityDictionary, EntityMetadata, EntityProperty, FilterQuery, PopulateOptions, Primary } from '../typings';
import type { MetadataStorage } from '../metadata';
import type { Connection, QueryResult, Transaction } from '../connections';
import { type Configuration, type ConnectionOptions, EntityComparator } from '../utils';
import { type QueryOrder } from '../enums';
import type { Platform } from '../platforms';
import type { Collection } from '../entity/Collection';
import { EntityManager } from '../EntityManager';
import { DriverException } from '../exceptions';
import type { Logger } from '../logging/Logger';
export declare abstract class DatabaseDriver<C extends Connection> implements IDatabaseDriver<C> {
    readonly config: Configuration;
    protected readonly dependencies: string[];
    [EntityManagerType]: EntityManager<this>;
    protected readonly connection: C;
    protected readonly replicas: C[];
    protected readonly platform: Platform;
    protected readonly logger: Logger;
    protected comparator: EntityComparator;
    protected metadata: MetadataStorage;
    protected constructor(config: Configuration, dependencies: string[]);
    abstract find<T extends object, P extends string = never, F extends string = '*', E extends string = never>(entityName: string, where: FilterQuery<T>, options?: FindOptions<T, P, F, E>): Promise<EntityData<T>[]>;
    abstract findOne<T extends object, P extends string = never, F extends string = '*', E extends string = never>(entityName: string, where: FilterQuery<T>, options?: FindOneOptions<T, P, F, E>): Promise<EntityData<T> | null>;
    abstract nativeInsert<T extends object>(entityName: string, data: EntityDictionary<T>, options?: NativeInsertUpdateOptions<T>): Promise<QueryResult<T>>;
    abstract nativeInsertMany<T extends object>(entityName: string, data: EntityDictionary<T>[], options?: NativeInsertUpdateManyOptions<T>, transform?: (sql: string) => string): Promise<QueryResult<T>>;
    abstract nativeUpdate<T extends object>(entityName: string, where: FilterQuery<T>, data: EntityDictionary<T>, options?: NativeInsertUpdateOptions<T>): Promise<QueryResult<T>>;
    nativeUpdateMany<T extends object>(entityName: string, where: FilterQuery<T>[], data: EntityDictionary<T>[], options?: NativeInsertUpdateManyOptions<T>): Promise<QueryResult<T>>;
    abstract nativeDelete<T extends object>(entityName: string, where: FilterQuery<T>, options?: DeleteOptions<T>): Promise<QueryResult<T>>;
    abstract count<T extends object, P extends string = never>(entityName: string, where: FilterQuery<T>, options?: CountOptions<T, P>): Promise<number>;
    createEntityManager<D extends IDatabaseDriver = IDatabaseDriver>(useContext?: boolean): D[typeof EntityManagerType];
    findVirtual<T extends object>(entityName: string, where: FilterQuery<T>, options: FindOptions<T, any, any, any>): Promise<EntityData<T>[]>;
    countVirtual<T extends object>(entityName: string, where: FilterQuery<T>, options: CountOptions<T, any>): Promise<number>;
    aggregate(entityName: string, pipeline: any[]): Promise<any[]>;
    loadFromPivotTable<T extends object, O extends object>(prop: EntityProperty, owners: Primary<O>[][], where?: FilterQuery<any>, orderBy?: OrderDefinition<T>, ctx?: Transaction, options?: FindOptions<T, any, any, any>, pivotJoin?: boolean): Promise<Dictionary<T[]>>;
    syncCollections<T extends object, O extends object>(collections: Iterable<Collection<T, O>>, options?: DriverMethodOptions): Promise<void>;
    mapResult<T extends object>(result: EntityDictionary<T>, meta?: EntityMetadata<T>, populate?: PopulateOptions<T>[]): EntityData<T> | null;
    connect(): Promise<C>;
    reconnect(): Promise<C>;
    getConnection(type?: ConnectionType): C;
    close(force?: boolean): Promise<void>;
    getPlatform(): Platform;
    setMetadata(metadata: MetadataStorage): void;
    getMetadata(): MetadataStorage;
    getDependencies(): string[];
    protected processCursorOptions<T extends object, P extends string>(meta: EntityMetadata<T>, options: FindOptions<T, P, any, any>, orderBy: OrderDefinition<T>): {
        orderBy: OrderDefinition<T>[];
        where: FilterQuery<T>;
    };
    protected createCursorCondition<T extends object>(definition: (readonly [keyof T & string, QueryOrder])[], offsets: Dictionary[], inverse: boolean, meta: EntityMetadata<T>): FilterQuery<T>;
    /** @internal */
    mapDataToFieldNames(data: Dictionary, stringifyJsonArrays: boolean, properties?: Record<string, EntityProperty>, convertCustomTypes?: boolean, object?: boolean): Dictionary;
    protected inlineEmbeddables<T extends object>(meta: EntityMetadata<T>, data: T, where?: boolean): void;
    protected getPrimaryKeyFields(entityName: string): string[];
    protected createReplicas(cb: (c: ConnectionOptions) => C): C[];
    lockPessimistic<T extends object>(entity: T, options: LockOptions): Promise<void>;
    /**
     * @inheritDoc
     */
    convertException(exception: Error): DriverException;
    protected rethrow<T>(promise: Promise<T>): Promise<T>;
    /**
     * @internal
     */
    getTableName<T>(meta: EntityMetadata<T>, options: NativeInsertUpdateManyOptions<T>, quote?: boolean): string;
    /**
     * @internal
     */
    getSchemaName(meta?: EntityMetadata, options?: {
        schema?: string;
    }): string | undefined;
}
