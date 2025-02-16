import type { Knex } from 'knex';
import { type AnyEntity, type Collection, type Configuration, type ConnectionType, type Constructor, type CountOptions, DatabaseDriver, type DeleteOptions, type Dictionary, type DriverMethodOptions, type EntityData, type EntityDictionary, type EntityField, EntityManagerType, type EntityMetadata, type EntityName, type EntityProperty, type FilterQuery, type FindOneOptions, type FindOptions, type IDatabaseDriver, type LockOptions, type LoggingOptions, type NativeInsertUpdateManyOptions, type NativeInsertUpdateOptions, type ObjectQuery, type Options, type OrderDefinition, type PopulateOptions, type PopulatePath, type Primary, type QueryOrderMap, type QueryResult, type Transaction, type UpsertManyOptions, type UpsertOptions } from '@mikro-orm/core';
import type { AbstractSqlConnection } from './AbstractSqlConnection';
import type { AbstractSqlPlatform } from './AbstractSqlPlatform';
import { QueryBuilder, QueryType } from './query';
import { SqlEntityManager } from './SqlEntityManager';
import type { Field } from './typings';
export declare abstract class AbstractSqlDriver<Connection extends AbstractSqlConnection = AbstractSqlConnection, Platform extends AbstractSqlPlatform = AbstractSqlPlatform> extends DatabaseDriver<Connection> {
    [EntityManagerType]: SqlEntityManager<this>;
    protected readonly connection: Connection;
    protected readonly replicas: Connection[];
    protected readonly platform: Platform;
    protected constructor(config: Configuration, platform: Platform, connection: Constructor<Connection>, connector: string[]);
    getPlatform(): Platform;
    createEntityManager<D extends IDatabaseDriver = IDatabaseDriver>(useContext?: boolean): D[typeof EntityManagerType];
    find<T extends object, P extends string = never, F extends string = PopulatePath.ALL, E extends string = never>(entityName: string, where: FilterQuery<T>, options?: FindOptions<T, P, F, E>): Promise<EntityData<T>[]>;
    findOne<T extends object, P extends string = never, F extends string = PopulatePath.ALL, E extends string = never>(entityName: string, where: FilterQuery<T>, options?: FindOneOptions<T, P, F, E>): Promise<EntityData<T> | null>;
    protected hasToManyJoins<T extends object>(hint: PopulateOptions<T>, meta: EntityMetadata<T>): boolean;
    findVirtual<T extends object>(entityName: string, where: FilterQuery<T>, options: FindOptions<T, any, any, any>): Promise<EntityData<T>[]>;
    countVirtual<T extends object>(entityName: string, where: FilterQuery<T>, options: CountOptions<T, any>): Promise<number>;
    protected findFromVirtual<T extends object>(entityName: string, where: FilterQuery<T>, options: FindOptions<T, any> | CountOptions<T, any>, type: QueryType): Promise<EntityData<T>[] | number>;
    protected wrapVirtualExpressionInSubquery<T extends object>(meta: EntityMetadata<T>, expression: string, where: FilterQuery<T>, options: FindOptions<T, any>, type: QueryType): Promise<T[] | number>;
    mapResult<T extends object>(result: EntityData<T>, meta: EntityMetadata<T>, populate?: PopulateOptions<T>[], qb?: QueryBuilder<T, any, any, any>, map?: Dictionary): EntityData<T> | null;
    private mapJoinedProps;
    count<T extends object>(entityName: string, where: any, options?: CountOptions<T>): Promise<number>;
    nativeInsert<T extends object>(entityName: string, data: EntityDictionary<T>, options?: NativeInsertUpdateOptions<T>): Promise<QueryResult<T>>;
    nativeInsertMany<T extends object>(entityName: string, data: EntityDictionary<T>[], options?: NativeInsertUpdateManyOptions<T>, transform?: (sql: string) => string): Promise<QueryResult<T>>;
    nativeUpdate<T extends object>(entityName: string, where: FilterQuery<T>, data: EntityDictionary<T>, options?: NativeInsertUpdateOptions<T> & UpsertOptions<T>): Promise<QueryResult<T>>;
    nativeUpdateMany<T extends object>(entityName: string, where: FilterQuery<T>[], data: EntityDictionary<T>[], options?: NativeInsertUpdateManyOptions<T> & UpsertManyOptions<T>): Promise<QueryResult<T>>;
    nativeDelete<T extends object>(entityName: string, where: FilterQuery<T> | string | any, options?: DeleteOptions<T>): Promise<QueryResult<T>>;
    /**
     * Fast comparison for collection snapshots that are represented by PK arrays.
     * Compares scalars via `===` and fallbacks to Utils.equals()` for more complex types like Buffer.
     * Always expects the same length of the arrays, since we only compare PKs of the same entity type.
     */
    private comparePrimaryKeyArrays;
    syncCollections<T extends object, O extends object>(collections: Iterable<Collection<T, O>>, options?: DriverMethodOptions): Promise<void>;
    loadFromPivotTable<T extends object, O extends object>(prop: EntityProperty, owners: Primary<O>[][], where?: FilterQuery<any>, orderBy?: OrderDefinition<T>, ctx?: Transaction, options?: FindOptions<T, any, any, any>, pivotJoin?: boolean): Promise<Dictionary<T[]>>;
    private getPivotOrderBy;
    execute<T extends QueryResult | EntityData<AnyEntity> | EntityData<AnyEntity>[] = EntityData<AnyEntity>[]>(queryOrKnex: string | Knex.QueryBuilder | Knex.Raw, params?: any[], method?: 'all' | 'get' | 'run', ctx?: Transaction, loggerContext?: LoggingOptions): Promise<T>;
    /**
     * 1:1 owner side needs to be marked for population so QB auto-joins the owner id
     */
    protected autoJoinOneToOneOwner<T extends object>(meta: EntityMetadata<T>, populate: PopulateOptions<T>[], fields?: readonly EntityField<T, any>[]): PopulateOptions<T>[];
    /**
     * @internal
     */
    joinedProps<T>(meta: EntityMetadata, populate: PopulateOptions<T>[], options?: {
        strategy?: Options['loadStrategy'];
    }): PopulateOptions<T>[];
    /**
     * @internal
     */
    mergeJoinedResult<T extends object>(rawResults: EntityData<T>[], meta: EntityMetadata<T>, joinedProps: PopulateOptions<T>[]): EntityData<T>[];
    protected getFieldsForJoinedLoad<T extends object>(qb: QueryBuilder<T, any, any, any>, meta: EntityMetadata<T>, explicitFields?: Field<T>[], exclude?: Field<T>[], populate?: PopulateOptions<T>[], options?: {
        strategy?: Options['loadStrategy'];
        populateWhere?: FindOptions<any>['populateWhere'];
        populateFilter?: FindOptions<any>['populateFilter'];
    }, parentTableAlias?: string, parentJoinPath?: string, count?: boolean): Field<T>[];
    /**
     * @internal
     */
    mapPropToFieldNames<T extends object>(qb: QueryBuilder<T, any, any, any>, prop: EntityProperty<T>, tableAlias?: string): Field<T>[];
    /** @internal */
    createQueryBuilder<T extends object>(entityName: EntityName<T> | QueryBuilder<T, any, any, any>, ctx?: Transaction<Knex.Transaction>, preferredConnectionType?: ConnectionType, convertCustomTypes?: boolean, loggerContext?: LoggingOptions, alias?: string, em?: SqlEntityManager): QueryBuilder<T, any, any, any>;
    protected resolveConnectionType(args: {
        ctx?: Transaction<Knex.Transaction>;
        connectionType?: ConnectionType;
    }): ConnectionType;
    protected extractManyToMany<T>(entityName: string, data: EntityDictionary<T>): EntityData<T>;
    protected processManyToMany<T extends object>(meta: EntityMetadata<T> | undefined, pks: Primary<T>[], collections: EntityData<T>, clear: boolean, options?: DriverMethodOptions): Promise<void>;
    lockPessimistic<T extends object>(entity: T, options: LockOptions): Promise<void>;
    protected buildPopulateWhere<T extends object>(meta: EntityMetadata<T>, joinedProps: PopulateOptions<T>[], options: Pick<FindOptions<any>, 'populateWhere'>): ObjectQuery<T>;
    protected buildOrderBy<T extends object>(qb: QueryBuilder<T, any, any, any>, meta: EntityMetadata<T>, populate: PopulateOptions<T>[], options: Pick<FindOptions<any>, 'strategy' | 'orderBy' | 'populateOrderBy'>): QueryOrderMap<T>[];
    protected buildPopulateOrderBy<T extends object>(qb: QueryBuilder<T, any, any, any>, meta: EntityMetadata<T>, populateOrderBy: QueryOrderMap<T>[], parentPath: string, explicit: boolean, parentAlias?: string): QueryOrderMap<T>[];
    protected buildJoinedPropsOrderBy<T extends object>(qb: QueryBuilder<T, any, any, any>, meta: EntityMetadata<T>, populate: PopulateOptions<T>[], options?: Pick<FindOptions<any>, 'strategy' | 'orderBy' | 'populateOrderBy'>, parentPath?: string): QueryOrderMap<T>[];
    protected normalizeFields<T extends object>(fields: Field<T>[], prefix?: string): string[];
    protected processField<T extends object>(meta: EntityMetadata<T>, prop: EntityProperty<T> | undefined, field: string, ret: Field<T>[], populate: PopulateOptions<T>[], joinedProps: PopulateOptions<T>[], qb: QueryBuilder<T, any, any, any>): void;
    protected isPopulated<T extends object>(meta: EntityMetadata<T>, prop: EntityProperty<T>, hint: PopulateOptions<T>, name?: string): boolean;
    protected buildFields<T extends object>(meta: EntityMetadata<T>, populate: PopulateOptions<T>[], joinedProps: PopulateOptions<T>[], qb: QueryBuilder<T, any, any, any>, alias: string, options: Pick<FindOptions<T, any, any, any>, 'strategy' | 'fields' | 'exclude'>, count?: boolean): Field<T>[];
}
