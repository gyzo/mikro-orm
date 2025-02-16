import { inspect } from 'node:util';
import type { Knex } from 'knex';
import { type AnyEntity, type ConnectionType, type Dictionary, type EntityData, type EntityKey, type EntityMetadata, type EntityName, type EntityProperty, type ExpandProperty, type FlushMode, type GroupOperator, type Loaded, LockMode, type LoggingOptions, type MetadataStorage, type ObjectQuery, PopulateHint, type PopulateOptions, type QBFilterQuery, type QBQueryOrderMap, QueryFlag, type QueryOrderMap, type QueryResult, RawQueryFragment, type RequiredEntityData } from '@mikro-orm/core';
import { JoinType, QueryType } from './enums';
import type { AbstractSqlDriver } from '../AbstractSqlDriver';
import { type Alias, QueryBuilderHelper } from './QueryBuilderHelper';
import type { SqlEntityManager } from '../SqlEntityManager';
import type { Field, ICriteriaNodeProcessOptions, JoinOptions } from '../typings';
import type { AbstractSqlPlatform } from '../AbstractSqlPlatform';
export interface ExecuteOptions {
    mapResults?: boolean;
    mergeResults?: boolean;
}
type AnyString = string & {};
type Compute<T> = {
    [K in keyof T]: T[K];
} & {};
type IsNever<T, True = true, False = false> = [T] extends [never] ? True : False;
type GetAlias<T extends string> = T extends `${infer A}.${string}` ? A : never;
type GetPropName<T extends string> = T extends `${string}.${infer P}` ? P : T;
type AppendToHint<Parent extends string, Child extends string> = `${Parent}.${Child}`;
type AddToContext<Type extends object, Context, Field extends string, Alias extends string, Select extends boolean> = {
    [K in Alias]: [GetPath<Context, Field>, K, ExpandProperty<Type[GetPropName<Field> & keyof Type]>, Select];
};
type GetPath<Context, Field extends string> = GetAlias<Field> extends infer Alias ? IsNever<Alias> extends true ? GetPropName<Field> : Alias extends keyof Context ? Context[Alias] extends [infer Path, ...any[]] ? AppendToHint<Path & string, GetPropName<Field>> : GetPropName<Field> : GetPropName<Field> : GetPropName<Field>;
type GetType<Type extends object, Context, Field extends string> = GetAlias<Field> extends infer Alias ? IsNever<Alias> extends true ? Type : Alias extends keyof Context ? Context[Alias] extends [string, string, infer PropType] ? PropType & object : Type : Type : Type;
type AddToHint<RootAlias, Context, Field extends string, Select extends boolean = false> = Select extends true ? GetAlias<Field> extends infer Alias ? IsNever<Alias> extends true ? GetPropName<Field> : Alias extends RootAlias ? GetPropName<Field> : Alias extends keyof Context ? Context[Alias] extends [infer Path, ...any[]] ? AppendToHint<Path & string, GetPropName<Field>> : GetPropName<Field> : GetPropName<Field> : GetPropName<Field> : never;
export type ModifyHint<RootAlias, Context, Hint extends string, Field extends string, Select extends boolean = false> = Hint | AddToHint<RootAlias, Context, Field, Select>;
export type ModifyContext<Entity extends object, Context, Field extends string, Alias extends string, Select extends boolean = false> = Compute<IsNever<Context> extends true ? AddToContext<GetType<Entity, object, Field>, object, Field, Alias, Select> : Context & AddToContext<GetType<Entity, Context, Field>, Context, Field, Alias, Select>>;
type EntityRelations<T> = EntityKey<T, true>;
type AddAliasesFromContext<Context> = Context[keyof Context] extends infer Join ? Join extends any ? Join extends [string, infer Alias, infer Type, any] ? `${Alias & string}.${EntityRelations<Type & {}>}` : never : never : never;
export type QBField<Entity, RootAlias extends string, Context> = (EntityRelations<Entity> | `${RootAlias}.${EntityRelations<Entity>}` | AddAliasesFromContext<Context>) & {} | AnyString;
export type QBField2<Entity, RootAlias extends string, Context> = (EntityKey<Entity> | `${RootAlias}.${EntityKey<Entity>}` | AddAliasesFromContext<Context>) & {} | AnyString;
type EntityKeyOrString<Entity extends object = AnyEntity> = AnyString | keyof Entity;
/**
 * SQL query builder with fluent interface.
 *
 * ```ts
 * const qb = orm.em.createQueryBuilder(Publisher);
 * qb.select('*')
 *   .where({
 *     name: 'test 123',
 *     type: PublisherType.GLOBAL,
 *   })
 *   .orderBy({
 *     name: QueryOrder.DESC,
 *     type: QueryOrder.ASC,
 *   })
 *   .limit(2, 1);
 *
 * const publisher = await qb.getSingleResult();
 * ```
 */
