import { MikroORM, type Options, type IDatabaseDriver, type EntityManager, type EntityManagerType } from '@mikro-orm/core';
import { BetterSqliteDriver } from './BetterSqliteDriver';
import type { SqlEntityManager } from '@mikro-orm/knex';
/**
 * @inheritDoc
 */
export declare class BetterSqliteMikroORM<EM extends EntityManager = SqlEntityManager> extends MikroORM<BetterSqliteDriver, EM> {
    private static DRIVER;
    /**
     * @inheritDoc
     */
    static init<D extends IDatabaseDriver = BetterSqliteDriver, EM extends EntityManager = D[typeof EntityManagerType] & EntityManager>(options?: Options<D, EM>): Promise<MikroORM<D, EM>>;
    /**
     * @inheritDoc
     */
    static initSync<D extends IDatabaseDriver = BetterSqliteDriver, EM extends EntityManager = D[typeof EntityManagerType] & EntityManager>(options: Options<D, EM>): MikroORM<D, EM>;
}
export type BetterSqliteOptions = Options<BetterSqliteDriver>;
export declare function defineBetterSqliteConfig(options: BetterSqliteOptions): Options<BetterSqliteDriver, SqlEntityManager<BetterSqliteDriver> & EntityManager<IDatabaseDriver<import("@mikro-orm/core").Connection>>>;
