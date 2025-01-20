"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Factory = void 0;
class Factory {
    em;
    eachFunction;
    constructor(em) {
        this.em = em;
    }
    /**
     * Make a single entity instance, without persisting it.
     * @param overrideParameters Object specifying what default attributes of the entity factory should be overridden
     */
    makeEntity(overrideParameters) {
        const entity = this.em.create(this.model, {
            ...this.definition(),
            ...overrideParameters,
        }, { persist: false });
        if (this.eachFunction) {
            this.eachFunction(entity);
        }
        return entity;
    }
    /**
     * Make a single entity and persist (not flush)
     * @param overrideParameters Object specifying what default attributes of the entity factory should be overridden
     */
    makeOne(overrideParameters) {
        const entity = this.makeEntity(overrideParameters);
        this.em.persist(entity);
        return entity;
    }
    /**
     * Make multiple entities and then persist them (not flush)
     * @param amount Number of entities that should be generated
     * @param overrideParameters Object specifying what default attributes of the entity factory should be overridden
     */
    make(amount, overrideParameters) {
        const entities = [...Array(amount)].map(() => {
            return this.makeEntity(overrideParameters);
        });
        this.em.persist(entities);
        return entities;
    }
    /**
     * Create (and flush) a single entity
     * @param overrideParameters Object specifying what default attributes of the entity factory should be overridden
     */
    async createOne(overrideParameters) {
        const entity = this.makeOne(overrideParameters);
        await this.em.flush();
        return entity;
    }
    /**
     * Create (and flush) multiple entities
     * @param amount Number of entities that should be generated
     * @param overrideParameters Object specifying what default attributes of the entity factory should be overridden
     */
    async create(amount, overrideParameters) {
        const entities = this.make(amount, overrideParameters);
        await this.em.flush();
        return entities;
    }
    /**
     * Set a function that is applied to each entity before it is returned
     * In case of `createOne` or `create` it is applied before the entity is persisted
     * @param eachFunction The function that is applied on every entity
     */
    each(eachFunction) {
        this.eachFunction = eachFunction;
        return this;
    }
}
exports.Factory = Factory;
