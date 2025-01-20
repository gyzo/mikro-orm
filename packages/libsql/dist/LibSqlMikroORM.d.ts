import { MikroORM, type Options, type IDatabaseDriver, type EntityManager, type EntityManagerType } from '@mikro-orm/core';
import { LibSqlDriver } from './LibSqlDriver';
import type { SqlEntityManager } from '@mikro-orm/knex';
/**
 * @inheritDoc
 */
export declare class LibSqlMikroORM<EM extends EntityManager = SqlEntityManager> extends MikroORM<LibSqlDriver, EM> {
    private static DRIVER;
    /**
     * @inheritDoc
     */
    static init<D extends IDatabaseDriver = LibSqlDriver, EM extends EntityManager = D[typeof EntityManagerType] & EntityManager>(options?: Options<D, EM>): Promise<MikroORM<D, EM>>;
    /**
     * @inheritDoc
     */
    static initSync<D extends IDatabaseDriver = LibSqlDriver, EM extends EntityManager = D[typeof EntityManagerType] & EntityManager>(options: Options<D, EM>): MikroORM<D, EM>;
}
export type LibSqlOptions = Options<LibSqlDriver>;
export declare function defineLibSqlConfig(options: LibSqlOptions): Options<LibSqlDriver, SqlEntityManager<LibSqlDriver> & EntityManager<IDatabaseDriver<import("@mikro-orm/core").Connection>>>;