export declare class QueryBuilder<Entity extends object = AnyEntity, RootAlias extends string = never, Hint extends string = never, Context extends object = never> {
    protected readonly metadata: MetadataStorage;
    protected readonly driver: AbstractSqlDriver;
    protected readonly context?: Knex.Transaction | undefined;
    protected connectionType?: ConnectionType | undefined;
    protected em?: SqlEntityManager | undefined;
    protected loggerContext?: (LoggingOptions & Dictionary) | undefined;
    get mainAlias(): Alias<Entity>;
    get alias(): string;
    get helper(): QueryBuilderHelper;
    /** @internal */
    type?: QueryType;
    /** @internal */
    _fields?: Field<Entity>[];
    /** @internal */
    _populate: PopulateOptions<Entity>[];
    /** @internal */
    _populateWhere?: ObjectQuery<Entity> | PopulateHint | `${PopulateHint}`;
    /** @internal */
    _populateFilter?: ObjectQuery<Entity> | PopulateHint | `${PopulateHint}`;
    /** @internal */
    __populateWhere?: ObjectQuery<Entity> | PopulateHint | `${PopulateHint}`;
    /** @internal */
    _populateMap: Dictionary<string>;
    /** @internal */
    readonly rawFragments: Set<string>;
    protected aliasCounter: number;
    protected flags: Set<QueryFlag>;
    protected finalized: boolean;
    protected populateHintFinalized: boolean;
    protected _joins: Dictionary<JoinOptions>;
    protected _explicitAlias: boolean;
    protected _schema?: string;
    protected _cond: Dictionary;
    protected _data: Dictionary;
    protected _orderBy: QueryOrderMap<Entity>[];
    protected _groupBy: Field<Entity>[];
    protected _having: Dictionary;
    protected _returning?: Field<Entity>[];
    protected _onConflict?: {
        fields: string[] | RawQueryFragment;
        ignore?: boolean;
        merge?: EntityData<Entity> | Field<Entity>[];
        where?: QBFilterQuery<Entity>;
    }[];
    protected _limit?: number;
    protected _offset?: number;
    protected _distinctOn?: string[];
    protected _joinedProps: Map<string, PopulateOptions<any>>;
    protected _cache?: boolean | number | [string, number];
    protected _indexHint?: string;
    protected _comments: string[];
    protected _hintComments: string[];
    protected flushMode?: FlushMode;
    protected lockMode?: LockMode;
    protected lockTables?: string[];
    protected subQueries: Dictionary<string>;
    protected _mainAlias?: Alias<Entity>;
    protected _aliases: Dictionary<Alias<any>>;
    protected _helper?: QueryBuilderHelper;
    protected _query?: {
        sql?: string;
        _sql?: Knex.Sql;
        params?: readonly unknown[];
        qb: Knex.QueryBuilder<Entity>;
    };
    protected readonly platform: AbstractSqlPlatform;
    protected readonly knex: Knex;
    /**
     * @internal
     */
    constructor(entityName: EntityName<Entity> | QueryBuilder<Entity, any, any>, metadata: MetadataStorage, driver: AbstractSqlDriver, context?: Knex.Transaction | undefined, alias?: string, connectionType?: ConnectionType | undefined, em?: SqlEntityManager | undefined, loggerContext?: (LoggingOptions & Dictionary) | undefined);
    select(fields: Field<Entity> | Field<Entity>[], distinct?: boolean): SelectQueryBuilder<Entity, RootAlias, Hint, Context>;
    addSelect(fields: Field<Entity> | Field<Entity>[]): SelectQueryBuilder<Entity, RootAlias, Hint, Context>;
    distinct(): SelectQueryBuilder<Entity, RootAlias, Hint, Context>;
    /** postgres only */
    distinctOn(fields: EntityKeyOrString<Entity> | EntityKeyOrString<Entity>[]): SelectQueryBuilder<Entity, RootAlias, Hint, Context>;
    insert(data: RequiredEntityData<Entity> | RequiredEntityData<Entity>[]): InsertQueryBuilder<Entity>;
    update(data: EntityData<Entity>): UpdateQueryBuilder<Entity>;
    delete(cond?: QBFilterQuery): DeleteQueryBuilder<Entity>;
    truncate(): TruncateQueryBuilder<Entity>;
    count(field?: EntityKeyOrString<Entity> | EntityKeyOrString<Entity>[], distinct?: boolean): CountQueryBuilder<Entity>;
    join<Field extends QBField<Entity, RootAlias, Context>, Alias extends string>(field: Field | Knex.QueryBuilder | QueryBuilder<any>, alias: Alias, cond?: QBFilterQuery, type?: JoinType, path?: string, schema?: string): SelectQueryBuilder<Entity, RootAlias, ModifyHint<RootAlias, Context, Hint, Field> & {}, ModifyContext<Entity, Context, Field, Alias>>;
    innerJoin<Field extends QBField<Entity, RootAlias, Context>, Alias extends string>(field: Field | Knex.QueryBuilder | QueryBuilder<any>, alias: Alias, cond?: QBFilterQuery, schema?: string): SelectQueryBuilder<Entity, RootAlias, ModifyHint<RootAlias, Context, Hint, Field> & {}, ModifyContext<Entity, Context, Field, Alias>>;
    innerJoinLateral(field: Knex.QueryBuilder | QueryBuilder<any>, alias: string, cond?: QBFilterQuery, schema?: string): this;
    leftJoin<Field extends QBField<Entity, RootAlias, Context>, Alias extends string>(field: Field | Knex.QueryBuilder | QueryBuilder<any>, alias: Alias, cond?: QBFilterQuery, schema?: string): SelectQueryBuilder<Entity, RootAlias, ModifyHint<RootAlias, Context, Hint, Field> & {}, ModifyContext<Entity, Context, Field, Alias>>;
    leftJoinLateral(field: Knex.QueryBuilder | QueryBuilder<any>, alias: string, cond?: QBFilterQuery, schema?: string): this;
    joinAndSelect<Field extends QBField<Entity, RootAlias, Context>, Alias extends string>(field: Field | [field: Field, qb: Knex.QueryBuilder | QueryBuilder<any>], alias: Alias, cond?: QBFilterQuery, type?: JoinType, path?: string, fields?: string[], schema?: string): SelectQueryBuilder<Entity, RootAlias, ModifyHint<RootAlias, Context, Hint, Field, true> & {}, ModifyContext<Entity, Context, Field, Alias, true>>;
    leftJoinAndSelect<Field extends QBField<Entity, RootAlias, Context>, Alias extends string>(field: Field | [field: Field, qb: Knex.QueryBuilder | QueryBuilder<any>], alias: Alias, cond?: QBFilterQuery, fields?: string[], schema?: string): SelectQueryBuilder<Entity, RootAlias, ModifyHint<RootAlias, Context, Hint, Field, true> & {}, ModifyContext<Entity, Context, Field, Alias, true>>;
    leftJoinLateralAndSelect<Field extends QBField<Entity, RootAlias, Context>, Alias extends string>(field: [field: Field, qb: Knex.QueryBuilder | QueryBuilder<any>], alias: Alias, cond?: QBFilterQuery, fields?: string[], schema?: string): SelectQueryBuilder<Entity, RootAlias, ModifyHint<RootAlias, Context, Hint, Field, true> & {}, ModifyContext<Entity, Context, Field, Alias, true>>;
    innerJoinAndSelect<Field extends QBField<Entity, RootAlias, Context>, Alias extends string>(field: Field | [field: Field, qb: Knex.QueryBuilder | QueryBuilder<any>], alias: Alias, cond?: QBFilterQuery, fields?: string[], schema?: string): SelectQueryBuilder<Entity, RootAlias, ModifyHint<RootAlias, Context, Hint, Field, true> & {}, ModifyContext<Entity, Context, Field, Alias, true>>;
    innerJoinLateralAndSelect<Field extends QBField<Entity, RootAlias, Context>, Alias extends string>(field: [field: Field, qb: Knex.QueryBuilder | QueryBuilder<any>], alias: Alias, cond?: QBFilterQuery, fields?: string[], schema?: string): SelectQueryBuilder<Entity, RootAlias, ModifyHint<RootAlias, Context, Hint, Field, true> & {}, ModifyContext<Entity, Context, Field, Alias, true>>;
    protected getFieldsForJoinedLoad(prop: EntityProperty<Entity>, alias: string, explicitFields?: string[]): Field<Entity>[];
    /**
     * Apply filters to the QB where condition.
     */
    applyFilters(filterOptions?: Dictionary<boolean | Dictionary> | string[] | boolean): Promise<void>;
    withSubQuery(subQuery: Knex.QueryBuilder, alias: string): this;
    where(cond: QBFilterQuery<Entity>, operator?: keyof typeof GroupOperator): this;
    where(cond: string, params?: any[], operator?: keyof typeof GroupOperator): this;
    andWhere(cond: QBFilterQuery<Entity>): this;
    andWhere(cond: string, params?: any[]): this;
    orWhere(cond: QBFilterQuery<Entity>): this;
    orWhere(cond: string, params?: any[]): this;
    orderBy(orderBy: QBQueryOrderMap<Entity> | QBQueryOrderMap<Entity>[]): SelectQueryBuilder<Entity, RootAlias, Hint, Context>;
    groupBy(fields: EntityKeyOrString<Entity> | readonly EntityKeyOrString<Entity>[]): SelectQueryBuilder<Entity, RootAlias, Hint, Context>;
    having(cond?: QBFilterQuery | string, params?: any[], operator?: keyof typeof GroupOperator): SelectQueryBuilder<Entity, RootAlias, Hint, Context>;
    andHaving(cond?: QBFilterQuery | string, params?: any[]): SelectQueryBuilder<Entity, RootAlias, Hint, Context>;
    orHaving(cond?: QBFilterQuery | string, params?: any[]): SelectQueryBuilder<Entity, RootAlias, Hint, Context>;
    onConflict(fields?: Field<Entity> | Field<Entity>[]): InsertQueryBuilder<Entity>;
    ignore(): this;
    merge(data?: EntityData<Entity> | Field<Entity>[]): this;
    returning(fields?: Field<Entity> | Field<Entity>[]): this;
    /**
     * @internal
     */
    populate(populate: PopulateOptions<Entity>[], populateWhere?: ObjectQuery<Entity> | PopulateHint | `${PopulateHint}`, populateFilter?: ObjectQuery<Entity> | PopulateHint | `${PopulateHint}`): this;
    limit(limit?: number, offset?: number): SelectQueryBuilder<Entity, RootAlias, Hint, Context>;
    offset(offset?: number): SelectQueryBuilder<Entity, RootAlias, Hint, Context>;
    withSchema(schema?: string): this;
    setLockMode(mode?: LockMode, tables?: string[]): this;
    setFlushMode(flushMode?: FlushMode): this;
    setFlag(flag: QueryFlag): this;
    unsetFlag(flag: QueryFlag): this;
    hasFlag(flag: QueryFlag): boolean;
    cache(config?: boolean | number | [string, number]): this;
    /**
     * Adds index hint to the FROM clause.
     */
    indexHint(sql: string): this;
    /**
     * Prepend comment to the sql query using the syntax `/* ... *&#8205;/`. Some characters are forbidden such as `/*, *&#8205;/` and `?`.
     */
    comment(comment: string | string[]): this;
    /**
     * Add hints to the query using comment-like syntax `/*+ ... *&#8205;/`. MySQL and Oracle use this syntax for optimizer hints.
     * Also various DB proxies and routers use this syntax to pass hints to alter their behavior. In other dialects the hints
     * are ignored as simple comments.
     */
    hintComment(comment: string | string[]): this;
    /**
     * Specifies FROM which entity's table select/update/delete will be executed, removing all previously set FROM-s.
     * Allows setting a main string alias of the selection data.
     */
    from<Entity extends AnyEntity<Entity> = AnyEntity>(target: QueryBuilder<Entity>, aliasName?: string): SelectQueryBuilder<Entity, RootAlias, Hint, Context>;
    from<Entity extends AnyEntity<Entity> = AnyEntity>(target: EntityName<Entity>): SelectQueryBuilder<Entity, RootAlias, Hint, Context>;
    getKnexQuery(processVirtualEntity?: boolean): Knex.QueryBuilder;
    /**
     * @internal
     */
    clearRawFragmentsCache(): void;
    /**
     * Returns the query with parameters as wildcards.
     */
    getQuery(): string;
    toQuery(): {
        sql: string;
        _sql: Knex.Sql;
        params: readonly unknown[];
    };
    /**
     * Returns the list of all parameters for this query.
     */
    getParams(): readonly Knex.Value[];
    /**
     * Returns raw interpolated query string with all the parameters inlined.
     */
    getFormattedQuery(): string;
    /**
     * @internal
     */
    getAliasForJoinPath(path?: string | JoinOptions, options?: ICriteriaNodeProcessOptions): string | undefined;
    /**
     * @internal
     */
    getJoinForPath(path: string, options?: ICriteriaNodeProcessOptions): JoinOptions | undefined;
    /**
     * @internal
     */
    getNextAlias(entityName?: string): string;
    /**
     * @internal
     */
    getAliasMap(): Dictionary<string>;
    /**
     * Executes this QB and returns the raw results, mapped to the property names (unless disabled via last parameter).
     * Use `method` to specify what kind of result you want to get (array/single/meta).
     */
    execute<U = any>(method?: 'all' | 'get' | 'run', options?: ExecuteOptions | boolean): Promise<U>;
    /**
     * Alias for `qb.getResultList()`
     */
    getResult(): Promise<Loaded<Entity, Hint>[]>;
    /**
     * Executes the query, returning array of results
     */
    getResultList(limit?: number): Promise<Loaded<Entity, Hint>[]>;
    /**
     * Executes the query, returning the first result or null
     */
    getSingleResult(): Promise<Entity | null>;
    /**
     * Executes count query (without offset and limit), returning total count of results
     */
    getCount(field?: EntityKeyOrString<Entity> | EntityKeyOrString<Entity>[], distinct?: boolean): Promise<number>;
    /**
     * Executes the query, returning both array of results and total count query (without offset and limit).
     */
    getResultAndCount(): Promise<[Entity[], number]>;
    /**
     * Provides promise-like interface so we can await the QB instance.
     */
    then<TResult1 = any, TResult2 = never>(onfulfilled?: ((value: any) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): Promise<Loaded<Entity, Hint>[] | number | QueryResult<Entity>>;
    /**
     * Returns knex instance with sub-query aliased with given alias.
     * You can provide `EntityName.propName` as alias, then the field name will be used based on the metadata
     */
    as(alias: string): Knex.QueryBuilder;
    clone(reset?: boolean | string[]): QueryBuilder<Entity>;
    getKnex(processVirtualEntity?: boolean): Knex.QueryBuilder;
    /**
     * Sets logger context for this query builder.
     */
    setLoggerContext(context: LoggingOptions & Dictionary): void;
    /**
     * Gets logger context for this query builder.
     */
    getLoggerContext<T extends Dictionary & LoggingOptions = Dictionary>(): T;
    private fromVirtual;
    private joinReference;
    protected prepareFields<T, U extends string | Knex.Raw>(fields: Field<T>[], type?: 'where' | 'groupBy' | 'sub-query'): U[];
    private init;
    private getQueryBase;
    private applyDiscriminatorCondition;
    private finalize;
    /** @internal */
    processPopulateHint(): void;
    private processPopulateWhere;
    private mergeOnConditions;
    private hasToManyJoins;
    protected wrapPaginateSubQuery(meta: EntityMetadata): void;
    private wrapModifySubQuery;
    private getSchema;
    private createAlias;
    private createMainAlias;
    private fromSubQuery;
    private fromEntityName;
    private createQueryBuilderHelper;
    private ensureFromClause;
    private ensureNotFinalized;
    /** @ignore */
    [inspect.custom](depth?: number): string;
}
export interface RunQueryBuilder<Entity extends object> extends Omit<QueryBuilder<Entity, any, any>, 'getResult' | 'getSingleResult' | 'getResultList' | 'where'> {
    where(cond: QBFilterQuery<Entity> | string, params?: keyof typeof GroupOperator | any[], operator?: keyof typeof GroupOperator): this;
    execute<Result = QueryResult<Entity>>(method?: 'all' | 'get' | 'run', mapResults?: boolean): Promise<Result>;
    then<TResult1 = QueryResult<Entity>, TResult2 = never>(onfulfilled?: ((value: QueryResult<Entity>) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): Promise<QueryResult<Entity>>;
}
export interface SelectQueryBuilder<Entity extends object = AnyEntity, RootAlias extends string = never, Hint extends string = never, Context extends object = never> extends QueryBuilder<Entity, RootAlias, Hint, Context> {
    execute<Result = Entity[]>(method?: 'all' | 'get' | 'run', mapResults?: boolean): Promise<Result>;
    execute<Result = Entity[]>(method: 'all', mapResults?: boolean): Promise<Result>;
    execute<Result = Entity>(method: 'get', mapResults?: boolean): Promise<Result>;
    execute<Result = QueryResult<Entity>>(method: 'run', mapResults?: boolean): Promise<Result>;
    then<TResult1 = Entity[], TResult2 = never>(onfulfilled?: ((value: Loaded<Entity, Hint>[]) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): Promise<Loaded<Entity, Hint>[]>;
}
export interface CountQueryBuilder<Entity extends object> extends QueryBuilder<Entity, any, any> {
    execute<Result = {
        count: number;
    }[]>(method?: 'all' | 'get' | 'run', mapResults?: boolean): Promise<Result>;
    execute<Result = {
        count: number;
    }[]>(method: 'all', mapResults?: boolean): Promise<Result>;
    execute<Result = {
        count: number;
    }>(method: 'get', mapResults?: boolean): Promise<Result>;
    execute<Result = QueryResult<{
        count: number;
    }>>(method: 'run', mapResults?: boolean): Promise<Result>;
    then<TResult1 = number, TResult2 = never>(onfulfilled?: ((value: number) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): Promise<number>;
}
export interface InsertQueryBuilder<T extends object> extends RunQueryBuilder<T> {
}
export interface UpdateQueryBuilder<T extends object> extends RunQueryBuilder<T> {
}
export interface DeleteQueryBuilder<T extends object> extends RunQueryBuilder<T> {
}
export interface TruncateQueryBuilder<T extends object> extends RunQueryBuilder<T> {
}
export {};
