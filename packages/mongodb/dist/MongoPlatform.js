"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MongoPlatform = void 0;
const bson_1 = require("bson");
const core_1 = require("@mikro-orm/core");
const MongoExceptionConverter_1 = require("./MongoExceptionConverter");
const MongoEntityRepository_1 = require("./MongoEntityRepository");
const MongoSchemaGenerator_1 = require("./MongoSchemaGenerator");
class MongoPlatform extends core_1.Platform {
    exceptionConverter = new MongoExceptionConverter_1.MongoExceptionConverter();
    setConfig(config) {
        config.set('autoJoinOneToOneOwner', false);
        config.set('loadStrategy', 'select-in');
        config.get('discovery').inferDefaultValues = false;
        super.setConfig(config);
    }
    getNamingStrategy() {
        return core_1.MongoNamingStrategy;
    }
    getRepositoryClass() {
        return MongoEntityRepository_1.MongoEntityRepository;
    }
    /** @inheritDoc */
    lookupExtensions(orm) {
        MongoSchemaGenerator_1.MongoSchemaGenerator.register(orm);
    }
    /** @inheritDoc */
    getExtension(extensionName, extensionKey, moduleName, em) {
        if (extensionName === 'EntityGenerator') {
            throw new Error('EntityGenerator is not supported for this driver.');
        }
        if (extensionName === 'Migrator') {
            return super.getExtension('Migrator', '@mikro-orm/migrator', '@mikro-orm/migrations-mongodb', em);
        }
        /* istanbul ignore next */
        return super.getExtension(extensionName, extensionKey, moduleName, em);
    }
    /* istanbul ignore next: kept for type inference only */
    getSchemaGenerator(driver, em) {
        return new MongoSchemaGenerator_1.MongoSchemaGenerator(em ?? driver);
    }
    normalizePrimaryKey(data) {
        if (data instanceof bson_1.ObjectId) {
            return data.toHexString();
        }
        return data;
    }
    denormalizePrimaryKey(data) {
        return new bson_1.ObjectId(data);
    }
    getSerializedPrimaryKeyField(field) {
        return 'id';
    }
    usesDifferentSerializedPrimaryKey() {
        return true;
    }
    usesImplicitTransactions() {
        return false;
    }
    convertsJsonAutomatically() {
        return true;
    }
    convertJsonToDatabaseValue(value) {
        return core_1.Utils.copy(value);
    }
    convertJsonToJSValue(value, prop) {
        return value;
    }
    marshallArray(values) {
        return values;
    }
    cloneEmbeddable(data) {
        const ret = super.cloneEmbeddable(data);
        core_1.Utils.dropUndefinedProperties(ret);
        return ret;
    }
    shouldHaveColumn(prop, populate, exclude) {
        if (super.shouldHaveColumn(prop, populate, exclude)) {
            return true;
        }
        return prop.kind === core_1.ReferenceKind.MANY_TO_MANY && prop.owner;
    }
    validateMetadata(meta) {
        const pk = meta.getPrimaryProps()[0];
        if (pk && pk.fieldNames?.[0] !== '_id') {
            throw core_1.MetadataError.invalidPrimaryKey(meta, pk, '_id');
        }
    }
    isAllowedTopLevelOperator(operator) {
        return ['$not', '$fulltext'].includes(operator);
    }
}
exports.MongoPlatform = MongoPlatform;
