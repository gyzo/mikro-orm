import { type AnyEntity, type RequiredEntityData } from '@mikro-orm/core';
import { type InsertQueryBuilder, type Knex, QueryBuilder } from '@mikro-orm/knex';
export declare class MsSqlQueryBuilder<Entity extends object = AnyEntity, RootAlias extends string = never, Hint extends string = never, Context extends object = never> extends QueryBuilder<Entity, RootAlias, Hint, Context> {
    insert(data: RequiredEntityData<Entity> | RequiredEntityData<Entity>[]): InsertQueryBuilder<Entity>;
    getKnex(): Knex.QueryBuilder;
    getKnexQuery(processVirtualEntity?: boolean): Knex.QueryBuilder;
    private appendIdentityInsert;
    private checkIdentityInsert;
}
