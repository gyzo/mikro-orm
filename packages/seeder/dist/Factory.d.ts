import type { EntityData, EntityManager, Constructor } from '@mikro-orm/core';
export declare abstract class Factory<T extends object> {
    protected readonly em: EntityManager;
    abstract readonly model: Constructor<T>;
    private eachFunction?;
    constructor(em: EntityManager);
    protected abstract definition(): EntityData<T>;
    /**
     * Make a single entity instance, without persisting it.
     * @param overrideParameters Object specifying what default attributes of the entity factory should be overridden
     */
    makeEntity(overrideParameters?: EntityData<T>): T;
    /**
     * Make a single entity and persist (not flush)
     * @param overrideParameters Object specifying what default attributes of the entity factory should be overridden
     */
    makeOne(overrideParameters?: EntityData<T>): T;
    /**
     * Make multiple entities and then persist them (not flush)
     * @param amount Number of entities that should be generated
     * @param overrideParameters Object specifying what default attributes of the entity factory should be overridden
     */
    make(amount: number, overrideParameters?: EntityData<T>): T[];
    /**
     * Create (and flush) a single entity
     * @param overrideParameters Object specifying what default attributes of the entity factory should be overridden
     */
    createOne(overrideParameters?: EntityData<T>): Promise<T>;
    /**
     * Create (and flush) multiple entities
     * @param amount Number of entities that should be generated
     * @param overrideParameters Object specifying what default attributes of the entity factory should be overridden
     */
    create(amount: number, overrideParameters?: EntityData<T>): Promise<T[]>;
    /**
     * Set a function that is applied to each entity before it is returned
     * In case of `createOne` or `create` it is applied before the entity is persisted
     * @param eachFunction The function that is applied on every entity
     */
    each(eachFunction: (entity: T) => void): this;
}
