import { ObjectId } from 'bson';
import { Platform, type IPrimaryKey, type Primary, type NamingStrategy, type Constructor, type EntityRepository, type EntityProperty, type PopulateOptions, type EntityMetadata, type IDatabaseDriver, type EntityManager, type Configuration, type MikroORM } from '@mikro-orm/core';
import { MongoExceptionConverter } from './MongoExceptionConverter';
import { MongoSchemaGenerator } from './MongoSchemaGenerator';
export declare class MongoPlatform extends Platform {
    protected readonly exceptionConverter: MongoExceptionConverter;
    setConfig(config: Configuration): void;
    getNamingStrategy(): {
        new (): NamingStrategy;
    };
    getRepositoryClass<T extends object>(): Constructor<EntityRepository<T>>;
    /** @inheritDoc */
    lookupExtensions(orm: MikroORM): void;
    /** @inheritDoc */
    getExtension<T>(extensionName: string, extensionKey: string, moduleName: string, em: EntityManager): T;
    getSchemaGenerator(driver: IDatabaseDriver, em?: EntityManager): MongoSchemaGenerator;
    normalizePrimaryKey<T extends number | string = number | string>(data: Primary<T> | IPrimaryKey | ObjectId): T;
    denormalizePrimaryKey(data: number | string): IPrimaryKey;
    getSerializedPrimaryKeyField(field: string): string;
    usesDifferentSerializedPrimaryKey(): boolean;
    usesImplicitTransactions(): boolean;
    convertsJsonAutomatically(): boolean;
    convertJsonToDatabaseValue(value: unknown): unknown;
    convertJsonToJSValue(value: unknown, prop: EntityProperty): unknown;
    marshallArray(values: string[]): string;
    cloneEmbeddable<T>(data: T): T;
    shouldHaveColumn<T>(prop: EntityProperty<T>, populate: PopulateOptions<T>[], exclude?: string[]): boolean;
    validateMetadata(meta: EntityMetadata): void;
    isAllowedTopLevelOperator(operator: string): boolean;
}
