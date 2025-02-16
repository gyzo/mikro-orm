import type { EntityDTO, EntityKey, FilterQuery, Loaded, LoadedCollection, Populate } from "../typings";
import { ArrayCollection } from "./ArrayCollection";
import { Reference } from "./Reference";
import type { Transaction } from "../connections/Connection";
import type { FindOptions, CountOptions } from "../drivers/IDatabaseDriver";
import type { EntityLoaderOptions } from "./EntityLoader";
export interface MatchingOptions<T extends object, P extends string = never> extends FindOptions<T, P> {
    where?: FilterQuery<T>;
    store?: boolean;
    ctx?: Transaction;
}
export declare class Collection<T extends object, O extends object = object> extends ArrayCollection<T, O> {
    private cachedOptions;
    private inMemoryAdded;
    private readonly?;
    private _populated?;
    private _em?;
    private _snapshot?;
    constructor(owner: O, items?: T[], initialized?: boolean);
    /**
     * Creates new Collection instance, assigns it to the owning entity and sets the items to it (propagating them to their inverse sides)
     */
    static create<T extends object, O extends object = object>(owner: O, prop: EntityKey<O>, items: undefined | T[], initialized: boolean): Collection<T, O>;
    loadedItems<TT extends T, P extends string = never>(options?: InitCollectionOptions<TT, P>): Promise<Loaded<TT, P>[]>;
    private _add;
    /**
     * Ensures the collection is loaded first (without reloading it if it already is loaded).
     * Returns the Collection instance (itself), works the same as `Reference.load()`.
     */
    load<TT extends T, P extends string = never>(options?: InitCollectionOptions<TT, P>): Promise<LoadedCollection<Loaded<TT, P>>>;
    private setSerializationContext;
    /**
     * Initializes the collection and returns the items
     */
    loadItems<TT extends T, P extends string = never>(options?: InitCollectionOptions<TT, P>): Promise<Loaded<TT, P>[]>;
    /**
     * Gets the count of collection items from database instead of counting loaded items.
     * The value is cached (unless you use the `where` option), use `refresh: true` to force reload it.
     */
    loadCount(options?: LoadCountOptions<T> | boolean): Promise<number>;
    matching<TT extends T, P extends string = never>(options: MatchingOptions<T, P>): Promise<Loaded<TT, P>[]>;
    private sortObjectKeys;
    /**
     * Returns the items (the collection must be initialized)
     */
    getItems(check?: boolean): T[];
    toJSON<TT extends T>(): EntityDTO<TT>[];
    add<TT extends T>(entity: TT | Reference<TT> | Iterable<TT | Reference<TT>>, ...entities: (TT | Reference<TT>)[]): void;
    /**
     * @inheritDoc
     */
    remove<TT extends T>(entity: TT | Reference<TT> | Iterable<TT | Reference<TT>> | ((item: TT) => boolean), ...entities: (TT | Reference<TT>)[]): void;
    private _delete;
    contains<TT extends T>(item: TT | Reference<TT>, check?: boolean): boolean;
    count(): number;
    isEmpty(): boolean;
    /**
     * @inheritDoc
     */
    slice(start?: number, end?: number): T[];
    /**
     * @inheritDoc
     */
    exists(cb: (item: T) => boolean): boolean;
    /**
     * @inheritDoc
     */
    find(cb: (item: T, index: number) => boolean): T | undefined;
    /**
     * @inheritDoc
     */
    filter(cb: (item: T, index: number) => boolean): T[];
    /**
     * @inheritDoc
     */
    map<R>(mapper: (item: T, index: number) => R): R[];
    /**
     * @inheritDoc
     */
    indexBy<K1 extends keyof T, K2 extends keyof T = never>(key: K1): Record<T[K1] & PropertyKey, T>;
    /**
     * @inheritDoc
     */
    indexBy<K1 extends keyof T, K2 extends keyof T = never>(key: K1, valueKey: K2): Record<T[K1] & PropertyKey, T[K2]>;
    shouldPopulate(populated?: boolean): boolean;
    populated(populated?: boolean | undefined): void;
    init<TT extends T, P extends string = never>(options?: InitCollectionOptions<TT, P>): Promise<LoadedCollection<Loaded<TT, P>>>;
    private getEntityManager;
    private createCondition;
    private createOrderBy;
    private createManyToManyCondition;
    private createLoadCountCondition;
    private modify;
    private checkInitialized;
    /**
     * re-orders items after searching with `$in` operator
     */
    private reorderItems;
    private cancelOrphanRemoval;
    private validateItemType;
    private validateModification;
}
export interface InitCollectionOptions<T, P extends string = never, F extends string = "*", E extends string = never> extends EntityLoaderOptions<T, F, E> {
    dataloader?: boolean;
    populate?: Populate<T, P>;
    ref?: boolean;
}
export interface LoadCountOptions<T extends object> extends CountOptions<T, "*"> {
    refresh?: boolean;
    where?: FilterQuery<T>;
}
